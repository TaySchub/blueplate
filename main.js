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
  mote:   { color: "#dca85c", edge: "#8a5a22", radius: 12 },  // Hot Dog — golden bun
  runner: { color: "#e3a95c", edge: "#7c4a1e", radius: 9 },   // The Slider — burger (golden bun)
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
  { id: "sniper", label: "Reserve the Milkshake Slurper's seat", cost: 3, owned: () => META.unlocked.includes("sniper"), buy: () => META.unlocked.push("sniper") },
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

  // ---- low-level helpers -------------------------------------------------
  // A soft-attack / smooth-release gain envelope. The whole "robotic" problem
  // is mostly hard digital clicks — a gain that jumps to full volume or snaps
  // to zero at frame boundaries. Ramping up over a few ms and decaying with
  // setTargetAtTime (an exponential glide, never a hard stop) removes that.
  env(g, peak, t0, attack = 0.008, release = 0.16, sustain = null) {
    const hold = sustain != null ? sustain : peak;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    if (sustain != null) g.gain.linearRampToValueAtTime(hold, t0 + attack + 0.02);
    g.gain.setTargetAtTime(0.0001, t0 + attack, release);
  },
  // One "voice": 1–3 gently-detuned oscillators through a shared lowpass
  // filter and an enveloped gain, optionally with vibrato and a filter sweep.
  // Detuning a couple of layers a few cents/Hz apart is what makes a tone
  // sound like a played instrument instead of a bare test-tone beep.
  voice(freq, opts = {}) {
    if (!this.ready || this.muted || !this.ctx) return;
    const {
      type = "sine", dur = 0.18, gain = 0.18, freqTo = null,
      detunes = [0], attack = 0.008, release = 0.15,
      filterFreq = null, filterFreqTo = null, filterQ = 0.7,
      vibratoHz = 0, vibratoCents = 0, pan = null,
    } = opts;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const g = ctx.createGain();
    let node = g;
    if (filterFreq != null) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.Q.value = filterQ;
      f.frequency.setValueAtTime(filterFreq, t0);
      if (filterFreqTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreqTo), t0 + dur);
      g.connect(f);
      node = f;
    }
    let out = node;
    if (pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      out = p;
    }
    out.connect(ctx.destination);

    let lfo = null, lfoGain = null;
    if (vibratoHz > 0 && vibratoCents > 0) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = vibratoHz;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = freq * (Math.pow(2, vibratoCents / 1200) - 1); // cents -> Hz swing
      lfo.connect(lfoGain);
      lfo.start(t0);
      lfo.stop(t0 + dur + release);
    }

    const oscs = detunes.map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      const f = freq * Math.pow(2, cents / 1200);
      osc.frequency.setValueAtTime(f, t0);
      if (freqTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo * Math.pow(2, cents / 1200)), t0 + dur);
      if (lfoGain) lfoGain.connect(osc.frequency);
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + dur + release);
      return osc;
    });

    this.env(g, gain, t0, attack, release);
    if (lfo) lfo.onended = () => { lfoGain.disconnect(); };
    oscs[oscs.length - 1].onended = () => { g.disconnect(); };
    return { osc: oscs[0], gain: g };
  },
  // Back-compat-ish simple tone, now routed through voice() so every caller
  // gets the soft envelope + click-free release for free.
  tone(freq, dur, type = "sine", gain = 0.2, freqTo = null, extra = {}) {
    return this.voice(freq, { type, dur, gain, freqTo, ...extra });
  },
  // Filtered noise: white noise through a resonant bandpass/lowpass instead
  // of raw broadband hiss. That's what turns a "static burst" into an organic
  // chomp/crunch/clatter transient — the filter picks out a body/formant the
  // way a real bite or clatter would have, rather than sounding like a radio.
  noiseBurst(dur, gain = 0.25, opts = {}) {
    if (!this.ready || this.muted || !this.ctx) return;
    const { filterType = "bandpass", freq = 1400, freqTo = null, q = 1.0, attack = 0.004, release = null } = opts;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Slightly biased noise generation (average of two randoms) is softer/
    // less "hissy" than pure uniform white noise — a cheap warmth trick.
    for (let i = 0; i < frames; i++) {
      const n = (Math.random() + Math.random() - 1);
      data[i] = n * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType; filt.Q.value = q;
    filt.frequency.setValueAtTime(freq, t0);
    if (freqTo != null) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t0 + dur);
    const g = ctx.createGain();
    this.env(g, gain, t0, attack, release != null ? release : Math.max(0.03, dur * 0.5));
    src.connect(filt).connect(g).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.2);
  },

  // ---- effects ------------------------------------------------------------
  // Attack = a bite/chomp, one flavor per customer (kept distinct + randomized so
  // a stream never feels repetitive). Warm, filtered, layered voices stand in for
  // the old bare oscillators; filtered noise stands in for raw white noise.
  shoot(typeId) {
    if (!this.ready || this.muted || !this.ctx) return;
    const r = 1 + (Math.random() * 0.14 - 0.07); // ±7% pitch wobble
    switch (typeId) {
      case "cannon": // Big Appetite — deep, round inhaling gulp
        this.voice(190 * r, { type: "sine", detunes: [-6, 0, 7], dur: 0.2, gain: 0.16, freqTo: 65, attack: 0.01, release: 0.16, filterFreq: 900, filterFreqTo: 220 });
        this.noiseBurst(0.12, 0.09, { filterType: "lowpass", freq: 700, freqTo: 220, q: 0.6 });
        break;
      case "frost": // The Photographer — soft shutter click + cold nibble
        this.noiseBurst(0.035, 0.07, { filterType: "bandpass", freq: 2600, q: 2.2, attack: 0.002, release: 0.03 });
        this.voice(880 * r, { type: "triangle", detunes: [0, 9], dur: 0.07, gain: 0.05, freqTo: 1200, filterFreq: 3200, release: 0.06 });
        break;
      case "sniper": // Chopstick Sensei — crisp, woody pluck/snap
        this.voice(520 * r, { type: "triangle", detunes: [-4, 4], dur: 0.1, gain: 0.08, freqTo: 220, attack: 0.004, release: 0.08, filterFreq: 2200, filterFreqTo: 900 });
        this.noiseBurst(0.02, 0.04, { filterType: "bandpass", freq: 3000, q: 1.5, attack: 0.001, release: 0.02 });
        break;
      case "zap": // The Kids' Table — tiny, quick, friendly nibble
        this.voice(680 * r, { type: "triangle", detunes: [0, 10], dur: 0.05, gain: 0.045, freqTo: 380, attack: 0.003, release: 0.05, filterFreq: 2600 });
        break;
      default: // The Regular — steady fork-stab bite
        this.voice(340 * r, { type: "triangle", detunes: [-5, 0, 5], dur: 0.1, gain: 0.07, freqTo: 150, attack: 0.005, release: 0.09, filterFreq: 1800, filterFreqTo: 700 });
        this.noiseBurst(0.05, 0.05, { filterType: "bandpass", freq: 1600, q: 1.2, release: 0.04 });
    }
  },
  hit() { // light fork *tink* on a non-lethal bite — soft triangle, gently filtered
    this.voice(520 + Math.random() * 140, { type: "triangle", detunes: [0, 6], dur: 0.05, gain: 0.03, attack: 0.003, release: 0.05, filterFreq: 2800 });
  },
  kill() { // a satisfying crunch + gulp as a dish is eaten
    const start = 320 + Math.random() * 150;
    this.voice(start, { type: "sawtooth", detunes: [-7, 0, 7], dur: 0.2, gain: 0.11, freqTo: 75, attack: 0.006, release: 0.14, filterFreq: 1600, filterFreqTo: 350 }); // swallow-down gulp, de-buzzed by the filter
    this.noiseBurst(0.16, 0.16, { filterType: "lowpass", freq: 1800, freqTo: 500, q: 0.7, attack: 0.003, release: 0.12 }); // crunch
    setTimeout(() => this.voice(108, { type: "sine", detunes: [0, 5], dur: 0.14, gain: 0.1, freqTo: 58, attack: 0.01, release: 0.14 }), 55); // low "gulp" tail
  },
  // A dish clatters into the trash + a sad little descending trombone — a wasted meal.
  leak() {
    this.noiseBurst(0.13, 0.13, { filterType: "bandpass", freq: 1200, freqTo: 600, q: 1.1, attack: 0.003, release: 0.1 }); // clatter
    [330, 262, 208, 165].forEach((f, i) => setTimeout(() => this.voice(f, {
      type: "sawtooth", detunes: [-6, 0, 6], dur: 0.2, gain: 0.1, freqTo: f * 0.94,
      attack: 0.015, release: 0.16, filterFreq: 1100, filterFreqTo: 500, vibratoHz: 5, vibratoCents: 12,
    }), i * 95));
  },
  upgrade() { // "Order up!" — a bright but rounded diner service-bell ding-ding
    const ding = () => {
      this.voice(1320, { type: "sine", detunes: [0, 3], dur: 0.55, gain: 0.12, attack: 0.004, release: 0.42, filterFreq: 5200 });
      this.voice(1980, { type: "sine", dur: 0.4, gain: 0.045, attack: 0.004, release: 0.3, filterFreq: 6000 });
    };
    ding(); setTimeout(ding, 140);
  },
  build() { this.voice(300, { type: "triangle", detunes: [0, 6], dur: 0.1, gain: 0.13, freqTo: 460, attack: 0.006, release: 0.09, filterFreq: 2200 }); },
  deny() { this.voice(180, { type: "sawtooth", detunes: [0, 5], dur: 0.13, gain: 0.09, freqTo: 120, attack: 0.005, release: 0.1, filterFreq: 900 }); },
  waveStart() { this.voice(330, { type: "triangle", detunes: [-4, 0, 4], dur: 0.18, gain: 0.13, freqTo: 500, attack: 0.008, release: 0.14, filterFreq: 2600 }); },
  buy() {
    this.voice(520, { type: "sine", detunes: [0, 4], dur: 0.11, gain: 0.13, freqTo: 780, attack: 0.006, release: 0.1, filterFreq: 3400 });
    setTimeout(() => this.voice(780, { type: "sine", detunes: [0, 4], dur: 0.13, gain: 0.13, attack: 0.006, release: 0.12, filterFreq: 3800 }), 90);
  },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.voice(f, { type: "triangle", detunes: [-4, 0, 4], dur: 0.28, gain: 0.15, attack: 0.008, release: 0.22, filterFreq: 3600, vibratoHz: 5.5, vibratoCents: 6 }), i * 130)); },
  lose() { [400, 300, 220, 150].forEach((f, i) => setTimeout(() => this.voice(f, { type: "sawtooth", detunes: [-6, 0, 6], dur: 0.32, gain: 0.13, attack: 0.01, release: 0.24, filterFreq: 1400, filterFreqTo: 500 }), i * 150)); },
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
    freezeDur: def.freezeDur || 0, maxTargets: def.maxTargets || 1,
    cdTimer: 0, upgradeFlash: 0, targeting: "first",
    lungeTimer: 0, lungeAngle: 0,   // brief lunge-toward-target on attack (drawTowers)
    slurpTarget: null, slurpShow: 0, slurpSoundTimer: 0,   // Milkshake Slurper's attached straw
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
  if (up.freezeDurAdd) t.freezeDur += up.freezeDurAdd;
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
    game.enemies.push({ typeId, dist: 0, speed: game.waveSpeed * et.speedMul, hp, maxHp: hp, radius: et.radius, reward: et.reward, hurtFlash: 0, slowTimer: 0, slowFactor: 1, freezeTimer: 0 });
  }
}

