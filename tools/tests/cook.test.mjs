// The Short-Order Cook (Roster Growth 1): multi-target sears + the Order Up
// knockback signature. Behavior only — reads maxTargets/deltas from the data, never
// hardcodes tuned numbers. Uses existing engine vocabulary (multi branch + the
// size-scaled knockback), so nothing new touches the difficulty gate.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;

// A fresh dish at a path distance, tanky enough to survive a sear unless we want a
// kill. bounty 0 (these tests don't check economy).
function dish(dist, hp = 1000) { const e = makeEnemy({ x: 40, y: 0, dist, hp, radius: 10 }); e.bounty = 0; return e; }
function cook(opts) {
  return makeTower("cook", { typeId: "cook", range: 1000, cooldown: 1, damage: 10,
    maxTargets: E.TOWER_BY_ID.cook.maxTargets, cdTimer: 0, knockbackBase: 0, knockbackChance: 0, ...opts });
}

// --- a base sear hits the TWO nearest dishes (distinct) ---
game.phase = "wave";
const base = cook({});
game.towers = [base];
const a = dish(100), b = dish(80), c = dish(60);
game.enemies = [a, b, c];
E.updateTowers(10);
const hit = [a, b, c].filter((e) => e.hp < 1000);
assert(hit.length === 2, "a base sear hits exactly two dishes");
assert(hit[0] !== hit[1], "the two seared dishes are distinct");

// --- Rush Ticket (Slinging Hash t2) reaches THREE ---
const rush = cook({});
E.applyUpgradeDeltas(rush, E.TOWER_BY_ID.cook.upgrades.slingingHash.tiers[1]);   // real Rush Ticket delta
game.towers = [rush];
const d = [dish(100), dish(80), dish(60), dish(40)];
game.enemies = d.slice();
E.updateTowers(10);
assert(d.filter((e) => e.hp < 1000).length === 3, "Rush Ticket sears three distinct dishes");

// --- Order Up (Seasoned Griddle t2) flings a surviving dish backward ---
const orderUp = cook({ damage: 1, maxTargets: 1 });   // damage low so the dish survives to be flung
E.applyUpgradeDeltas(orderUp, E.TOWER_BY_ID.cook.upgrades.seasonedGriddle.tiers[1]);   // knockbackBase/SizeRef/Chance
assert(orderUp.knockbackBase > 0, "Order Up grants a knockback");
orderUp.knockbackChance = 1;   // the fling is a CHANCE in play (RNG); force it for a deterministic test
game.towers = [orderUp];
const t = dish(120);
game.enemies = [t];
const before = t.dist;
E.updateTowers(10);
assert(game.enemies.includes(t), "the flung dish survived the sear (so it could be flung, not killed)");
assert(t.dist < before, "Order Up flings a surviving dish BACKWARD down the belt (dist decreases)");

done("cook");
