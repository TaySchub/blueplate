// Tower-proximity support effects (Tower Rework): ONE radius check from a
// support tower to the towers in its range → attack-haste, +damage, and an
// upgrade DISCOUNT. The discount hooks the REAL tryUpgrade price and the same
// helper the sheet displays (tierCostFor), so what the player sees is what
// they pay. Strongest single provider wins per effect (no stacking). Behavior
// only — providers are built with explicit fields, never tuned numbers.
import { loadEngine, assert, done, makeEnemy, makeTower } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;

// A provider granting all three effects within `range`.
function provider(x, y, range, { haste = 1, damage = 1, discount = 0 } = {}) {
  return makeTower("sample", { x, y, range,
    supportHaste: haste, supportDamage: damage, supportDiscount: discount,
    buffHasteMul: 1, buffDamageMul: 1, buffDiscount: 0 });
}
// A plain receiver with neutral buff fields.
function receiver(x, y, opts = {}) {
  return makeTower("arrow", { x, y, buffHasteMul: 1, buffDamageMul: 1, buffDiscount: 0, ...opts });
}

// ---- One radius check grants the whole effect set — in range only ----
E.reset();
const s = provider(0, 0, 100, { haste: 0.9, damage: 1.1, discount: 0.1 });
const inR = receiver(50, 0);
const outR = receiver(500, 0);
game.towers = [s, inR, outR];
E.recomputeSupport();
assert(inR.buffHasteMul === 0.9 && inR.buffDamageMul === 1.1 && inR.buffDiscount === 0.1,
  "a tower inside the aura receives haste + damage + discount");
assert(outR.buffHasteMul === 1 && outR.buffDamageMul === 1 && outR.buffDiscount === 0,
  "a tower outside the aura receives nothing");
assert(s.buffHasteMul === 1 && s.buffDiscount === 0, "the provider does not buff itself");

// ---- The buffs change the REAL attack math ----
assert(Math.abs(E.towerCooldown(inR) - inR.cooldown * 0.9) < 1e-12, "haste shortens the effective cooldown");
assert(Math.abs(E.towerDamage(inR) - inR.damage * 1.1) < 1e-12, "the damage buff raises the effective damage");
assert(E.towerCooldown(outR) === outR.cooldown && E.towerDamage(outR) === outR.damage,
  "an unbuffed tower's numbers are EXACTLY its own (×1 — bit-identical)");

// ---- Strongest single provider wins per effect — overlapping auras don't stack ----
E.reset();
const s1 = provider(0, 0, 100, { haste: 0.9, discount: 0.1 });
const s2 = provider(10, 0, 100, { haste: 0.8, discount: 0.05 });
const both = receiver(30, 0);
game.towers = [s1, s2, both];
E.recomputeSupport();
assert(both.buffHasteMul === 0.8, "the STRONGEST haste wins (0.8, not 0.72 stacked)");
assert(both.buffDiscount === 0.1, "the STRONGEST discount wins (10%, not 15% stacked)");

// ---- The discount hooks the REAL tryUpgrade price AND the displayed price ----
E.reset();
game.towers = [];
game.currency = 100000;
game.selectedType = "arrow";
const a = E.MAPS[0].simAnchors[0];
E.tryBuild(a.x, a.y);
const upgTower = game.towers[0];
upgTower.buffDiscount = 0.1;   // as if seated in a discount aura
const path = E.towerPaths("arrow")[0];
const tier = E.nextTier(upgTower, path.id);
const shown = E.tierCostFor(upgTower, tier);
assert(shown === Math.max(1, Math.round(tier.cost * 0.9)), "tierCostFor rounds the discounted price to whole Tips");
assert(shown < tier.cost, "the discounted price is really lower than list");
const cashBefore = game.currency;
E.tryUpgrade(upgTower, path.id);
assert(cashBefore - game.currency === shown, "tryUpgrade CHARGES exactly the displayed discounted price");
assert(upgTower.spent === E.TOWER_BY_ID.arrow.cost + shown, "spent tracks what was actually paid (sell refunds stay honest)");

// ---- An undiscounted tower pays list price exactly (integer, no rounding drift) ----
E.reset();
game.towers = []; game.currency = 100000; game.selectedType = "arrow";
E.tryBuild(a.x, a.y);
const plain = game.towers[0];
const t2 = E.nextTier(plain, path.id);
assert(E.tierCostFor(plain, t2) === t2.cost, "no aura → tierCostFor IS the list price (the gate never moves)");

// ---- Board changes recompute: selling the provider drops the buffs ----
E.reset();
game.towers = []; game.currency = 100000;
game.selectedType = "sample"; E.tryBuild(a.x, a.y);
const lady = game.towers[0];
lady.supportHaste = 0.9; lady.supportDiscount = 0.1;   // grant fields (kits set these via data in stage 2)
game.selectedType = "arrow"; E.tryBuild(a.x + 60, a.y);
const nearHer = game.towers[1];
E.recomputeSupport();
assert(nearHer.buffHasteMul === 0.9 && nearHer.buffDiscount === 0.1, "the seated neighbour is buffed");
E.sellTower(lady);
assert(nearHer.buffHasteMul === 1 && nearHer.buffDiscount === 0, "selling the provider clears the buffs (recompute on sell)");

done("proximity");
