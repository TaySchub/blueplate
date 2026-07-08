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
  // Status-system hooks (Roster Growth 2): a status landing on a dish / a DOT
  // tick doing its damage. No-op by default (the headless sim never hears them);
  // src/main.js wires apply to the closest existing sound and leaves tick silent
  // (the tick's damage already plays the normal hit through applyDamage → FX.hit).
  statusApply(kind) {}, statusTick(kind) {},
  // Zone-applicator hook (Tower Rework): a belt puddle spawning. No-op by
  // default; Audio Pass 2 (#64) wires it — leave it silent here.
  zoneSpawn(kind) {},
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
  // unlocked: the towers available from the hub/rail. The Short-Order Cook and
  // Competitive Eater ship INSTANTLY available (developer decision, Roster Growth
  // 1), as do the Pitmaster / Ranch Fountain / Sample Lady (Roster Growth 2 —
  // loadMeta's unlocked-set UNION migration hands them to veteran saves too);
  // the Slurper (sniper) stays Essence-gated.
  return { essence: 0, unlocked: ["arrow", "cannon", "frost", "zap", "cook", "eater", "pit", "ranch", "sample"], boughtCurrency: false, boughtLives: false, mapId: null, bestWave: 0, autoStart: "off" };
}
function loadMeta() {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      const meta = Object.assign(freshMeta(), parsed);
      // Save migration: UNION the saved unlocked list with the fresh defaults, so a
      // veteran save gains any newly-default-unlocked towers (cook/eater) while
      // keeping everything it had earned (e.g. a purchased sniper). Object.assign
      // above would otherwise let the saved array shadow the new defaults.
      const saved = Array.isArray(parsed.unlocked) ? parsed.unlocked : [];
      meta.unlocked = [...new Set([...freshMeta().unlocked, ...saved])];
      return meta;
    }
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
// v1 = the #83 original (no per-tower spent). v2 (Tower Rework) serializes each
// tower's `spent` so any FUTURE path deletion can refund exactly what was paid
// without a legacy price table. readSave accepts both; new writes are v2.
const SAVE_VERSION = 2;
const SAVE_VERSIONS_READABLE = [1, 2];

// A PLAYER'S SAVE MUST NEVER BREAK — and never lose value (developer-ratified,
// Issue #103; hardened in #106). The Tower Rework deleted/renamed upgrade paths
// that live inside #83 checkpoints AND repriced some surviving ones. On restore
// we MIGRATE rather than discard: a tower whose committed path id no longer
// exists is kept un-upgraded and the orphaned tiers' spend is REFUNDED into the
// run at FULL value (not the sell fraction — the change is ours, not the
// player's). v1 saves carry no per-tower `spent`, so a migrated v1 tower's Tips
// are reconstructed from THIS frozen table — never from live balance.json,
// which drifts (Issue #106 #2: #105 stage 3 repriced surviving theStall t1
// 250->500, so booking the live price would MINT Tips through sell).
//
// The table freezes the v1-era (pre-#105) tier prices for EVERY pre-rework
// upgrade path, orphaned and surviving alike — derived from data/balance.json
// at 7fd16b1 (the last commit before #105 merged) and frozen forever. Base
// costs were NOT repriced by #105 (verified against 7fd16b1: every tower's
// `cost` is unchanged), so a v1 tower's base spend is read live from tryBuild;
// only the tier prices below need freezing. A path being listed here does NOT
// mark it orphaned — that is decided live by `!upgrades[path]`; surviving rows
// only drive v1 spend-booking.
const LEGACY_TIER_COSTS = {
  // Orphaned (retired by #105) — refunded at full value on restore.
  competitionRub: [250, 550],   // pit — replaced by Whole Hog
  extraDressing:  [250, 550],   // ranch — the cone/coat kit retired
  widerNozzle:    [250, 600],   // ranch — the cone/coat kit retired
  costcoSaturday: [150, 250],   // sample — path retired (content guardrail)
  hardSell:       [150, 300],   // sample — the amp kit retired
  recordPace:     [300, 550],   // eater — replaced by The Tip Jar
  // Surviving (still in balance.json) — v1 re-applies book THESE frozen prices.
  theStall:       [250, 550],   // pit — REPRICED by #105 (t1 250->500 live)
  forkFrenzy:     [300, 500],   // arrow
  carvingStation: [250, 450],   // arrow
  birthdayParty:  [150, 300],   // zap
  teenageTable:   [150, 200],   // zap
  seasonedGriddle:[250, 500],   // cook
  slingingHash:   [250, 550],   // cook
  oneBigBite:     [300, 600],   // cannon
  speedEater:     [300, 700],   // cannon
  longExposure:   [250, 500],   // frost
  paparazzi:      [300, 600],   // frost
  extraSlurp:     [300, 550],   // sniper
  sillyStraw:     [300, 550],   // sniper
  waterDunk:      [300, 550],   // eater
};
// The #105-new paths (wholeHog/tipJar/quickPour/bigBottle/happyHour/onTheHouse)
// are intentionally ABSENT: no v1 save can carry a path that didn't exist
// pre-#105, so their v1 price is never consulted. The `|| tier.cost` fallback in
// the re-apply loop covers any future gap safely.

// Number-or-reject guard for the type-validation in readSave / rebuild
// (Issue #106 #1). Rejects strings, null, objects, NaN, Infinity — anything a
// hand-corrupted or bit-rotted blob might smuggle into a numeric field.
function isFiniteNumber(n) { return typeof n === "number" && Number.isFinite(n); }
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
      spent: t.spent,   // v2: the actual Tips sunk in (discounts included) — exact refunds forever after
      base: TOWER_BY_ID[t.typeId].cost,   // v2+: the base cost STAMPED at write time, so an orphan
                                          // refund (spent - base) can't skew if base is repriced later (Issue #106 #5)
      killCount: t.killCount,   // v2+: Tip Jar jackpot progress — must survive save/continue (Issue #106 #4)
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
// Read + validate the checkpoint. Unparseable JSON, an unknown version, a
// missing tower list, or an unknown map → null (discard silently, never crash).
// v1 saves stay readable — restoreRun migrates them (the never-lose-a-run rule).
//
// TYPE-VALIDATE the run scalars (Issue #106 #1): a parseable-but-garbage blob
// whose waveIndex/currency/lives isn't a real number must be DISCARDED here, not
// restored into a NaN zombie run (e.g. lives:{} -> Math.min({},max) = NaN, which
// is unlosable, and the closing saveCheckpoint would re-persist the garbage as a
// clean-looking v2 blob). Number-or-discard. Corrupt TOWER fields (a non-object
// entry, or a non-numeric per-tower spent) are NOT fatal — they're sanitized
// per-tower in rebuildTowerFromSave so one bad tower can't cost the player the
// whole run; that keeps the never-lose-value rule while still healing garbage.
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || !SAVE_VERSIONS_READABLE.includes(save.version) || !Array.isArray(save.towers)) return null;
    if (!MAPS.some((m) => m.id === save.mapId)) return null;
    if (!isFiniteNumber(save.waveIndex) || !isFiniteNumber(save.currency) || !isFiniteNumber(save.lives)) return null;
    return save;
  } catch (e) { return null; }
}
// The parsed checkpoint if one is resumable (for the hub's "Continue — Wave N"),
// else null.
function hasSave() { return readSave(); }

