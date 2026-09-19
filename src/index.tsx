import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Serve everything in public/ (styles, scripts, images, SFX, deck data).
// public/static/app.js  → /static/app.js
// public/static/assets/… → /static/assets/…
app.use('/static/*', serveStatic({ root: './' }))

const PAGE_TITLE = "Dr. Tashema — Quantum Developmental Tools"

app.get('/', (c) => {
  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${PAGE_TITLE}</title>
<meta name="description" content="A quiet space where quantum insight meets soul remembrance — draw a free three-card reading from Dr. Tashema's Quantum Navigational Tools deck."/>
  <meta name="theme-color" content="#f7f2e8"/>
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300;1,9..144,400&family=Source+Serif+4:opsz,wght@8..60,400..700&family=Source+Sans+3:wght@400..700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/style.css"/>
</head>
<body>

<div class="atmos"></div>
<div class="atmos-wash"></div>

<div class="page">

  <!-- HERO -->
  <section class="hero" id="hero">
    <div class="hero-copy">
      <div class="eyebrow">✦ Quantum Developmental Tools</div>
      <h1>
        <span class="welcome">Welcome to</span>
        Dr. Tashema's Quantum Developmental Tools
      </h1>
      <p class="sub">
        A quiet space where quantum insight meets soul remembrance —
        practices, readings, and remembrances for those learning to move
        through the field with intention.
      </p>
      <div class="cta-wrap">
        <a href="#reading" class="cta" id="ctaBtn">
          Get a Free Card Reading
          <span class="arrow">↓</span>
        </a>
      </div>
    </div>

    <div class="hero-deck" aria-hidden="true">
      <div class="stack">
        <div class="stack-card"><div class="art"></div></div>
        <div class="stack-card"><div class="art"></div></div>
        <div class="stack-card"><div class="art"></div></div>
      </div>
    </div>

    <div class="scroll-hint">Scroll to receive</div>
  </section>

  <!-- READING -->
  <section class="reading-section" id="reading">
    <div class="reading-eyebrow">✦ Your Reading ✦</div>
    <h2 class="reading-title">Three cards, drawn quietly, in the language of the field.</h2>

    <div class="deck-stage" id="deckStage"></div>
    <div class="deck-hint" id="deckHint">Click the deck — or the button above — to begin</div>

    <div class="reading-caption" id="readingCaption"></div>

    <div class="peek-hint" id="peekHint">Tap a card to bring it forward</div>

    <div class="reading-meanings" id="readingMeanings"></div>

    <div class="reading-actions" id="readingActions">
      <button class="reading-btn" id="againBtn">Draw Another</button>
    </div>
  </section>

</div>

<script src="/static/deck-data.js"></script>
<script src="/static/app.js"></script>

</body>
</html>`)
})

export default app
