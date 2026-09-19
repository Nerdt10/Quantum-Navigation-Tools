/* ==========================================================================
   QSyrii — the reading companion chat
   - Streams replies from POST /api/chat (SSE, text-only deltas)
   - Carries the visitor's three drawn cards as context on every request
   - Two ways to talk: "Chat" (type) and "Speak" (dictation + spoken replies)
   - Voice OUT: read-aloud via ElevenLabs (if configured) or browser speech
   ========================================================================== */
(() => {
  const DRAWN_KEY = 'qnt_drawn_v1'

  const el = (id) => document.getElementById(id)
  const body = document.body
  const thread = el('chatThread')
  const scroll = el('chatScroll')
  const form = el('chatForm')
  const input = el('chatInput')
  const sendBtn = el('sendBtn')
  const micBtn = el('micBtn')
  const helloTitle = el('helloTitle')
  const helloSub = el('helloSub')

  const segChat = el('segChat')
  const segSpeak = el('segSpeak')
  const typingDock = el('typingDock')
  const speakDock = el('speakDock')
  const orbBtn = el('orbBtn')
  const voiceStatus = el('voiceStatus')
  const voiceTranscript = el('voiceTranscript')

  const plusBtn = el('plusBtn')
  const plusPop = el('plusPop')
  const plusList = el('plusList')
  const autoSpeakRow = el('autoSpeakRow')
  const autoSpeakCheck = el('autoSpeakCheck')
  const popNewChat = el('popNewChat')
  const newChatBtn = el('newChatBtn')

  const readingBox = el('chatReading')
  const readingCards = el('chatReadingCards')

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

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
  if (window.QNT_DECK) backfillNames(drawn)
  function backfillNames(list) {
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
    helloSub.textContent = 'Your three cards are ready — ask QSyrii anything about them.'
  } else if (helloSub) {
    helloSub.textContent = 'Ask QSyrii about your cards or the deck.'
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
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' })
  }

  function beginConversation() {
    if (body.classList.contains('is-empty')) body.classList.remove('is-empty')
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
        speak(node.querySelector('.msg-text').innerText, btn)
      })
    }
    return node
  }

  // ── Starter prompts live in the "+" popover ───────────────────────────
  function renderStarters() {
    if (!plusList) return
    const prompts = drawn.length
      ? [
          'What do these three cards say together?',
          `What is ${drawn[0].name} asking me to release?`,
          'What should I focus on next?',
        ]
      : ['How do I use this deck?', 'What are the Quantum Developmental Tools?']
    plusList.innerHTML = prompts
      .map((p) => `<button class="chat-pop-row" type="button">${escapeHtml(p)}</button>`)
      .join('')
    for (const btn of plusList.querySelectorAll('.chat-pop-row')) {
      btn.addEventListener('click', () => {
        input.value = btn.textContent
        autoGrow()
        closePopover()
        form.requestSubmit()
      })
    }
  }

  renderStarters()

  // ── "+" popover ───────────────────────────────────────────────────────
  function openPopover() {
    plusPop.hidden = false
    plusBtn.setAttribute('aria-expanded', 'true')
  }
  function closePopover() {
    plusPop.hidden = true
    plusBtn.setAttribute('aria-expanded', 'false')
  }
  plusBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (plusPop.hidden) openPopover()
    else closePopover()
  })
  document.addEventListener('click', (e) => {
    if (!plusPop.hidden && !plusPop.contains(e.target) && e.target !== plusBtn) closePopover()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !plusPop.hidden) closePopover()
  })

  // ── Streaming send ────────────────────────────────────────────────────
  async function send(text) {
    if (streaming) return
    const clean = String(text || '').trim()
    if (!clean) return

    streaming = true
    syncSendBtn()
    input.value = ''
    autoGrow()

    beginConversation()
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
      syncSendBtn()
      controller = null
      scrollToBottom()
      if (mode === 'speak') setVoiceStatus('Tap to speak')
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

  function pickVoice() {
    const all = window.speechSynthesis?.getVoices?.() || []
    if (!all.length) return null
    const en = all.filter((v) => /^en/i.test(v.lang))
    return (
      en.find((v) => /Samantha|Serena|Moira|Tessa|Karen|Google UK English Female/i.test(v.name)) ||
      en.find((v) => /Google US English/i.test(v.name)) ||
      en[0] ||
      null
    )
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => pickVoice()
  }

  function setAutoSpeak(on) {
    autoSpeak = on
    if (autoSpeakRow) autoSpeakRow.setAttribute('aria-pressed', String(on))
    if (autoSpeakCheck) autoSpeakCheck.textContent = on ? '✓' : '—'
    if (!on) stopSpeaking()
  }
  autoSpeakRow?.addEventListener('click', () => setAutoSpeak(!autoSpeak))

  // ── Voice IN (dictation) — shared by the mic button and the orb ───────
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  let rec = null
  let listening = false
  let baseText = ''

  if (SR && micBtn) micBtn.hidden = false

  function setVoiceStatus(t) { if (voiceStatus) voiceStatus.textContent = t }

  function setListeningUI(on) {
    listening = on
    if (micBtn) {
      micBtn.classList.toggle('is-listening', on)
      micBtn.setAttribute('aria-pressed', String(on))
    }
    if (orbBtn) {
      orbBtn.classList.toggle('is-listening', on)
      orbBtn.setAttribute('aria-pressed', String(on))
    }
    setVoiceStatus(on ? 'Listening…' : 'Tap to speak')
  }

  function startListening() {
    if (!SR) return
    if (!rec) {
      rec = new SR()
      rec.lang = 'en-US'
      rec.interimResults = true
      rec.continuous = false
      rec.onresult = (e) => {
        let interim = ''
        let final = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) final += t
          else interim += t
        }
        if (final) baseText = (baseText + ' ' + final).trim()
        const shown = (baseText + ' ' + interim).trim()
        if (mode === 'speak') {
          if (voiceTranscript) voiceTranscript.textContent = shown
        } else {
          input.value = shown
          autoGrow()
        }
      }
      rec.onend = () => {
        const wasListening = listening
        setListeningUI(false)
        if (mode === 'speak' && wasListening) {
          const said = (baseText || '').trim()
          if (said) {
            if (voiceTranscript) voiceTranscript.textContent = ''
            send(said)
          }
        }
      }
      rec.onerror = () => setListeningUI(false)
    }
    stopSpeaking()
    baseText = ''
    if (mode === 'speak') { if (voiceTranscript) voiceTranscript.textContent = '' }
    else baseText = input.value.trim()
    try {
      rec.start()
      setListeningUI(true)
    } catch {}
  }

  function stopListening() {
    if (rec) { try { rec.stop() } catch {} }
    setListeningUI(false)
  }

  micBtn?.addEventListener('click', () => (listening ? stopListening() : startListening()))
  orbBtn?.addEventListener('click', () => (listening ? stopListening() : startListening()))

  // ── Chat / Speak mode switch ──────────────────────────────────────────
  let mode = 'chat'
  function setMode(next) {
    mode = next
    body.dataset.mode = next
    if (segChat) {
      segChat.classList.toggle('is-active', next === 'chat')
      segChat.setAttribute('aria-selected', String(next === 'chat'))
    }
    if (segSpeak) {
      segSpeak.classList.toggle('is-active', next === 'speak')
      segSpeak.setAttribute('aria-selected', String(next === 'speak'))
    }
    if (typingDock) typingDock.hidden = next !== 'chat'
    if (speakDock) speakDock.hidden = next !== 'speak'
    if (next === 'speak') {
      setAutoSpeak(true)
      if (SR) setVoiceStatus('Tap to speak')
      else if (voiceStatus) voiceStatus.textContent = 'Voice input isn’t supported in this browser.'
    } else {
      setAutoSpeak(false)
      if (listening) stopListening()
    }
    closePopover()
    if (!body.classList.contains('is-empty')) scrollToBottom(false)
  }
  segChat?.addEventListener('click', () => setMode('chat'))
  segSpeak?.addEventListener('click', () => setMode('speak'))

  // ── New chat ──────────────────────────────────────────────────────────
  function newChat() {
    stopSpeaking()
    if (listening) stopListening()
    if (controller) { try { controller.abort() } catch {} }
    history = []
    thread.innerHTML = ''
    input.value = ''
    autoGrow()
    if (voiceTranscript) voiceTranscript.textContent = ''
    closePopover()
    body.classList.add('is-empty')
    syncSendBtn()
  }
  newChatBtn?.addEventListener('click', newChat)
  popNewChat?.addEventListener('click', newChat)

  // ── Composer behaviour ────────────────────────────────────────────────
  function autoGrow() {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 180) + 'px'
  }
  function syncSendBtn() {
    const ready = input.value.trim().length > 0 && !streaming
    sendBtn.disabled = !ready
  }
  input.addEventListener('input', () => { autoGrow(); syncSendBtn() })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sendBtn.disabled) form.requestSubmit()
    }
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (streaming) return
    send(input.value)
  })

  // ── Boot ──────────────────────────────────────────────────────────────
  if (!SR && segSpeak) {
    segSpeak.disabled = true
    segSpeak.title = 'Voice input isn’t supported in this browser'
  }

  fetch('/api/health')
    .then((r) => r.json())
    .then((h) => { if (h && h.ttsConfigured) ttsEngine = 'elevenlabs' })
    .catch(() => {})
    .finally(() => {
      autoGrow()
      syncSendBtn()
    })
})()
