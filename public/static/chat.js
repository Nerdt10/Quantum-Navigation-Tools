/* ==========================================================================
   Dr. Tashema — "Ask about your reading" chat room
   - Streams replies from POST /api/chat (SSE, text-only deltas)
   - Carries the visitor's three drawn cards as context on every request
   - Voice IN:  Web Speech recognition (dictation), when supported
   - Voice OUT: read-aloud via ElevenLabs (if configured) or browser speech
   ========================================================================== */
(() => {
  const THREAD_KEY = 'qnt_thread_v1'
  const DRAWN_KEY = 'qnt_drawn_v1'

  const el = (id) => document.getElementById(id)
  const thread = el('chatThread')
  const scroll = el('chatScroll')
  const form = el('chatForm')
  const input = el('chatInput')
  const sendBtn = el('sendBtn')
  const micBtn = el('micBtn')
  const voiceToggle = el('voiceToggle')
  const voiceLabel = voiceToggle ? voiceToggle.querySelector('.chat-voice-label') : null
  const readingBox = el('chatReading')
  const readingCards = el('chatReadingCards')

  // ── Read the visitor's drawn cards (written by the reading page) ───────
  function loadDrawn() {
    try {
      const raw = sessionStorage.getItem(DRAWN_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .slice(0, 3)
        .map((d, i) => ({
          position: ['Past', 'Present', 'Future'][i],
          n: Number(d && d.n),
          name: typeof d?.name === 'string' ? d.name : '',
          kw: typeof d?.kw === 'string' ? d.kw : '',
        }))
        .filter((d) => Number.isInteger(d.n) && d.n >= 1 && d.n <= 78)
    } catch {
      return []
    }
  }

  const drawn = loadDrawn()
  // Backfill names from the canonical deck if the reading page only stored n.
  if (window.QNT_DECK) byNumberFallback(drawn)
  function byNumberFallback(list) {
    const byN = new Map(window.QNT_DECK.map((c) => [c.n, c]))
    for (const d of list) {
      if (!d.name) {
        const c = byN.get(d.n)
        if (c) { d.name = c.name; d.kw = c.kw }
      }
    }
  }

  // ── Render the pinned "your reading" strip ────────────────────────────
  if (drawn.length && readingBox && readingCards) {
    readingBox.hidden = false
    readingCards.innerHTML = drawn
      .map(
        (d) => `<div class="chat-rcard">
          <span class="chat-rcard-num">${d.n}</span>
          <span class="chat-rcard-body">
            <span class="chat-rcard-pos">${d.position}</span>
            <span class="chat-rcard-name">${escapeHtml(d.name || 'Card')}</span>
          </span>
        </div>`,
      )
      .join('')
  }

  // ── History ───────────────────────────────────────────────────────────
  let history = [] // { role: 'user'|'assistant', content }
  let streaming = false
  let controller = null

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    )
  }

  // Minimal, safe formatting: escape first, then bold/italics + tidy headings.
  function format(text) {
    let h = escapeHtml(text)
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    h = h.replace(/(^|\n)\s*#{1,6}\s+/g, '$1')
    h = h.replace(/(^|\n)\s*[-*]\s+/g, '$1· ')
    return h
  }

  function scrollToBottom(smooth = true) {
    if (!scroll) return
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  // ── Message rendering ─────────────────────────────────────────────────
  function addUserMessage(text) {
    const node = document.createElement('div')
    node.className = 'msg msg--user'
    node.innerHTML = `<div class="msg-body"><div class="msg-text">${format(text)}</div></div>`
    thread.appendChild(node)
    scrollToBottom()
  }

  function addAssistantMessage(text = '', opts = {}) {
    const node = document.createElement('div')
    node.className = 'msg msg--assistant'
    node.innerHTML = `
      <div class="msg-avatar" aria-hidden="true">✦</div>
      <div class="msg-body">
        <div class="msg-text">${text ? format(text) : '<span class="msg-dots"><span></span><span></span><span></span></span>'}</div>
        <button class="msg-speak" type="button" hidden>
          <span aria-hidden="true">🔊</span> <span class="msg-speak-label">Listen</span>
        </button>
      </div>`
    thread.appendChild(node)
    scrollToBottom()
    if (!opts.pending) {
      const btn = node.querySelector('.msg-speak')
      btn.hidden = false
      btn.addEventListener('click', () => {
        const t = node.querySelector('.msg-text').innerText
        speak(t, btn)
      })
    }
    return node
  }

  // A small greeting, rendered locally (no API call, no token cost).
  function renderGreeting() {
    const names = drawn.map((d) => d.name).filter(Boolean)
    const body = names.length
      ? `These three cards are yours — ${names[0]} for the past, ${names[1]} for the present, ${names[2]} for the future.\n\nI'm here to help you sit with them. Ask me anything about your reading.`
      : `I'm here to help you sit with the Quantum Developmental Tools deck.\n\nDraw three cards on the reading page and I can speak to them directly — or ask me anything about the deck now.`
    addAssistantMessage(body)
    history.push({ role: 'assistant', content: body })
    renderStarters()
  }

  function renderStarters() {
    const wrap = document.createElement('div')
    wrap.className = 'chat-starters'
    const prompts = drawn.length
      ? [
          'What do these three cards say together?',
          `What is ${drawn[0].name} asking me to release?`,
          'What should I focus on next?',
        ]
      : ['How do I use this deck?', 'What are the Quantum Developmental Tools?']
    wrap.innerHTML =
      `<span class="chat-starters-label">Try asking</span>` +
      prompts
        .map((p) => `<button class="chat-starter" type="button">${escapeHtml(p)}</button>`)
        .join('')
    for (const btn of wrap.querySelectorAll('.chat-starter')) {
      btn.addEventListener('click', () => {
        input.value = btn.textContent
        autoGrow()
        form.requestSubmit()
      })
    }
    thread.appendChild(wrap)
    scrollToBottom(false)
  }

  // ── Streaming send ────────────────────────────────────────────────────
  async function send(text) {
    if (streaming) return
    const clean = text.trim()
    if (!clean) return

    streaming = true
    sendBtn.disabled = true
    input.value = ''
    autoGrow()

    addUserMessage(clean)
    history.push({ role: 'user', content: clean })

    const node = addAssistantMessage('', { pending: true })
    const textEl = node.querySelector('.msg-text')

    const payload = {
      messages: history.filter((m) => m.content && m.content.trim()).slice(-12),
      drawn: drawn.map((d) => ({ position: d.position, n: d.n })),
    }

    controller = new AbortController()
    let acc = ''
    let started = false

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let msg = 'Something went wrong reaching the reading companion.'
        try {
          const j = await res.json()
          if (j && j.error) msg = j.error
        } catch {}
        textEl.innerHTML = `<div class="chat-error">${escapeHtml(msg)}</div>`
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          const data = t.slice(5).trim()
          if (!data) continue
          try {
            const evt = JSON.parse(data)
            if (evt.error) {
              textEl.innerHTML = `<div class="chat-error">${escapeHtml(evt.error)}</div>`
              return
            }
            if (typeof evt.delta === 'string' && evt.delta) {
              acc += evt.delta
              if (!started) { started = true; textEl.innerHTML = '' }
              textEl.innerHTML = format(acc)
              scrollToBottom()
            }
          } catch {}
        }
      }

      if (acc.trim()) {
        history.push({ role: 'assistant', content: acc })
        const btn = node.querySelector('.msg-speak')
        btn.hidden = false
        if (autoSpeak) speak(acc, btn)
      } else if (!started) {
        textEl.innerHTML = `<div class="chat-error">The companion returned an empty reply. Please try again.</div>`
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return
      textEl.innerHTML = `<div class="chat-error">Connection interrupted. Please try again.</div>`
    } finally {
      streaming = false
      sendBtn.disabled = false
      controller = null
      scrollToBottom()
    }
  }

  // ── Voice OUT ─────────────────────────────────────────────────────────
  let autoSpeak = false
  let ttsEngine = 'browser' // 'elevenlabs' | 'browser'
  let currentAudio = null
  let currentBtn = null

  function stopSpeaking() {
    if (currentAudio) {
      try { currentAudio.pause() } catch {}
      currentAudio = null
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel() } catch {}
    }
    if (currentBtn) {
      currentBtn.classList.remove('is-speaking')
      const l = currentBtn.querySelector('.msg-speak-label')
      if (l) l.textContent = 'Listen'
      currentBtn = null
    }
  }

  function markSpeaking(btn) {
    if (currentBtn && currentBtn !== btn) {
      currentBtn.classList.remove('is-speaking')
      const l = currentBtn.querySelector('.msg-speak-label')
      if (l) l.textContent = 'Listen'
    }
    currentBtn = btn
    if (btn) {
      btn.classList.add('is-speaking')
      const l = btn.querySelector('.msg-speak-label')
      if (l) l.textContent = 'Stop'
    }
  }

  async function speak(text, btn) {
    if (!text || !text.trim()) return
    if (currentBtn === btn && (currentAudio || window.speechSynthesis?.speaking)) {
      stopSpeaking()
      return
    }
    stopSpeaking()
    markSpeaking(btn)

    if (ttsEngine === 'elevenlabs') {
      try {
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 2000) }),
        })
        if (res.ok) {
          const blob = await res.blob()
          const audio = new Audio(URL.createObjectURL(blob))
          currentAudio = audio
          audio.onended = stopSpeaking
          await audio.play()
          return
        }
      } catch {
        // fall through to browser speech
      }
    }

    if (!window.speechSynthesis) {
      stopSpeaking()
      return
    }
    const u = new SpeechSynthesisUtterance(text.slice(0, 3000))
    u.rate = 0.96
    u.pitch = 1.0
    const v = pickVoice()
    if (v) { u.voice = v; u.lang = v.lang }
    u.onend = stopSpeaking
    u.onerror = stopSpeaking
    window.speechSynthesis.speak(u)
  }

  let cachedVoices = null
  function pickVoice() {
    const all = window.speechSynthesis?.getVoices?.() || []
    if (!all.length) return null
    cachedVoices = all
    // Prefer a warm English voice; fall back to the first English voice.
    const en = all.filter((v) => /^en/i.test(v.lang))
    const preferred =
      en.find((v) => /Samantha|Serena|Moira|Tessa|Karen|Google UK English Female/i.test(v.name)) ||
      en.find((v) => /Google US English/i.test(v.name)) ||
      en[0]
    return preferred || null
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => { cachedVoices = null; pickVoice() }
  }

  if (voiceToggle) {
    voiceToggle.addEventListener('click', () => {
      autoSpeak = !autoSpeak
      voiceToggle.setAttribute('aria-pressed', String(autoSpeak))
      if (voiceLabel) voiceLabel.textContent = autoSpeak ? 'Reading aloud' : 'Read aloud'
      if (!autoSpeak) stopSpeaking()
    })
  }

  // ── Voice IN (dictation) ──────────────────────────────────────────────
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (SR && micBtn) {
    micBtn.hidden = false
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    let listening = false
    let baseText = ''

    rec.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      if (final) baseText = (baseText + ' ' + final).trim()
      input.value = (baseText + ' ' + interim).trim()
      autoGrow()
    }
    const stopUI = () => {
      listening = false
      micBtn.classList.remove('is-listening')
      micBtn.setAttribute('aria-pressed', 'false')
    }
    rec.onend = stopUI
    rec.onerror = stopUI

    micBtn.addEventListener('click', () => {
      if (listening) { try { rec.stop() } catch {} ; stopUI(); return }
      stopSpeaking()
      baseText = input.value.trim()
      try {
        rec.start()
        listening = true
        micBtn.classList.add('is-listening')
        micBtn.setAttribute('aria-pressed', 'true')
      } catch {}
    })
  }

  // ── Composer behaviour ────────────────────────────────────────────────
  function autoGrow() {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 180) + 'px'
  }
  input.addEventListener('input', autoGrow)

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      form.requestSubmit()
    }
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (streaming) return
    send(input.value)
  })

  // ── Boot: check which voice engine is available, then greet ───────────
  fetch('/api/health')
    .then((r) => r.json())
    .then((h) => { if (h && h.ttsConfigured) ttsEngine = 'elevenlabs' })
    .catch(() => {})
    .finally(() => {
      autoGrow()
      renderGreeting()
      scrollToBottom(false)
    })
})()
