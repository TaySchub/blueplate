// Per-kill bounties (economy overhaul stage 2): a killed dish pays exactly the
// bounty LOADED from balance.json (behavior, never a tuned number — the test
// reads the value it asserts against), a zero-bounty dish pays nothing and
// shows no tip popup, and a dish that LEAKS into the dish return pays nothing.
import { loadEngine, assert, done, makeEnemy } from "./_engine.mjs";

const E = loadEngine();
const { game } = E;

// ---- A kill pays exactly the loaded bounty (currency AND score) ----
E.reset();
const loaded = E.ENEMY_TYPES.brute.bounty;   // whatever balance.json says today
const cash0 = game.currency, score0 = game.score = 0;
const brute = makeEnemy({ typeId: "brute", hp: 1, bounty: loaded });
game.enemies.push(brute);
E.applyDamage(brute, 5);
assert(game.currency === cash0 + loaded, "a kill pays exactly the loaded bounty (+" + loaded + " Tips)");
assert(game.score === score0 + loaded, "the kill's bounty also scores");
assert(!game.enemies.includes(brute), "the killed dish left the belt");
assert(game.particles.some((p) => p.type === "text" && String(p.text).includes("tip")),
  "a paying kill floats a '+N tip' popup");

// ---- A zero bounty pays nothing and floats no tip popup ----
E.reset();
game.particles = [];
const free = makeEnemy({ hp: 1, bounty: 0 });
game.enemies.push(free);
const cash1 = game.currency;
E.applyDamage(free, 5);
assert(game.currency === cash1, "a zero-bounty kill pays nothing");
assert(!game.particles.some((p) => p.type === "text"), "a zero-bounty kill floats no tip popup");
assert(game.killed > 0, "the zero-bounty kill still counts as a dish eaten");

// ---- A leaked dish pays nothing (it costs a life instead) ----
E.reset();
E.loadMap(E.MAPS[0]);
const leaker = makeEnemy({ hp: 1e6, bounty: 999, dist: 1e9, speed: 0 });  // already past the path end
game.enemies.push(leaker);
const cash2 = game.currency, lives2 = game.lives;
E.moveEnemies(1 / 60);
assert(game.currency === cash2, "a leaked dish pays NO bounty");
assert(game.lives === lives2 - 1, "the leak costs a life instead");
assert(!game.enemies.includes(leaker), "the leaked dish left the belt");

done("bounty");