// The exact Tips a saved tower is worth — used to refund when its whole SEAT is
// lost (placement rejection, Issue #106 #3). v2 saves carry `spent` directly; v1
// saves (and any tower whose `spent` is corrupt) reconstruct it from the base
// cost plus the FROZEN pre-#105 tier prices. Always returns a finite number, so
// a single garbage tower can never NaN-poison the run's refund accumulator.
function savedTowerValue(ts) {
  const base = (TOWER_BY_ID[ts.typeId] && TOWER_BY_ID[ts.typeId].cost) || 0;
  if (isFiniteNumber(ts.spent)) return ts.spent;   // v2: exact
  const legacy = LEGACY_TIER_COSTS[ts.upgradePath] || [];
  let v = base;
  const tier = ts.upgradeTier || 0;
  for (let i = 0; i < tier; i++) v += legacy[i] || 0;
  return v;
}

// Rebuild one placed tower from its snapshot through the REAL code paths so
// `spent` and every signature flag reconstruct identically. Cost is bypassed
// (currency is already the saved wave-start value). ZERO Math.random: placement
// is tryBuild (RNG-free) and tiers re-apply via tryUpgrade's exact state
// mutations MINUS the cosmetic spawnUpgradeSparkles (which would consume RNG).
//
// MIGRATION (Tower Rework): returns the Tips to REFUND into the run. A committed
// path id the current balance.json doesn't know is an ORPHAN: the tower is kept
// un-upgraded and the orphaned tiers' spend comes back at FULL value (v2 saves
// carry the exact `spent`; v1 saves price the retired paths from
// LEGACY_TIER_COSTS). A rejected placement refunds the WHOLE tower (never
// vanishes it). An unknown tower TYPE is skipped whole (ids are frozen forever,
// so this is a corrupted-save guard, not a migration path — the boot backstop
// still keeps the run alive). Every return is a finite number of Tips.
function rebuildTowerFromSave(ts) {
  if (!ts || !TOWER_BY_ID[ts.typeId]) return 0;
  const savedType = game.selectedType, savedCurrency = game.currency;
  game.selectedType = ts.typeId;
  game.currency = Infinity;               // bypass the affordability check in tryBuild
  tryBuild(ts.x, ts.y);                   // real placement path → a proper tower object (spent = base)
  game.selectedType = savedType;
  game.currency = savedCurrency;
  const t = game.towers[game.towers.length - 1];
  if (!t || t.x !== ts.x || t.y !== ts.y) {
    // Placement REJECTED — corrupt coords, or a map/obstacle/spacing change
    // invalidated the saved seat ("maps will change a lot"). The seat is gone,
    // but never the value: refund the tower's FULL worth (Issue #106 #3), same
    // philosophy as the orphaned-path branch. No tower was pushed by tryBuild,
    // so there is nothing on the board to remove.
    return savedTowerValue(ts);
  }
  t.targeting = ts.targeting || "first";
  if (isFiniteNumber(ts.killCount)) t.killCount = ts.killCount;   // Tip Jar jackpot progress survives resume (Issue #106 #4)
  const upgrades = TOWER_BY_ID[ts.typeId].upgrades;
  const savedTier = ts.upgradeTier || 0;
  const spentKnown = isFiniteNumber(ts.spent);            // a v2 save with a valid spend
  const legacy = LEGACY_TIER_COSTS[ts.upgradePath] || []; // frozen v1-era tier prices
  if (savedTier > 0 && ts.upgradePath && !upgrades[ts.upgradePath]) {
    // The committed path was deleted/renamed by a rework — keep the seat
    // un-upgraded, refund the orphaned tiers at FULL value.
    if (spentKnown) {
      // v2: refund the upgrade spend = spent MINUS the base. Use the base
      // STAMPED in the save (frozen at write time), NOT the live cost, so a
      // future base reprice can't skew old-save refunds (Issue #106 #5). Older
      // v2 saves that predate the stamp fall back to the live base cost.
      const base = isFiniteNumber(ts.base) ? ts.base : TOWER_BY_ID[ts.typeId].cost;
      t.spent = base;                       // the kept seat's un-refunded base spend
      return Math.max(0, ts.spent - base);
    }
    // v1 / corrupt-spent: reconstruct the refund from the frozen legacy prices;
    // the seat keeps the live base spend tryBuild already set.
    let refund = 0;
    for (let i = 0; i < savedTier; i++) refund += legacy[i] || 0;
    return refund;
  }
  // Surviving path: re-apply each tier (current deltas), booking the spend the
  // player actually PAID — v1 from the FROZEN pre-#105 price, never the live one
  // (Issue #106 #2: theStall t1 was repriced 250->500, so the live price would
  // over-book and mint Tips through sell). v2 gets its exact `spent` below.
  for (let i = 0; i < savedTier; i++) {
    if (!ts.upgradePath || !upgrades[ts.upgradePath]) break;
    const tier = upgrades[ts.upgradePath].tiers[t.upgradeTier];
    if (!tier) break;
    t.spent += (legacy[i] != null ? legacy[i] : tier.cost);   // v1: frozen price; v2: overwritten below
    t.upgradePath = ts.upgradePath;       // commit → the other path locks out
    t.upgradeTier++;
    applyUpgradeDeltas(t, tier);          // rebuilds pierce/crumb/…/aura/support flags
  }
  // v2 saves know the EXACT Tips paid (support discounts included) — restore
  // it so sell refunds keep matching reality after a discounted purchase.
  if (spentKnown) t.spent = ts.spent;
  return 0;
}
// Resume the saved run: land in PREP of the saved wave with the board rebuilt.
// Returns true on success, false if there's no valid save.
//
// THE LAST-RESORT BACKSTOP: readSave rejects a type-invalid blob up front, and
// the whole rebuild then runs inside try/catch — if a malformed save throws
// ANYWHERE, the checkpoint is discarded and we report false, so the caller lands
// in the hub with META intact. Either way a garbage save is CLEARED (self-heal)
// and we settle in the menu phase. Bad localStorage must never brick boot or the
// Continue button, nor resume into a broken run (Issue #106 #1).
function restoreRun() {
  const save = readSave();
  if (!save) { clearSave(); game.phase = "menu"; return false; }   // no valid save → hub, discard any garbage blob
  try {
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
    game.zones = [];
    game.spawnQueue = []; game.killed = 0; game.coreHurtFlash = 0;
    game.score = 0; game.lastRun = null; game.selectedTower = null;
    game.prepElapsed = 0;
    // The first prep after a resume never auto-calls — the player gets a breather
    // to re-read the board before auto-start (if enabled) re-arms on the next wave.
    game.autoStartArmed = false;
    const deck = deckTypes();
    game.selectedType = deck.length ? deck[0].id : "arrow";
    // Rebuild the board; tiers orphaned by a rework (or a whole seat lost to a
    // rejected placement) refund at FULL value into the run, so it resumes with
    // the same total value it had (never-lose-a-run). Each return is a finite
    // number of Tips; the isFiniteNumber guard is belt-and-braces so one corrupt
    // tower can never NaN the whole accumulator and silently drop a sibling's
    // legitimate refund (Issue #106 NaN-isolation).
    let refund = 0;
    for (const ts of save.towers) {
      const r = rebuildTowerFromSave(ts);
      if (isFiniteNumber(r)) refund += r;
    }
    if (refund > 0) game.currency += refund;
    recomputeSupport();   // the manual tier re-apply above bypasses tryUpgrade's recompute
    restoring = false;
    saveCheckpoint();   // one clean v2 checkpoint reflecting the fully-rebuilt wave-start board
    setMessage(refund > 0
      ? "Resumed at Wave " + (game.waveIndex + 1) + " — the menu changed, so " + refund + " Tips from retired upgrades are back in your pocket"
      : "Resumed at Wave " + (game.waveIndex + 1) + " — seat more customers, then Send Out the food", 5);
    return true;
  } catch (e) {
    restoring = false;
    clearSave();          // the blob is unusable — discard it; META was never touched
    game.phase = "menu";  // land safely in the hub
    return false;
  }
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
  zones: [],   // belt puddles (zone applicators, Tower Rework) — wave-scoped, never serialized
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
  game.zones = [];
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
    slurpTargets: [], slurpShow: 0, slurpSoundTimer: 0,   // Milkshake Slurper's / Competitive Eater's locked dish(es)
    // Roster Growth 1 state (the Competitive Eater's kill combo — tower state
    // only, no enemy-side status; base-only since the Tower Rework).
    combo: 0, comboCap: def.comboCap || 0, comboRamp: def.comboRamp || 0,   // Competitive Eater combo (bite-speed ramp)
    biteFloor: def.biteFloor || 0,   // Eater cooldown floor — haste can never ramp bites below this (Tower Rework guard)
    jackpotEvery: def.jackpotEvery || 0, jackpotTips: def.jackpotTips || 0, killCount: 0,   // Tip Jar t2: every-Nth-kill bonus (deterministic cadence)
    // Roster Growth 2 status-tower stats (balance.json values; 0/neutral for
    // every other tower — the pit branch + the smoke aura read these).
    smokeDps: def.smokeDps || 0, smokeDuration: def.smokeDuration || 0, smokeStacks: def.smokeStacks || 0,
    smokeTargets: def.smokeTargets || 1,   // Whole Hog t2 (pit): dishes smoked at once (dual lock)
    // Sample Lady value tags (On the House t1): every tagPeriod seconds, flag
    // a dish to pay tagBonus extra Tips if it's eaten within tagDur.
    tagPeriod: def.tagPeriod || 0, tagBonus: def.tagBonus || 0, tagDur: def.tagDur || 0, tagTimer: 0,
    // Tower Rework shared systems (all neutral/zero until a kit sets them):
    // ambient zone aura — a tower-centered zone applicator ticking on a cadence;
    auraPeriod: def.auraPeriod || 0, auraRadius: def.auraRadius || 0, auraSrc: def.auraSrc || null, auraTimer: 0,
    // the glue-slow (maple syrup) — a single-stack refreshable full slow;
    glueFactor: def.glueFactor != null ? def.glueFactor : 1, glueDur: def.glueDur || 0, glueTargets: def.glueTargets || 1,
    trailRadius: 0, trailLife: 0, trailCap: 0,   // Syrup Trail t2: puddle params (0 = no trail)
    // tower-proximity support PROVIDER stats (what this tower grants in range);
    supportHaste: def.supportHaste != null ? def.supportHaste : 1,
    supportDamage: def.supportDamage != null ? def.supportDamage : 1,
    supportDiscount: def.supportDiscount || 0,
    // …and the RECEIVED buffs (recomputed by recomputeSupport on board changes).
    buffHasteMul: 1, buffDamageMul: 1, buffDiscount: 0,
  });
  spawnRing(x, y, def.color, 34, 0.4);
  FX.place();
  recomputeSupport();   // a new seat may grant or receive proximity buffs
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
  // Roster Growth 2 tier signature (kept by the rework).
  if (d.smokeStacksAdd) t.smokeStacks += d.smokeStacksAdd;       // The Stall t1 (pit): a deeper smoke-stack cap
  // Tower Rework tier vocabulary (Issue #103 — the reworked kits).
  if (d.smokeTargetsAdd) t.smokeTargets += d.smokeTargetsAdd;    // Whole Hog t2 (pit): smokes another dish at once (dual lock)
  if (d.auraPeriod) { t.auraPeriod = d.auraPeriod; if (d.auraRadius) t.auraRadius = d.auraRadius; if (d.auraSrc) t.auraSrc = d.auraSrc; }   // The Stall t2 (pit): the ambient smoke aura
  if (d.glueTargetsAdd) t.glueTargets += d.glueTargetsAdd;       // Big Bottle t2 (syrup): globs several dishes at once
  if (d.trailCap) { t.trailCap = d.trailCap; t.trailRadius = d.trailRadius || 0; t.trailLife = d.trailLife || 0; }   // Quick Pour t2 (syrup): the Syrup Trail puddle
  if (d.supportHaste) t.supportHaste = d.supportHaste;           // sample aura tiers SET the haste (absolute — reads clean in the JSON)
  if (d.supportDamage) t.supportDamage = d.supportDamage;        // Happy Hour t2 (sample): the aura also adds damage
  if (d.supportDiscount) t.supportDiscount = d.supportDiscount;  // (reserved: a deeper-discount tier)
  if (d.tagPeriod) { t.tagPeriod = d.tagPeriod; t.tagBonus = d.tagBonus || 0; t.tagDur = d.tagDur || 0; }   // On the House t1 (sample): value tags
  if (d.jackpotEvery) { t.jackpotEvery = d.jackpotEvery; t.jackpotTips = d.jackpotTips || 0; }   // Tip Jar t2 (eater): every-Nth-kill bonus
}

