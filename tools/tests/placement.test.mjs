// Free placement (Issue #65): canPlace's four validity rules + tryBuild's
// contract. Every probe point is DERIVED from the loaded config (path /
// placement / obstacles) via a tiny local oracle, never hardcoded — so the map
// can be re-authored or retuned without touching this file. Behavior only, no
// tuned numbers asserted.
import { loadEngine, assert, done } from "./_engine.mjs";

const E = loadEngine();
const BAL = globalThis.window.BALANCE;
const { path, placement, obstacles } = BAL.map;
const { pathBuffer, towerSpacing, bounds } = placement;

/* ---- local oracle (independent of the engine's implementation) ---- */
const distToSeg = (px, py, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
};
const distToPath = (x, y) => Math.min(...path.slice(1).map((p, i) => distToSeg(x, y, path[i], p)));
const inBounds = (x, y) => x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1;
const inObstacle = (x, y) => obstacles.some((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
const open = (x, y) => inBounds(x, y) && !inObstacle(x, y) && distToPath(x, y) > pathBuffer;

// Walk every (segment, ±normal) pair off the segment midpoint and return the
// first pair where BOTH probes qualify: `near` (pathBuffer − 5 off the belt)
// sits in-bounds and outside obstacles so only the belt rule can reject it,
// and `far` (pathBuffer + towerSpacing off) is fully open floor.
function findProbePair() {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    for (const s of [1, -1]) {
      const nx = (-(b.y - a.y) / len) * s, ny = ((b.x - a.x) / len) * s;
      const near = { x: mx + nx * (pathBuffer - 5), y: my + ny * (pathBuffer - 5) };
      const far = { x: mx + nx * (pathBuffer + towerSpacing), y: my + ny * (pathBuffer + towerSpacing) };
      if (inBounds(near.x, near.y) && !inObstacle(near.x, near.y) && open(far.x, far.y)) return { near, far };
    }
  }
  throw new Error("no probe pair found — map too crowded for the oracle?");
}
const { near, far } = findProbePair();

E.game.towers = [];

/* ---- canPlace: the four rules ---- */
assert(!E.canPlace(near.x, near.y), `pathBuffer − 5 off a belt segment midpoint is invalid (${near.x},${near.y})`);
assert(E.canPlace(far.x, far.y), `pathBuffer + towerSpacing off the same segment is valid open floor (${far.x},${far.y})`);
for (const o of obstacles) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  assert(!E.canPlace(cx, cy), `inside the ${o.kind} rect is invalid (${cx},${cy})`);
}
const midX = (bounds.x0 + bounds.x1) / 2, midY = (bounds.y0 + bounds.y1) / 2;
assert(!E.canPlace(bounds.x0 - 5, midY), "left of bounds is invalid");
assert(!E.canPlace(bounds.x1 + 5, midY), "right of bounds is invalid");
assert(!E.canPlace(midX, bounds.y0 - 5), "above bounds is invalid");
assert(!E.canPlace(midX, bounds.y1 + 5), "below bounds is invalid");

/* ---- tryBuild contract ---- */
E.reset();
E.game.towers = [];
E.game.selectedType = "arrow";
const cost = E.TOWER_BY_ID.arrow.cost;
let cur = E.game.currency;
E.tryBuild(far.x, far.y);
assert(E.game.towers.length === 1, "tryBuild on open floor seats the customer");
assert(E.game.towers[0].x === far.x && E.game.towers[0].y === far.y, "tower sits at exactly the clicked (x,y)");
assert(cur - E.game.currency === cost, "build charges exactly the tower's cost");
assert(!("slotIndex" in E.game.towers[0]), "towers carry no slotIndex field anymore");

// Spacing rule needs a seated tower: probe just inside towerSpacing of it, in a
// direction the oracle confirms is otherwise-open (so only spacing rejects it).
const spacingProbe = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  .map(([dx, dy]) => ({ x: far.x + dx * (towerSpacing - 5), y: far.y + dy * (towerSpacing - 5) }))
  .find((p) => open(p.x, p.y));
assert(!!spacingProbe, "oracle found an otherwise-open point within towerSpacing of the built tower");
if (spacingProbe) {
  assert(!E.canPlace(spacingProbe.x, spacingProbe.y), "within towerSpacing of a seated customer is invalid");
}

// Invalid tryBuild (inside an obstacle, and hugging the belt): no state change.
cur = E.game.currency;
const towersBefore = E.game.towers.length;
const o0 = obstacles[0];
E.tryBuild(o0.x + o0.w / 2, o0.y + o0.h / 2);
E.tryBuild(near.x, near.y);
assert(E.game.towers.length === towersBefore, "invalid tryBuild seats nothing");
assert(E.game.currency === cur, "invalid tryBuild charges nothing");

done("placement");
