/*
  Deckbound — main.js
  Stage 3: deck / collection + meta-progression + polish. Completes the v1 loop.

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

const RULES = {
  startCurrency: 150,
  startLives: 20,
  upgradeCost: [0, 70, 100],
  earnPerWave: 40,
};

const TOWER_TYPES = [
  { id: "arrow", name: "Arrow", shape: "diamond", cost: 50, color: "#6ea8fe", glow: "#3f6bb0",
    range: 130, damage: 30, cooldown: 0.75, behavior: "single",
    up: { damage: 16, range: 14, cooldownMul: 0.86 }, blurb: "Balanced single-target" },
  { id: "cannon", name: "Cannon", shape: "circle", cost: 85, color: "#ff9d5c", glow: "#b5561f",
    range: 118, damage: 24, cooldown: 1.3, behavior: "splash", splash: 46,
    up: { damage: 15, splash: 10, cooldownMul: 0.9 }, blurb: "Splash damage (AoE)" },
  { id: "frost", name: "Frost", shape: "hex", cost: 70, color: "#7fe0ff", glow: "#2b8fb5",
    range: 120, damage: 10, cooldown: 0.8, behavior: "slow", slowFactor: 0.5, slowDur: 1.2,
    up: { damage: 6, slowFactorAdd: -0.08, range: 12 }, blurb: "Slows enemies" },
  { id: "sniper", name: "Sniper", shape: "triangle", cost: 95, color: "#c8a8ff", glow: "#7a4fd0",
    range: 235, damage: 70, cooldown: 1.85, behavior: "single",
    up: { damage: 45, range: 26, cooldownMul: 0.88 }, blurb: "Long range, big hits" },
  { id: "zap", name: "Zap", shape: "square", cost: 35, color: "#ffe08a", glow: "#b59a2b",
    range: 96, damage: 12, cooldown: 0.32, behavior: "single",
    up: { damage: 7, range: 8, cooldownMul: 0.85 }, blurb: "Cheap, fast, weak" },
];
const TOWER_BY_ID = Object.fromEntries(TOWER_TYPES.map((t) => [t.id, t]));

const ENEMY_TYPES = {
  mote:   { name: "Mote",   color: "#c86bff", edge: "#e4c2ff", hpMul: 1.0,  speedMul: 1.0, radius: 12, reward: 5 },
  runner: { name: "Runner", color: "#ff8f6b", edge: "#ffd0bf", hpMul: 0.6,  speedMul: 1.7, radius: 9,  reward: 5 },
  brute:  { name: "Brute",  color: "#8b7bd8", edge: "#c7bdf0", hpMul: 2.6,  speedMul: 0.7, radius: 17, reward: 9 },
  swarm:  { name: "Swarm",  color: "#6bffb0", edge: "#c2ffe0", hpMul: 0.28, speedMul: 1.2, radius: 7,  reward: 2 },
};

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
  { id: "sniper", label: "Unlock the Sniper tower", cost: 3, owned: () => META.unlocked.includes("sniper"), buy: () => META.unlocked.push("sniper") },
  { id: "currency", label: "+50 starting currency", cost: 2, owned: () => META.boughtCurrency, buy: () => (META.boughtCurrency = true) },
  { id: "lives", label: "+3 starting lives", cost: 2, owned: () => META.boughtLives, buy: () => (META.boughtLives = true) },
];

// Your "deck": the tower cards you've unlocked (in a fixed display order).
function deckTypes() {
  return TOWER_TYPES.filter((t) => META.unlocked.includes(t.id));
}

/* =========================================================================
   2) LEVEL
   ========================================================================= */

const PATH = [
  { x: -30, y: 100 }, { x: 170, y: 100 }, { x: 170, y: 300 }, { x: 400, y: 300 },
  { x: 400, y: 110 }, { x: 640, y: 110 }, { x: 640, y: 280 }, { x: 760, y: 280 },
];
const CORE = { x: PATH[PATH.length - 1].x, y: PATH[PATH.length - 1].y, radius: 24 };
const SLOTS = [
  { x: 300, y: 220 }, { x: 520, y: 195 }, { x: 110, y: 220 },
  { x: 300, y: 55 }, { x: 700, y: 190 }, { x: 470, y: 340 },
];

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

