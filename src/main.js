/*
  Deckbound — src/main.js
  The shell: boot, input, the fixed-timestep loop, and the FX wiring that
  connects the DOM-free engine to audio + UI effects. This is the only file
  that touches the DOM. Load order (index.html): balance.data.js -> data.js ->
  engine.js -> audio.js -> art.js -> render.js -> this file.
*/

/* =========================================================================
   6) STARTUP + INPUT
   ========================================================================= */

// Pause is SHELL state: when true the loop simply stops calling update(), so
// the engine never knows about it. Seating/upgrading still works while paused
// (strategic pause). Auto-clears outside a run.
let gamePaused = false;
function togglePause() {
  if (game.phase !== "prep" && game.phase !== "wave") return;
  gamePaused = !gamePaused;
}

// DEV/QA (Issue #79 touch-target acceptance): prints every interactive rect's
// CSS size at the CURRENT viewport, so we can prove each clears 44 CSS px on a
// phone. Call window.__uiRects() from the console (e.g. at ~844x390). Inert
// unless called — safe to keep as a layout-audit helper; strip if undesired.
window.__uiRects = function () {
  const cr = game.canvas.getBoundingClientRect();
  const s = cr.width / DESIGN.w;                 // design px -> CSS px
  const rows = [];
  const add = (name, r) => {
    const w = r.w * s, h = r.h * s, min = Math.min(w, h);
    rows.push({ name, cssW: +w.toFixed(1), cssH: +h.toFixed(1), minCss: +min.toFixed(1), pass: min >= 44 });
  };
  const nDeck = deckTypes().length;   // the real deck (7 with cook+eater) — the scrolling rail keeps card height constant
  for (let i = 0; i < nDeck; i++) add("rail card " + (i + 1) + "/" + nDeck, railCardRect(i, nDeck));
  add("pause", pauseBtnRect()); add("mute (run)", muteBtnRect());
  const fake = { typeId: "arrow", upgradeTier: 0, upgradePath: null, targeting: "first", spent: 50 };
  const sh = towerSheet(fake);
  sh.modes.forEach((m) => add("target: " + m.label, m.rect));
  sh.paths.forEach((p) => add("path: " + p.name, p.rect));
  add("sell", sh.sell.rect); add("sheet close X", sh.close);
  add("start wave", { x: START_BTN.x + BOARD.x, y: START_BTN.y, w: START_BTN.w, h: START_BTN.h });
  add("hub: play", PLAY_BTN); add("hub: map picker", MAP_BTN);
  add("hub: continue", RESUME_RUN_BTN);   // Save & Continue (Issue #83)
  const pm = pauseMenuRects();             // board-space → shift by BOARD.x for the CSS audit
  add("pause: resume", { x: pm.resume.x + BOARD.x, y: pm.resume.y, w: pm.resume.w, h: pm.resume.h });
  add("pause: save & quit", { x: pm.saveQuit.x + BOARD.x, y: pm.saveQuit.y, w: pm.saveQuit.w, h: pm.saveQuit.h });
  pm.autoStart.forEach((o) => add("pause: auto-start " + o.label, { x: o.rect.x + BOARD.x, y: o.rect.y, w: o.rect.w, h: o.rect.h }));
  shopButtonRects().forEach((b, i) => add("hub: shop " + (i + 1), b.rect));
  for (let i = 0; i < 5; i++) add("hub card " + (i + 1), hubCardRect(i));
  if (console.table) console.table(rows);
  return { scale: +s.toFixed(3), canvasCssW: +cr.width.toFixed(1), canvasCssH: +cr.height.toFixed(1),
           allPass: rows.every((r) => r.pass), rows };
};

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) { console.error("Deckbound: could not find the game canvas."); return; }
  game.canvas = canvas;
  game.ctx = canvas.getContext("2d");
  META = loadMeta();
  // Restore the last-picked map, but only if it's still pickable (non-retired);
  // a retired or unknown/null saved id falls back to the default maps[0].
  const savedMap = MAPS.find((m) => m.id === META.mapId && !m.retired);
  loadMap(savedMap || MAPS[0]);
  game.phase = "menu";
  setupInput(canvas);
  console.log("Deckbound v1 loaded. Essence:", META.essence);
  startGameLoop();
});

