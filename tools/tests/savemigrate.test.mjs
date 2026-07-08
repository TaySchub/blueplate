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

// ---- Issue #106 #2: the three unexercised LEGACY_TIER_COSTS rows refund EXACTLY ----
// A v1 save on each retired path must refund its FROZEN tier prices to the Tip;
// a per-row price typo would otherwise short-change the player silently. Each
// row is its own single-tower save so a wrong row fails its own assertion.
const orphanRows = [
  { typeId: "ranch",  path: "widerNozzle",    sum: 250 + 600 },   // ranch — cone/coat kit retired
  { typeId: "sample", path: "hardSell",       sum: 150 + 300 },   // sample — amp kit retired
  { typeId: "pit",    path: "competitionRub", sum: 250 + 550 },   // pit — replaced by Whole Hog
];
for (const r of orphanRows) {
  globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
    version: 1, mapId: "blueplate", waveIndex: 4, currency: 200, lives: 10,
    towers: [{ typeId: r.typeId, x: a[0].x, y: a[0].y, upgradePath: r.path, upgradeTier: 2, targeting: "first" }],
  }));
  assert(E.restoreRun() === true, "a v1 save on retired " + r.path + " restores");
  const tw = game.towers.find((t) => t.typeId === r.typeId);
  assert(tw && tw.upgradePath === null && tw.upgradeTier === 0, r.path + ": the retired seat is kept, cleanly un-committed");
  assert(game.currency === 200 + r.sum, r.path + " refunds its frozen tiers exactly: 200 + " + r.sum + " = " + game.currency);
}

// ---- Issue #106 #2: a v1 save on a SURVIVING but REPRICED path books the FROZEN price ----
// #105 stage 3 repriced theStall t1 250->500. A v1 pit paid 300(base)+250 = 550,
// NOT the live 300+500 = 800. Booking the live price would MINT Tips through sell.
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 1, mapId: "blueplate", waveIndex: 5, currency: 0, lives: 10,
  towers: [{ typeId: "pit", x: a[0].x, y: a[0].y, upgradePath: "theStall", upgradeTier: 1, targeting: "strong" }],
}));
assert(E.restoreRun() === true, "a v1 pit on the surviving theStall path restores");
const v1pit = game.towers.find((t) => t.typeId === "pit");
assert(v1pit.upgradePath === "theStall" && v1pit.upgradeTier === 1, "…the surviving path re-applies (current deltas)");
assert(v1pit.spent === 550, "…booking the FROZEN v1 price: base 300 + theStall t1 250 = " + v1pit.spent + " (not the live 800)");
const beforeSell = game.currency;
E.sellTower(v1pit);
assert(game.currency - beforeSell === Math.floor(E.RULES.sellRefund * 550),
  "…so its sell-refund is floor(sellRefund x 550) = " + (game.currency - beforeSell) + " Tips (385, not the inflated 560)");

// ---- Issue #106 #3: a saved seat that no longer PLACES refunds its full value ----
// (corrupt coords, or a map/obstacle/spacing change invalidating an old seat).
assert(E.canPlace(-9999, -9999) === false, "precondition: the saved coordinates are unplaceable");
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 2, mapId: "blueplate", waveIndex: 2, currency: 50, lives: 10,
  towers: [{ typeId: "ranch", x: -9999, y: -9999, upgradePath: "quickPour", upgradeTier: 2, targeting: "first",
             spent: E.TOWER_BY_ID.ranch.cost + 800, base: E.TOWER_BY_ID.ranch.cost }],
}));
assert(E.restoreRun() === true, "a save with an unplaceable seat still restores the run");
assert(game.towers.length === 0, "…the rejected seat is NOT silently seated at a wrong spot");
assert(game.currency === 50 + E.TOWER_BY_ID.ranch.cost + 800,
  "…and its FULL value is refunded, never vanished: " + game.currency);