const WAVES = [
  { hp: 75,  speed: 50, interval: 1.0,  comp: [["mote", 7]] },
  { hp: 90,  speed: 53, interval: 0.95, comp: [["mote", 6], ["runner", 4]] },
  { hp: 110, speed: 55, interval: 0.9,  comp: [["mote", 7], ["runner", 5], ["swarm", 4]] },
  { hp: 135, speed: 57, interval: 0.85, comp: [["mote", 8], ["swarm", 9], ["runner", 4]] },
  { hp: 160, speed: 59, interval: 0.8,  comp: [["mote", 8], ["runner", 6], ["brute", 2]] },
  { hp: 190, speed: 61, interval: 0.76, comp: [["swarm", 14], ["runner", 6], ["brute", 2]] },
  { hp: 220, speed: 63, interval: 0.72, comp: [["mote", 9], ["brute", 3], ["runner", 7]] },
  { hp: 255, speed: 65, interval: 0.68, comp: [["runner", 10], ["brute", 3], ["swarm", 9]] },
  { hp: 295, speed: 67, interval: 0.63, comp: [["mote", 11], ["swarm", 12], ["brute", 4]] },
  { hp: 340, speed: 69, interval: 0.56, comp: [["brute", 6], ["runner", 12], ["mote", 9]] },
];
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
  towers: [], enemies: [], projectiles: [], particles: [],
  spawnQueue: [], spawnTimer: 0, waveHp: 0, waveSpeed: 0, waveInterval: 1,
  killed: 0, coreHurtFlash: 0, shake: 0, elapsed: 0, fps: 0,
  pointer: { x: -1, y: -1 },
  message: "", messageTimer: 0,
  lastRun: null, // { won, wave, killed, essence } — shown on the summary
};

