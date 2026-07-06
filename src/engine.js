/*
  Deckbound — src/engine.js
  All game logic and state: the game object, waves, towers/combat, enemies,
  economy, meta-progression, and particle *data* (pure structs; drawing is
  render.js's job). ZERO DOM / canvas / Web Audio references — this file must
  stay loadable headless (tools/sim.mjs runs real games with it in Node).
  Side effects (sounds, UI-anchored popups) go through the FX hooks below.
*/

/* Side-effect hooks the shell wires up (audio + UI-anchored effects). The
   engine never touches Web Audio or the DOM directly — a headless run
   (tools/sim.mjs, or the harness before wiring) leaves these as no-ops.
   src/main.js points them at the real audio object + UI. */
const FX = {
  shoot(typeId, path) {}, hit() {}, kill() {}, leak() {}, upgrade() {}, build() {},
  deny() {}, waveStart() {}, buy() {}, win() {}, lose() {},
  // Signature + economy hooks added by the audio pass (Issue #64). No-op by
  // default and side-effect-only — the headless sim runs them as no-ops, so the
  // difficulty gauge can't move; src/main.js wires them to real sounds.
  crumb() {}, knockback(scale) {}, doubleFreeze() {}, fourthHand() {}, place() {}, sell() {},
};

/* =========================================================================
   1b) META-PROGRESSION — persisted in the browser (localStorage).
   ========================================================================= */

const META_KEY = "deckbound.meta.v1";
function freshMeta() {
  // bestWave: the furthest wave ever reached — a persisted RECORD stat (not a
  // gameplay mechanic), shown on the run summary + hub. loadMeta's assign-onto-
  // fresh merge defaults it to 0 for older saves and drops any stale fields
  // (e.g. a mode flag from the retired finite/endless toggle) harmlessly.
  // autoStart: the pause-menu "Auto-start next wave" setting — "off", or the
  // number of seconds after a wave resolves before the next one calls itself
  // (0 = instant). Persisted like every other META field.
  return { essence: 0, unlocked: ["arrow", "cannon", "frost", "zap"], boughtCurrency: false, boughtLives: false, mapId: null, bestWave: 0, autoStart: "off" };
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

/* =========================================================================
   1c) SAVE & CONTINUE — a wave-start checkpoint (Issue #83).

   The checkpoint is the START of the round the player is in — never a mid-wave
   snapshot. It stores the MINIMUM (mapId, waveIndex, currency, lives, and each
   tower as {typeId, x, y, upgradePath, upgradeTier, targeting}) and rebuilds the
   board through the real tryBuild / upgrade paths on restore, so `spent` and
   every signature flag reconstruct themselves. We never field-dump live tower
   objects, and no enemies/projectiles are ever serialized.

   PURITY (do not break): serialize + write consume ZERO Math.random. saveCheckpoint
   runs on every prep entry / prep mutation / wave call — paths the seeded sim
   exercises — so any RNG here would desync the difficulty gauge. It only reads
   fields, builds a plain object, and writes localStorage (a guarded no-op headless
   and on file://). restore is hub-only (never in the sim) but is kept RNG-free too.
   ========================================================================= */

const SAVE_KEY = "deckbound.save.v1";
const SAVE_VERSION = 1;
// True only while restoreRun is rebuilding the board: it drives tryBuild through
// the real path with a bypassed cost, whose checkpointPrep would otherwise write a
// half-built board (and a temporary Infinity currency) to disk. restoreRun writes
// one clean checkpoint itself once the board is whole.
let restoring = false;

// The wave-start snapshot of the CURRENT game state. Pure: no RNG, no mutation.
function serializeRun() {
  return {
    version: SAVE_VERSION,
    mapId: game.mapId,
    waveIndex: game.waveIndex,
    currency: game.currency,
    lives: game.lives,
    towers: game.towers.map((t) => ({
      typeId: t.typeId, x: t.x, y: t.y,
      upgradePath: t.upgradePath, upgradeTier: t.upgradeTier, targeting: t.targeting,
    })),
  };
}
// Write the checkpoint (synchronous localStorage, guarded exactly like META —
// blocked storage / file:// / the headless stub all fall through as no-ops).
function saveCheckpoint() {
  if (restoring) return;   // don't persist the half-rebuilt board mid-restore
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(serializeRun())); } catch (e) {}
}
// Overwrite the checkpoint ONLY while in prep, so a mid-wave build/sell/upgrade
// can't move the frozen wave-start snapshot — that's what lets "closed the tab
// mid-wave" resume at the wave's start with no unload handler.
function checkpointPrep() { if (game.phase === "prep") saveCheckpoint(); }
// Discard the checkpoint (on defeat; a fresh run overwrites it instead).
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
// Read + validate the checkpoint. Unparseable JSON, a version mismatch, a missing
// tower list, or an unknown map → null (discard silently, never crash).
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || save.version !== SAVE_VERSION || !Array.isArray(save.towers)) return null;
    if (!MAPS.some((m) => m.id === save.mapId)) return null;
    return save;
  } catch (e) { return null; }
}
// The parsed checkpoint if one is resumable (for the hub's "Continue — Wave N"),
// else null.
function hasSave() { return readSave(); }

