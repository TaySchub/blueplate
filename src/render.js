/*
  Deckbound — src/render.js
  The render pass + all UI: screens, HUD, toolbar, panels, buttons, and the
  in-run scene (belt, kitchen, chute, enemies, towers, particles). Reads game
  state and calls art.js draw functions; never mutates gameplay state.
  Panel/button geometry lives here and is shared with input hit-testing.
*/

const START_BTN = { x: 470, y: 402, w: 210, h: 38 };
const CONTINUE_BTN = { x: VIEW.w / 2 - 85, y: VIEW.h / 2 + 44, w: 170, h: 38 };
const PLAY_BTN = { x: VIEW.w / 2 - 90, y: 372, w: 180, h: 44 };
const MODE_BTN = { x: VIEW.w / 2 - 90, y: 328, w: 180, h: 30 };
const TOOLBAR = { y: 398, cardW: 66, cardH: 44, gap: 6, startX: 8 };

function cardRect(i) {
  return { x: TOOLBAR.startX + i * (TOOLBAR.cardW + TOOLBAR.gap), y: TOOLBAR.y, w: TOOLBAR.cardW, h: TOOLBAR.cardH };
}
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

/* =========================================================================
   10) RENDER
   ========================================================================= */

function render() {
  const ctx = game.ctx;
  if (game.phase === "menu") { drawMenu(ctx); drawMuteButton(ctx); return; }
  const shaking = game.shake > 0.05;
  if (shaking) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground(ctx);
  drawPath(ctx);
  drawKitchenDoor(ctx);
  drawSlots(ctx);
  drawTowerRanges(ctx);
  drawCore(ctx);
  drawEnemies(ctx);
  drawProjectiles(ctx);
  drawSlurpStraws(ctx);
  drawTowers(ctx);
  drawParticles(ctx);
  if (shaking) ctx.restore();
  // Paused: dim the board (UI below stays bright — you can still seat/upgrade).
  if (typeof gamePaused !== "undefined" && gamePaused) drawPausedOverlay(ctx);
  drawToolbar(ctx);
  drawStartButton(ctx);
  drawHUD(ctx);
  drawSelectedTowerPanel(ctx);
  drawMessage(ctx);
  drawMuteButton(ctx);
  drawPauseButton(ctx);
  if (game.phase === "won" || game.phase === "lost") drawSummary(ctx);
}

/* ---- Hub / menu screen ---- */

function shopButtonRects() {
  const out = [];
  const x = 430, w = 330, h = 40, gap = 12;
  let y = 150;
  for (const item of SHOP) { out.push({ item, rect: { x, y, w, h } }); y += h + gap; }
  return out;
}

