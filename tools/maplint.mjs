#!/usr/bin/env node
/*
  Deckbound map lint — validates EVERY map in data/balance.json against the
  placement rules using the REAL engine (loadMap + canPlace), so authoring a new
  map can't ship a board the sim or the player can't actually build on. This is
  what makes future maps cheap: write JSON, run this, trust the green.

  It loads the DOM-free half of the game (src/data.js + src/engine.js) headless —
  the same trick as tools/sim.mjs — and for each map checks:
    - the path polyline is sane (>= 2 finite points, non-degenerate length);
    - placement.bounds is well-ordered;
    - every obstacle sits inside bounds and keeps its edges >= 24px from every
      sim anchor (booth pads must not collide with props);
    - every sim anchor is placeable IN ORDER via the real canPlace on an empty
      board (exactly what the sim + harness do) — which subsumes the bounds /
      pathBuffer / spacing / obstacle-overlap rules for the anchors.

  Errors name the map id and the failing rule. Exit non-zero on any problem
  (CI runs this on every PR). Usage:  node tools/maplint.mjs
*/
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = { BALANCE: JSON.parse(readFileSync(join(ROOT, "data", "balance.json"), "utf8")) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const bundle =
  ["src/data.js", "src/engine.js"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n;\n") +
  // PATH_LENGTH is a `let` that loadMap reassigns, so export a getter (a plain
  // export would freeze the boot value).
  `\n;globalThis.LINT = { game, loadMap, MAPS, canPlace, pathLength: () => PATH_LENGTH };`;
vm.runInThisContext(bundle, { filename: "deckbound-maplint-bundle.js" });
const E = globalThis.LINT;

const ANCHOR_CLEARANCE = 24;   // obstacle edges must stay this far from every sim anchor (the booth pads)

let errors = 0;
const fail = (mapId, msg) => { console.error(`  ✗ [${mapId}] ${msg}`); errors++; };

// Point → axis-aligned rect shortest distance; 0 if the point is inside.
function distToRect(px, py, o) {
  const dx = Math.max(o.x - px, 0, px - (o.x + o.w));
  const dy = Math.max(o.y - py, 0, py - (o.y + o.h));
  return Math.hypot(dx, dy);
}

for (const m of E.MAPS) {
  console.log(`map: ${m.name} (${m.id})${m.tuned ? "" : "  [untuned]"}`);
  E.loadMap(m);
  const b = m.placement.bounds;

  // 1) Path sanity.
  if (!Array.isArray(m.path) || m.path.length < 2) fail(m.id, "path needs >= 2 points");
  for (const p of m.path) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(m.id, `non-finite path point ${JSON.stringify(p)}`);
  if (!(E.pathLength() > 0)) fail(m.id, "path polyline is degenerate (zero total length)");

  // 2) Bounds well-ordered.
  if (!(b.x0 < b.x1 && b.y0 < b.y1)) fail(m.id, `bounds not well-ordered ${JSON.stringify(b)}`);

  // 3) Obstacles inside bounds and clear of every anchor.
  for (const o of m.obstacles) {
    if (o.x < b.x0 || o.y < b.y0 || o.x + o.w > b.x1 || o.y + o.h > b.y1)
      fail(m.id, `obstacle ${o.kind} [${o.x},${o.y} ${o.w}x${o.h}] escapes bounds`);
    for (const a of m.simAnchors) {
      const d = distToRect(a.x, a.y, o);
      if (d < ANCHOR_CLEARANCE) fail(m.id, `obstacle ${o.kind} only ${d.toFixed(1)}px from anchor (${a.x},${a.y}) (< ${ANCHOR_CLEARANCE})`);
    }
  }

  // 4) THE key check: every sim anchor placeable IN ORDER via the real canPlace
  //    on an empty board — exactly the sequence the sim + harness build.
  E.game.towers = [];
  m.simAnchors.forEach((a, i) => {
    if (E.canPlace(a.x, a.y)) E.game.towers.push({ x: a.x, y: a.y });
    else fail(m.id, `sim anchor ${i} (${a.x},${a.y}) not placeable in build order (bounds / belt / spacing / obstacle)`);
  });
}

console.log(errors ? `\nMAPLINT FAILED: ${errors} problem(s)` : `\nMAPLINT OK: ${E.MAPS.length} map(s) valid`);
process.exit(errors ? 1 : 0);
