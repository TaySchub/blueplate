#!/usr/bin/env node
/*
  Deckbound headless sim — plays the REAL engine, not a re-implementation.

  Loads src/data.js + src/engine.js (the DOM-free half of the game) into Node
  and drives whole runs through the game's own startRun/tryBuild/tryUpgrade/
  startNextWave/update. One source of truth: a mechanic lands in engine.js and
  this sim exercises it automatically — no Python mirror to keep honest.

  The scripted player mirrors tools/balance_sim.py's steady reference: fill
  slots in build order as affordable, spend spare Tips on the cheapest upgrade
  each prep, never call the wave early (the early-call bonus is zeroed so this
  stays the steady gauge, like the Python sim's reference_bonus=0 line).
  Seeded RNG (mulberry32 over Math.random) → same seed, same run.

  Status: REPORTING gauge alongside the Python sim (which remains the CI
  gate). The two will not read identical win-rates — this one has real
  projectile travel/overkill, the sniper's straw-lock, and no per-enemy HP
  jitter. Switching the CI gate to this sim is the developer's call once both
  numbers have been seen side by side.

  Usage (from the repo root):
    node tools/sim.mjs                       # 200 seeded games, report
    node tools/sim.mjs --sims 500 --seed 1
    node tools/sim.mjs --build arrow,cannon,frost,arrow
    node tools/sim.mjs --check               # exit non-zero outside the band
    node tools/sim.mjs --dump-waves out.json # waves 0..24 for the parity check
*/
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- tiny arg parsing -------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const has = (name) => args.includes("--" + name);
const SIMS = parseInt(opt("sims", "200"), 10);
const SEED = parseInt(opt("seed", "1"), 10);
const BUILD = opt("build", "arrow,cannon,frost,arrow").split(",").map((s) => s.trim());
// The reference player commits each tower to one fixed upgrade path and buys its
// two tiers in order — mirrors tools/balance_sim.py SIM_PATHS (the pure-stat paths;
// the signature paths carry mechanics this gauge doesn't need to pick).
const SIM_PATHS = { arrow: "carvingStation", cannon: "oneBigBite", frost: "longExposure", sniper: "extraSlurp", zap: "teenageTable" };

// --- load the real engine ---------------------------------------------------
// The game files are classic browser scripts sharing one global lexical scope,
// so they are concatenated into a single vm script; an epilogue exports the
// bindings this driver needs. window only has to provide BALANCE.
globalThis.window = {
  BALANCE: JSON.parse(readFileSync(join(ROOT, "data", "balance.json"), "utf8")),
};
// Explicit no-op storage: the engine's loadMeta/saveMeta are try/catch-guarded
// anyway, but Node 22+ ships an experimental localStorage that warns on touch.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const bundle =
  ["src/data.js", "src/engine.js"]
    .map((f) => readFileSync(join(ROOT, f), "utf8"))
    .join("\n;\n") +
  `
;globalThis.ENGINE = {
  game, startRun, startNextWave, tryBuild, tryUpgrade, update, makeWave,
  SLOTS, TOWER_BY_ID, RULES, WAVES, towerPaths, nextTier,
  reset() { META = freshMeta(); chosenEndless = false; },
};`;
vm.runInThisContext(bundle, { filename: "deckbound-engine-bundle.js" });
const E = globalThis.ENGINE;
const BAND = window.BALANCE.target_win_rate || [0.5, 0.6];
const STEP = 1 / 60;

// --- seeded RNG (same generator as the harness) ------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- waves fixture for the Python parity check -------------------------------
if (has("dump-waves")) {
  const file = opt("dump-waves", "waves.json");
  const waves = Array.from({ length: 25 }, (_, n) => E.makeWave(n));
  writeFileSync(file, JSON.stringify(waves, null, 1));
  console.log(`wrote ${file} — makeWave(0..24) from the real engine`);
  process.exit(0);
}

// --- one full seeded game through the real engine ----------------------------
function playGame(seed, build) {
  const realRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    E.reset();
    E.startRun();
    let nextSlot = 0, steps = 0;
    const CAP = 60 * 60 * 30; // 30 sim-minutes
    while (steps < CAP && E.game.phase !== "won" && E.game.phase !== "lost") {
      if (E.game.phase === "prep") {
        while (nextSlot < E.SLOTS.length && nextSlot < build.length) {
          const id = build[nextSlot];
          if (E.game.currency < E.TOWER_BY_ID[id].cost) break;
          E.game.selectedType = id;
          E.tryBuild(nextSlot);
          nextSlot++;
        }
        // Each tower commits to its fixed SIM_PATHS path and buys both tiers,
        // cheapest next tier first (mirrors balance_sim.py buy_upgrades).
        for (;;) {
          const cands = E.game.towers.filter((t) => t.upgradeTier < 2);
          if (!cands.length) break;
          const cost = (t) => E.nextTier(t, SIM_PATHS[t.typeId]).cost;
          const t = cands.reduce((a, b) => (cost(a) <= cost(b) ? a : b));
          if (E.game.currency < cost(t)) break;
          E.tryUpgrade(t, SIM_PATHS[t.typeId]);
        }
        // Steady reference: let the early-call window lapse so the bonus is 0.
        E.game.prepElapsed = E.RULES.earlyCallWindow + 1;
        E.startNextWave();
      }
      E.update(STEP);
      steps++;
    }
    return { won: E.game.phase === "won", wave: E.game.lastRun ? E.game.lastRun.wave : E.game.waveIndex + 1 };
  } finally {
    Math.random = realRandom;
  }
}

// --- evaluate ----------------------------------------------------------------
const t0 = Date.now();
let wins = 0;
const waves = [];
for (let i = 0; i < SIMS; i++) {
  const r = playGame(SEED + i, BUILD);
  wins += r.won ? 1 : 0;
  waves.push(r.wave);
}
waves.sort((a, b) => a - b);
const winRate = wins / SIMS;
const medianWave = waves[Math.floor(waves.length / 2)];
const inBand = winRate >= BAND[0] && winRate <= BAND[1];

console.log(`REAL-ENGINE sim (src/engine.js, no mirror)`);
console.log(`  build        : ${BUILD.join(", ")}`);
console.log(`  sims / seed  : ${SIMS} / ${SEED}`);
console.log(`  win rate     : ${(winRate * 100).toFixed(1)}%`);
console.log(`  median waves : ${medianWave}`);
console.log(`  target band  : ${(BAND[0] * 100).toFixed(0)}%-${(BAND[1] * 100).toFixed(0)}% -> ${inBand ? "inside" : "OUTSIDE"}`);
console.log(`  runtime      : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  note         : real mechanics (projectile travel, straw-lock, no HP jitter) — expect a different reading than balance_sim.py's gauge`);

if (has("check")) process.exit(inBand ? 0 : 1);