function moveEnemies(step) {
  for (const e of game.enemies) {
    let speed = e.speed;
    // Frozen dishes are stopped dead; once thawed the slow lingers for the rest of slowTimer.
    if (e.freezeTimer > 0) { e.freezeTimer -= step; speed = 0; }
    else if (e.slowTimer > 0) { speed *= e.slowFactor; }
    if (e.slowTimer > 0) { e.slowTimer -= step; if (e.slowTimer <= 0) e.slowFactor = 1; }
    e.dist += speed * step;
    const p = pointAtDistance(e.dist);
    e.x = p.x; e.y = p.y;
    if (e.hurtFlash > 0) e.hurtFlash -= step;
    if (e.dist >= PATH_LENGTH) { e.reachedCore = true; game.lives = Math.max(0, game.lives - 1); game.coreHurtFlash = 0.35; game.shake = 6; audio.leak(); }
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
    if (t.lungeTimer > 0) t.lungeTimer -= step;
    if (t.slurpShow > 0) t.slurpShow -= step;
    if (t.slurpSoundTimer > 0) t.slurpSoundTimer -= step;
    t.cdTimer -= step;
    // The Milkshake Slurper locks its straw onto one dish and keeps sipping fast
    // until that dish dies or leaves range — then it latches onto the next.
    if (t.typeId === "sniper") {
      if (!t.slurpTarget || !game.enemies.includes(t.slurpTarget) || distance(t, t.slurpTarget) > t.range) t.slurpTarget = pickTarget(t);
      if (t.slurpTarget) {
        t.slurpShow = 0.12;   // keep the straw drawn between sips
        if (t.cdTimer <= 0) {
          fireProjectile(t, t.slurpTarget); t.cdTimer = t.cooldown;
          if (t.slurpSoundTimer <= 0) { audio.shoot("sniper"); t.slurpSoundTimer = 0.32; }   // throttle the sip sound
        }
      }
      continue;
    }
    if (t.cdTimer > 0) continue;
    if (TOWER_BY_ID[t.typeId].behavior === "multi") {
      // The Kids' Table sends `maxTargets` hands. They spread across the frontmost
      // dishes; if fewer dishes than hands are in range, the spare hands pile onto
      // the same dish (so one dish alone gets grabbed by all three kids).
      const inRange = game.enemies.filter((e) => distance(t, e) <= t.range).sort((a, b) => b.dist - a.dist);
      if (inRange.length) {
        for (let i = 0; i < t.maxTargets; i++) fireProjectile(t, inRange[i % inRange.length]);
        t.cdTimer = t.cooldown;
      }
    } else {
      const target = pickTarget(t);
      if (target) { fireProjectile(t, target); t.cdTimer = t.cooldown; }
    }
  }
}

const LUNGE_DUR = 0.24;   // seconds a tower spends lunging toward its target on attack

function fireProjectile(t, target) {
  const def = TOWER_BY_ID[t.typeId];
  // Big Appetite doesn't throw anything — he bites the dish right where it sits on
  // the belt: instant damage + a big toothy CHOMP over the target.
  if (t.typeId === "cannon") {
    const tx = target.x, ty = target.y;
    t.lungeTimer = LUNGE_DUR; t.lungeAngle = Math.atan2(ty - t.y, tx - t.x);   // lunge in; his mouth does the chomp
    applyDamage(target, t.damage);
    spawnBite(tx, ty, "#c98a45");   // crumb spray at the dish
    audio.shoot(t.typeId);
    return;
  }
  // The Kids' Table grabs the dish right on the belt — a hand clenches on it.
  if (t.typeId === "zap") {
    applyDamage(target, t.damage);
    spawnGrabHand(target.x, target.y, target.radius);
    audio.shoot(t.typeId);
    return;
  }
  // The Milkshake Slurper sips instantly up an attached straw (drawn by
  // drawSlurpStraws); the sip sound is throttled in updateTowers.
  if (t.typeId === "sniper") {
    applyDamage(target, t.damage);
    return;
  }
  game.projectiles.push({
    x: t.x, y: t.y, x0: t.x, y0: t.y, typeId: t.typeId, target,
    speed: def.behavior === "single" && t.typeId === "sniper" ? 520 : 360,
    damage: t.damage, radius: t.typeId === "cannon" ? 6 : 4, behavior: def.behavior, color: def.color,
    splash: t.splash, slowDur: t.slowDur, slowFactor: t.slowFactor, freezeDur: t.freezeDur,
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
  } else if (p.behavior === "freeze") {
    // The Photographer's flash freezes the dish solid, then it thaws into a slow.
    applyDamage(p.target, p.damage);
    if (game.enemies.includes(p.target)) {
      p.target.freezeTimer = Math.max(p.target.freezeTimer, p.freezeDur);
      p.target.slowTimer = Math.max(p.target.slowTimer, p.freezeDur + p.slowDur);
      p.target.slowFactor = Math.min(p.target.slowFactor, p.slowFactor);
      spawnFreeze(hx, hy, p.target.radius);
    }
  } else if (p.behavior === "slow") {
    applyDamage(p.target, p.damage);
    if (game.enemies.includes(p.target)) { p.target.slowTimer = p.slowDur; p.target.slowFactor = Math.min(p.target.slowFactor, p.slowFactor); }
  } else {
    applyDamage(p.target, p.damage);
    if (p.typeId === "cannon") spawnBite(hx, hy, p.color);   // Big Appetite's heavy single bite
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
// A big single CHOMP for Big Appetite — a bright bite flash + heavy ring + a
// chunky crumb spray, so the bite really reads.
function spawnBite(x, y, color) {
  spawnRing(x, y, "#fff2d0", 22, 0.16);   // quick bright flash
  spawnRing(x, y, "#ffe1b0", 40, 0.3);    // wider bite ring
  const crumbs = ["#e8c58a", "#c98a45", color];
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 150;
    game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2.4 + Math.random() * 2.6, life: 0.34 + Math.random() * 0.3, maxLife: 0.64, color: crumbs[i % crumbs.length] });
  }
}
// A little kid hand that reaches in from a random side and clenches on a dish
// (small grab-bite). Several can pile onto one dish when it's the only one in range.
function spawnGrabHand(x, y, r) {
  game.particles.push({ type: "grab", x, y, r, angle: Math.random() * Math.PI * 2, life: 0.22, maxLife: 0.22 });
  game.particles.push({ type: "spark", x, y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, r: 1.4, life: 0.2, maxLife: 0.2, color: "#e8c58a" });
}
// The camera flash snap that freezes a dish into a pose: a bright white pop + a
// quick expanding "photo" ring + a few white sparkles (no ice).
function spawnFreeze(x, y, r) {
  spawnRing(x, y, "#ffffff", r + 18, 0.14);
  spawnRing(x, y, "#eaf6ff", r + 9, 0.3);
  for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 60; game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.4 + Math.random() * 1.6, life: 0.22 + Math.random() * 0.18, maxLife: 0.4, color: "#ffffff" }); }
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
  drawKitchenDoor(ctx);
  drawSlots(ctx);
  drawTowerRanges(ctx);
  drawCore(ctx);
  drawEnemies(ctx);
  drawProjectiles(ctx);
  drawSlurpStraws(ctx);
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
  // American-diner floor: a low-contrast checkerboard so the belt, customers, and
  // food stay the things that pop.
  ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  const tile = 45;
  ctx.fillStyle = "#141a24";
  for (let gy = 0; gy < TOOLBAR.y; gy += tile)
    for (let gx = 0; gx < VIEW.w; gx += tile)
      if (((gx / tile) + (gy / tile)) & 1) ctx.fillRect(gx, gy, tile, tile);
  // A booth/table pad under each seat — set dressing behind the seated customers.
  for (const s of SLOTS) {
    ctx.fillStyle = "#1b222d"; roundRect(ctx, s.x - 21, s.y - 15, 42, 30, 7); ctx.fill();
    ctx.strokeStyle = "#262f3d"; ctx.lineWidth = 1.5; roundRect(ctx, s.x - 21, s.y - 15, 42, 30, 7); ctx.stroke();
  }
}

