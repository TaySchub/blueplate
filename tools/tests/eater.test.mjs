// The Competitive Eater (Tower Rework): a lock-on single-target with a KILL
// COMBO that ramps bite speed (base-only — the combo is tower state, no
// enemy-side status). Water Dunk is the pure speed pole guarded by the
// COOLDOWN FLOOR (haste can never runaway with combo stacking); The Tip Jar
// t2 pays a flat bonus on EVERY Nth kill — a deterministic counter, never a
// chance roll. Behavior only.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;

function dish(dist, hp, bounty = 5) { const e = makeEnemy({ x: 30, y: 0, dist, hp, radius: 10 }); e.bounty = bounty; return e; }
function eater(opts) {
  return makeTower("eater", { typeId: "eater", range: 1000, cooldown: 1, damage: 1000,
    comboCap: 3, comboRamp: 1, combo: 0, cdTimer: 0, biteFloor: 0, jackpotEvery: 0, jackpotTips: 0, killCount: 0,
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

// --- THE COOLDOWN FLOOR: haste + combo can never ramp bites below biteFloor ---
const floored = eater({ cooldown: 1, biteFloor: 0.4, combo: 3, comboCap: 3, comboRamp: 10 });
assert(E.eaterBiteCooldown(floored) === 0.4,
  "a maxed combo + extreme ramp clamps AT the floor (no runaway)");
floored.buffHasteMul = 0.5;                      // a support haste on top
assert(E.eaterBiteCooldown(floored) === 0.4,
  "proximity haste stacked on combo STILL can't pierce the floor");
const unfloored = eater({ cooldown: 1, biteFloor: 0.001, combo: 3, comboCap: 3, comboRamp: 1 });
assert(E.eaterBiteCooldown(unfloored) === 0.25, "below the floor's reach, the ramp math is untouched");

// --- The real Water Dunk tiers keep the floor honest (data-driven check) ---
const def = E.TOWER_BY_ID.eater;
assert(def.biteFloor > 0, "the eater ships a real cooldown floor in its data");
let dunkCd = def.cooldown;
for (const tier of def.upgrades.waterDunk.tiers) if (tier.cooldownMul) dunkCd *= tier.cooldownMul;
const maxed = eater({ cooldown: dunkCd, biteFloor: def.biteFloor, combo: def.comboCap, comboCap: def.comboCap, comboRamp: def.comboRamp });
assert(E.eaterBiteCooldown(maxed) >= def.biteFloor - 1e-12,
  "a fully-dunked, fully-comboed eater still bites no faster than the floor");

// --- The Tip Jar t2: EVERY Nth kill pays the flat bonus (deterministic cadence) ---
game.phase = "wave";
const jack = eater({ damage: 1000, comboCap: 0, comboRamp: 0, jackpotEvery: 3, jackpotTips: 50 });
game.towers = [jack];
game.currency = 0;
let paidAt = [];
for (let k = 1; k <= 7; k++) {
  game.enemies = [dish(100, 1, 5)];
  const before = game.currency;
  E.updateTowers(STEP);
  if (game.currency - before === 5 + 50) paidAt.push(k);
  else assert(game.currency - before === 5, "kill " + k + " pays exactly the base bounty (no jackpot)");
}
assert(JSON.stringify(paidAt) === JSON.stringify([3, 6]),
  "the jackpot pays on EXACTLY every 3rd kill (kills 3 and 6 of 7) — a counter, not a chance");

done("eater");
