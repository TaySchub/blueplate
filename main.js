/*
  Deckbound — main.js
  Stage 3: deck / collection + meta-progression + polish. Completes the v1 loop.

  THEME (display layer only): "hungry customers vs. runaway food." Towers are
  seated diner customers; enemies are dishes escaping down the belt to the trash
  chute. Internal IDs below (arrow/cannon/…, mote/runner/…, essence, core) are
  UNCHANGED — only the words players see are themed. See docs/FRANCHISE_BACKBONE.md.

  New this stage:
    - A HUB / start screen (phase "menu"): your card collection + an Essence shop.
    - META-PROGRESSION that PERSISTS between runs (saved in the browser via
      localStorage): finish a run to earn Essence, spend it to permanently unlock
      the Sniper card and buy starting perks (+currency, +lives). This is the
      "always progressing" pillar — you get stronger across runs.
    - DECK = your collection of unlocked tower cards; the in-run toolbar shows
      only what you've unlocked. (In-run card management is kept light for v1,
      per GAME_BRIEF.)
    - Polish: a proper front screen, run-summary, and small balance tidy.

  Reused: fixed path + core, fixed-timestep loop, 5 tower types + 4 enemy types,
  currency/waves/lives/win-lose, particle juice, procedural Web Audio.
  Plain canvas, no dependencies.
*/

/* =========================================================================
   1) CONFIG
   ========================================================================= */

const VIEW = { w: 800, h: 450 };

const COLOR = {
  bg: "#10131a", grid: "#1b2130",
  pathEdge: "#2b3346", pathFill: "#3b4a6b", pathCenter: "#55b3ff",
  core: "#6ea8fe", coreHurt: "#ff6b6b",
  ink: "#e8ecf3", muted: "#8b94a7",
  gold: "#ffe08a", good: "#7dff9b", bad: "#ff6b6b",
  essence: "#c9a6ff",
  slot: "#4a5670", projectile: "#dff5ff", frostAura: "#7fe0ff",
  upgradeSpark: "#ffe08a", panel: "#151a24",
};

/* Difficulty & economy numbers come from data/balance.json, loaded as
   window.BALANCE via the generated balance.data.js (see index.html and
   tools/gen_balance.py). Art (colors/shapes/blurbs), per-tower upgrade deltas,
   and level geometry stay in this file and are merged onto the balance data by
   id below. Rule: if the balance sim needs a number, it lives in balance.json. */
if (!window.BALANCE) {
  throw new Error("balance.data.js failed to load — run `python3 tools/gen_balance.py`");
}
const BAL = window.BALANCE;

const RULES = {
  startCurrency: BAL.economy.startCurrency,
  startLives: BAL.economy.startLives,
  upgradeCost: BAL.economy.upgradeCost,
  earnPerWave: BAL.economy.earnPerWave,
  // "Call the wave early" bonus: full value if you start the wave the instant
  // prep begins, decaying linearly to 0 over earlyCallWindow seconds.
  earlyCallBonus: BAL.economy.earlyCallBonus || 0,
  earlyCallWindow: BAL.economy.earlyCallWindow || 1,
};

// Per-tower ART only (customer glyph color + glow). Each tower is drawn as a
// seated customer keyed by id in drawCustomer(); combat stats + display
// name/blurb come from BAL.towers (data/balance.json).
const TOWER_ART = {
  arrow:  { color: "#6ea8fe", glow: "#3f6bb0" },
  cannon: { color: "#ff9d5c", glow: "#b5561f" },
  frost:  { color: "#7fe0ff", glow: "#2b8fb5" },
  sniper: { color: "#c8a8ff", glow: "#7a4fd0" },
  zap:    { color: "#ffe08a", glow: "#b59a2b" },
};
// Upgrade levels 1→2→3 are presented as a three-course meal (display only; the
// underlying level numbers are unchanged).
const COURSE_NAMES = ["Appetizer", "Entrée", "Dessert"];
// Fixed display order for the deck/toolbar.
const TOWER_ORDER = ["arrow", "cannon", "frost", "sniper", "zap"];
const TOWER_TYPES = TOWER_ORDER.map((id) => ({ id, ...BAL.towers[id], ...TOWER_ART[id] }));
const TOWER_BY_ID = Object.fromEntries(TOWER_TYPES.map((t) => [t.id, t]));

// Per-enemy ART (food colors/radius). hpMul/speedMul/reward AND the display name
// come from BAL.enemyTypes (data/balance.json). Radii are kept as-is because they
// already echo real HP (brute > mote > runner > swarm); each enemy is drawn as
// its dish in drawFood(), and color keeps them distinct at a glance.
const ENEMY_ART = {
  mote:   { color: "#e3a93f", edge: "#8a6016", radius: 12 },  // Chicken Nugget — golden
  runner: { color: "#c9772f", edge: "#6e3d17", radius: 9 },   // The Slider — burger
  brute:  { color: "#7c3b2c", edge: "#3e1a12", radius: 17 },  // Tough Steak — dark slab
  swarm:  { color: "#f2ca3c", edge: "#a37e17", radius: 7 },   // Fry Swarm — bright yellow
};
const ENEMY_TYPES = Object.fromEntries(
  Object.entries(BAL.enemyTypes).map(([id, stats]) => [id, { ...ENEMY_ART[id], ...stats }])
);

/* =========================================================================
   1b) META-PROGRESSION — persisted in the browser (localStorage).
   ========================================================================= */

const META_KEY = "deckbound.meta.v1";
function freshMeta() {
  return { essence: 0, unlocked: ["arrow", "cannon", "frost", "zap"], boughtCurrency: false, boughtLives: false };
}
function loadMeta() {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) return Object.assign(freshMeta(), JSON.parse(s));
  } catch (e) { /* localStorage may be blocked (e.g. file://) — play without saving */ }
  return freshMeta();
}
function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) {}
}
let META = freshMeta();

// The Essence shop shown on the hub screen.
const SHOP = [
  { id: "sniper", label: "Reserve Chopstick Sensei's seat", cost: 3, owned: () => META.unlocked.includes("sniper"), buy: () => META.unlocked.push("sniper") },
  { id: "currency", label: "Cash float (+50 Tips)", cost: 2, owned: () => META.boughtCurrency, buy: () => (META.boughtCurrency = true) },
  { id: "lives", label: "Forgiving inspector (+3 Health)", cost: 2, owned: () => META.boughtLives, buy: () => (META.boughtLives = true) },
];

// Your "deck": the tower cards you've unlocked (in a fixed display order).
function deckTypes() {
  return TOWER_TYPES.filter((t) => META.unlocked.includes(t.id));
}

/* =========================================================================
   2) LEVEL
   ========================================================================= */

// Map geometry (path + tower slots) comes from data/balance.json via BAL.map,
// so a map can be redesigned by editing data — no code change. The core sits at
// the end of the path.
const PATH = BAL.map.path;
const CORE = { x: PATH[PATH.length - 1].x, y: PATH[PATH.length - 1].y, radius: BAL.map.coreRadius };
const SLOTS = BAL.map.slots;

