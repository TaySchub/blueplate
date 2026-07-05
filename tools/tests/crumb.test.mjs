// Speed Eater tier 2: a cannon bite also scatters damaging crumbs onto OTHER
// dishes within a small radius of the bitten one — and nothing beyond it. The
// splash is gated on the upgrade flag. Behavior only — no damage numbers asserted.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
console.log("crumb.test — Speed Eater t2 splashes crumbs onto nearby dishes only");

E.reset();
const target = makeEnemy({ x: 200, y: 100 });
const near = makeEnemy({ x: 230, y: 100 });   // 30px away — inside crumbRadius 46
const far = makeEnemy({ x: 300, y: 100 });    // 100px away — outside crumbRadius
E.game.enemies.push(target, near, far);

E.fireProjectile(makeTower("cannon", { x: 100, y: 100, damage: 90, crumbRadius: 46, crumbDamage: 34 }), target);
assert(target.hp < target.maxHp, "the bitten dish takes the main bite");
assert(near.hp < near.maxHp, "a dish inside the crumb radius takes splash damage");
assert(far.hp === far.maxHp, "a dish outside the crumb radius takes 0");

// Control: a cannon WITHOUT the crumb flag doesn't splash at all.
E.reset();
const t2 = makeEnemy({ x: 200, y: 100 });
const n2 = makeEnemy({ x: 230, y: 100 });     // same 30px neighbour as above
E.game.enemies.push(t2, n2);
E.fireProjectile(makeTower("cannon", { x: 100, y: 100, damage: 90 }), t2);
assert(n2.hp === n2.maxHp, "no crumb flag → neighbours take 0 (splash is gated on the upgrade)");

done("crumb");
