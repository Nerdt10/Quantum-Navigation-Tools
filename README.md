# Dr. Tashema — Quantum Developmental Tools

A quiet, editorial marketing site for **Dr. Tashema's Quantum Developmental Tools** deck. The hero introduces the deck as a product shot; below it, a free three-card reading lets visitors shuffle a fanned deck and auto-draw **Past · Present · Future**, each card flipping to reveal one of the 78 *Quantum Navigational Tools* cards with its full meaning. From there, **Learn More About Your Cards** opens a chat room where visitors can ask questions about their own three cards — typing or speaking, with replies they can have read aloud.

The landing and reading experience was recreated from the Genspark Design handoff (`designer2-cf4103bf-327e-4f8c-82b4-b9be8a9227a6`) at **high fidelity** — colors, spacing, easing curves, sound volumes and card-face layout match the handoff README.

## Project Overview

- **Name**: Dr. Tashema — Quantum Developmental Tools
- **Goal**: A ceremonial, unhurried landing page that invites visitors into a free tarot-style card reading, then into a reflective conversation about their own cards.
- **Tech stack**: Hono + TypeScript on Cloudflare (Pages/Workers); vanilla JS; streaming SSE chat; CDN Google Fonts (Source Serif 4 + Source Sans 3).
- **Feel**: Ivory watercolor hero, forest-green + gold typography, whispery card SFX, painterly card backs.

## Features (completed)

### Hero — "the product shot"
- Full-viewport flex layout: copy on the left (max-width 480px), a tilted stack of three overlapping card backs on the right.
- Gold-hairline eyebrow ("✦ Quantum Developmental Tools"), "Welcome to" line, large upright **Source Serif 4** headline, subtitle, and the pill CTA "Get a Free Card Reading ↓".
- Orchestrated rise-in entrance (0.1s → 1.4s), hover lift on the card stack, and a bobbing "SCROLL TO RECEIVE" hint.
- Fixed ivory watercolor atmosphere (`hero-ivory.jpg`) with a soft cream wash overlay.

### Reading Room — "the reading room"
Pure-white section, deliberately breaking from the ivory atmosphere above.
- **Idle fan**: 10 card backs animate in on load in a wide U-shaped arc; the stage is clickable and keyboard-focusable.
- **Sequence**: gather → riffle ×2 (with shuffle SFX) → fan out → auto-pick 3 → reveal with a flip and draw SFX.
- **Reveal**: each card shows number, name, filigree divider, and keywords; a Past/Present/Future label floats above.
- **Tap-to-peek**: on narrow screens the three drawn cards overlap and a card's face can be covered. Tapping (or Enter/Space on) a revealed card lifts it clear to the front so its name + keywords are readable; tapping again settles it back. A hint line appears only when the cards actually overlap.
- **Interpretation grid**: three columns (position / card name / full meaning), fading in after the reveal.
- **Draw Another** button resets to the idle fan and runs a fresh reading.
- **Learn More About Your Cards**: the primary action after a reveal, taking the visitor to `/chat` with their three cards carried along.

### Chat room — "ask about your reading" (`/chat`)
A ChatGPT-style conversation surface dressed in the same ivory / forest / gold system.
- **Your reading strip**: the three drawn cards pinned above the thread, with a "draw again" link back to the reading.
- **Streaming replies**: replies arrive token-by-token from `POST /api/chat` (text-only SSE, re-emitted from the provider so the client never sees provider chunk shapes).
- **Context injection**: the visitor's own three cards (name, keywords, canonical meaning) are injected into the system prompt on every request, so the companion speaks to *their* reading.
- **Voice in**: dictation via the Web Speech API when the browser supports it (the mic button is hidden otherwise).
- **Voice out**: a per-message **Listen** pill, plus a **Read aloud** toggle that auto-reads each new reply. Uses ElevenLabs when configured (`/api/speak`) and falls back to the browser's speech synthesis when it isn't.
- **Guardrails**: the system prompt forbids prediction, medical/legal/financial advice, third-party claims, and crisis counselling (it redirects instead). Replies stay plain prose, 2–4 short paragraphs.
- **Cost control**: history is capped to the last 12 turns and 4000 chars per turn; the greeting and starter prompts render locally with no API call.

### Quality floor
- Responsive: hero flips to a centered column at ≤780px; the meaning grid collapses to one column at ≤820px; fan spread/stage width scale with viewport.
- Keyboard access: focus-visible ring on the CTA, deck stage, drawn cards, and buttons; Enter/Space triggers the deck and toggles peek.
- Honors `prefers-reduced-motion` (animations and smooth scroll reduced).
- Guard flag prevents re-entry while a reading is in flight; audio is unlocked on the first user gesture.

## URLs

- **Local**: http://localhost:3000
- **Production**: _pending deploy_
- **GitHub**: https://github.com/Nerdt10/Quantum-Navigation-Tools

## Data Architecture

- **Data models**: 78-card static deck array — each `{ n, num, name, kw, meaning }`.
- **Deck single source of truth**: `public/static/deck-data.js` is canonical; `npm run deck:gen` regenerates both the browser copy and the Worker's `src/deck.ts` from it, so prompt context and UI can never drift.
- **Storage services**: **none** — no database. The deck is static content; the visitor's three drawn cards live in `sessionStorage` (`qnt_drawn_v1`) and are sent with each chat request.
- **Data flow**: server renders HTML shells (Hono) → `deck-data.js` provides the deck → `app.js` drives the shuffle/fan/draw animation client-side → `rememberReading()` stores the three cards → `/chat` reads them back and `POST /api/chat` injects them into the system prompt.
- **Randomness**: each reading samples 3 unique cards via `[...CARDS].sort(() => Math.random() - .5).slice(0, 3)`.
- **Secrets**: `OPENAI_API_KEY` / `OPENAI_BASE_URL` (required for chat) and optionally `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` (for the ElevenLabs voice). Locally in `.dev.vars` (gitignored); in production as Worker secrets. Keys never reach the browser.

