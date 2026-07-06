/*
  Deckbound — src/render.js
  The render pass + all UI: screens, HUD, toolbar, panels, buttons, and the
  in-run scene (belt, kitchen, chute, enemies, towers, particles). Reads game
  state and calls art.js draw functions; never mutates gameplay state.
  Panel/button geometry lives here and is shared with input hit-testing.
*/

/* =========================================================================
   LANDSCAPE LAYOUT (Issue #79) — the presentation-layer viewport transform.

   The board scene draws inside a single ctx.translate(BOARD.x, 0), so every
   constant below in VIEW (board) coords lands shifted right by the rail, and the
   engine/sim never see it. Chrome that lives OFF the board — the left tower RAIL,
   the right upgrade SHEET, the hub, and the mute/pause toggles — is positioned in
   DESIGN coords (the full 900x450 canvas) and drawn outside the translate.
   ========================================================================= */

// Board-space chrome (drawn INSIDE the board translate; hit-tested with boardPtr).
const LOWER_Y = 384;   // board y where the control apron begins — just below the playfield (placement bounds y1=382)
const START_BTN = { x: 466, y: 388, w: 214, h: 56 };   // "Send/Call Wave", seated in the apron — sized ≥44 CSS at phone scale

// Design-space chrome (drawn OUTSIDE the translate; hit-tested with game.pointer).
// Sizes are tuned so EVERY interactive rect clears 44 CSS px at ~844x390 phone
// scale (canvas ~756 CSS wide, scale ~0.84 -> a rect needs >=53 design px in its
// smaller dimension).
const RAIL_CARD = { w: RAIL.w - 16, h: 58, gap: 6 };   // vertical tower-deck cards filling the left rail
const RAIL_TOP = 128;                                  // rail card zone start (below the stacked pause/mute)
const SHEET_X = DESIGN.w - SHEET.w;                    // left edge of the slide-in upgrade sheet
const CONTINUE_BTN = { x: DESIGN.w / 2 - 100, y: DESIGN.h / 2 + 40, w: 200, h: 54 };   // run-summary → hub
const PLAY_BTN = { x: DESIGN.w / 2 - 110, y: 388, w: 220, h: 56 };
// Hub "Continue — Wave N": resume the saved run, shown above Open for Service
// only when a checkpoint exists (Issue #83). 56px tall so it clears 44 CSS px at
// ~844x390 phone scale (canvas ~756 CSS, scale ~0.84 -> 56*0.84 = 47 CSS).
const RESUME_RUN_BTN = { x: DESIGN.w / 2 - 130, y: 298, w: 260, h: 56 };
const MAP_BTN = { x: 24, y: 390, w: 196, h: 54 };   // hub map picker, bottom-left (shown only with 2+ maps)

// game.pointer is DESIGN coords (main.js maps client->design). Board hovers and
// board hit-tests apply the inverse of the board translate through this.
function boardPtr() { return { x: game.pointer.x - BOARD.x, y: game.pointer.y - BOARD.y }; }

// One tower card in the left rail — stacked below the mute/pause row and centered
// in the remaining height so 4 or 5 unlocked towers both sit tidily. Single
// source shared by draw + hit-testing.
function railCardRect(i, n) {
  const zoneH = DESIGN.h - RAIL_TOP - 6;
  const totalH = n * RAIL_CARD.h + (n - 1) * RAIL_CARD.gap;
  const y0 = RAIL_TOP + Math.max(0, (zoneH - totalH) / 2);
  return { x: 8, y: y0 + i * (RAIL_CARD.h + RAIL_CARD.gap), w: RAIL_CARD.w, h: RAIL_CARD.h };
}
// Mute + pause live in the rail top during a run; the menu keeps mute at the
// canvas top-right (there's no rail on the hub). Rects shared by draw + input.
function muteBtnRect() {
  return game.phase === "menu"
    ? { x: DESIGN.w - 66, y: 10, w: 54, h: 54 }
    : { x: 8, y: 68, w: RAIL.w - 16, h: 54 };   // stacked under pause in the rail
}
function pauseBtnRect() { return { x: 8, y: 8, w: RAIL.w - 16, h: 54 }; }
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

// A cost pill: an inset chip with the Tips coin + amount. Gold when affordable,
// red when not — the one shared way costs read across the toolbar, the hub deck,
// and the tower panel. `anchor` places the pill relative to (ax, midY):
// "center" (default), "right" (ax = right edge), or "left" (ax = left edge).
// Returns the pill width.
function drawCostChip(ctx, ax, midY, cost, affordable, h = 15, anchor = "center") {
  const label = "" + cost;
  ctx.font = "bold " + (h - 5) + "px system-ui, sans-serif";
  const coinR = h * 0.3;
  const w = 8 + coinR * 2 + 3 + ctx.measureText(label).width + 7;
  const x = anchor === "right" ? ax - w : anchor === "left" ? ax : ax - w / 2;
  const y = midY - h / 2;
  const col = affordable ? COLOR.gold : COLOR.bad;
  ctx.fillStyle = COLOR.chip; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  drawCurrencyIcon(ctx, x + 7 + coinR, midY, col, coinR);
  ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + 7 + coinR * 2 + 3, midY + 0.5);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  return w;
}

/* =========================================================================
   10) RENDER
   ========================================================================= */

function render() {
  const ctx = game.ctx;
  // Design canvas backdrop (fills the rail + any letterbox margins).
  ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, DESIGN.w, DESIGN.h);
  if (game.phase === "menu") { drawMenu(ctx); drawMuteButton(ctx); return; }

  // --- Board space: everything the engine positions lives here, drawn shifted
  // right by the rail via one translate. Board-space chrome (HUD, apron, Start,
  // selection ring) rides along so it stays aligned with the board + particles.
  ctx.save();
  ctx.translate(BOARD.x, BOARD.y);
  const shaking = game.shake > 0.05;
  if (shaking) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground(ctx);
  drawWallFrame(ctx);
  drawEntrance(ctx);
  drawPath(ctx);
  drawKitchenDoor(ctx);
  drawObstacles(ctx);
  drawTowerRanges(ctx);
  drawCore(ctx);
  drawEnemies(ctx);
  drawProjectiles(ctx);
  drawSlurpStraws(ctx);
  drawTowers(ctx);
  drawParticles(ctx);
  drawPlacementGhost(ctx);
  if (shaking) ctx.restore();
  // Paused: dim the play area (the apron + rail + sheet stay bright — you can
  // still seat/upgrade).
  if (typeof gamePaused !== "undefined" && gamePaused) drawPausedOverlay(ctx);
  drawApron(ctx);
  drawStartButton(ctx);
  drawHUD(ctx);
  drawSelectionRing(ctx);
  drawMessage(ctx);
  ctx.restore();

  // --- Design space: chrome off the board.
  drawRail(ctx);
  drawTowerSheet(ctx);
  drawMuteButton(ctx);
  drawPauseButton(ctx);
  if (game.phase === "lost") drawSummary(ctx);
}

/* ---- Hub / menu screen ---- */

const HUB_SHOP_X = 640;                       // shop column (right side of the widened hub)
function shopButtonRects() {
  const out = [];
  const x = HUB_SHOP_X, w = DESIGN.w - HUB_SHOP_X - 24, h = 54, gap = 12;
  let y = 152;
  for (const item of SHOP) { out.push({ item, rect: { x, y, w, h } }); y += h + gap; }
  return out;
}

