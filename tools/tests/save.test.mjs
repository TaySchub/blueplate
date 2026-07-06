// Save & Continue (Issue #83): the checkpoint roundtrip. Behavior only — no tuned
// numbers. Proves that a checkpoint taken in prep, then restored, reproduces the
// wave/currency/lives and every tower's position, committed path, tier, and
// targeting; that a restored tier-2 tower's signature flags are LIVE (rebuilt
// through the real code paths); that defeat clears the save; and that a
// version-mismatched or unparseable blob is discarded without crashing.
import { loadEngine, assert, done } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
// Must match engine.js SAVE_KEY (the tamper cases below write raw blobs to it).
const SAVE_KEY = "deckbound.save.v1";

// ---- Build a representative prep board on the default (tuned) map ----
E.loadMap(E.MAPS[0]);
E.startRun();                              // -> prep, wave 0, empty board
game.currency = 100000;                    // plenty to build + upgrade during setup
const a = E.MAPS[0].simAnchors;

// arrow -> Fork Frenzy to tier 2 (its signature flag is pierce=true).
game.selectedType = "arrow"; E.tryBuild(a[0].x, a[0].y);
const arrow = game.towers[game.towers.length - 1];
E.tryUpgrade(arrow, "forkFrenzy"); E.tryUpgrade(arrow, "forkFrenzy");

// cannon left un-upgraded, but with a NON-default targeting priority.
game.selectedType = "cannon"; E.tryBuild(a[1].x, a[1].y);
const cannon = game.towers[game.towers.length - 1];
E.setTargeting(cannon, "strong");

// zap -> Birthday Party to tier 2 (signature: maxTargets +1), targeting "last".
game.selectedType = "zap"; E.tryBuild(a[2].x, a[2].y);
const zap = game.towers[game.towers.length - 1];
E.tryUpgrade(zap, "birthdayParty"); E.tryUpgrade(zap, "birthdayParty");
E.setTargeting(zap, "last");

// eater — a NEW-type tower (Roster Growth 1) -> Record Pace tier 2 (signature:
// Mustard Belt bounty bonus), targeting "close". Covers a newcomer in the roundtrip.
game.selectedType = "eater"; E.tryBuild(a[3].x, a[3].y);
const eater = game.towers[game.towers.length - 1];
E.tryUpgrade(eater, "recordPace"); E.tryUpgrade(eater, "recordPace");
E.setTargeting(eater, "close");

assert(game.towers.length === 4, "four towers seated on the prep board (incl. a new-type eater)");
assert(arrow.pierce === true, "arrow's Fork Frenzy tier-2 pierce flag is set pre-save");
assert(zap.maxTargets === E.TOWER_BY_ID.zap.maxTargets + 1, "zap's Birthday Party tier-2 added a target pre-save");
assert(eater.mustardBonus > 0, "eater's Mustard Belt tier-2 bounty bonus is set pre-save");

// Give the snapshot a distinctive, non-default wave/currency/lives, then freeze it.
game.waveIndex = 3; game.currency = 137; game.lives = 7;
E.saveCheckpoint();

// Capture the exact expected format + the reconstructed-flag values, then wipe the
// live state so the restore has to come from disk, not memory.
const preSave = JSON.stringify(E.serializeRun());
const expArrowSpent = arrow.spent, expZapSpent = zap.spent, expZapMaxTargets = zap.maxTargets;
const expEaterMustard = eater.mustardBonus, expEaterComboCap = eater.comboCap;
game.towers = []; game.waveIndex = 99; game.currency = 1; game.lives = 1; game.phase = "lost";

// ---- Restore ----
const ok = E.restoreRun();
assert(ok === true, "restoreRun() reports success");
assert(game.phase === "prep", "restore lands in PREP");
assert(JSON.stringify(E.serializeRun()) === preSave,
  "the full save format roundtrips (wave, currency, lives, and every tower's pos/path/tier/targeting)");
assert(game.waveIndex === 3 && game.currency === 137 && game.lives === 7,
  "wave/currency/lives reproduce exactly");
assert(game.autoStartArmed === false,
  "restore disarms auto-start — the first prep after a resume never auto-calls");

// Signature flags + spend are NOT in the minimal format — they must be REBUILT
// through the real tryBuild/upgrade paths.
const rArrow = game.towers.find((t) => t.typeId === "arrow");
const rZap = game.towers.find((t) => t.typeId === "zap");
const rCannon = game.towers.find((t) => t.typeId === "cannon");
assert(rArrow && rArrow.pierce === true, "a restored tier-2 arrow has its pierce signature LIVE");
assert(rZap && rZap.maxTargets === expZapMaxTargets, "a restored tier-2 zap has its added target LIVE");
assert(rArrow.spent === expArrowSpent && rZap.spent === expZapSpent,
  "spent reconstructs (base + tiers) through the real code paths");
assert(rCannon && rCannon.targeting === "strong", "an un-upgraded tower's targeting survives the roundtrip");
const rEater = game.towers.find((t) => t.typeId === "eater");
assert(rEater && rEater.upgradePath === "recordPace" && rEater.upgradeTier === 2 && rEater.targeting === "close",
  "a restored NEW-type tower (eater) keeps its type, committed path, tier, and targeting");
assert(rEater.mustardBonus === expEaterMustard && rEater.comboCap === expEaterComboCap,
  "a restored eater's Mustard Belt bonus + combo ceiling are REBUILT through the real upgrade path");

// ---- Defeat clears the save ----
game.phase = "wave"; game.lives = 0;
E.endRun();
assert(E.readSave() === null, "defeat clears the checkpoint");

// ---- A version mismatch is discarded without crashing ----
globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
  version: 999, mapId: "blueplate", waveIndex: 1, currency: 1, lives: 1, towers: [],
}));
assert(E.readSave() === null, "a version-mismatched save is discarded");
assert(E.restoreRun() === false, "restoreRun() refuses a version-mismatched save without crashing");

// ---- An unparseable blob is discarded without crashing ----
globalThis.localStorage.setItem(SAVE_KEY, "{ not valid json");
assert(E.readSave() === null, "an unparseable save blob is discarded");

done("save");