// Rebuild one placed tower from its snapshot through the REAL code paths so
// `spent` and every signature flag reconstruct identically. Cost is bypassed
// (currency is already the saved wave-start value). ZERO Math.random: placement
// is tryBuild (RNG-free) and tiers re-apply via tryUpgrade's exact state
// mutations MINUS the cosmetic spawnUpgradeSparkles (which would consume RNG).
function rebuildTowerFromSave(ts) {
  const savedType = game.selectedType, savedCurrency = game.currency;
  game.selectedType = ts.typeId;
  game.currency = Infinity;               // bypass the affordability check in tryBuild
  tryBuild(ts.x, ts.y);                   // real placement path → a proper tower object (spent = base)
  game.selectedType = savedType;
  game.currency = savedCurrency;
  const t = game.towers[game.towers.length - 1];
  if (!t || t.x !== ts.x || t.y !== ts.y) return;   // placement rejected — shouldn't happen for a valid save
  t.targeting = ts.targeting || "first";
  const upgrades = TOWER_BY_ID[ts.typeId].upgrades;
  for (let i = 0; i < (ts.upgradeTier || 0); i++) {
    if (!ts.upgradePath || !upgrades[ts.upgradePath]) break;
    const tier = upgrades[ts.upgradePath].tiers[t.upgradeTier];
    if (!tier) break;
    t.spent += tier.cost;                 // same spend bookkeeping tryUpgrade does
    t.upgradePath = ts.upgradePath;       // commit → the other path locks out
    t.upgradeTier++;
    applyUpgradeDeltas(t, tier);          // rebuilds pierce/crumb/knockback/maxTargets/… flags
  }
}
// Resume the saved run: land in PREP of the saved wave with the board rebuilt.
// Returns true on success, false if there's no valid save.
function restoreRun() {
  const save = readSave();
  if (!save) return false;
  restoring = true;                       // suppress checkpoint writes until the board is whole
  loadMap(save.mapId);                    // rebind the map (consumes no RNG)
  // startRun-equivalent reset, but keep the SAVED currency/lives/waveIndex and
  // don't overwrite the checkpoint we're restoring from.
  game.phase = "prep";
  game.mapId = MAP.id;
  game.maxLives = RULES.startLives + (META.boughtLives ? 3 : 0);
  game.lives = Math.min(save.lives, game.maxLives);
  game.currency = save.currency;
  game.waveIndex = save.waveIndex;
  game.towers = []; game.enemies = []; game.projectiles = []; game.particles = [];
  game.spawnQueue = []; game.killed = 0; game.coreHurtFlash = 0;
  game.score = 0; game.lastRun = null; game.selectedTower = null;
  game.prepElapsed = 0;
  // The first prep after a resume never auto-calls — the player gets a breather
  // to re-read the board before auto-start (if enabled) re-arms on the next wave.
  game.autoStartArmed = false;
  const deck = deckTypes();
  game.selectedType = deck.length ? deck[0].id : "arrow";
  for (const ts of save.towers) rebuildTowerFromSave(ts);
  restoring = false;
  saveCheckpoint();   // one clean checkpoint reflecting the fully-rebuilt wave-start board
  setMessage("Resumed at Wave " + (game.waveIndex + 1) + " — seat more customers, then Send Out the food", 4);
  return true;
}

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

// Maps are CONTENT. data/balance.json ships a maps[] list; loadMap(id|obj)
// rebinds every per-map binding below — the active map object, PATH, CORE,
// segment lengths, placement rules, obstacles, sim anchors, and the render
// THEME — so adding a map is a JSON block plus a few prop drawers, no engine
// surgery. maps[0] is the default; the menu picker + boot choose the active one.
const MAPS = BAL.maps;