function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
const SEGMENT_LENGTHS = PATH.slice(1).map((p, i) => distance(PATH[i], p));
const PATH_LENGTH = SEGMENT_LENGTHS.reduce((sum, len) => sum + len, 0);
function pointAtDistance(dist) {
  if (dist <= 0) return { x: PATH[0].x, y: PATH[0].y };
  let remaining = dist;
  for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
    const segLen = SEGMENT_LENGTHS[i];
    if (remaining <= segLen) {
      const t = remaining / segLen, a = PATH[i], b = PATH[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= segLen;
  }
  return { x: PATH[PATH.length - 1].x, y: PATH[PATH.length - 1].y };
}

/* =========================================================================
   3) WAVES
   ========================================================================= */

// Waves are GENERATED from data/balance.json's waveGen block (not an authored
// table), so "more rounds" and "endless" fall out of one formula. makeWave(n)
// is deterministic and mirrored in tools/balance_sim.py so the sim and game
// agree on every wave. n is 0-indexed.
const WG = BAL.waveGen;

function waveTypeWeights(n) {
  const u = WG.typeUnlock;
  return {
    mote:   Math.max(0.15, 1.0 - 0.05 * n),
    runner: n >= u.runner ? 0.7 : 0,
    swarm:  n >= u.swarm ? 0.4 + 0.02 * n : 0,
    brute:  n >= u.brute ? 0.2 + 0.03 * n : 0,
  };
}

function makeWave(n) {
  const hp = Math.round(WG.hpBase * Math.pow(WG.hpGrowth, n));
  const speed = Math.min(WG.speedMax, WG.speedBase + WG.speedStep * n);
  const interval = Math.max(WG.intervalMin, WG.intervalBase - WG.intervalStep * n);
  const count = WG.baseCount + Math.round(WG.countStep * n);
  const w = waveTypeWeights(n);
  const active = Object.keys(w).filter((k) => w[k] > 0);
  const totalW = active.reduce((s, k) => s + w[k], 0);
  const comp = active.map((k) => [k, Math.max(1, Math.round((w[k] / totalW) * count))]);
  return { hp, speed, interval, comp };
}

// Finite mode plays waveGen.waveCount generated waves; getWave(n) also serves
// waves past the authored count for endless (Feature 3b).
const WAVES = Array.from({ length: WG.waveCount }, (_, n) => makeWave(n));
function getWave(n) { return n < WAVES.length ? WAVES[n] : makeWave(n); }
function buildSpawnQueue(wave) {
  const q = [];
  for (const [type, count] of wave.comp) for (let i = 0; i < count; i++) q.push(type);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  return q;
}

/* =========================================================================
   4) AUDIO
   ========================================================================= */

const audio = {
  ctx: null, ready: false, muted: false,
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.ready = true;
    } catch (e) { console.warn("Deckbound: audio unavailable —", e); }
  },
  tone(freq, dur, type = "sine", gain = 0.2, freqTo = null) {
    if (!this.ready || this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqTo != null) osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur);
  },
  noiseBurst(dur, gain = 0.25) {
    if (!this.ready || this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g).connect(this.ctx.destination);
    src.start(t0);
  },
  shoot(typeId) {
    switch (typeId) {
      case "cannon": this.tone(160, 0.12, "square", 0.09, 90); this.noiseBurst(0.08, 0.08); break;
      case "frost": this.tone(720, 0.1, "sine", 0.05, 900); break;
      case "sniper": this.tone(300, 0.14, "sawtooth", 0.07, 140); break;
      case "zap": this.tone(880, 0.04, "square", 0.03, 700); break;
      default: this.tone(520, 0.07, "square", 0.05, 380);
    }
  },
  hit() { this.tone(240, 0.05, "triangle", 0.04); },
  kill() { const start = 600 + Math.random() * 500; this.tone(start, 0.18, "sawtooth", 0.16, 90); this.noiseBurst(0.16, 0.2); },
  upgrade() { this.tone(440, 0.1, "triangle", 0.18); setTimeout(() => this.tone(660, 0.1, "triangle", 0.18), 70); setTimeout(() => this.tone(880, 0.14, "triangle", 0.2), 140); },
  build() { this.tone(300, 0.09, "sine", 0.16, 460); },
  deny() { this.tone(180, 0.12, "sawtooth", 0.12, 120); },
  waveStart() { this.tone(330, 0.16, "triangle", 0.16, 500); },
  buy() { this.tone(520, 0.1, "sine", 0.16, 780); setTimeout(() => this.tone(780, 0.12, "sine", 0.16), 90); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "triangle", 0.2), i * 130)); },
  lose() { [400, 300, 220, 150].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "sawtooth", 0.18), i * 150)); },
};

/* =========================================================================
   5) GAME STATE
   ========================================================================= */

// phase: "menu" (hub/shop) | "prep" | "wave" | "won" | "lost"
const game = {
  canvas: null, ctx: null,
  phase: "menu",
  currency: 0, lives: 0, maxLives: 0, waveIndex: 0,
  selectedType: "arrow",
  selectedTower: null, // the placed tower whose targeting/upgrade panel is open
  towers: [], enemies: [], projectiles: [], particles: [],
  spawnQueue: [], spawnTimer: 0, waveHp: 0, waveSpeed: 0, waveInterval: 1,
  killed: 0, coreHurtFlash: 0, shake: 0, elapsed: 0, fps: 0, prepElapsed: 0,
  score: 0, endless: false,
  pointer: { x: -1, y: -1 },
  message: "", messageTimer: 0,
  lastRun: null, // { won, wave, killed, essence } — shown on the summary
};

const START_BTN = { x: 470, y: 402, w: 210, h: 38 };
const CONTINUE_BTN = { x: VIEW.w / 2 - 85, y: VIEW.h / 2 + 44, w: 170, h: 38 };
const PLAY_BTN = { x: VIEW.w / 2 - 90, y: 372, w: 180, h: 44 };
const MODE_BTN = { x: VIEW.w / 2 - 90, y: 328, w: 180, h: 30 };
const TOOLBAR = { y: 398, cardW: 66, cardH: 44, gap: 6, startX: 8 };

// Hub toggle: finite (default, has a win) vs endless (survival + score). Endless
// removes the win condition, so it stays off until the player chooses it.
let chosenEndless = false;

function cardRect(i) {
  return { x: TOOLBAR.startX + i * (TOOLBAR.cardW + TOOLBAR.gap), y: TOOLBAR.y, w: TOOLBAR.cardW, h: TOOLBAR.cardH };
}
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

// Begin a fresh run from the hub, applying permanent perks + your unlocked deck.
function startRun() {
  game.phase = "prep";
  game.currency = RULES.startCurrency + (META.boughtCurrency ? 50 : 0);
  game.maxLives = RULES.startLives + (META.boughtLives ? 3 : 0);
  game.lives = game.maxLives;
  game.waveIndex = 0;
  game.towers = []; game.enemies = []; game.projectiles = []; game.particles = [];
  game.spawnQueue = []; game.killed = 0; game.coreHurtFlash = 0;
  game.prepElapsed = 0;
  game.selectedTower = null;
  game.score = 0;
  game.endless = chosenEndless;
  game.lastRun = null;
  const deck = deckTypes();
  game.selectedType = deck.length ? deck[0].id : "arrow";
  setMessage("Pick a customer below, seat them at a table, then Send Out the food");
}

function setMessage(text, seconds = 3.5) { game.message = text; game.messageTimer = seconds; }

/* =========================================================================
   6) STARTUP + INPUT
   ========================================================================= */

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) { console.error("Deckbound: could not find the game canvas."); return; }
  game.canvas = canvas;
  game.ctx = canvas.getContext("2d");
  META = loadMeta();
  game.phase = "menu";
  setupInput(canvas);
  console.log("Deckbound v1 loaded. Essence:", META.essence);
  startGameLoop();
});