// The conveyor belt the food rides from the kitchen to the trash chute. Metal
// rails + a belt surface, with slats that animate toward the chute (the
// fixed-timestep loop drives the offset off game.elapsed).
function drawPath(ctx) {
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const trace = () => { ctx.beginPath(); ctx.moveTo(PATH[0].x, PATH[0].y); for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y); };
  ctx.strokeStyle = "#0e1118"; ctx.lineWidth = 46; trace(); ctx.stroke();  // rail shadow
  ctx.strokeStyle = "#333c4b"; ctx.lineWidth = 40; trace(); ctx.stroke();  // rail metal
  ctx.strokeStyle = "#232a35"; ctx.lineWidth = 34; trace(); ctx.stroke();  // belt surface
  // Moving slats across the belt, marching toward the chute.
  const spacing = 26, half = 15;
  const offset = (game.elapsed * 42) % spacing;
  ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 4; ctx.lineCap = "butt";
  let acc = 0;
  for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
    const A = PATH[i], B = PATH[i + 1], len = SEGMENT_LENGTHS[i];
    if (len === 0) continue;
    const dx = (B.x - A.x) / len, dy = (B.y - A.y) / len, px = -dy, py = dx;
    const k0 = Math.ceil((acc - offset) / spacing);
    for (let s = offset + k0 * spacing; s < acc + len; s += spacing) {
      const d = s - acc, cx = A.x + dx * d, cy = A.y + dy * d;
      ctx.beginPath(); ctx.moveTo(cx - px * half, cy - py * half); ctx.lineTo(cx + px * half, cy + py * half); ctx.stroke();
    }
    acc += len;
  }
  ctx.lineCap = "round";
}

// The kitchen the dishes escape from — a doorway with swinging half-doors at the
// belt's spawn (left edge); the belt emerges from its dark mouth.
function drawKitchenDoor(ctx) {
  const y = PATH[0].y, doorW = 40, gap = 18;
  const top = y - 40, bot = y + 40;
  ctx.fillStyle = "#0b0e14"; ctx.fillRect(0, top, doorW, bot - top);          // dark interior
  ctx.fillStyle = "#2c3543"; ctx.strokeStyle = "#3f4a5c"; ctx.lineWidth = 1;   // swinging half-doors
  ctx.fillRect(2, top + 2, doorW - 4, (y - gap) - (top + 2)); ctx.strokeRect(2, top + 2, doorW - 4, (y - gap) - (top + 2));
  ctx.fillRect(2, y + gap, doorW - 4, (bot - 2) - (y + gap)); ctx.strokeRect(2, y + gap, doorW - 4, (bot - 2) - (y + gap));
  ctx.strokeStyle = "#4a5568"; ctx.lineWidth = 3;                              // door frame (right jamb + lintel + sill)
  ctx.beginPath(); ctx.moveTo(doorW, top); ctx.lineTo(doorW, bot); ctx.moveTo(0, top); ctx.lineTo(doorW, top); ctx.moveTo(0, bot); ctx.lineTo(doorW, bot); ctx.stroke();
  ctx.fillStyle = "#8b94a7"; ctx.font = "bold 8px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("KITCHEN", doorW / 2, bot + 8);
  ctx.textBaseline = "alphabetic";
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
// Where the (single) bite lands on each food, in units of r — chosen to sit on the
// actual body (not the legs/edges). The Fry Swarm eats its fries instead, so it's absent.
const BITE_SPOTS = {
  mote:   [0.74, -0.36],   // top of the bun
  runner: [0.5, -0.4],     // top-right bun
  brute:  [0.6, -0.44],    // upper corner of the slab
};
// One bite eaten out of a dish, at a fixed per-food spot; it grows into a bigger
// chunk as HP drops (same corner, larger portion) rather than adding new bites.
// A bright cut-edge highlight keeps it readable even on dark foods.
function drawFoodBites(ctx, typeId, x, y, r, n, edge) {
  const [ux, uy] = BITE_SPOTS[typeId] || [0.66, -0.42];
  const bx = x + ux * r, by = y + uy * r, br = r * (0.3 + 0.2 * (n - 1));   // grows with n
  ctx.save();
  ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000";   // punch a clean round bite
  ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
  ctx.restore();
  const ca = Math.atan2(y - by, x - bx);   // arc facing the food's centre = the exposed cut edge
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath(); ctx.arc(bx, by, br + 0.4, ca - 1.15, ca + 1.15); ctx.stroke();
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.8, r * 0.06);
  ctx.beginPath(); ctx.arc(bx, by, br, ca - 1.3, ca + 1.3); ctx.stroke();
}

