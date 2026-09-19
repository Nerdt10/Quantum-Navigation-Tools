# Dr. Tashema — Quantum Developmental Tools

A quiet, editorial single-page marketing site for **Dr. Tashema's Quantum Developmental Tools** deck. The hero introduces the deck as a product shot; below it, a free three-card reading lets visitors shuffle a fanned deck and auto-draw **Past · Present · Future**, each card flipping to reveal one of the 78 *Quantum Navigational Tools* cards with its full meaning.

Recreated from the Genspark Design handoff (`designer2-cf4103bf-327e-4f8c-82b4-b9be8a9227a6`) at **high fidelity** — colors, typography, spacing, easing curves, sound volumes and card-face layout match the handoff README.

## Project Overview

- **Name**: Dr. Tashema — Quantum Developmental Tools
- **Goal**: A ceremonial, unhurried landing page that invites visitors into a free tarot-style card reading.
- **Tech stack**: Hono + TypeScript on Cloudflare Pages; vanilla JS for the reading sequence; CDN Google Fonts (Fraunces + Inter).
- **Feel**: Ivory watercolor hero, forest-green + gold typography, whispery card SFX, painterly card backs.

## Features (completed)

### Hero — "the product shot"
- Full-viewport flex layout: copy on the left (max-width 480px), a tilted stack of three overlapping card backs on the right.
- Gold-hairline eyebrow ("✦ Quantum Developmental Tools"), "Welcome to" line, large italic **Fraunces** headline, subtitle, and the pill CTA "Get a Free Card Reading ↓".
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

### Quality floor
- Responsive: hero flips to a centered column at ≤780px; the meaning grid collapses to one column at ≤820px; fan spread/stage width scale with viewport.
- Keyboard access: focus-visible ring on the CTA, deck stage, drawn cards, and buttons; Enter/Space triggers the deck and toggles peek.
- Honors `prefers-reduced-motion` (animations and smooth scroll reduced).
- Guard flag prevents re-entry while a reading is in flight; audio is unlocked on the first user gesture.

## URLs

- **Local**: http://localhost:3000
- **Production**: _pending deploy_
- **GitHub**: _pending_

## Data Architecture

- **Data models**: 78-card static deck array — each `{ n, num, name, kw, meaning }`.
- **Storage services**: none required — the deck is canonical static content (`public/static/deck-data.js` → `window.QNT_DECK`).
- **Data flow**: server renders the HTML shell (Hono) → `deck-data.js` provides the deck → `app.js` drives the shuffle/fan/draw animation entirely client-side. No data fetching.
- **Randomness**: each reading samples 3 unique cards via `[...CARDS].sort(() => Math.random() - .5).slice(0, 3)`.

## Functional entry URIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | The single-page site (hero + reading room) |
| GET | `/static/style.css` | Stylesheet (design tokens, layout, animations) |
| GET | `/static/app.js` | Reading-room sequence logic |
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
Typography: **Fraunces** (300/400/500, italic + roman) for headlines, card faces, meanings, CTA labels; **Inter** (300/400/500) for small-cap labels, eyebrows, hints.

## Assets

The card back and hero atmosphere are **user-supplied final brand assets** (do not swap). SFX were generated with ElevenLabs sound-effects in the original design project. The 30MB `deck.pdf` reference is intentionally **not** shipped in the site.

## User guide

1. Open the site — the hero introduces the deck.
2. Click **Get a Free Card Reading** (or click the fanned deck) to begin.
3. A three-card reading is drawn automatically: **Past · Present · Future**. Each card flips to reveal its name and keywords.
4. Read the three interpretations below the cards.
5. Click **Draw Another** for a new reading.

## Local development

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs     # wrangler pages dev dist --port 3000
curl http://localhost:3000
```

## Deployment

- **Platform**: Cloudflare Pages
- **Status**: ❌ Not yet deployed (local preview verified)
- **Build output**: `dist/` (`_worker.js` + `static/`)
- **Config**: `wrangler.jsonc` (`pages_build_output_dir: ./dist`)
- **Last updated**: 2026-09-19

## Not yet implemented / next steps

- Wire the CTA or a follow-up CTA to a booking/reading page if Dr. Tashema wants to sell the physical deck.
- Optional: an email capture, "share your reading" link, or a product/shop section below the fold.
- Optional: persist recent readings (would need D1) — currently every visit is a fresh, stateless draw.