function setupInput(canvas) {
  const toDesign = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * VIEW.w, y: ((clientY - r.top) / r.height) * VIEW.h };
  };

  const onDown = (clientX, clientY) => {
    audio.unlock();
    const p = toDesign(clientX, clientY);

    // Mute (always available).
    if (p.x >= VIEW.w - 44 && p.x <= VIEW.w - 12 && p.y >= 12 && p.y <= 44) { audio.muted = !audio.muted; return; }

    // Hub / menu.
    if (game.phase === "menu") {
      for (const b of shopButtonRects()) {
        if (inRect(p, b.rect)) { tryBuyShop(b.item); return; }
      }
      if (inRect(p, MODE_BTN)) { chosenEndless = !chosenEndless; audio.build(); return; }
      if (inRect(p, PLAY_BTN)) { startRun(); return; }
      return;
    }

    // Run summary → back to hub.
    if (game.phase === "won" || game.phase === "lost") {
      if (inRect(p, CONTINUE_BTN)) { game.phase = "menu"; }
      return;
    }

    // Selected-tower panel (targeting + upgrade) — check its buttons first so a
    // click on the panel doesn't fall through to the slot/tower underneath it.
    if (game.selectedTower) {
      const panel = towerPanel(game.selectedTower);
      if (inRect(p, panel.rect)) {
        for (const b of panel.modes) if (inRect(p, b.rect)) { game.selectedTower.targeting = b.mode; audio.build(); return; }
        if (inRect(p, panel.upgrade.rect)) { tryUpgrade(game.selectedTower); return; }
        return; // clicked panel background — swallow the click
      }
    }

    // Toolbar: select a card from your deck.
    const deck = deckTypes();
    for (let i = 0; i < deck.length; i++) {
      if (inRect(p, cardRect(i))) { game.selectedType = deck[i].id; return; }
    }

    if (game.phase === "prep" && inRect(p, START_BTN)) { startNextWave(); return; }

    // Click a placed tower → select it (opens the targeting/upgrade panel).
    for (const t of game.towers) if (distance(p, t) <= 18) { game.selectedTower = t; return; }

    // Click an empty slot → build there.
    for (let i = 0; i < SLOTS.length; i++) {
      const s = SLOTS[i];
      if (distance(p, s) <= 20 && !game.towers.some((t) => t.slotIndex === i)) { tryBuild(i); game.selectedTower = null; return; }
    }

    // Clicked empty space → close any open panel.
    game.selectedTower = null;
  };

  canvas.addEventListener("mousedown", (e) => onDown(e.clientX, e.clientY));
  canvas.addEventListener("touchstart", (e) => { if (e.touches[0]) { e.preventDefault(); onDown(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  canvas.addEventListener("mousemove", (e) => { game.pointer = toDesign(e.clientX, e.clientY); });
}

function tryBuyShop(item) {
  if (item.owned()) { audio.deny(); return; }
  if (META.essence < item.cost) { audio.deny(); setMessage("Not enough Golden Forks (need " + item.cost + ")"); return; }
  META.essence -= item.cost;
  item.buy();
  saveMeta();
  audio.buy();
}

/* =========================================================================
   7) PLAYER ACTIONS (build / upgrade / start wave)
   ========================================================================= */

function tryBuild(slotIndex) {
  const def = TOWER_BY_ID[game.selectedType];
  if (game.currency < def.cost) { audio.deny(); setMessage("Not enough Tips for " + def.name + " (need " + def.cost + ")"); return; }
  game.currency -= def.cost;
  const s = SLOTS[slotIndex];
  game.towers.push({
    slotIndex, x: s.x, y: s.y, typeId: def.id, level: 1, maxLevel: 3,
    range: def.range, damage: def.damage, cooldown: def.cooldown,
    splash: def.splash || 0, slowFactor: def.slowFactor || 1, slowDur: def.slowDur || 0,
    cdTimer: 0, upgradeFlash: 0, targeting: "first",
  });
  spawnRing(s.x, s.y, def.color, 34, 0.4);
  audio.build();
}

function tryUpgrade(t) {
  if (t.level >= t.maxLevel) { audio.deny(); setMessage("Already served Dessert (max level)"); return; }
  const cost = RULES.upgradeCost[t.level];
  if (game.currency < cost) { audio.deny(); setMessage("Not enough Tips for the next course (need " + cost + ")"); return; }
  game.currency -= cost;
  t.level++;
  const up = TOWER_BY_ID[t.typeId].up;
  if (up.damage) t.damage += up.damage;
  if (up.range) t.range += up.range;
  if (up.cooldownMul) t.cooldown *= up.cooldownMul;
  if (up.splash) t.splash += up.splash;
  if (up.slowFactorAdd) t.slowFactor = Math.max(0.2, t.slowFactor + up.slowFactorAdd);
  t.upgradeFlash = 0.6;
  spawnUpgradeSparkles(t);
  audio.upgrade();
}

// The currency you'd earn right now for calling the wave early — full value the
// instant prep begins, decaying linearly to 0 over earlyCallWindow seconds.
function earlyCallBonusNow() {
  if (RULES.earlyCallBonus <= 0) return 0;
  const remaining = 1 - game.prepElapsed / RULES.earlyCallWindow;
  return Math.max(0, Math.round(RULES.earlyCallBonus * remaining));
}

function startNextWave() {
  if (game.phase !== "prep") return;
  const bonus = earlyCallBonusNow();
  const w = getWave(game.waveIndex);
  game.phase = "wave";
  game.spawnQueue = buildSpawnQueue(w);
  game.spawnTimer = 0;
  game.waveHp = w.hp; game.waveSpeed = w.speed; game.waveInterval = w.interval;
  if (bonus > 0) {
    game.currency += bonus;
    setMessage("Called early — +" + bonus + " tip!  Wave " + (game.waveIndex + 1) + " incoming!");
    spawnFloatText(START_BTN.x + START_BTN.w / 2, START_BTN.y - 4, "+" + bonus, COLOR.gold);
  } else {
    setMessage("Wave " + (game.waveIndex + 1) + " incoming!");
  }
  audio.waveStart();
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
    accumulator += dt;
    while (accumulator >= STEP) { update(STEP); accumulator -= STEP; }
    framesThisSecond++; fpsTimer += dt;
    if (fpsTimer >= 1) { game.fps = framesThisSecond; framesThisSecond = 0; fpsTimer -= 1; }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =========================================================================
   9) UPDATE
   ========================================================================= */

function update(step) {
  game.elapsed += step;
  if (game.coreHurtFlash > 0) game.coreHurtFlash -= step;
  if (game.shake > 0) game.shake = Math.max(0, game.shake - step * 24);
  if (game.messageTimer > 0) game.messageTimer -= step;
  if (game.phase === "menu") { updateParticles(step); return; }
  if (game.phase === "prep") game.prepElapsed += step;

  updateTowers(step);
  moveProjectiles(step);
  updateParticles(step);
  if (game.phase === "wave") {
    spawnWaveEnemies(step);
    moveEnemies(step);
    checkWaveEnd();
    checkLoss();
  }
}

function spawnWaveEnemies(step) {
  if (game.spawnQueue.length === 0) return;
  game.spawnTimer -= step;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = game.waveInterval;
    const typeId = game.spawnQueue.shift();
    const et = ENEMY_TYPES[typeId];
    const hp = Math.round(game.waveHp * et.hpMul);
    game.enemies.push({ typeId, dist: 0, speed: game.waveSpeed * et.speedMul, hp, maxHp: hp, radius: et.radius, reward: et.reward, hurtFlash: 0, slowTimer: 0, slowFactor: 1 });
  }
}

function moveEnemies(step) {
  for (const e of game.enemies) {
    let speed = e.speed;
    if (e.slowTimer > 0) { speed *= e.slowFactor; e.slowTimer -= step; if (e.slowTimer <= 0) e.slowFactor = 1; }
    e.dist += speed * step;
    const p = pointAtDistance(e.dist);
    e.x = p.x; e.y = p.y;
    if (e.hurtFlash > 0) e.hurtFlash -= step;
    if (e.dist >= PATH_LENGTH) { e.reachedCore = true; game.lives = Math.max(0, game.lives - 1); game.coreHurtFlash = 0.35; game.shake = 6; }
  }
  game.enemies = game.enemies.filter((e) => !e.reachedCore);
}

// The four targeting modes a player can set per tower. "first" (furthest along
// the path) is the default and matches the balance sim's frontmost behavior.
const TARGETING_MODES = [
  ["first", "First"], ["last", "Last"], ["strong", "Strong"], ["close", "Close"],
];

function pickTarget(t) {
  let best = null, bestKey = -Infinity;
  for (const e of game.enemies) {
    if (distance(t, e) > t.range) continue;
    let key;
    switch (t.targeting) {
      case "last": key = -e.dist; break;        // least far along the path
      case "strong": key = e.hp; break;         // most current HP
      case "close": key = -distance(t, e); break; // nearest to the tower
      default: key = e.dist;                    // "first": furthest along the path
    }
    if (key > bestKey) { bestKey = key; best = e; }
  }
  return best;
}

function updateTowers(step) {
  for (const t of game.towers) {
    if (t.upgradeFlash > 0) t.upgradeFlash -= step;
    t.cdTimer -= step;
    if (t.cdTimer > 0) continue;
    const target = pickTarget(t);
    if (target) { fireProjectile(t, target); t.cdTimer = t.cooldown; }
  }
}

function fireProjectile(t, target) {
  const def = TOWER_BY_ID[t.typeId];
  game.projectiles.push({
    x: t.x, y: t.y, target, speed: def.behavior === "single" && t.typeId === "sniper" ? 520 : 360,
    damage: t.damage, radius: t.typeId === "cannon" ? 6 : 4, behavior: def.behavior, color: def.color,
    splash: t.splash, slowDur: t.slowDur, slowFactor: t.slowFactor,
  });
  audio.shoot(t.typeId);
}

function moveProjectiles(step) {
  for (const p of game.projectiles) {
    if (!p.target || !game.enemies.includes(p.target)) { p.dead = true; continue; }
    const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy), stepDist = p.speed * step;
    if (d <= stepDist + p.target.radius) { resolveHit(p); p.dead = true; }
    else { p.x += (dx / d) * stepDist; p.y += (dy / d) * stepDist; }
  }
  game.projectiles = game.projectiles.filter((p) => !p.dead);
}

function resolveHit(p) {
  const hx = p.target.x, hy = p.target.y;
  if (p.behavior === "splash") {
    spawnRing(hx, hy, p.color, p.splash, 0.28);
    for (const e of [...game.enemies]) if (distance({ x: hx, y: hy }, e) <= p.splash) applyDamage(e, p.damage);
  } else if (p.behavior === "slow") {
    applyDamage(p.target, p.damage);
    if (game.enemies.includes(p.target)) { p.target.slowTimer = p.slowDur; p.target.slowFactor = Math.min(p.target.slowFactor, p.slowFactor); }
  } else {
    applyDamage(p.target, p.damage);
  }
}

function applyDamage(enemy, dmg) {
  enemy.hp -= dmg;
  enemy.hurtFlash = 0.08;
  if (enemy.hp <= 0 && !enemy.reachedCore) {
    game.enemies = game.enemies.filter((e) => e !== enemy);
    game.killed++;
    game.currency += enemy.reward;
    game.score += enemy.reward;
    spawnKillBurst(enemy.x, enemy.y, ENEMY_TYPES[enemy.typeId].color);
    spawnFloatText(enemy.x, enemy.y - 14, "+$" + enemy.reward + " tip", COLOR.gold);
    audio.kill();
  } else {
    spawnHitSpark(enemy.x, enemy.y);
    audio.hit();
  }
}

function checkWaveEnd() {
  if (game.phase !== "wave") return;
  if (game.spawnQueue.length === 0 && game.enemies.length === 0) {
    game.currency += RULES.earnPerWave;
    // Finite mode wins after the last authored wave; endless never wins — it
    // keeps generating waves (getWave past WAVES.length) until you lose.
    if (!game.endless && game.waveIndex + 1 >= WAVES.length) { endRun(true); }
    else { game.waveIndex++; game.phase = "prep"; game.prepElapsed = 0; setMessage("Wave cleared!  +" + RULES.earnPerWave + " Tips — seat more customers, then Send Out the food", 4); }
  }
}

function checkLoss() {
  if (game.lives <= 0 && game.phase === "wave") endRun(false);
}

// Finish a run: award Essence (persisted) and show the summary.
function endRun(won) {
  // Endless runs end only by losing; wavesCleared is however many you finished.
  const wavesCleared = won ? WAVES.length : game.waveIndex;
  const essence = Math.max(1, Math.floor(wavesCleared / 2) + (won ? 3 : 0));
  META.essence += essence;
  saveMeta();
  game.lastRun = {
    won, endless: game.endless, killed: game.killed, essence, score: game.score,
    wave: won ? WAVES.length : game.waveIndex + 1,
  };
  game.phase = won ? "won" : "lost";
  won ? audio.win() : audio.lose();
}

/* -------------------------------------------------------------------------
   Particles
   ------------------------------------------------------------------------- */

function spawnRing(x, y, color, maxR, life) { game.particles.push({ type: "ring", x, y, r: 4, maxR, life, maxLife: life, color }); }
// CHOMP! A dish gets eaten: a quick bite-flash pop + scattering crumbs (in the
// dish's own color plus warm crumb tones).
function spawnKillBurst(x, y, color) {
  spawnRing(x, y, "#fff2c8", 26, 0.22);
  const crumbs = ["#e8c58a", "#c98a45", color];
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 130;
    game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.6 + Math.random() * 2, life: 0.35 + Math.random() * 0.3, maxLife: 0.65, color: crumbs[i % crumbs.length] });
  }
}
function spawnUpgradeSparkles(t) {
  spawnRing(t.x, t.y, COLOR.upgradeSpark, 42, 0.5);
  for (let i = 0; i < 16; i++) { const a = (Math.PI * 2 * i) / 16, sp = 70 + Math.random() * 60; game.particles.push({ type: "spark", x: t.x, y: t.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 2, life: 0.5 + Math.random() * 0.3, maxLife: 0.8, color: COLOR.upgradeSpark }); }
}
// A tiny, cheap spark on a non-lethal hit — quick readable feedback without the weight of a kill burst.
function spawnHitSpark(x, y) {
  for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 40; game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.5, life: 0.15, maxLife: 0.15, color: "#ffffff" }); }
}
function spawnFloatText(x, y, text, color) {
  game.particles.push({ type: "text", x, y, vy: -34, text, color, life: 0.7, maxLife: 0.7 });
}
function updateParticles(step) {
  for (const p of game.particles) {
    p.life -= step;
    if (p.type === "spark") { p.x += p.vx * step; p.y += p.vy * step; p.vx *= 0.92; p.vy *= 0.92; }
    else if (p.type === "ring") { const k = 1 - p.life / p.maxLife; p.r = 4 + (p.maxR - 4) * k; }
    else if (p.type === "text") { p.y += p.vy * step; p.vy *= 0.9; }
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

/* =========================================================================
   10) RENDER
   ========================================================================= */

function render() {
  const ctx = game.ctx;
  if (game.phase === "menu") { drawMenu(ctx); drawMuteButton(ctx); return; }
  const shaking = game.shake > 0.05;
  if (shaking) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground(ctx);
  drawPath(ctx);
  drawSlots(ctx);
  drawTowerRanges(ctx);
  drawCore(ctx);
  drawEnemies(ctx);
  drawProjectiles(ctx);
  drawTowers(ctx);
  drawParticles(ctx);
  if (shaking) ctx.restore();
  drawToolbar(ctx);
  drawStartButton(ctx);
  drawHUD(ctx);
  drawSelectedTowerPanel(ctx);
  drawMessage(ctx);
  drawMuteButton(ctx);
  if (game.phase === "won" || game.phase === "lost") drawSummary(ctx);
}

/* ---- Hub / menu screen ---- */

function shopButtonRects() {
  const out = [];
  const x = 430, w = 330, h = 40, gap = 12;
  let y = 150;
  for (const item of SHOP) { out.push({ item, rect: { x, y, w, h } }); y += h + gap; }
  return out;
}

function drawMenu(ctx) {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
  const gap = 50;
  ctx.beginPath();
  for (let x = gap; x < VIEW.w; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.h); }
  for (let y = gap; y < VIEW.h; y += gap) { ctx.moveTo(0, y); ctx.lineTo(VIEW.w, y); }
  ctx.stroke();

  // Title.
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.fillText("Deckbound", 40, 62);
  ctx.fillStyle = COLOR.muted;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Seat the customers. Eat the food. Don't let dinner get away.", 42, 86);

  // Golden Forks (meta currency).
  ctx.fillStyle = COLOR.essence;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText("✦ Golden Forks: " + META.essence, 42, 122);

  // Your regulars (collection).
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("Your regulars", 42, 156);
  const deck = deckTypes();
  let dx = 46;
  for (const def of deck) {
    ctx.fillStyle = "#1b2230";
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.stroke();
    drawCustomer(ctx, def.id, dx + 32, 199, 11, def.color);
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(fitText(ctx, def.name, 60), dx + 32, 226);
    ctx.fillStyle = COLOR.gold; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("◆" + def.cost, dx + 32, 240);
    ctx.textAlign = "left";
    dx += 72;
  }
  // Locked slot hint if Sniper not yet unlocked.
  if (!META.unlocked.includes("sniper")) {
    ctx.fillStyle = "#151a24";
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.fill();
    ctx.strokeStyle = "#2a3242"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COLOR.muted; ctx.textAlign = "center"; ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("🔒", dx + 32, 205);
    ctx.font = "10px system-ui, sans-serif"; ctx.fillText("locked", dx + 32, 232);
    ctx.textAlign = "left";
  }

  // Shop.
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("Golden Forks shop", 430, 140);
  for (const b of shopButtonRects()) {
    const owned = b.item.owned();
    const affordable = META.essence >= b.item.cost;
    const hover = inRect(game.pointer, b.rect);
    ctx.fillStyle = owned ? "#1a241b" : (hover && affordable ? "#26324a" : "#1b2230");
    roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.fill();
    ctx.strokeStyle = owned ? COLOR.good : (affordable ? "#4a5670" : "#2a3242");
    ctx.lineWidth = 1; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.stroke();
    ctx.fillStyle = COLOR.ink; ctx.font = "13px system-ui, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(b.item.label, b.rect.x + 12, b.rect.y + 25);
    ctx.textAlign = "right";
    if (owned) { ctx.fillStyle = COLOR.good; ctx.fillText("owned ✓", b.rect.x + b.rect.w - 12, b.rect.y + 25); }
    else { ctx.fillStyle = affordable ? COLOR.essence : COLOR.bad; ctx.fillText("✦ " + b.item.cost, b.rect.x + b.rect.w - 12, b.rect.y + 25); }
    ctx.textAlign = "left";
  }

  // Mode toggle (Finite vs Endless).
  const modeHover = inRect(game.pointer, MODE_BTN);
  ctx.fillStyle = modeHover ? "#26324a" : "#1b2230";
  roundRect(ctx, MODE_BTN.x, MODE_BTN.y, MODE_BTN.w, MODE_BTN.h, 8); ctx.fill();
  ctx.strokeStyle = chosenEndless ? COLOR.essence : "#4a5670"; ctx.lineWidth = 1;
  roundRect(ctx, MODE_BTN.x, MODE_BTN.y, MODE_BTN.w, MODE_BTN.h, 8); ctx.stroke();
  ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Mode:  " + (chosenEndless ? "All-you-can-eat ∞" : "Full menu (20)"), VIEW.w / 2, MODE_BTN.y + MODE_BTN.h / 2);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";

  // Play button.
  const hover = inRect(game.pointer, PLAY_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66";
  roundRect(ctx, PLAY_BTN.x, PLAY_BTN.y, PLAY_BTN.w, PLAY_BTN.h, 10); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("▶  Open for Service", VIEW.w / 2, PLAY_BTN.y + PLAY_BTN.h / 2);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

/* ---- In-run drawing ---- */

function drawBackground(ctx) {
  ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
  const gap = 50; ctx.beginPath();
  for (let x = gap; x < VIEW.w; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, TOOLBAR.y); }
  for (let y = gap; y < TOOLBAR.y; y += gap) { ctx.moveTo(0, y); ctx.lineTo(VIEW.w, y); }
  ctx.stroke();
}

function drawPath(ctx) {
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const trace = () => { ctx.beginPath(); ctx.moveTo(PATH[0].x, PATH[0].y); for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y); };
  ctx.strokeStyle = COLOR.pathEdge; ctx.lineWidth = 42; trace(); ctx.stroke();
  ctx.strokeStyle = COLOR.pathFill; ctx.lineWidth = 32; trace(); ctx.stroke();
  ctx.strokeStyle = COLOR.pathCenter; ctx.globalAlpha = 0.35; ctx.lineWidth = 3; trace(); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSlots(ctx) {
  const def = TOWER_BY_ID[game.selectedType];
  for (let i = 0; i < SLOTS.length; i++) {
    if (game.towers.some((t) => t.slotIndex === i)) continue;
    const s = SLOTS[i];
    const hover = distance(game.pointer, s) <= 20;
    const affordable = game.currency >= def.cost;
    ctx.save(); ctx.setLineDash([4, 4]);
    ctx.strokeStyle = hover ? (affordable ? COLOR.good : COLOR.bad) : COLOR.slot;
    ctx.globalAlpha = hover ? 0.9 : 0.5; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    if (hover) { ctx.fillStyle = affordable ? COLOR.good : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(def.name + " " + def.cost, s.x, s.y - 22); }
  }
}

function drawTowerRanges(ctx) {
  for (const t of game.towers) {
    const hover = distance(game.pointer, t) <= t.range;
    ctx.strokeStyle = TOWER_BY_ID[t.typeId].color; ctx.globalAlpha = hover ? 0.18 : 0.05; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// The trash chute (was the Wellspring core): a bin any dish reaching it clatters
// into. The pulsing danger halo + the hurt flash on a leak are kept.
function drawCore(ctx) {
  const hurt = game.coreHurtFlash > 0;
  const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 2);
  const col = hurt ? COLOR.coreHurt : COLOR.core;
  const x = CORE.x, y = CORE.y, R = CORE.radius;
  // Danger halo.
  ctx.strokeStyle = col; ctx.globalAlpha = 0.15 + 0.25 * pulse; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, R + 8 + pulse * 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  // Bin body (a trapezoid, wider at the top).
  const topW = R * 1.6, botW = R * 1.15, topY = y - R * 0.5, botY = y + R * 1.05;
  ctx.fillStyle = hurt ? "#5a2626" : "#2b3346";
  ctx.beginPath(); ctx.moveTo(x - topW / 2, topY); ctx.lineTo(x + topW / 2, topY); ctx.lineTo(x + botW / 2, botY); ctx.lineTo(x - botW / 2, botY); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  // Vertical ridges.
  ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1.5;
  for (const f of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(x + f * topW, topY + 3); ctx.lineTo(x + f * botW, botY - 3); ctx.stroke(); }
  // Lid + handle.
  const lidW = topW * 1.14, lidH = R * 0.32, lidY = topY - R * 0.34;
  ctx.fillStyle = hurt ? COLOR.coreHurt : "#3a465e";
  roundRect(ctx, x - lidW / 2, lidY, lidW, lidH, 3); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; roundRect(ctx, x - lidW / 2, lidY, lidW, lidH, 3); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(x - R * 0.12, lidY - R * 0.2, R * 0.24, R * 0.22);
  // Label.
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("TRASH", x, botY + 15);
}

// Two googly eyes — the panicky-food identity feature.
function drawGooglyEyes(ctx, x, y, er) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(x - er, y, er, 0, Math.PI * 2); ctx.arc(x + er, y, er, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(x - er, y, er, 0, Math.PI * 2); ctx.arc(x + er, y, er, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#0b0e14";
  ctx.beginPath(); ctx.arc(x - er, y + er * 0.3, er * 0.5, 0, Math.PI * 2); ctx.arc(x + er, y + er * 0.3, er * 0.5, 0, Math.PI * 2); ctx.fill();
}

// Each enemy is a runaway dish — cheap shapes + one identity feature, distinct in
// silhouette and color. `hurt` flashes the fill white on a non-lethal hit.
function drawFood(ctx, typeId, x, y, r, color, edge, hurt) {
  ctx.save();
  ctx.lineJoin = "round";
  const fill = hurt ? "#ffffff" : color;
  if (typeId === "mote") {
    // Chicken Nugget — a lumpy golden blob on tiny legs, googly eyes.
    ctx.strokeStyle = edge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - r * 0.35, y + r * 0.65); ctx.lineTo(x - r * 0.35, y + r * 1.15);
    ctx.moveTo(x + r * 0.35, y + r * 0.65); ctx.lineTo(x + r * 0.35, y + r * 1.15); ctx.stroke();
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.arc(x - r * 0.45, y - r * 0.05, r * 0.68, 0, Math.PI * 2);
    ctx.arc(x + r * 0.45, y + r * 0.05, r * 0.62, 0, Math.PI * 2);
    ctx.arc(x, y + r * 0.35, r * 0.6, 0, Math.PI * 2);
    ctx.arc(x, y - r * 0.1, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.85, 0, Math.PI * 2); ctx.stroke();
    if (!hurt) drawGooglyEyes(ctx, x, y - r * 0.15, Math.max(1.4, r * 0.26));
  } else if (typeId === "runner") {
    // The Slider — a small burger side-on (bun / patty / bun) with motion lines.
    const w = r * 2.2, h = r * 1.7;
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x - w * 0.95, y - h * 0.15); ctx.lineTo(x - w * 0.55, y - h * 0.15);
    ctx.moveTo(x - w * 1.0, y + h * 0.2); ctx.lineTo(x - w * 0.5, y + h * 0.2); ctx.stroke();
    ctx.strokeStyle = edge; ctx.lineWidth = 1.5;
    ctx.fillStyle = hurt ? "#fff" : "#dc9a55";  // top bun
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - h * 0.08); ctx.quadraticCurveTo(x, y - h * 0.95, x + w / 2, y - h * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = hurt ? "#fff" : "#5f3416"; ctx.fillRect(x - w / 2, y - h * 0.08, w, h * 0.3);  // patty
    ctx.strokeRect(x - w / 2, y - h * 0.08, w, h * 0.3);
    ctx.fillStyle = hurt ? "#fff" : "#cd8f4a";  // bottom bun
    ctx.beginPath(); ctx.moveTo(x - w / 2, y + h * 0.22); ctx.quadraticCurveTo(x, y + h * 0.6, x + w / 2, y + h * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (typeId === "brute") {
    // Tough Steak — a wide dark slab, grill marks, thick outline (reads as the big one).
    const w = r * 2.1, h = r * 1.45;
    ctx.fillStyle = fill; roundRect(ctx, x - w / 2, y - h / 2, w, h, r * 0.5); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 3; roundRect(ctx, x - w / 2, y - h / 2, w, h, r * 0.5); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 2;
    for (const f of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(x + f * w - h * 0.3, y - h * 0.32); ctx.lineTo(x + f * w + h * 0.3, y + h * 0.32); ctx.stroke(); }
  } else if (typeId === "swarm") {
    // Fry Swarm — a scatter of thin yellow sticks.
    ctx.strokeStyle = edge; ctx.lineWidth = 1;
    ctx.fillStyle = fill;
    const fry = (fx, fy, ang) => { ctx.save(); ctx.translate(fx, fy); ctx.rotate(ang); ctx.fillRect(-r * 0.26, -r * 0.9, r * 0.5, r * 1.9); ctx.strokeRect(-r * 0.26, -r * 0.9, r * 0.5, r * 1.9); ctx.restore(); };
    fry(x - r * 0.5, y, -0.35); fry(x + r * 0.15, y - r * 0.2, 0.18); fry(x + r * 0.55, y + r * 0.15, 0.55); fry(x - r * 0.05, y + r * 0.3, -0.05);
  } else {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}

function drawEnemies(ctx) {
  for (const e of game.enemies) {
    const et = ENEMY_TYPES[e.typeId];
    if (e.slowTimer > 0) { ctx.strokeStyle = COLOR.frostAura; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    drawFood(ctx, e.typeId, e.x, e.y, e.radius, et.color, et.edge, e.hurtFlash > 0);
    if (e.hp < e.maxHp) {
      const w = Math.max(18, e.radius * 2), frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w, 4);
      ctx.fillStyle = COLOR.good; ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w * frac, 4);
    }
  }
}

function drawProjectiles(ctx) {
  for (const p of game.projectiles) { ctx.fillStyle = p.color || COLOR.projectile; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill(); }
}

// A little 4-point sparkle (camera flash / chef's-kiss shine).
function drawSpark4(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.28, y - s * 0.28); ctx.lineTo(x + s, y);
  ctx.lineTo(x + s * 0.28, y + s * 0.28); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.28, y + s * 0.28);
  ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.28, y - s * 0.28); ctx.closePath(); ctx.fill();
}

// A seated diner customer (the tower). Cheap glyph: head + shoulders in the
// customer's color plus one identity feature. Upgrade level adds a napkin/bib
// (Lv2) and a chef's-kiss sparkle (Lv3); `firing` triggers the Photographer flash.
function drawCustomer(ctx, typeId, cx, cy, r, color, opts = {}) {
  const level = opts.level || 1, firing = !!opts.firing;
  const dark = "#0b0e14";
  ctx.save();
  ctx.lineJoin = "round";
  const headR = r * 0.6, headY = cy - r * 0.28, shoulderY = headY + headR * 0.75;
  // Shoulders / body.
  ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + r);
  ctx.quadraticCurveTo(cx - r, shoulderY, cx, shoulderY);
  ctx.quadraticCurveTo(cx + r, shoulderY, cx + r, cy + r);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin / bib on the first upgrade.
  if (level >= 2) {
    ctx.fillStyle = "#f2f6ff";
    ctx.beginPath(); ctx.moveTo(cx - r * 0.55, shoulderY + r * 0.05); ctx.lineTo(cx + r * 0.55, shoulderY + r * 0.05); ctx.lineTo(cx, cy + r * 0.72); ctx.closePath();
    ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.stroke();
  }
  // Head.
  ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const eyeY = headY - headR * 0.05, eyeDx = headR * 0.4, eyeR = Math.max(1, headR * 0.16);
  const drawEyes = () => { ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(cx - eyeDx, eyeY, eyeR, 0, Math.PI * 2); ctx.arc(cx + eyeDx, eyeY, eyeR, 0, Math.PI * 2); ctx.fill(); };
  ctx.strokeStyle = dark; ctx.fillStyle = dark; ctx.lineWidth = 1.4;
  if (typeId === "arrow") {
    // The Regular — eyes + a raised fork.
    drawEyes();
    const fx = cx + r * 0.9, fTop = headY - r * 1.05;
    ctx.strokeStyle = "#dfe6f2"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(fx, fTop + r * 0.45); ctx.lineTo(fx, headY + r * 0.1); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (const dx of [-r * 0.18, 0, r * 0.18]) { ctx.beginPath(); ctx.moveTo(fx + dx, fTop); ctx.lineTo(fx + dx, fTop + r * 0.5); ctx.stroke(); }
  } else if (typeId === "cannon") {
    // Big Appetite — small eyes above a wide open mouth.
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(cx - eyeDx, eyeY - headR * 0.28, eyeR * 0.85, 0, Math.PI * 2); ctx.arc(cx + eyeDx, eyeY - headR * 0.28, eyeR * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a1010"; ctx.beginPath(); ctx.ellipse(cx, headY + headR * 0.38, headR * 0.5, headR * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.stroke();
  } else if (typeId === "frost") {
    // The Photographer — eyes + a camera held up; a flash burst when firing.
    drawEyes();
    const camW = r * 0.95, camH = r * 0.68, camY = headY - r * 0.05;
    ctx.fillStyle = "#20262f"; roundRect(ctx, cx - camW / 2, camY - camH / 2, camW, camH, r * 0.14); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#bfe4ff"; ctx.beginPath(); ctx.arc(cx, camY, camH * 0.3, 0, Math.PI * 2); ctx.fill();
    if (firing) { ctx.fillStyle = "#ffffff"; drawSpark4(ctx, cx + camW * 0.65, camY - camH * 0.75, r * 0.55); }
  } else if (typeId === "sniper") {
    // Chopstick Sensei — glasses glint + chopsticks reaching out.
    ctx.strokeStyle = "#eaf2ff"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx - eyeDx, eyeY, eyeR * 1.6, 0, Math.PI * 2); ctx.arc(cx + eyeDx, eyeY, eyeR * 1.6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - eyeDx + eyeR * 1.6, eyeY); ctx.lineTo(cx + eyeDx - eyeR * 1.6, eyeY); ctx.stroke();
    ctx.strokeStyle = "#caa46a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx + r * 0.4, headY + r * 0.15); ctx.lineTo(cx + r * 1.3, headY - r * 0.55);
    ctx.moveTo(cx + r * 0.4, headY + r * 0.4); ctx.lineTo(cx + r * 1.3, headY - r * 0.2); ctx.stroke();
  } else if (typeId === "zap") {
    // The Kids' Table — a party hat on an excitable little customer.
    drawEyes();
    ctx.fillStyle = "#ff6bd0"; ctx.strokeStyle = dark; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, headY - headR * 2.1); ctx.lineTo(cx - headR * 0.75, headY - headR * 0.7); ctx.lineTo(cx + headR * 0.75, headY - headR * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.arc(cx, headY - headR * 2.1, Math.max(1.3, r * 0.16), 0, Math.PI * 2); ctx.fill();
  }
  // Chef's-kiss shine at max level.
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 0.95, headY - r * 0.95, r * 0.42); }
  ctx.restore();
}

