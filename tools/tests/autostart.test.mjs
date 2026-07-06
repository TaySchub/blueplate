// Auto-start rounds (economy overhaul stage 2): with META.autoStart set, the
// NEXT wave calls itself that many seconds after the previous wave resolves.
// Behavior asserted, not tuned numbers: the run's FIRST prep never auto-calls,
// a resolved wave arms it, "off" disables it, and the first prep after a
// save-restore skips it once (the player gets a breather).
import { loadEngine, assert, done } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;
const STEP = 1 / 60;
const run = (seconds) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) E.update(STEP); };
// Resolve the current wave instantly: empty the spawn queue + belt, then one
// update lets checkWaveEnd advance to the next prep (the real code path).
const resolveWave = () => { game.spawnQueue = []; game.enemies = []; E.update(STEP); };

E.loadMap(E.MAPS[0]);
E.startRun();
E.getMeta().autoStart = 1;   // 1-second delay

// ---- The run's FIRST prep is always manual ----
run(3);
assert(game.phase === "prep", "the run's first prep never auto-calls (even with auto-start on)");

// ---- A resolved wave arms the countdown ----
E.startNextWave();
assert(game.phase === "wave", "manual call still works");
resolveWave();
assert(game.phase === "prep" && game.autoStartArmed === true, "a resolved wave lands in prep, armed");
run(0.5);
assert(game.phase === "prep", "before the configured delay the wave hasn't auto-called");
run(0.7);
assert(game.phase === "wave", "after the configured delay the next wave auto-calls");

// ---- Instant (0s) fires on the first prep tick after a resolve ----
E.getMeta().autoStart = 0;
resolveWave();
E.update(STEP);
assert(game.phase === "wave", "Instant (0s) auto-calls on the first prep tick");

// ---- Off disables it ----
E.getMeta().autoStart = "off";
resolveWave();
run(5);
assert(game.phase === "prep", "auto-start 'off' never calls the wave");

// ---- The first prep after a RESTORE skips auto-start once ----
E.getMeta().autoStart = 1;
E.saveCheckpoint();                        // checkpoint this prep
const ok = E.restoreRun();
assert(ok === true, "restoreRun() succeeds from the checkpoint");
run(3);
assert(game.phase === "prep", "the first prep after a restore ignores auto-start (breather)");
E.startNextWave();
resolveWave();
run(1.2);
assert(game.phase === "wave", "auto-start re-arms on the next resolved wave after the breather");

done("autostart");