function setupInput(canvas) {
  // Pointer in DESIGN coords (the full 900x450 canvas). The board scene is drawn
  // shifted right by BOARD.x, so board hit-tests apply the inverse (see `b`
  // below) — the presentation viewport transform's inverse mapping. The engine
  // still lives entirely in board coords; only this shell knows about the offset.
  const toDesign = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * DESIGN.w, y: ((clientY - r.top) / r.height) * DESIGN.h };
  };

  // In-progress rail drag-scroll: { startY, startScroll, moved } while a pointer is
  // down in the rail card zone, else null. Resolves to a tap (select) or a scroll.
  let railDrag = null;

  const onDown = (clientX, clientY) => {
    audio.unlock();
    const p = toDesign(clientX, clientY);                 // design coords (chrome)
    const b = { x: p.x - BOARD.x, y: p.y - BOARD.y };     // board coords (playfield) — inverse transform

    // Mute (always available) + pause (only during a run) — both design-space chrome.
    if (inRect(p, muteBtnRect())) { audio.muted = !audio.muted; return; }
    if ((game.phase === "prep" || game.phase === "wave") && inRect(p, pauseBtnRect())) { togglePause(); return; }

    // Pause menu (board space) — active only while paused: Resume, or Save & Quit
    // (returns to the hub; the checkpoint is already on disk). Swallow taps elsewhere
    // on the panel so they don't fall through to the board behind it (Issue #83).
    if (gamePaused && (game.phase === "prep" || game.phase === "wave")) {
      const pm = pauseMenuRects();
      // Auto-start segmented row: pick a delay ("off" | 0 | 1 | 2 | 3 seconds),
      // persisted in META like the map choice. The countdown itself lives in the
      // engine's prep update; pausing halts update(), so it suspends here too.
      for (const o of pm.autoStart) {
        if (inRect(b, o.rect)) { META.autoStart = o.value; saveMeta(); audio.build(); return; }
      }
      if (inRect(b, pm.resume)) { gamePaused = false; audio.build(); return; }
      if (inRect(b, pm.saveQuit)) { gamePaused = false; game.phase = "menu"; audio.build(); return; }
      if (inRect(b, pm.panel)) return;
    }

    // Hub / menu (design space).
    if (game.phase === "menu") {
      // Continue — resume the saved run (checked first so nothing shadows it).
      if (hasSave() && inRect(p, RESUME_RUN_BTN)) { if (restoreRun()) gamePaused = false; return; }
      for (const s of shopButtonRects()) if (inRect(p, s.rect)) { tryBuyShop(s.item); return; }
      // Tap a regular's card → toggle its upgrade-path details view.
      const deck = deckTypes();
      for (let i = 0; i < deck.length; i++) if (inRect(p, hubCardRect(i))) { toggleHubCard(deck[i].id); audio.build(); return; }
      if (pickableMaps().length > 1 && inRect(p, MAP_BTN)) {
        // Cycle to the next NON-RETIRED map (the picker lists only these), remember
        // it, and load it so the hub label + the coming run reflect the choice.
        const picks = pickableMaps();
        const i = picks.findIndex((m) => m.id === MAP.id);
        const next = picks[(i + 1) % picks.length];
        loadMap(next.id); META.mapId = next.id; saveMeta();
        audio.build(); return;
      }
      if (inRect(p, PLAY_BTN)) { startRun(); return; }
      return;
    }

    // Run summary → back to hub (design space).
    if (game.phase === "lost") {
      if (inRect(p, CONTINUE_BTN)) { game.phase = "menu"; }
      return;
    }

    // Upgrade SHEET (design space) — checked first so a tap on it never falls
    // through to the board it overlays. Close on the X; swallow background taps.
    if (game.selectedTower) {
      const sheet = towerSheet(game.selectedTower);
      if (inRect(p, sheet.close)) { game.selectedTower = null; audio.build(); return; }
      if (inRect(p, sheet.rect)) {
        for (const m of sheet.modes) if (inRect(p, m.rect)) { setTargeting(game.selectedTower, m.mode); audio.build(); return; }
        for (const pb of sheet.paths) if (inRect(p, pb.rect)) { tryUpgrade(game.selectedTower, pb.id); return; }
        if (inRect(p, sheet.sell.rect)) { sellTower(game.selectedTower); game.selectedTower = null; return; }
        return;
      }
    }

    // Left rail (design space): the deck can overflow the rail (Roster Growth 1),
    // so a press in the card zone begins a DRAG-OR-TAP rather than selecting on
    // press: onMove scrolls if it moves past the threshold, and onUp selects the
    // card only if it did NOT scroll (so a swipe never fires an accidental build).
    if (p.x <= RAIL.w && p.y >= RAIL_TOP) {
      railDrag = { startY: p.y, startScroll: railScroll, moved: false };
      return;
    }

    // Board interactions use the inverse transform (board coords).
    if (game.phase === "prep" && inRect(b, START_BTN)) { startNextWave(); return; }

    // Click a placed tower → select it (opens the upgrade sheet).
    for (const t of game.towers) if (distance(b, t) <= 18) { game.selectedTower = t; return; }

    // Click valid open floor → seat the selected customer right there (free
    // placement — canPlace covers bounds/belt/spacing/obstacles).
    if (canPlace(b.x, b.y)) { tryBuild(b.x, b.y); game.selectedTower = null; return; }

    // Clicked empty-but-unbuildable space (or elsewhere) → close any open sheet.
    game.selectedTower = null;
  };

  // Pointer move: update the hover pointer AND drive a rail drag-scroll in
  // progress. A drag past DRAG_THRESHOLD design px flips it from a tap into a
  // scroll, so onUp won't select a card (Roster Growth 1 scrolling rail).
  const DRAG_THRESHOLD = 8;
  const onMove = (clientX, clientY) => {
    game.pointer = toDesign(clientX, clientY);
    if (railDrag) {
      const dy = game.pointer.y - railDrag.startY;
      if (Math.abs(dy) > DRAG_THRESHOLD) railDrag.moved = true;
      railDragTo(railDrag.startScroll, dy);
    }
  };
  // Pointer up: resolve a rail drag-or-tap. If it didn't scroll, it's a tap →
  // select the card under the release point (and close any open sheet).
  const onUp = (clientX, clientY) => {
    if (!railDrag) return;
    const scrolled = railDrag.moved;
    const p = toDesign(clientX, clientY);
    railDrag = null;
    if (scrolled) return;
    const deck = deckTypes();
    for (let i = 0; i < deck.length; i++) {
      if (inRect(p, railCardRect(i, deck.length))) { game.selectedType = deck[i].id; game.selectedTower = null; return; }
    }
  };

  canvas.addEventListener("mousedown", (e) => onDown(e.clientX, e.clientY));
  canvas.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", (e) => onUp(e.clientX, e.clientY));
  canvas.addEventListener("touchstart", (e) => { if (e.touches[0]) { e.preventDefault(); onDown(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { if (e.touches[0]) { if (railDrag) e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  canvas.addEventListener("touchend", (e) => { const t = e.changedTouches[0]; if (t) onUp(t.clientX, t.clientY); });
  // Desktop wheel over the rail scrolls the deck (only when it overflows).
  canvas.addEventListener("wheel", (e) => { const p = toDesign(e.clientX, e.clientY); if (p.x <= RAIL.w && railScrollable()) { e.preventDefault(); railWheel(e.deltaY); } }, { passive: false });

  // Keyboard: P or Space toggles pause. Skipped while typing in a form field
  // (the dev harness has inputs on the same page as the game).
  window.addEventListener("keydown", (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.code === "KeyP" || e.code === "Space") { e.preventDefault(); togglePause(); }
  });

  // Mobile lifecycle (Issue #83): on iOS Safari, pagehide and visibilitychange->
  // hidden are the reliable "the app is going away" signals — beforeunload is NOT,
  // so we don't rely on it. Auto-pause when the page is hidden so a backgrounded run
  // doesn't advance. No save write is needed here: the checkpoint is already on disk
  // (written at prep entry + frozen at wave call), so a phone locked mid-wave already
  // has its wave-start snapshot persisted and the hub will offer Continue on reopen.
  const autoPauseHidden = () => { if (game.phase === "prep" || game.phase === "wave") gamePaused = true; };
  window.addEventListener("pagehide", autoPauseHidden);
  document.addEventListener("visibilitychange", () => { if (document.hidden) autoPauseHidden(); });
}

/* =========================================================================
   8) GAME LOOP
   ========================================================================= */

const STEP = 1 / 60;
function startGameLoop() {
  let lastTime, accumulator = 0, framesThisSecond = 0, fpsTimer = 0;
  function frame(now) {
    if (lastTime === undefined) lastTime = now;
    let dt = (now - lastTime) / 1000; lastTime = now;
    if (dt > 0.25) dt = 0.25;
    // Paused: drop banked time so nothing fast-forwards on resume; the pause
    // flag self-clears outside a run so a new run never starts frozen.
    if (game.phase !== "prep" && game.phase !== "wave") gamePaused = false;
    accumulator += dt;
    if (gamePaused) accumulator = 0;
    while (accumulator >= STEP) { update(STEP); accumulator -= STEP; }
    framesThisSecond++; fpsTimer += dt;
    if (fpsTimer >= 1) { game.fps = framesThisSecond; framesThisSecond = 0; fpsTimer -= 1; }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}


/* =========================================================================
   FX WIRING — connect the engine's no-op hooks to real audio + UI effects.
   Headless runs (tools/sim.mjs) skip this file, so the engine stays silent.
   ========================================================================= */

for (const k of ["shoot", "hit", "kill", "leak", "upgrade", "build", "deny", "waveStart", "buy", "win", "lose"]) {
  FX[k] = (...args) => audio[k](...args);
}
// Signature + economy hooks (audio pass, Issue #64) — same wiring pattern.
for (const k of ["crumb", "knockback", "doubleFreeze", "fourthHand", "place", "sell"]) {
  FX[k] = (...args) => audio[k](...args);
}
