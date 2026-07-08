#!/usr/bin/env node
/*
  Blue-Plate Special headless sim — plays the REAL engine, not a re-implementation.

  Loads src/data.js + src/engine.js (the DOM-free half of the game) into Node
  and drives whole runs through the game's own startRun/tryBuild/tryUpgrade/
  startNextWave/update. One source of truth: a mechanic lands in engine.js and
  this sim exercises it automatically — no Python mirror to keep honest.

  The scripted player is the steady reference: build at the map's simAnchors
  (the former slot coordinates, kept in build order so the gauge stays
  comparable across map layouts) as affordable, then spend spare Tips on the
  cheapest upgrade each prep. Seeded RNG (mulberry32 over Math.random) →
  same seed, same run.

  ENDLESS SURVIVAL GAUGE (Issue #75): runs are endless — they end only in
  defeat. The gauge's "win" := a seeded run REACHES WAVE 30 (`WIN_WAVE`); each
  run is driven to `PROBE_TO` (wave 40) so P(reach 40) falls out of the same
  run. `--check` passes when survival@30 is inside target_win_rate on every
  tuned map. It also reports P(reach 20/40), median waves survived, the
  died-at-wave spread, and wave-pacing stats (seconds/wave, run-to-30 time).

  Status: THE CI difficulty gate (`--check`) since Issue #54 PR 5, and the ONLY
  difficulty gauge since the economy overhaul retired the Python second-opinion
  model (tools/balance_sim.py) and its wave-parity companion.

  Usage (from the repo root):
    node tools/sim.mjs                       # 200 seeded games, endless-survival report
    node tools/sim.mjs --sims 1000 --seed 1
    node tools/sim.mjs --build zap,zap,zap   # e.g. a spam probe
    node tools/sim.mjs --check               # gate survival@30 on every tuned map; non-zero if off-band
    node tools/sim.mjs --map diner           # play a specific map (default: first)
    node tools/sim.mjs --paths frost=paparazzi  # path-value matrix override
*/
import { readFileSync } from "node:fs";
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
// The endless reference board EXTENDS the old finite reference (arrow,cannon,
// frost,arrow) to fill all ten simAnchors with a balanced spread — no tower more
// than three, sniper excluded (it's Essence-unlock-gated). A fuller board is what
// makes economy + tier costs real levers on how far the run gets, and lets the
// survive-to-30 gate be reachable (four maxed towers hit a hard dps ceiling by ~w10).
const BUILD = opt("build", "arrow,cannon,frost,arrow,zap,cannon,frost,arrow,zap,cannon").split(",").map((s) => s.trim());
// The reference player commits each tower to one fixed upgrade path and buys its
// two tiers in order (the pure-stat paths; the signature paths carry mechanics
// this gauge doesn't need to pick).
const SIM_PATHS = { arrow: "carvingStation", cannon: "oneBigBite", frost: "longExposure", sniper: "extraSlurp", zap: "teenageTable" };
// --paths tower=pathId,... overrides which path a tower commits to (for the PR-5
// path-value matrix). Unlisted towers fall back to SIM_PATHS.
const PATH_OVERRIDE = Object.fromEntries(
  (opt("paths", "") || "").split(",").map((s) => s.trim()).filter(Boolean).map((kv) => kv.split("=").map((x) => x.trim()))
);
// The active path map: CLI override merged over SIM_PATHS for normal runs; a
// report board (below) swaps in its own pinned map for the length of its run.
let ACTIVE_PATHS = { ...SIM_PATHS, ...PATH_OVERRIDE };
const pathFor = (typeId) => ACTIVE_PATHS[typeId];