function drawTowers(ctx) {
  for (const t of game.towers) {
    const def = TOWER_BY_ID[t.typeId];
    const idx = t.level - 1, radius = 13 + idx * 2;
    const glowStrength = 0.12 + idx * 0.12 + Math.max(0, t.upgradeFlash);
    ctx.globalAlpha = Math.min(0.6, glowStrength); ctx.fillStyle = def.glow;
    ctx.beginPath(); ctx.arc(t.x, t.y, radius + 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    const justFired = t.cdTimer > t.cooldown - 0.14;
    drawCustomer(ctx, t.typeId, t.x, t.y, radius, def.color, { level: t.level, firing: justFired });
    for (let i = 0; i < t.maxLevel; i++) { ctx.beginPath(); ctx.arc(t.x - 8 + i * 8, t.y - radius - 16, 3, 0, Math.PI * 2); ctx.fillStyle = i < t.level ? COLOR.upgradeSpark : "#39404f"; ctx.fill(); }
    if (distance(game.pointer, t) <= 18 && t.level < t.maxLevel) { ctx.fillStyle = game.currency >= RULES.upgradeCost[t.level] ? COLOR.good : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("next course " + RULES.upgradeCost[t.level], t.x, t.y - radius - 24); }
  }
}

function drawParticles(ctx) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color;
    if (p.type === "ring") { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); }
    else if (p.type === "text") { ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.text, p.x, p.y); ctx.textAlign = "left"; }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function drawToolbar(ctx) {
  ctx.fillStyle = COLOR.panel; ctx.fillRect(0, TOOLBAR.y - 2, VIEW.w, VIEW.h - TOOLBAR.y + 2);
  const deck = deckTypes();
  for (let i = 0; i < deck.length; i++) {
    const def = deck[i], r = cardRect(i);
    const selected = game.selectedType === def.id, affordable = game.currency >= def.cost, hover = inRect(game.pointer, r);
    ctx.fillStyle = selected ? "#26324a" : "#1b2230"; roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
    ctx.lineWidth = selected ? 2 : 1; ctx.strokeStyle = selected ? def.color : (hover ? "#4a5670" : "#2a3242"); roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
    ctx.globalAlpha = affordable ? 1 : 0.4;
    drawCustomer(ctx, def.id, r.x + 15, r.y + r.h / 2, 8, def.color);
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText(fitText(ctx, def.name, r.w - 30), r.x + 28, r.y + 17);
    ctx.fillStyle = affordable ? COLOR.gold : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.fillText("◆" + def.cost, r.x + 28, r.y + 33);
    ctx.globalAlpha = 1;
  }
  const def = TOWER_BY_ID[game.selectedType];
  ctx.fillStyle = COLOR.muted; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "left";
  const cardsEnd = TOOLBAR.startX + deck.length * (TOOLBAR.cardW + TOOLBAR.gap);
  ctx.fillText(def.name + ": " + def.blurb, cardsEnd + 6, TOOLBAR.y + 16);
}

