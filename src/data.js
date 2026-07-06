/*
  Deckbound — src/data.js
  Constants + the balance-data merge. Loads first (after balance.data.js).

  window.BALANCE (generated from data/balance.json by tools/gen_balance.py)
  carries every gameplay number; this file merges it with the art-only tables
  (colors/glow/radius) into TOWER_TYPES / ENEMY_TYPES and exposes RULES.
  Nothing here touches the DOM. If the balance sim needs a number, it lives in
  data/balance.json — never here.
*/

/* =========================================================================
   1) CONFIG
   ========================================================================= */

// The BOARD coordinate space — the engine, maps, placement bounds, the sim, and
// every gameplay position live here. It is SACRED: never change these numbers.
// tools/sim.mjs runs the engine headless against this exact VIEW, so any drift
// here is a balance drift. The engine's only VIEW use is particle culling at the
// board edge (engine.js) — a board-space bound, not a chrome dependency.
const VIEW = { w: 800, h: 450 };

// Landscape mobile-first chrome (Issue #79). On a phone the whole board scaled
// down, so upgrade buttons were tiny. The fix is a presentation-only VIEWPORT
// TRANSFORM: the DESIGN canvas is wider than the board so the tower deck lives
// in a LEFT RAIL and the upgrade panel slides in as a RIGHT SHEET — chrome OFF
// the board, big touch targets kept. The renderer offsets the 800x450 board
// right by BOARD.x (a single ctx.translate) and input maps the inverse; the
// board's coordinate space is UNCHANGED, so engine/sim/placement never see this.
const DESIGN = { w: 900, h: 450 };              // full canvas (internal drawing buffer)
const RAIL = { w: 100 };                        // left tower-deck rail
const BOARD = { x: DESIGN.w - VIEW.w, y: 0 };   // board offset inside the design canvas (=100,0)
const SHEET = { w: 232 };                       // right slide-in upgrade sheet

const COLOR = {
  bg: "#10131a", grid: "#1b2130",
  core: "#6ea8fe", coreHurt: "#ff6b6b",
  ink: "#e8ecf3", muted: "#8b94a7",
  gold: "#ffe08a", good: "#7dff9b", bad: "#ff6b6b",
  essence: "#c9a6ff",
  slot: "#4a5670", projectile: "#dff5ff", frostAura: "#7fe0ff",
  upgradeSpark: "#ffe08a", panel: "#151a24",
  // Chrome — the shared UI surface palette for cards, controls, chips, and the
  // HUD (used by render.js's card/panel/HUD language). These are the ONE place
  // the coming diner remaster re-points chrome color; keep new chrome values
  // here as named entries, never scattered literals. NOT map surfaces (those
  // live in maps[].theme).
  ctrlBg: "#1b2230",        // card / control fill (idle)
  ctrlSel: "#26324a",       // card / control fill (selected or active-hover)
  ctrlLine: "#2a3242",      // card / control border (idle)
  ctrlLineHi: "#4a5670",    // card / control border (hover / emphasis)
  chip: "#0e1319",          // inset backing for cost chips
  hudBg: "rgba(0,0,0,0.42)",// HUD readout backing
  unitShadow: "rgba(0,0,0,0.33)",   // soft drop-shadow that lifts seated customers off the floor
  // Landscape chrome surfaces (Issue #79) — the LEFT tower rail and the RIGHT
  // slide-in upgrade sheet. Named like the rest of the chrome so the diner
  // remaster re-points them in one place; not map surfaces.
  railBg: "#12161f",        // left tower-rail surface (seated a touch deeper than panel)
  sheetBg: "#0e1420",       // right upgrade-sheet surface (reads as an overlay above the board)
  sheetScrim: "rgba(8,10,15,0.5)",  // soft dim over the board's right edge behind the open sheet
};

/* Difficulty & economy numbers come from data/balance.json, loaded as
   window.BALANCE via the generated balance.data.js (see index.html and
   tools/gen_balance.py). Art (colors/shapes/blurbs), per-tower upgrade deltas,
   and level geometry stay in this file and are merged onto the balance data by
   id below. Rule: if the balance sim needs a number, it lives in balance.json. */
if (!window.BALANCE) {
  throw new Error("balance.data.js failed to load — run `python3 tools/gen_balance.py`");
}
const BAL = window.BALANCE;

const RULES = {
  startCurrency: BAL.economy.startCurrency,
  startLives: BAL.economy.startLives,
  earnPerWave: BAL.economy.earnPerWave,
  // Sell refund: fraction of everything spent on a tower (base + tiers) paid
  // back on sell. 0 disables selling's payout but never blocks the action.
  sellRefund: BAL.economy.sellRefund || 0,
};

// Per-tower ART only (customer glyph color + glow). Each tower is drawn as a
// seated customer keyed by id in drawCustomer(); combat stats + display
// name/blurb come from BAL.towers (data/balance.json).
const TOWER_ART = {
  arrow:  { color: "#6ea8fe", glow: "#3f6bb0" },
  cannon: { color: "#ff9d5c", glow: "#b5561f" },
  frost:  { color: "#7fe0ff", glow: "#2b8fb5" },
  sniper: { color: "#c8a8ff", glow: "#7a4fd0" },
  zap:    { color: "#ffe08a", glow: "#b59a2b" },
};
// Fixed display order for the deck/toolbar.
const TOWER_ORDER = ["arrow", "cannon", "frost", "sniper", "zap"];
const TOWER_TYPES = TOWER_ORDER.map((id) => ({ id, ...BAL.towers[id], ...TOWER_ART[id] }));
const TOWER_BY_ID = Object.fromEntries(TOWER_TYPES.map((t) => [t.id, t]));

// Per-enemy ART (food colors/radius). hpMul/speedMul/bounty AND the display name
// come from BAL.enemyTypes (data/balance.json). Radii are kept as-is because they
// already echo real HP (brute > mote > runner > swarm); each enemy is drawn as
// its dish in drawFood(), and color keeps them distinct at a glance.
const ENEMY_ART = {
  mote:   { color: "#dca85c", edge: "#8a5a22", radius: 12 },  // Hot Dog — golden bun
  runner: { color: "#e3a95c", edge: "#7c4a1e", radius: 9 },   // The Slider — burger (golden bun)
  brute:  { color: "#7c3b2c", edge: "#3e1a12", radius: 17 },  // Tough Steak — dark slab
  swarm:  { color: "#f2ca3c", edge: "#a37e17", radius: 7 },   // Fry Swarm — bright yellow
};
const ENEMY_TYPES = Object.fromEntries(
  Object.entries(BAL.enemyTypes).map(([id, stats]) => [id, { ...ENEMY_ART[id], ...stats }])
);