## Functional entry URIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Landing page (hero + reading room) |
| GET | `/chat` | Chat room — ask about your reading |
| POST | `/api/chat` | Streaming (SSE) chat completion; body `{ messages, drawn }` |
| POST | `/api/speak` | ElevenLabs TTS proxy; body `{ text }` (503 when unconfigured) |
| GET | `/api/health` | Config probe: `{ ok, model, deckCards, llmConfigured, ttsConfigured }` |
| GET | `/static/style.css` | Landing + reading stylesheet |
| GET | `/static/chat.css` | Chat room stylesheet |
| GET | `/static/app.js` | Reading-room sequence logic |
| GET | `/static/chat.js` | Chat: streaming, dictation, read-aloud |
| GET | `/static/deck-data.js` | Canonical 78-card deck (`window.QNT_DECK`) |
| GET | `/static/assets/hero-ivory.jpg` | Hero watercolor atmosphere |
| GET | `/static/assets/card-back.jpg` | Card back artwork (brand asset) |
| GET | `/static/assets/sfx-shuffle.mp3` | Shuffle SFX (played twice per reading) |
| GET | `/static/assets/sfx-draw.mp3` | Card-flip SFX (600ms clip, 80ms fadeout) |
| GET | `/static/favicon.svg` | Deck sigil favicon |

## Design tokens

```
--ivory-0:  #f7f2e8   /* hero background base */
--forest:   #2e3d2f   /* primary text; card body */
--gold:     #b58f4a   /* eyebrows, hairlines, CTA border */
--gold-soft:#c9a668   /* card face text */
--ink-soft: rgba(46,61,47,.72)   /* subtitle, meanings */
--ink-faint:rgba(46,61,47,.5)    /* deck hint */

Reading section base: #ffffff
```
Typography: **Source Serif 4** (400–700, upright) for subtitles, reading title, card faces, meanings and CTA labels; **Source Sans 3** (400–700) for small-cap labels, eyebrows and hints. The **hero headline** is the one exception — it keeps the original **Fraunces italic** as the brand's signature title treatment.

> **Type note:** the original handoff specified Fraunces italic + wide-tracked Inter. The wide-tracked Inter labels were replaced with a sturdy upright editorial superfamily (Source Serif 4 / Source Sans 3) and label tracking was reduced from `.5em` to `.16–.22em`, since that pairing reads as the generic AI landing page. The **hero headline was deliberately restored to Fraunces italic** at the client's request — it is the only slanted type on the site. All other tokens (colors, spacing, radii, shadows, motion) still follow the handoff.

## Assets

The card back and hero atmosphere are **user-supplied final brand assets** (do not swap). SFX were generated with ElevenLabs sound-effects in the original design project. The 30MB `deck.pdf` reference is intentionally **not** shipped in the site.

## User guide

1. Open the site — the hero introduces the deck.
2. Click **Get a Free Card Reading** (or click the fanned deck) to begin.
3. A three-card reading is drawn automatically: **Past · Present · Future**. Each card flips to reveal its name and keywords.
4. Read the three interpretations below the cards.
5. Click **Learn More About Your Cards** to open the chat room, where your three cards are already in context.
6. In the chat, type a question or tap the **mic** to speak it; tap **Listen** on a reply (or the **Read aloud** toggle) to hear it.
7. Click **Draw Another** for a new reading — the chat will pick up the new cards.

## Local development

```bash
npm install
npm run deck:gen                   # regenerate src/deck.ts from deck-data.js
npm run build
pm2 start ecosystem.config.cjs     # wrangler pages dev dist --port 3000
curl http://localhost:3000/api/health
```

For chat locally, put your keys in `.dev.vars` (gitignored):

```
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
# optional — enables the ElevenLabs voice instead of browser speech
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

## Deployment

- **Platform**: Cloudflare Pages / Workers
- **Status**: ❌ Not yet deployed (local preview verified)
- **Build output**: `dist/` (`_worker.js` + `static/`)
- **Config**: `wrangler.jsonc` (`pages_build_output_dir: ./dist`)
- **Required production secrets**: `OPENAI_API_KEY`, `OPENAI_BASE_URL` (chat). Optional: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (voice).
- **Last updated**: 2026-09-19

## Not yet implemented / next steps

- **Deploy** the site (Pages or hosted) and set the production secrets.
- **Paste Dr. Tashema's own instructions** into `TASHEMA_VOICE` in `src/prompt.ts`. A Custom GPT cannot be called by API, so recreating its instructions here is how that voice is carried into the site — this is the single biggest quality lever.
- **Rate limiting** on `/api/chat` — each message costs tokens, so cap per-visitor usage before this is public.
- Optional: **D1 persistence** to make readings shareable (`/chat?id=…`) and to see which cards are drawn most.
- Optional: **ElevenLabs voice cloning** of Dr. Tashema's own voice for the read-aloud.
- Optional: wire a product/shop CTA if she wants to sell the physical deck.
