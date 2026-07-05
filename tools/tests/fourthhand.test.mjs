// Birthday Party tier 2: a 4th kid joins the huddle (maxTargets 3 → 4). The
// existing multi branch spreads the hands across the frontmost dishes, or piles
// them all onto one dish when it's alone. Behavior only — the one number asserted
// (4× a lone dish) is relative to the tower's own damage, not a balance value.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
console.log("fourthhand.test — Birthday Party t2 grabs with a 4th kid (4 hands)");

// applyUpgradeDeltas raises maxTargets 3 -> 4 via the real Birthday Party tiers.
const zapDef = E.TOWER_BY_ID.zap;
const z = makeTower("zap", { maxTargets: zapDef.maxTargets });
for (const tier of zapDef.upgrades.birthdayParty.tiers) E.applyUpgradeDeltas(z, tier);
assert(z.maxTargets === 4, "Birthday Party's two tiers raise maxTargets from 3 to 4");

// Four dishes in range → all four are grabbed in one attack.
E.reset();
const dishes = [300, 250, 200, 150].map((d, i) => makeEnemy({ x: 200 + i * 10, y: 100, dist: d }));
E.game.enemies.push(...dishes);
E.game.towers.push(makeTower("zap", { x: 100, y: 100, range: 500, cooldown: 0.5, damage: 9, maxTargets: 4 }));
E.updateTowers(1 / 60);
assert(dishes.every((e) => e.hp < e.maxHp), "all four in-range dishes are damaged in one attack");

// A single dish alone → all four hands pile onto it (4× the bite).
E.reset();
const lone = makeEnemy({ x: 200, y: 100, dist: 100 });
E.game.enemies.push(lone);
const zap = makeTower("zap", { x: 100, y: 100, range: 500, cooldown: 0.5, damage: 9, maxTargets: 4 });
E.game.towers.push(zap);
const before = lone.hp;
E.updateTowers(1 / 60);
assert(before - lone.hp === zap.damage * 4, "a lone dish takes 4x the tower's bite (all four hands pile on)");

// Control: a base Kids' Table (3 hands) piles on only 3x.
E.reset();
const lone3 = makeEnemy({ x: 200, y: 100, dist: 100 });
E.game.enemies.push(lone3);
const base = makeTower("zap", { x: 100, y: 100, range: 500, cooldown: 0.5, damage: 9, maxTargets: 3 });
E.game.towers.push(base);
const b3 = lone3.hp;
E.updateTowers(1 / 60);
assert(b3 - lone3.hp === base.damage * 3, "base Kids' Table piles on 3x (the 4th hand is gated on the upgrade)");

done("fourthhand");
