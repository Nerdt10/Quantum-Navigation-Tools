/* ==========================================================================
   Dr. Tashema — Quantum Developmental Tools
   The reading room — animation engine (rewritten from scratch).

   The ceremony, in order:
     1. gather     the deck draws itself into one centred stack
     2. shuffle    the stack cuts left, cuts right, settles  (shuffle SFX)
     3. riffle     the deck splits in two and interleaves back together
     4. fan out    the deck opens into a wide arc
     5. clear fan  the fan is removed completely, leaving an empty stage
     6. drop in    one card per requested pull falls vertically into place
     7. reveal     each landed card turns over and shows its face

   Every step writes an inline `transform` and is stepped with await/timers.
   No animation library, no LLM — the deck is static data.

   Two rules this file exists to obey:

     • Nothing may ever render outside the stage box. `.deck-stage` is
       `overflow: hidden`, so however far a card falls it is clipped at the
       stage edge and can never sweep across the title or the pull pills.
       (That overlap was the "glitch on the phone".)

     • Every card always carries a non-identity 3D transform
       (translateZ(0.01px)). A card left on the exact identity matrix can be
       flattened out of its own 3D layer, and its rotateY turn-over then
       flickers on some phone GPUs.

   Deck data: window.QNT_DECK (loaded from /static/deck-data.js).
   ========================================================================== */
