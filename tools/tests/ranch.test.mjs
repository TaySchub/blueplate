// The Syrup Slinger (internal id `ranch`, Tower Rework): a single-target
// maple-syrup glob that GLUES the dish — an immediate, strong, duration-based,
// refreshable slow with ZERO damage (pure control). Quick Pour t2 arms the
// Syrup Trail (a stuck death leaves a belt puddle); The Big Bottle t2 globs
// several dishes per squeeze. Behavior only — every expected value is read
// from the tower the REAL tryBuild/tryUpgrade built.
import { loadEngine, assert, done, makeEnemy } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
const STEP = 1 / 60;
const ticks = (n) => { for (let i = 0; i < n; i++) E.updateTowers(STEP); };

const buildSlinger = (paths = []) => {
  E.reset();
  game.towers = [];
  game.zones = [];
  game.currency = 100000;
  game.selectedType = "ranch";
  const a = E.MAPS[0].simAnchors[0];
  E.tryBuild(a.x, a.y);
  const t = game.towers[game.towers.length - 1];
  for (const p of paths) E.tryUpgrade(t, p);
  return t;
};

// ---- A glob = an immediate full glue-slow, and ZERO damage (pure control) ----
let t = buildSlinger();
const glued = makeEnemy({ x: t.x + 50, y: t.y, dist: 90, hp: 1e6 });
game.enemies.push(glued);
ticks(1);
const dot = glued.dots.find((d) => d.src === "syrup");
assert(!!dot, "the glob lands the syrup glue (status-layer dot)");
assert(glued.hp === 1e6, "the Syrup Slinger deals ZERO damage — pure control is the kit");
assert(Math.abs(E.statusSlowFactor(glued) - t.glueFactor) < 1e-9,
  "the glue drags the dish at the tower's LOADED glueFactor immediately (no stacking up)");
assert(E.statusSlowFactor(glued) > 0, "the drag is never a full stop (the Photographer owns the STOP)");

// ---- The glue is REFRESHABLE: a later glob restarts the full duration ----
for (let i = 0; i < Math.ceil((t.glueDur * 0.7) / STEP); i++) E.updateStatuses(STEP);
assert(dot.duration < t.glueDur * 0.5, "the glue clock ran down between globs");
t.cdTimer = 0;
ticks(1);
assert(Math.abs(dot.duration - t.glueDur) < 1e-6, "a fresh glob REFRESHES the glue to its full duration");

// ---- Base slings ONE glob per squeeze, at the frontmost dish ----
t = buildSlinger();
const front = makeEnemy({ x: t.x + 40, y: t.y, dist: 90, hp: 1e6 });
const back = makeEnemy({ x: t.x - 40, y: t.y, dist: 30, hp: 1e6 });
game.enemies.push(front, back);
ticks(1);
assert(!!front.dots.find((d) => d.src === "syrup"), "the frontmost dish gets the glob");
assert(!back.dots.find((d) => d.src === "syrup"), "the base kit globs only ONE dish per squeeze");

// ---- Globs SPREAD: the next squeeze goes to an un-glued dish, not a re-coat ----
t.cdTimer = 0;
ticks(1);
assert(!!back.dots.find((d) => d.src === "syrup"),
  "the SECOND glob goes to the still-dry dish (syrup spreads before it refreshes)");

// ---- The Big Bottle t2: one squeeze globs several dishes (the frozen multi-glob) ----
t = buildSlinger(["bigBottle", "bigBottle"]);
assert(t.glueTargets === 3, "Big Bottle t2 arms the multi-glob (3 dishes — the FROZEN count)");
const g1 = makeEnemy({ x: t.x + 40, y: t.y, dist: 90, hp: 1e6 });
const g2 = makeEnemy({ x: t.x - 40, y: t.y, dist: 60, hp: 1e6 });
const g3 = makeEnemy({ x: t.x, y: t.y + 40, dist: 30, hp: 1e6 });
const g4 = makeEnemy({ x: t.x, y: t.y - 40, dist: 10, hp: 1e6 });
game.enemies.push(g1, g2, g3, g4);
ticks(1);
const gluedCount = [g1, g2, g3, g4].filter((e) => e.dots.find((d) => d.src === "syrup")).length;
assert(gluedCount === 3, "one squeeze glues exactly three dishes (frontmost first)");
assert(!g4.dots.find((d) => d.src === "syrup"), "the fourth (least advanced) dish waits its turn");

// ---- Quick Pour t2 (Syrup Trail): a glued dish that DIES leaves a puddle ----
t = buildSlinger(["quickPour", "quickPour"]);
assert(t.trailCap === 3, "Syrup Trail arms the puddle (up to 3 passers — the FROZEN count)");
game.zones = [];
const meal = makeEnemy({ x: t.x + 50, y: t.y, dist: 70, hp: 10, bounty: 5 });
game.enemies.push(meal);
ticks(1);   // glue it
E.applyDamage(meal, 1e9);   // another customer eats it while stuck
assert(game.zones.length === 1, "a glued dish that's EATEN leaves a syrup puddle on the belt");
assert(game.zones[0].cap === t.trailCap, "the puddle carries the trail's capacity");
const passer = makeEnemy({ x: game.zones[0].x + 4, y: game.zones[0].y, dist: 40, hp: 1e6 });
game.enemies.push(passer);
E.updateZones(STEP);
assert(!!passer.dots.find((d) => d.src === "syrup"), "the puddle glues a passer with the same syrup");

done("ranch");