function drawStartButton(ctx) {
  if (game.phase !== "prep") {
    if (game.phase === "wave") { ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("serving — seat/upgrade live", START_BTN.x + START_BTN.w / 2, START_BTN.y + 24); }
    return;
  }
  const hover = inRect(game.pointer, START_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66"; roundRect(ctx, START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 8); ctx.fill();
  const bonus = earlyCallBonusNow();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (bonus > 0) {
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("▶  Call Wave " + (game.waveIndex + 1), START_BTN.x + START_BTN.w / 2 - 22, START_BTN.y + START_BTN.h / 2);
    ctx.fillStyle = COLOR.gold; ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText("+" + bonus, START_BTN.x + START_BTN.w - 32, START_BTN.y + START_BTN.h / 2);
  } else {
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("▶  Send Wave " + (game.waveIndex + 1), START_BTN.x + START_BTN.w / 2, START_BTN.y + START_BTN.h / 2);
  }
  ctx.textBaseline = "alphabetic";
}

// Geometry for the selected-tower panel (targeting modes + upgrade). Shared by
// the click handler and the renderer so hit-testing matches what's drawn.
function towerPanel(t) {
  const W = 184, H = 80;
  const x = Math.max(6, Math.min(VIEW.w - W - 6, t.x - W / 2));
  let y = t.y + 24;
  if (y + H > TOOLBAR.y - 4) y = t.y - 24 - H;      // flip above the tower if it'd cover the toolbar
  y = Math.max(6, Math.min(TOOLBAR.y - H - 6, y));
  const rect = { x, y, w: W, h: H };
  const bw = 41, bh = 20, gap = 4, by = y + 28;
  const modes = TARGETING_MODES.map(([mode, label], i) => ({
    mode, label, rect: { x: x + 6 + i * (bw + gap), y: by, w: bw, h: bh },
  }));
  const upgrade = { rect: { x: x + 6, y: y + 54, w: W - 12, h: 20 } };
  return { rect, modes, upgrade };
}

function drawSelectedTowerPanel(ctx) {
  const t = game.selectedTower;
  if (!t || game.phase === "menu") return;
  const def = TOWER_BY_ID[t.typeId];
  const p = towerPanel(t);
  // Highlight ring on the selected tower.
  ctx.strokeStyle = COLOR.core; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(t.x, t.y, 22, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // Panel background.
  ctx.fillStyle = "rgba(14,18,28,0.96)"; roundRect(ctx, p.rect.x, p.rect.y, p.rect.w, p.rect.h, 8); ctx.fill();
  ctx.strokeStyle = def.color; ctx.lineWidth = 1; roundRect(ctx, p.rect.x, p.rect.y, p.rect.w, p.rect.h, 8); ctx.stroke();
  // Header.
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(def.name + "  ·  " + COURSE_NAMES[t.level - 1], p.rect.x + 8, p.rect.y + 17);
  ctx.textAlign = "left";
  // Targeting mode buttons.
  const cur = t.targeting || "first";
  for (const b of p.modes) {
    const on = cur === b.mode;
    ctx.fillStyle = on ? "#26324a" : "#1b2230"; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 5); ctx.fill();
    ctx.strokeStyle = on ? def.color : "#2a3242"; ctx.lineWidth = on ? 1.5 : 1; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 5); ctx.stroke();
    ctx.fillStyle = on ? COLOR.ink : COLOR.muted; ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 0.5);
  }
  // Upgrade button.
  const canUp = t.level < t.maxLevel;
  const cost = canUp ? RULES.upgradeCost[t.level] : 0;
  const afford = canUp && game.currency >= cost;
  const u = p.upgrade.rect;
  ctx.fillStyle = canUp ? (afford ? "#16281c" : "#2a1f26") : "#1b2230"; roundRect(ctx, u.x, u.y, u.w, u.h, 5); ctx.fill();
  ctx.strokeStyle = canUp ? (afford ? COLOR.good : COLOR.bad) : "#2a3242"; ctx.lineWidth = 1; roundRect(ctx, u.x, u.y, u.w, u.h, 5); ctx.stroke();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(canUp ? "Serve next course  ◆" + cost : "Dessert (max)", u.x + u.w / 2, u.y + u.h / 2 + 0.5);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