function drawMenu(ctx) {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1;
  const gap = 50;
  ctx.beginPath();
  for (let x = gap; x < VIEW.w; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.h); }
  for (let y = gap; y < VIEW.h; y += gap) { ctx.moveTo(0, y); ctx.lineTo(VIEW.w, y); }
  ctx.stroke();

  // Title.
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.fillText("Deckbound", 40, 62);
  ctx.fillStyle = COLOR.muted;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Seat the customers. Eat the food. Don't let dinner get away.", 42, 86);

  // Golden Forks (meta currency).
  ctx.fillStyle = COLOR.essence;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText("✦ Golden Forks: " + META.essence, 42, 122);

  // Your regulars (collection).
  ctx.fillStyle = COLOR.ink;
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("Your regulars", 42, 156);
  const deck = deckTypes();
  let dx = 46;
  for (const def of deck) {
    ctx.fillStyle = "#1b2230";
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.stroke();
    drawCustomer(ctx, def.id, dx + 32, 199, 11, def.color);
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(fitText(ctx, def.name, 60), dx + 32, 226);
    ctx.fillStyle = COLOR.gold; ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("◆" + def.cost, dx + 32, 240);
    ctx.textAlign = "left";
    dx += 72;
  }
  // Locked slot hint if Sniper not yet unlocked.
  if (!META.unlocked.includes("sniper")) {
    ctx.fillStyle = "#151a24";
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.fill();
    ctx.strokeStyle = "#2a3242"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    roundRect(ctx, dx, 168, 64, 78, 8); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COLOR.muted; ctx.textAlign = "center"; ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("🔒", dx + 32, 205);
    ctx.font = "10px system-ui, sans-serif"; ctx.fillText("locked", dx + 32, 232);
    ctx.textAlign = "left";
  }

  // Shop.
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("Golden Forks shop", 430, 140);
  for (const b of shopButtonRects()) {
    const owned = b.item.owned();
    const affordable = META.essence >= b.item.cost;
    const hover = inRect(game.pointer, b.rect);
    ctx.fillStyle = owned ? "#1a241b" : (hover && affordable ? "#26324a" : "#1b2230");
    roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.fill();
    ctx.strokeStyle = owned ? COLOR.good : (affordable ? "#4a5670" : "#2a3242");
    ctx.lineWidth = 1; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 8); ctx.stroke();
    ctx.fillStyle = COLOR.ink; ctx.font = "13px system-ui, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(b.item.label, b.rect.x + 12, b.rect.y + 25);
    ctx.textAlign = "right";
    if (owned) { ctx.fillStyle = COLOR.good; ctx.fillText("owned ✓", b.rect.x + b.rect.w - 12, b.rect.y + 25); }
    else { ctx.fillStyle = affordable ? COLOR.essence : COLOR.bad; ctx.fillText("✦ " + b.item.cost, b.rect.x + b.rect.w - 12, b.rect.y + 25); }
    ctx.textAlign = "left";
  }

  // Mode toggle (Finite vs Endless).
  const modeHover = inRect(game.pointer, MODE_BTN);
  ctx.fillStyle = modeHover ? "#26324a" : "#1b2230";
  roundRect(ctx, MODE_BTN.x, MODE_BTN.y, MODE_BTN.w, MODE_BTN.h, 8); ctx.fill();
  ctx.strokeStyle = chosenEndless ? COLOR.essence : "#4a5670"; ctx.lineWidth = 1;
  roundRect(ctx, MODE_BTN.x, MODE_BTN.y, MODE_BTN.w, MODE_BTN.h, 8); ctx.stroke();
  ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Mode:  " + (chosenEndless ? "All-you-can-eat ∞" : "Full menu (20)"), VIEW.w / 2, MODE_BTN.y + MODE_BTN.h / 2);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";

  // Play button.
  const hover = inRect(game.pointer, PLAY_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66";
  roundRect(ctx, PLAY_BTN.x, PLAY_BTN.y, PLAY_BTN.w, PLAY_BTN.h, 10); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("▶  Open for Service", VIEW.w / 2, PLAY_BTN.y + PLAY_BTN.h / 2);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

/* ---- In-run drawing ---- */

function drawBackground(ctx) {
  // American-diner floor: a low-contrast checkerboard so the belt, customers, and
  // food stay the things that pop.
  ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  const tile = 45;
  ctx.fillStyle = "#141a24";
  for (let gy = 0; gy < TOOLBAR.y; gy += tile)
    for (let gx = 0; gx < VIEW.w; gx += tile)
      if (((gx / tile) + (gy / tile)) & 1) ctx.fillRect(gx, gy, tile, tile);
  // A booth/table pad under each seat — set dressing behind the seated customers.
  for (const s of SLOTS) {
    ctx.fillStyle = "#1b222d"; roundRect(ctx, s.x - 21, s.y - 15, 42, 30, 7); ctx.fill();
    ctx.strokeStyle = "#262f3d"; ctx.lineWidth = 1.5; roundRect(ctx, s.x - 21, s.y - 15, 42, 30, 7); ctx.stroke();
  }
}

// The conveyor belt the food rides from the kitchen to the trash chute. Metal
// rails + a belt surface, with slats that animate toward the chute (the
// fixed-timestep loop drives the offset off game.elapsed).
function drawPath(ctx) {
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const trace = () => { ctx.beginPath(); ctx.moveTo(PATH[0].x, PATH[0].y); for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y); };
  ctx.strokeStyle = "#0e1118"; ctx.lineWidth = 46; trace(); ctx.stroke();  // rail shadow
  ctx.strokeStyle = "#333c4b"; ctx.lineWidth = 40; trace(); ctx.stroke();  // rail metal
  ctx.strokeStyle = "#232a35"; ctx.lineWidth = 34; trace(); ctx.stroke();  // belt surface
  // Moving slats across the belt, marching toward the chute.
  const spacing = 26, half = 15;
  const offset = (game.elapsed * 42) % spacing;
  ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 4; ctx.lineCap = "butt";
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
}