function drawFood(ctx, typeId, x, y, r, color, edge, hurt, bites = 0) {
  ctx.save();
  ctx.lineJoin = "round";
  const fill = hurt ? "#ffffff" : color;
  if (typeId === "mote") {
    // Hot Dog — a frankfurter in a bun with a mustard zigzag, on tiny running legs.
    const w = r * 1.22, h = r * 0.6;   // half-extents of the bun
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.92, w * 0.95, r * 0.16, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.3, r * 0.15);   // little legs
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + h * 0.7); ctx.lineTo(x - r * 0.58, y + r * 0.9);
    ctx.moveTo(x + r * 0.5, y + h * 0.7); ctx.lineTo(x + r * 0.58, y + r * 0.9); ctx.stroke();
    ctx.fillStyle = edge; ctx.beginPath();                                                     // feet
    ctx.ellipse(x - r * 0.66, y + r * 0.94, r * 0.2, r * 0.1, 0.2, 0, 7); ctx.ellipse(x + r * 0.66, y + r * 0.94, r * 0.2, r * 0.1, -0.2, 0, 7); ctx.fill();
    if (hurt) { ctx.fillStyle = "#fff"; roundRect(ctx, x - w, y - h, w * 2, h * 2, h); ctx.fill(); }
    else {
      // Bun.
      ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.4, r * 0.16);
      roundRect(ctx, x - w, y - h, w * 2, h * 2, h); ctx.fill(); ctx.stroke();
      ctx.save(); roundRect(ctx, x - w, y - h, w * 2, h * 2, h); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(x, y - h * 0.5, w * 0.82, h * 0.35, 0, 0, 7); ctx.fill();   // bun sheen
      ctx.restore();
      // Sausage nestled in the bun.
      const sw = w * 0.9, sh = h * 0.58, sy = y - h * 0.24;
      const sg = ctx.createLinearGradient(x, sy - sh, x, sy + sh);
      sg.addColorStop(0, "#c9633a"); sg.addColorStop(1, "#8f3b1f");
      ctx.fillStyle = sg; ctx.strokeStyle = "#6e2c14"; ctx.lineWidth = Math.max(1.1, r * 0.1);
      roundRect(ctx, x - sw, sy - sh, sw * 2, sh * 2, sh); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = Math.max(0.9, r * 0.07); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - sw * 0.68, sy - sh * 0.45); ctx.lineTo(x + sw * 0.68, sy - sh * 0.45); ctx.stroke();   // sausage sheen
      // Mustard zigzag.
      ctx.strokeStyle = "#f4c531"; ctx.lineWidth = Math.max(1.2, r * 0.13); ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      const zx0 = x - sw * 0.78, zx1 = x + sw * 0.78, zn = 5;
      for (let i = 0; i <= zn; i++) { const zx = zx0 + (zx1 - zx0) * (i / zn), zy = sy - sh * 0.02 + (i % 2 ? -sh * 0.4 : sh * 0.2); if (i === 0) ctx.moveTo(zx, zy); else ctx.lineTo(zx, zy); }
      ctx.stroke();
    }
  } else if (typeId === "runner") {
    // The Slider — a sleek side-on mini-burger (sesame dome / patty / cheese / bun)
    // leaning into motion, with speed lines behind it (it *slides*, fast and frail).
    const bw = r * 1.05;   // half bun width
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, bw * 1.0, r * 0.16, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.1, r * 0.13);   // speed lines behind
    ctx.beginPath();
    ctx.moveTo(x - bw * 1.35, y - r * 0.3); ctx.lineTo(x - bw * 2.15, y - r * 0.3);
    ctx.moveTo(x - bw * 1.4, y + r * 0.05); ctx.lineTo(x - bw * 2.35, y + r * 0.05);
    ctx.moveTo(x - bw * 1.3, y + r * 0.4); ctx.lineTo(x - bw * 2.0, y + r * 0.4); ctx.stroke();
    if (hurt) { ctx.fillStyle = "#fff"; roundRect(ctx, x - bw, y - r * 0.85, bw * 2, r * 1.7, r * 0.5); ctx.fill(); }
    else {
      // Bottom bun.
      ctx.fillStyle = "#cf9247"; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.3, r * 0.14);
      ctx.beginPath(); ctx.moveTo(x - bw, y + r * 0.32); ctx.quadraticCurveTo(x - bw, y + r * 0.82, x, y + r * 0.82); ctx.quadraticCurveTo(x + bw, y + r * 0.82, x + bw, y + r * 0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Patty (overhangs the buns).
      ctx.fillStyle = "#5a3016"; ctx.strokeStyle = "#3c1f0e"; ctx.lineWidth = Math.max(1.1, r * 0.12);
      roundRect(ctx, x - bw * 1.16, y + r * 0.08, bw * 2.32, r * 0.4, r * 0.18); ctx.fill(); ctx.stroke();
      // Cheese slice with drippy corners.
      ctx.fillStyle = "#f0ad3c"; ctx.strokeStyle = "#b9781d"; ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(x - bw * 1.12, y + r * 0.06); ctx.lineTo(x + bw * 1.12, y + r * 0.06);
      ctx.lineTo(x + bw * 0.95, y + r * 0.34); ctx.lineTo(x + bw * 0.4, y + r * 0.14);
      ctx.lineTo(x - bw * 0.2, y + r * 0.36); ctx.lineTo(x - bw * 0.8, y + r * 0.12); ctx.lineTo(x - bw * 1.12, y + r * 0.28);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Sesame top-bun dome.
      ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.3, r * 0.14);
      ctx.beginPath(); ctx.moveTo(x - bw, y + r * 0.06); ctx.quadraticCurveTo(x - bw * 1.02, y - r * 0.82, x, y - r * 0.82); ctx.quadraticCurveTo(x + bw * 1.02, y - r * 0.82, x + bw, y + r * 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.moveTo(x - bw, y + r * 0.06); ctx.quadraticCurveTo(x - bw * 1.02, y - r * 0.82, x, y - r * 0.82); ctx.quadraticCurveTo(x + bw * 1.02, y - r * 0.82, x + bw, y + r * 0.06); ctx.closePath(); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.42, bw * 0.6, r * 0.24, -0.3, 0, 7); ctx.fill();   // grease shine
      ctx.fillStyle = "#f6dfa8";
      for (const [sx, sy] of [[-0.42, -0.24], [0.02, -0.4], [0.46, -0.22], [-0.16, -0.08]]) { ctx.beginPath(); ctx.ellipse(x + sx * r, y + sy * r, r * 0.1, r * 0.06, 0.3, 0, 7); ctx.fill(); }   // sesame
      ctx.restore();
    }
  } else if (typeId === "brute") {
    // Tough Steak — a big seared cut: irregular slab, cream fat-cap rim, charred
    // cross-hatch grill marks, heavy outline (reads as the big one), stubby legs.
    const sw = r * 1.12, sh = r * 0.82;
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(x, y + r * 1.02, sw * 1.05, r * 0.18, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, r * 0.16);   // short stubby legs
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + sh * 0.85); ctx.lineTo(x - r * 0.54, y + r * 1.0);
    ctx.moveTo(x + r * 0.5, y + sh * 0.85); ctx.lineTo(x + r * 0.54, y + r * 1.0); ctx.stroke();
    ctx.fillStyle = edge; ctx.beginPath();
    ctx.ellipse(x - r * 0.6, y + r * 1.02, r * 0.2, r * 0.1, 0, 0, 7); ctx.ellipse(x + r * 0.6, y + r * 1.02, r * 0.2, r * 0.1, 0, 0, 7); ctx.fill();
    const slab = () => {
      ctx.beginPath();
      ctx.moveTo(x - sw, y - sh * 0.3);
      ctx.quadraticCurveTo(x - sw * 1.05, y - sh, x - sw * 0.4, y - sh * 0.95);
      ctx.quadraticCurveTo(x + sw * 0.1, y - sh * 1.12, x + sw * 0.6, y - sh * 0.85);
      ctx.quadraticCurveTo(x + sw * 1.1, y - sh * 0.68, x + sw, y - sh * 0.05);
      ctx.quadraticCurveTo(x + sw * 1.05, y + sh * 0.72, x + sw * 0.5, y + sh * 0.95);
      ctx.quadraticCurveTo(x - sw * 0.1, y + sh * 1.12, x - sw * 0.6, y + sh * 0.85);
      ctx.quadraticCurveTo(x - sw * 1.1, y + sh * 0.6, x - sw, y - sh * 0.3);
      ctx.closePath();
    };
    if (hurt) { ctx.fillStyle = "#fff"; slab(); ctx.fill(); }
    else {
      const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.2, x, y, r * 1.15);
      g.addColorStop(0, "#8f4634"); g.addColorStop(0.7, fill); g.addColorStop(1, "#5a2417");
      ctx.fillStyle = g; slab(); ctx.fill();
      ctx.save(); slab(); ctx.clip();
      // Charred grill marks (subtle cross-hatch).
      ctx.strokeStyle = "rgba(18,7,3,0.38)"; ctx.lineWidth = Math.max(1.3, r * 0.1); ctx.lineCap = "round";
      for (const o of [-0.55, 0.1, 0.7]) { ctx.beginPath(); ctx.moveTo(x + o * sw - sh * 0.6, y - sh * 0.7); ctx.lineTo(x + o * sw + sh * 0.6, y + sh * 0.7); ctx.stroke(); }
      for (const o of [-0.25, 0.45]) { ctx.beginPath(); ctx.moveTo(x + o * sw - sh * 0.6, y + sh * 0.7); ctx.lineTo(x + o * sw + sh * 0.6, y - sh * 0.7); ctx.stroke(); }
      // Cream fat-cap rim along the top edge.
      ctx.strokeStyle = "#e7d4a4"; ctx.lineWidth = Math.max(2, r * 0.2); ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(x - sw * 0.72, y - sh * 0.72); ctx.quadraticCurveTo(x - sw * 0.1, y - sh * 1.02, x + sw * 0.62, y - sh * 0.78); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.8, r * 0.14); slab(); ctx.stroke();   // outline
    }
  } else if (typeId === "swarm") {
    // Fry Swarm — a red carton of golden fries poking out (many little low-HP fries).
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x, y + r * 1.15, r * 1.1, r * 0.2, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = "#8f2a1f"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.1, r * 0.16);   // tiny legs
    ctx.beginPath(); ctx.moveTo(x - r * 0.4, y + r * 0.9); ctx.lineTo(x - r * 0.46, y + r * 1.12);
    ctx.moveTo(x + r * 0.4, y + r * 0.9); ctx.lineTo(x + r * 0.46, y + r * 1.12); ctx.stroke();
    ctx.fillStyle = "#8f2a1f"; ctx.beginPath();
    ctx.ellipse(x - r * 0.54, y + r * 1.14, r * 0.2, r * 0.11, 0, 0, 7); ctx.ellipse(x + r * 0.54, y + r * 1.14, r * 0.2, r * 0.11, 0, 0, 7); ctx.fill();
    // Fries poking out (drawn first; the carton front overlaps their bottoms).
    const fry = (dx, topRel, ang) => {
      ctx.save(); ctx.translate(x + dx * r, y + r * 0.1); ctx.rotate(ang);
      const len = (0.1 - topRel) * r;
      ctx.fillStyle = hurt ? "#fff" : "#f4cf4a"; ctx.strokeStyle = hurt ? "#fff" : "#b8891f"; ctx.lineWidth = Math.max(0.8, r * 0.1);
      roundRect(ctx, -r * 0.14, -len, r * 0.28, len, r * 0.11); ctx.fill(); ctx.stroke();
      if (!hurt) { ctx.fillStyle = "#fbe38a"; roundRect(ctx, -r * 0.14, -len, r * 0.28, len * 0.42, r * 0.11); ctx.fill(); }   // lighter tip
      ctx.restore();
    };
    // Fries get eaten away as HP drops (kept centre-out), instead of a bite-hole.
    const fryList = [[0.0, -0.95, 0.0], [0.18, -1.14, -0.05], [-0.18, -1.22, 0.04], [0.52, -1.0, 0.2], [-0.55, -1.05, -0.22]];
    const fryCount = Math.max(1, 5 - bites * 2);
    for (let i = 0; i < fryCount; i++) fry(fryList[i][0], fryList[i][1], fryList[i][2]);
    // Red carton (trapezoid) with a cream band.
    const topW = r * 2.3, botW = r * 1.5, topY = y - r * 0.12, botY = y + r * 1.02;
    ctx.fillStyle = hurt ? "#fff" : "#d6473a"; ctx.strokeStyle = hurt ? "#fff" : "#8f2a1f"; ctx.lineWidth = Math.max(1.2, r * 0.18); ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(x - topW / 2, topY); ctx.lineTo(x + topW / 2, topY); ctx.lineTo(x + botW / 2, botY); ctx.lineTo(x - botW / 2, botY); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!hurt) {
      ctx.fillStyle = "#f4ece0";
      ctx.beginPath(); ctx.moveTo(x - topW * 0.42, topY + r * 0.34); ctx.lineTo(x + topW * 0.42, topY + r * 0.34); ctx.lineTo(x + botW * 0.42, topY + r * 0.74); ctx.lineTo(x - botW * 0.42, topY + r * 0.74); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - topW / 2, topY); ctx.lineTo(x + topW / 2, topY); ctx.stroke();   // rim shade
    }
  } else {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
  }
  if (bites > 0 && typeId !== "swarm") drawFoodBites(ctx, typeId, x, y, r, bites, edge);   // swarm eats its fries instead
  ctx.restore();
}