// A star-rating glyph for the restaurant's Health Rating (was a shield/heart).
function drawRatingIcon(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 8 : 3.4;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.4; ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.restore();
}
// A tip coin for the in-run currency (Tips, $).
function drawCurrencyIcon(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#8a6a12"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#6f5410"; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("$", 0, 1);
  ctx.restore();
}

function drawHUD(ctx) {
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const lowLives = game.lives > 0 && game.lives <= game.maxLives * 0.25;
  const pulse = lowLives ? 0.5 + 0.5 * Math.sin(game.elapsed * 9) : 0;
  ctx.fillStyle = lowLives ? `rgba(255,${60 - Math.round(30 * pulse)},${60 - Math.round(30 * pulse)},0.4)` : "rgba(0,0,0,0.4)";
  ctx.fillRect(6, 6, game.endless ? 408 : 320, 26);
  ctx.font = "bold 14px system-ui, sans-serif";
  drawRatingIcon(ctx, 14, 17, lowLives && pulse > 0.5 ? "#ffffff" : COLOR.bad);
  ctx.fillStyle = lowLives && pulse > 0.5 ? "#ffffff" : COLOR.bad; ctx.fillText("" + game.lives, 26, 11);
  drawCurrencyIcon(ctx, 76, 17, COLOR.gold);
  ctx.fillStyle = COLOR.gold; ctx.fillText("" + game.currency, 88, 11);
  ctx.fillStyle = COLOR.ink;
  const waveLabel = game.endless ? "Wave " + (game.waveIndex + 1) : "Wave " + Math.min(game.waveIndex + 1, WAVES.length) + "/" + WAVES.length;
  ctx.fillText(waveLabel, 160, 11);
  if (game.endless) { ctx.fillStyle = COLOR.essence; ctx.fillText("★ " + game.score, 250, 11); }
  ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(game.phase === "wave" ? "serving…" : "prep", game.endless ? 348 : 262, 12);
  ctx.textBaseline = "alphabetic";
}