// The kitchen the dishes escape from — a doorway with swinging half-doors at the
// belt's spawn (left edge); the belt emerges from its dark mouth.
function drawKitchenDoor(ctx) {
  const y = PATH[0].y, doorW = 40, gap = 18;
  const top = y - 40, bot = y + 40;
  ctx.fillStyle = "#0b0e14"; ctx.fillRect(0, top, doorW, bot - top);          // dark interior
  ctx.fillStyle = "#2c3543"; ctx.strokeStyle = "#3f4a5c"; ctx.lineWidth = 1;   // swinging half-doors
  ctx.fillRect(2, top + 2, doorW - 4, (y - gap) - (top + 2)); ctx.strokeRect(2, top + 2, doorW - 4, (y - gap) - (top + 2));
  ctx.fillRect(2, y + gap, doorW - 4, (bot - 2) - (y + gap)); ctx.strokeRect(2, y + gap, doorW - 4, (bot - 2) - (y + gap));
  ctx.strokeStyle = "#4a5568"; ctx.lineWidth = 3;                              // door frame (right jamb + lintel + sill)
  ctx.beginPath(); ctx.moveTo(doorW, top); ctx.lineTo(doorW, bot); ctx.moveTo(0, top); ctx.lineTo(doorW, top); ctx.moveTo(0, bot); ctx.lineTo(doorW, bot); ctx.stroke();
  ctx.fillStyle = "#8b94a7"; ctx.font = "bold 8px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("KITCHEN", doorW / 2, bot + 8);
  ctx.textBaseline = "alphabetic";
}

function drawSlots(ctx) {
  const def = TOWER_BY_ID[game.selectedType];
  for (let i = 0; i < SLOTS.length; i++) {
    if (game.towers.some((t) => t.slotIndex === i)) continue;
    const s = SLOTS[i];
    const hover = distance(game.pointer, s) <= 20;
    const affordable = game.currency >= def.cost;
    ctx.save(); ctx.setLineDash([4, 4]);
    ctx.strokeStyle = hover ? (affordable ? COLOR.good : COLOR.bad) : COLOR.slot;
    ctx.globalAlpha = hover ? 0.9 : 0.5; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    if (hover) { ctx.fillStyle = affordable ? COLOR.good : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(def.name + " " + def.cost, s.x, s.y - 22); }
  }
}

