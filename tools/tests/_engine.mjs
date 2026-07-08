// Shared loader + tiny assert for the behavior tests in tools/tests/*.test.mjs.
// NOT a test itself (the CI glob is *.test.mjs), so it never runs standalone.
//
// Loads the REAL DOM-free engine (src/data.js + src/engine.js) into this context
// exactly like tools/sim.mjs — one source of truth, no re-implementation — and
// exposes the internals a focused mechanic test needs (fireProjectile, etc.).
//
// House rule (CLAUDE.md "definition of verified"): every new mechanic ships with a
// targeted test here. Tests assert BEHAVIOR, never tuned numbers, so PR 5 can
// retune every balance value without touching a single test.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEngine() {
  globalThis.window = { BALANCE: JSON.parse(readFileSync(join(ROOT, "data", "balance.json"), "utf8")) };
  // A FUNCTIONAL in-memory localStorage (not the no-op stub) so the save-and-
  // continue roundtrip test can checkpoint -> restore through the real serialize/
  // read path. Existing mechanic tests never touch storage, so they're unaffected.
  const __store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (__store.has(k) ? __store.get(k) : null),
    setItem: (k, v) => __store.set(k, String(v)),
    removeItem: (k) => __store.delete(k),
  };
  // The epilogue is concatenated INTO the bundle so it shares lexical scope with
  // the engine's top-level const/function declarations (same trick as sim.mjs).
  const bundle =
    ["src/data.js", "src/engine.js"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n;\n") +
    `\n;globalThis.__ENGINE = {
       game, startRun, startNextWave, checkWaveEnd, endRun, tryBuild, tryUpgrade, sellTower, setTargeting,
       fireProjectile, moveProjectiles, update, applyDamage, moveEnemies,
       applyUpgradeDeltas, towerPaths, nextTier, updateTowers, TOWER_BY_ID, ENEMY_TYPES, RULES, canPlace, distance,
       loadMap, MAPS, pointAtDistance, eaterBiteCooldown,
       // Status layer (Roster Growth 2) — the DOT/AMP subsystem + its tick.
       applyDot, applyAmp, maxDotStacks, statusSlowFactor, updateStatuses, STATUS_TICK,
       // The side-effect hooks (no-ops headless) — exposed so a test can SPY on
       // them (e.g. proving a zero-damage value tag fires no attack/hit sound).
       FX,
       // Tower Rework shared systems: zone applicators + proximity support.
       spawnZone, updateZones, glueOpts, towerStatusOpts,
       recomputeSupport, towerCooldown, towerDamage, tierCostFor,
       // META accessor for the auto-start test (META is a let binding, so a
       // plain property would capture a stale reference).
       getMeta() { return META; },
       // Save & Continue (Issue #83) — the checkpoint subsystem the roundtrip test drives.
       serializeRun, saveCheckpoint, restoreRun, readSave, clearSave, hasSave,
       // reset() MUST set lives — at 0 lives checkLoss() flips the phase to "lost"
       // on the first update() tick and silently freezes all movement (bit two PR-2
       // review probes). Also give sane currency + a clean wave so update()-driven
       // tests run a live "wave" phase.
       reset() {
         game.enemies = []; game.projectiles = []; game.particles = []; game.zones = [];
         game.phase = "wave"; game.lives = game.maxLives = 20; game.currency = 500;
         game.waveIndex = 0; game.spawnQueue = []; game.spawnTimer = 0;
       },
     };`;
  vm.runInThisContext(bundle, { filename: "deckbound-test-bundle.js" });
  return globalThis.__ENGINE;
}

let failed = false;
// Throw-free assert so every check in a file runs and all failures are reported;
// the file calls done() at the end to set the exit code.
export function assert(cond, msg) {
  if (cond) { console.log("  ✓ " + msg); return; }
  console.error("  ✗ " + msg); failed = true;
}
export function done(name) {
  if (failed) { console.error(`FAIL ${name}`); process.exit(1); }
  console.log(`PASS ${name}`);
}

// A plain dish struct at a given position / path distance; high hp by default so
// it survives a hit unless a test wants a kill. Mirrors the fields the engine
// touches (see spawnWaveEnemies).
export function makeEnemy({ x = 0, y = 0, dist = 0, hp = 1e6, radius = 12, typeId = "mote", speed = 0, bounty = 5 } = {}) {
  return { typeId, x, y, dist, hp, maxHp: hp, radius, bounty, speed,
           hurtFlash: 0, slowTimer: 0, slowFactor: 1, freezeTimer: 0,
           dots: [], ampMul: 1, ampTimer: 0, ampBonus: 0, ampBonusTimer: 0 };
}

// A bare placed-tower struct with the fields fireProjectile + updateTowers read;
// override via opts. cdTimer 0 so it's ready to fire on the first updateTowers tick.
export function makeTower(typeId, opts = {}) {
  return { typeId, x: 0, y: 0, damage: 10, cooldown: 1, range: 1000, cdTimer: 0,
           pierce: false, crumbRadius: 0, crumbDamage: 0, knockbackBase: 0, knockbackSizeRef: 0,
           splash: 0, slowDur: 0, slowFactor: 1, freezeDur: 0, lungeTimer: 0, lungeAngle: 0,
           // Tower Rework fields default to neutral so a bare test tower behaves
           // like an un-buffed, un-jackpotted seat (Issue #107 cleanup).
           buffHasteMul: 1, buffDamageMul: 1, buffDiscount: 0, biteFloor: 0,
           jackpotEvery: 0, jackpotTips: 0, killCount: 0,
           slurpTargets: [], slurpShow: 0, slurpSoundTimer: 0, upgradeFlash: 0, ...opts };
}
