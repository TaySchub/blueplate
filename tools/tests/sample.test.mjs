// The Sample Lady (Tower Rework: PURE SUPPORT — no attack). Her aura is the
// tower-proximity system: nearby customers attack faster and their upgrades
// cost less, radius = her RANGE stat (so the stock ghost ring shows it). On
// the House t1 periodically VALUE-TAGS a dish (worth more on death) on a
// deterministic cadence. Behavior only — every expected value is read from
// towers the REAL tryBuild/tryUpgrade built.
import { loadEngine, assert, done, makeEnemy } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
const STEP = 1 / 60;
const ticks = (n) => { for (let i = 0; i < n; i++) E.updateTowers(STEP); };
const anchors = E.MAPS[0].simAnchors;

const build = (typeId, anchor, paths = []) => {
  game.currency = 100000;
  game.selectedType = typeId;
  E.tryBuild(anchor.x, anchor.y);
  const t = game.towers[game.towers.length - 1];
  for (const p of paths) E.tryUpgrade(t, p);
  return t;
};

// ---- Pure support: she has NO attack and deals no damage ----
E.reset(); game.towers = [];
let lady = build("sample", anchors[0]);
assert(E.TOWER_BY_ID.sample.behavior === "support" && lady.damage === 0, "the Sample Lady is pure support (no damage stat)");
const dish = makeEnemy({ x: lady.x + 30, y: lady.y, dist: 50, hp: 1e6 });
game.enemies.push(dish);
ticks(60);
assert(dish.hp === 1e6 && dish.freezeTimer === 0, "she never attacks, nibbles, or stuns a dish");

// ---- The aura: haste + upgrade discount for towers in her RANGE ----
E.reset(); game.towers = [];
lady = build("sample", anchors[0]);
// anchors[0] (455,210) -> anchors[8] (415,250) is ~56px, inside her aura (100);
// anchors[5] (705,210) is 250px out — well outside.
const nearArrow = build("arrow", anchors[8]);
const farArrow = build("arrow", anchors[5]);
assert(nearArrow.buffHasteMul === lady.supportHaste && nearArrow.buffHasteMul < 1,
  "a customer inside the aura attacks faster (the tower's LOADED supportHaste)");
assert(nearArrow.buffDiscount === lady.supportDiscount && nearArrow.buffDiscount > 0,
  "…and gets her LOADED upgrade discount");
assert(farArrow.buffHasteMul === 1 && farArrow.buffDiscount === 0, "a customer outside her range gets nothing");
// The discount is REAL and SHOWN: tierCostFor (the sheet's number) is what tryUpgrade charges.
const path = E.towerPaths("arrow")[0];
const tier = E.nextTier(nearArrow, path.id);
const shown = E.tierCostFor(nearArrow, tier);
assert(shown < tier.cost, "the sheet's displayed price is really discounted inside the aura");
const cash = game.currency;
E.tryUpgrade(nearArrow, path.id);
assert(cash - game.currency === shown, "the discounted price is exactly what the upgrade charges");

// ---- Happy Hour: t1 widens the aura (range = the aura), t2 adds damage ----
E.reset(); game.towers = [];
lady = build("sample", anchors[0], ["happyHour"]);
assert(lady.range > E.TOWER_BY_ID.sample.range, "Happy Hour t1 widens the aura via the RANGE stat (the stock ring shows it)");
E.tryUpgrade(lady, "happyHour");
assert(lady.supportDamage > 1, "Happy Hour t2 arms the aura's damage buff");
const buffed = build("arrow", anchors[8]);
assert(buffed.buffDamageMul === lady.supportDamage, "a customer in the aura receives the damage buff");
assert(E.towerDamage(buffed) > buffed.damage, "…and its effective damage really rises");

// ---- On the House t1: value tags on a deterministic cadence ----
E.reset(); game.towers = []; game.phase = "wave";
lady = build("sample", anchors[0], ["onTheHouse"]);
assert(lady.tagPeriod > 0 && lady.tagBonus > 0, "On the House arms the value tag (period " + lady.tagPeriod + "s)");
const tagged = makeEnemy({ x: lady.x + 30, y: lady.y, dist: 80, hp: 1e6, bounty: 10 });
const second = makeEnemy({ x: lady.x - 30, y: lady.y, dist: 40, hp: 1e6, bounty: 10 });
game.enemies.push(tagged, second);
ticks(1);   // the first tag lands immediately, then the cadence gates the rest
assert(tagged.ampBonus === lady.tagBonus && tagged.ampMul === 1,
  "the frontmost dish gets flagged worth-more-on-death — with NO damage amp (the old amp is gone)");
assert(second.ampBonus === 0, "one tag per cadence — the second dish waits");
ticks(Math.ceil((lady.tagPeriod * 0.5) / STEP));
assert(second.ampBonus === 0, "…and is still waiting halfway through the cadence");
ticks(Math.ceil((lady.tagPeriod * 0.6) / STEP));
assert(second.ampBonus === lady.tagBonus, "the NEXT cadence tags the next unflagged dish (deterministic every-Nth, no RNG)");
const cash2 = game.currency;
E.applyDamage(tagged, 1e9);
assert(game.currency === cash2 + 10 + lady.tagBonus, "a flagged death pays bounty + the tag bonus");

// ---- On the House t2: the aura haste stacks further ----
E.reset(); game.towers = [];
lady = build("sample", anchors[0], ["onTheHouse", "onTheHouse"]);
assert(lady.supportHaste < E.TOWER_BY_ID.sample.supportHaste,
  "On the House t2 strengthens her haste beyond the base aura");
const hasted = build("arrow", anchors[8]);
assert(hasted.buffHasteMul === lady.supportHaste, "…and towers in the aura receive the stronger haste");

done("sample");
