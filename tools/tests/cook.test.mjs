// The Short-Order Cook (Roster Growth 1, trimmed by the Tower Rework): multi-
// target griddle sears. The old Order Up knockback-chance is DELETED — Stove on
// High (Seasoned Griddle t2) is now a pure damage tier, and the backward-fling
// is uniquely Big Appetite's again. Behavior only — reads maxTargets/deltas
// from the data, never hardcodes tuned numbers.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;

// A fresh dish at a path distance, tanky enough to survive a sear unless we want a
// kill. bounty 0 (these tests don't check economy).
function dish(dist, hp = 1000) { const e = makeEnemy({ x: 40, y: 0, dist, hp, radius: 10 }); e.bounty = 0; return e; }
function cook(opts) {
  return makeTower("cook", { typeId: "cook", range: 1000, cooldown: 1, damage: 10,
    maxTargets: E.TOWER_BY_ID.cook.maxTargets, cdTimer: 0, ...opts });
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

// --- Stove on High (Seasoned Griddle t2) is a PURE damage tier ---
const stove = cook({ damage: 10, maxTargets: 1 });
const t2 = E.TOWER_BY_ID.cook.upgrades.seasonedGriddle.tiers[1];
assert(t2.damage > 0, "Stove on High carries a damage delta");
assert(!t2.knockbackBase && !t2.knockbackChance, "…and NO knockback flags (the fling is Big Appetite's alone)");
E.applyUpgradeDeltas(stove, t2);
game.towers = [stove];
const seared = dish(120);
game.enemies = [seared];
const before = seared.dist;
E.updateTowers(10);
assert(1000 - seared.hp === 10 + t2.damage, "the hotter stove sears for base + the tier's full damage add");
assert(seared.dist === before, "a seared dish NEVER moves backward — the cook has no fling");

done("cook");