// A regular's collection card on the hub — roomier than the rail card, showing
// the role blurb, and tappable to expand its upgrade-path details. `hubOpen`
// holds the expanded tower id (set by input's toggleHubCard). Geometry shared
// by draw + hit-testing.
let hubOpen = null;
function toggleHubCard(id) { hubOpen = hubOpen === id ? null : id; }
function hubCardRect(i) { return { x: 40 + i * 104, y: 146, w: 94, h: 132 }; }
function hubSlotCount() { return deckTypes().length + (META.unlocked.includes("sniper") ? 0 : 1); }

function drawHubCard(ctx, r, def, expanded) {
  const hover = inRect(game.pointer, r);
  ctx.fillStyle = expanded ? COLOR.ctrlSel : COLOR.ctrlBg;
  roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
  ctx.lineWidth = expanded ? 2 : 1;
  ctx.strokeStyle = expanded ? def.color : (hover ? COLOR.ctrlLineHi : COLOR.ctrlLine);
  roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
  if (expanded) { ctx.fillStyle = def.color; roundRect(ctx, r.x + 5, r.y + 3, r.w - 10, 3, 1.5); ctx.fill(); }
  const cx = r.x + r.w / 2;
  drawSoftShadow(ctx, cx, r.y + 42, 21, 6, COLOR.unitShadow);
  drawCustomer(ctx, def.id, cx, r.y + 34, 21, def.color);
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(fitText(ctx, def.name.replace(/^The /, ""), r.w - 8), cx, r.y + 74);
  // Role blurb — the "more fun" bit: what this customer does, visible on the card.
  ctx.fillStyle = COLOR.muted; ctx.font = "8.5px system-ui, sans-serif";
  const lines = wrapLabel(ctx, def.blurb, r.w - 12, 3);
  let by = r.y + 88;
  for (const ln of lines) { ctx.fillText(ln, cx, by); by += 10; }
  drawCostChip(ctx, cx, r.y + r.h - 11, def.cost, true, 13);
  ctx.textAlign = "left";
}

