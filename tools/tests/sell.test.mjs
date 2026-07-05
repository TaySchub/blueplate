// Sell towers (Issue #66): sellTower's contract. Behavior only — the refund
// rate comes from the LOADED config (RULES.sellRefund), never a literal, so a
// numbers-only retune can move it freely. The build spot comes from the map's
// simAnchors (guaranteed-legal placement points by design).
import { loadEngine, assert, done } from "./_engine.mjs";

const E = loadEngine();
const BAL = globalThis.window.BALANCE;
const anchor = BAL.maps[0].simAnchors[0];   // default map (the diner)

E.reset();
E.game.towers = [];
E.game.selectedType = "arrow";

// Build, then buy one upgrade tier so `spent` covers base + tier.
E.tryBuild(anchor.x, anchor.y);
assert(E.game.towers.length === 1, "setup: tower built at a sim anchor");
const t = E.game.towers[0];
const baseCost = E.TOWER_BY_ID.arrow.cost;
assert(t.spent === baseCost, "spent starts at the base cost");
const pathId = E.towerPaths("arrow")[0].id;
const tierCost = E.nextTier(t, pathId).cost;
E.tryUpgrade(t, pathId);
assert(t.spent === baseCost + tierCost, "spent grows by the purchased tier's cost");

// Sell it (mid-"wave" phase per reset(), like live play allows).
E.game.selectedTower = t;
const spent = t.spent;
const expected = Math.floor(E.RULES.sellRefund * spent);
const before = E.game.currency;
E.sellTower(t);
const refund = E.game.currency - before;
assert(refund === expected, `refund is exactly floor(sellRefund × spent) (${refund})`);
assert(refund > 0 && refund < spent, "refund is partial and positive");
assert(E.game.towers.length === 0, "the sold tower is removed");
assert(E.game.selectedTower === null, "selling the selected tower closes its panel");
assert(E.canPlace(anchor.x, anchor.y), "the freed floor is immediately buildable again");

// A stale second sell of the same (removed) tower must be a no-op.
const cur = E.game.currency;
E.sellTower(t);
assert(E.game.currency === cur, "selling an already-removed tower refunds nothing");

done("sell");