// Buy the next tier of pathId for placed tower t. The first purchase commits the
// tower to that path and locks the other out for good.
function tryUpgrade(t, pathId) {
  if (t.upgradeTier >= MAX_TIER) { FX.deny(); setMessage("This customer is fully upgraded"); return; }
  const upgrades = TOWER_BY_ID[t.typeId].upgrades;
  if (t.upgradePath && t.upgradePath !== pathId) { FX.deny(); setMessage("Locked into " + upgrades[t.upgradePath].name); return; }
  const tier = nextTier(t, pathId);
  if (!tier) { FX.deny(); return; }
  // The REAL price: the proximity support discount applies here AND in the
  // upgrade sheet's displayed chip (same helper), so the sheet self-teaches.
  const price = tierCostFor(t, tier);
  if (game.currency < price) { FX.deny(); setMessage("Not enough Tips for " + upgrades[pathId].name + " (need " + price + ")"); return; }
  game.currency -= price;
  t.spent += price;
  t.upgradePath = pathId;   // commit → the other path is now locked out
  t.upgradeTier++;
  applyUpgradeDeltas(t, tier);
  t.upgradeFlash = 0.6;
  spawnUpgradeSparkles(t);
  FX.upgrade();
  recomputeSupport();   // a tier can widen/strengthen a support aura
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
  recomputeSupport();   // a sold seat may have been granting (or receiving) buffs
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
    updateZones(step);      // belt puddles catch passers BEFORE status ticks, so a fresh coat ticks this frame
    updateStatuses(step);   // dot ticks + amp expiry BEFORE movement: a tick kill this frame prevents this frame's leak
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
    // dots/ampMul/ampTimer/ampBonus: the status layer (Roster Growth 2) — plain
    // fields like slowTimer/freezeTimer, empty/neutral until a status tower acts.
    game.enemies.push({ typeId, dist: 0, speed: game.waveSpeed * et.speedMul, hp, maxHp: hp, radius: et.radius, bounty: et.bounty, hurtFlash: 0, slowTimer: 0, slowFactor: 1, freezeTimer: 0, dots: [], ampMul: 1, ampTimer: 0, ampBonus: 0, ampBonusTimer: 0 });
  }
}