function drawEnemies(ctx) {
  for (const e of game.enemies) {
    const et = ENEMY_TYPES[e.typeId];
    if (e.slowTimer > 0 && e.freezeTimer <= 0) { ctx.strokeStyle = COLOR.frostAura; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    // Eaten-down bites: one past 3/4 HP, two past 1/2 HP.
    const frac = e.hp / e.maxHp, bites = frac <= 0.5 ? 2 : frac <= 0.75 ? 1 : 0;
    drawFood(ctx, e.typeId, e.x, e.y, e.radius, et.color, et.edge, e.hurtFlash > 0, bites);
    // Posing for the photo: a slight overexposed tint + camera-viewfinder corner
    // brackets framing the held-still dish (no ice — it's a snapshot, not a freeze).
    if (e.freezeTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.22; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = "#eaf6ff"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const b = e.radius + 5, L = Math.max(3, e.radius * 0.55);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const bx = e.x + sx * b, by = e.y + sy * b;
        ctx.beginPath(); ctx.moveTo(bx, by - sy * L); ctx.lineTo(bx, by); ctx.lineTo(bx - sx * L, by); ctx.stroke();
      }
      ctx.restore();
    }
    if (e.hp < e.maxHp) {
      const w = Math.max(18, e.radius * 2), frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w, 4);
      ctx.fillStyle = COLOR.good; ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w * frac, 4);
    }
  }
}

// The only shots that still travel are the Regular's thrown fork and the
// Photographer's flash orb. Big Appetite, the Kids' Table, and the Slurper all
// act instantly on the belt (see fireProjectile / drawSlurpStraws).
function drawProjectiles(ctx) {
  for (const p of game.projectiles) {
    const tx = p.target ? p.target.x : p.x + 1, ty = p.target ? p.target.y : p.y;
    const ang = Math.atan2(ty - p.y, tx - p.x);
    if (p.typeId === "arrow") {
      // The Regular — a fork thrown tines-first.
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
      ctx.strokeStyle = "#c3ccdb"; ctx.lineCap = "round"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(1, 0); ctx.stroke();   // handle
      ctx.lineWidth = 1.6;
      for (const dy of [-2.4, 0, 2.4]) { ctx.beginPath(); ctx.moveTo(1, dy); ctx.lineTo(7, dy); ctx.stroke(); }   // tines forward
      ctx.restore();
    } else if (p.typeId === "frost") {
      // The Photographer — a soft flash orb.
      ctx.globalAlpha = 0.4; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = "#eaffff"; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = p.color || COLOR.projectile; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// The Milkshake Slurper's straw stays attached to its locked dish while sipping.
function drawSlurpStraws(ctx) {
  for (const t of game.towers) {
    if (t.typeId !== "sniper" || !(t.slurpShow > 0) || !t.slurpTarget || !game.enemies.includes(t.slurpTarget)) continue;
    const x0 = t.x, y0 = t.y - 4, x1 = t.slurpTarget.x, y1 = t.slurpTarget.y;
    const straw = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); };
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 5; straw(); ctx.stroke();
    ctx.strokeStyle = "#f4f7fb"; ctx.lineWidth = 3.2; straw(); ctx.stroke();
    ctx.save(); ctx.strokeStyle = "#e5484d"; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); straw(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#f4f7fb"; ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x1, y1, 3, 0, 7); ctx.fill(); ctx.stroke();   // tip on the dish
  }
}

// A little 4-point sparkle (camera flash / chef's-kiss shine).
function drawSpark4(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.28, y - s * 0.28); ctx.lineTo(x + s, y);
  ctx.lineTo(x + s * 0.28, y + s * 0.28); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.28, y + s * 0.28);
  ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.28, y - s * 0.28); ctx.closePath(); ctx.fill();
}

/* ---- Customer mascots ------------------------------------------------------
   Each tower is a fully-drawn little diner character with its own body, not a
   shared glyph. Signature color stays the dominant read (shirt/outfit) so towers
   are still tellable apart at ~30px on the belt. Shared face + limb helpers keep
   the per-character code short. Migrated one at a time; not-yet-redesigned towers
   fall through to drawLegacyCustomer below. */
const MDARK = "#0b0e14";       // shared cartoon outline
const SKIN = "#f4c48c";        // customer skin tone (same for all — keeps color as the ID)

// A limb drawn as an outlined capsule: dark underlay + colored top.
function drawLimb(ctx, x1, y1, x2, y2, w, col) {
  ctx.lineCap = "round";
  ctx.strokeStyle = MDARK; ctx.lineWidth = w + 2.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
// A filled, dark-outlined circle.
function fillCircle(ctx, x, y, rad, fill, lw = 1.6) {
  ctx.fillStyle = fill; ctx.strokeStyle = MDARK; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.stroke();
}
// A round cartoon face: catchlight eyes, cheeks, optional grin. Returns nothing.
function drawFace(ctx, cx, hy, headR, opts = {}) {
  const eyeDx = headR * 0.42, eyeY = hy + headR * (opts.eyeUp ? -0.02 : 0.1), eyeR = Math.max(1.3, headR * 0.2);
  if (opts.cheeks !== false) {
    ctx.fillStyle = "rgba(255,140,110,0.34)";
    ctx.beginPath(); ctx.arc(cx - headR * 0.62, eyeY + headR * 0.32, headR * 0.24, 0, 7); ctx.arc(cx + headR * 0.62, eyeY + headR * 0.32, headR * 0.24, 0, 7); ctx.fill();
  }
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.38, eyeR * 0.3, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.38, eyeR * 0.3, 0, 7); ctx.fill();
  if (opts.grin) {
    ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.4, headR * 0.14); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, eyeY + headR * 0.26, headR * 0.42, 0.16 * Math.PI, 0.84 * Math.PI); ctx.stroke();
  }
}

