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
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  // The epilogue is concatenated INTO the bundle so it shares lexical scope with
  // the engine's top-level const/function declarations (same trick as sim.mjs).
  const bundle =
    ["src/data.js", "src/engine.js"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n;\n") +
    `\n;globalThis.__ENGINE = {
       game, startRun, tryBuild, tryUpgrade, fireProjectile, moveProjectiles, update,
       applyUpgradeDeltas, towerPaths, nextTier, TOWER_BY_ID, SLOTS, distance,
       reset() { game.enemies = []; game.projectiles = []; game.particles = []; game.phase = "wave"; },
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
export function makeEnemy({ x = 0, y = 0, dist = 0, hp = 1e6, radius = 12, typeId = "mote" } = {}) {
  return { typeId, x, y, dist, hp, maxHp: hp, radius, reward: 5,
           hurtFlash: 0, slowTimer: 0, slowFactor: 1, freezeTimer: 0 };
}

// A bare placed-tower struct with the fields fireProjectile reads; override via opts.
export function makeTower(typeId, opts = {}) {
  return { typeId, x: 0, y: 0, damage: 10, cooldown: 1, range: 1000,
           pierce: false, crumbRadius: 0, crumbDamage: 0, knockbackBase: 0, knockbackSizeRef: 0,
           splash: 0, slowDur: 0, slowFactor: 1, freezeDur: 0, lungeTimer: 0, lungeAngle: 0, ...opts };
}
