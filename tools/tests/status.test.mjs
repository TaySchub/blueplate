// The enemy STATUS layer (Roster Growth 2, stage 1): stacking DOTs that tick
// through the normal damage path, and the AMP vulnerability mark. Behavior
// only — every number here is the test's own fixture, never a tuned value.
import { loadEngine, assert, done, makeEnemy } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
const STEP = 1 / 60;
const run = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) E.updateStatuses(STEP); };

// ---- A dot ticks its full total over its duration, then expires ----
E.reset();
const d1 = makeEnemy({ hp: 1000 });
game.enemies.push(d1);
E.applyDot(d1, "smoke", { dps: 10, duration: 2, maxStacks: 5 });
assert(d1.dots.length === 1 && d1.dots[0].stacks === 1, "first application lands 1 stack");
run(2.0);
assert(Math.abs((1000 - d1.hp) - 20) < 1e-9, "a 10dps dot over 2s ticks exactly 20 damage (got " + (1000 - d1.hp) + ")");
assert(d1.dots.length === 0, "the dot expires after its duration");

// ---- Stacks add, cap, and refresh the clock; per-stack dps rides stacks ----
E.reset();
const d2 = makeEnemy({ hp: 1000 });
game.enemies.push(d2);
for (let i = 0; i < 5; i++) E.applyDot(d2, "smoke", { dpsPerStack: 4, duration: 3, maxStacks: 3 });
assert(d2.dots[0].stacks === 3, "stacks cap at maxStacks (5 applications → 3 stacks)");
run(1.0);
assert(Math.abs((1000 - d2.hp) - 12) < 1e-9, "per-stack dps rides the stack count (3 stacks × 4dps × 1s = 12)");
const halfway = d2.dots[0].duration;
E.applyDot(d2, "smoke", { dpsPerStack: 4, duration: 3, maxStacks: 3 });
assert(d2.dots[0].duration > halfway, "reapplying refreshes the duration");

// ---- Two source kinds keep separate entries + caps ----
E.reset();
const d3 = makeEnemy({ hp: 1000 });
game.enemies.push(d3);
E.applyDot(d3, "smoke", { dps: 2, duration: 5, maxStacks: 2 });
E.applyDot(d3, "ranch", { dps: 2, duration: 5, maxStacks: 4 });
assert(d3.dots.length === 2, "different source kinds hold separate dot entries");

// ---- AMP multiplies damage from ANY source, strongest wins, and expires ----
E.reset();
const a1 = makeEnemy({ hp: 1000 });
game.enemies.push(a1);
E.applyAmp(a1, 1.5, 1.0);
E.applyDamage(a1, 10);
assert(Math.abs((1000 - a1.hp) - 15) < 1e-9, "a 1.5x mark makes 10 damage land as 15");
E.applyAmp(a1, 1.2, 9.0);
assert(a1.ampMul === 1.5, "a weaker mark never downgrades the strongest one");
E.applyAmp(a1, 2.0, 0.5);
assert(a1.ampMul === 2.0, "a stronger mark replaces the old one");
run(0.6);
assert(a1.ampMul === 1 && a1.ampTimer <= 0, "the mark expires on its own clock");
const hpNow = a1.hp;
E.applyDamage(a1, 10);
assert(Math.abs((hpNow - a1.hp) - 10) < 1e-9, "damage is back to face value after expiry");

// ---- Amp also multiplies DOT ticks (all sources means all sources) ----
E.reset();
const a2 = makeEnemy({ hp: 1000 });
game.enemies.push(a2);
E.applyDot(a2, "smoke", { dps: 10, duration: 1, maxStacks: 1 });
E.applyAmp(a2, 2.0, 5.0);
run(1.0);
assert(Math.abs((1000 - a2.hp) - 20) < 1e-9, "a 2x mark doubles dot ticks too (10dps × 1s × 2 = 20)");

// ---- A dot kill is a normal death: bounty paid, kill counted ----
E.reset();
game.score = 0;
const victim = makeEnemy({ hp: 4, bounty: 7 });
game.enemies.push(victim);
const cash = game.currency, kills = game.killed;
E.applyDot(victim, "smoke", { dps: 10, duration: 2, maxStacks: 1 });
run(1.0);
assert(!game.enemies.includes(victim), "the dot ate the dish");
assert(game.currency === cash + 7, "a dot kill pays the dish's bounty");
assert(game.killed === kills + 1, "a dot kill counts as a dish eaten");

// ---- A marked dish that dies pays the mark's bonus Tips ----
E.reset();
const marked = makeEnemy({ hp: 4, bounty: 7 });
game.enemies.push(marked);
E.applyAmp(marked, 1.5, 5.0, 10);
const cash2 = game.currency;
E.applyDamage(marked, 100);
assert(game.currency === cash2 + 7 + 10, "a marked death pays bounty + the mark's bonus Tips");

