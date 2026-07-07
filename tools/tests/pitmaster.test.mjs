// The Pitmaster (Tower Rework): locks a dish and ramps a stacking smoke DOT on
// it. The Stall t1 deepens the cap + speeds the stacking; The Stall t2 arms an
// AMBIENT SMOKE AURA (the zone-applicator system) around the smoker; Whole Hog
// t2 racks TWO dishes at once (dual lock — the frozen count). Behavior only —
// every expected value is read from the tower the REAL tryBuild/tryUpgrade built.
import { loadEngine, assert, done, makeEnemy } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
const STEP = 1 / 60;
const ticks = (n) => { for (let i = 0; i < n; i++) E.updateTowers(STEP); };

const buildPit = (paths = []) => {
  E.reset();
  game.towers = [];
  game.currency = 100000;
  game.selectedType = "pit";
  const a = E.MAPS[0].simAnchors[0];
  E.tryBuild(a.x, a.y);
  const t = game.towers[game.towers.length - 1];
  for (const p of paths) E.tryUpgrade(t, p);
  return t;
};

// ---- The smoke stacks toward the tower's cap, and dps rides the stacks ----
let t = buildPit();
const smoked = makeEnemy({ x: t.x + 40, y: t.y, dist: 50, hp: 1e6 });
game.enemies.push(smoked);
ticks(1);
let dot = smoked.dots.find((d) => d.src === "smoke");
assert(!!dot && dot.stacks === 1, "the first baste lands 1 smoke stack");
assert(dot.dpsPerStack === t.smokeDps, "the dot's per-stack dps is the tower's LOADED smokeDps");
ticks(Math.ceil(60 * t.cooldown * (t.smokeStacks + 2)));   // plenty of applications
assert(dot.stacks === t.smokeStacks, "stacks ramp to the tower's cap and stop (" + t.smokeStacks + ")");
assert(t.slurpTargets[0] === smoked, "the Pitmaster stays locked on its dish");

// ---- The Stall t1: faster stacking AND a deeper cap ----
const base = buildPit();
t = buildPit(["theStall"]);
assert(t.cooldown < base.cooldown, "The Stall t1 stokes faster (shorter baste cooldown)");
assert(t.smokeStacks > base.smokeStacks, "…and raises the stack cap");
const deep = makeEnemy({ x: t.x + 40, y: t.y, dist: 50, hp: 1e6 });
game.enemies.push(deep);
ticks(Math.ceil(60 * t.cooldown * (t.smokeStacks + 2)));
assert(deep.dots.find((d) => d.src === "smoke").stacks === t.smokeStacks,
  "the deeper cap is reachable (" + t.smokeStacks + " stacks)");

// ---- The Stall t2: the ambient smoke AURA (zone applicator) ----
t = buildPit(["theStall", "theStall"]);
assert(t.auraPeriod > 0 && t.auraRadius > 0 && t.auraSrc === "smoke",
  "The Stall t2 arms the ambient smoke aura (period " + t.auraPeriod + "s, radius " + t.auraRadius + ")");
game.phase = "wave";
t.cdTimer = 1e9;   // park the direct baste so only the aura acts
const nearby = makeEnemy({ x: t.x + t.auraRadius * 0.6, y: t.y, dist: 50, hp: 1e6 });
const outside = makeEnemy({ x: t.x + t.auraRadius + 200, y: t.y, dist: 10, hp: 1e6 });
game.enemies.push(nearby, outside);
ticks(Math.ceil((t.auraPeriod + 0.1) / STEP));
assert(!!nearby.dots.find((d) => d.src === "smoke"), "a dish passing NEAR the smoker picks up smoke (no lock needed)");
assert(!outside.dots.find((d) => d.src === "smoke"), "a dish outside the aura stays clean");

// ---- Whole Hog t1: pure reach ----
t = buildPit(["wholeHog"]);
assert(t.range > base.range, "Whole Hog t1 is a pure range tier");

// ---- Whole Hog t2: the DUAL LOCK — two racks smoked at once (frozen count) ----
t = buildPit(["wholeHog", "wholeHog"]);
assert(t.smokeTargets === 2, "Whole Hog t2 racks TWO dishes (the FROZEN count)");
const r1 = makeEnemy({ x: t.x + 40, y: t.y, dist: 90, hp: 1e6 });
const r2 = makeEnemy({ x: t.x - 40, y: t.y, dist: 60, hp: 1e6 });
const r3 = makeEnemy({ x: t.x, y: t.y + 40, dist: 30, hp: 1e6 });
game.enemies.push(r1, r2, r3);
ticks(1);
assert(!!r1.dots.find((d) => d.src === "smoke") && !!r2.dots.find((d) => d.src === "smoke"),
  "both locked racks get smoke in the same baste");
assert(!r3.dots.find((d) => d.src === "smoke"), "the third dish is NOT smoked — the dual lock stops at two");
assert(t.slurpTargets.length === 2, "the lock list holds exactly two dishes");
// A rack freed by a kill re-fills from the belt.
E.applyDamage(r1, 1e9);
ticks(1);
assert(t.slurpTargets.length === 2 && t.slurpTargets.includes(r3), "a freed rack re-locks the next dish in range");

done("pitmaster");