function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

// Per-map state. `let`, not const, precisely because the map can change between
// runs; every reader below (and in render.js) sees the active map through these.
let MAP, PATH, CORE, SEGMENT_LENGTHS, PATH_LENGTH, PLACEMENT, OBSTACLES, SIM_ANCHORS, THEME;

// Swap in a map by id, or by a raw map object (the behavior test injects a
// fixture). Pure state rebind — consumes NO Math.random, so the seeded sim is
// untouched. A missing/unknown id falls back to the default map.
// The pickable maps (hub picker + saved-map restore): everything not flagged
// `retired`. A retired map stays in MAPS as a historical reference — the sims,
// maplint, and an explicit loadMap("id") still exercise it — it just leaves the
// player-facing picker. Callers that restore a *saved* choice filter with this.
function pickableMaps() { return MAPS.filter((x) => !x.retired); }

function loadMap(idOrMap) {
  // Loads ANY map by id or object (retired included, so `--map diner` + tests
  // still work). The retired→fallback policy lives at the saved-mapId restore
  // site (src/main.js boot), not here.
  let m = typeof idOrMap === "string" ? MAPS.find((x) => x.id === idOrMap) : idOrMap;
  if (!m) m = MAPS[0];
  MAP = m;
  PATH = m.path;
  CORE = { x: PATH[PATH.length - 1].x, y: PATH[PATH.length - 1].y, radius: m.coreRadius };
  SEGMENT_LENGTHS = PATH.slice(1).map((p, i) => distance(PATH[i], p));
  PATH_LENGTH = SEGMENT_LENGTHS.reduce((sum, len) => sum + len, 0);
  PLACEMENT = m.placement;
  OBSTACLES = m.obstacles;
  SIM_ANCHORS = m.simAnchors;
  THEME = m.theme;
  return m;
}
loadMap(MAPS[0]);   // boot default — load order + behavior unchanged from the single-map era
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

// Shortest distance from point (px,py) to the segment a→b — belt clearance in
// canPlace measures against every PATH segment with this.
function distToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

// Free placement (replaced the 10 fixed slots): a tower can sit anywhere on the
// diner floor that is inside placement.bounds, more than pathBuffer off the
// belt centerline, at least towerSpacing from every seated customer, and not
// inside an obstacle rect. All four rules read the ACTIVE map's bound state
// (PLACEMENT/OBSTACLES, set by loadMap) — obstacles are placement blockers ONLY
// (no line-of-sight in this game; they never affect shots or enemies). There is
// deliberately NO tower cap: the economy limits how many customers you can seat.
function canPlace(x, y) {
  const P = PLACEMENT, b = P.bounds;
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
  for (let i = 0; i < PATH.length - 1; i++) {
    if (distToSegment(x, y, PATH[i], PATH[i + 1]) <= P.pathBuffer) return false;
  }
  for (const t of game.towers) if (distance({ x, y }, t) < P.towerSpacing) return false;
  for (const o of OBSTACLES) {
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return false;
  }
  return true;
}

/* =========================================================================
   3) WAVES
   ========================================================================= */

// Waves are GENERATED from data/balance.json's waveGen block (not an authored
// table), so "more rounds" and "endless" fall out of one formula. makeWave(n)
// is deterministic and mirrored in tools/balance_sim.py so the sim and game
// agree on every wave. n is 0-indexed.
const WG = BAL.waveGen;

// Per-type spawn weights for wave n, DATA-DRIVEN from waveGen.typeWeights
// (each type: base + perWave·n, floored at min, zero until typeUnlock[type]).
// Moved out of hardcoded coefficients when the Python mirror retired, so the
// economy pass can tune the wave ramp in balance.json like everything else.
function waveTypeWeights(n) {
  const u = WG.typeUnlock, tw = WG.typeWeights;
  const w = {};
  for (const k of Object.keys(tw)) {
    const c = tw[k];
    w[k] = n >= (u[k] || 0) ? Math.max(c.min || 0, c.base + (c.perWave || 0) * n) : 0;
  }
  return w;
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
   5) GAME STATE
   ========================================================================= */

