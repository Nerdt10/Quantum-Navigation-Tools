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
      <div class="eyebrow">✦ Quantum Navigational Tools</div>
      <h1>
        Quantum Developmental Tools
      </h1>
      <div class="founder">Founder Dr. Tashema</div>
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

    <div class="draw-pills" id="drawPills" role="group" aria-label="Choose how many cards to pull">
      <button class="draw-pill" type="button" data-count="1" aria-pressed="false">Pull 1 card</button>
      <button class="draw-pill" type="button" data-count="2" aria-pressed="false">Pull 2 cards</button>
      <button class="draw-pill" type="button" data-count="3" aria-pressed="false">Pull 3 cards</button>
    </div>

    <div class="deck-stage" id="deckStage"></div>

    <div class="reading-caption" id="readingCaption"></div>

    <div class="peek-hint" id="peekHint">Tap a card to bring it forward</div>

    <div class="reading-meanings" id="readingMeanings"></div>

    <div class="reading-actions" id="readingActions">
      <button class="reading-btn reading-btn--primary" id="againBtn" type="button">Draw Another</button>
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
  title: 'QSyrii — Ask About Your Cards',
  description:
    'Ask QSyrii about the three cards you drew. Type or speak, and hear the reply read aloud.',
  css: ['/static/chat.css'],
})}
</head>
<body class="chat-body is-empty" data-mode="chat">

<div class="chat-bar">
  <a class="chat-icon-btn" href="/" title="Back to your reading" aria-label="Back to your reading">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>

  <div class="chat-seg" role="tablist" aria-label="Choose how to talk to QSyrii">
    <button class="chat-seg-btn is-active" id="segChat" data-mode="chat" type="button" role="tab" aria-selected="true">Chat</button>
    <button class="chat-seg-btn" id="segSpeak" data-mode="speak" type="button" role="tab" aria-selected="false">Speak</button>
  </div>

  <button class="chat-icon-btn chat-bar-end" id="newChatBtn" type="button" title="Start a new chat" aria-label="Start a new chat">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12.4A7.4 7.4 0 0 1 12.6 19.8H8.2L4 22.4l.9-4.1a7.4 7.4 0 0 1 7.5-14 7.4 7.4 0 0 1 7.6 8.1Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
  </button>
</div>

<main class="chat-stage" id="chatStage">

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

  <div class="chat-hello">
    <h1 class="chat-hello-title" id="helloTitle">Ready when you are.</h1>
    <p class="chat-hello-sub" id="helloSub">Ask QSyrii about your cards.</p>
  </div>

  <footer class="chat-dock">

    <div class="chat-typing" id="typingDock">
      <form class="chat-composer" id="chatForm" autocomplete="off">
        <button class="chat-plus" id="plusBtn" type="button" aria-label="Suggestions and options" aria-expanded="false">
          <span aria-hidden="true">+</span>
        </button>

        <label class="chat-visually-hidden" for="chatInput">Ask QSyrii</label>
        <textarea
          id="chatInput"
          class="chat-input"
          rows="1"
          placeholder="Ask QSyrii"
          maxlength="2000"></textarea>

        <button class="chat-mic" id="micBtn" type="button" title="Speak your question" aria-label="Speak your question" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.6V21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>

        <button class="chat-send" id="sendBtn" type="submit" aria-label="Send" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>

        <div class="chat-pop" id="plusPop" hidden>
          <span class="chat-pop-label">Try asking</span>
          <div class="chat-pop-list" id="plusList"></div>
          <div class="chat-pop-sep"></div>
          <button class="chat-pop-row" id="autoSpeakRow" type="button" aria-pressed="false">
            <span>Read replies aloud</span>
            <span class="chat-pop-check" id="autoSpeakCheck" aria-hidden="true">—</span>
          </button>
          <a class="chat-pop-row" href="/">
            <span>Draw another reading</span>
            <span class="chat-pop-check" aria-hidden="true">→</span>
          </a>
          <button class="chat-pop-row" id="popNewChat" type="button">
            <span>New chat</span>
            <span class="chat-pop-check" aria-hidden="true">↺</span>
          </button>
        </div>
      </form>
    </div>

    <div class="chat-speaking" id="speakDock" hidden>
      <button class="chat-orb" id="orbBtn" type="button" aria-label="Tap to speak" aria-pressed="false">
        <span class="chat-orb-core" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.6V21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </span>
      </button>
      <p class="chat-voice-status" id="voiceStatus">Tap to speak</p>
      <p class="chat-voice-transcript" id="voiceTranscript" aria-live="polite"></p>
    </div>

    <p class="chat-note">A reflective companion for the deck — not medical, legal or financial advice.</p>
  </footer>

</main>

<script src="/static/deck-data.js"></script>
<script src="/static/chat.js"></script>

</body>
</html>`
}
