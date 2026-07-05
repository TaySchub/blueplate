#!/usr/bin/env node
/*
  Deckbound headless sim — plays the REAL engine, not a re-implementation.

  Loads src/data.js + src/engine.js (the DOM-free half of the game) into Node
  and drives whole runs through the game's own startRun/tryBuild/tryUpgrade/
  startNextWave/update. One source of truth: a mechanic lands in engine.js and
  this sim exercises it automatically — no Python mirror to keep honest.

  The scripted player mirrors tools/balance_sim.py's steady reference: build
  at the map's simAnchors (the former slot coordinates, kept in build order so
  the gauge stays comparable across map layouts) as affordable, spend spare
  Tips on the cheapest upgrade each prep, never call the wave early (the
  early-call bonus is zeroed so this stays the steady gauge, like the Python
  sim's reference_bonus=0 line). Seeded RNG (mulberry32 over Math.random) →
  same seed, same run.

  Status: THE CI difficulty gate (`--check`), since Issue #54 PR 5.
  tools/balance_sim.py is the report-only second opinion — the two will not
  read identical win-rates: this one has real projectile travel/overkill, the
  sniper's straw-lock, and no per-enemy HP jitter.

  Usage (from the repo root):
    node tools/sim.mjs                       # 200 seeded games, report
    node tools/sim.mjs --sims 500 --seed 1
    node tools/sim.mjs --build arrow,cannon,frost,arrow
    node tools/sim.mjs --check               # gate every tuned map; exit non-zero if any is off-band
    node tools/sim.mjs --map diner           # play a specific map (default: first)
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
const MAP_ARG = opt("map", null);   // which map to play (default: first); --check gates every tuned map
const BUILD = opt("build", "arrow,cannon,frost,arrow").split(",").map((s) => s.trim());
// The reference player commits each tower to one fixed upgrade path and buys its
// two tiers in order — mirrors tools/balance_sim.py SIM_PATHS (the pure-stat paths;
// the signature paths carry mechanics this gauge doesn't need to pick).
const SIM_PATHS = { arrow: "carvingStation", cannon: "oneBigBite", frost: "longExposure", sniper: "extraSlurp", zap: "teenageTable" };
// --paths tower=pathId,... overrides which path a tower commits to (for the PR-5
// path-value matrix). Unlisted towers fall back to SIM_PATHS.
const PATH_OVERRIDE = Object.fromEntries(
  (opt("paths", "") || "").split(",").map((s) => s.trim()).filter(Boolean).map((kv) => kv.split("=").map((x) => x.trim()))
);
const pathFor = (typeId) => PATH_OVERRIDE[typeId] || SIM_PATHS[typeId];

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
  TOWER_BY_ID, RULES, WAVES, towerPaths, nextTier, loadMap, MAPS,
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

// --- map selection -----------------------------------------------------------
// --map <id> picks a map (default: the first). A missing id is a hard error so a
// typo can't silently gauge the wrong map.
function resolveMap(id) {
  const m = id ? E.MAPS.find((x) => x.id === id) : E.MAPS[0];
  if (!m) { console.error(`no such map: ${id} (have: ${E.MAPS.map((x) => x.id).join(", ")})`); process.exit(2); }
  return m;
}

// --- one full seeded game through the real engine ----------------------------
function playGame(seed, build, map) {
  const realRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    E.reset();
    E.loadMap(map);   // the active map drives canPlace/PATH; the scripted player
    E.startRun();     // builds at THIS map's simAnchors (layout-stable gauge)
    const ANCHORS = map.simAnchors;
    let nextSlot = 0, steps = 0;
    const CAP = 60 * 60 * 30; // 30 sim-minutes
    while (steps < CAP && E.game.phase !== "won" && E.game.phase !== "lost") {
      if (E.game.phase === "prep") {
        while (nextSlot < ANCHORS.length && nextSlot < build.length) {
          const id = build[nextSlot];
          if (E.game.currency < E.TOWER_BY_ID[id].cost) break;
          E.game.selectedType = id;
          const a = ANCHORS[nextSlot];
          E.tryBuild(a.x, a.y);
          nextSlot++;
        }
        // Each tower commits to its fixed SIM_PATHS path and buys both tiers,
        // cheapest next tier first (mirrors balance_sim.py buy_upgrades).
        for (;;) {
          // Only towers whose chosen path still has a next tier — guards a missing id
          // or a maxed/locked path so a future tower without a mapping won't crash.
          const cands = E.game.towers.filter((t) => { const p = pathFor(t.typeId); return p && E.nextTier(t, p); });
          if (!cands.length) break;
          const cost = (t) => E.nextTier(t, pathFor(t.typeId)).cost;
          const t = cands.reduce((a, b) => (cost(a) <= cost(b) ? a : b));
          if (E.game.currency < cost(t)) break;
          E.tryUpgrade(t, pathFor(t.typeId));
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

// --- evaluate + report one map ----------------------------------------------
function runOnMap(map) {
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < SIMS; i++) results.push(playGame(SEED + i, BUILD, map));
  const wins = results.filter((r) => r.won).length;
  const waves = results.map((r) => r.wave).sort((a, b) => a - b);
  const winRate = wins / SIMS;
  const medianWave = waves[Math.floor(waves.length / 2)];
  const inBand = winRate >= BAND[0] && winRate <= BAND[1];
  // Died-at-wave distribution (lost runs only): the SHAPE check — are losses spread
  // across the mid-to-late waves, or piled on a single endgame cliff?
  const hist = {};
  for (const r of results) if (!r.won) hist[r.wave] = (hist[r.wave] || 0) + 1;
  const deathDist = Object.keys(hist).sort((a, b) => a - b).map((w) => `w${w}:${hist[w]}`).join(" ") || "(none — all won)";

  const overridden = Object.keys(PATH_OVERRIDE).length ? `  (paths: ${Object.entries(PATH_OVERRIDE).map(([k, v]) => k + "=" + v).join(", ")})` : "";
  console.log(`REAL-ENGINE sim (src/engine.js, no mirror)`);
  console.log(`  build        : ${BUILD.join(", ")}${overridden}`);
  console.log(`  sims / seed  : ${SIMS} / ${SEED}`);
  console.log(`  win rate     : ${(winRate * 100).toFixed(1)}%`);
  console.log(`  median waves : ${medianWave}`);
  console.log(`  died-at-wave : ${deathDist}  [lost ${SIMS - wins}/${SIMS}]`);
  console.log(`  target band  : ${(BAND[0] * 100).toFixed(0)}%-${(BAND[1] * 100).toFixed(0)}% -> ${inBand ? "inside" : "OUTSIDE"}${map.tuned ? "" : "  (untuned — report only)"}`);
  console.log(`  runtime      : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  note         : real mechanics (projectile travel, straw-lock, no HP jitter) — expect a different reading than balance_sim.py's gauge`);
  return inBand;
}

// --- run ---------------------------------------------------------------------
// --check gates EVERY tuned map (untuned maps report only); a normal run plays
// just the selected/default map. Per-map headers appear only when there's more
// than one map, so a single-map repo prints exactly today's block.
if (has("check")) {
  let failed = false;
  E.MAPS.forEach((m, i) => {
    if (E.MAPS.length > 1) { if (i > 0) console.log(""); console.log(`=== ${m.name} (${m.id})${m.tuned ? "" : " — untuned, report only"} ===`); }
    const inBand = runOnMap(m);
    if (m.tuned && !inBand) failed = true;
  });
  process.exit(failed ? 1 : 0);
} else {
  runOnMap(resolveMap(MAP_ARG));
}