function drawTowerRanges(ctx) {
  for (const t of game.towers) {
    const hover = distance(game.pointer, t) <= t.range;
    ctx.strokeStyle = TOWER_BY_ID[t.typeId].color; ctx.globalAlpha = hover ? 0.18 : 0.05; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// The trash chute (the core): a bin any dish reaching it clatters into. The
// pulsing danger halo + the hurt flash on a leak are kept.
function drawCore(ctx) {
  const hurt = game.coreHurtFlash > 0;
  const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 2);
  const col = hurt ? COLOR.coreHurt : COLOR.core;
  const x = CORE.x, y = CORE.y, R = CORE.radius;
  // Danger halo.
  ctx.strokeStyle = col; ctx.globalAlpha = 0.15 + 0.25 * pulse; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, R + 8 + pulse * 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  // Bin body (a trapezoid, wider at the top).
  const topW = R * 1.6, botW = R * 1.15, topY = y - R * 0.5, botY = y + R * 1.05;
  ctx.fillStyle = hurt ? "#5a2626" : "#2b3346";
  ctx.beginPath(); ctx.moveTo(x - topW / 2, topY); ctx.lineTo(x + topW / 2, topY); ctx.lineTo(x + botW / 2, botY); ctx.lineTo(x - botW / 2, botY); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  // Vertical ridges.
  ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1.5;
  for (const f of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(x + f * topW, topY + 3); ctx.lineTo(x + f * botW, botY - 3); ctx.stroke(); }
  // Lid + handle.
  const lidW = topW * 1.14, lidH = R * 0.32, lidY = topY - R * 0.34;
  ctx.fillStyle = hurt ? COLOR.coreHurt : "#3a465e";
  roundRect(ctx, x - lidW / 2, lidY, lidW, lidH, 3); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; roundRect(ctx, x - lidW / 2, lidY, lidW, lidH, 3); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(x - R * 0.12, lidY - R * 0.2, R * 0.24, R * 0.22);
  // Label.
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("TRASH", x, botY + 15);
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
    if (t.typeId !== "sniper" || !(t.slurpShow > 0) || !t.slurpTarget || !game.enemies.includes(t.slurpTarget)) continue;
    const x0 = t.x, y0 = t.y - 4, x1 = t.slurpTarget.x, y1 = t.slurpTarget.y;
    const straw = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); };
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 5; straw(); ctx.stroke();
    ctx.strokeStyle = "#f4f7fb"; ctx.lineWidth = 3.2; straw(); ctx.stroke();
    ctx.save(); ctx.strokeStyle = "#e5484d"; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); straw(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#f4f7fb"; ctx.strokeStyle = "#0b0e14"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x1, y1, 3, 0, 7); ctx.fill(); ctx.stroke();   // tip on the dish
  }
}