// phase: "menu" (hub/shop) | "prep" | "wave" | "lost"
// Runs are ENDLESS: there is no "won" phase — a run ends only in defeat and the
// score is waves survived (Issue #75).
const game = {
  canvas: null, ctx: null,
  phase: "menu", mapId: null,   // the active map's id, recorded at startRun (menu picker loads it)
  currency: 0, lives: 0, maxLives: 0, waveIndex: 0,
  selectedType: "arrow",
  selectedTower: null, // the placed tower whose targeting/upgrade panel is open
  towers: [], enemies: [], projectiles: [], particles: [],
  spawnQueue: [], spawnTimer: 0, waveHp: 0, waveSpeed: 0, waveInterval: 1,
  killed: 0, coreHurtFlash: 0, shake: 0, elapsed: 0, fps: 0, prepElapsed: 0,
  autoStartArmed: false,   // true only in a prep entered by a wave RESOLVING (never run start / restore)
  score: 0,
  pointer: { x: -1, y: -1 },
  message: "", messageTimer: 0,
  lastRun: null, // { wave, best, newBest, killed, essence, score } — shown on the summary
};

// Begin a fresh run from the hub, applying permanent perks + your unlocked deck.
function startRun() {
  game.phase = "prep";
  game.mapId = MAP.id;   // record the active map (the menu picker already loaded it)
  game.currency = RULES.startCurrency + (META.boughtCurrency ? 50 : 0);
  game.maxLives = RULES.startLives + (META.boughtLives ? 3 : 0);
  game.lives = game.maxLives;
  game.waveIndex = 0;
  game.towers = []; game.enemies = []; game.projectiles = []; game.particles = [];
  game.spawnQueue = []; game.killed = 0; game.coreHurtFlash = 0;
  game.prepElapsed = 0;
  game.autoStartArmed = false;   // the run's FIRST prep is always manual — set up in peace
  game.selectedTower = null;
  game.score = 0;
  game.lastRun = null;
  const deck = deckTypes();
  game.selectedType = deck.length ? deck[0].id : "arrow";
  setMessage("Pick a customer below, seat them at a table, then Send Out the food");
  saveCheckpoint();   // entering prep (wave 0) — overwrites any prior save, so "Open for Service" starts fresh
}

function setMessage(text, seconds = 3.5) { game.message = text; game.messageTimer = seconds; }

function tryBuyShop(item) {
  if (item.owned()) { FX.deny(); return; }
  if (META.essence < item.cost) { FX.deny(); setMessage("Not enough Golden Forks (need " + item.cost + ")"); return; }
  META.essence -= item.cost;
  item.buy();
  saveMeta();
  FX.buy();
}

/* =========================================================================
   7) PLAYER ACTIONS (build / upgrade / start wave)
   ========================================================================= */

// Seat the selected customer at (x,y). Callers gate on canPlace first (the
// click handler and the sims both do), so the in-here check is belt-and-braces
// against a stray direct call — deny FX, no message, no state change.
function tryBuild(x, y) {
  const def = TOWER_BY_ID[game.selectedType];
  if (!canPlace(x, y)) { FX.deny(); return; }
  if (game.currency < def.cost) { FX.deny(); setMessage("Not enough Tips for " + def.name + " (need " + def.cost + ")"); return; }
  game.currency -= def.cost;
  game.towers.push({
    x, y, typeId: def.id,
    spent: def.cost,   // running total of Tips sunk into this tower (base + tiers) — sellTower refunds a fraction of it
    // Upgrade state: one of the two paths, committed on the first purchase, then
    // 0/1/2 tiers deep. upgradePath === null means "unupgraded, both paths open".
    upgradePath: null, upgradeTier: 0, pierce: false,
    // Big Appetite tier-2 signature flags (0/unset until the path is bought).
    crumbRadius: 0, crumbDamage: 0, knockbackBase: 0, knockbackSizeRef: 0,
    range: def.range, damage: def.damage, cooldown: def.cooldown,
    splash: def.splash || 0, slowFactor: def.slowFactor || 1, slowDur: def.slowDur || 0,
    freezeDur: def.freezeDur || 0, maxTargets: def.maxTargets || 1,
    cdTimer: 0, upgradeFlash: 0, targeting: "first",
    lungeTimer: 0, lungeAngle: 0,   // brief lunge-toward-target on attack (drawTowers)
    slurpTargets: [], slurpShow: 0, slurpSoundTimer: 0,   // Milkshake Slurper's attached straw(s)
  });
  spawnRing(x, y, def.color, 34, 0.4);
  FX.place();
  checkpointPrep();   // a prep build updates the wave-start snapshot (no-op mid-wave)
}