// The Regular (#arrow) — the eager everyman diner: neat hair, a bit of a belly,
// one arm resting, the other raised mid fork-stab.
function drawRegular(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const shirt = color, hair = "#5b3a21", pants = "#39415a";
  const headR = r * 0.6, hy = cy - r * 0.6, shoulderY = cy - r * 0.02;
  // Seated legs (behind the torso).
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.38, r * 0.38]) { roundRect(ctx, cx + lx - r * 0.25, cy + r * 0.74, r * 0.5, r * 0.7, r * 0.22); ctx.fill(); ctx.stroke(); }
  // Resting arm (our left): shirt upper arm + skin hand on the lap.
  drawLimb(ctx, cx - r * 0.62, shoulderY + r * 0.18, cx - r * 0.58, cy + r * 0.74, r * 0.3, shirt);
  fillCircle(ctx, cx - r * 0.58, cy + r * 0.8, r * 0.19, SKIN);
  // Torso (shirt) — slim build with just a hint of belly.
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.55, cx - r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx, cy + r * 1.28, cx + r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.55, cx + r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.32, cx - r * 0.66, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin bib tucked at the collar (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.1); ctx.lineTo(cx + r * 0.5, cy + r * 0.1); ctx.lineTo(cx, cy + r * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Collar shadow.
  ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = Math.max(1.2, r * 0.1); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, shoulderY - r * 0.05, r * 0.34, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // Neck.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.2, hy + headR * 0.4, r * 0.4, r * 0.5, r * 0.12); ctx.fill(); ctx.stroke();
  // Ears.
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.05, headR * 0.24, SKIN);
  // Head.
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Hair — a neat side-swept cut with a little cowlick and a part on his left.
  ctx.fillStyle = hair; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.96, hy + headR * 0.12);                                                  // left temple
  ctx.quadraticCurveTo(cx - headR * 1.06, hy - headR * 0.92, cx - headR * 0.2, hy - headR * 1.0);     // up and over the top
  ctx.quadraticCurveTo(cx + headR * 0.1, hy - headR * 1.18, cx + headR * 0.42, hy - headR * 0.92);    // cowlick peak
  ctx.quadraticCurveTo(cx + headR * 0.98, hy - headR * 0.72, cx + headR * 0.96, hy - headR * 0.02);   // down the right side
  ctx.quadraticCurveTo(cx + headR * 0.55, hy - headR * 0.24, cx + headR * 0.2, hy - headR * 0.34);    // forehead sweep
  ctx.quadraticCurveTo(cx - headR * 0.02, hy - headR * 0.54, cx - headR * 0.16, hy - headR * 0.26);   // the part
  ctx.quadraticCurveTo(cx - headR * 0.55, hy - headR * 0.12, cx - headR * 0.96, hy + headR * 0.12);   // back to the temple
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Face.
  drawFace(ctx, cx, hy, headR, { grin: true, cheeks: true });
  // Nose — a tiny skin bump.
  fillCircle(ctx, cx, hy + headR * 0.34, headR * 0.13, SKIN, 1);
  // Raised arm + fork (drawn last, on top).
  const sx = cx + r * 0.58, sy = shoulderY + r * 0.14;
  const ex = cx + r * 1.02, ey = cy - r * 0.02;
  const hx2 = cx + r * 1.18, hy2 = hy - r * 0.12;
  drawLimb(ctx, sx, sy, ex, ey, r * 0.32, shirt);   // upper arm (sleeve)
  drawLimb(ctx, ex, ey, hx2, hy2, r * 0.26, SKIN);  // forearm (skin)
  fillCircle(ctx, hx2, hy2, r * 0.24, SKIN);        // fist
  // Fork — a filled metal utensil: handle, head base, three notched tines + a highlight.
  const metal = "#d9dfec", fBot = hy2 - r * 0.04, neck = hy2 - r * 0.52, headTop = hy2 - r * 1.02;
  ctx.fillStyle = metal; ctx.strokeStyle = MDARK; ctx.lineWidth = 1; ctx.lineJoin = "round";
  roundRect(ctx, hx2 - r * 0.08, neck - r * 0.02, r * 0.16, fBot - neck, r * 0.07); ctx.fill(); ctx.stroke();   // handle
  roundRect(ctx, hx2 - r * 0.25, neck - r * 0.13, r * 0.5, r * 0.2, r * 0.06); ctx.fill(); ctx.stroke();        // head base (tines meet here)
  for (const dx of [-r * 0.18, 0, r * 0.18]) { roundRect(ctx, hx2 + dx - r * 0.055, headTop, r * 0.11, (neck - r * 0.02) - headTop, r * 0.045); ctx.fill(); ctx.stroke(); }   // tines
  ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = Math.max(0.8, r * 0.05); ctx.lineCap = "round";    // handle highlight
  ctx.beginPath(); ctx.moveTo(hx2 - r * 0.02, neck + r * 0.02); ctx.lineTo(hx2 - r * 0.02, fBot - r * 0.06); ctx.stroke();
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx - r * 1.0, hy - r * 0.7, r * 0.4); }
}

// Big Appetite (#cannon) — the round glutton mid-gulp: a huge open mouth, eager
// eyes, and a fork & knife held up, ready to inhale a whole platter (the splash).
function drawBigAppetite(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const shirt = color, pants = "#39415a";
  const bodyCy = cy + r * 0.46, bodyRx = r * 1.02, bodyRy = r * 0.98;
  const hy = cy - r * 0.5, headR = r * 0.72;
  // Tiny legs peeking out below the round body.
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.4, r * 0.4]) { roundRect(ctx, cx + lx - r * 0.22, cy + r * 1.16, r * 0.44, r * 0.42, r * 0.18); ctx.fill(); ctx.stroke(); }
  // Round body (shirt).
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, bodyCy, bodyRx, bodyRy, 0, 0, 7); ctx.fill(); ctx.stroke();
  // Arms reaching down to hold a plate in front.
  const lhx = cx - r * 0.82, lhy = cy + r * 0.6, rhx = cx + r * 0.82, rhy = cy + r * 0.6;
  drawLimb(ctx, cx - r * 0.8, bodyCy - r * 0.1, lhx, lhy, r * 0.3, shirt);
  drawLimb(ctx, cx + r * 0.8, bodyCy - r * 0.1, rhx, rhy, r * 0.3, shirt);
  fillCircle(ctx, lhx, lhy, r * 0.2, SKIN); fillCircle(ctx, rhx, rhy, r * 0.2, SKIN);
  // Napkin bib tucked at the chin (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.06); ctx.quadraticCurveTo(cx, cy + r * 0.02, cx + r * 0.5, cy + r * 0.06); ctx.lineTo(cx, cy + r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Plate held up in both hands (empty — waiting for the next dish).
  const plateCy = cy + r * 0.56, plateRx = r * 0.92, plateRy = r * 0.24;
  ctx.fillStyle = "#eef2f8"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, plateCy, plateRx, plateRy, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#d3dae8"; ctx.beginPath(); ctx.ellipse(cx, plateCy - plateRy * 0.16, plateRx * 0.6, plateRy * 0.5, 0, 0, 7); ctx.fill();   // inner well
  ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = Math.max(0.8, r * 0.05);   // rim shine
  ctx.beginPath(); ctx.ellipse(cx, plateCy, plateRx * 0.82, plateRy * 0.7, 0, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
  // Big head.
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Rosy chubby cheeks.
  ctx.fillStyle = "rgba(255,140,110,0.4)";
  ctx.beginPath(); ctx.arc(cx - headR * 0.66, hy + headR * 0.24, headR * 0.28, 0, 7); ctx.arc(cx + headR * 0.66, hy + headR * 0.24, headR * 0.28, 0, 7); ctx.fill();
  // Huge open mouth — the identity: dark maw, red interior, a tongue. It snaps shut
  // when `bite` rises (the chomp is now *his* mouth, synced to the lunge).
  const bite = opts.bite || 0;
  const mCy = hy + headR * 0.34, mRx = headR * 0.46, mRy = headR * 0.42 * (1 - bite * 0.82);
  ctx.fillStyle = "#2a0d0d"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, mCy, mRx, mRy, 0, 0, 7); ctx.fill(); ctx.stroke();
  if (bite < 0.6) { ctx.fillStyle = "#d0524f"; ctx.beginPath(); ctx.ellipse(cx, mCy + mRy * 0.42, mRx * 0.66, mRy * 0.42, 0, 0, Math.PI); ctx.fill(); }   // tongue
  ctx.fillStyle = "#f4f7ff";
  ctx.fillRect(cx - mRx * 0.7, mCy - mRy * 0.98, mRx * 1.4, headR * 0.09);   // upper teeth
  if (bite > 0.12) ctx.fillRect(cx - mRx * 0.7, mCy + mRy * 0.98 - headR * 0.09, mRx * 1.4, headR * 0.09);   // lower teeth clamp shut
  // Eager eyes with raised brows, above the mouth.
  const eyeY = hy - headR * 0.24, eyeDx = headR * 0.34, eyeR = Math.max(1.3, headR * 0.17);
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.9, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.9, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.32, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.32, 0, 7); ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.2, headR * 0.1); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - eyeDx - eyeR, eyeY - eyeR * 1.7); ctx.lineTo(cx - eyeDx + eyeR * 0.6, eyeY - eyeR * 1.3);
  ctx.moveTo(cx + eyeDx + eyeR, eyeY - eyeR * 1.7); ctx.lineTo(cx + eyeDx - eyeR * 0.6, eyeY - eyeR * 1.3); ctx.stroke();   // raised brows
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 1.15, hy - r * 0.7, r * 0.4); }
}