function moveEnemies(step) {
  for (const e of game.enemies) {
    let speed = e.speed;
    // Frozen dishes are stopped dead (freeze owns the full STOP); once thawed the
    // slow lingers for the rest of slowTimer.
    if (e.freezeTimer > 0) { e.freezeTimer -= step; speed = 0; }
    else {
      // Slow CHANNELS never multiply (developer ruling 2026-07-07): the legacy
      // thaw-slow (slowFactor) and the status slow (statusSlowFactor) each cap
      // the speed independently, and the STRONGEST single slow wins across them —
      // never 0.62 × 0.25 ≈ 0.16× (the vetoed frost×syrup near-standstill).
      const legacy = e.slowTimer > 0 ? e.slowFactor : 1;
      speed *= Math.min(legacy, statusSlowFactor(e));   // status factor is 1 when no dot carries a slow
    }
    if (e.slowTimer > 0) { e.slowTimer -= step; if (e.slowTimer <= 0) e.slowFactor = 1; }
    e.dist += speed * step;
    const p = pointAtDistance(e.dist);
    e.x = p.x; e.y = p.y;
    if (e.hurtFlash > 0) e.hurtFlash -= step;
    if (e.dist >= PATH_LENGTH) { e.reachedCore = true; game.lives = Math.max(0, game.lives - 1); game.coreHurtFlash = 0.35; game.shake = 6; FX.leak(); }
  }
  game.enemies = game.enemies.filter((e) => !e.reachedCore);
}

/* =========================================================================
   ENEMY STATUS LAYER (Roster Growth 2) — the generic gateway six of the
   researched towers ride. Statuses are PLAIN FIELDS on the enemy object (the
   slowTimer/freezeTimer precedent — no class machinery):

     e.dots     — stacking damage-over-time entries, ONE per source kind
                  ("smoke", "ranch", …), so the stack cap is per source type:
                  { src, dps, dpsPerStack, stacks, maxStacks, duration,
                    slowPerStack, slowFloor, tickIn }
     e.ampMul   — vulnerability multiplier on ALL damage taken (1 = none);
     e.ampTimer   non-stacking, strongest wins, duration refreshes;
     e.ampBonus — extra Tips paid on the marked dish's death (the amp payload
                  the Sample Lady's Loss Leader uses; rides the amp timer).

   Ticking is DISCRETE (every STATUS_TICK seconds) and goes through the normal
   applyDamage path, so amp multiplies it, kill credit / bounties / FX all work,
   and a dot death is a normal death. The layer's own bookkeeping (apply /
   stack / expiry / slow / tick scheduling) consumes ZERO Math.random — the
   only RNG a tick can reach is applyDamage's cosmetic sparks, identical to any
   other hit, and no reference-build tower applies statuses so the gate never
   sees it (the RG1 cook-sear ruling).
   Tick order (update): towers fire → projectiles land → spawns → STATUS TICKS →
   movement (so a dot kill this frame prevents this frame's leak) → wave end.
   ========================================================================= */

const STATUS_TICK = 0.5;   // seconds between dot ticks (total dot damage = dps·duration when duration is a multiple)

// Land (or refresh) a stacking DOT of kind `src` on a dish. Reapply: +1 stack
// (capped at maxStacks), duration restarts, and strengths take the strongest
// applier seen (two towers sharing a source kind share the entry + cap).
function applyDot(e, src, opts) {
  if (!e.dots) e.dots = [];
  let d = e.dots.find((x) => x.src === src);
  if (!d) {
    d = { src, dps: 0, dpsPerStack: 0, stacks: 0, maxStacks: 1, duration: 0, slowPerStack: 0, slowFloor: 1, tickIn: STATUS_TICK };
    e.dots.push(d);
  }
  d.maxStacks = Math.max(d.maxStacks, opts.maxStacks || 1);
  d.stacks = Math.min(d.stacks + 1, d.maxStacks);
  // Refresh to the STRONGEST clock (Math.max), matching every other field's
  // strongest-wins shape (Issue #107 #8): a weaker applier can never CUT a
  // stronger dot's remaining time. Byte-identical today — every same-src
  // applier shares one duration (pit smoke 4.0, ranch syrup 2.5; no tier adds
  // a *DurationAdd), so Math.max(equal, equal) == the old assignment; the guard
  // arms the first glueDur/smokeDuration tier.
  d.duration = Math.max(d.duration, opts.duration);
  d.dps = Math.max(d.dps, opts.dps || 0);
  d.dpsPerStack = Math.max(d.dpsPerStack, opts.dpsPerStack || 0);
  d.slowPerStack = Math.max(d.slowPerStack, opts.slowPerStack || 0);
  d.slowFloor = Math.min(d.slowFloor, opts.slowFloor != null ? opts.slowFloor : 1);
  // Zone payload (Tower Rework): a dot can carry belt-puddle params — a dish
  // that DIES with this dot active leaves the puddle (see applyDamage). The
  // latest trail-carrying applier wins the puddle's shape.
  if (opts.trail) d.trail = opts.trail;
  FX.statusApply(src);
  return d;
}

// Jump an existing dot of kind `src` straight to its stack cap (Ranch Keg's
// instant full drench). No-op if the dish has no such dot yet.
function maxDotStacks(e, src) {
  const d = e.dots && e.dots.find((x) => x.src === src);
  if (d) d.stacks = d.maxStacks;
}