/* Upgrade paths (data/balance.json → TOWER_BY_ID[type].upgrades). Each tower has
   two named paths; each path has two tiers { cost, ...deltas }. Buying tier 1 of
   one path commits this PLACED tower to it and permanently locks the other. Tier
   1 is a stat buff; tier 2 is a signature change to how the tower attacks. These
   pure helpers are shared by the engine, the panel UI (render.js), and the
   headless sims. */
const MAX_TIER = 2;

// The two paths for a tower type, in display order: [{ id, name, tiers }, ...].
function towerPaths(typeId) {
  const u = TOWER_BY_ID[typeId].upgrades;
  return Object.keys(u).map((id) => ({ id, name: u[id].name, tiers: u[id].tiers }));
}
// Can this placed tower still buy into pathId? No if it's maxed or already
// committed to the other path.
function pathAvailable(t, pathId) {
  if (t.upgradeTier >= MAX_TIER) return false;
  return t.upgradePath === null || t.upgradePath === pathId;
}
// The next tier object the tower would buy on pathId (or null if unavailable).
function nextTier(t, pathId) {
  if (!pathAvailable(t, pathId)) return null;
  return TOWER_BY_ID[t.typeId].upgrades[pathId].tiers[t.upgradeTier];
}

// Apply one tier's deltas onto a placed tower. Same delta vocabulary the sims
// mirror (balance_sim.py apply_upgrade). `pierce` is the only engine-only flag.
function applyUpgradeDeltas(t, d) {
  if (d.damage) t.damage += d.damage;
  if (d.range) t.range += d.range;
  if (d.cooldownMul) t.cooldown *= d.cooldownMul;
  if (d.splash) t.splash += d.splash;
  if (d.slowFactorAdd) t.slowFactor = Math.max(0.2, t.slowFactor + d.slowFactorAdd);
  if (d.freezeDurAdd) t.freezeDur += d.freezeDurAdd;
  if (d.slowDurAdd) t.slowDur += d.slowDurAdd;
  if (d.pierce) t.pierce = true;   // Fork Frenzy t2: the fork flies straight and skewers a second dish
  // Big Appetite tier-2 signatures (PR 2), read by fireProjectile's cannon branch.
  if (d.crumbRadius) t.crumbRadius = d.crumbRadius;         // Speed Eater t2: bite splashes crumbs
  if (d.crumbDamage) t.crumbDamage = d.crumbDamage;
  if (d.knockbackBase) t.knockbackBase = d.knockbackBase;   // One Big Bite t2: spit a surviving dish backward
  if (d.knockbackSizeRef) t.knockbackSizeRef = d.knockbackSizeRef;
  // Photographer / Slurper tier-2 signatures (PR 3): dishes engaged per cooldown.
  if (d.freezeTargets) t.freezeTargets = d.freezeTargets;   // Paparazzi t2: flash freezes 2 at once
  if (d.drainTargets) t.drainTargets = d.drainTargets;      // Silly Straw t2: 2 straws drain at once
  if (d.maxTargetsAdd) t.maxTargets += d.maxTargetsAdd;     // Birthday Party t2: a 4th kid (the multi branch spreads/piles across maxTargets)
}

// Buy the next tier of pathId for placed tower t. The first purchase commits the
// tower to that path and locks the other out for good.
function tryUpgrade(t, pathId) {
  if (t.upgradeTier >= MAX_TIER) { FX.deny(); setMessage("This customer is fully upgraded"); return; }
  const upgrades = TOWER_BY_ID[t.typeId].upgrades;
  if (t.upgradePath && t.upgradePath !== pathId) { FX.deny(); setMessage("Locked into " + upgrades[t.upgradePath].name); return; }
  const tier = nextTier(t, pathId);
  if (!tier) { FX.deny(); return; }
  if (game.currency < tier.cost) { FX.deny(); setMessage("Not enough Tips for " + upgrades[pathId].name + " (need " + tier.cost + ")"); return; }
  game.currency -= tier.cost;
  t.spent += tier.cost;
  t.upgradePath = pathId;   // commit → the other path is now locked out
  t.upgradeTier++;
  applyUpgradeDeltas(t, tier);
  t.upgradeFlash = 0.6;
  spawnUpgradeSparkles(t);
  FX.upgrade();
  checkpointPrep();   // a prep upgrade updates the wave-start snapshot (no-op mid-wave)
}