const START_BTN = { x: 470, y: 402, w: 210, h: 38 };
const CONTINUE_BTN = { x: VIEW.w / 2 - 85, y: VIEW.h / 2 + 44, w: 170, h: 38 };
const PLAY_BTN = { x: VIEW.w / 2 - 90, y: 372, w: 180, h: 44 };
const TOOLBAR = { y: 398, cardW: 66, cardH: 44, gap: 6, startX: 8 };

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
  game.lastRun = null;
  const deck = deckTypes();
  game.selectedType = deck.length ? deck[0].id : "arrow";
  setMessage("Pick a tower below, build on a slot, then Start Wave");
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
      if (inRect(p, PLAY_BTN)) { startRun(); return; }
      return;
    }

    // Run summary → back to hub.
    if (game.phase === "won" || game.phase === "lost") {
      if (inRect(p, CONTINUE_BTN)) { game.phase = "menu"; }
      return;
    }

    // Toolbar: select a card from your deck.
    const deck = deckTypes();
    for (let i = 0; i < deck.length; i++) {
      if (inRect(p, cardRect(i))) { game.selectedType = deck[i].id; return; }
    }

    if (game.phase === "prep" && inRect(p, START_BTN)) { startNextWave(); return; }

    for (const t of game.towers) if (distance(p, t) <= 18) { tryUpgrade(t); return; }

    for (let i = 0; i < SLOTS.length; i++) {
      const s = SLOTS[i];
      if (distance(p, s) <= 20 && !game.towers.some((t) => t.slotIndex === i)) { tryBuild(i); return; }
    }
  };

  canvas.addEventListener("mousedown", (e) => onDown(e.clientX, e.clientY));
  canvas.addEventListener("touchstart", (e) => { if (e.touches[0]) { e.preventDefault(); onDown(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  canvas.addEventListener("mousemove", (e) => { game.pointer = toDesign(e.clientX, e.clientY); });
}

function tryBuyShop(item) {
  if (item.owned()) { audio.deny(); return; }
  if (META.essence < item.cost) { audio.deny(); setMessage("Not enough Essence (need " + item.cost + ")"); return; }
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
  if (game.currency < def.cost) { audio.deny(); setMessage("Not enough currency for " + def.name + " (need " + def.cost + ")"); return; }
  game.currency -= def.cost;
  const s = SLOTS[slotIndex];
  game.towers.push({
    slotIndex, x: s.x, y: s.y, typeId: def.id, level: 1, maxLevel: 3,
    range: def.range, damage: def.damage, cooldown: def.cooldown,
    splash: def.splash || 0, slowFactor: def.slowFactor || 1, slowDur: def.slowDur || 0,
    cdTimer: 0, upgradeFlash: 0,
  });
  spawnRing(s.x, s.y, def.color, 34, 0.4);
  audio.build();
}

function tryUpgrade(t) {
  if (t.level >= t.maxLevel) { audio.deny(); setMessage("Tower is already max level"); return; }
  const cost = RULES.upgradeCost[t.level];
  if (game.currency < cost) { audio.deny(); setMessage("Not enough currency to upgrade (need " + cost + ")"); return; }
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

function startNextWave() {
  if (game.phase !== "prep") return;
  const w = WAVES[game.waveIndex];
  game.phase = "wave";
  game.spawnQueue = buildSpawnQueue(w);
  game.spawnTimer = 0;
  game.waveHp = w.hp; game.waveSpeed = w.speed; game.waveInterval = w.interval;
  setMessage("Wave " + (game.waveIndex + 1) + " incoming!");
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

function updateTowers(step) {
  for (const t of game.towers) {
    if (t.upgradeFlash > 0) t.upgradeFlash -= step;
    t.cdTimer -= step;
    if (t.cdTimer > 0) continue;
    let target = null, bestDist = -1;
    for (const e of game.enemies) if (distance(t, e) <= t.range && e.dist > bestDist) { target = e; bestDist = e.dist; }
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
    spawnKillBurst(enemy.x, enemy.y, ENEMY_TYPES[enemy.typeId].color);
    spawnFloatText(enemy.x, enemy.y - 14, "+" + enemy.reward, COLOR.gold);
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
    if (game.waveIndex + 1 >= WAVES.length) { endRun(true); }
    else { game.waveIndex++; game.phase = "prep"; setMessage("Wave cleared!  +" + RULES.earnPerWave + " — build up, then Start Wave", 4); }
  }
}

function checkLoss() {
  if (game.lives <= 0 && game.phase === "wave") endRun(false);
}

// Finish a run: award Essence (persisted) and show the summary.
function endRun(won) {
  const wavesCleared = won ? WAVES.length : game.waveIndex;
  const essence = Math.max(1, Math.floor(wavesCleared / 2) + (won ? 3 : 0));
  META.essence += essence;
  saveMeta();
  game.lastRun = { won, wave: won ? WAVES.length : game.waveIndex + 1, killed: game.killed, essence };
  game.phase = won ? "won" : "lost";
  won ? audio.win() : audio.lose();
}

/* -------------------------------------------------------------------------
   Particles
   ------------------------------------------------------------------------- */

function spawnRing(x, y, color, maxR, life) { game.particles.push({ type: "ring", x, y, r: 4, maxR, life, maxLife: life, color }); }
function spawnKillBurst(x, y, color) {
  spawnRing(x, y, color, 28, 0.32);
  for (let i = 0; i < 11; i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120; game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 2, life: 0.4 + Math.random() * 0.3, maxLife: 0.7, color }); }
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
  ctx.fillText("Defend the core. Collect towers. Survive.", 42, 86);

  // Essence.
  ctx.fillStyle = COLOR.essence;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText("✦ Essence: " + META.essence, 42, 122);

  // Your deck (collection).
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("Your deck", 42, 156);
  const deck = deckTypes();
  let dx = 46;
  for (const def of deck) {
    ctx.fillStyle = "#1b2230";
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.stroke();
    ctx.fillStyle = def.color;
    drawTowerShape(ctx, def.shape, dx + 32, 196, 12); ctx.fill();
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(def.name, dx + 32, 226);
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
  ctx.fillText("Essence shop", 430, 140);
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

  // Play button.
  const hover = inRect(game.pointer, PLAY_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66";
  roundRect(ctx, PLAY_BTN.x, PLAY_BTN.y, PLAY_BTN.w, PLAY_BTN.h, 10); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("▶  Start Run", VIEW.w / 2, PLAY_BTN.y + PLAY_BTN.h / 2);
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

function drawCore(ctx) {
  const hurt = game.coreHurtFlash > 0;
  const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 2);
  ctx.strokeStyle = hurt ? COLOR.coreHurt : COLOR.core; ctx.globalAlpha = 0.15 + 0.25 * pulse; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(CORE.x, CORE.y, CORE.radius + 8 + pulse * 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = hurt ? COLOR.coreHurt : COLOR.core;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const angle = (Math.PI / 3) * i - Math.PI / 6; const px = CORE.x + Math.cos(angle) * CORE.radius, py = CORE.y + Math.sin(angle) * CORE.radius; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("CORE", CORE.x, CORE.y + CORE.radius + 16);
}

function drawEnemies(ctx) {
  for (const e of game.enemies) {
    const et = ENEMY_TYPES[e.typeId];
    if (e.slowTimer > 0) { ctx.strokeStyle = COLOR.frostAura; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.fillStyle = e.hurtFlash > 0 ? "#ffffff" : et.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = et.edge; ctx.lineWidth = 2; ctx.stroke();
    if (e.hp < e.maxHp) {
      const w = Math.max(18, e.radius * 2), frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w, 4);
      ctx.fillStyle = COLOR.good; ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w * frac, 4);
    }
  }
}

function drawProjectiles(ctx) {
  for (const p of game.projectiles) { ctx.fillStyle = p.color || COLOR.projectile; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill(); }
}

function drawTowerShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === "diamond") { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (shape === "circle") { ctx.arc(x, y, r, 0, Math.PI * 2); }
  else if (shape === "hex") { for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); }
  else if (shape === "triangle") { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.9, y + r * 0.7); ctx.lineTo(x - r * 0.9, y + r * 0.7); ctx.closePath(); }
  else { ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); }
}

// Extra in-play ornamentation per tower type, layered on top of the base silhouette
// (kept out of drawTowerShape so small toolbar/hub cards stay clean and legible).
function drawTowerDetail(ctx, typeId, x, y, r, def, t) {
  ctx.save();
  ctx.strokeStyle = "#0b0e14"; ctx.globalAlpha = 0.75;
  if (typeId === "arrow") {
    // A nested inner diamond facet, like a drawn bowstring notch.
    ctx.lineWidth = 1.3; ctx.beginPath();
    const ir = r * 0.5;
    ctx.moveTo(x, y - ir); ctx.lineTo(x + ir, y); ctx.lineTo(x, y + ir); ctx.lineTo(x - ir, y); ctx.closePath();
    ctx.stroke();
  } else if (typeId === "cannon") {
    // A short stubby barrel + a darker base ring, like a turret housing.
    ctx.globalAlpha = 0.9; ctx.fillStyle = "#5a2f10";
    ctx.fillRect(x - r * 0.28, y - r * 1.35, r * 0.56, r * 0.7);
    ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
  } else if (typeId === "frost") {
    // Small crystal spikes at alternating hex vertices, like rime forming on the tower.
    ctx.globalAlpha = 0.85; ctx.strokeStyle = "#eaffff"; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i += 2) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const tx = x + Math.cos(a) * (r + 5), ty = y + Math.sin(a) * (r + 5);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    }
  } else if (typeId === "sniper") {
    // A scope: thin barrel line from the apex + a small ringed lens.
    ctx.globalAlpha = 0.9; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x, y - r * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - r * 1.5, 2.2, 0, Math.PI * 2); ctx.stroke();
  } else if (typeId === "zap") {
    // A small jagged bolt etched into the housing.
    ctx.globalAlpha = 0.85; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15, y - r * 0.55); ctx.lineTo(x + r * 0.2, y - r * 0.1);
    ctx.lineTo(x - r * 0.1, y - r * 0.1); ctx.lineTo(x + r * 0.15, y + r * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTowers(ctx) {
  for (const t of game.towers) {
    const def = TOWER_BY_ID[t.typeId];
    const idx = t.level - 1, radius = 13 + idx * 2;
    const glowStrength = 0.12 + idx * 0.12 + Math.max(0, t.upgradeFlash);
    ctx.globalAlpha = Math.min(0.6, glowStrength); ctx.fillStyle = def.glow;
    ctx.beginPath(); ctx.arc(t.x, t.y, radius + 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = def.color; drawTowerShape(ctx, def.shape, t.x, t.y, radius); ctx.fill();
    ctx.strokeStyle = "#eaf2ff"; ctx.lineWidth = 2; ctx.stroke();
    drawTowerDetail(ctx, t.typeId, t.x, t.y, radius, def, t);
    for (let i = 0; i < t.maxLevel; i++) { ctx.beginPath(); ctx.arc(t.x - 8 + i * 8, t.y - radius - 9, 3, 0, Math.PI * 2); ctx.fillStyle = i < t.level ? COLOR.upgradeSpark : "#39404f"; ctx.fill(); }
    if (distance(game.pointer, t) <= 18 && t.level < t.maxLevel) { ctx.fillStyle = game.currency >= RULES.upgradeCost[t.level] ? COLOR.good : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("upgrade " + RULES.upgradeCost[t.level], t.x, t.y - radius - 17); }
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
    ctx.fillStyle = def.color; drawTowerShape(ctx, def.shape, r.x + 15, r.y + r.h / 2, 9); ctx.fill();
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText(def.name, r.x + 28, r.y + 17);
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
    if (game.phase === "wave") { ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("defending — build/upgrade live", START_BTN.x + START_BTN.w / 2, START_BTN.y + 24); }
    return;
  }
  const hover = inRect(game.pointer, START_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66"; roundRect(ctx, START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 8); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("▶  Start Wave " + (game.waveIndex + 1), START_BTN.x + START_BTN.w / 2, START_BTN.y + START_BTN.h / 2);
  ctx.textBaseline = "alphabetic";
}

// A small warded-shield glyph for lives — echoes the core's hexagon shape (defense, not just health).
function drawHeartIcon(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(6, -5); ctx.lineTo(6, 2); ctx.lineTo(0, 8); ctx.lineTo(-6, 2); ctx.lineTo(-6, -5);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.55; ctx.fillStyle = "#0b0e14";
  ctx.beginPath(); ctx.arc(0, -1, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// A faceted essence-shard glyph for currency — a small cut gem instead of a flat diamond.
function drawCurrencyIcon(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(5, -3); ctx.lineTo(3, 8); ctx.lineTo(-3, 8); ctx.lineTo(-5, -3);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-5, -3); ctx.lineTo(5, -3); ctx.stroke();
  ctx.restore();
}

function drawHUD(ctx) {
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const lowLives = game.lives > 0 && game.lives <= game.maxLives * 0.25;
  const pulse = lowLives ? 0.5 + 0.5 * Math.sin(game.elapsed * 9) : 0;
  ctx.fillStyle = lowLives ? `rgba(255,${60 - Math.round(30 * pulse)},${60 - Math.round(30 * pulse)},0.4)` : "rgba(0,0,0,0.4)";
  ctx.fillRect(6, 6, 320, 26);
  ctx.font = "bold 14px system-ui, sans-serif";
  drawHeartIcon(ctx, 14, 17, lowLives && pulse > 0.5 ? "#ffffff" : COLOR.bad);
  ctx.fillStyle = lowLives && pulse > 0.5 ? "#ffffff" : COLOR.bad; ctx.fillText("" + game.lives, 26, 11);
  drawCurrencyIcon(ctx, 76, 17, COLOR.gold);
  ctx.fillStyle = COLOR.gold; ctx.fillText("" + game.currency, 88, 11);
  ctx.fillStyle = COLOR.ink; ctx.fillText("Wave " + Math.min(game.waveIndex + 1, WAVES.length) + "/" + WAVES.length, 160, 11);
  ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(game.phase === "wave" ? "defending…" : "prep", 262, 12);
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
  const r = game.lastRun || { won: false, wave: 1, killed: 0, essence: 0 };
  ctx.fillStyle = r.won ? COLOR.good : COLOR.bad; ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText(r.won ? "VICTORY" : "DEFEAT", VIEW.w / 2, VIEW.h / 2 - 46);
  ctx.fillStyle = COLOR.ink; ctx.font = "15px system-ui, sans-serif";
  ctx.fillText(r.won ? "You survived all " + WAVES.length + " waves." : "Reached wave " + r.wave + " of " + WAVES.length + ".", VIEW.w / 2, VIEW.h / 2 - 14);
  ctx.fillText("Enemies destroyed: " + r.killed, VIEW.w / 2, VIEW.h / 2 + 8);
  ctx.fillStyle = COLOR.essence; ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText("✦ +" + r.essence + " Essence earned", VIEW.w / 2, VIEW.h / 2 + 32);
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