// Mark a dish. TWO independent channels ride this one entry point, each
// non-stacking with strongest-wins + equal-refreshes (Issue #107 #7):
//   • damage VULNERABILITY (ampMul / ampTimer) — mul× on ALL damage while live;
//   • a value BONUS (ampBonus / ampBonusTimer) — extra Tips on a marked death
//     (the Sample Lady's value tag) — on its OWN clock, so a stronger
//     damage-amp landing can't silently truncate the tag's remaining window.
// Returns true iff SOMETHING landed, so the value-tag cadence knows whether to
// reset its timer + play FX; a mark that couldn't land leaves the caller to
// retry next tick (no phantom cadence-reset, no phantom FX).
function applyAmp(e, mul, duration, bonus = 0) {
  let landed = false;
  if (mul > 1) {                                              // a real damage amp
    if (mul > (e.ampMul || 1)) { e.ampMul = mul; e.ampTimer = duration; landed = true; }          // stronger → replace
    else if (mul === (e.ampMul || 1)) { e.ampTimer = Math.max(e.ampTimer || 0, duration); landed = true; }  // equal → refresh
    // weaker mul → ignored (leaves the stronger amp untouched)
  }
  if (bonus > 0) {                                            // a value tag
    if (bonus > (e.ampBonus || 0)) { e.ampBonus = bonus; e.ampBonusTimer = duration; landed = true; }              // stronger → replace
    else if (bonus === (e.ampBonus || 0)) { e.ampBonusTimer = Math.max(e.ampBonusTimer || 0, duration); landed = true; }  // equal → refresh
    // weaker bonus → ignored
  }
  // The hit sound fires ONLY for a real damage amp (mul > 1). A zero-damage
  // value tag is silent — the Sample Lady never attacks (Issue #107 #5); its
  // visual is the offer sparkle + the dish's flag, and a bespoke tag sound is
  // Issue #64's. statusApply → audio.hit() would be a phantom hit here.
  if (landed && mul > 1) FX.statusApply("amp");
  return landed;
}

// The combined speed multiplier the enemy's dot slows impose (1 = none). Each
// slowing source computes max(floor, 1 − perStack·stacks); the STRONGEST single
// source wins (sources don't multiply together — no stacking to a standstill).
function statusSlowFactor(e) {
  if (!e.dots || e.dots.length === 0) return 1;
  let f = 1;
  for (const d of e.dots) {
    if (d.slowPerStack > 0) f = Math.min(f, Math.max(d.slowFloor, 1 - d.slowPerStack * d.stacks));
  }
  return f;
}

// Advance every status clock: dot ticks (through applyDamage — normal deaths,
// bounties, amp all apply) and amp expiry. Zero Math.random.
function updateStatuses(step) {
  for (const e of [...game.enemies]) {
    // Two independent amp clocks (Issue #107 #7): the damage-vulnerability mul
    // and the value-tag bonus each expire on their own timer, so neither can
    // cut the other short.
    if (e.ampTimer > 0) { e.ampTimer -= step; if (e.ampTimer <= 0) e.ampMul = 1; }
    if (e.ampBonusTimer > 0) { e.ampBonusTimer -= step; if (e.ampBonusTimer <= 0) e.ampBonus = 0; }
    if (!e.dots || e.dots.length === 0) continue;
    // EPS absorbs fixed-timestep float drift so a tick scheduled exactly at the
    // dot's end (duration a multiple of STATUS_TICK) still fires before expiry.
    const EPS = 1e-9;
    let died = false;
    for (const d of e.dots) {
      d.duration -= step;
      d.tickIn -= step;
      if (d.tickIn <= EPS) {
        d.tickIn += STATUS_TICK;
        const dmg = (d.dps + d.dpsPerStack * d.stacks) * STATUS_TICK;
        if (dmg > 0) {
          applyDamage(e, dmg);
          FX.statusTick(d.src);
          if (!game.enemies.includes(e)) { died = true; break; }   // the tick ate it
        }
      }
    }
    if (!died) e.dots = e.dots.filter((d) => d.duration > EPS);
  }
}

/* =========================================================================
   ZONE APPLICATORS (Tower Rework) — one system, two shapes. A zone is a region
   that applies a STATUS to dishes inside it through the existing status layer
   (applyDot — bounty/kill credit/FX all compose, the #91 rule):

     ambient aura  — tower-centered, ticks on the tower's own cadence
                     (auraPeriod/auraRadius/auraSrc fields; see updateTowers);
     belt puddle   — a point zone with a LIFETIME and a CAPACITY: it applies
                     its status once to each of the first `cap` dishes that
                     touch it, then it's spent (game.zones, updateZones).

   ZERO Math.random anywhere here — spawning, ticking, and expiry are all
   deterministic, so the seeded sim stays byte-stable. FX hooks are no-op by
   default. Zones are wave-scoped: never serialized, cleared when the wave
   resolves (the belt gets wiped between rounds).
   ========================================================================= */

// The status payload a tower's zone (aura or puddle) AND its direct application
// share, per source kind — ONE seam, so a support damage-buff and any tier that
// deepens the attack reach the tower's DOT the same way (Issue #107 #1). The
// smoke payload scales its dps by the provider's received damage buff
// (buffDamageMul, Sample Lady's Happy Hour) — the DOT analogue of towerDamage()
// wrapping t.damage, so "customers in the aura bite harder" is no longer a no-op
// over a dot tower whose direct damage is 0. Syrup carries no dps → the buff
// can't touch it (a pure-control tower stays pure control; asserted in a test).
function towerStatusOpts(t, src) {
  if (src === "smoke") return { dpsPerStack: t.smokeDps * (t.buffDamageMul || 1), duration: t.smokeDuration, maxStacks: t.smokeStacks };
  if (src === "syrup") return glueOpts(t);
  return null;
}

// Drop a belt puddle. `victims` tracks which dishes it has already caught so
// capacity means "distinct passers", not re-applications.
function spawnZone(z) {
  game.zones.push({ victims: [], ...z });
  FX.zoneSpawn(z.kind);
}

// Advance every belt puddle: catch dishes that touch it (up to its capacity),
// expire it by lifetime or once spent. Runs before status ticks in update().
function updateZones(step) {
  if (game.zones.length === 0) return;
  let anyDead = false;
  for (const z of game.zones) {
    z.life -= step;
    if (z.life <= 0) { z.dead = true; anyDead = true; continue; }
    for (const e of game.enemies) {
      if (z.victims.length >= z.cap) break;
      if (z.victims.includes(e)) continue;
      // Capacity means "distinct NEW passers": a dish already carrying this
      // puddle's status must not burn a seat (Issue #107 #4) — otherwise a
      // puddle dropped in a glued pack dies on its first tick having caught
      // nobody new, nullifying the t2 signature in exactly its crowd case.
      if (e.dots && e.dots.some((d) => d.src === z.src && d.duration > 0)) continue;
      const dx = z.x - e.x, dy = z.y - e.y, rr = z.radius + e.radius;   // dist² — no sqrt on the hot path
      if (dx * dx + dy * dy <= rr * rr) {
        applyDot(e, z.src, z.opts);
        z.victims.push(e);
      }
    }
    if (z.victims.length >= z.cap) { z.dead = true; anyDead = true; }   // spent — every seat taken
  }
  if (anyDead) game.zones = game.zones.filter((z) => !z.dead);   // only rebuild the list when something expired
}