// Set a placed tower's targeting priority. Its own function so the checkpoint
// tracks a targeting change (a prep mutation) the same as build/upgrade/sell.
function setTargeting(t, mode) {
  t.targeting = mode;
  checkpointPrep();
}

// Sell a placed tower for a partial refund of everything spent on it (base
// cost + purchased tiers), rate from balance.json (RULES.sellRefund). Allowed
// whenever building is — prep AND mid-wave. The freed floor is immediately
// buildable again (canPlace stops seeing the tower once it leaves the array).
// No engine object holds a back-reference to a tower (projectiles track their
// TARGET dish; enemy status effects are scalars; the Slurper's straws live ON
// the tower), so removal is clean.
function sellTower(t) {
  if (!game.towers.includes(t)) return;   // belt-and-braces: never refund twice
  const refund = Math.floor(RULES.sellRefund * t.spent);
  game.currency += refund;
  game.towers = game.towers.filter((x) => x !== t);
  if (game.selectedTower === t) game.selectedTower = null;
  spawnRing(t.x, t.y, COLOR.gold, 34, 0.4);
  spawnFloatText(t.x, t.y - 14, "+$" + refund + " refund", COLOR.gold);
  FX.sell();
  checkpointPrep();   // a prep sell updates the wave-start snapshot (no-op mid-wave)
}

// The pause menu's "Auto-start next wave" options — value ("off" or seconds of
// prep before the next wave calls itself; 0 = instant) + display label. Lives
// here like TARGETING_MODES so render + input share one list; the engine only
// ever reads META.autoStart.
const AUTOSTART_OPTIONS = [
  ["off", "Off"], [0, "Instant"], [1, "1s"], [2, "2s"], [3, "3s"],
];

