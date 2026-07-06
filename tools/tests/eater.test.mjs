// The Competitive Eater (Roster Growth 1): a lock-on single-target with a KILL
// COMBO that ramps bite speed, plus the Solomon Method (double half-hit) and
// Mustard Belt (max-combo bounty bonus) signatures. Behavior only — the combo is
// tower state (no enemy-side status), so nothing new touches the difficulty gate.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;

function dish(dist, hp, bounty = 5) { const e = makeEnemy({ x: 30, y: 0, dist, hp, radius: 10 }); e.bounty = bounty; return e; }
function eater(opts) {
  return makeTower("eater", { typeId: "eater", range: 1000, cooldown: 1, damage: 1000,
    comboCap: 3, comboRamp: 1, combo: 0, cdTimer: 0, solomonSplit: false, mustardBonus: 0,
    slurpTargets: [], slurpShow: 0, slurpSoundTimer: 0, ...opts });
}
// step big enough that cdTimer is always ready → one bite per updateTowers call.
const STEP = 10;

// --- combo ramps bite RATE on consecutive kills, and resets on an empty-lane gap ---
game.phase = "wave"; game.currency = 0;
const e = eater({});
game.towers = [e];
const cd0 = E.eaterBiteCooldown(e);              // combo 0 baseline
game.enemies = [dish(100, 1), dish(90, 1), dish(80, 1)];   // three one-shot dishes in a row
E.updateTowers(STEP); assert(e.combo === 1, "first consecutive kill → combo 1");
E.updateTowers(STEP); assert(e.combo === 2, "second consecutive kill → combo 2");
E.updateTowers(STEP); assert(e.combo === 3, "third consecutive kill → combo ramps to the cap (3)");
assert(E.eaterBiteCooldown(e) < cd0, "bite cooldown SHRINKS with combo (consecutive kills speed up the bites)");
game.enemies = [];                               // empty lane
E.updateTowers(STEP);
assert(e.combo === 0, "the combo RESETS when no dish is available (empty-lane gap)");

// --- Solomon Method: one bite lands as two half-hits totalling one bite's damage ---
const sol = eater({ damage: 10, comboCap: 1, comboRamp: 0, solomonSplit: true });
game.towers = [sol];
const big = dish(50, 1000, 0);                    // tanky so it survives to measure the bite
game.enemies = [big];
E.updateTowers(STEP);
assert(1000 - big.hp === 10, "Solomon Method deals exactly one bite's damage per bite (two 5s, not double, not half)");

// --- Mustard Belt: kills pay a bounty BONUS only WHILE AT max combo ---
const belt = eater({ damage: 1000, comboCap: 2, comboRamp: 0, mustardBonus: 25 });
game.towers = [belt];
game.currency = 0;
game.enemies = [dish(100, 1, 5), dish(90, 1, 5)];   // two kills to REACH max (neither is "at max" yet)
E.updateTowers(STEP); const afterK1 = game.currency;   // combo 0→1: base bounty only
E.updateTowers(STEP); const afterK2 = game.currency;   // combo 1→2(cap): base bounty only (was <cap before this kill)
assert(afterK1 === 5 && afterK2 === 10, "kills below max combo pay only the base bounty (no belt bonus)");
game.enemies = [dish(80, 1, 5)];                    // now AT max combo — this kill should pay the bonus
const before = game.currency;
E.updateTowers(STEP);
assert(belt.combo === 2, "the combo stays capped at max");
assert(game.currency - before === 5 + 25, "at max combo, a kill pays the base bounty PLUS the Mustard Belt bonus");

done("eater");