// ---- Status slows: per-stack strength, floor cap, strongest source wins ----
E.reset();
const s1 = makeEnemy({ hp: 1000 });
game.enemies.push(s1);
E.applyDot(s1, "ranch", { duration: 5, maxStacks: 10, slowPerStack: 0.1, slowFloor: 0.5 });
E.applyDot(s1, "ranch", { duration: 5, maxStacks: 10, slowPerStack: 0.1, slowFloor: 0.5 });
E.applyDot(s1, "ranch", { duration: 5, maxStacks: 10, slowPerStack: 0.1, slowFloor: 0.5 });
assert(Math.abs(E.statusSlowFactor(s1) - 0.7) < 1e-9, "3 stacks × 0.1 slow → 0.7x speed");
E.maxDotStacks(s1, "ranch");
assert(Math.abs(E.statusSlowFactor(s1) - 0.5) < 1e-9, "maxed stacks bottom out at the floor cap");
assert(E.statusSlowFactor(makeEnemy({})) === 1, "no statuses → full speed");

// ---- The status LAYER consumes zero Math.random of its own ----
// (A damaging tick reuses the normal applyDamage path, whose cosmetic hit
// sparks roll RNG exactly like any other hit — pre-existing behavior, and it
// can never touch the gate because no reference-build tower applies statuses.
// This guard proves apply/expiry/slow/tick BOOKKEEPING adds no RNG of its own:
// a slow-only dot + an amp run a full lifecycle with zero rolls.)
E.reset();
const rngGuard = makeEnemy({ hp: 1000 });
game.enemies.push(rngGuard);
E.applyDot(rngGuard, "ranch", { duration: 0.8, maxStacks: 3, slowPerStack: 0.1, slowFloor: 0.5 });
E.applyAmp(rngGuard, 1.3, 0.8);
const realRandom = Math.random;
let rngCalls = 0;
Math.random = () => { rngCalls++; return 0.5; };
run(1.0);
E.statusSlowFactor(rngGuard);
Math.random = realRandom;
assert(rngCalls === 0, "status bookkeeping (apply/tick/expiry/slow) consumes ZERO Math.random");
assert(rngGuard.dots.length === 0 && rngGuard.ampMul === 1, "the guarded lifecycle actually ran to expiry");

// ---- Dot duration REFRESHES TO STRONGEST — a weaker applier can't CUT it (Issue #107 #8) ----
E.reset();
const dur = makeEnemy({ hp: 1e6 });
game.enemies.push(dur);
E.applyDot(dur, "smoke", { dpsPerStack: 5, duration: 4, maxStacks: 5 });   // a long clock
const sd = dur.dots.find((d) => d.src === "smoke");
E.applyDot(dur, "smoke", { dpsPerStack: 5, duration: 1, maxStacks: 5 });   // a SHORTER re-apply
assert(sd.duration === 4, "a shorter re-apply cannot cut the dot's remaining clock (Math.max, not last-writer-wins)");
E.applyDot(dur, "smoke", { dpsPerStack: 5, duration: 6, maxStacks: 5 });   // a LONGER re-apply
assert(sd.duration === 6, "a longer re-apply refreshes the clock upward");

// ---- The value-tag BONUS rides its OWN clock — a stronger damage-amp can't
//      truncate it, and applyAmp reports whether it landed (Issue #107 #7) ----
E.reset();
const tagged = makeEnemy({ hp: 1000 });
game.enemies.push(tagged);
const tagOk = E.applyAmp(tagged, 1, 5.0, 30);                 // a value tag (mul 1), long window
assert(tagOk === true && tagged.ampBonus === 30, "a value tag lands and applyAmp reports success");
const ampOk = E.applyAmp(tagged, 2.0, 0.5, 0);               // a STRONGER damage-amp, SHORT window
assert(ampOk === true && tagged.ampMul === 2.0, "a stronger damage-amp lands on the same dish");
for (let i = 0; i < Math.round(0.6 * 60); i++) E.updateStatuses(STEP);
assert(tagged.ampMul === 1, "the damage-amp expires on its own short clock");
assert(tagged.ampBonus === 30, "…but the value tag's bonus SURVIVES — its clock was never truncated");
tagged.ampMul = 2.0; tagged.ampTimer = 1.0;                   // now a live strong amp
const weakOk = E.applyAmp(tagged, 1.5, 1.0, 0);              // a WEAKER amp
assert(weakOk === false && tagged.ampMul === 2.0, "a weaker amp is ignored and reports no-landing (the tag cadence would retry)");

done("status");