/* -------------------------------------------------------------------------
   THE GLUE-SLOW (maple syrup) — a strong, duration-based, REFRESHABLE full
   slow, deliberately DISTINCT from the Photographer's freeze→slow chain in
   moveEnemies: it rides the status layer as a single-stack dot (src "syrup")
   whose slow floor IS its strength, so statusSlowFactor composes it with
   everything else (strongest single source wins, never a full stop — the
   role fence: the Photographer owns the hard STOP, syrup owns the long DRAG).
   Reapplying restarts the duration (applyDot's refresh path) — that is the
   "refreshable" contract the behavior test pins.
   ------------------------------------------------------------------------- */

// The syrup dot payload for a glue-slinging tower. glueFactor is the speed
// multiplier while stuck (1 = no slow — the neutral default); glueDur the
// clock; trail* (when set by the Syrup Trail tier) makes a stuck death leave
// a belt puddle carrying THIS SAME payload (minus the trail, so puddles
// never chain into more puddles).
function glueOpts(t) {
  const o = {
    duration: t.glueDur, maxStacks: 1,
    slowPerStack: 1 - t.glueFactor, slowFloor: t.glueFactor,
  };
  if (t.trailCap > 0) {
    // The puddle carries THIS SAME glue payload (a copy, not a re-spelling of
    // the same four fields), minus the trail so puddles never chain into puddles.
    o.trail = { radius: t.trailRadius, life: t.trailLife, cap: t.trailCap,
                opts: { duration: o.duration, maxStacks: o.maxStacks, slowPerStack: o.slowPerStack, slowFloor: o.slowFloor } };
  }
  return o;
}

/* =========================================================================
   TOWER-PROXIMITY SUPPORT EFFECTS (Tower Rework) — ONE radius check from a
   support tower to the towers in its range → an effect set: attack-haste,
   +damage, and an upgrade DISCOUNT. The provider's aura radius IS its range
   stat, so the stock placement ghost / hover ring shows the aura for free.

   Received buffs are plain fields (buffHasteMul/buffDamageMul/buffDiscount),
   recomputed on every BOARD change (build / upgrade / sell / restore) — never
   per-frame, and towers don't move, so that's complete. Overlapping providers
   do NOT stack: the strongest single provider wins per effect (the amp rule's
   shape — support multiplies a board once, it doesn't compound). Zero RNG.
   ========================================================================= */

function recomputeSupport() {
  for (const t of game.towers) { t.buffHasteMul = 1; t.buffDamageMul = 1; t.buffDiscount = 0; }
  for (const s of game.towers) {
    const gives = s.supportHaste < 1 || s.supportDamage > 1 || s.supportDiscount > 0;
    if (!gives) continue;
    for (const t of game.towers) {
      if (t === s || distance(s, t) > s.range) continue;
      if (s.supportHaste < 1) t.buffHasteMul = Math.min(t.buffHasteMul, s.supportHaste);
      if (s.supportDamage > 1) t.buffDamageMul = Math.max(t.buffDamageMul, s.supportDamage);
      if (s.supportDiscount > 0) t.buffDiscount = Math.max(t.buffDiscount, s.supportDiscount);
    }
  }
}

// Effective attack numbers under proximity buffs. Unbuffed towers multiply by
// exactly 1 — bit-identical to the pre-rework math, which is what keeps the
// frozen reference build (and so the CI gate) byte-stable.
function towerCooldown(t) { return t.cooldown * (t.buffHasteMul || 1); }
function towerDamage(t) { return t.damage * (t.buffDamageMul || 1); }

// The REAL price of the next tier for THIS placed tower: the support discount
// applies here, and the upgrade sheet displays the same number (self-teaching).
// Rounded to whole Tips; an undiscounted tower pays tier.cost exactly.
function tierCostFor(t, tier) {
  const d = t.buffDiscount || 0;
  return d > 0 ? Math.max(1, Math.round(tier.cost * (1 - d))) : tier.cost;
}

// The four targeting modes a player can set per tower. "first" (furthest along
// the path) is the default and matches the balance sim's frontmost behavior.
const TARGETING_MODES = [
  ["first", "First"], ["last", "Last"], ["strong", "Strong"], ["close", "Close"],
];

// The priority score for dish `e` under tower `t`'s targeting mode (higher =
// picked first). ONE source for pickTarget's single-target choice and the
// multi-target towers' ordering (the Syrup Slinger sorts by this so 'last' /
// 'strong' / 'close' actually change who it globs — Issue #107 #3).
function targetingKey(t, e) {
  switch (t.targeting) {
    case "last": return -e.dist;          // least far along the path
    case "strong": return e.hp;           // most current HP
    case "close": return -distance(t, e); // nearest to the tower
    default: return e.dist;               // "first": furthest along the path
  }
}

function pickTarget(t) {
  let best = null, bestKey = -Infinity;
  for (const e of game.enemies) {
    if (distance(t, e) > t.range) continue;
    const key = targetingKey(t, e);
    if (key > bestKey) { bestKey = key; best = e; }
  }
  return best;
}

// The Competitive Eater's effective bite cooldown: consecutive kills (combo)
// ramp the bite RATE toward a cap. More combo → shorter cooldown → faster
// bites — but never past biteFloor, the COOLDOWN-FLOOR GUARD: the Water Dunk
// speed tiers multiply the base cooldown, and without the floor their haste
// could compound with combo stacking into a runaway. Pure (no RNG, no side
// effects) so the behavior test can assert both the ramp and the floor.
function eaterBiteCooldown(t) {
  const stacks = Math.min(t.combo, t.comboCap);
  return Math.max(t.biteFloor || 0, towerCooldown(t) / (1 + stacks * t.comboRamp));
}