// The Photographer (#frost) — the artsy diner who makes each dish freeze and pose:
// a beret, cyan shirt, peeking over a big camera raised to their face; the flash
// pops when firing (the slow effect).
function drawPhotographer(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1, firing = !!opts.firing;
  const shirt = color, pants = "#39415a", hy = cy - r * 0.56, headR = r * 0.6, shoulderY = cy - r * 0.02;
  // Seated legs.
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.38, r * 0.38]) { roundRect(ctx, cx + lx - r * 0.25, cy + r * 0.74, r * 0.5, r * 0.7, r * 0.22); ctx.fill(); ctx.stroke(); }
  // Camera-holding hand positions + arms (behind the camera). Held low at the
  // chest so her face shows above it.
  const camCy = cy + r * 0.04, camW = r * 1.24, camH = r * 0.74;
  const lhx = cx - camW * 0.46, lhy = camCy + camH * 0.34, rhx = cx + camW * 0.46, rhy = camCy + camH * 0.34;
  drawLimb(ctx, cx - r * 0.6, shoulderY + r * 0.2, lhx, lhy, r * 0.28, shirt);
  drawLimb(ctx, cx + r * 0.6, shoulderY + r * 0.2, rhx, rhy, r * 0.28, shirt);
  // Torso (cyan shirt) — slim build.
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.55, cx - r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx, cy + r * 1.28, cx + r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.55, cx + r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.32, cx - r * 0.66, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin bib (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.46, cy + r * 0.12); ctx.lineTo(cx + r * 0.46, cy + r * 0.12); ctx.lineTo(cx, cy + r * 0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Neck + head.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.2, hy + headR * 0.5, r * 0.4, r * 0.5, r * 0.12); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.02, headR * 0.22, SKIN);   // ears
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Small beret cap, tilted, cyan — the artsy signature, sitting high so her forehead shows.
  ctx.fillStyle = color; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.ellipse(cx - headR * 0.1, hy - headR * 0.78, headR * 0.92, headR * 0.4, -0.16, 0, 7); ctx.fill(); ctx.stroke();
  fillCircle(ctx, cx - headR * 0.1, hy - headR * 1.12, headR * 0.11, color, 1.4);   // stem nub
  // Peeking face above the camera: cheeks, eyes, brows, nose.
  const eyeY = hy - headR * 0.06, eyeDx = headR * 0.36, eyeR = Math.max(1.3, headR * 0.19);
  ctx.fillStyle = "rgba(255,140,110,0.36)";
  ctx.beginPath(); ctx.arc(cx - headR * 0.6, hy + headR * 0.32, headR * 0.24, 0, 7); ctx.arc(cx + headR * 0.6, hy + headR * 0.32, headR * 0.24, 0, 7); ctx.fill();
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.85, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.85, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.1, headR * 0.1); ctx.lineCap = "round";   // gentle arched brows
  ctx.beginPath(); ctx.arc(cx - eyeDx, eyeY - eyeR * 1.5, eyeR * 1.1, 1.15 * Math.PI, 1.85 * Math.PI); ctx.arc(cx + eyeDx, eyeY - eyeR * 1.5, eyeR * 1.1, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  fillCircle(ctx, cx, hy + headR * 0.28, headR * 0.1, SKIN, 1);   // nose
  // Camera body (held at the chest).
  ctx.fillStyle = "#2b313b"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - camW / 2, camCy - camH / 2, camW, camH, r * 0.12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.fillRect(cx - camW / 2 + r * 0.06, camCy - camH / 2 + r * 0.08, camW - r * 0.12, r * 0.1);   // cyan accent band
  // Flash bulb (top-left) + shutter viewfinder bump (top-right).
  ctx.fillStyle = "#e9eef6"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  roundRect(ctx, cx - camW * 0.34, camCy - camH / 2 - r * 0.18, r * 0.34, r * 0.2, r * 0.05); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#3b424e"; roundRect(ctx, cx + camW * 0.16, camCy - camH / 2 - r * 0.12, r * 0.26, r * 0.14, r * 0.04); ctx.fill(); ctx.stroke();
  // Lens — big round eye of the camera pointed at the food.
  fillCircle(ctx, cx, camCy + camH * 0.04, r * 0.4, "#171b21", 2);
  fillCircle(ctx, cx, camCy + camH * 0.04, r * 0.27, "#0e3a49", 1.4);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath(); ctx.arc(cx, camCy + camH * 0.04, r * 0.2, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();   // lens glint ring
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(cx - r * 0.1, camCy - camH * 0.04, r * 0.06, 0, 7); ctx.fill();   // highlight dot
  // Hands gripping the camera sides.
  fillCircle(ctx, lhx, lhy, r * 0.19, SKIN); fillCircle(ctx, rhx, rhy, r * 0.19, SKIN);
  // Flash pop when firing.
  if (firing) {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(cx - camW * 0.34 + r * 0.17, camCy - camH / 2 - r * 0.08, r * 0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    drawSpark4(ctx, cx - camW * 0.34 + r * 0.17, camCy - camH / 2 - r * 0.08, r * 0.7);
  }
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 1.05, hy - r * 0.5, r * 0.4); }
}

// The Milkshake Slurper (#sniper) — the long-range diner: cradles a grape shake and
// sends a ridiculously long bendy straw snaking across the room to slurp a far dish.
function drawMilkshakeSlurper(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const shirt = color, pants = "#39415a", shake = "#b487ec", hy = cy - r * 0.58, headR = r * 0.56, shoulderY = cy - r * 0.02;
  // Seated legs.
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.38, r * 0.38]) { roundRect(ctx, cx + lx - r * 0.25, cy + r * 0.74, r * 0.5, r * 0.7, r * 0.22); ctx.fill(); ctx.stroke(); }
  // Arms reaching down to cradle the glass in front.
  const lhx = cx - r * 0.5, lhy = cy + r * 0.62, rhx = cx + r * 0.5, rhy = cy + r * 0.62;
  drawLimb(ctx, cx - r * 0.66, shoulderY + r * 0.18, lhx, lhy, r * 0.28, shirt);
  drawLimb(ctx, cx + r * 0.66, shoulderY + r * 0.18, rhx, rhy, r * 0.28, shirt);
  // Torso (shirt) — slim build.
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.55, cx - r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx, cy + r * 1.28, cx + r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.55, cx + r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.32, cx - r * 0.66, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin bib (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.42, cy + r * 0.14); ctx.lineTo(cx + r * 0.42, cy + r * 0.14); ctx.lineTo(cx, cy + r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Neck + head.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.2, hy + headR * 0.5, r * 0.4, r * 0.5, r * 0.12); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.05, headR * 0.22, SKIN);   // ears
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Soda-jerk paper cap — a white folded boat hat.
  ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - headR * 1.02, hy - headR * 0.34);
  ctx.quadraticCurveTo(cx - headR * 0.7, hy - headR * 1.16, cx, hy - headR * 1.02);
  ctx.quadraticCurveTo(cx + headR * 0.7, hy - headR * 1.16, cx + headR * 1.02, hy - headR * 0.34);
  ctx.quadraticCurveTo(cx, hy - headR * 0.62, cx - headR * 1.02, hy - headR * 0.34);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, hy - headR * 0.72, headR * 0.12, 0, 7); ctx.fill();   // little cap badge
  // Happy sipping face: catchlight eyes, rosy cheeks, small content smile.
  const eyeY = hy - headR * 0.02, eyeDx = headR * 0.4, eyeR = Math.max(1.3, headR * 0.19);
  ctx.fillStyle = "rgba(255,140,110,0.4)";
  ctx.beginPath(); ctx.arc(cx - headR * 0.64, eyeY + headR * 0.34, headR * 0.24, 0, 7); ctx.arc(cx + headR * 0.64, eyeY + headR * 0.34, headR * 0.24, 0, 7); ctx.fill();
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.3, headR * 0.13); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, eyeY + headR * 0.26, headR * 0.24, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();   // small smile
  // ---- Milkshake glass cradled in front (tulip soda glass) ----
  const gTopY = cy + r * 0.14, gBotY = cy + r * 1.12, gTopHalf = r * 0.5, gBotHalf = r * 0.28;
  ctx.fillStyle = shake; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - gTopHalf, gTopY); ctx.lineTo(cx + gTopHalf, gTopY);
  ctx.lineTo(cx + gBotHalf, gBotY); ctx.lineTo(cx - gBotHalf, gBotY); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;   // glass ridges
  for (const f of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(cx + f * gTopHalf * 1.6, gTopY + 2); ctx.lineTo(cx + f * gBotHalf * 1.6, gBotY - 2); ctx.stroke(); }
  // A lighter foam line at the top so the shake reads as full to the rim.
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = Math.max(1, r * 0.09); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - gTopHalf * 0.85, gTopY + r * 0.05); ctx.lineTo(cx + gTopHalf * 0.85, gTopY + r * 0.05); ctx.stroke();
  // Hands cradling the glass.
  fillCircle(ctx, lhx, lhy, r * 0.19, SKIN); fillCircle(ctx, rhx, rhy, r * 0.19, SKIN);
  // ---- Short straw poking up to his lips (idle sip). The long slurp reaching out
  // to a far dish is the ATTACK, drawn only when firing (attack-visuals pass). ----
  const strawPath = () => {
    ctx.moveTo(cx + r * 0.18, gTopY - r * 0.04);
    ctx.quadraticCurveTo(cx + r * 0.34, cy - r * 0.16, cx + r * 0.2, cy - r * 0.42);
  };
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = MDARK; ctx.lineWidth = r * 0.22; ctx.beginPath(); strawPath(); ctx.stroke();     // outline
  ctx.strokeStyle = "#f4f7fb"; ctx.lineWidth = r * 0.14; ctx.beginPath(); strawPath(); ctx.stroke(); // straw body
  ctx.save(); ctx.strokeStyle = "#e5484d"; ctx.lineWidth = r * 0.05; ctx.setLineDash([r * 0.14, r * 0.14]);   // candy stripe
  ctx.beginPath(); strawPath(); ctx.stroke(); ctx.restore();
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 0.95, hy - r * 0.5, r * 0.36); }
}