function drawTowers(ctx) {
  for (const t of game.towers) {
    const def = TOWER_BY_ID[t.typeId];
    const idx = t.upgradeTier, radius = 13 + idx * 2;
    const glowStrength = 0.12 + idx * 0.12 + Math.max(0, t.upgradeFlash);
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
    if (distance(game.pointer, t) <= 18 && t.upgradeTier < MAX_TIER) {
      let cheapest = Infinity;
      for (const pp of towerPaths(t.typeId)) { const nt = nextTier(t, pp.id); if (nt && nt.cost < cheapest) cheapest = nt.cost; }
      if (cheapest < Infinity) { ctx.fillStyle = game.currency >= cheapest ? COLOR.good : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("upgrade ◆" + cheapest, t.x, t.y - radius - 24); }
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

function drawToolbar(ctx) {
  ctx.fillStyle = COLOR.panel; ctx.fillRect(0, TOOLBAR.y - 2, VIEW.w, VIEW.h - TOOLBAR.y + 2);
  const deck = deckTypes();
  for (let i = 0; i < deck.length; i++) {
    const def = deck[i], r = cardRect(i);
    const selected = game.selectedType === def.id, affordable = game.currency >= def.cost, hover = inRect(game.pointer, r);
    ctx.fillStyle = selected ? "#26324a" : "#1b2230"; roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
    ctx.lineWidth = selected ? 2 : 1; ctx.strokeStyle = selected ? def.color : (hover ? "#4a5670" : "#2a3242"); roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
    ctx.globalAlpha = affordable ? 1 : 0.4;
    drawCustomer(ctx, def.id, r.x + 15, r.y + r.h / 2, 8, def.color);
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText(fitText(ctx, def.name, r.w - 30), r.x + 28, r.y + 17);
    ctx.fillStyle = affordable ? COLOR.gold : COLOR.bad; ctx.font = "11px system-ui, sans-serif"; ctx.fillText("◆" + def.cost, r.x + 28, r.y + 33);
    ctx.globalAlpha = 1;
  }
  const def = TOWER_BY_ID[game.selectedType];
  ctx.fillStyle = COLOR.muted; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "left";
  const cardsEnd = TOOLBAR.startX + deck.length * (TOOLBAR.cardW + TOOLBAR.gap);
  ctx.fillText(def.name + ": " + def.blurb, cardsEnd + 6, TOOLBAR.y + 16);
}

function drawStartButton(ctx) {
  if (game.phase !== "prep") {
    if (game.phase === "wave") { ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("serving — seat/upgrade live", START_BTN.x + START_BTN.w / 2, START_BTN.y + 24); }
    return;
  }
  const hover = inRect(game.pointer, START_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66"; roundRect(ctx, START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 8); ctx.fill();
  const bonus = earlyCallBonusNow();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (bonus > 0) {
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("▶  Call Wave " + (game.waveIndex + 1), START_BTN.x + START_BTN.w / 2 - 22, START_BTN.y + START_BTN.h / 2);
    ctx.fillStyle = COLOR.gold; ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText("+" + bonus, START_BTN.x + START_BTN.w - 32, START_BTN.y + START_BTN.h / 2);
  } else {
    ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("▶  Send Wave " + (game.waveIndex + 1), START_BTN.x + START_BTN.w / 2, START_BTN.y + START_BTN.h / 2);
  }
  ctx.textBaseline = "alphabetic";
}

// Geometry for the selected-tower panel (targeting modes + two upgrade-path
// buttons). Shared by the click handler and the renderer so hit-testing matches
// what's drawn.
function towerPanel(t) {
  const W = 190, H = 110;
  const x = Math.max(6, Math.min(VIEW.w - W - 6, t.x - W / 2));
  let y = t.y + 24;
  if (y + H > TOOLBAR.y - 4) y = t.y - 24 - H;      // flip above the tower if it'd cover the toolbar
  y = Math.max(6, Math.min(TOOLBAR.y - H - 6, y));
  const rect = { x, y, w: W, h: H };
  const bw = 42, bh = 20, gap = 4, by = y + 26;
  const modes = TARGETING_MODES.map(([mode, label], i) => ({
    mode, label, rect: { x: x + 6 + i * (bw + gap), y: by, w: bw, h: bh },
  }));
  // Two full-width upgrade-path buttons stacked below the targeting row.
  const paths = towerPaths(t.typeId).map((pp, i) => ({
    id: pp.id, name: pp.name, rect: { x: x + 6, y: y + 52 + i * 26, w: W - 12, h: 22 },
  }));
  return { rect, modes, paths };
}

function drawSelectedTowerPanel(ctx) {
  const t = game.selectedTower;
  if (!t || game.phase === "menu") return;
  const def = TOWER_BY_ID[t.typeId];
  const p = towerPanel(t);
  // Highlight ring on the selected tower.
  ctx.strokeStyle = COLOR.core; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(t.x, t.y, 22, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // Panel background.
  ctx.fillStyle = "rgba(14,18,28,0.96)"; roundRect(ctx, p.rect.x, p.rect.y, p.rect.w, p.rect.h, 8); ctx.fill();
  ctx.strokeStyle = def.color; ctx.lineWidth = 1; roundRect(ctx, p.rect.x, p.rect.y, p.rect.w, p.rect.h, 8); ctx.stroke();
  // Header: tower name + which path/tier this tower is committed to.
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const sub = t.upgradeTier === 0 ? "choose an upgrade path" : def.upgrades[t.upgradePath].name + "  " + t.upgradeTier + "/" + MAX_TIER;
  ctx.fillText(def.name + "  ·  " + sub, p.rect.x + 8, p.rect.y + 16);
  ctx.textAlign = "left";
  // Targeting mode buttons.
  const cur = t.targeting || "first";
  for (const b of p.modes) {
    const on = cur === b.mode;
    ctx.fillStyle = on ? "#26324a" : "#1b2230"; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 5); ctx.fill();
    ctx.strokeStyle = on ? def.color : "#2a3242"; ctx.lineWidth = on ? 1.5 : 1; roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 5); ctx.stroke();
    ctx.fillStyle = on ? COLOR.ink : COLOR.muted; ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 0.5);
  }
  // Two upgrade-path buttons. Buying tier 1 of one commits this tower and greys
  // the other out for good; the committed path then reveals its tier-2 cost.
  ctx.font = "bold 10px system-ui, sans-serif"; ctx.textBaseline = "middle";
  for (const pb of p.paths) {
    const r = pb.rect;
    const committed = t.upgradePath === pb.id;
    const lockedOut = t.upgradePath !== null && !committed;
    const maxed = committed && t.upgradeTier >= MAX_TIER;
    const tier = nextTier(t, pb.id);                 // null if maxed or locked out
    const afford = tier && game.currency >= tier.cost;
    let bg, border;
    if (lockedOut) { bg = "#161a22"; border = "#242a36"; }
    else if (maxed) { bg = "#16281c"; border = COLOR.good; }
    else { bg = afford ? "#16281c" : "#2a1f26"; border = afford ? COLOR.good : COLOR.bad; }
    ctx.globalAlpha = lockedOut ? 0.5 : 1;
    ctx.fillStyle = bg; roundRect(ctx, r.x, r.y, r.w, r.h, 5); ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = committed ? 1.5 : 1; roundRect(ctx, r.x, r.y, r.w, r.h, 5); ctx.stroke();
    // Path name (left) + cost/state tag (right).
    ctx.fillStyle = lockedOut ? COLOR.muted : COLOR.ink; ctx.textAlign = "left";
    ctx.fillText(fitText(ctx, pb.name, r.w - 54), r.x + 8, r.y + r.h / 2 + 0.5);
    ctx.textAlign = "right";
    let tag;
    if (lockedOut) { ctx.fillStyle = COLOR.muted; tag = "🔒 locked"; }
    else if (maxed) { ctx.fillStyle = COLOR.good; tag = "✓ max"; }
    else { ctx.fillStyle = afford ? COLOR.gold : COLOR.bad; tag = "◆" + tier.cost; }
    ctx.fillText(tag, r.x + r.w - 8, r.y + r.h / 2 + 0.5);
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

function drawHUD(ctx) {
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const lowLives = game.lives > 0 && game.lives <= game.maxLives * 0.25;
  const pulse = lowLives ? 0.5 + 0.5 * Math.sin(game.elapsed * 9) : 0;
  ctx.fillStyle = lowLives ? `rgba(255,${60 - Math.round(30 * pulse)},${60 - Math.round(30 * pulse)},0.4)` : "rgba(0,0,0,0.4)";
  ctx.fillRect(6, 6, game.endless ? 408 : 320, 26);
  ctx.font = "bold 14px system-ui, sans-serif";
  drawRatingIcon(ctx, 14, 17, lowLives && pulse > 0.5 ? "#ffffff" : COLOR.bad);
  ctx.fillStyle = lowLives && pulse > 0.5 ? "#ffffff" : COLOR.bad; ctx.fillText("" + game.lives, 26, 11);
  drawCurrencyIcon(ctx, 76, 17, COLOR.gold);
  ctx.fillStyle = COLOR.gold; ctx.fillText("" + game.currency, 88, 11);
  ctx.fillStyle = COLOR.ink;
  const waveLabel = game.endless ? "Wave " + (game.waveIndex + 1) : "Wave " + Math.min(game.waveIndex + 1, WAVES.length) + "/" + WAVES.length;
  ctx.fillText(waveLabel, 160, 11);
  if (game.endless) { ctx.fillStyle = COLOR.essence; ctx.fillText("★ " + game.score, 250, 11); }
  ctx.fillStyle = COLOR.muted; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(game.phase === "wave" ? "serving…" : "prep", game.endless ? 348 : 262, 12);
  ctx.textBaseline = "alphabetic";
}

function drawMessage(ctx) {
  if (game.messageTimer <= 0 || game.phase === "won" || game.phase === "lost") return;
  ctx.globalAlpha = Math.min(1, game.messageTimer); ctx.fillStyle = COLOR.ink; ctx.font = "13px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(game.message, VIEW.w / 2, 52); ctx.globalAlpha = 1;
}

function drawSummary(ctx) {
  ctx.fillStyle = "rgba(8,10,15,0.82)"; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.textAlign = "center";
  const r = game.lastRun || { won: false, wave: 1, killed: 0, essence: 0, endless: false, score: 0 };
  const endless = !!r.endless;
  ctx.fillStyle = r.won ? COLOR.good : COLOR.bad; ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText(r.won ? "SERVICE COMPLETE" : (endless ? "CLOSING TIME" : "SHUT DOWN"), VIEW.w / 2, VIEW.h / 2 - 58);
  ctx.fillStyle = COLOR.ink; ctx.font = "15px system-ui, sans-serif";
  const sub = r.won ? "You served all " + WAVES.length + " waves without a shutdown."
    : endless ? "All-you-can-eat — you served " + r.wave + " waves."
    : "The health inspector shut you down at wave " + r.wave + " of " + WAVES.length + ".";
  ctx.fillText(sub, VIEW.w / 2, VIEW.h / 2 - 30);
  ctx.fillText("Dishes eaten: " + r.killed, VIEW.w / 2, VIEW.h / 2 - 8);
  if (endless) { ctx.fillStyle = COLOR.essence; ctx.font = "bold 17px system-ui, sans-serif"; ctx.fillText("★ Score: " + (r.score || 0), VIEW.w / 2, VIEW.h / 2 + 15); }
  ctx.fillStyle = COLOR.essence; ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText("✦ +" + r.essence + " Golden Forks earned", VIEW.w / 2, VIEW.h / 2 + (endless ? 36 : 30));
  const hover = inRect(game.pointer, CONTINUE_BTN);
  ctx.fillStyle = hover ? COLOR.core : "#2b3f66"; roundRect(ctx, CONTINUE_BTN.x, CONTINUE_BTN.y, CONTINUE_BTN.w, CONTINUE_BTN.h, 8); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 15px system-ui, sans-serif"; ctx.textBaseline = "middle";
  ctx.fillText("Continue →", VIEW.w / 2, CONTINUE_BTN.y + CONTINUE_BTN.h / 2); ctx.textBaseline = "alphabetic";
}

function drawMuteButton(ctx) {
  const x = VIEW.w - 44, y = 12;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y, 32, 32);
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
  const x = VIEW.w - 84, y = 12;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y, 32, 32);
  ctx.fillStyle = paused ? COLOR.good : COLOR.core;
  if (paused) {   // play triangle = "resume"
    ctx.beginPath(); ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 25, y + 16); ctx.lineTo(x + 12, y + 24); ctx.closePath(); ctx.fill();
  } else {        // two bars = "pause"
    ctx.fillRect(x + 10, y + 8, 4.5, 16); ctx.fillRect(x + 18, y + 8, 4.5, 16);
  }
}

// Full-board dim + label while paused. Drawn under the toolbar/HUD so the
// interactive UI stays bright — seating and upgrading work while paused.
function drawPausedOverlay(ctx) {
  ctx.fillStyle = "rgba(8,10,15,0.45)"; ctx.fillRect(0, 0, VIEW.w, TOOLBAR.y - 2);
  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.ink; ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText("PAUSED", VIEW.w / 2, VIEW.h / 2 - 40);
  ctx.fillStyle = COLOR.muted; ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("P / Space or tap ▶ to resume — you can still seat & upgrade", VIEW.w / 2, VIEW.h / 2 - 18);
  ctx.textAlign = "left";
}

