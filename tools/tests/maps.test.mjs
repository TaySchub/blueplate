// Map platform (Issue #69): loadMap rebinds per-map geometry, and canPlace /
// pointAtDistance answer for whichever map is active. Behavior only — no tuned
// numbers. We inject a FIXTURE map object (loadMap accepts a raw object, not
// just an id), prove the geometry answers flip to the fixture, then loadMap back
// to the real diner and prove the original answers return.
import { loadEngine, assert, done } from "./_engine.mjs";

const E = loadEngine();

// A deliberately different board: a single horizontal belt high on the map, one
// obstacle covering a spot the diner leaves open, and two anchors low down.
const fixture = {
  id: "__fixture__", name: "Fixture", tuned: false,
  path: [ { x: -30, y: 100 }, { x: 800, y: 100 } ],
  coreRadius: 24,
  placement: { pathBuffer: 40, towerSpacing: 40, bounds: { x0: 0, y0: 0, x1: 800, y1: 400 } },
  obstacles: [ { x: 386, y: 126, w: 48, h: 48, kind: "test" } ],   // covers (410,150)
  simAnchors: [ { x: 100, y: 300 }, { x: 200, y: 300 } ],
};

// Two probe points chosen so each map answers them OPPOSITELY:
//   (410,150) — a diner sim anchor (valid there) that the fixture's obstacle covers.
//   (270,347) — inside the diner's jukebox (invalid there), open floor on the fixture.
const P_ANCHOR = { x: 410, y: 150 };
const P_JUKE = { x: 270, y: 347 };

// ---- fixture active ----
E.loadMap(fixture);
E.game.towers = [];
assert(E.pointAtDistance(0).y === 100, "pointAtDistance(0) follows the fixture's belt (y=100)");
assert(E.canPlace(P_JUKE.x, P_JUKE.y) === true, "open fixture floor is placeable");
assert(E.canPlace(P_ANCHOR.x, P_ANCHOR.y) === false, "a spot under the fixture's obstacle is blocked");

// ---- back to the real diner (by id) ----
E.loadMap("diner");
E.game.towers = [];
assert(E.pointAtDistance(0).y === 70, "pointAtDistance(0) follows the diner's belt again (y=70) — geometry rebound");
assert(E.pointAtDistance(0).y !== 100, "the fixture's geometry no longer answers");
assert(E.canPlace(P_ANCHOR.x, P_ANCHOR.y) === true, "the diner sim anchor is placeable again");
assert(E.canPlace(P_JUKE.x, P_JUKE.y) === false, "the diner's jukebox blocks placement again");

// The default map's own anchors are all placeable in build order on ITS OWN
// empty board — load maps[0] first (it is no longer necessarily the diner).
E.loadMap(E.MAPS[0]); E.game.towers = [];
const a0 = E.MAPS[0].simAnchors[0];
assert(E.canPlace(a0.x, a0.y) === true, "the default map's first sim anchor is placeable on an empty board");

// An unknown id falls back to the default map rather than crashing.
E.loadMap("nope-not-a-map");
assert(E.MAPS[0].path[0].y === E.pointAtDistance(0).y, "an unknown map id falls back to the default map");

done("maps");