// Dispatch to a per-character mascot; fall back to the legacy glyph for towers
// not yet redesigned. `firing` triggers per-tower attack flourishes (later pass).
// One little kid in the huddle: yellow shirt, party hat, excited grin, arms up.
function drawKid(ctx, kx, ky, kr, shirt, hatColor, armsUp) {
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(kx - kr * 0.92, ky + kr * 1.7);
  ctx.quadraticCurveTo(kx - kr * 1.02, ky + kr * 0.45, kx, ky + kr * 0.55);
  ctx.quadraticCurveTo(kx + kr * 1.02, ky + kr * 0.45, kx + kr * 0.92, ky + kr * 1.7);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (armsUp) {
    drawLimb(ctx, kx - kr * 0.66, ky + kr * 0.75, kx - kr * 1.16, ky - kr * 0.28, kr * 0.34, shirt);
    drawLimb(ctx, kx + kr * 0.66, ky + kr * 0.75, kx + kr * 1.16, ky - kr * 0.28, kr * 0.34, shirt);
    fillCircle(ctx, kx - kr * 1.16, ky - kr * 0.28, kr * 0.22, SKIN, 1.2);
    fillCircle(ctx, kx + kr * 1.16, ky - kr * 0.28, kr * 0.22, SKIN, 1.2);
  }
  fillCircle(ctx, kx, ky, kr, SKIN, 1.8);   // head
  // Party hat + pompom.
  ctx.fillStyle = hatColor; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(kx, ky - kr * 2.05); ctx.lineTo(kx - kr * 0.72, ky - kr * 0.72); ctx.lineTo(kx + kr * 0.72, ky - kr * 0.72); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(0.8, kr * 0.12);   // hat zigzag
  ctx.beginPath(); ctx.moveTo(kx - kr * 0.34, ky - kr * 1.1); ctx.lineTo(kx + kr * 0.06, ky - kr * 1.0); ctx.lineTo(kx - kr * 0.14, ky - kr * 0.86); ctx.stroke();
  fillCircle(ctx, kx, ky - kr * 2.05, kr * 0.2, "#fbfcff", 1);   // pompom
  // Face: eyes, rosy cheeks, open excited grin.
  const ex = kr * 0.36, eyy = ky - kr * 0.06, er = Math.max(1, kr * 0.17);
  ctx.fillStyle = "rgba(255,140,110,0.36)";
  ctx.beginPath(); ctx.arc(kx - kr * 0.56, ky + kr * 0.3, kr * 0.18, 0, 7); ctx.arc(kx + kr * 0.56, ky + kr * 0.3, kr * 0.18, 0, 7); ctx.fill();
  ctx.fillStyle = MDARK; ctx.beginPath(); ctx.arc(kx - ex, eyy, er, 0, 7); ctx.arc(kx + ex, eyy, er, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(kx - ex + er * 0.3, eyy - er * 0.4, er * 0.34, 0, 7); ctx.arc(kx + ex + er * 0.3, eyy - er * 0.4, er * 0.34, 0, 7); ctx.fill();
  ctx.fillStyle = "#7a2b2b"; ctx.beginPath(); ctx.ellipse(kx, ky + kr * 0.42, kr * 0.26, kr * 0.2, 0, 0, 7); ctx.fill();
}

// The Kids' Table (#zap) — not one diner but a rowdy huddle of little kids in party
// hats, all grabbing fistfuls at once (fast, cheap, tiny bites).
function drawKidsTable(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1, shirt = color;
  drawKid(ctx, cx, cy - r * 0.16, r * 0.5, shirt, color, true);          // back-center kid
  drawKid(ctx, cx - r * 0.64, cy + r * 0.34, r * 0.46, shirt, "#ff6bd0", false);  // front-left (pink hat)
  drawKid(ctx, cx + r * 0.64, cy + r * 0.34, r * 0.46, shirt, "#7fe0ff", true);   // front-right (cyan hat)
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 1.05, cy - r * 0.85, r * 0.4); }
}

// Dispatch to a per-character mascot. Every tower id is a full mascot now.
function drawCustomer(ctx, typeId, cx, cy, r, color, opts = {}) {
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (typeId === "cannon") drawBigAppetite(ctx, cx, cy, r, color, opts);
  else if (typeId === "frost") drawPhotographer(ctx, cx, cy, r, color, opts);
  else if (typeId === "sniper") drawMilkshakeSlurper(ctx, cx, cy, r, color, opts);
  else if (typeId === "zap") drawKidsTable(ctx, cx, cy, r, color, opts);
  else drawRegular(ctx, cx, cy, r, color, opts);   // arrow (default)
  ctx.restore();
}

function drawTowers(ctx) {
  for (const t of game.towers) {
    const def = TOWER_BY_ID[t.typeId];
    const idx = t.level - 1, radius = 13 + idx * 2;
    const glowStrength = 0.12 + idx * 0.12 + Math.max(0, t.upgradeFlash);
    // Lunge toward the target on attack: peaks mid-animation, back to rest at the
    // ends. Big Appetite lunges much farther — he really goes for the dish.
    let ox = 0, oy = 0;
    if (t.lungeTimer > 0) {
      const reach = t.typeId === "cannon" ? 1.9 : 0.85;
      const amp = Math.sin((1 - t.lungeTimer / LUNGE_DUR) * Math.PI) * (radius * reach);
      ox = Math.cos(t.lungeAngle) * amp; oy = Math.sin(t.lungeAngle) * amp;
    }
    ctx.globalAlpha = Math.min(0.6, glowStrength); ctx.fillStyle = def.glow;
    ctx.beginPath(); ctx.arc(t.x + ox, t.y + oy, radius + 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    const justFired = t.cdTimer > t.cooldown - 0.14;
    // Big Appetite's mouth snaps shut around the peak of the lunge.
    let bite = 0;
    if (t.typeId === "cannon" && t.lungeTimer > 0) { const pr = 1 - t.lungeTimer / LUNGE_DUR; bite = Math.max(0, 1 - Math.abs(pr - 0.55) / 0.3); }
    drawCustomer(ctx, t.typeId, t.x + ox, t.y + oy, radius, def.color, { level: t.level, firing: justFired, bite });
    for (let i = 0; i < t.maxLevel; i++) { ctx.beginPath(); ctx.arc(t.x - 8 + i * 8, t.y - radius - 16, 3, 0, Math.PI * 2); ctx.fillStyle = i < t.level ? COLOR.upgradeSpark : "#39404f"; ctx.fill(); }
    if (distance(game.pointer, t) <= 18 && t.level < t.maxLevel) { ctx.fillStyle = game.currency >= RULES.upgradeCost[t.level] ? COLOR.good : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("next course " + RULES.upgradeCost[t.level], t.x, t.y - radius - 24); }
  }
}

function drawParticles(ctx) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color;
    if (p.type === "ring") { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); }
    else if (p.type === "text") { ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.text, p.x, p.y); ctx.textAlign = "left"; }
    else if (p.type === "grab") { drawGrabHand(ctx, p); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

// A cartoon kid hand reaching in toward (p.x,p.y) from p.angle and clenching:
// fingers start splayed and long, then curl short as it grabs.
function drawGrabHand(ctx, p) {
  const prog = 1 - p.life / p.maxLife;                 // 0 approach -> 1 clenched
  const reach = (1 - prog) * p.r * 1.3 + p.r * 0.3;    // hand moves in as it grabs
  const hx = p.x + Math.cos(p.angle) * reach, hy = p.y + Math.sin(p.angle) * reach;
  const toward = Math.atan2(p.y - hy, p.x - hx);
  const palmR = Math.max(2.4, p.r * 0.42);
  const spread = 0.6 - prog * 0.42, fLen = palmR * (1.6 - prog * 0.8);
  ctx.globalAlpha = p.life < p.maxLife * 0.35 ? p.life / (p.maxLife * 0.35) : 1;
  ctx.lineCap = "round";
  // A small arm reaching in from the side (behind the hand): yellow sleeve then a
  // skin forearm, so it reads as a kid grabbing rather than a floating hand.
  const armLen = p.r * 1.1;
  const ex = hx + Math.cos(p.angle) * armLen, ey = hy + Math.sin(p.angle) * armLen;
  const mx = hx + Math.cos(p.angle) * armLen * 0.5, my = hy + Math.sin(p.angle) * armLen * 0.5;
  ctx.strokeStyle = MDARK; ctx.lineWidth = palmR * 0.98; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = palmR * 0.74; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(mx, my); ctx.stroke();       // sleeve
  ctx.strokeStyle = SKIN; ctx.lineWidth = palmR * 0.74; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(hx, hy); ctx.stroke();           // forearm
  for (const off of [-1.5, -0.5, 0.5, 1.5]) {          // four fingers curling toward the dish
    const fa = toward + off * spread, fx = hx + Math.cos(fa) * fLen, fy = hy + Math.sin(fa) * fLen;
    ctx.strokeStyle = MDARK; ctx.lineWidth = palmR * 0.66; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = SKIN; ctx.lineWidth = palmR * 0.44; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
  }
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(hx, hy, palmR, 0, 7); ctx.fill(); ctx.stroke();   // palm
  ctx.fillStyle = "#ffe08a";                                                 // little kid sleeve cuff
  ctx.beginPath(); ctx.arc(hx - Math.cos(toward) * palmR * 0.95, hy - Math.sin(toward) * palmR * 0.95, palmR * 0.55, 0, 7); ctx.fill();
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