function startNextWave() {
  if (game.phase !== "prep") return;
  const w = getWave(game.waveIndex);
  game.phase = "wave";
  game.spawnQueue = buildSpawnQueue(w);
  game.spawnTimer = 0;
  game.waveHp = w.hp; game.waveSpeed = w.speed; game.waveInterval = w.interval;
  setMessage("Wave " + (game.waveIndex + 1) + " incoming!");
  FX.waveStart();
  // Freeze the wave-start snapshot. This is the LAST write until the next prep —
  // during the wave the stored save stays this wave-start board, so a tab closed
  // mid-wave resumes here.
  saveCheckpoint();
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
  if (game.phase === "prep") {
    game.prepElapsed += step;
    // Auto-start (META.autoStart, set in the pause menu): a prep entered by a
    // wave RESOLVING calls the next wave itself after the configured seconds.
    // Never armed for a run's first prep or the prep right after a restore.
    // Pausing halts update() at the shell, so the countdown suspends with it.
    if (game.autoStartArmed && META.autoStart !== "off" && game.prepElapsed >= META.autoStart) startNextWave();
  }

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
    game.enemies.push({ typeId, dist: 0, speed: game.waveSpeed * et.speedMul, hp, maxHp: hp, radius: et.radius, bounty: et.bounty, hurtFlash: 0, slowTimer: 0, slowFactor: 1, freezeTimer: 0 });
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
    if (e.dist >= PATH_LENGTH) { e.reachedCore = true; game.lives = Math.max(0, game.lives - 1); game.coreHurtFlash = 0.35; game.shake = 6; FX.leak(); }
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
    // The Milkshake Slurper latches a straw onto a dish and keeps sipping fast
    // until it dies or leaves range, then re-targets. Silly Straw t2 runs up to
    // `drainTargets` straws at once — each keeps its own dish independently.
    if (t.typeId === "sniper") {
      const maxStraws = t.drainTargets || 1;
      t.slurpTargets = t.slurpTargets.filter((e) => game.enemies.includes(e) && distance(t, e) <= t.range);
      if (t.slurpTargets.length < maxStraws) {
        const free = game.enemies.filter((e) => distance(t, e) <= t.range && !t.slurpTargets.includes(e)).sort((a, b) => b.dist - a.dist);
        for (const e of free) { if (t.slurpTargets.length >= maxStraws) break; t.slurpTargets.push(e); }
      }
      if (t.slurpTargets.length) {
        t.slurpShow = 0.12;   // keep the straw(s) drawn between sips
        if (t.cdTimer <= 0) {
          for (const e of t.slurpTargets) fireProjectile(t, e); t.cdTimer = t.cooldown;
          if (t.slurpSoundTimer <= 0) { FX.shoot("sniper", t.upgradePath); t.slurpSoundTimer = 0.32; }   // ONE shared sip sound, not per-straw
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
        if (t.maxTargets > 3) FX.fourthHand();   // Birthday Party's party-horn accent (audio pass)
      }
    } else {
      const shots = t.freezeTargets || 1;   // Paparazzi t2: one flash freezes 2 dishes at once
      if (shots > 1) {
        // Mirror the multi branch: fire at the frontmost `shots` dishes (pile on if fewer).
        const inRange = game.enemies.filter((e) => distance(t, e) <= t.range).sort((a, b) => b.dist - a.dist);
        if (inRange.length) { for (let i = 0; i < shots; i++) fireProjectile(t, inRange[i % inRange.length]); t.cdTimer = t.cooldown; FX.doubleFreeze(); }
      } else {
        const target = pickTarget(t);
        if (target) { fireProjectile(t, target); t.cdTimer = t.cooldown; }
      }
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
    // Speed Eater t2 — crumb splash: the bite scatters damaging crumbs onto OTHER
    // dishes near the bitten one (small AoE). The target already took the full bite.
    if (t.crumbRadius > 0) {
      for (const e of [...game.enemies]) {
        if (e !== target && distance({ x: tx, y: ty }, e) <= t.crumbRadius) applyDamage(e, t.crumbDamage);
      }
      spawnCrumbSplash(tx, ty, t.crumbRadius);
      FX.crumb();
    }
    // One Big Bite t2 — knockback: a dish that SURVIVES the bite is spit backward
    // along the belt. Lighter dishes fly farther (radius as the mass proxy, factor
    // clamped 0.5x–2x); clamp at the kitchen door (dist >= 0). Dead dishes don't
    // fly. moveEnemies re-derives x/y from the new dist next tick.
    if (t.knockbackBase > 0 && game.enemies.includes(target)) {
      const factor = Math.max(0.5, Math.min(2, (t.knockbackSizeRef || target.radius) / target.radius));
      target.dist = Math.max(0, target.dist - t.knockbackBase * factor);
      spawnKnockbackPuff(tx, ty);
      FX.knockback(factor);   // comedic size-scaled ptooey spit (audio pass)
    }
    FX.shoot(t.typeId, t.upgradePath);
    return;
  }
  // The Kids' Table grabs the dish right on the belt — a hand clenches on it.
  if (t.typeId === "zap") {
    applyDamage(target, t.damage);
    spawnGrabHand(target.x, target.y, target.radius);
    FX.shoot(t.typeId, t.upgradePath);
    return;
  }
  // The Milkshake Slurper sips instantly up an attached straw (drawn by
  // drawSlurpStraws); the sip sound is throttled in updateTowers.
  if (t.typeId === "sniper") {
    applyDamage(target, t.damage);
    return;
  }
  // Fork Frenzy tier 2: the fork stops homing and flies STRAIGHT in the aim
  // direction at release, skewering the first dish and carrying through to a
  // second (movePiercing). The base arrow (no pierce) keeps the homing fork below.
  if (t.typeId === "arrow" && t.pierce) {
    const ang = Math.atan2(target.y - t.y, target.x - t.x), speed = 420;
    game.projectiles.push({
      x: t.x, y: t.y, x0: t.x, y0: t.y, typeId: "arrow", piercing: true, angle: ang,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      damage: t.damage, radius: 4, color: def.color, hits: [], maxHits: 2, life: 1.6,
    });
    FX.shoot(t.typeId, t.upgradePath);
    return;
  }
  game.projectiles.push({
    x: t.x, y: t.y, x0: t.x, y0: t.y, typeId: t.typeId, target,
    speed: 360,   // only arrow + frost reach here; the instant attackers returned above
    damage: t.damage, radius: t.typeId === "cannon" ? 6 : 4, behavior: def.behavior, color: def.color,
    splash: t.splash, slowDur: t.slowDur, slowFactor: t.slowFactor, freezeDur: t.freezeDur,
  });
  FX.shoot(t.typeId, t.upgradePath);
}

function moveProjectiles(step) {
  for (const p of game.projectiles) {
    if (p.piercing) { movePiercing(p, step); continue; }
    if (!p.target || !game.enemies.includes(p.target)) { p.dead = true; continue; }
    const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy), stepDist = p.speed * step;
    if (d <= stepDist + p.target.radius) { resolveHit(p); p.dead = true; }
    else { p.x += (dx / d) * stepDist; p.y += (dy / d) * stepDist; }
  }
  game.projectiles = game.projectiles.filter((p) => !p.dead);
}

