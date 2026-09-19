// Page shells. Plain template strings (no JSX) so the Worker bundle stays tiny.

const FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300;1,9..144,400&family=Source+Serif+4:opsz,wght@8..60,400..700&family=Source+Sans+3:wght@400..700&display=swap" rel="stylesheet">'

function head(opts: { title: string; description: string; css?: string[] }): string {
  const css = (opts.css || [])
    .map((href) => `<link rel="stylesheet" href="${href}"/>`)
    .join('\n  ')
  return `<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${opts.title}</title>
<meta name="description" content="${opts.description}"/>
<meta name="theme-color" content="#f7f2e8"/>
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${FONT_LINK}
  <link rel="stylesheet" href="/static/style.css"/>
  ${css}`
}

export function landingPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
${head({
  title: 'Dr. Tashema — Quantum Developmental Tools',
  description:
    "A quiet space where quantum insight meets soul remembrance — draw a free three-card reading from Dr. Tashema's Quantum Navigational Tools deck.",
})}
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
      <a class="reading-btn reading-btn--primary" id="learnMoreBtn" href="/chat">
        Learn More About Your Cards
        <span class="reading-btn-arrow" aria-hidden="true">→</span>
      </a>
      <button class="reading-btn" id="againBtn" type="button">Draw Another</button>
    </div>
  </section>

</div>

<script src="/static/deck-data.js"></script>
<script src="/static/app.js"></script>

</body>
</html>`
}

export function chatPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
${head({
  title: 'Ask About Your Reading — Dr. Tashema',
  description:
    'Ask questions about the three cards you drew. Type or speak, and have the reply read aloud.',
  css: ['/static/chat.css'],
})}
</head>
<body class="chat-body">

<header class="chat-top">
  <a class="chat-back" href="/" aria-label="Back to the reading">
    <span aria-hidden="true">←</span> Reading
  </a>
  <div class="chat-brand">
    <span class="chat-brand-mark" aria-hidden="true">✦</span>
    <span class="chat-brand-text">Dr. Tashema&rsquo;s Quantum Developmental Tools</span>
  </div>
  <button class="chat-voice-toggle" id="voiceToggle" type="button" aria-pressed="false">
    <span class="chat-voice-icon" aria-hidden="true">🔊</span>
    <span class="chat-voice-label">Read aloud</span>
  </button>
</header>

<main class="chat-main" id="chatMain">
  <div class="chat-scroll" id="chatScroll">
    <!-- the visitor's reading, if they drew one -->
    <section class="chat-reading" id="chatReading" hidden>
      <div class="chat-reading-head">
        <span class="chat-reading-label">Your reading</span>
        <a class="chat-reading-link" href="/">draw again</a>
      </div>
      <div class="chat-reading-cards" id="chatReadingCards"></div>
    </section>

    <div class="chat-thread" id="chatThread" role="log" aria-live="polite" aria-label="Conversation"></div>
  </div>

  <form class="chat-composer" id="chatForm" autocomplete="off">
    <label class="chat-visually-hidden" for="chatInput">Ask about your cards</label>
    <textarea
      id="chatInput"
      class="chat-input"
      rows="1"
      placeholder="Ask about your cards…"
      maxlength="2000"></textarea>

    <button class="chat-mic" id="micBtn" type="button" title="Speak your question" aria-label="Speak your question" hidden>
      <span aria-hidden="true">🎙</span>
    </button>

    <button class="chat-send" id="sendBtn" type="submit" aria-label="Send">
      <span aria-hidden="true">↑</span>
    </button>
  </form>
  <p class="chat-note">
    A reflective companion for the deck — not medical, legal or financial advice.
  </p>
</main>

<script src="/static/deck-data.js"></script>
<script src="/static/chat.js"></script>

</body>
</html>`
}
