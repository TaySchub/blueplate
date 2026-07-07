// Zone applicators (Tower Rework): one system, two shapes — a tower-centered
// ambient AURA on a cadence, and a belt PUDDLE with a lifetime and a capacity.
// Both apply statuses through the EXISTING status layer (applyDot), and the
// glue-slow they carry is a single-stack, duration-based, REFRESHABLE full
// slow that composes with (never forks) the freeze→slow chain. Behavior only —
// every zone here is built from explicit fields, never tuned balance numbers.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
const STEP = 1 / 60;

const GLUE = { duration: 2, maxStacks: 1, slowPerStack: 0.7, slowFloor: 0.3 };

// ---- A belt puddle catches a dish that touches it (through the status layer) ----
E.reset();
game.zones = [];
E.spawnZone({ kind: "syrup", x: 100, y: 100, radius: 20, life: 5, cap: 3, src: "syrup", opts: { ...GLUE } });
const onIt = makeEnemy({ x: 105, y: 100, dist: 50 });
const offIt = makeEnemy({ x: 300, y: 300, dist: 10 });
game.enemies.push(onIt, offIt);
E.updateZones(STEP);
assert(!!onIt.dots.find((d) => d.src === "syrup"), "a dish touching the puddle is glued (status-layer dot)");
assert(!offIt.dots.find((d) => d.src === "syrup"), "a dish away from the puddle is untouched");
assert(Math.abs(E.statusSlowFactor(onIt) - 0.3) < 1e-9, "the glue-slow drags the dish to its floor factor");

// ---- Capacity: the puddle glues up to `cap` DISTINCT passers, then is spent ----
E.reset();
game.zones = [];
E.spawnZone({ kind: "syrup", x: 100, y: 100, radius: 30, life: 60, cap: 2, src: "syrup", opts: { ...GLUE } });
const p1 = makeEnemy({ x: 100, y: 100 }), p2 = makeEnemy({ x: 110, y: 100 }), p3 = makeEnemy({ x: 90, y: 100 });
game.enemies.push(p1, p2, p3);
E.updateZones(STEP);
const glued = [p1, p2, p3].filter((e) => e.dots.find((d) => d.src === "syrup"));
assert(glued.length === 2, "a capacity-2 puddle glues exactly two of three overlapping dishes");
assert(game.zones.length === 0, "a puddle at capacity is SPENT (removed)");

// ---- Lifetime: an untouched puddle expires on its own clock ----
E.reset();
game.zones = [];
E.spawnZone({ kind: "syrup", x: 100, y: 100, radius: 20, life: 0.5, cap: 3, src: "syrup", opts: { ...GLUE } });
for (let i = 0; i < Math.ceil(0.6 / STEP); i++) E.updateZones(STEP);
assert(game.zones.length === 0, "an untouched puddle expires when its lifetime runs out");

// ---- The glue-slow is REFRESHABLE: reapplying restarts the clock, stacks stay 1 ----
E.reset();
const stuck = makeEnemy({ x: 0, y: 0 });
game.enemies.push(stuck);
E.applyDot(stuck, "syrup", { ...GLUE });
const d0 = stuck.dots.find((d) => d.src === "syrup");
// run the clock most of the way down…
for (let i = 0; i < Math.ceil(1.5 / STEP); i++) E.updateStatuses(STEP);
assert(d0.duration < 1, "the glue clock ran down");
E.applyDot(stuck, "syrup", { ...GLUE });
assert(Math.abs(d0.duration - GLUE.duration) < 1e-9, "reapplying REFRESHES the glue to its full duration");
assert(d0.stacks === 1, "glue never stacks past 1 (strength lives in the factor, not stacks)");
assert(Math.abs(E.statusSlowFactor(stuck) - 0.3) < 1e-9, "the refreshed glue keeps the same drag");

// ---- Glue composes with the freeze chain (freeze stops; glue drags after) ----
stuck.freezeTimer = 0.2;
stuck.speed = 60; stuck.dist = 100;
E.moveEnemies(STEP);
assert(stuck.dist === 100, "a frozen dish is stopped dead even while glued (freeze owns the STOP)");
stuck.freezeTimer = 0;
const before = stuck.dist;
E.moveEnemies(STEP);
assert(Math.abs((stuck.dist - before) - 60 * 0.3 * STEP) < 1e-9, "once thawed, the glue's drag applies (syrup owns the DRAG)");

// ---- Trail: a dish that DIES stuck leaves a puddle; a leak leaves nothing ----
E.reset();
game.zones = [];
const dying = makeEnemy({ x: 200, y: 200, hp: 5, bounty: 0 });
game.enemies.push(dying);
E.applyDot(dying, "syrup", { ...GLUE, trail: { radius: 18, life: 4, cap: 3, opts: { ...GLUE } } });
E.applyDamage(dying, 10);   // killed while stuck
assert(game.zones.length === 1, "a dish that dies STUCK leaves a syrup puddle behind");
assert(game.zones[0].x === 200 && game.zones[0].cap === 3, "the puddle lands where it died, with the trail's capacity");
const chained = makeEnemy({ x: 205, y: 200, hp: 5, bounty: 0 });
game.enemies.push(chained);
E.updateZones(STEP);
assert(!!chained.dots.find((d) => d.src === "syrup"), "the puddle glues a passer");
E.applyDamage(chained, 10);
assert(game.zones.length === 1, "a puddle-glued death does NOT chain a second puddle (trail rides only the tower's glob)");
E.reset();
game.zones = [];
const leaking = makeEnemy({ x: 200, y: 200, hp: 5 });
game.enemies.push(leaking);
E.applyDot(leaking, "syrup", { ...GLUE, trail: { radius: 18, life: 4, cap: 3, opts: { ...GLUE } } });
leaking.reachedCore = true;                                   // it escaped
game.enemies = game.enemies.filter((e) => e !== leaking);     // moveEnemies' removal
assert(game.zones.length === 0, "a LEAKED sticky dish leaves no puddle (deaths only)");

// ---- Ambient aura: a tower-centered zone ticks its status on a cadence ----
E.reset();
game.zones = [];
game.phase = "wave";
const smoker = makeTower("pit", { x: 0, y: 0, auraPeriod: 0.5, auraRadius: 80, auraSrc: "smoke", auraTimer: 0,
                                  smokeDps: 10, smokeDuration: 4, smokeStacks: 5,
                                  slurpTargets: [], cooldown: 1e9, cdTimer: 1e9 });   // cooldown parked: only the aura acts
game.towers = [smoker];
const near = makeEnemy({ x: 40, y: 0, dist: 50, hp: 1e6 });
const farAway = makeEnemy({ x: 500, y: 0, dist: 10, hp: 1e6 });
game.enemies.push(near, farAway);
E.updateTowers(STEP);   // first tick: auraTimer hits 0 → one application
const aur = near.dots.find((d) => d.src === "smoke");
assert(!!aur && aur.stacks === 1, "the aura lands a smoke stack on a dish near the tower");
assert(!farAway.dots.find((d) => d.src === "smoke"), "a dish outside the aura radius is untouched");
for (let i = 0; i < Math.ceil(0.5 / STEP); i++) E.updateTowers(STEP);
assert(aur.stacks === 2, "the aura re-applies on its CADENCE (deterministic every-period tick, no RNG)");
const hpBefore = near.hp;
for (let i = 0; i < Math.ceil(0.5 / STEP); i++) E.updateStatuses(STEP);
assert(near.hp < hpBefore, "the aura's smoke ticks damage through the NORMAL status/damage path");

done("zones");
