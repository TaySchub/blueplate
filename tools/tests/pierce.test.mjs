// Fork Frenzy tier 2 (PR 1 mechanic, back-filled per the PR-1 review): the thrown
// fork flies straight, skewers exactly the first TWO collinear dishes, and leaves
// everything off its ray untouched. Behavior only — no damage numbers asserted.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
console.log("pierce.test — Fork Frenzy t2 skewers exactly 2 collinear dishes");

E.reset();
const e1 = makeEnemy({ x: 200, y: 100 });
const e2 = makeEnemy({ x: 300, y: 100 });
const e3 = makeEnemy({ x: 400, y: 100 });   // a third on the same ray
const eOff = makeEnemy({ x: 250, y: 230 });  // off the ray
E.game.enemies.push(e1, e2, e3, eOff);

E.fireProjectile(makeTower("arrow", { x: 100, y: 100, damage: 30, pierce: true }), e1);
assert(E.game.projectiles.length === 1 && E.game.projectiles[0].piercing,
  "the pierce fork is a straight-line projectile, not a homing one");
let steps = 0;
while (E.game.projectiles.length && steps < 500) { E.moveProjectiles(1 / 60); steps++; }

assert(e1.hp < e1.maxHp, "first collinear dish is hit");
assert(e2.hp < e2.maxHp, "second collinear dish is skewered (pierced through the first)");
assert(e3.hp === e3.maxHp, "third collinear dish is NOT hit — stops after 2");
assert(eOff.hp === eOff.maxHp, "off-ray dish takes 0");

// Control: the base Regular (no upgrade) still throws a HOMING fork.
E.reset();
const h = makeEnemy({ x: 200, y: 100 });
E.game.enemies.push(h);
E.fireProjectile(makeTower("arrow", { x: 100, y: 100, damage: 30, pierce: false }), h);
const proj = E.game.projectiles[0];
assert(proj && !proj.piercing && proj.target === h, "base arrow keeps today's homing fork");

done("pierce");