// The expanded details view under the cards: the tapped regular's two upgrade
// paths (names live in balance.json) so you can plan a build before Opening.
function drawHubDetails(ctx, def) {
  const x = 40, y = 288, w = 560, h = 66;
  ctx.fillStyle = COLOR.panel; roundRect(ctx, x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = def.color; ctx.lineWidth = 1.5; roundRect(ctx, x, y, w, h, 10); ctx.stroke();
  drawSoftShadow(ctx, x + 30, y + 34, 17, 5, COLOR.unitShadow);
  drawCustomer(ctx, def.id, x + 30, y + 28, 17, def.color);
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(def.name, x + 58, y + 22);
  ctx.fillStyle = COLOR.muted; ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(fitText(ctx, def.blurb, w - 70), x + 58, y + 38);
  ctx.fillStyle = COLOR.gold; ctx.font = "9px system-ui, sans-serif";
  ctx.fillText("UPGRADE PATHS", x + 58, y + 54);
  const paths = towerPaths(def.id);
  const pw = (w - 58 - 24) / 2;
  paths.forEach((pp, i) => {
    const px = x + 200 + i * (pw + 12), py = y + 44;
    ctx.fillStyle = COLOR.ctrlBg; roundRect(ctx, px, py, pw, 16, 5); ctx.fill();
    ctx.strokeStyle = COLOR.ctrlLine; ctx.lineWidth = 1; roundRect(ctx, px, py, pw, 16, 5); ctx.stroke();
    ctx.fillStyle = COLOR.ink; ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(fitText(ctx, pp.name, pw - 8), px + pw / 2, py + 9);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  });
}

function drawMenu(ctx) {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, DESIGN.w, DESIGN.h);
  ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
  const gap = 50;
  ctx.beginPath();
  for (let x = gap; x < DESIGN.w; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, DESIGN.h); }
  for (let y = gap; y < DESIGN.h; y += gap) { ctx.moveTo(0, y); ctx.lineTo(DESIGN.w, y); }
  ctx.stroke();

  // Title.
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 32px system-ui, sans-serif";
  ctx.fillText("Deckbound", 40, 54);
  ctx.fillStyle = COLOR.muted;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Seat the customers. Eat the food. Don't let dinner get away.", 42, 78);

  // Golden Forks (meta currency) + best-wave record (survival is the score now).
  ctx.fillStyle = COLOR.essence;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText("✦ Golden Forks: " + META.essence, 42, 110);
  if (META.bestWave > 0) {
    ctx.fillStyle = COLOR.muted; ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Best run:  Wave " + META.bestWave, 250, 109);
  }

  // Your regulars — roomier, tappable cards (tap to expand upgrade-path details).
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("Your regulars", 42, 134);
  ctx.fillStyle = COLOR.muted; ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("tap a customer to see their upgrade paths", 158, 134);
  const deck = deckTypes();
  for (let i = 0; i < deck.length; i++) drawHubCard(ctx, hubCardRect(i), deck[i], hubOpen === deck[i].id);
  // Locked slot hint if Sniper not yet unlocked — same card frame, a vector padlock.
  if (!META.unlocked.includes("sniper")) {
    const r = hubCardRect(deck.length);
    ctx.fillStyle = COLOR.chip; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
    ctx.strokeStyle = COLOR.ctrlLine; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke(); ctx.setLineDash([]);
    drawLockIcon(ctx, r.x + r.w / 2, r.y + r.h / 2 - 6, 11, COLOR.muted);
    ctx.fillStyle = COLOR.muted; ctx.textAlign = "center"; ctx.font = "10px system-ui, sans-serif"; ctx.textBaseline = "alphabetic";
    ctx.fillText("locked", r.x + r.w / 2, r.y + r.h / 2 + 26);
    ctx.textAlign = "left";
  }
  // Expanded details for the tapped regular (still unlocked/owned).
  if (hubOpen && deck.some((d) => d.id === hubOpen)) drawHubDetails(ctx, TOWER_BY_ID[hubOpen]);

  // Shop (right column).
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 14px system-ui, sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Golden Forks shop", HUB_SHOP_X, 134);
  for (const b of shopButtonRects()) {
    const owned = b.item.owned();
    const affordable = META.essence >= b.item.cost;
    const hover = inRect(game.pointer, b.rect);
    ctx.fillStyle = owned ? "#1a241b" : (hover && affordable ? COLOR.ctrlSel : COLOR.ctrlBg);
    roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.fill();
    ctx.strokeStyle = owned ? COLOR.good : (affordable ? COLOR.ctrlLineHi : COLOR.ctrlLine);
    ctx.lineWidth = 1; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.stroke();
    ctx.fillStyle = COLOR.ink; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const lines = wrapLabel(ctx, b.item.label, b.rect.w - 24, 2);
    let ly = b.rect.y + (lines.length === 1 ? 24 : 19);
    for (const ln of lines) { ctx.fillText(ln, b.rect.x + 12, ly); ly += 14; }
    ctx.textAlign = "right";
    if (owned) { ctx.fillStyle = COLOR.good; ctx.fillText("owned ✓", b.rect.x + b.rect.w - 12, b.rect.y + b.rect.h - 10); }
    else { ctx.fillStyle = affordable ? COLOR.essence : COLOR.bad; ctx.fillText("✦ " + b.item.cost, b.rect.x + b.rect.w - 12, b.rect.y + b.rect.h - 10); }
    ctx.textAlign = "left";
  }

  // Map picker — shown ONLY when more than one map is pickable (non-retired).
  // With the Classic diner retired there's a single map, so the row is hidden
  // (PLAY_BTN keeps its fixed spot); the picker returns automatically when Map 2
  // ships. Click cycles maps; the label shows the active map's name.
  if (pickableMaps().length > 1) {
    const mapHover = inRect(game.pointer, MAP_BTN);
    ctx.fillStyle = mapHover ? COLOR.ctrlSel : COLOR.ctrlBg;
    roundRect(ctx, MAP_BTN.x, MAP_BTN.y, MAP_BTN.w, MAP_BTN.h, 8); ctx.fill();
    ctx.strokeStyle = COLOR.ctrlLineHi; ctx.lineWidth = 1;
    roundRect(ctx, MAP_BTN.x, MAP_BTN.y, MAP_BTN.w, MAP_BTN.h, 8); ctx.stroke();
    ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Map:  " + MAP.name, MAP_BTN.x + MAP_BTN.w / 2, MAP_BTN.y + MAP_BTN.h / 2);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  }

  // Continue — resume the saved run at its wave start (Issue #83). Shown above
  // "Open for Service" only when a checkpoint exists; the saved map's name rides
  // the label so it's clear which run you're resuming.
  const save = hasSave();
  if (save) {
    const cHover = inRect(game.pointer, RESUME_RUN_BTN);
    ctx.fillStyle = cHover ? COLOR.good : "#1f6b3f";
    roundRect(ctx, RESUME_RUN_BTN.x, RESUME_RUN_BTN.y, RESUME_RUN_BTN.w, RESUME_RUN_BTN.h, 10); ctx.fill();
    const mapName = (MAPS.find((m) => m.id === save.mapId) || {}).name || "";
    ctx.fillStyle = COLOR.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillText("▶  Continue — Wave " + (save.waveIndex + 1), DESIGN.w / 2, RESUME_RUN_BTN.y + RESUME_RUN_BTN.h / 2 - 8);
    ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "rgba(235,240,245,0.75)";
    ctx.fillText(mapName, DESIGN.w / 2, RESUME_RUN_BTN.y + RESUME_RUN_BTN.h / 2 + 10);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  }

  // Play button.
  const hover = inRect(game.pointer, PLAY_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66";
  roundRect(ctx, PLAY_BTN.x, PLAY_BTN.y, PLAY_BTN.w, PLAY_BTN.h, 10); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("▶  Open for Service", DESIGN.w / 2, PLAY_BTN.y + PLAY_BTN.h / 2);
  // When a save exists, make it explicit that starting fresh drops it.
  if (save) {
    ctx.textBaseline = "alphabetic"; ctx.font = "10px system-ui, sans-serif"; ctx.fillStyle = COLOR.muted;
    ctx.fillText("(discards your saved run)", DESIGN.w / 2, PLAY_BTN.y - 6);
  }
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

/* ---- In-run drawing ---- */

function drawBackground(ctx) {
  // Floor surface from the active map's theme (THEME, bound by engine loadMap):
  // a low-contrast checkerboard so the belt, customers, and food stay the things
  // that pop.
  const fl = THEME.floor;
  ctx.fillStyle = fl.bg; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  const tile = fl.tileSize;
  ctx.fillStyle = fl.tile;
  for (let gy = 0; gy < VIEW.h; gy += tile)
    for (let gx = 0; gx < VIEW.w; gx += tile)
      if (((gx / tile) + (gy / tile)) & 1) ctx.fillRect(gx, gy, tile, tile);
  // A booth/table pad under each PLACED tower — the table appears when the
  // customer sits down (free placement has no fixed seats to pre-draw).
  const pad = THEME.boothPad;
  for (const t of game.towers) {
    ctx.fillStyle = pad.fill; roundRect(ctx, t.x - 21, t.y - 15, 42, 30, 7); ctx.fill();
    ctx.strokeStyle = pad.stroke; ctx.lineWidth = 1.5; roundRect(ctx, t.x - 21, t.y - 15, 42, 30, 7); ctx.stroke();
  }
}

// The conveyor belt the food rides from the kitchen to the trash chute. Metal
// rails + a belt surface, with slats that animate toward the chute (the
// fixed-timestep loop drives the offset off game.elapsed).
function drawPath(ctx) {
  const b = THEME.belt;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const trace = () => { ctx.beginPath(); ctx.moveTo(PATH[0].x, PATH[0].y); for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y); };
  ctx.strokeStyle = b.shadow; ctx.lineWidth = b.shadowWidth; trace(); ctx.stroke();  // rail shadow
  ctx.strokeStyle = b.metal; ctx.lineWidth = b.metalWidth; trace(); ctx.stroke();  // rail metal
  ctx.strokeStyle = b.surface; ctx.lineWidth = b.surfaceWidth; trace(); ctx.stroke();  // belt surface
  // Moving slats across the belt, marching toward the chute.
  const spacing = b.slatSpacing, half = b.slatHalf;
  const offset = (game.elapsed * b.slatSpeed) % spacing;
  ctx.strokeStyle = b.slat; ctx.lineWidth = b.slatWidth; ctx.lineCap = "butt";
  let acc = 0;
  for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
    const A = PATH[i], B = PATH[i + 1], len = SEGMENT_LENGTHS[i];
    if (len === 0) continue;
    const dx = (B.x - A.x) / len, dy = (B.y - A.y) / len, px = -dy, py = dx;
    const k0 = Math.ceil((acc - offset) / spacing);
    for (let s = offset + k0 * spacing; s < acc + len; s += spacing) {
      const d = s - acc, cx = A.x + dx * d, cy = A.y + dy * d;
      ctx.beginPath(); ctx.moveTo(cx - px * half, cy - py * half); ctx.lineTo(cx + px * half, cy + py * half); ctx.stroke();
    }
    acc += len;
  }
  ctx.lineCap = "round";
  // Direction chevrons (new theme option; off for the diner) — arrows along the
  // belt pointing the way the dishes travel, one or two per long segment.
  if (b.chevrons) {
    ctx.fillStyle = b.chevrons; ctx.globalAlpha = 0.5;
    const cw = 6, ahead = 8, back = 3;
    for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
      const A = PATH[i], B = PATH[i + 1], len = SEGMENT_LENGTHS[i];
      if (len < 70) continue;
      const dx = (B.x - A.x) / len, dy = (B.y - A.y) / len, px = -dy, py = dx;
      for (let s = 55; s < len - 40; s += 150) {
        const cx = A.x + dx * s, cy = A.y + dy * s;
        ctx.beginPath();
        ctx.moveTo(cx + dx * ahead, cy + dy * ahead);
        ctx.lineTo(cx - dx * back + px * cw, cy - dy * back + py * cw);
        ctx.lineTo(cx - dx * back - px * cw, cy - dy * back - py * cw);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// A themed teal wall frame drawn INSIDE the bounds margin (costs no floor) and
// the right-wall entrance dressing — both off for the diner (no THEME.wallFrame /
// THEME.entrance), so the diner renders exactly as before.
function drawWallFrame(ctx) {
  const wf = THEME.wallFrame;
  if (!wf) return;
  const m = 8, t = wf.thickness || 6;
  ctx.strokeStyle = wf.color; ctx.lineWidth = t; ctx.lineJoin = "round";
  roundRect(ctx, m + t / 2, m + t / 2, VIEW.w - 2 * m - t, (LOWER_Y - 3) - 2 * m - t, 16);
  ctx.stroke();
}

function drawEntrance(ctx) {
  const en = THEME.entrance;
  if (!en) return;
  const cx = VIEW.w - 22;   // right dressing band, just past the belt's right rail
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // OPEN sign near the top-right corner.
  ctx.fillStyle = en.sign; ctx.strokeStyle = "#20262f"; ctx.lineWidth = 1.4;
  roundRect(ctx, cx - 17, 60, 34, 16, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 8px system-ui, sans-serif";
  ctx.fillText("OPEN", cx, 69);
  // Two door-glass window panes below.
  for (const wy of [104, 168]) {
    ctx.fillStyle = en.glass; ctx.strokeStyle = en.frame; ctx.lineWidth = 2;
    roundRect(ctx, cx - 15, wy, 30, 46, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, wy + 3); ctx.lineTo(cx, wy + 43); ctx.moveTo(cx - 13, wy + 23); ctx.lineTo(cx + 13, wy + 23); ctx.stroke();
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

// The kitchen the dishes escape from — a doorway with swinging half-doors at the
// belt's spawn (left edge); the belt emerges from its dark mouth.
function drawKitchenDoor(ctx) {
  const k = THEME.kitchen;
  if (!k) return;   // maps without a themed swing-door (e.g. Blue-Plate) draw their kitchen as an obstacle structure
  const y = PATH[0].y, doorW = 40, gap = 18;
  const top = y - 40, bot = y + 40;
  ctx.fillStyle = k.interior; ctx.fillRect(0, top, doorW, bot - top);          // dark interior
  ctx.fillStyle = k.door; ctx.strokeStyle = k.doorEdge; ctx.lineWidth = 1;      // swinging half-doors
  ctx.fillRect(2, top + 2, doorW - 4, (y - gap) - (top + 2)); ctx.strokeRect(2, top + 2, doorW - 4, (y - gap) - (top + 2));
  ctx.fillRect(2, y + gap, doorW - 4, (bot - 2) - (y + gap)); ctx.strokeRect(2, y + gap, doorW - 4, (bot - 2) - (y + gap));
  ctx.strokeStyle = k.frame; ctx.lineWidth = 3;                                // door frame (right jamb + lintel + sill)
  ctx.beginPath(); ctx.moveTo(doorW, top); ctx.lineTo(doorW, bot); ctx.moveTo(0, top); ctx.lineTo(doorW, top); ctx.moveTo(0, bot); ctx.lineTo(doorW, bot); ctx.stroke();
  ctx.fillStyle = COLOR.muted; ctx.font = "bold 8px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(k.label, doorW / 2, bot + 8);
  ctx.textBaseline = "alphabetic";
}

// Set dressing from the active map's OBSTACLES (bound by engine loadMap), drawn
// between the belt and the units. Placement blockers ONLY — there is no
// line-of-sight in this game, so props never affect shots or enemies. Per-kind
// vector art lives in art.js.
function drawObstacles(ctx) {
  for (const o of OBSTACLES) drawObstacle(ctx, o, THEME.props);
}

// The free-placement ghost (replaced the fixed-slot markers): follows the
// pointer whenever a run is live and shows the selected customer's RANGE ring
// before you buy — green = canPlace + affordable, red = blocked or too
// expensive. Hidden over the toolbar (bounds end above it), the selected-tower
// panel, and existing towers (hovering those means select, not build).
function drawPlacementGhost(ctx) {
  if (game.phase !== "prep" && game.phase !== "wave") return;
  const p = boardPtr(), b = PLACEMENT.bounds;
  if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) return;
  // Hide the ghost while the pointer is over the open upgrade sheet (design space).
  if (game.selectedTower && game.pointer.x >= SHEET_X) return;
  for (const t of game.towers) if (distance(p, t) <= 18) return;
  const def = TOWER_BY_ID[game.selectedType];
  const buildable = canPlace(p.x, p.y) && game.currency >= def.cost;
  const col = buildable ? COLOR.good : COLOR.bad;
  ctx.save();
  // Range preview — the point of the ghost: see reach before spending.
  ctx.globalAlpha = 0.07; ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(p.x, p.y, def.range, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.45; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, def.range, 0, Math.PI * 2); ctx.stroke();
  // Body ghost at the seat itself.
  ctx.globalAlpha = 0.9; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1; ctx.fillStyle = col;
  ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(def.name + " " + def.cost, p.x, p.y - 22);
  ctx.restore();
}

function drawTowerRanges(ctx) {
  const ptr = boardPtr();
  for (const t of game.towers) {
    const hover = distance(ptr, t) <= t.range;
    const col = TOWER_BY_ID[t.typeId].color;
    if (hover) {   // a faint fill so the hovered customer's reach reads at a glance
      ctx.globalAlpha = 0.06; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = col; ctx.globalAlpha = hover ? 0.35 : 0.05; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// The trash chute (the core): a bin any dish reaching it clatters into. The
// pulsing danger halo + the hurt flash on a leak are kept.
function drawCore(ctx) {
  if (THEME.coreStyle === "dishReturn") { drawDishReturn(ctx); return; }   // Blue-Plate: a return slot, not a chute
  const c = THEME.chute;
  const hurt = game.coreHurtFlash > 0;
  const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 2);
  const col = hurt ? COLOR.coreHurt : COLOR.core;   // halo/outline = the danger signal (shared palette)
  const x = CORE.x, y = CORE.y, R = CORE.radius;
  // Danger halo.
  ctx.strokeStyle = col; ctx.globalAlpha = 0.15 + 0.25 * pulse; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, R + 8 + pulse * 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  // Bin body (a trapezoid, wider at the top).
  const topW = R * 1.6, botW = R * 1.15, topY = y - R * 0.5, botY = y + R * 1.05;
  ctx.fillStyle = hurt ? c.bodyHurt : c.body;
  ctx.beginPath(); ctx.moveTo(x - topW / 2, topY); ctx.lineTo(x + topW / 2, topY); ctx.lineTo(x + botW / 2, botY); ctx.lineTo(x - botW / 2, botY); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  // Vertical ridges.
  ctx.strokeStyle = c.ridge; ctx.lineWidth = 1.5;
  for (const f of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(x + f * topW, topY + 3); ctx.lineTo(x + f * botW, botY - 3); ctx.stroke(); }
  // Lid + handle.
  const lidW = topW * 1.14, lidH = R * 0.32, lidY = topY - R * 0.34;
  ctx.fillStyle = hurt ? COLOR.coreHurt : c.lid;
  roundRect(ctx, x - lidW / 2, lidY, lidW, lidH, 3); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; roundRect(ctx, x - lidW / 2, lidY, lidW, lidH, 3); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(x - R * 0.12, lidY - R * 0.2, R * 0.24, R * 0.22);
  // Label.
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(c.label, x, botY + 15);
}

// coreStyle "dishReturn" (Blue-Plate): the core is a slot in the kitchen wall
// where escaped dishes vanish, with the "← DISH RETURN" placard. Same pulsing
// danger halo + hurt flash as the chute.
function drawDishReturn(ctx) {
  const dr = THEME.dishReturn || {};
  const hurt = game.coreHurtFlash > 0;
  const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 2);
  const accent = dr.accent || "#2FB4A6";
  const col = hurt ? COLOR.coreHurt : accent;
  const x = CORE.x, y = CORE.y, R = CORE.radius;
  // Danger halo.
  ctx.strokeStyle = col; ctx.globalAlpha = 0.15 + 0.3 * pulse; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, R + 7 + pulse * 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  // The return opening (a dark slot the dishes disappear into).
  const sw = 46, sh = 34;
  ctx.fillStyle = hurt ? "#3a1414" : (dr.slot || "#2a323d"); ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, x - sw / 2, y - sh / 2, sw, sh, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.55)"; roundRect(ctx, x - sw / 2 + 4, y - sh / 2 + 4, sw - 8, sh - 8, 3); ctx.fill();
  ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.4;   // a returned-plate hint
  ctx.beginPath(); ctx.arc(x + 3, y, 6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  // "← DISH RETURN" placard along the middle lane (on a dark tab).
  const lw = 132, ly = y - sh / 2 - 21;
  ctx.fillStyle = dr.labelBg || "#20262f"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.2;
  roundRect(ctx, x - sw / 2, ly, lw, 18, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent; ctx.font = "bold 10px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("← " + (dr.label || "DISH RETURN"), x - sw / 2 + 9, ly + 10);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function drawEnemies(ctx) {
  for (const e of game.enemies) {
    const et = ENEMY_TYPES[e.typeId];
    if (e.slowTimer > 0 && e.freezeTimer <= 0) { ctx.strokeStyle = COLOR.frostAura; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    // Eaten-down bites: one past 3/4 HP, two past 1/2 HP.
    const frac = e.hp / e.maxHp, bites = frac <= 0.5 ? 2 : frac <= 0.75 ? 1 : 0;
    drawFood(ctx, e.typeId, e.x, e.y, e.radius, et.color, et.edge, e.hurtFlash > 0, bites);
    // Posing for the photo: a slight overexposed tint + camera-viewfinder corner
    // brackets framing the held-still dish (no ice — it's a snapshot, not a freeze).
    if (e.freezeTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.22; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = "#eaf6ff"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const b = e.radius + 5, L = Math.max(3, e.radius * 0.55);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const bx = e.x + sx * b, by = e.y + sy * b;
        ctx.beginPath(); ctx.moveTo(bx, by - sy * L); ctx.lineTo(bx, by); ctx.lineTo(bx - sx * L, by); ctx.stroke();
      }
      ctx.restore();
    }
    if (e.hp < e.maxHp) {
      const w = Math.max(18, e.radius * 2), frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w, 4);
      ctx.fillStyle = COLOR.good; ctx.fillRect(e.x - w / 2, e.y - e.radius - 11, w * frac, 4);
    }
  }
}

// The only shots that still travel are the Regular's thrown fork and the
// Photographer's flash orb. Big Appetite, the Kids' Table, and the Slurper all
// act instantly on the belt (see fireProjectile / drawSlurpStraws).
function drawProjectiles(ctx) {
  for (const p of game.projectiles) {
    const tx = p.target ? p.target.x : p.x + 1, ty = p.target ? p.target.y : p.y;
    const ang = p.piercing ? p.angle : Math.atan2(ty - p.y, tx - p.x);   // pierce forks fly a fixed heading (no homing target)
    if (p.typeId === "arrow") {
      // The Regular — a fork thrown tines-first.
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
      ctx.strokeStyle = "#c3ccdb"; ctx.lineCap = "round"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(1, 0); ctx.stroke();   // handle
      ctx.lineWidth = 1.6;
      for (const dy of [-2.4, 0, 2.4]) { ctx.beginPath(); ctx.moveTo(1, dy); ctx.lineTo(7, dy); ctx.stroke(); }   // tines forward
      ctx.restore();
    } else if (p.typeId === "frost") {
      // The Photographer — a soft flash orb.
      ctx.globalAlpha = 0.4; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = "#eaffff"; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = p.color || COLOR.projectile; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// The Milkshake Slurper's straw stays attached to its locked dish while sipping.
function drawSlurpStraws(ctx) {
  for (const t of game.towers) {
    if (t.typeId !== "sniper" || !(t.slurpShow > 0)) continue;
    for (const tgt of (t.slurpTargets || [])) {   // one straw per locked dish (Silly Straw t2 → 2)
      if (!game.enemies.includes(tgt)) continue;
      const x0 = t.x, y0 = t.y - 4, x1 = tgt.x, y1 = tgt.y;
      const straw = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); };
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 5; straw(); ctx.stroke();
      ctx.strokeStyle = "#f4f7fb"; ctx.lineWidth = 3.2; straw(); ctx.stroke();
      ctx.save(); ctx.strokeStyle = "#e5484d"; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); straw(); ctx.stroke(); ctx.restore();
      ctx.fillStyle = "#f4f7fb"; ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x1, y1, 3, 0, 7); ctx.fill(); ctx.stroke();   // tip on the dish
    }
  }
}

function drawTowers(ctx) {
  for (const t of game.towers) {
    const def = TOWER_BY_ID[t.typeId];
    const idx = t.upgradeTier, radius = 13 + idx * 2;
    const glowStrength = 0.12 + idx * 0.12 + Math.max(0, t.upgradeFlash);
    // Grounding shadow so the seated customer lifts off the floor/pad.
    drawSoftShadow(ctx, t.x, t.y + radius * 0.72, radius * 0.92, radius * 0.34, COLOR.unitShadow);
    // Lunge toward the target on attack: peaks mid-animation, back to rest at the
    // ends. Big Appetite lunges much farther — he really goes for the dish.
    let ox = 0, oy = 0;
    if (t.lungeTimer > 0) {
      const reach = t.typeId === "cannon" ? 1.9 : 0.85;
      const amp = Math.sin((1 - t.lungeTimer / LUNGE_DUR) * Math.PI) * (radius * reach);
      ox = Math.cos(t.lungeAngle) * amp; oy = Math.sin(t.lungeAngle) * amp;
    }
    ctx.globalAlpha = Math.min(0.6, glowStrength); ctx.fillStyle = def.glow;
    ctx.beginPath(); ctx.arc(t.x + ox, t.y + oy, radius + 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    const justFired = t.cdTimer > t.cooldown - 0.14;
    // Big Appetite's mouth snaps shut around the peak of the lunge.
    let bite = 0;
    if (t.typeId === "cannon" && t.lungeTimer > 0) { const pr = 1 - t.lungeTimer / LUNGE_DUR; bite = Math.max(0, 1 - Math.abs(pr - 0.55) / 0.3); }
    // Art escalates with tiers bought (bib at tier 1, sparkle at tier 2); the
    // committed path drives per-tower art (e.g. the Regular's Carving Station fork).
    drawCustomer(ctx, t.typeId, t.x + ox, t.y + oy, radius, def.color, { level: t.upgradeTier + 1, path: t.upgradePath, tier: t.upgradeTier, firing: justFired, bite });
    // Two tier pips: filled = tiers bought on this tower's committed path.
    for (let i = 0; i < MAX_TIER; i++) { ctx.beginPath(); ctx.arc(t.x - 4 + i * 8, t.y - radius - 16, 3, 0, Math.PI * 2); ctx.fillStyle = i < t.upgradeTier ? COLOR.upgradeSpark : "#39404f"; ctx.fill(); }
    if (distance(boardPtr(), t) <= 18 && t.upgradeTier < MAX_TIER) {
      let cheapest = Infinity;
      for (const pp of towerPaths(t.typeId)) { const nt = nextTier(t, pp.id); if (nt && nt.cost < cheapest) cheapest = nt.cost; }
      if (cheapest < Infinity) {
        ctx.fillStyle = COLOR.ink; ctx.font = "bold 10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillText("upgrade", t.x, t.y - radius - 26);
        drawCostChip(ctx, t.x, t.y - radius - 15, cheapest, game.currency >= cheapest, 13);
      }
    }
  }
}

function drawParticles(ctx) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color;
    if (p.type === "ring") { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); }
    else if (p.type === "text") { ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.text, p.x, p.y); ctx.textAlign = "left"; }
    else if (p.type === "grab") { drawGrabHand(ctx, p); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

// A deck card: prominent portrait on top, legible name, a Tips cost chip, and
// three unmistakable states — selected (color frame + accent bar), hover
// (lifted border), unaffordable (dimmed, red cost). Shared by the toolbar and
// the hub deck so both speak one card language. `r` is the card rect.
function drawDeckCard(ctx, r, def, selected, hover, affordable, portraitR) {
  ctx.fillStyle = selected ? COLOR.ctrlSel : COLOR.ctrlBg;
  roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeStyle = selected ? def.color : (hover ? COLOR.ctrlLineHi : COLOR.ctrlLine);
  roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
  if (selected) { ctx.fillStyle = def.color; roundRect(ctx, r.x + 4, r.y + 2.5, r.w - 8, 2.5, 1.2); ctx.fill(); }
  ctx.globalAlpha = affordable ? 1 : 0.42;
  const cx = r.x + r.w / 2;
  const py = r.y + (r.h - 22) / 2;   // portrait centered in the space above the 22px name+chip zone
  drawSoftShadow(ctx, cx, py + portraitR * 0.9, portraitR * 0.95, portraitR * 0.3, COLOR.unitShadow);
  drawCustomer(ctx, def.id, cx, py, portraitR, def.color);
  // Name — centered, "The " dropped so more reads; wraps to 2 lines on the
  // taller hub cards, 1 line (ellipsized) on the short toolbar cards.
  const twoLine = r.h >= 60;
  ctx.fillStyle = affordable ? COLOR.ink : COLOR.muted;
  ctx.font = "bold " + (twoLine ? 8 : 8.5) + "px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const lines = wrapLabel(ctx, def.name.replace(/^The /, ""), r.w - 6, twoLine ? 2 : 1);
  const chipY = r.y + r.h - 7;
  let ny = chipY - 9 - (lines.length - 1) * 9;
  for (const ln of lines) { ctx.fillText(ln, cx, ny); ny += 9; }
  drawCostChip(ctx, cx, chipY, def.cost, affordable, 13);
  ctx.globalAlpha = 1;
}

// The left tower-deck RAIL (design space): the cards you seat customers from,
// stacked top-to-bottom OFF the board so they stay big and legible on a phone.
// Replaces the retired bottom toolbar; tapping a card sets the build type.
function drawRail(ctx) {
  ctx.fillStyle = COLOR.railBg; ctx.fillRect(0, 0, RAIL.w, DESIGN.h);
  ctx.strokeStyle = COLOR.ctrlLine; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(RAIL.w - 0.5, 0); ctx.lineTo(RAIL.w - 0.5, DESIGN.h); ctx.stroke();
  const deck = deckTypes();
  for (let i = 0; i < deck.length; i++) {
    const def = deck[i], r = railCardRect(i, deck.length);
    drawDeckCard(ctx, r, def, game.selectedType === def.id, inRect(game.pointer, r), game.currency >= def.cost, 15);
  }
}

// The control apron under the board (board space): the selected customer's role
// blurb on the left, the Send/Call Wave button (drawStartButton) on the right —
// living in the band the retired toolbar freed up, below the playfield.
function drawApron(ctx) {
  const def = TOWER_BY_ID[game.selectedType];
  if (!def || (game.phase !== "prep" && game.phase !== "wave")) return;
  ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(fitText(ctx, def.name + " — " + def.blurb, START_BTN.x - 26), 14, LOWER_Y + (VIEW.h - LOWER_Y) / 2);
  ctx.textBaseline = "alphabetic";
}

function drawStartButton(ctx) {
  if (game.phase !== "prep") {
    if (game.phase === "wave") { ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("serving — seat/upgrade live", START_BTN.x + START_BTN.w / 2, START_BTN.y + 24); }
    return;
  }
  const hover = inRect(boardPtr(), START_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66"; roundRect(ctx, START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 10); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif";
  ctx.fillText("▶  Send Wave " + (game.waveIndex + 1), START_BTN.x + START_BTN.w / 2, START_BTN.y + START_BTN.h / 2);
  // Auto-start countdown hint (pause menu setting): show the seconds left before
  // this prep calls the wave itself, so the auto-call never feels like a surprise.
  if (game.autoStartArmed && META.autoStart !== "off") {
    const left = Math.max(0, META.autoStart - game.prepElapsed);
    ctx.fillStyle = COLOR.gold; ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillText("auto-start in " + left.toFixed(0) + "s", START_BTN.x + START_BTN.w / 2, START_BTN.y - 9);
  }
  ctx.textBaseline = "alphabetic";
}

// Geometry for the RIGHT upgrade SHEET (design space): a full-height slide-in
// panel that replaced the floating popover. ONE source shared by the click
// handler and the renderer (the towerPanel discipline survives; the popover
// doesn't). Rows are sized so every interactive rect clears 44 CSS px at phone
// scale — the reason targeting is a 2x2 grid, not one row of four.
function towerSheet(t) {
  const x = SHEET_X, w = SHEET.w, pad = 14;
  const gx = x + pad, gw = w - 2 * pad;
  const close = { x: x + w - 62, y: 8, w: 54, h: 54 };
  const bw = (gw - 10) / 2, bh = 56, gGap = 10, gTop = 104;
  const modes = TARGETING_MODES.map(([mode, label], i) => {
    const col = i % 2, row = (i / 2) | 0;
    return { mode, label, rect: { x: gx + col * (bw + 10), y: gTop + row * (bh + gGap), w: bw, h: bh } };
  });
  const rowH = 56, rowGap = 10, pathsTop = gTop + 2 * bh + gGap + 14;
  const paths = towerPaths(t.typeId).map((pp, i) => ({
    id: pp.id, name: pp.name, rect: { x: gx, y: pathsTop + i * (rowH + rowGap), w: gw, h: rowH },
  }));
  const sell = { rect: { x: gx, y: pathsTop + 2 * (rowH + rowGap) + 8, w: gw, h: rowH } };
  return { rect: { x, y: 0, w, h: VIEW.h }, close, modes, paths, sell, gTop };
}

// Selection ring around the chosen customer — board space, drawn inside the board
// translate so it tracks the tower.
function drawSelectionRing(ctx) {
  const t = game.selectedTower;
  if (!t || game.phase === "menu") return;
  ctx.strokeStyle = COLOR.core; ctx.globalAlpha = 0.95; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(t.x, t.y, 21, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(t.x, t.y, 25, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// The RIGHT upgrade SHEET (design space): tower header, targeting grid, the two
// path rows, and Sell. Slides in from the right when a tower is selected and back
// out when deselected/sold — presentation juice only, no gameplay timing.
let sheetProgress = 0, sheetTower = null;
function drawTowerSheet(ctx) {
  const opening = !!game.selectedTower && (game.phase === "prep" || game.phase === "wave");
  if (game.selectedTower) sheetTower = game.selectedTower;
  sheetProgress = opening ? Math.min(1, sheetProgress + 0.18) : Math.max(0, sheetProgress - 0.22);
  if (sheetProgress <= 0 || !sheetTower) { if (sheetProgress <= 0) sheetTower = null; return; }
  const t = sheetTower;
  if (!game.towers.includes(t)) { sheetProgress = 0; sheetTower = null; return; }   // sold out from under us
  const def = TOWER_BY_ID[t.typeId];
  const s = towerSheet(t);
  const ease = 1 - Math.pow(1 - sheetProgress, 3);         // easeOutCubic slide-in
  ctx.save();
  ctx.translate((1 - ease) * (SHEET.w + 14), 0);
  // Soft scrim strip along the sheet's left edge for depth over the board.
  ctx.fillStyle = COLOR.sheetScrim; ctx.fillRect(s.rect.x - 12, 0, 12, DESIGN.h);
  // Sheet body + tower-colored left rule.
  ctx.fillStyle = COLOR.sheetBg; ctx.fillRect(s.rect.x, 0, s.rect.w, DESIGN.h);
  ctx.strokeStyle = def.color; ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s.rect.x + 1, 0); ctx.lineTo(s.rect.x + 1, DESIGN.h); ctx.stroke(); ctx.globalAlpha = 1;
  // Header: portrait + name + committed path/tier.
  drawSoftShadow(ctx, s.rect.x + 34, 52, 18, 6, COLOR.unitShadow);
  drawCustomer(ctx, t.typeId, s.rect.x + 34, 46, 18, def.color);
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(fitText(ctx, def.name, s.close.x - (s.rect.x + 60) - 4), s.rect.x + 60, 40);
  const sub = t.upgradeTier === 0 ? "choose an upgrade path" : def.upgrades[t.upgradePath].name + "  " + t.upgradeTier + "/" + MAX_TIER;
  ctx.fillStyle = COLOR.muted; ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(fitText(ctx, sub, s.rect.w - 72), s.rect.x + 60, 58);
  // Close (X).
  const closeHover = inRect(game.pointer, s.close);
  ctx.strokeStyle = closeHover ? COLOR.bad : COLOR.muted; ctx.lineWidth = 2; ctx.lineCap = "round";
  const cxr = s.close.x + s.close.w / 2, cyr = s.close.y + s.close.h / 2, cr = 9;
  ctx.beginPath(); ctx.moveTo(cxr - cr, cyr - cr); ctx.lineTo(cxr + cr, cyr + cr); ctx.moveTo(cxr + cr, cyr - cr); ctx.lineTo(cxr - cr, cyr + cr); ctx.stroke();
  // Targeting label + 2x2 grid.
  ctx.fillStyle = COLOR.muted; ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("TARGETING", s.rect.x + 14, s.gTop - 7);
  const cur = t.targeting || "first";
  for (const b of s.modes) {
    const on = cur === b.mode, hov = inRect(game.pointer, b.rect);
    ctx.fillStyle = on || hov ? COLOR.ctrlSel : COLOR.ctrlBg; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.fill();
    ctx.strokeStyle = on ? def.color : (hov ? COLOR.ctrlLineHi : COLOR.ctrlLine); ctx.lineWidth = on ? 2 : 1; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.stroke();
    ctx.fillStyle = on ? COLOR.ink : COLOR.muted; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 0.5);
  }
  // Two upgrade-path rows. Buying tier 1 of one commits the tower and greys the
  // other out; the committed path then reveals its tier-2 cost.
  for (const pb of s.paths) {
    const r = pb.rect;
    const committed = t.upgradePath === pb.id;
    const lockedOut = t.upgradePath !== null && !committed;
    const maxed = committed && t.upgradeTier >= MAX_TIER;
    const tier = nextTier(t, pb.id);                       // null if maxed or locked out
    const afford = tier && game.currency >= tier.cost;
    const hov = inRect(game.pointer, r) && !lockedOut && !maxed;
    let bg, border;
    if (lockedOut) { bg = "#161a22"; border = "#242a36"; }
    else if (maxed) { bg = "#16281c"; border = COLOR.good; }
    else { bg = afford ? (hov ? "#1c3324" : "#16281c") : "#2a1f26"; border = afford ? COLOR.good : COLOR.bad; }
    ctx.globalAlpha = lockedOut ? 0.5 : 1;
    ctx.fillStyle = bg; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = committed ? 2 : 1; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
    const mid = r.y + r.h / 2;
    ctx.fillStyle = lockedOut ? COLOR.muted : COLOR.ink; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillText(fitText(ctx, pb.name, r.w - 66), r.x + 10, mid - 7);
    ctx.font = "9px system-ui, sans-serif"; ctx.fillStyle = COLOR.muted;
    ctx.fillText(committed ? (maxed ? "committed · maxed" : "committed path") : (lockedOut ? "path locked out" : "next: tier " + (t.upgradeTier + 1)), r.x + 10, mid + 9);
    ctx.font = "bold 10px system-ui, sans-serif";
    if (lockedOut) {
      ctx.fillStyle = COLOR.muted; ctx.textAlign = "right"; ctx.fillText("locked", r.x + r.w - 10, mid);
      drawLockIcon(ctx, r.x + r.w - 10 - ctx.measureText("locked").width - 9, mid, 4.5, COLOR.muted);
    } else if (maxed) {
      ctx.fillStyle = COLOR.good; ctx.textAlign = "right"; ctx.fillText("MAX", r.x + r.w - 10, mid);
    } else {
      drawCostChip(ctx, r.x + r.w - 10, mid, tier.cost, afford, 16, "right");
    }
  }
  ctx.globalAlpha = 1;
  // Sell row — destructive affordance (muted red) with the live refund as a gold
  // payout pill.
  const sr = s.sell.rect, refund = Math.floor(RULES.sellRefund * t.spent);
  const sellHover = inRect(game.pointer, sr), smid = sr.y + sr.h / 2;
  ctx.fillStyle = sellHover ? "#33181b" : "#241418"; roundRect(ctx, sr.x, sr.y, sr.w, sr.h, 8); ctx.fill();
  ctx.strokeStyle = sellHover ? COLOR.bad : "#7e3634"; ctx.lineWidth = 1; roundRect(ctx, sr.x, sr.y, sr.w, sr.h, 8); ctx.stroke();
  ctx.fillStyle = sellHover ? COLOR.bad : "#c98a8a"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "bold 12px system-ui, sans-serif";
  ctx.fillText("Sell tower", sr.x + 10, smid + 0.5);
  drawCostChip(ctx, sr.x + sr.w - 10, smid, refund, true, 16, "right");
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.restore();
}

function drawHUD(ctx) {
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const lowLives = game.lives > 0 && game.lives <= game.maxLives * 0.25;
  const pulse = lowLives ? 0.5 + 0.5 * Math.sin(game.elapsed * 9) : 0;
  // Backing (rounded readout bar; flushes red when the Health Rating is low).
  ctx.fillStyle = lowLives ? `rgba(255,${60 - Math.round(30 * pulse)},${60 - Math.round(30 * pulse)},0.42)` : COLOR.hudBg;
  roundRect(ctx, 6, 6, 408, 28, 8); ctx.fill();
  ctx.font = "bold 14px system-ui, sans-serif";
  // Health Rating (lives) — star placard + count; whitens on the low-lives pulse.
  const rc = lowLives && pulse > 0.5 ? "#ffffff" : COLOR.bad;
  drawRatingIcon(ctx, 21, 20, rc, 8);
  ctx.fillStyle = rc; ctx.fillText("" + game.lives, 34, 13);
  // Tips (currency) — coin + count.
  drawCurrencyIcon(ctx, 82, 20, COLOR.gold, 8);
  ctx.fillStyle = COLOR.gold; ctx.fillText("" + game.currency, 94, 13);
  // Wave + score + phase — endless: the wave counter has no "/20" ceiling.
  ctx.fillStyle = COLOR.ink;
  ctx.fillText("Wave " + (game.waveIndex + 1), 166, 13);
  ctx.fillStyle = COLOR.essence; ctx.fillText("★ " + game.score, 256, 13);
  ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(game.phase === "wave" ? "serving…" : "prep", 352, 14);
  ctx.textBaseline = "alphabetic";
}

function drawMessage(ctx) {
  if (game.messageTimer <= 0 || game.phase === "lost") return;
  ctx.globalAlpha = Math.min(1, game.messageTimer); ctx.fillStyle = COLOR.ink; ctx.font = "13px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(game.message, VIEW.w / 2, 52); ctx.globalAlpha = 1;
}

function drawSummary(ctx) {
  const cx = DESIGN.w / 2, cy = DESIGN.h / 2;
  ctx.fillStyle = "rgba(8,10,15,0.82)"; ctx.fillRect(0, 0, DESIGN.w, DESIGN.h);
  ctx.textAlign = "center";
  const r = game.lastRun || { wave: 1, best: 1, newBest: false, killed: 0, essence: 0, score: 0 };
  // Endless: a run ends only in defeat. Headline the waves survived; a new
  // personal best gets its own callout, otherwise show the record to beat.
  ctx.fillStyle = COLOR.bad; ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText("CLOSING TIME", cx, cy - 58);
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText("You survived to Wave " + r.wave, cx, cy - 28);
  if (r.newBest) { ctx.fillStyle = COLOR.essence; ctx.font = "bold 15px system-ui, sans-serif"; ctx.fillText("★ New best run!", cx, cy - 6); }
  else { ctx.fillStyle = COLOR.muted; ctx.font = "14px system-ui, sans-serif"; ctx.fillText("Best run:  Wave " + (r.best || r.wave), cx, cy - 6); }
  ctx.fillStyle = COLOR.ink; ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Dishes eaten: " + r.killed, cx, cy + 15);
  ctx.fillStyle = COLOR.essence; ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText("✦ +" + r.essence + " Golden Forks earned", cx, cy + 36);
  const hover = inRect(game.pointer, CONTINUE_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66"; roundRect(ctx, CONTINUE_BTN.x, CONTINUE_BTN.y, CONTINUE_BTN.w, CONTINUE_BTN.h, 8); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif"; ctx.textBaseline = "middle";
  ctx.fillText("Continue →", cx, CONTINUE_BTN.y + CONTINUE_BTN.h / 2); ctx.textBaseline = "alphabetic";
}

function drawMuteButton(ctx) {
  const rr = muteBtnRect();
  ctx.fillStyle = "rgba(0,0,0,0.35)"; roundRect(ctx, rr.x, rr.y, rr.w, rr.h, 7); ctx.fill();
  const x = rr.x + (rr.w - 32) / 2, y = rr.y + (rr.h - 32) / 2;
  ctx.fillStyle = audio.muted ? COLOR.muted : COLOR.core;
  ctx.beginPath(); ctx.moveTo(x + 9, y + 13); ctx.lineTo(x + 14, y + 13); ctx.lineTo(x + 19, y + 9); ctx.lineTo(x + 19, y + 23); ctx.lineTo(x + 14, y + 19); ctx.lineTo(x + 9, y + 19); ctx.closePath(); ctx.fill();
  if (audio.muted) { ctx.strokeStyle = COLOR.coreHurt; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 22, y + 11); ctx.lineTo(x + 28, y + 21); ctx.moveTo(x + 28, y + 11); ctx.lineTo(x + 22, y + 21); ctx.stroke(); }
  else { ctx.strokeStyle = COLOR.core; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 21, y + 16, 4, -0.6, 0.6); ctx.arc(x + 21, y + 16, 8, -0.6, 0.6); ctx.stroke(); }
}

// Pause/resume button, left of mute — shown only during a run. `gamePaused` is
// SHELL state (src/main.js); the engine never reads it, so the typeof guard
// keeps this file safe in contexts where the shell isn't loaded.
function drawPauseButton(ctx) {
  if (game.phase !== "prep" && game.phase !== "wave") return;
  const paused = typeof gamePaused !== "undefined" && gamePaused;
  const rr = pauseBtnRect();
  ctx.fillStyle = "rgba(0,0,0,0.35)"; roundRect(ctx, rr.x, rr.y, rr.w, rr.h, 7); ctx.fill();
  const x = rr.x + (rr.w - 32) / 2, y = rr.y + (rr.h - 32) / 2;
  ctx.fillStyle = paused ? COLOR.good : COLOR.core;
  if (paused) {   // play triangle = "resume"
    ctx.beginPath(); ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 25, y + 16); ctx.lineTo(x + 12, y + 24); ctx.closePath(); ctx.fill();
  } else {        // two bars = "pause"
    ctx.fillRect(x + 10, y + 8, 4.5, 16); ctx.fillRect(x + 18, y + 8, 4.5, 16);
  }
}

// Pause-menu geometry (BOARD space — hit-tested with boardPtr in main.js). One
// source shared by draw + input. Button rows are ≥48 design px so each clears 44
// CSS px at ~844x390 phone scale (Issue #79 touch bar). The auto-start row is a
// 5-way segmented control (Off / Instant / 1s / 2s / 3s → AUTOSTART_OPTIONS).
function pauseMenuRects() {
  // Segments are 56 design px tall and ~58 wide so every one clears 44 CSS px
  // at ~844x390 phone scale (canvas ≈ 0.84 scale → 44/0.84 ≈ 53 design px min).
  const w = 360, h = 276, x = (VIEW.w - w) / 2, y = 56;   // sits in the upper play area, clear of the apron (y=384)
  const bx = x + 24, bw = w - 48;
  const ow = (bw - 4 * 6) / 5;   // 5 segments, 6px gaps
  const autoStart = AUTOSTART_OPTIONS.map(([value, label], i) => ({
    value, label, rect: { x: bx + i * (ow + 6), y: y + 64, w: ow, h: 56 },
  }));
  return {
    panel: { x, y, w, h },
    autoStart,
    resume: { x: bx, y: y + 134, w: bw, h: 54 },
    saveQuit: { x: bx, y: y + 198, w: bw, h: 54 },
  };
}

// Full-board dim + a centered pause menu. Drawn under the toolbar/HUD so the rail
// and sheet stay bright — you can still seat & upgrade while paused. The menu adds
// Resume and an honestly-labelled "Save & Quit" (Issue #83).
function drawPausedOverlay(ctx) {
  ctx.fillStyle = "rgba(8,10,15,0.55)"; ctx.fillRect(0, 0, VIEW.w, LOWER_Y);
  const m = pauseMenuRects();
  // Panel.
  ctx.fillStyle = "rgba(18,22,30,0.97)"; roundRect(ctx, m.panel.x, m.panel.y, m.panel.w, m.panel.h, 12); ctx.fill();
  ctx.strokeStyle = COLOR.ctrlLineHi; ctx.lineWidth = 1.5; roundRect(ctx, m.panel.x, m.panel.y, m.panel.w, m.panel.h, 12); ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText("Paused", VIEW.w / 2, m.panel.y + 36);
  // Auto-start segmented row: Off / Instant / 1s / 2s / 3s (persisted in META).
  ctx.fillStyle = COLOR.muted; ctx.font = "9px system-ui, sans-serif";
  ctx.fillText("AUTO-START NEXT WAVE", VIEW.w / 2, m.panel.y + 58);
  for (const b of m.autoStart) {
    const on = META.autoStart === b.value, hov = inRect(boardPtr(), b.rect);
    ctx.fillStyle = on || hov ? COLOR.ctrlSel : COLOR.ctrlBg; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.fill();
    ctx.strokeStyle = on ? COLOR.gold : (hov ? COLOR.ctrlLineHi : COLOR.ctrlLine); ctx.lineWidth = on ? 2 : 1; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.stroke();
    ctx.fillStyle = on ? COLOR.ink : COLOR.muted; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 0.5);
    ctx.textBaseline = "alphabetic";
  }
  // Resume (green).
  const rHover = inRect(boardPtr(), m.resume);
  ctx.fillStyle = rHover ? COLOR.good : "#1f6b3f"; roundRect(ctx, m.resume.x, m.resume.y, m.resume.w, m.resume.h, 9); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 17px system-ui, sans-serif"; ctx.textBaseline = "middle";
  ctx.fillText("▶  Resume", VIEW.w / 2, m.resume.y + m.resume.h / 2);
  // Save & Quit (honest label: it resumes at wave start).
  const sHover = inRect(boardPtr(), m.saveQuit);
  ctx.fillStyle = sHover ? COLOR.core : "#2b3f66"; roundRect(ctx, m.saveQuit.x, m.saveQuit.y, m.saveQuit.w, m.saveQuit.h, 9); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif";
  ctx.fillText("Save & Quit", VIEW.w / 2, m.saveQuit.y + m.saveQuit.h / 2 - 7);
  ctx.fillStyle = COLOR.parchment || COLOR.muted; ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("resumes at wave start", VIEW.w / 2, m.saveQuit.y + m.saveQuit.h / 2 + 11);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