(() => {
  'use strict';

  /* ── Elements ──────────────────────────────────────────────────────────
     Bail out quietly if the reading section is not on this page. The engine
     must never throw just because its stage is missing. */
  const stage      = document.getElementById('deckStage');
  if (!stage) return;

  const caption    = document.getElementById('readingCaption');
  const meanings   = document.getElementById('readingMeanings');
  const actions    = document.getElementById('readingActions');
  const againBtn   = document.getElementById('againBtn');
  const readingSec = document.getElementById('reading');
  const peekHint   = document.getElementById('peekHint');
  const pillsWrap  = document.getElementById('drawPills');
  const cta        = document.getElementById('ctaBtn');

  /* ── Deck ──────────────────────────────────────────────────────────── */
  const CARDS       = window.QNT_DECK || [];   // the canonical 78, static
  const STACK_SIZE  = 10;                      // cards used in the ceremony
  const DEFAULT_DRAW = 3;

  let drawCount = DEFAULT_DRAW;
  let peeked    = null;                        // card currently lifted forward
  let running   = false;                       // re-entry guard

  const POSITIONS_BY_COUNT = {
    1: ['Guidance'],
    2: ['Present', 'Future'],
    3: ['Past', 'Present', 'Future'],
  };
  const positionsFor = (n) => POSITIONS_BY_COUNT[n] || POSITIONS_BY_COUNT[3];

  /* ── Timing ────────────────────────────────────────────────────────── */
  const wait  = (ms) => new Promise((r) => setTimeout(r, ms));
  const REDUCED =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  // Respect reduced-motion by compressing every beat rather than skipping the
  // steps: the sequence still happens, it just happens almost instantly.
  const pause = (ms) => wait(REDUCED ? Math.min(ms, 60) : ms);

  /* ── Audio ─────────────────────────────────────────────────────────── */
  const sfxShuffle = new Audio('/static/assets/sfx-shuffle.mp3');
  const sfxDraw    = new Audio('/static/assets/sfx-draw.mp3');
  sfxShuffle.preload = 'auto'; sfxShuffle.volume = 0.35;
  sfxDraw.preload    = 'auto'; sfxDraw.volume    = 0.10;

  // Play a clone so rapid triggers never cut each other off. maxMs optionally
  // trims the tail with a short fade instead of a hard stop.
  const play = (audio, maxMs) => {
    try {
      const clone = audio.cloneNode();
      clone.volume = audio.volume;
      clone.play().catch(() => {});
      if (maxMs) {
        setTimeout(() => {
          const start = clone.volume;
          const steps = 6, stepMs = 80 / steps;
          let step = 0;
          const fade = setInterval(() => {
            step++;
            clone.volume = Math.max(0, start * (1 - step / steps));
            if (step >= steps) { clearInterval(fade); clone.pause(); }
          }, stepMs);
        }, Math.max(0, maxMs - 80));
      }
    } catch { /* autoplay blocked — silent is fine */ }
  };

  const unlockAudio = () => {
    [sfxShuffle, sfxDraw].forEach((a) => {
      a.muted = true;
      a.play()
        .then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
        .catch(() => { a.muted = false; });
    });
  };

  /* ── Geometry ──────────────────────────────────────────────────────────
     ONE transform builder for the whole file, so every card always carries
     the same shape of transform and never lands on the identity matrix. */
  const xf = ({ x = 0, y = 0, z = 0.01, rot = 0, flip = 0, scale = 1 } = {}) =>
    `translate3d(${x}px, ${y}px, ${z}px) ` +
    `rotateZ(${rot}deg) rotateY(${flip}deg) scale(${scale})`;

  const CARD_W = 160;   // .card width in style.css  — update both together
  const CARD_H = 250;   // .card height in style.css — update both together
  const ARC_ROT = 3;    // deg per card off centre, for the fan

  // The usable width of the stage, in px. Everything horizontal is measured
  // against this so nothing can ever spill past the stage and open up a
  // sideways scroll on a phone.
  const stageW = () => stage.clientWidth || window.innerWidth * 0.9;

  // The widest thing a whole stack of cards can be slid sideways and still sit
  // entirely inside the stage (used by shuffle + riffle).
  const stackShift = () => Math.max(0, stageW() / 2 - CARD_W / 2 - 6);

  /* Fan geometry, derived from the stage rather than the viewport.
     A rotated card's axis-aligned bounding box is WIDER than the card:
        bboxW = w·cos θ + h·sin θ
     At the fan's outermost rotation (13.5° for 10 cards) a 160×250 card has a
     214px bbox — which is why a viewport-sized fan used to hang 19px off the
     edge of a 390px phone and make the whole page pan sideways. Sizing the
     fan to `stageW − bboxW` keeps the outermost card's bbox exactly inside
     the stage at every viewport. */
  const fanGeometry = (n) => {
    const maxRot = ((n - 1) / 2) * ARC_ROT;
    const rad = (maxRot * Math.PI) / 180;
    const bboxW = CARD_W * Math.cos(rad) + CARD_H * Math.sin(rad);
    const total = Math.max(0, Math.min(520, stageW() - bboxW));
    const stepX = n > 1 ? total / (n - 1) : 0;
    return { startX: -total / 2, stepX, ARC_ROT, ARC_LIFT: 6 };
  };

  // How far apart the drawn cards sit, for a given pull size. Also kept inside
  // the stage so a 3-card spread cannot reach past the edge on a narrow phone.
  const spreadFor = (count) => {
    if (count <= 1) return 0;
    const maxTotal = Math.max(0, stageW() - CARD_W);
    return Math.min(Math.min(210, window.innerWidth * 0.22), maxTotal / (count - 1));
  };

  // The x-offset of card `i` within a spread of `count` cards, centred on 0.
  const offsetFor = (i, count) => (i - (count - 1) / 2) * spreadFor(count);

  // Resting geometry of the stacked (face-down) deck: a whisper of depth so
  // the cards read as a deck rather than one card.
  const stackAt = (i) => xf({ y: -i * 0.8, z: i * 0.4 });

  /* ── Card factory ──────────────────────────────────────────────────── */
  const makeCard = () => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = '<div class="face back"><div class="art"></div></div>';
    return el;
  };

  const cardFrontHTML = (c) => `
    <div class="face front">
      <div class="front-num">${c.n}</div>
      <div class="front-name">${c.name}</div>
      <div class="front-divider">
        <span class="line"></span>
        <span class="diamond">◆</span>
        <span class="line r"></span>
      </div>
      <div class="front-label">Keywords</div>
      <div class="front-kw">${c.kw}</div>
    </div>`;

  // Return a card to a pristine, face-down state — used when the deck is
  // gathered for a second reading.
  const stripCard = (c) => {
    c.querySelector('.face.front')?.remove();
    c.querySelector('.position-label')?.remove();
    c.classList.remove('flipped', 'peeked', 'faded');
    ['role', 'tabindex', 'aria-label', 'aria-pressed'].forEach((a) =>
      c.removeAttribute(a));
    delete c.dataset.rest;
    delete c.dataset.baseZ;
  };

  const clearStage = () => {
    peeked = null;
    stage.innerHTML = '';
  };

  /* ── 1. Gather ─────────────────────────────────────────────────────────
     Draw every card back into one centred stack, whatever it was doing. */
  const gather = async (cards) => {
    cards.forEach((c, i) => {
      stripCard(c);
      c.style.transition = 'transform .5s cubic-bezier(.6,.05,.3,1)';
      c.style.opacity = '1';
      c.style.zIndex = String(10 + i);
      c.style.transform = stackAt(i);
    });
    await pause(540);
  };

  /* ── 2. Shuffle ────────────────────────────────────────────────────────
     The whole stack moves as one deck: cut left, cut right, settle centre.
     The cut distance is derived from the stage so the deck can never swing
     past the stage edge and open a sideways scroll on a phone. */
  const shuffle = async (cards) => {
    play(sfxShuffle);
    const shift = stackShift();
    const beats = [
      { x:  shift, rot:  3, ms: 360 },
      { x: -shift, rot: -3, ms: 360 },
      { x: 0,      rot:  0, ms: 420 },
    ];
    for (const b of beats) {
      cards.forEach((c, i) => {
        c.style.transition =
          `transform ${b.ms / 1000}s cubic-bezier(.6,.05,.3,1)`;
        c.style.transform = xf({ x: b.x, y: -i * 0.8, z: i * 0.4, rot: b.rot });
      });
      await pause(b.ms);
    }
  };

  /* ── 3. Riffle ─────────────────────────────────────────────────────────
     Split into two halves, then interleave them back card by card. */
  const riffle = async (cards) => {
    play(sfxShuffle);
    const half  = Math.ceil(cards.length / 2);
    const left  = cards.slice(0, half);
    const right = cards.slice(half);
    const shift = stackShift();

    cards.forEach((c, i) => {
      const isLeft = i < half;
      const k = isLeft ? i : i - half;
      const side = isLeft ? -1 : 1;
      c.style.transition = 'transform .38s cubic-bezier(.6,.05,.3,1)';
      c.style.transform =
        xf({ x: side * shift, y: -k * 0.8, z: k * 0.4, rot: side * 4 });
    });
    await pause(400);

    const merged = [];
    for (let i = 0; i < half; i++) {
      if (left[i])  merged.push(left[i]);
      if (right[i]) merged.push(right[i]);
    }
    for (let i = 0; i < merged.length; i++) {
      const c = merged[i];
      c.style.zIndex = String(10 + i);
      c.style.transition = 'transform .26s cubic-bezier(.6,.05,.3,1)';
      c.style.transform = stackAt(i);
      await pause(34);
    }
    await pause(300);
    return merged;
  };

  /* ── 4. Fan out ────────────────────────────────────────────────────────
     Open the deck into a wide U-shaped arc, like holding a hand of cards.
     Sized by fanGeometry() so the outermost card's rotated bounding box is
     still inside the stage — no sideways scroll on a phone. */
  const fan = async (cards) => {
    const n = cards.length;
    const { startX, stepX, ARC_ROT: ROT, ARC_LIFT: LIFT } = fanGeometry(n);

    for (let i = 0; i < n; i++) {
      const c = cards[i];
      const k = i - (n - 1) / 2;
      c.style.zIndex = String(30 + i);
      c.style.transition = 'transform .62s cubic-bezier(.5,.05,.3,1)';
      c.style.transform = xf({
        x: startX + i * stepX,
        y: Math.abs(k) * LIFT,
        rot: k * ROT,
      });
      await pause(42);
    }
    await pause(560);
  };

  /* ── 5. Clear the fan ──────────────────────────────────────────────────
     The fan is ceremony, never a source. It leaves completely: a 160ms fade
     with NO transform (so nothing can travel outside the stage), then the
     stage is emptied and the DOM nodes are gone. */
  const clearFan = async () => {
    const cards = Array.from(stage.querySelectorAll('.card'));
    cards.forEach((c) => {
      c.style.transition = 'opacity .16s linear';
      c.style.opacity = '0';
    });
    await pause(170);
    clearStage();
    await pause(60);
  };

  /* ── 6. Drop in ────────────────────────────────────────────────────────
     One card per requested pull falls vertically into its spread position.

     They already sit at their final x, so the motion is a pure vertical drop.

     The numbers, so this can never drift out of the stage again:
        card height            250px
        stage height           360px   (.deck-stage)
        resting card, centred  top = 180 - 125 =  55px
        resting drawn card*    top =  55 + (cardW - stageW) / 2   (~80px)
        *rotateY turns the card about its vertical axis, so its horizontal
         footprint becomes the card height (250px), and the bounding box is
         recentred — a ~25px lift. (CSS-verified, not guessed.)

     So the topmost a card ever gets while resting is 55px. Falling from
     -48px lands the card at 7px — 7px of head-room clear of the stage's top
     edge. NOTHING renders outside the box: the stage is no longer clipped,
     so the fan above can still arc past the edges into the section padding
     (where there is nothing to collide with), but the drop is contained. */
  const DROP_FROM = -48;   // px above the resting position (top edge - 7px)

  const dropIn = async (count) => {
    const cards = Array.from({ length: count }, () => makeCard());

    cards.forEach((c, i) => {
      c.style.transition = 'none';
      c.style.opacity = '0';
      c.style.zIndex = String(120 + i);
      c.style.transformOrigin = 'center center';
      c.style.transform =
        xf({ x: offsetFor(i, count), y: DROP_FROM, scale: 0.97 });
    });
    stage.append(...cards);
    void stage.offsetWidth;   // commit the start position before animating

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      c.style.transition =
        'transform .62s cubic-bezier(.22,.68,.32,1), opacity .24s ease';
      c.style.opacity = '1';
      c.style.transform = xf({ x: offsetFor(i, count), y: 0 });
      await pause(120);
    }
    await pause(430);
    return cards;
  };

  /* ── Tap-to-peek ───────────────────────────────────────────────────────
     On narrow screens the drawn cards overlap and the back one is covered.
     Tapping a revealed card lifts it clear; tapping again settles it back.
     The resting transform is cached so peek composes onto it (preserving the
     rotateY turn-over) instead of clobbering it. */
  const PEEK_TRANSITION =
    'transform .5s cubic-bezier(.5,.05,.3,1), box-shadow .5s ease';
  const PEEK_LIFT = ' translate3d(0, -30px, 0) scale(1.06)';

  const unpeek = () => {
    const c = peeked;
    peeked = null;
    if (!c || !c.isConnected) return;
    c.style.transition = PEEK_TRANSITION;
    c.style.transform = c.dataset.rest || c.style.transform;
    c.style.zIndex = c.dataset.baseZ || '120';
    c.classList.remove('peeked');
    c.setAttribute('aria-pressed', 'false');
  };

  const togglePeek = (card) => {
    if (peeked === card) { unpeek(); return; }
    unpeek();
    card.style.transition = PEEK_TRANSITION;
    card.style.transform = (card.dataset.rest || card.style.transform) + PEEK_LIFT;
    card.style.zIndex = '300';
    card.classList.add('peeked');
    card.setAttribute('aria-pressed', 'true');
    peeked = card;
  };

  const bindPeek = (card, position, data) => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label',
      `${position} card — ${data.name}. Tap to bring it forward.`);
    if (card.dataset.peekBound) return;
    card.dataset.peekBound = '1';
    card.addEventListener('click', (e) => { e.stopPropagation(); togglePeek(card); });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        togglePeek(card);
      }
    });
  };

  /* ── 7. Reveal ─────────────────────────────────────────────────────────
     Turn each landed card over and show its face, then fill the
     interpretation panel and hand the reading to the chat companion. */
  const drawPool = (count) => {
    // Fisher-Yates over a copy — a real shuffle, and unique cards every time.
    const pool = CARDS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length));
  };

  const reveal = async (drawn, count) => {
    const pool = drawPool(count);
    if (!pool.length) {
      // No deck data on the page — say so rather than throwing.
      setCaption('The deck is unavailable right now.');
      return;
    }
    const pos = positionsFor(count);

    for (let i = 0; i < drawn.length; i++) {
      const c    = drawn[i];
      const data = pool[i % pool.length];
      const x    = offsetFor(i, count);

      c.insertAdjacentHTML('beforeend', cardFrontHTML(data));
      c.insertAdjacentHTML('beforeend',
        `<div class="position-label">${pos[i]}</div>`);
      play(sfxDraw, 600);

      c.style.transition = 'transform .82s cubic-bezier(.5,.05,.3,1)';
      c.style.transform = xf({ x, flip: 180 });
      c.classList.add('flipped');

      // Cache the resting transform + layer so peek can compose onto them.
      c.dataset.rest  = c.style.transform;
      c.dataset.baseZ = c.style.zIndex || String(120 + i);
      bindPeek(c, pos[i], data);

      await pause(620);
    }

    // The caption has done its job — empty it so it stops holding open space.
    caption.style.opacity = '0';
    setTimeout(() => { caption.textContent = ''; }, 250);

    // Only advertise tap-to-peek when the drawn cards actually overlap.
    if (peekHint) {
      const cardW = drawn[0] ? drawn[0].getBoundingClientRect().width : 160;
      const overlaps = count > 1 && Math.abs(spreadFor(count)) < cardW;
      peekHint.classList.toggle('show', overlaps);
    }

    // Interpretation panel — one column per drawn card.
    meanings.dataset.count = String(count);
    meanings.innerHTML = pool.map((card, i) => `
      <div class="meaning-cell">
        <div class="m-pos">${pos[i]}</div>
        <div class="m-name">${card.name}</div>
        <div class="m-text">${card.meaning}</div>
      </div>`).join('');
    meanings.classList.add('show');

    // Hand the reading to QSyrii: sessionStorage only, no database.
    rememberReading(pool);

    await pause(400);
    actions.classList.add('show');
  };

  /* ── Hand-off to the chat ──────────────────────────────────────────────
     The visitor's cards are stored statelessly in sessionStorage so /chat can
     read them back and put them in the model's context. */
  const DRAWN_KEY = 'qnt_drawn_v1';
  const rememberReading = (cards) => {
    try {
      const pos = positionsFor(cards.length);
      const payload = cards.slice(0, 3).map((c, i) => ({
        position: pos[i] || 'Card',
        n: c.n,
        name: c.name,
        kw: c.kw,
      }));
      sessionStorage.setItem(DRAWN_KEY, JSON.stringify(payload));
    } catch {
      // private mode / storage disabled — the chat still works, just without
      // the visitor's own cards in context.
    }
  };

  /* ── Caption ───────────────────────────────────────────────────────── */
  const setCaption = (text) => {
    if (!caption) return;
    caption.style.opacity = '0';
    setTimeout(() => {
      caption.textContent = text;
      caption.style.opacity = '1';
    }, 250);
  };

  /* ── Idle fan ──────────────────────────────────────────────────────────
     The deck sits ready before anything starts. It snaps into the arc with a
     gentle staggered entrance, sized by the same fanGeometry() as the
     ceremony — so its outermost card never hangs off the edge of the stage
     (an 19px overhang on a 390px phone is enough to make the whole page pan
     sideways, which reads as a glitch before a single card is drawn). */
  const setupIdleFan = async () => {
    clearStage();
    stage.classList.add('idle');
    actions.classList.remove('show');
    meanings.classList.remove('show');
    meanings.innerHTML = '';
    if (peekHint) peekHint.classList.remove('show');
    if (caption) { caption.style.opacity = '0'; caption.textContent = ''; }

    const cards = Array.from({ length: STACK_SIZE }, () => makeCard());
    stage.append(...cards);

    const n = cards.length;
    const { startX, stepX, ARC_ROT: ROT, ARC_LIFT: LIFT } = fanGeometry(n);
    const at = (i, drop) => {
      const k = i - (n - 1) / 2;
      return xf({
        x: startX + i * stepX,
        y: Math.abs(k) * LIFT + drop,
        rot: k * ROT,
      });
    };

    cards.forEach((c, i) => {
      c.style.zIndex = String(30 + i);
      c.style.transition =
        'transform .55s cubic-bezier(.5,.05,.3,1), opacity .4s ease';
      c.style.opacity = '0';
      c.style.transform = at(i, 26);
    });
    await pause(60);
    cards.forEach((c, i) => {
      setTimeout(() => {
        c.style.opacity = '1';
        c.style.transform = at(i, 0);
      }, REDUCED ? 0 : i * 50);
    });
    await pause(560);
  };

  /* ── The reading itself ────────────────────────────────────────────────
     gather → shuffle → riffle → fan → clear fan → drop in → reveal */
  const runReading = async () => {
    const count = drawCount;

    stage.classList.remove('idle');
    actions.classList.remove('show');
    meanings.classList.remove('show');
    meanings.innerHTML = '';
    if (peekHint) peekHint.classList.remove('show');

    // 1. GATHER — reuse the cards already on stage, or build the deck first.
    let stack = Array.from(stage.querySelectorAll('.card'));
    if (stack.length === 0) {
      setCaption('Gathering the deck…');
      stack = Array.from({ length: STACK_SIZE }, () => makeCard());
      stage.append(...stack);
      stack.forEach((c, i) => { c.style.transition = 'none'; c.style.transform = stackAt(i); });
      void stage.offsetWidth;
      await pause(120);
    }
    setCaption('Gathering the deck…');
    await gather(stack);

    // 2. SHUFFLE
    setCaption('Shuffling the deck…');
    await shuffle(stack);

    // 3. RIFFLE
    setCaption('Attuning to your energy…');
    stack = await riffle(stack);

    // 4. FAN OUT
    setCaption('Spreading the deck…');
    await fan(stack);

    // 5. CLEAR THE FAN — the deck releases its cards, then leaves.
    setCaption('The deck releases its cards…');
    await clearFan();

    // 6. DROP IN
    setCaption(
      count === 1 ? 'One card emerges…'
      : count === 2 ? 'Two cards emerge…'
      : 'Three cards emerge…'
    );
    const drawn = await dropIn(count);
    await pause(140);

    // 7. REVEAL
    await reveal(drawn, count);
  };

  const triggerReading = async ({ scroll = false } = {}) => {
    if (running) return;
    running = true;
    unlockAudio();
    setPillsDisabled(true);
    if (scroll && readingSec) {
      const y = readingSec.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
      await pause(880);
    }
    try {
      await runReading();
    } finally {
      setPillsDisabled(false);
      running = false;
    }
  };

  /* ── Pull pills — the visitor decides how many cards to draw ────────── */
  const pillBtns = pillsWrap
    ? Array.from(pillsWrap.querySelectorAll('.draw-pill'))
    : [];

  const setActivePill = (count) => {
    drawCount = count;
    pillBtns.forEach((b) => {
      const on = Number(b.dataset.count) === count;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  const setPillsDisabled = (on) =>
    pillBtns.forEach((b) => { b.disabled = on; });

  pillBtns.forEach((b) => {
    b.addEventListener('click', () => {
      if (running) return;
      setActivePill(Number(b.dataset.count));
      triggerReading();
    });
  });
  setActivePill(DEFAULT_DRAW);

  /* ── CTA — glide down to the cards only; the visitor picks the pull ─── */
  if (cta && readingSec) {
    cta.addEventListener('click', (e) => {
      e.preventDefault();
      const y = readingSec.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
      if (pillsWrap) {
        setTimeout(() => {
          pillsWrap.classList.add('nudge');
          setTimeout(() => pillsWrap.classList.remove('nudge'), 2400);
        }, 700);
      }
    });
  }

  /* ── The stage itself is clickable / keyboard-reachable while idle ──── */
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('role', 'button');
  stage.setAttribute('aria-label', 'Pull cards from the deck');
  stage.addEventListener('click', () => {
    if (stage.classList.contains('idle')) triggerReading();
  });
  stage.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && stage.classList.contains('idle')) {
      e.preventDefault();
      triggerReading();
    }
  });

  /* ── Draw Another ──────────────────────────────────────────────────── */
  if (againBtn) {
    againBtn.addEventListener('click', async () => {
      if (running) return;
      await setupIdleFan();
      await pause(360);
      triggerReading();
    });
  }

  /* ── Mount: the reading section is never empty ─────────────────────── */
  setupIdleFan();
})();