function updateTowers(step) {
  for (const t of game.towers) {
    if (t.upgradeFlash > 0) t.upgradeFlash -= step;
    if (t.lungeTimer > 0) t.lungeTimer -= step;
    if (t.slurpShow > 0) t.slurpShow -= step;
    if (t.slurpSoundTimer > 0) t.slurpSoundTimer -= step;
    t.cdTimer -= step;
    // Ambient zone aura (the tower-centered shape of the zone-applicator
    // system): on its own cadence, apply this tower's status to every dish
    // near the tower — through the normal status layer, zero RNG. Inert for
    // every tower without an auraPeriod (the whole roster until a kit sets one).
    if (t.auraPeriod > 0 && game.phase === "wave") {
      t.auraTimer -= step;
      if (t.auraTimer <= 0) {
        t.auraTimer += t.auraPeriod;
        const opts = towerStatusOpts(t, t.auraSrc);
        if (opts) {
          for (const e of game.enemies) {
            if (distance(t, e) <= t.auraRadius + e.radius) applyDot(e, t.auraSrc, opts);
          }
        }
      }
    }
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
          for (const e of t.slurpTargets) fireProjectile(t, e); t.cdTimer = towerCooldown(t);
          if (t.slurpSoundTimer <= 0) { FX.shoot("sniper", t.upgradePath); t.slurpSoundTimer = 0.32; }   // ONE shared sip sound, not per-straw
        }
      }
      continue;
    }
    // The Competitive Eater locks ONE dish (the Slurper's lock-on machinery) and
    // devours it in rapid bites. Consecutive KILLS without an empty-lane gap build
    // a combo that ramps bite speed to a cap; the combo resets when no dish is
    // available. NO enemy-side status — the combo is tower state only.
    if (t.typeId === "eater") {
      t.slurpTargets = t.slurpTargets.filter((e) => game.enemies.includes(e) && distance(t, e) <= t.range);
      if (t.slurpTargets.length === 0) {
        const free = game.enemies.filter((e) => distance(t, e) <= t.range).sort((a, b) => b.dist - a.dist);
        if (free.length) t.slurpTargets.push(free[0]);
      }
      if (t.slurpTargets.length === 0) { t.combo = 0; continue; }   // empty lane → the combo resets
      t.slurpShow = 0.12;   // keep the "devouring this dish" marker drawn between bites
      if (t.cdTimer <= 0) {
        const target = t.slurpTargets[0];
        applyDamage(target, towerDamage(t));
        if (!game.enemies.includes(target)) {   // the bite KILLED it
          t.combo = Math.min(t.combo + 1, t.comboCap);   // consecutive kill → ramp toward the cap
          t.slurpTargets = [];                            // freed; re-locks next tick if a dish is in range
          // The Tip Jar t2: EVERY jackpotEvery-th dish this eater clears pays a
          // flat Tips bonus — a deterministic every-Nth counter, never a chance
          // roll (zero Math.random keeps the seeded sim byte-stable).
          if (t.jackpotEvery > 0) {
            t.killCount++;
            if (t.killCount % t.jackpotEvery === 0) {
              game.currency += t.jackpotTips; game.score += t.jackpotTips;
              spawnFloatText(target.x, target.y - 24, "+$" + t.jackpotTips + " big tip", COLOR.essence);
            }
          }
        }
        t.cdTimer = eaterBiteCooldown(t);
        if (t.slurpSoundTimer <= 0) { FX.shoot("eater", t.upgradePath); t.slurpSoundTimer = 0.3; }
      }
      continue;
    }
    // The Pitmaster locks a dish (the Slurper's lock-on machinery) and keeps
    // basting it: each application lands a smoke-stack (the stacking DOT — dps
    // rides the stack count). Whole Hog t2 raises smokeTargets so he racks TWO
    // dishes at once (the multi-straw pattern; the count is FROZEN design).
    // His ambient smoke aura (The Stall t2) is the generic aura block above.
    if (t.typeId === "pit") {
      const maxRacks = t.smokeTargets || 1;
      t.slurpTargets = t.slurpTargets.filter((e) => game.enemies.includes(e) && distance(t, e) <= t.range);
      if (t.slurpTargets.length < maxRacks) {
        const free = game.enemies.filter((e) => distance(t, e) <= t.range && !t.slurpTargets.includes(e)).sort((a, b) => b.dist - a.dist);
        for (const e of free) { if (t.slurpTargets.length >= maxRacks) break; t.slurpTargets.push(e); }
      }
      if (t.slurpTargets.length === 0) continue;
      t.slurpShow = 0.12;   // keep the smoke stream(s) drawn between bastes
      if (t.cdTimer <= 0) {
        const opts = towerStatusOpts(t, "smoke");   // ONE payload seam (was an inline literal — drift risk): now buff-aware (Issue #107 #1)
        for (const target of t.slurpTargets) {
          applyDot(target, "smoke", opts);
          spawnSmokePuff(target.x, target.y, target.radius);
        }
        t.cdTimer = towerCooldown(t);
        if (t.slurpSoundTimer <= 0) { FX.shoot("pit", t.upgradePath); t.slurpSoundTimer = 0.4; }
      }
      continue;
    }
    // The Syrup Slinger (internal id `ranch`, frozen forever): slings a maple-
    // syrup glob at its priority target — an IMMEDIATE full glue-slow, strong,
    // duration-based, refreshable, and ZERO damage (pure control: the
    // Photographer owns the hard STOP, syrup owns the long DRAG). The Big
    // Bottle t2 raises glueTargets so one squeeze globs several dishes (the
    // paparazzi multi-shot pattern; the count is FROZEN design). Quick Pour t2
    // arms the Syrup Trail — the puddle rides the glue dot (see glueOpts).
    if (t.typeId === "ranch") {
      if (t.cdTimer > 0) continue;
      const globs = t.glueTargets || 1;
      // Order by the player's TARGETING mode (Issue #107 #3 — the old kit
      // honored it via pickTarget; the rework hardcoded frontmost). The
      // prefer-unglued SPREAD rides on top as a tiebreak LAYER: un-glued dishes
      // first (in the chosen order), topping up with refreshes only when
      // everything in range is already stuck — a control tower that re-coats
      // the same dish forever is wasted.
      const inRange = game.enemies.filter((e) => distance(t, e) <= t.range).sort((a, b) => targetingKey(t, b) - targetingKey(t, a));
      if (!inRange.length) continue;
      const unglued = inRange.filter((e) => !e.dots || !e.dots.some((d) => d.src === "syrup" && d.duration > 0));
      const targets = unglued.concat(inRange.filter((e) => !unglued.includes(e))).slice(0, globs);
      const opts = glueOpts(t);   // one payload for the whole squeeze (hoisted out of the glob loop)
      for (const e of targets) {
        applyDot(e, "syrup", opts);
        spawnSyrupGlob(e.x, e.y, e.radius);
      }
      t.lungeTimer = LUNGE_DUR; t.lungeAngle = Math.atan2(targets[0].y - t.y, targets[0].x - t.x);
      t.cdTimer = towerCooldown(t);
      if (t.slurpSoundTimer <= 0) { FX.shoot("ranch", t.upgradePath); t.slurpSoundTimer = 0.35; }
      continue;
    }
    // The Sample Lady is PURE SUPPORT (Tower Rework): she never attacks — her
    // aura (the tower-proximity system, radius = her range stat) hastes and
    // discounts nearby customers via recomputeSupport, entirely off-tick. Her
    // only per-tick verb is On the House t1: every tagPeriod seconds she flags
    // the frontmost unflagged dish in her aura to pay bonus Tips when eaten —
    // a deterministic cadence (a timer, never a chance roll). The sampling
    // animation itself is flavor (render-side), not a mechanic.
    if (TOWER_BY_ID[t.typeId].behavior === "support") {
      if (t.tagPeriod > 0 && game.phase === "wave") {
        t.tagTimer -= step;
        if (t.tagTimer <= 0) {
          let best = null, bestKey = -Infinity;
          for (const e of game.enemies) {
            if (e.ampBonus > 0 || distance(t, e) > t.range) continue;   // already flagged / out of aura
            if (e.dist > bestKey) { bestKey = e.dist; best = e; }
          }
          // A VALUE tag (worth-more-on-death, ZERO damage): reset the cadence,
          // spend the lunge + offer sparkle, ONLY when the tag actually lands
          // (Issue #107 #7) — if a future stronger amp blocked it, retry next
          // tick instead of silently burning the cadence. No FX.shoot: the
          // Sample Lady never attacks, so a tag is silent (its read is the offer
          // sparkle + the dish's flag; a bespoke tag sound is Issue #64).
          if (best && applyAmp(best, 1, t.tagDur, t.tagBonus)) {
            spawnSampleOffer(best.x, best.y, best.radius);
            t.lungeTimer = LUNGE_DUR; t.lungeAngle = Math.atan2(best.y - t.y, best.x - t.x);
            t.tagTimer = t.tagPeriod;
          }
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
        t.cdTimer = towerCooldown(t);
        if (t.maxTargets > 3) FX.fourthHand();   // Birthday Party's party-horn accent (audio pass)
      }
    } else {
      const shots = t.freezeTargets || 1;   // Paparazzi t2: one flash freezes 2 dishes at once
      if (shots > 1) {
        // Mirror the multi branch: fire at the frontmost `shots` dishes (pile on if fewer).
        const inRange = game.enemies.filter((e) => distance(t, e) <= t.range).sort((a, b) => b.dist - a.dist);
        if (inRange.length) { for (let i = 0; i < shots; i++) fireProjectile(t, inRange[i % inRange.length]); t.cdTimer = towerCooldown(t); FX.doubleFreeze(); }
      } else {
        const target = pickTarget(t);
        if (target) { fireProjectile(t, target); t.cdTimer = towerCooldown(t); }
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
    applyDamage(target, towerDamage(t));
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
    applyDamage(target, towerDamage(t));
    spawnGrabHand(target.x, target.y, target.radius);
    FX.shoot(t.typeId, t.upgradePath);
    return;
  }
  // The Short-Order Cook sears the dish right on the griddle — instant multi-hit
  // damage, no travel (the multi branch in updateTowers fires this per target).
  // The old Order Up knockback-chance is DELETED (Tower Rework): it was the
  // roster's only chance-roll signature, and the backward-fling is once again
  // uniquely Big Appetite's. Stove on High (Seasoned Griddle t2) is now a pure
  // damage tier — no engine branch needed.
  if (t.typeId === "cook") {
    applyDamage(target, towerDamage(t));
    spawnSear(target.x, target.y, target.radius);
    FX.shoot(t.typeId, t.upgradePath);
    return;
  }
  // The Milkshake Slurper sips instantly up an attached straw (drawn by
  // drawSlurpStraws); the sip sound is throttled in updateTowers.
  if (t.typeId === "sniper") {
    applyDamage(target, towerDamage(t));
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
      damage: towerDamage(t), radius: 4, color: def.color, hits: [], maxHits: 2, life: 1.6,
    });
    FX.shoot(t.typeId, t.upgradePath);
    return;
  }
  game.projectiles.push({
    x: t.x, y: t.y, x0: t.x, y0: t.y, typeId: t.typeId, target,
    speed: 360,   // only arrow + frost reach here; the instant attackers returned above
    damage: towerDamage(t), radius: t.typeId === "cannon" ? 6 : 4, behavior: def.behavior, color: def.color,
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
  if (enemy.ampMul > 1) dmg *= enemy.ampMul;   // vulnerability mark: ALL damage sources hit harder (status layer)
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
    // Amp payload (status layer): a dish that dies MARKED pays its mark's bonus
    // Tips on top of the bounty (the Sample Lady's Loss Leader path sets this).
    if (enemy.ampBonus > 0) {
      game.currency += enemy.ampBonus;
      game.score += enemy.ampBonus;
      spawnFloatText(enemy.x, enemy.y - 24, "+$" + enemy.ampBonus + " sample", COLOR.essence);
    }
    // Syrup Trail (zone applicator): a dish that dies while STUCK leaves a
    // belt puddle behind — leaks leave nothing (moveEnemies just removes them).
    if (enemy.dots) {
      const sticky = enemy.dots.find((d) => d.trail && d.duration > 0);
      if (sticky) spawnZone({ kind: "syrup", x: enemy.x, y: enemy.y, src: sticky.src,
                              radius: sticky.trail.radius, life: sticky.trail.life, cap: sticky.trail.cap,
                              opts: sticky.trail.opts });
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
    game.zones = [];   // the belt is wiped between rounds — puddles never straddle a prep
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
// A quick griddle sizzle where the Short-Order Cook sears a dish: a hot flash ring
// + a small warm spark spray. Reuses the generic ring/spark particle types (no new
// draw code). Called only from the cook branch, so its RNG never touches the sim.
function spawnSear(x, y, r) {
  spawnRing(x, y, "#ffcaa0", (r || 10) + 8, 0.18);
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 70;
    game.particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.4 + Math.random() * 1.6, life: 0.2 + Math.random() * 0.18, maxLife: 0.4, color: i % 2 ? "#ffd27a" : "#ff9a5c" });
  }
}
// A soft hickory-smoke puff where the Pitmaster bastes a dish — gray curl sparks
// drifting UP (negative vy). Called only from the pit branch, so its RNG never
// touches the sim (the cook-sear ruling).
function spawnSmokePuff(x, y, r) {
  for (let i = 0; i < 3; i++) {
    const dx = (Math.random() - 0.5) * (r || 10);
    game.particles.push({ type: "spark", x: x + dx, y: y - (r || 10) * 0.6, vx: (Math.random() - 0.5) * 16, vy: -24 - Math.random() * 22, r: 1.8 + Math.random() * 1.8, life: 0.5 + Math.random() * 0.3, maxLife: 0.8, color: i % 2 ? "#9aa2ad" : "#c3c9d2" });
  }
}
// The Syrup Slinger's glob landing: a thick amber splat on the dish — a few
// heavy drops + a slow drip, so "that one is GLUED" reads instantly. Ranch-
// branch-only RNG, same ruling as the cook sear (never runs in the gate).
function spawnSyrupGlob(x, y, r) {
  spawnRing(x, y, "#d98a2e", (r || 10) + 7, 0.22);
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, sp = 24 + Math.random() * 46;
    game.particles.push({ type: "spark", x, y: y - (r || 10) * 0.4, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp * 0.6 + 14, r: 1.8 + Math.random() * 1.8, life: 0.3 + Math.random() * 0.22, maxLife: 0.52, color: i % 3 ? "#d98a2e" : "#b06a1a" });
  }
}
// The Sample Lady's offer: a tiny toothpick sparkle over the sampled dish.
// Sample-branch-only RNG, same ruling.
function spawnSampleOffer(x, y, r) {
  spawnRing(x, y, "#ff8fb5", (r || 10) + 8, 0.2);
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 40;
    game.particles.push({ type: "spark", x, y: y - (r || 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, r: 1.3, life: 0.25, maxLife: 0.25, color: "#ffcf4a" });
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

