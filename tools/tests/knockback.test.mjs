// One Big Bite tier 2: a dish that SURVIVES the bite is spit backward along the
// belt; lighter (smaller) dishes fly farther; the push clamps at the kitchen door
// (dist >= 0); and dead dishes don't fly. Behavior only — no distances asserted as
// exact numbers, only relative/boundary facts that survive PR 5's retuning.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
console.log("knockback.test — One Big Bite t2 spits a surviving dish backward, size-scaled");

// A surviving dish is pushed backward (dist decreases).
E.reset();
const dish = makeEnemy({ x: 400, y: 100, dist: 300, radius: 12 });
E.game.enemies.push(dish);
E.fireProjectile(makeTower("cannon", { x: 380, y: 100, damage: 5, knockbackBase: 100, knockbackSizeRef: 12 }), dish);
assert(E.game.enemies.includes(dish), "the dish survived the weak bite");
assert(dish.dist < 300, "a surviving dish is knocked backward (dist decreased)");

// Size-scaling: a lighter (smaller-radius) dish flies farther than a heavier one.
E.reset();
const small = makeEnemy({ dist: 500, radius: 7 });
const big = makeEnemy({ dist: 500, radius: 17 });
E.game.enemies.push(small, big);
const c2 = makeTower("cannon", { damage: 5, knockbackBase: 100, knockbackSizeRef: 12 });
E.fireProjectile(c2, small);
E.fireProjectile(c2, big);
assert((500 - small.dist) > (500 - big.dist), "a lighter dish flies farther than a heavier one");

// Clamp: a dish near the kitchen door can't be pushed past dist 0.
E.reset();
const nearDoor = makeEnemy({ dist: 20, radius: 7 });
E.game.enemies.push(nearDoor);
E.fireProjectile(makeTower("cannon", { damage: 5, knockbackBase: 100, knockbackSizeRef: 12 }), nearDoor);
assert(nearDoor.dist === 0, "knockback clamps at the kitchen door (dist >= 0)");

// Dead dishes don't fly: a lethal bite removes the dish outright.
E.reset();
const doomed = makeEnemy({ dist: 300, radius: 12, hp: 10 });   // hp below the bite damage
E.game.enemies.push(doomed);
E.fireProjectile(makeTower("cannon", { damage: 999, knockbackBase: 100, knockbackSizeRef: 12 }), doomed);
assert(!E.game.enemies.includes(doomed), "a killed dish is removed — dead dishes don't fly");

done("knockback");