function drawMessage(ctx) {
  if (game.messageTimer <= 0 || game.phase === "won" || game.phase === "lost") return;
  ctx.globalAlpha = Math.min(1, game.messageTimer); ctx.fillStyle = COLOR.ink; ctx.font = "13px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(game.message, VIEW.w / 2, 52); ctx.globalAlpha = 1;
}

function drawSummary(ctx) {
  ctx.fillStyle = "rgba(8,10,15,0.82)"; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.textAlign = "center";
  const r = game.lastRun || { won: false, wave: 1, killed: 0, essence: 0, endless: false, score: 0 };
  const endless = !!r.endless;
  ctx.fillStyle = r.won ? COLOR.good : COLOR.bad; ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText(r.won ? "SERVICE COMPLETE" : (endless ? "CLOSING TIME" : "SHUT DOWN"), VIEW.w / 2, VIEW.h / 2 - 58);
  ctx.fillStyle = COLOR.ink; ctx.font = "15px system-ui, sans-serif";
  const sub = r.won ? "You served all " + WAVES.length + " waves without a shutdown."
    : endless ? "All-you-can-eat — you served " + r.wave + " waves."
    : "The health inspector shut you down at wave " + r.wave + " of " + WAVES.length + ".";
  ctx.fillText(sub, VIEW.w / 2, VIEW.h / 2 - 30);
  ctx.fillText("Dishes eaten: " + r.killed, VIEW.w / 2, VIEW.h / 2 - 8);
  if (endless) { ctx.fillStyle = COLOR.essence; ctx.font = "bold 17px system-ui, sans-serif"; ctx.fillText("★ Score: " + (r.score || 0), VIEW.w / 2, VIEW.h / 2 + 15); }
  ctx.fillStyle = COLOR.essence; ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText("✦ +" + r.essence + " Golden Forks earned", VIEW.w / 2, VIEW.h / 2 + (endless ? 36 : 30));
  const hover = inRect(game.pointer, CONTINUE_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66"; roundRect(ctx, CONTINUE_BTN.x, CONTINUE_BTN.y, CONTINUE_BTN.w, CONTINUE_BTN.h, 8); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif"; ctx.textBaseline = "middle";
  ctx.fillText("Continue →", VIEW.w / 2, CONTINUE_BTN.y + CONTINUE_BTN.h / 2); ctx.textBaseline = "alphabetic";
}

function drawMuteButton(ctx) {
  const x = VIEW.w - 44, y = 12;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y, 32, 32);
  ctx.fillStyle = audio.muted ? COLOR.muted : COLOR.core;
  ctx.beginPath(); ctx.moveTo(x + 9, y + 13); ctx.lineTo(x + 14, y + 13); ctx.lineTo(x + 19, y + 9); ctx.lineTo(x + 19, y + 23); ctx.lineTo(x + 14, y + 19); ctx.lineTo(x + 9, y + 19); ctx.closePath(); ctx.fill();
  if (audio.muted) { ctx.strokeStyle = COLOR.coreHurt; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 22, y + 11); ctx.lineTo(x + 28, y + 21); ctx.moveTo(x + 28, y + 11); ctx.lineTo(x + 22, y + 21); ctx.stroke(); }
  else { ctx.strokeStyle = COLOR.core; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 21, y + 16, 4, -0.6, 0.6); ctx.arc(x + 21, y + 16, 8, -0.6, 0.6); ctx.stroke(); }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Trim a label with an ellipsis so it fits maxWidth on the tiny cards (the
// themed customer names are longer than the old Arrow/Cannon ones). Set the
// font before calling. Full names still show in the toolbar blurb + in-run panel.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
  return s + "…";
}
