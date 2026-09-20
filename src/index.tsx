import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { landingPage, chatPage } from './pages'
import { DECK } from './deck'
import { buildSystemPrompt, type DrawnCard } from './prompt'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  // Optional — only needed for the ElevenLabs upgrade path.
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_VOICE_ID?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Serve everything in public/ (styles, scripts, images, SFX, deck data).
app.use('/static/*', serveStatic({ root: './' }))

const MODEL = 'gpt-5-mini'
const MAX_TURNS = 12 // how many prior messages we replay back to the model
const MAX_CHARS_PER_TURN = 4000

app.get('/', (c) => c.html(landingPage()))
app.get('/chat', (c) => c.html(chatPage()))

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    model: MODEL,
    deckCards: DECK.length,
    llmConfigured: Boolean(c.env.OPENAI_API_KEY && c.env.OPENAI_BASE_URL),
    ttsConfigured: Boolean(c.env.ELEVENLABS_API_KEY && c.env.ELEVENLABS_VOICE_ID),
  }),
)

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return []
  const out: ChatMessage[] = []
  for (const m of input) {
    if (!m || typeof m !== 'object') continue
    const role = (m as any).role
    const content = (m as any).content
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string' || !content.trim()) continue
    out.push({ role, content: content.slice(0, MAX_CHARS_PER_TURN) })
  }
  // Keep only the tail of the conversation, and make sure it starts with a
  // user turn so the model never sees a leading assistant message.
  const tail = out.slice(-MAX_TURNS)
  while (tail.length && tail[0].role !== 'user') tail.shift()
  return tail
}

function sanitizeDrawn(input: unknown): DrawnCard[] {
  if (!Array.isArray(input)) return []
  const fallback = ['Past', 'Present', 'Future']
  return input
    .slice(0, 3)
    .map((d, i) => {
      const n = Number((d as any)?.n)
      if (!Number.isInteger(n) || n < 1 || n > 78) return null
      // Trust the position label the reading sent (a 1-card pull is
      // "Guidance", not "Past"), falling back to the classic three.
      const raw = (d as any)?.position
      const position =
        typeof raw === 'string' && raw.trim() && raw.trim().length <= 24
          ? raw.trim()
          : fallback[i] ?? 'Card'
      return { position, n }
    })
    .filter((d): d is DrawnCard => d !== null)
}

app.post('/api/chat', async (c) => {
  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = (c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')

  if (!apiKey) {
    return c.json(
      { error: 'The reading companion is not configured yet (missing API key).' },
      503,
    )
  }

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400)
  }

  const messages = sanitizeMessages(body?.messages)
  if (!messages.length) {
    return c.json({ error: 'No message provided.' }, 400)
  }

  const drawn = sanitizeDrawn(body?.drawn)
  const system = buildSystemPrompt(drawn, DECK)

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    console.error('upstream error', upstream.status, detail.slice(0, 500))
    return c.json({ error: 'The reading companion is unavailable right now.' }, 502)
  }

  // Re-emit the upstream SSE as a minimal, text-only stream so the client
  // never has to know about the provider's chunk shape.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      const reader = upstream.body!.getReader()
      let buffer = ''
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              const delta = parsed?.choices?.[0]?.delta?.content
              if (typeof delta === 'string' && delta) send({ delta })
            } catch {
              // ignore malformed keepalive/partial frames
            }
          }
        }
        send({ done: true })
      } catch (err) {
        console.error('stream error', err)
        send({ error: 'The connection dropped mid-reply.' })
      } finally {
        try {
          controller.close()
        } catch {}
        reader.releaseLock?.()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})

// ── Optional ElevenLabs text-to-speech proxy (used only when configured) ──
// Keeps the key server-side; the browser never sees it.
app.post('/api/speak', async (c) => {
  const key = c.env.ELEVENLABS_API_KEY
  const voiceId = c.env.ELEVENLABS_VOICE_ID
  if (!key || !voiceId) {
    return c.json({ error: 'Voice is not configured.' }, 503)
  }

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400)
  }

  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 2000) : ''
  if (!text) return c.json({ error: 'No text provided.' }, 400)

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  )

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '')
    console.error('elevenlabs error', upstream.status, detail.slice(0, 300))
    return c.json({ error: 'Voice synthesis failed.' }, 502)
  }

  return new Response(upstream.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  })
})

export default app