// ---- Issue #106 #4: the eater's Tip Jar killCount survives save/continue ----
E.loadMap(E.MAPS[0]); E.startRun(); game.currency = 100000;
game.selectedType = "eater"; E.tryBuild(a[2].x, a[2].y);
const jarEater = game.towers[game.towers.length - 1];
E.tryUpgrade(jarEater, "tipJar"); E.tryUpgrade(jarEater, "tipJar");
assert(jarEater.jackpotEvery > 0, "the eater's Tip Jar jackpot cadence is armed");
jarEater.killCount = 4;                 // one kill short of a jackpot at jackpotEvery=5
game.waveIndex = 8; E.saveCheckpoint();
game.towers = []; game.phase = "lost";  // wipe live state so restore comes from disk
assert(E.restoreRun() === true, "the eater-board run restores");
const rJar = game.towers.find((t) => t.typeId === "eater");
assert(rJar.killCount === 4, "the eater's jackpot progress (killCount) survives the roundtrip: " + rJar.killCount + " (not reset to 0)");

// ---- Issue #106 #5: a v2 orphan refund is independent of the LIVE base cost ----
// The save STAMPS `base` at write time; a later base reprice must not skew it.
const savedRanchBase = E.TOWER_BY_ID.ranch.cost;   // 300
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 2, mapId: "blueplate", waveIndex: 1, currency: 100, lives: 10,
  towers: [{ typeId: "ranch", x: a[0].x, y: a[0].y, upgradePath: "goneForever", upgradeTier: 2, targeting: "first",
             spent: savedRanchBase + 700, base: savedRanchBase }],
}));
E.TOWER_BY_ID.ranch.cost = savedRanchBase + 999;   // simulate a FUTURE base reprice
assert(E.restoreRun() === true, "a v2 orphan save restores after a simulated base reprice");
assert(game.currency === 100 + 700,
  "…the orphan refund uses the STAMPED base, not the live one: 100 + 700 = " + game.currency + " (a live-base refund would read wrong)");
E.TOWER_BY_ID.ranch.cost = savedRanchBase;         // RESTORE the live cost — never pollute later assertions

// ---- Issue #106 (NaN isolation): one tower's garbage `spent` can't poison a sibling ----
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 2, mapId: "blueplate", waveIndex: 1, currency: 0, lives: 10,
  towers: [
    { typeId: "ranch", x: a[0].x, y: a[0].y, upgradePath: "goneA", upgradeTier: 2, targeting: "first",
      spent: {},                             base: E.TOWER_BY_ID.ranch.cost },   // garbage spend -> treated as unknown, refund 0
    { typeId: "pit",   x: a[1].x, y: a[1].y, upgradePath: "goneB", upgradeTier: 2, targeting: "first",
      spent: E.TOWER_BY_ID.pit.cost + 700,   base: E.TOWER_BY_ID.pit.cost },     // a legit 700-Tip refund
  ],
}));
assert(E.restoreRun() === true, "a save with one garbage-spent tower still restores");
assert(game.currency === 700, "the sibling's legit 700-Tip refund survives (not NaN-dropped): " + game.currency);

// ---- THE LAST-RESORT BACKSTOP: a type-garbage save is REJECTED — hub, discarded,
// never re-persisted (Issue #106 #1). This leg used to only prove "no throw"; it
// now pins the RESULT: the NaN zombie run can no longer restore. ----
E.getMeta().essence = 9;
game.phase = "wave";   // start somewhere that is NOT the hub, to prove restore moves us there
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 2, mapId: "blueplate", waveIndex: "not-a-number", currency: null, lives: {}, towers: [{}, 42, null],
}));
let crashed = false, res;
try { res = E.restoreRun(); } catch (err) { crashed = true; }
assert(!crashed, "a deeply malformed save NEVER throws out of restoreRun");
assert(res === false, "…and restoreRun REJECTS it (returns false — no NaN zombie run, no unlosable lives)");
assert(game.phase === "menu", "…landing safely in the hub");
assert(E.readSave() === null && globalThis.localStorage.getItem(SAVE_KEY) === null,
  "…the garbage checkpoint is DISCARDED, so saveCheckpoint can never re-persist it");
assert(E.getMeta().essence === 9, "META survives a garbage save unconditionally");

// Unparseable + unknown-version blobs are still discarded quietly.
globalThis.localStorage.setItem(SAVE_KEY, "{ not valid json");
assert(E.readSave() === null && E.restoreRun() === false, "an unparseable blob is discarded without crashing");
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 999, mapId: "blueplate", waveIndex: 1, currency: 1, lives: 1, towers: [] }));
assert(E.readSave() === null, "an unknown FUTURE version is discarded (never half-read)");

done("savemigrate");