// A straight-line piercing fork (Fork Frenzy t2): advance along its fixed
// velocity, damage each not-yet-hit dish it overlaps, and die after maxHits
// skewers, once off-screen, or when its short life runs out. It pierces the
// first dish and carries through to a second.
function movePiercing(p, step) {
  p.x += p.vx * step; p.y += p.vy * step; p.life -= step;
  for (const e of [...game.enemies]) {
    if (p.hits.includes(e)) continue;
    if (distance(p, e) <= e.radius + p.radius) {
      p.hits.push(e);
      applyDamage(e, p.damage);
      if (p.hits.length >= p.maxHits) { p.dead = true; return; }
    }
  }
  if (p.life <= 0 || p.x < -20 || p.x > VIEW.w + 20 || p.y < -20 || p.y > VIEW.h + 20) p.dead = true;
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
    spawnKillBurst(enemy.x, enemy.y, ENEMY_TYPES[enemy.typeId].color);
    // The BOUNTY: each dish pays its balance.json Tips on the kill — the
    // per-kill half of the economy. A leaked dish pays nothing (moveEnemies
    // just removes it), and a zero-bounty dish kills silently (no popup).
    if (enemy.bounty > 0) {
      game.currency += enemy.bounty;
      game.score += enemy.bounty;
      spawnFloatText(enemy.x, enemy.y - 14, "+$" + enemy.bounty + " tip", COLOR.gold);
    }
    FX.kill();
  } else {
    spawnHitSpark(enemy.x, enemy.y);
    FX.hit();
  }
}

function checkWaveEnd() {
  if (game.phase !== "wave") return;
  if (game.spawnQueue.length === 0 && game.enemies.length === 0) {
    game.currency += RULES.earnPerWave;
    // Endless survival: clearing a wave ALWAYS advances to the next (getWave
    // generates waves past the authored table). A run never "wins" — it ends
    // only in defeat, and the score is waves survived (Issue #75).
    game.waveIndex++; game.phase = "prep"; game.prepElapsed = 0;
    game.autoStartArmed = true;   // a RESOLVED wave arms auto-start for this prep (if enabled)
    setMessage("Wave cleared!  +" + RULES.earnPerWave + " Tips — seat more customers, then Send Out the food", 4);
    saveCheckpoint();   // entering prep for the next wave — the new wave-start snapshot
  }
}

function checkLoss() {
  if (game.lives <= 0 && game.phase === "wave") endRun();
}

// Finish a run. Runs are ENDLESS, so this fires only on DEFEAT: award Essence
// (Golden Forks, persisted), update the best-wave record, and show the summary.
// `wave` is the wave you fell on (what the HUD read) = the score to beat.
function endRun() {
  const wavesCleared = game.waveIndex;        // waves fully survived before falling
  const wave = game.waveIndex + 1;            // the wave you were on when shut down
  const essence = Math.max(1, Math.floor(wavesCleared / 2));
  META.essence += essence;
  const prevBest = META.bestWave || 0;
  const newBest = wave > prevBest;
  const best = newBest ? wave : prevBest;
  META.bestWave = best;
  saveMeta();
  clearSave();   // defeat ends the run — the checkpoint is spent, discard it
  game.lastRun = { wave, best, newBest, killed: game.killed, essence, score: game.score };
  game.phase = "lost";
  FX.lose();
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
// Speed Eater t2: the crumb-splash AoE — a ring at the splash radius plus a wider,
// heavier crumb spray than a plain bite, so the "it hit the neighbours too" reads.
function spawnCrumbSplash(x, y, radius) {
  spawnRing(x, y, "#e8c58a", radius, 0.3);
  const crumbs = ["#e8c58a", "#c98a45", "#f2ca3c"];
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * (radius * 3);
    game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.6 + Math.random() * 2, life: 0.3 + Math.random() * 0.3, maxLife: 0.6, color: crumbs[i % crumbs.length] });
  }
}
// One Big Bite t2: a quick puff at the bite spot as the dish is spit backward.
function spawnKnockbackPuff(x, y) {
  spawnRing(x, y, "#ffe1b0", 24, 0.22);
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 110;
    game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.5 + Math.random() * 1.5, life: 0.22 + Math.random() * 0.16, maxLife: 0.38, color: "#d9b98a" });
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