// --- REPORT-ONLY roster boards (Issue #92) -----------------------------------
// Named full-roster compositions, DATA-DRIVEN: --check runs each on the default
// map AFTER the tuned-map gates and prints a compact block, so every future
// --check log shows how newcomer boards read. They NEVER gate — the exit code
// comes from the tuned maps alone. Each board pins its own path commitments
// (the newcomers have no SIM_PATHS entry: the frozen reference predates them).
// Build order is cheap-first so the wave-1 float seats a real opening.
const REPORT_BOARDS = [
  {
    name: "modern-mix",   // one of everything: the full 10-tower roster on one board
    build: ["sample", "zap", "arrow", "cook", "pit", "ranch", "frost", "cannon", "eater", "sniper"],
    paths: { arrow: "carvingStation", cannon: "oneBigBite", frost: "longExposure", sniper: "extraSlurp", zap: "teenageTable",
             cook: "slingingHash", eater: "waterDunk", pit: "theStall", ranch: "quickPour", sample: "happyHour" },
  },
  {
    name: "support-stack", // the support question: three Sample Lady auras over a DPS core (strongest-wins, so this reads diversity, not stacking)
    build: ["sample", "sample", "sample", "zap", "arrow", "cook", "cannon", "eater", "sniper", "arrow"],
    paths: { arrow: "carvingStation", cannon: "oneBigBite", sniper: "extraSlurp", zap: "teenageTable",
             cook: "slingingHash", eater: "waterDunk", sample: "onTheHouse" },
  },
  {
    name: "dot-board",     // the status layer carrying a run: smoke + syrup control, light direct backup
    build: ["sample", "zap", "pit", "ranch", "pit", "ranch", "pit", "ranch", "frost", "cannon"],
    paths: { cannon: "oneBigBite", frost: "longExposure", zap: "teenageTable",
             pit: "wholeHog", ranch: "quickPour", sample: "onTheHouse" },
  },
];

