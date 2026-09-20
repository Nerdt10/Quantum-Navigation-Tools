/* ==========================================================================
   Dr. Tashema — Quantum Developmental Tools
   The reading room: shuffle → fan → draw → reveal → interpretation.
   Recreated from the Genspark Design handoff prototype (high-fidelity).
   Deck data: window.QNT_DECK (loaded from /static/deck-data.js).
   ========================================================================== */
(() => {
  const NUM_SHUFFLE_CARDS = 10;
  const DEFAULT_DRAW = 3;

  const CARDS = window.QNT_DECK || [];

  // How many cards the visitor asked for (chosen with the pull pills), and what
  // each position is called for that size of spread.
  let drawCount = DEFAULT_DRAW;
  const POSITIONS_BY_COUNT = {
    1: ['Guidance'],
    2: ['Present', 'Future'],
    3: ['Past', 'Present', 'Future'],
  };
  const positionsFor = (n) => POSITIONS_BY_COUNT[n] || POSITIONS_BY_COUNT[3];

  // How far apart the drawn cards sit, given how many there are.
  const cardSpread = (count) =>
    count <= 1 ? 0 : Math.min(210, window.innerWidth * 0.22);

  // Choose `count` evenly-spaced cards out of the fanned spread.
  const pickEvenly = (n, count) => {
    const out = [];
    for (let k = 0; k < count; k++) {
      const frac = count === 1 ? 0.5 : (k + 1) / (count + 1);
      out.push(Math.min(n - 1, Math.max(0, Math.round(frac * (n - 1)))));
    }
    const unique = [...new Set(out)].sort((a, b) => a - b);
    for (let i = 0; unique.length < count && i < n; i++) {
      if (!unique.includes(i)) unique.push(i);
    }
    return unique.slice(0, count).sort((a, b) => a - b);
  };

  // The card currently lifted to the front by a tap (see tap-to-peek below) —
  // declared early so stage resets can clear it.
  let peekedCard = null;

  // ── Audio (pre-loaded, cloneable so overlapping plays work) ──
  const sfxShuffle = new Audio('/static/assets/sfx-shuffle.mp3');
  const sfxDraw    = new Audio('/static/assets/sfx-draw.mp3');
  sfxShuffle.preload = 'auto'; sfxShuffle.volume = 0.35;
  sfxDraw.preload    = 'auto'; sfxDraw.volume    = 0.10;
  // Play a fresh clone so rapid triggers don't cut each other off.
  // maxMs optionally trims the tail (fade-out then stop).
  const play = (audio, maxMs) => {
    try {
      const clone = audio.cloneNode();
      clone.volume = audio.volume;
      clone.play().catch(() => {});
      if (maxMs) {
        // quick fade + stop so it doesn't cut abruptly
        setTimeout(() => {
          const start = clone.volume;
          const fadeSteps = 6, fadeMs = 80;
          let step = 0;
          const fade = setInterval(() => {
            step++;
            clone.volume = Math.max(0, start * (1 - step / fadeSteps));
            if (step >= fadeSteps) { clearInterval(fade); clone.pause(); }
          }, fadeMs / fadeSteps);
        }, Math.max(0, maxMs - 80));
      }
    } catch (e) {}
  };

  const stage      = document.getElementById('deckStage');
  const hint       = document.getElementById('deckHint');
  const cta        = document.getElementById('ctaBtn');
  const caption    = document.getElementById('readingCaption');
  const meanings   = document.getElementById('readingMeanings');
  const actions    = document.getElementById('readingActions');
  const againBtn   = document.getElementById('againBtn');
  const readingSec = document.getElementById('reading');
  const peekHint   = document.getElementById('peekHint');
  const pillsWrap  = document.getElementById('drawPills');

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Hand this reading to the chat companion. Lightweight and stateless — the
  // three drawn cards go into sessionStorage (no database, no server state),
  // and /chat reads them back to give the model its context.
  const DRAWN_KEY = 'qnt_drawn_v1';
  const rememberReading = (cards) => {
    try {
      const list = cards || [];
      const pos = positionsFor(list.length);
      const payload = list.slice(0, 3).map((c, i) => ({
        position: pos[i] || 'Card',
        n: c.n,
        name: c.name,
        kw: c.kw,
      }));
      sessionStorage.setItem(DRAWN_KEY, JSON.stringify(payload));
    } catch (e) {
      /* private mode / storage disabled — the chat still works, just without
         the visitor's own cards in context. */
    }
  };

  const setCaption = (text) => {
    caption.style.opacity = 0;
    setTimeout(() => {
      caption.textContent = text;
      caption.style.opacity = 1;
    }, 250);
  };

  const cardBackHTML = () => `
    <div class="face back">
      <div class="art"></div>
    </div>`;
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

  const makeCard = () => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = cardBackHTML();
    return el;
  };

  const clearStage = () => { resetPeek(); stage.innerHTML = ''; };

  const dealCards = async (cards) => {
    cards.forEach((c) => {
      c.style.opacity = '0';
      c.style.transform = `translate3d(0, -200px, 0) rotate(${(Math.random()-.5)*30}deg)`;
    });
    stage.append(...cards);
    await wait(50);
    for (let i = 0; i < cards.length; i++) {
      cards[i].style.transition = 'transform .5s cubic-bezier(.7,.1,.3,1), opacity .35s';
      cards[i].style.opacity = '1';
      cards[i].style.transform = `translate3d(0, ${-i*0.6}px, ${i*0.4}px)`;
      await wait(40);
    }
    await wait(250);
  };

  const riffle = async (cards) => {
    play(sfxShuffle);
    const half = Math.ceil(cards.length / 2);
    cards.forEach((c, i) => {
      const side = i < half ? -1 : 1;
      const idx  = i < half ? i : i - half;
      c.style.transition = 'transform .45s cubic-bezier(.7,.1,.3,1)';
      c.style.transform = `translate3d(${side * 100}px, ${-idx*0.6}px, ${idx*0.4}px) rotate(${side*4}deg)`;
    });
    await wait(500);
    const left  = cards.slice(0, half);
    const right = cards.slice(half);
    const merged = [];
    for (let i = 0; i < half; i++) {
      if (left[i])  merged.push(left[i]);
      if (right[i]) merged.push(right[i]);
    }
    for (let i = 0; i < merged.length; i++) {
      const c = merged[i];
      c.style.zIndex = String(i);
      c.style.transition = 'transform .3s cubic-bezier(.7,.1,.3,1)';
      c.style.transform = `translate3d(0, ${-i*0.6}px, ${i*0.4}px) rotate(0deg)`;
      await wait(30);
    }
    await wait(250);
    return merged;
  };

  // Fan all cards out in a wide arc, like holding a hand of cards
  const fanOut = async (cards) => {
    const n = cards.length;
    const totalSpread = Math.min(520, window.innerWidth * 0.55);  // px wide the fan should be
    const stepX = totalSpread / (n - 1);
    const startX = -(totalSpread / 2);
    const arcRot = 3;    // deg per card off center
    const arcLift = 6;   // px vertical curve per step

    for (let i = 0; i < n; i++) {
      const c = cards[i];
      const centerOffset = i - (n - 1) / 2;
      const x = startX + i * stepX;
      const rot = centerOffset * arcRot;
      const y = Math.abs(centerOffset) * arcLift;   // U-shaped arc
      c.style.zIndex = String(20 + i);
      c.style.transition = 'transform .8s cubic-bezier(.5,.05,.3,1)';
      c.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`;
      await wait(45);
    }
    await wait(700);   // hold the fan a moment
  };

  // Pick `count` cards out of the fanned spread and bring them to the front.
  // The fan is cleared in the SAME beat the picks travel forward, so no stray
  // cards are ever left visible behind the cards being drawn.
  const autoPick = async (cards, count) => {
    const n = cards.length;
    const pickIdx = pickEvenly(n, Math.min(count, n));
    const drawn = pickIdx.map(i => cards[i]);
    const rest  = cards.filter((_, i) => !pickIdx.includes(i));

    const totalSpread = Math.min(520, window.innerWidth * 0.55);
    const stepX = totalSpread / (n - 1);
    const startX = -(totalSpread / 2);

    // One brief beat: the chosen cards lift out of the fan.
    pickIdx.forEach((i, k) => {
      const c = drawn[k];
      const centerOffset = i - (n - 1) / 2;
      const x = startX + i * stepX;
      c.style.zIndex = String(80 + k);
      c.style.transition = 'transform .55s cubic-bezier(.5,.05,.3,1)';
      c.style.transform = `translate3d(${x}px, -40px, 0) rotate(${centerOffset * 3}deg)`;
    });
    await wait(550);

    // The fan disappears and the picks travel forward together — at the same
    // moment, so the fanned cards are never seen behind the drawn ones. The
    // fan clears faster than the picks travel (0.28s vs 0.8s), so nothing is
    // left sitting behind them mid-flight.
    rest.forEach(c => {
      c.style.transition = 'opacity .28s ease';
      c.classList.add('faded');
    });

    const spread = cardSpread(count);
    const start  = -(count - 1) / 2;
    drawn.forEach((c, i) => {
      c.style.zIndex = String(80 + i);
      c.style.transition = 'transform .8s cubic-bezier(.5,.05,.3,1)';
      c.style.transform = `translate3d(${(start + i) * spread}px, 0, 0) rotate(0deg)`;
    });
    await wait(820);

    return drawn;
  };

  // ── Tap-to-peek ──────────────────────────────────────────────────────────
  // On narrow screens the three drawn cards sit close enough to overlap, and
  // whichever card is behind is covered by its neighbours — hiding its face.
  // Tapping a revealed card lifts it clear to the front so its name + keywords
  // are readable; tapping it again (or another card) settles it back down.
  //
  // Card transforms are written inline (and include rotateY(180deg) once
  // flipped), so peek composes onto the stored resting transform instead of
  // clobbering it.
  const PEEK_TRANSITION =
    'transform .5s cubic-bezier(.5,.05,.3,1), box-shadow .5s ease, opacity .4s ease';
  const PEEK_LIFT = ' translateY(-30px) scale(1.06)';

  const resetPeek = () => {
    if (!peekedCard) return;
    const c = peekedCard;
    if (c.isConnected) {
      c.style.transition = PEEK_TRANSITION;
      c.style.transform = c.dataset.restTransform || c.style.transform;
      c.style.zIndex = c.dataset.baseZ || '80';
      c.classList.remove('peeked');
      c.setAttribute('aria-pressed', 'false');
    }
    peekedCard = null;
  };

  const togglePeek = (card) => {
    if (peekedCard === card) { resetPeek(); return; }
    resetPeek();
    card.style.transition = PEEK_TRANSITION;
    card.style.transform = (card.dataset.restTransform || card.style.transform) + PEEK_LIFT;
    card.style.zIndex = '300';
    card.classList.add('peeked');
    card.setAttribute('aria-pressed', 'true');
    peekedCard = card;
  };

  const reveal = async (drawn, count) => {
    const pool = [...CARDS].sort(() => Math.random() - .5).slice(0, count);
    const spread = cardSpread(count);
    const start  = -(count - 1) / 2;
    const pos    = positionsFor(count);
    for (let i = 0; i < drawn.length; i++) {
      const c = drawn[i];
      const offset = start + i;
      const oldFront = c.querySelector('.face.front');
      if (oldFront) oldFront.remove();
      const oldLabel = c.querySelector('.position-label');
      if (oldLabel) oldLabel.remove();

      c.insertAdjacentHTML('beforeend', cardFrontHTML(pool[i]));
      c.insertAdjacentHTML('beforeend', `<div class="position-label">${pos[i]}</div>`);
      play(sfxDraw, 600);
      c.style.transition = 'transform .9s cubic-bezier(.5,.05,.3,1)';
      c.style.transform = `translate3d(${offset * spread}px, 0, 0) rotateY(180deg)`;
      c.classList.add('flipped');

      // Remember the resting transform + layer so peek can compose onto them
      // and restore cleanly, then make the revealed card tappable (mouse +
      // touch) and keyboard-reachable.
      c.dataset.restTransform = c.style.transform;
      c.dataset.baseZ = c.style.zIndex || String(80 + i);
      c.setAttribute('role', 'button');
      c.setAttribute('tabindex', '0');
      c.setAttribute('aria-pressed', 'false');
      c.setAttribute('aria-label',
        `${pos[i]} card — ${pool[i].name}. Tap to bring to the front.`);

      if (!c.dataset.peekBound) {
        c.dataset.peekBound = '1';
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          togglePeek(c);
        });
        c.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            togglePeek(c);
          }
        });
      }

      await wait(700);
    }
    // Clear the transient caption once the spread is revealed
    caption.style.opacity = 0;
    setTimeout(() => { caption.textContent = ''; }, 250);

    // Only advertise tap-to-peek when the three drawn cards actually overlap.
    // Card width is fixed (160px) while the spread scales with the viewport, so
    // a narrow screen is exactly when a face can be covered by its neighbour.
    if (peekHint) {
      const cardW = drawn[0] ? drawn[0].getBoundingClientRect().width : 160;
      const overlaps = count > 1 && Math.abs(spread) < cardW;
      peekHint.classList.toggle('show', overlaps);
    }

    // Populate the interpretation panel with the drawn cards' meanings.
    // Column count flows through a data attribute (not inline styles) so the
    // narrow-screen media query can still collapse everything to one column.
    meanings.dataset.count = String(count);
    meanings.innerHTML = pool.map((card, i) => `
      <div class="meaning-cell">
        <div class="m-pos">${pos[i]}</div>
        <div class="m-name">${card.name}</div>
        <div class="m-text">${card.meaning}</div>
      </div>
    `).join('');
    meanings.classList.add('show');

    // Hand the reading to the chat companion so it can talk about these exact
    // cards. Lightweight and stateless — sessionStorage only, no database.
    rememberReading(pool);

    await wait(400);
    actions.classList.add('show');
  };

  // Set up an idle fanned spread — the deck sits ready, awaiting a click
  const setupIdleFan = async () => {
    clearStage();
    stage.classList.add('idle');
    hint.classList.add('show');
    actions.classList.remove('show');
    meanings.classList.remove('show');
    meanings.innerHTML = '';
    if (peekHint) peekHint.classList.remove('show');
    caption.style.opacity = 0;
    caption.textContent = '';

    const cards = Array.from({length: NUM_SHUFFLE_CARDS}, () => makeCard());
    stage.append(...cards);
    // Snap into the fan (no animation on initial mount)
    const n = cards.length;
    const totalSpread = Math.min(520, window.innerWidth * 0.55);
    const stepX = totalSpread / (n - 1);
    const startX = -(totalSpread / 2);
    const arcRot = 3, arcLift = 6;
    cards.forEach((c, i) => {
      const centerOffset = i - (n - 1) / 2;
      const x = startX + i * stepX;
      const rot = centerOffset * arcRot;
      const y = Math.abs(centerOffset) * arcLift;
      c.style.zIndex = String(20 + i);
      c.style.transition = 'transform .5s cubic-bezier(.5,.05,.3,1), opacity .4s';
      c.style.opacity = '0';
      c.style.transform = `translate3d(${x}px, ${y + 30}px, 0) rotate(${rot}deg)`;
    });
    // Small stagger for a graceful entrance
    await wait(80);
    cards.forEach((c, i) => {
      const centerOffset = i - (n - 1) / 2;
      const x = startX + i * stepX;
      const rot = centerOffset * arcRot;
      const y = Math.abs(centerOffset) * arcLift;
      setTimeout(() => {
        c.style.opacity = '1';
        c.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`;
      }, i * 55);
    });
    return cards;
  };

  const runReading = async () => {
    const count = drawCount;

    // Leave idle state
    stage.classList.remove('idle');
    hint.classList.remove('show');
    actions.classList.remove('show');
    meanings.classList.remove('show');
    meanings.innerHTML = '';

    // If we already have an idle fan on stage, just collapse it into a stack
    // and shuffle from there — no need to deal from scratch each time.
    let stack = Array.from(stage.querySelectorAll('.card'));

    if (stack.length === 0) {
      setCaption('Shuffling the deck…');
      stack = Array.from({length: NUM_SHUFFLE_CARDS}, () => makeCard());
      await dealCards(stack);
    } else {
      // Collapse the fan back into a centered stack, and strip any state left
      // over from a previous pull (revealed faces, position labels, flips,
      // fades) so every card returns to a clean face-down back.
      setCaption('Gathering the deck…');
      stack.forEach((c, i) => {
        c.querySelector('.face.front')?.remove();
        c.querySelector('.position-label')?.remove();
        c.classList.remove('faded', 'flipped', 'peeked');
        c.removeAttribute('role');
        c.removeAttribute('tabindex');
        c.removeAttribute('aria-label');
        c.removeAttribute('aria-pressed');
        delete c.dataset.restTransform;
        delete c.dataset.baseZ;
        c.style.transition = 'transform .5s cubic-bezier(.7,.1,.3,1)';
        c.style.transform = `translate3d(0, ${-i*0.6}px, ${i*0.4}px) rotate(0deg)`;
        c.style.opacity = '1';
        c.style.zIndex = String(i);
      });
      await wait(550);
    }

    stack = await riffle(stack);
    setCaption('Attuning to your energy…');
    stack = await riffle(stack);

    setCaption('Spreading the deck…');
    await fanOut(stack);

    setCaption(
      count === 1 ? 'One card calls to you…' :
      count === 2 ? 'Two cards call to you…' :
                    'Three cards call to you…'
    );
    const drawn = await autoPick(stack, count);
    await wait(200);

    await reveal(drawn, count);
  };

  // Unlock audio on user gesture: prime both clips silently
  const unlockAudio = () => {
    [sfxShuffle, sfxDraw].forEach(a => {
      a.muted = true;
      a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
              .catch(() => { a.muted = false; });
    });
  };

  // Ignore rapid re-triggers while a reading is running
  let running = false;
  const triggerReading = async ({ scroll = false } = {}) => {
    if (running) return;
    running = true;
    unlockAudio();
    setPillsDisabled(true);
    if (scroll) {
      const y = readingSec.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: y, behavior: 'smooth' });
      await wait(900);
    }
    await runReading();
    setPillsDisabled(false);
    running = false;
  };

  // CTA button → glide down to the cards only. It deliberately does NOT start
  // the shuffle: the visitor chooses how many cards to pull once they arrive.
  cta.addEventListener('click', (e) => {
    e.preventDefault();
    const y = readingSec.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: y, behavior: 'smooth' });
    if (pillsWrap) {
      setTimeout(() => {
        pillsWrap.classList.add('nudge');
        setTimeout(() => pillsWrap.classList.remove('nudge'), 2400);
      }, 700);
    }
  });

  // Clicking the fanned deck itself starts the reading (only when idle)
  stage.addEventListener('click', () => {
    if (stage.classList.contains('idle')) triggerReading();
  });

  // Keyboard access to the idle deck
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('role', 'button');
  stage.setAttribute('aria-label', 'Pull cards from the deck');
  stage.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && stage.classList.contains('idle')) {
      e.preventDefault();
      triggerReading();
    }
  });

  // ── Pull pills — the visitor decides how many cards to draw ────────────
  const pillBtns = pillsWrap ? Array.from(pillsWrap.querySelectorAll('.draw-pill')) : [];
  const setActivePill = (count) => {
    drawCount = count;
    pillBtns.forEach((b) => {
      const on = Number(b.dataset.count) === count;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  const setPillsDisabled = (on) => pillBtns.forEach((b) => { b.disabled = on; });

  pillBtns.forEach((b) => {
    b.addEventListener('click', () => {
      if (running) return;
      setActivePill(Number(b.dataset.count));
      triggerReading();
    });
  });
  // Reflect the default selection in the UI on load
  setActivePill(DEFAULT_DRAW);

  // "Draw Another" → reset to idle fan, then start with the same count
  againBtn.addEventListener('click', async () => {
    if (running) return;
    await setupIdleFan();
    await wait(400);
    triggerReading();
  });

  // Mount the idle fan on load so the reading section is never empty
  setupIdleFan();
})();
