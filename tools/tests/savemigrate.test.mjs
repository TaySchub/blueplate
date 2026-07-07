// Save MIGRATION (Tower Rework, Issue #103): a player's save must NEVER break —
// not crash, not corrupt, and not lose their run. The rework deleted/renamed
// upgrade paths that live inside #83 checkpoints, so restore MIGRATES: towers
// on orphaned paths are KEPT (un-upgraded) and the orphaned tiers' spend is
// refunded at FULL value (the change is ours, not the player's). META always
// survives; a garbage blob lands safely in the hub. Behavior + exact refund
// math against the FROZEN legacy price table (pre-rework balance.json values).
import { loadEngine, assert, done } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
const SAVE_KEY = "deckbound.save.v1";

// The FROZEN pre-rework tier prices (what a v1 save's player actually paid).
const LEGACY = {
  extraDressing: [250, 550],   // ranch — retired
  costcoSaturday: [150, 250],  // sample — retired (content guardrail)
  recordPace: [300, 550],      // eater — replaced by The Tip Jar
};

const a = E.MAPS[0].simAnchors;

// ---- A pre-rework-shaped v1 save: three orphaned paths + one surviving path ----
const v1save = {
  version: 1, mapId: "blueplate", waveIndex: 6, currency: 500, lives: 12,
  towers: [
    { typeId: "ranch",  x: a[0].x, y: a[0].y, upgradePath: "extraDressing",  upgradeTier: 2, targeting: "first"  },
    { typeId: "sample", x: a[1].x, y: a[1].y, upgradePath: "costcoSaturday", upgradeTier: 1, targeting: "first"  },
    { typeId: "eater",  x: a[2].x, y: a[2].y, upgradePath: "recordPace",     upgradeTier: 2, targeting: "close"  },
    { typeId: "pit",    x: a[3].x, y: a[3].y, upgradePath: "theStall",       upgradeTier: 1, targeting: "strong" },
    { typeId: "arrow",  x: a[4].x, y: a[4].y, upgradePath: "forkFrenzy",     upgradeTier: 2, targeting: "first"  },
  ],
};
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(v1save));
E.getMeta().essence = 7;   // a distinctive META value that must survive everything

const ok = E.restoreRun();
assert(ok === true, "a pre-rework v1 save RESTORES (never discarded)");
assert(game.phase === "prep" && game.waveIndex === 6 && game.lives === 12,
  "the run resumes at its wave start (wave, lives intact)");
assert(game.towers.length === 5, "every tower KEPT — a deleted path never costs the player a seat");

// Orphaned paths: tower kept un-upgraded; surviving paths: tiers re-applied.
const rRanch = game.towers.find((t) => t.typeId === "ranch");
const rSample = game.towers.find((t) => t.typeId === "sample");
const rEater = game.towers.find((t) => t.typeId === "eater");
const rPit = game.towers.find((t) => t.typeId === "pit");
const rArrow = game.towers.find((t) => t.typeId === "arrow");
assert(rRanch.upgradePath === null && rRanch.upgradeTier === 0, "the ranch's retired path is cleanly un-committed (both paths open again)");
assert(rSample.upgradePath === null && rSample.upgradeTier === 0, "the sample's retired path is cleanly un-committed");
assert(rEater.upgradePath === null && rEater.upgradeTier === 0, "the eater's replaced path is cleanly un-committed");
assert(rPit.upgradePath === "theStall" && rPit.upgradeTier === 1, "a SURVIVING path id re-applies (with the current deltas)");
assert(rPit.smokeStacks > E.TOWER_BY_ID.pit.smokeStacks, "…and its current-tier effect is LIVE after restore");
assert(rArrow.pierce === true, "an untouched original tower restores exactly as before");

// THE REFUND MATH IS EXACT: orphaned tiers at FULL legacy value.
const expectedRefund =
  LEGACY.extraDressing[0] + LEGACY.extraDressing[1] +   // ranch t1+t2
  LEGACY.costcoSaturday[0] +                            // sample t1
  LEGACY.recordPace[0] + LEGACY.recordPace[1];          // eater t1+t2
assert(game.currency === v1save.currency + expectedRefund,
  "orphaned tiers refund at FULL value: " + v1save.currency + " + " + expectedRefund + " = " + game.currency);
assert(E.getMeta().essence === 7, "META survives the migration untouched");

// The run is RESUMABLE: the next wave actually starts and plays.
E.startNextWave();
assert(game.phase === "wave", "the migrated run can call its next wave");
for (let i = 0; i < 120; i++) E.update(1 / 60);
assert(game.phase === "wave" || game.phase === "prep", "…and the wave ticks without crashing");

// The rewritten checkpoint is v2 and carries per-tower spent (exact future refunds).
const rewritten = JSON.parse(globalThis.localStorage.getItem(SAVE_KEY));
assert(rewritten.version === 2, "the restored run re-checkpoints in the v2 format (version-stamped)");
assert(rewritten.towers.every((t) => typeof t.spent === "number"), "v2 towers serialize their exact spend");

// ---- A v2 save with an orphaned path refunds from its own `spent` ----
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 2, mapId: "blueplate", waveIndex: 3, currency: 100, lives: 10,
  towers: [{ typeId: "ranch", x: a[0].x, y: a[0].y, upgradePath: "someFuturePath", upgradeTier: 2, targeting: "first",
             spent: E.TOWER_BY_ID.ranch.cost + 700 }],
}));
assert(E.restoreRun() === true, "a v2 save with an unknown path still restores");
assert(game.currency === 100 + 700, "…refunding exactly what the save says was spent past the base cost");

// ---- THE LAST-RESORT BACKSTOP: garbage saves land in the hub, META intact ----
E.getMeta().essence = 9;
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 2, mapId: "blueplate", waveIndex: "not-a-number", currency: null, lives: {}, towers: [{}, 42, null],
}));
let crashed = false, res;
try { res = E.restoreRun(); } catch (err) { crashed = true; }
assert(!crashed, "a deeply malformed save NEVER throws out of restoreRun");
assert(E.getMeta().essence === 9, "META survives a garbage save unconditionally");

// Unparseable + unknown-version blobs are still discarded quietly.
globalThis.localStorage.setItem(SAVE_KEY, "{ not valid json");
assert(E.readSave() === null && E.restoreRun() === false, "an unparseable blob is discarded without crashing");
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 999, mapId: "blueplate", towers: [] }));
assert(E.readSave() === null, "an unknown FUTURE version is discarded (never half-read)");

done("savemigrate");