// --- load the real engine ---------------------------------------------------
// The game files are classic browser scripts sharing one global lexical scope,
// so they are concatenated into a single vm script; an epilogue exports the
// bindings this driver needs. window only has to provide BALANCE.
globalThis.window = {
  BALANCE: JSON.parse(readFileSync(join(ROOT, "data", "balance.json"), "utf8")),
};
// Explicit no-op storage: the engine's loadMeta/saveMeta are try/catch-guarded
// anyway, but Node 22+ ships an experimental localStorage that warns on touch.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const bundle =
  ["src/data.js", "src/engine.js"]
    .map((f) => readFileSync(join(ROOT, f), "utf8"))
    .join("\n;\n") +
  `
;globalThis.ENGINE = {
  game, startRun, startNextWave, tryBuild, tryUpgrade, update, makeWave,
  TOWER_BY_ID, RULES, WAVES, towerPaths, nextTier, tierCostFor, loadMap, MAPS,
  reset() { META = freshMeta(); },
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

// --- map selection -----------------------------------------------------------
// --map <id> picks a map (default: the first). A missing id is a hard error so a
// typo can't silently gauge the wrong map.
function resolveMap(id) {
  const m = id ? E.MAPS.find((x) => x.id === id) : E.MAPS[0];
  if (!m) { console.error(`no such map: ${id} (have: ${E.MAPS.map((x) => x.id).join(", ")})`); process.exit(2); }
  return m;
}

// --- the endless survival gauge ---------------------------------------------
const WIN_WAVE = 30;   // the gate: a run "wins" the gauge by REACHING wave 30.
const PROBE_TO = 40;   // stop each seeded run once it reaches wave 40 — far enough
                       // for P(reach 40); survival@30 falls out of the same run.
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// --- one full seeded game through the real engine ----------------------------
// Runs are endless (they end only in defeat), so the gauge stops a run when it
// is lost OR reaches PROBE_TO. Returns how far it got + per-wave step counts.
function playGame(seed, build, map) {
  const realRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    E.reset();
    E.loadMap(map);   // the active map drives canPlace/PATH; the scripted player
    E.startRun();     // builds at THIS map's simAnchors (layout-stable gauge)
    const ANCHORS = map.simAnchors;
    let nextSlot = 0, steps = 0;
    const waveSteps = {};             // waveIndex -> sim steps spent in that wave's "wave" phase (prep excluded)
    const CAP = 60 * 60 * 60;         // 60 sim-minutes safety bound — headroom for the 40-wave probe
    while (steps < CAP && E.game.phase !== "lost" && (E.game.waveIndex + 1) < PROBE_TO) {
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
        // cheapest next tier first.
        for (;;) {
          // Only towers whose chosen path still has a next tier — guards a missing id
          // or a maxed/locked path so a future tower without a mapping won't crash.
          const cands = E.game.towers.filter((t) => { const p = pathFor(t.typeId); return p && E.nextTier(t, p); });
          if (!cands.length) break;
          // Price via tierCostFor — EXACTLY what tryUpgrade charges (support
          // discount included), so the buyer's affordability + cheapest-first
          // choice match the real game (Issue #107 #6). No sample → tierCostFor
          // == list tier.cost, so the reference gate is unaffected.
          const cost = (t) => E.tierCostFor(t, E.nextTier(t, pathFor(t.typeId)));
          const t = cands.reduce((a, b) => (cost(a) <= cost(b) ? a : b));
          if (E.game.currency < cost(t)) break;
          E.tryUpgrade(t, pathFor(t.typeId));
        }
        E.startNextWave();
      }
      const wi = E.game.waveIndex;            // wave being played this tick (constant during a wave)
      const inWave = E.game.phase === "wave"; // count only wave-phase steps → prep excluded from pacing
      E.update(STEP);
      steps++;
      if (inWave) waveSteps[wi] = (waveSteps[wi] || 0) + 1;
    }
    const died = E.game.phase === "lost";
    // "reached" = the furthest UI wave the run got to. Dying on wave W → reached W;
    // a probe-capped run → PROBE_TO. survival@N := reached >= N.
    const reached = died ? E.game.waveIndex + 1 : Math.min(PROBE_TO, E.game.waveIndex + 1);
    return { died, reached, waveSteps };
  } finally {
    Math.random = realRandom;
  }
}

// --- evaluate + report one map ----------------------------------------------
function runOnMap(map) {
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < SIMS; i++) results.push(playGame(SEED + i, BUILD, map));
  const N = results.length;
  const frac = (pred) => results.filter(pred).length / N;
  const surv30 = frac((r) => r.reached >= WIN_WAVE);   // THE gate number
  const reach20 = frac((r) => r.reached >= 20);
  const reach40 = frac((r) => r.reached >= 40);
  const medianWaves = median(results.map((r) => r.reached));
  const inBand = surv30 >= BAND[0] && surv30 <= BAND[1];

  // Died-at-wave distribution (actual defeats only; probe-capped runs excluded):
  // the SHAPE check — losses spread across the mid-to-late waves, or piled on one
  // cliff? (One-wave clustering is a known artifact of the deterministic gauge.)
  const hist = {};
  for (const r of results) if (r.died) hist[r.reached] = (hist[r.reached] || 0) + 1;
  const deaths = results.filter((r) => r.died).length;
  const deathDist = Object.keys(hist).sort((a, b) => a - b).map((w) => `w${w}:${hist[w]}`).join(" ") || "(none — all reached the probe cap)";

  // Wave pacing: each wave's "wave"-phase length in seconds (steps/60, prep
  // excluded), aggregated across runs. Early waves should breathe; none should drag.
  const allDur = [];
  const byWave = {};   // wave number (1-indexed) -> [seconds, ...]
  for (const r of results) for (const [wi, st] of Object.entries(r.waveSteps)) {
    const sec = st / 60;
    allDur.push(sec);
    (byWave[Number(wi) + 1] ||= []).push(sec);
  }
  const earlySec = [1, 2, 3].map((n) => `w${n}:${median(byWave[n] || []).toFixed(0)}s`).join(" ");
  // Mean total time to REACH wave 30 (sum of wave durations for waves 1..29),
  // over the runs that got there — the "run doesn't drag" number.
  const to30 = results.filter((r) => r.reached >= WIN_WAVE).map((r) =>
    Object.entries(r.waveSteps).reduce((s, [wi, st]) => s + (Number(wi) < WIN_WAVE - 1 ? st : 0), 0) / 60);
  const meanTo30Min = to30.length ? (to30.reduce((a, b) => a + b, 0) / to30.length) / 60 : 0;

  const overridden = Object.keys(PATH_OVERRIDE).length ? `  (paths: ${Object.entries(PATH_OVERRIDE).map(([k, v]) => k + "=" + v).join(", ")})` : "";
  console.log(`REAL-ENGINE sim (src/engine.js, no mirror) — endless survival gauge`);
  console.log(`  build          : ${BUILD.join(", ")}${overridden}`);
  console.log(`  sims / seed    : ${SIMS} / ${SEED}`);
  console.log(`  survival@30    : ${(surv30 * 100).toFixed(1)}%   <- the gate`);
  console.log(`  P(reach 20/40) : ${(reach20 * 100).toFixed(1)}%  /  ${(reach40 * 100).toFixed(1)}%`);
  console.log(`  median waves   : ${medianWaves}`);
  console.log(`  died-at-wave   : ${deathDist}  [lost ${deaths}/${N}]`);
  console.log(`  pacing         : median ${median(allDur).toFixed(1)}s/wave (prep excl); early ${earlySec}; mean run-to-30 ${meanTo30Min.toFixed(1)} sim-min`);
  console.log(`  target band    : survival@30 ${(BAND[0] * 100).toFixed(0)}%-${(BAND[1] * 100).toFixed(0)}% -> ${inBand ? "inside" : "OUTSIDE"}${map.tuned ? "" : "  (untuned — report only)"}`);
  console.log(`  runtime        : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  note           : real mechanics (projectile travel, straw-lock, no HP jitter) — THE difficulty gauge, no second opinion`);
  return inBand;
}

// --- report-board runner ------------------------------------------------------
// Plays one REPORT_BOARDS entry on the default map with its pinned paths and
// prints a compact one-line read. Never touches the gate: separate printer,
// ACTIVE_PATHS restored afterward, and the result carries no exit-code weight.
function runReportBoard(board, map) {
  const saved = ACTIVE_PATHS;
  ACTIVE_PATHS = { ...SIM_PATHS, ...board.paths };
  const results = [];
  for (let i = 0; i < SIMS; i++) results.push(playGame(SEED + i, board.build, map));
  ACTIVE_PATHS = saved;
  const N = results.length;
  const surv30 = results.filter((r) => r.reached >= WIN_WAVE).length / N;
  const reach20 = results.filter((r) => r.reached >= 20).length / N;
  const reach40 = results.filter((r) => r.reached >= 40).length / N;
  const med = median(results.map((r) => r.reached));
  console.log(
    `  ${board.name.padEnd(13)}: survival@30 ${(surv30 * 100).toFixed(1).padStart(5)}%   ` +
    `median ${String(med).padStart(2)}   P(20/40) ${(reach20 * 100).toFixed(1)}/${(reach40 * 100).toFixed(1)}   ` +
    `(${board.build.join(",")})`
  );
}

// --- run ---------------------------------------------------------------------
// --check gates EVERY tuned map (untuned maps report only); a normal run plays
// just the selected/default map. Per-map headers appear only when there's more
// than one map, so a single-map repo prints exactly today's block.
if (has("check")) {
  let failed = false;
  E.MAPS.forEach((m, i) => {
    if (E.MAPS.length > 1) { if (i > 0) console.log(""); console.log(`=== ${m.name} (${m.id})${m.retired ? " — retired, report only" : m.tuned ? "" : " — untuned, report only"} ===`); }
    const inBand = runOnMap(m);
    if (m.tuned && !inBand) failed = true;
  });
  // Roster boards LAST (append-only output: the gate blocks above stay
  // byte-comparable across runs) — visibility for newcomer compositions,
  // zero influence on the exit code.
  console.log("");
  console.log(`=== roster boards (${resolveMap(null).id}) — report only, never gate ===`);
  for (const b of REPORT_BOARDS) runReportBoard(b, resolveMap(null));
  process.exit(failed ? 1 : 0);
} else {
  runOnMap(resolveMap(MAP_ARG));
}
