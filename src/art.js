/*
  Blue-Plate Special — src/art.js
  Pure drawing functions: every mascot and food, shared cartoon helpers, and
  small glyphs/utility draws. Everything takes a ctx + numbers and draws —
  no game state is read or written here. Style rules: docs/ART_STYLE.md.
*/

// Each enemy is a runaway dish — cheap shapes + one identity feature, distinct in
// silhouette and color. `hurt` flashes the fill white on a non-lethal hit.
// Where the (single) bite lands on each food, in units of r — chosen to sit on the
// actual body (not the legs/edges). The Fry Swarm eats its fries instead, so it's absent.
const BITE_SPOTS = {
  mote:   [0.74, -0.36],   // top of the bun
  runner: [0.5, -0.4],     // top-right bun
  brute:  [0.6, -0.44],    // upper corner of the slab
};
// One bite eaten out of a dish, at a fixed per-food spot; it grows into a bigger
// chunk as HP drops (same corner, larger portion) rather than adding new bites.
// A bright cut-edge highlight keeps it readable even on dark foods.
function drawFoodBites(ctx, typeId, x, y, r, n, edge) {
  const [ux, uy] = BITE_SPOTS[typeId] || [0.66, -0.42];
  const bx = x + ux * r, by = y + uy * r, br = r * (0.3 + 0.2 * (n - 1));   // grows with n
  ctx.save();
  ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000";   // punch a clean round bite
  ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
  ctx.restore();
  const ca = Math.atan2(y - by, x - bx);   // arc facing the food's centre = the exposed cut edge
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath(); ctx.arc(bx, by, br + 0.4, ca - 1.15, ca + 1.15); ctx.stroke();
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.8, r * 0.06);
  ctx.beginPath(); ctx.arc(bx, by, br, ca - 1.3, ca + 1.3); ctx.stroke();
}

function drawFood(ctx, typeId, x, y, r, color, edge, hurt, bites = 0) {
  ctx.save();
  ctx.lineJoin = "round";
  const fill = hurt ? "#ffffff" : color;
  if (typeId === "mote") {
    // Hot Dog — a frankfurter in a bun with a mustard zigzag, on tiny running legs.
    const w = r * 1.22, h = r * 0.6;   // half-extents of the bun
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.92, w * 0.95, r * 0.16, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.3, r * 0.15);   // little legs
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + h * 0.7); ctx.lineTo(x - r * 0.58, y + r * 0.9);
    ctx.moveTo(x + r * 0.5, y + h * 0.7); ctx.lineTo(x + r * 0.58, y + r * 0.9); ctx.stroke();
    ctx.fillStyle = edge; ctx.beginPath();                                                     // feet
    ctx.ellipse(x - r * 0.66, y + r * 0.94, r * 0.2, r * 0.1, 0.2, 0, 7); ctx.ellipse(x + r * 0.66, y + r * 0.94, r * 0.2, r * 0.1, -0.2, 0, 7); ctx.fill();
    if (hurt) { ctx.fillStyle = "#fff"; roundRect(ctx, x - w, y - h, w * 2, h * 2, h); ctx.fill(); }
    else {
      // Bun.
      ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.4, r * 0.16);
      roundRect(ctx, x - w, y - h, w * 2, h * 2, h); ctx.fill(); ctx.stroke();
      ctx.save(); roundRect(ctx, x - w, y - h, w * 2, h * 2, h); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(x, y - h * 0.5, w * 0.82, h * 0.35, 0, 0, 7); ctx.fill();   // bun sheen
      ctx.restore();
      // Sausage nestled in the bun.
      const sw = w * 0.9, sh = h * 0.58, sy = y - h * 0.24;
      const sg = ctx.createLinearGradient(x, sy - sh, x, sy + sh);
      sg.addColorStop(0, "#c9633a"); sg.addColorStop(1, "#8f3b1f");
      ctx.fillStyle = sg; ctx.strokeStyle = "#6e2c14"; ctx.lineWidth = Math.max(1.1, r * 0.1);
      roundRect(ctx, x - sw, sy - sh, sw * 2, sh * 2, sh); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = Math.max(0.9, r * 0.07); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - sw * 0.68, sy - sh * 0.45); ctx.lineTo(x + sw * 0.68, sy - sh * 0.45); ctx.stroke();   // sausage sheen
      // Mustard zigzag.
      ctx.strokeStyle = "#f4c531"; ctx.lineWidth = Math.max(1.2, r * 0.13); ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      const zx0 = x - sw * 0.78, zx1 = x + sw * 0.78, zn = 5;
      for (let i = 0; i <= zn; i++) { const zx = zx0 + (zx1 - zx0) * (i / zn), zy = sy - sh * 0.02 + (i % 2 ? -sh * 0.4 : sh * 0.2); if (i === 0) ctx.moveTo(zx, zy); else ctx.lineTo(zx, zy); }
      ctx.stroke();
    }
  } else if (typeId === "runner") {
    // The Slider — a sleek side-on mini-burger (sesame dome / patty / cheese / bun)
    // leaning into motion, with speed lines behind it (it *slides*, fast and frail).
    const bw = r * 1.05;   // half bun width
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, bw * 1.0, r * 0.16, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.1, r * 0.13);   // speed lines behind
    ctx.beginPath();
    ctx.moveTo(x - bw * 1.35, y - r * 0.3); ctx.lineTo(x - bw * 2.15, y - r * 0.3);
    ctx.moveTo(x - bw * 1.4, y + r * 0.05); ctx.lineTo(x - bw * 2.35, y + r * 0.05);
    ctx.moveTo(x - bw * 1.3, y + r * 0.4); ctx.lineTo(x - bw * 2.0, y + r * 0.4); ctx.stroke();
    if (hurt) { ctx.fillStyle = "#fff"; roundRect(ctx, x - bw, y - r * 0.85, bw * 2, r * 1.7, r * 0.5); ctx.fill(); }
    else {
      // Bottom bun.
      ctx.fillStyle = "#cf9247"; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.3, r * 0.14);
      ctx.beginPath(); ctx.moveTo(x - bw, y + r * 0.32); ctx.quadraticCurveTo(x - bw, y + r * 0.82, x, y + r * 0.82); ctx.quadraticCurveTo(x + bw, y + r * 0.82, x + bw, y + r * 0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Patty (overhangs the buns).
      ctx.fillStyle = "#5a3016"; ctx.strokeStyle = "#3c1f0e"; ctx.lineWidth = Math.max(1.1, r * 0.12);
      roundRect(ctx, x - bw * 1.16, y + r * 0.08, bw * 2.32, r * 0.4, r * 0.18); ctx.fill(); ctx.stroke();
      // Cheese slice with drippy corners.
      ctx.fillStyle = "#f0ad3c"; ctx.strokeStyle = "#b9781d"; ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(x - bw * 1.12, y + r * 0.06); ctx.lineTo(x + bw * 1.12, y + r * 0.06);
      ctx.lineTo(x + bw * 0.95, y + r * 0.34); ctx.lineTo(x + bw * 0.4, y + r * 0.14);
      ctx.lineTo(x - bw * 0.2, y + r * 0.36); ctx.lineTo(x - bw * 0.8, y + r * 0.12); ctx.lineTo(x - bw * 1.12, y + r * 0.28);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Sesame top-bun dome.
      ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.3, r * 0.14);
      ctx.beginPath(); ctx.moveTo(x - bw, y + r * 0.06); ctx.quadraticCurveTo(x - bw * 1.02, y - r * 0.82, x, y - r * 0.82); ctx.quadraticCurveTo(x + bw * 1.02, y - r * 0.82, x + bw, y + r * 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.moveTo(x - bw, y + r * 0.06); ctx.quadraticCurveTo(x - bw * 1.02, y - r * 0.82, x, y - r * 0.82); ctx.quadraticCurveTo(x + bw * 1.02, y - r * 0.82, x + bw, y + r * 0.06); ctx.closePath(); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.42, bw * 0.6, r * 0.24, -0.3, 0, 7); ctx.fill();   // grease shine
      ctx.fillStyle = "#f6dfa8";
      for (const [sx, sy] of [[-0.42, -0.24], [0.02, -0.4], [0.46, -0.22], [-0.16, -0.08]]) { ctx.beginPath(); ctx.ellipse(x + sx * r, y + sy * r, r * 0.1, r * 0.06, 0.3, 0, 7); ctx.fill(); }   // sesame
      ctx.restore();
    }
  } else if (typeId === "brute") {
    // Tough Steak — a big seared cut: irregular slab, cream fat-cap rim, charred
    // cross-hatch grill marks, heavy outline (reads as the big one), stubby legs.
    const sw = r * 1.12, sh = r * 0.82;
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(x, y + r * 1.02, sw * 1.05, r * 0.18, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, r * 0.16);   // short stubby legs
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + sh * 0.85); ctx.lineTo(x - r * 0.54, y + r * 1.0);
    ctx.moveTo(x + r * 0.5, y + sh * 0.85); ctx.lineTo(x + r * 0.54, y + r * 1.0); ctx.stroke();
    ctx.fillStyle = edge; ctx.beginPath();
    ctx.ellipse(x - r * 0.6, y + r * 1.02, r * 0.2, r * 0.1, 0, 0, 7); ctx.ellipse(x + r * 0.6, y + r * 1.02, r * 0.2, r * 0.1, 0, 0, 7); ctx.fill();
    const slab = () => {
      ctx.beginPath();
      ctx.moveTo(x - sw, y - sh * 0.3);
      ctx.quadraticCurveTo(x - sw * 1.05, y - sh, x - sw * 0.4, y - sh * 0.95);
      ctx.quadraticCurveTo(x + sw * 0.1, y - sh * 1.12, x + sw * 0.6, y - sh * 0.85);
      ctx.quadraticCurveTo(x + sw * 1.1, y - sh * 0.68, x + sw, y - sh * 0.05);
      ctx.quadraticCurveTo(x + sw * 1.05, y + sh * 0.72, x + sw * 0.5, y + sh * 0.95);
      ctx.quadraticCurveTo(x - sw * 0.1, y + sh * 1.12, x - sw * 0.6, y + sh * 0.85);
      ctx.quadraticCurveTo(x - sw * 1.1, y + sh * 0.6, x - sw, y - sh * 0.3);
      ctx.closePath();
    };
    if (hurt) { ctx.fillStyle = "#fff"; slab(); ctx.fill(); }
    else {
      const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.2, x, y, r * 1.15);
      g.addColorStop(0, "#8f4634"); g.addColorStop(0.7, fill); g.addColorStop(1, "#5a2417");
      ctx.fillStyle = g; slab(); ctx.fill();
      ctx.save(); slab(); ctx.clip();
      // Charred grill marks (subtle cross-hatch).
      ctx.strokeStyle = "rgba(18,7,3,0.38)"; ctx.lineWidth = Math.max(1.3, r * 0.1); ctx.lineCap = "round";
      for (const o of [-0.55, 0.1, 0.7]) { ctx.beginPath(); ctx.moveTo(x + o * sw - sh * 0.6, y - sh * 0.7); ctx.lineTo(x + o * sw + sh * 0.6, y + sh * 0.7); ctx.stroke(); }
      for (const o of [-0.25, 0.45]) { ctx.beginPath(); ctx.moveTo(x + o * sw - sh * 0.6, y + sh * 0.7); ctx.lineTo(x + o * sw + sh * 0.6, y - sh * 0.7); ctx.stroke(); }
      // Cream fat-cap rim along the top edge.
      ctx.strokeStyle = "#e7d4a4"; ctx.lineWidth = Math.max(2, r * 0.2); ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(x - sw * 0.72, y - sh * 0.72); ctx.quadraticCurveTo(x - sw * 0.1, y - sh * 1.02, x + sw * 0.62, y - sh * 0.78); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.8, r * 0.14); slab(); ctx.stroke();   // outline
    }
  } else if (typeId === "swarm") {
    // Fry Swarm — a red carton of golden fries poking out (many little low-HP fries).
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x, y + r * 1.15, r * 1.1, r * 0.2, 0, 0, 7); ctx.fill();   // shadow
    ctx.strokeStyle = "#8f2a1f"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.1, r * 0.16);   // tiny legs
    ctx.beginPath(); ctx.moveTo(x - r * 0.4, y + r * 0.9); ctx.lineTo(x - r * 0.46, y + r * 1.12);
    ctx.moveTo(x + r * 0.4, y + r * 0.9); ctx.lineTo(x + r * 0.46, y + r * 1.12); ctx.stroke();
    ctx.fillStyle = "#8f2a1f"; ctx.beginPath();
    ctx.ellipse(x - r * 0.54, y + r * 1.14, r * 0.2, r * 0.11, 0, 0, 7); ctx.ellipse(x + r * 0.54, y + r * 1.14, r * 0.2, r * 0.11, 0, 0, 7); ctx.fill();
    // Fries poking out (drawn first; the carton front overlaps their bottoms).
    const fry = (dx, topRel, ang) => {
      ctx.save(); ctx.translate(x + dx * r, y + r * 0.1); ctx.rotate(ang);
      const len = (0.1 - topRel) * r;
      ctx.fillStyle = hurt ? "#fff" : "#f4cf4a"; ctx.strokeStyle = hurt ? "#fff" : "#b8891f"; ctx.lineWidth = Math.max(0.8, r * 0.1);
      roundRect(ctx, -r * 0.14, -len, r * 0.28, len, r * 0.11); ctx.fill(); ctx.stroke();
      if (!hurt) { ctx.fillStyle = "#fbe38a"; roundRect(ctx, -r * 0.14, -len, r * 0.28, len * 0.42, r * 0.11); ctx.fill(); }   // lighter tip
      ctx.restore();
    };
    // Fries get eaten away as HP drops (kept centre-out), instead of a bite-hole.
    const fryList = [[0.0, -0.95, 0.0], [0.18, -1.14, -0.05], [-0.18, -1.22, 0.04], [0.52, -1.0, 0.2], [-0.55, -1.05, -0.22]];
    const fryCount = Math.max(1, 5 - bites * 2);
    for (let i = 0; i < fryCount; i++) fry(fryList[i][0], fryList[i][1], fryList[i][2]);
    // Red carton (trapezoid) with a cream band.
    const topW = r * 2.3, botW = r * 1.5, topY = y - r * 0.12, botY = y + r * 1.02;
    ctx.fillStyle = hurt ? "#fff" : "#d6473a"; ctx.strokeStyle = hurt ? "#fff" : "#8f2a1f"; ctx.lineWidth = Math.max(1.2, r * 0.18); ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(x - topW / 2, topY); ctx.lineTo(x + topW / 2, topY); ctx.lineTo(x + botW / 2, botY); ctx.lineTo(x - botW / 2, botY); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!hurt) {
      ctx.fillStyle = "#f4ece0";
      ctx.beginPath(); ctx.moveTo(x - topW * 0.42, topY + r * 0.34); ctx.lineTo(x + topW * 0.42, topY + r * 0.34); ctx.lineTo(x + botW * 0.42, topY + r * 0.74); ctx.lineTo(x - botW * 0.42, topY + r * 0.74); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - topW / 2, topY); ctx.lineTo(x + topW / 2, topY); ctx.stroke();   // rim shade
    }
  } else {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
  }
  if (bites > 0 && typeId !== "swarm") drawFoodBites(ctx, typeId, x, y, r, bites, edge);   // swarm eats its fries instead
  ctx.restore();
}

// A little 4-point sparkle (camera flash / chef's-kiss shine).
function drawSpark4(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.28, y - s * 0.28); ctx.lineTo(x + s, y);
  ctx.lineTo(x + s * 0.28, y + s * 0.28); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.28, y + s * 0.28);
  ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.28, y - s * 0.28); ctx.closePath(); ctx.fill();
}

/* ---- Customer mascots ------------------------------------------------------
   Each tower is a fully-drawn little diner character with its own body, not a
   shared glyph. Signature color stays the dominant read (shirt/outfit) so towers
   are still tellable apart at ~30px on the belt. Shared face + limb helpers keep
   the per-character code short. Migrated one at a time; not-yet-redesigned towers
   fall through to drawLegacyCustomer below. */
const MDARK = "#0b0e14";       // shared cartoon outline
const SKIN = "#f4c48c";        // customer skin tone (same for all — keeps color as the ID)

// A limb drawn as an outlined capsule: dark underlay + colored top.
function drawLimb(ctx, x1, y1, x2, y2, w, col) {
  ctx.lineCap = "round";
  ctx.strokeStyle = MDARK; ctx.lineWidth = w + 2.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
// A filled, dark-outlined circle.
function fillCircle(ctx, x, y, rad, fill, lw = 1.6) {
  ctx.fillStyle = fill; ctx.strokeStyle = MDARK; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.stroke();
}
// A round cartoon face: catchlight eyes, cheeks, optional grin. Returns nothing.
function drawFace(ctx, cx, hy, headR, opts = {}) {
  const eyeDx = headR * 0.42, eyeY = hy + headR * (opts.eyeUp ? -0.02 : 0.1), eyeR = Math.max(1.3, headR * 0.2);
  if (opts.cheeks !== false) {
    ctx.fillStyle = "rgba(255,140,110,0.34)";
    ctx.beginPath(); ctx.arc(cx - headR * 0.62, eyeY + headR * 0.32, headR * 0.24, 0, 7); ctx.arc(cx + headR * 0.62, eyeY + headR * 0.32, headR * 0.24, 0, 7); ctx.fill();
  }
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.38, eyeR * 0.3, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.38, eyeR * 0.3, 0, 7); ctx.fill();
  if (opts.grin) {
    ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.4, headR * 0.14); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, eyeY + headR * 0.26, headR * 0.42, 0.16 * Math.PI, 0.84 * Math.PI); ctx.stroke();
  }
}

// The Regular (#arrow) — the eager everyman diner: neat hair, a bit of a belly,
// one arm resting, the other raised mid fork-stab.
function drawRegular(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  // Carving Station escalates the fork (bigger at tier 1, a large metal serving
  // fork at tier 2). Only that path touches the fork; Fork Frenzy keeps the
  // everyday utensil. Non-Carving paths pass carveTier 0.
  const carveTier = opts.path === "carvingStation" ? (opts.tier || 0) : 0;
  const shirt = color, hair = "#5b3a21", pants = "#39415a";
  const headR = r * 0.6, hy = cy - r * 0.6, shoulderY = cy - r * 0.02;
  // Seated legs (behind the torso).
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.38, r * 0.38]) { roundRect(ctx, cx + lx - r * 0.25, cy + r * 0.74, r * 0.5, r * 0.7, r * 0.22); ctx.fill(); ctx.stroke(); }
  // Resting arm (our left): shirt upper arm + skin hand on the lap.
  drawLimb(ctx, cx - r * 0.62, shoulderY + r * 0.18, cx - r * 0.58, cy + r * 0.74, r * 0.3, shirt);
  fillCircle(ctx, cx - r * 0.58, cy + r * 0.8, r * 0.19, SKIN);
  // Torso (shirt) — slim build with just a hint of belly.
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.55, cx - r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx, cy + r * 1.28, cx + r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.55, cx + r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.32, cx - r * 0.66, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin bib tucked at the collar (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.1); ctx.lineTo(cx + r * 0.5, cy + r * 0.1); ctx.lineTo(cx, cy + r * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Collar shadow.
  ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = Math.max(1.2, r * 0.1); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, shoulderY - r * 0.05, r * 0.34, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // Neck.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.2, hy + headR * 0.4, r * 0.4, r * 0.5, r * 0.12); ctx.fill(); ctx.stroke();
  // Ears.
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.05, headR * 0.24, SKIN);
  // Head.
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Hair — a neat side-swept cut with a little cowlick and a part on his left.
  ctx.fillStyle = hair; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.96, hy + headR * 0.12);                                                  // left temple
  ctx.quadraticCurveTo(cx - headR * 1.06, hy - headR * 0.92, cx - headR * 0.2, hy - headR * 1.0);     // up and over the top
  ctx.quadraticCurveTo(cx + headR * 0.1, hy - headR * 1.18, cx + headR * 0.42, hy - headR * 0.92);    // cowlick peak
  ctx.quadraticCurveTo(cx + headR * 0.98, hy - headR * 0.72, cx + headR * 0.96, hy - headR * 0.02);   // down the right side
  ctx.quadraticCurveTo(cx + headR * 0.55, hy - headR * 0.24, cx + headR * 0.2, hy - headR * 0.34);    // forehead sweep
  ctx.quadraticCurveTo(cx - headR * 0.02, hy - headR * 0.54, cx - headR * 0.16, hy - headR * 0.26);   // the part
  ctx.quadraticCurveTo(cx - headR * 0.55, hy - headR * 0.12, cx - headR * 0.96, hy + headR * 0.12);   // back to the temple
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Face.
  drawFace(ctx, cx, hy, headR, { grin: true, cheeks: true });
  // Nose — a tiny skin bump.
  fillCircle(ctx, cx, hy + headR * 0.34, headR * 0.13, SKIN, 1);
  // Raised arm + fork (drawn last, on top).
  const sx = cx + r * 0.58, sy = shoulderY + r * 0.14;
  const ex = cx + r * 1.02, ey = cy - r * 0.02;
  const hx2 = cx + r * 1.18, hy2 = hy - r * 0.12;
  drawLimb(ctx, sx, sy, ex, ey, r * 0.32, shirt);   // upper arm (sleeve)
  drawLimb(ctx, ex, ey, hx2, hy2, r * 0.26, SKIN);  // forearm (skin)
  fillCircle(ctx, hx2, hy2, r * 0.24, SKIN);        // fist
  // Fork — a filled metal utensil anchored at the fist: handle, head base, tines,
  // highlight. Carving Station scales it up (fr) and, at tier 2, swaps to a large
  // two-tine serving fork in heavier steel; other paths keep the 3-tine everyday fork.
  const fr = r * (1 + carveTier * 0.42);   // 1.0 / 1.42 / 1.84
  const metal = carveTier >= 2 ? "#c2c9d8" : "#d9dfec";
  const fBot = hy2 - r * 0.04, neck = hy2 - fr * 0.52, headTop = hy2 - fr * 1.02;
  ctx.fillStyle = metal; ctx.strokeStyle = MDARK; ctx.lineWidth = carveTier >= 2 ? 1.4 : 1; ctx.lineJoin = "round";
  roundRect(ctx, hx2 - fr * 0.08, neck - r * 0.02, fr * 0.16, fBot - neck, fr * 0.07); ctx.fill(); ctx.stroke();   // handle
  roundRect(ctx, hx2 - fr * 0.25, neck - fr * 0.13, fr * 0.5, fr * 0.2, fr * 0.06); ctx.fill(); ctx.stroke();      // head base (tines meet here)
  const tines = carveTier >= 2 ? [-fr * 0.16, fr * 0.16] : [-fr * 0.18, 0, fr * 0.18];   // 2 broad tines at tier 2, else 3
  const tineW = carveTier >= 2 ? fr * 0.13 : fr * 0.11;
  for (const dx of tines) { roundRect(ctx, hx2 + dx - tineW / 2, headTop, tineW, (neck - r * 0.02) - headTop, fr * 0.045); ctx.fill(); ctx.stroke(); }   // tines
  ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = Math.max(0.8, r * 0.05); ctx.lineCap = "round";    // handle highlight
  ctx.beginPath(); ctx.moveTo(hx2 - r * 0.02, neck + r * 0.02); ctx.lineTo(hx2 - r * 0.02, fBot - r * 0.06); ctx.stroke();
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx - r * 1.0, hy - r * 0.7, r * 0.4); }
}

// Big Appetite (#cannon) — the round glutton: a huge open mouth, eager eyes, and
// a plate held up, ready to lunge in and take one huge bite (single-target).
function drawBigAppetite(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  // Path escalations: One Big Bite grows the maw (a bigger bite each tier);
  // Speed Eater scatters more crumbs (a fast, messy eater). Other paths keep base.
  const mawTier = opts.path === "oneBigBite" ? (opts.tier || 0) : 0;
  const crumbTier = opts.path === "speedEater" ? (opts.tier || 0) : 0;
  const shirt = color, pants = "#39415a";
  const bodyCy = cy + r * 0.46, bodyRx = r * 1.02, bodyRy = r * 0.98;
  const hy = cy - r * 0.5, headR = r * 0.72;
  // Tiny legs peeking out below the round body.
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.4, r * 0.4]) { roundRect(ctx, cx + lx - r * 0.22, cy + r * 1.16, r * 0.44, r * 0.42, r * 0.18); ctx.fill(); ctx.stroke(); }
  // Round body (shirt).
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, bodyCy, bodyRx, bodyRy, 0, 0, 7); ctx.fill(); ctx.stroke();
  // Arms reaching down to hold a plate in front.
  const lhx = cx - r * 0.82, lhy = cy + r * 0.6, rhx = cx + r * 0.82, rhy = cy + r * 0.6;
  drawLimb(ctx, cx - r * 0.8, bodyCy - r * 0.1, lhx, lhy, r * 0.3, shirt);
  drawLimb(ctx, cx + r * 0.8, bodyCy - r * 0.1, rhx, rhy, r * 0.3, shirt);
  fillCircle(ctx, lhx, lhy, r * 0.2, SKIN); fillCircle(ctx, rhx, rhy, r * 0.2, SKIN);
  // Napkin bib tucked at the chin (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.06); ctx.quadraticCurveTo(cx, cy + r * 0.02, cx + r * 0.5, cy + r * 0.06); ctx.lineTo(cx, cy + r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Plate held up in both hands (empty — waiting for the next dish).
  const plateCy = cy + r * 0.56, plateRx = r * 0.92, plateRy = r * 0.24;
  ctx.fillStyle = "#eef2f8"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, plateCy, plateRx, plateRy, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#d3dae8"; ctx.beginPath(); ctx.ellipse(cx, plateCy - plateRy * 0.16, plateRx * 0.6, plateRy * 0.5, 0, 0, 7); ctx.fill();   // inner well
  ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = Math.max(0.8, r * 0.05);   // rim shine
  ctx.beginPath(); ctx.ellipse(cx, plateCy, plateRx * 0.82, plateRy * 0.7, 0, Math.PI * 1.1, Math.PI * 1.75); ctx.stroke();
  // Big head.
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Rosy chubby cheeks.
  ctx.fillStyle = "rgba(255,140,110,0.4)";
  ctx.beginPath(); ctx.arc(cx - headR * 0.66, hy + headR * 0.24, headR * 0.28, 0, 7); ctx.arc(cx + headR * 0.66, hy + headR * 0.24, headR * 0.28, 0, 7); ctx.fill();
  // Huge open mouth — the identity: dark maw, red interior, a tongue. It snaps shut
  // when `bite` rises (the chomp is now *his* mouth, synced to the lunge).
  const bite = opts.bite || 0;
  const mawScale = 1 + mawTier * 0.22;   // One Big Bite: a bigger maw each tier
  const mCy = hy + headR * 0.34, mRx = headR * 0.46 * mawScale, mRy = headR * 0.42 * mawScale * (1 - bite * 0.82);
  ctx.fillStyle = "#2a0d0d"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, mCy, mRx, mRy, 0, 0, 7); ctx.fill(); ctx.stroke();
  if (bite < 0.6) { ctx.fillStyle = "#d0524f"; ctx.beginPath(); ctx.ellipse(cx, mCy + mRy * 0.42, mRx * 0.66, mRy * 0.42, 0, 0, Math.PI); ctx.fill(); }   // tongue
  ctx.fillStyle = "#f4f7ff";
  ctx.fillRect(cx - mRx * 0.7, mCy - mRy * 0.98, mRx * 1.4, headR * 0.09);   // upper teeth
  if (bite > 0.12) ctx.fillRect(cx - mRx * 0.7, mCy + mRy * 0.98 - headR * 0.09, mRx * 1.4, headR * 0.09);   // lower teeth clamp shut
  // Eager eyes with raised brows, above the mouth.
  const eyeY = hy - headR * 0.24, eyeDx = headR * 0.34, eyeR = Math.max(1.3, headR * 0.17);
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.9, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.9, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.32, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.32, 0, 7); ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.2, headR * 0.1); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - eyeDx - eyeR, eyeY - eyeR * 1.7); ctx.lineTo(cx - eyeDx + eyeR * 0.6, eyeY - eyeR * 1.3);
  ctx.moveTo(cx + eyeDx + eyeR, eyeY - eyeR * 1.7); ctx.lineTo(cx + eyeDx - eyeR * 0.6, eyeY - eyeR * 1.3); ctx.stroke();   // raised brows
  // Speed Eater: crumb specks flung around the fast, messy eater — more each tier
  // (deterministic spots so the contact sheet is stable).
  if (crumbTier > 0) {
    const spots = [[-1.18, 0.25], [1.22, 0.4], [-0.95, 0.9], [1.05, 0.95], [-1.32, 0.62], [1.38, 0.1]];
    const tone = ["#e8c58a", "#c98a45"];
    for (let i = 0; i < crumbTier * 3; i++) { const [sx, sy] = spots[i % spots.length]; fillCircle(ctx, cx + sx * r, cy + sy * r, r * 0.1, tone[i % 2]); }
  }
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 1.15, hy - r * 0.7, r * 0.4); }
}

// The Photographer (#frost) — the artsy diner who makes each dish freeze and pose:
// a beret, cyan shirt, peeking over a big camera raised to their face; the flash
// pops when firing (the slow effect).
function drawPhotographer(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1, firing = !!opts.firing;
  // Long Exposure deepens the lens (a bigger long lens each tier); Paparazzi adds
  // flash bulbs (one flash per dish it freezes). Other paths keep the base camera.
  const expTier = opts.path === "longExposure" ? (opts.tier || 0) : 0;
  const papTier = opts.path === "paparazzi" ? (opts.tier || 0) : 0;
  const shirt = color, pants = "#39415a", hy = cy - r * 0.56, headR = r * 0.6, shoulderY = cy - r * 0.02;
  // Seated legs.
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.38, r * 0.38]) { roundRect(ctx, cx + lx - r * 0.25, cy + r * 0.74, r * 0.5, r * 0.7, r * 0.22); ctx.fill(); ctx.stroke(); }
  // Camera-holding hand positions + arms (behind the camera). Held low at the
  // chest so her face shows above it.
  const camCy = cy + r * 0.04, camW = r * 1.24, camH = r * 0.74;
  const lhx = cx - camW * 0.46, lhy = camCy + camH * 0.34, rhx = cx + camW * 0.46, rhy = camCy + camH * 0.34;
  drawLimb(ctx, cx - r * 0.6, shoulderY + r * 0.2, lhx, lhy, r * 0.28, shirt);
  drawLimb(ctx, cx + r * 0.6, shoulderY + r * 0.2, rhx, rhy, r * 0.28, shirt);
  // Torso (cyan shirt) — slim build.
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.55, cx - r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx, cy + r * 1.28, cx + r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.55, cx + r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.32, cx - r * 0.66, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin bib (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.46, cy + r * 0.12); ctx.lineTo(cx + r * 0.46, cy + r * 0.12); ctx.lineTo(cx, cy + r * 0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Neck + head.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.2, hy + headR * 0.5, r * 0.4, r * 0.5, r * 0.12); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.02, headR * 0.22, SKIN);   // ears
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Small beret cap, tilted, cyan — the artsy signature, sitting high so her forehead shows.
  ctx.fillStyle = color; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.ellipse(cx - headR * 0.1, hy - headR * 0.78, headR * 0.92, headR * 0.4, -0.16, 0, 7); ctx.fill(); ctx.stroke();
  fillCircle(ctx, cx - headR * 0.1, hy - headR * 1.12, headR * 0.11, color, 1.4);   // stem nub
  // Peeking face above the camera: cheeks, eyes, brows, nose.
  const eyeY = hy - headR * 0.06, eyeDx = headR * 0.36, eyeR = Math.max(1.3, headR * 0.19);
  ctx.fillStyle = "rgba(255,140,110,0.36)";
  ctx.beginPath(); ctx.arc(cx - headR * 0.6, hy + headR * 0.32, headR * 0.24, 0, 7); ctx.arc(cx + headR * 0.6, hy + headR * 0.32, headR * 0.24, 0, 7); ctx.fill();
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.85, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.85, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.1, headR * 0.1); ctx.lineCap = "round";   // gentle arched brows
  ctx.beginPath(); ctx.arc(cx - eyeDx, eyeY - eyeR * 1.5, eyeR * 1.1, 1.15 * Math.PI, 1.85 * Math.PI); ctx.arc(cx + eyeDx, eyeY - eyeR * 1.5, eyeR * 1.1, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  fillCircle(ctx, cx, hy + headR * 0.28, headR * 0.1, SKIN, 1);   // nose
  // Camera body (held at the chest).
  ctx.fillStyle = "#2b313b"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - camW / 2, camCy - camH / 2, camW, camH, r * 0.12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.fillRect(cx - camW / 2 + r * 0.06, camCy - camH / 2 + r * 0.08, camW - r * 0.12, r * 0.1);   // cyan accent band
  // Flash bulb (top-left) + shutter viewfinder bump (top-right).
  ctx.fillStyle = "#e9eef6"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  roundRect(ctx, cx - camW * 0.34, camCy - camH / 2 - r * 0.18, r * 0.34, r * 0.2, r * 0.05); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#3b424e"; roundRect(ctx, cx + camW * 0.16, camCy - camH / 2 - r * 0.12, r * 0.26, r * 0.14, r * 0.04); ctx.fill(); ctx.stroke();
  // Lens — big round eye of the camera pointed at the food.
  fillCircle(ctx, cx, camCy + camH * 0.04, r * 0.4, "#171b21", 2);
  fillCircle(ctx, cx, camCy + camH * 0.04, r * 0.27, "#0e3a49", 1.4);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath(); ctx.arc(cx, camCy + camH * 0.04, r * 0.2, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();   // lens glint ring
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(cx - r * 0.1, camCy - camH * 0.04, r * 0.06, 0, 7); ctx.fill();   // highlight dot
  // Long Exposure: overdraw a bigger, deeper long lens (more glass each tier).
  if (expTier > 0) {
    const lensY = camCy + camH * 0.04, lr = r * (0.4 + expTier * 0.13);
    fillCircle(ctx, cx, lensY, lr, "#171b21", 2);
    fillCircle(ctx, cx, lensY, lr * 0.68, "#0e3a49", 1.4);
    fillCircle(ctx, cx, lensY, lr * 0.38, "#12414f", 1);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath(); ctx.arc(cx, lensY, lr * 0.52, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(cx - lr * 0.3, lensY - lr * 0.3, r * 0.06, 0, 7); ctx.fill();
  }
  // Paparazzi: extra flash bulbs across the camera top (one per dish it freezes).
  if (papTier > 0) {
    ctx.fillStyle = "#e9eef6"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
    for (let i = 0; i < papTier; i++) {
      const fx = cx + camW * 0.02 + i * r * 0.32, fy = camCy - camH / 2 - r * 0.22;
      roundRect(ctx, fx, fy, r * 0.26, r * 0.22, r * 0.05); ctx.fill(); ctx.stroke();
    }
  }
  // Hands gripping the camera sides.
  fillCircle(ctx, lhx, lhy, r * 0.19, SKIN); fillCircle(ctx, rhx, rhy, r * 0.19, SKIN);
  // Flash pop when firing.
  if (firing) {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(cx - camW * 0.34 + r * 0.17, camCy - camH / 2 - r * 0.08, r * 0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    drawSpark4(ctx, cx - camW * 0.34 + r * 0.17, camCy - camH / 2 - r * 0.08, r * 0.7);
  }
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 1.05, hy - r * 0.5, r * 0.4); }
}

// The Milkshake Slurper (#sniper) — the fast-drain diner: cradles a grape shake and
// latches a bendy straw onto a nearby dish, sipping it away in a blur of tiny bites.
function drawMilkshakeSlurper(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  // Extra Slurp piles whipped cream on the shake (more damage per sip); Silly Straw
  // adds a second bendy straw (it drains 2 dishes at once). Other paths keep base.
  const slurpTier = opts.path === "extraSlurp" ? (opts.tier || 0) : 0;
  const strawTier = opts.path === "sillyStraw" ? (opts.tier || 0) : 0;
  const shirt = color, pants = "#39415a", shake = "#b487ec", hy = cy - r * 0.58, headR = r * 0.56, shoulderY = cy - r * 0.02;
  // Seated legs.
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.38, r * 0.38]) { roundRect(ctx, cx + lx - r * 0.25, cy + r * 0.74, r * 0.5, r * 0.7, r * 0.22); ctx.fill(); ctx.stroke(); }
  // Arms reaching down to cradle the glass in front.
  const lhx = cx - r * 0.5, lhy = cy + r * 0.62, rhx = cx + r * 0.5, rhy = cy + r * 0.62;
  drawLimb(ctx, cx - r * 0.66, shoulderY + r * 0.18, lhx, lhy, r * 0.28, shirt);
  drawLimb(ctx, cx + r * 0.66, shoulderY + r * 0.18, rhx, rhy, r * 0.28, shirt);
  // Torso (shirt) — slim build.
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.82, cy + r * 0.55, cx - r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx, cy + r * 1.28, cx + r * 0.5, cy + r * 1.14);
  ctx.quadraticCurveTo(cx + r * 0.82, cy + r * 0.55, cx + r * 0.66, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.32, cx - r * 0.66, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin bib (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.42, cy + r * 0.14); ctx.lineTo(cx + r * 0.42, cy + r * 0.14); ctx.lineTo(cx, cy + r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Neck + head.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.2, hy + headR * 0.5, r * 0.4, r * 0.5, r * 0.12); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.05, headR * 0.22, SKIN);   // ears
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Soda-jerk paper cap — a white folded boat hat.
  ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - headR * 1.02, hy - headR * 0.34);
  ctx.quadraticCurveTo(cx - headR * 0.7, hy - headR * 1.16, cx, hy - headR * 1.02);
  ctx.quadraticCurveTo(cx + headR * 0.7, hy - headR * 1.16, cx + headR * 1.02, hy - headR * 0.34);
  ctx.quadraticCurveTo(cx, hy - headR * 0.62, cx - headR * 1.02, hy - headR * 0.34);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, hy - headR * 0.72, headR * 0.12, 0, 7); ctx.fill();   // little cap badge
  // Happy sipping face: catchlight eyes, rosy cheeks, small content smile.
  const eyeY = hy - headR * 0.02, eyeDx = headR * 0.4, eyeR = Math.max(1.3, headR * 0.19);
  ctx.fillStyle = "rgba(255,140,110,0.4)";
  ctx.beginPath(); ctx.arc(cx - headR * 0.64, eyeY + headR * 0.34, headR * 0.24, 0, 7); ctx.arc(cx + headR * 0.64, eyeY + headR * 0.34, headR * 0.24, 0, 7); ctx.fill();
  ctx.fillStyle = MDARK;
  ctx.beginPath(); ctx.ellipse(cx - eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.ellipse(cx + eyeDx, eyeY, eyeR * 0.82, eyeR, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(cx - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.arc(cx + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.3, 0, 7); ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.3, headR * 0.13); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, eyeY + headR * 0.26, headR * 0.24, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();   // small smile
  // ---- Milkshake glass cradled in front (tulip soda glass) ----
  const gTopY = cy + r * 0.14, gBotY = cy + r * 1.12, gTopHalf = r * 0.5, gBotHalf = r * 0.28;
  ctx.fillStyle = shake; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - gTopHalf, gTopY); ctx.lineTo(cx + gTopHalf, gTopY);
  ctx.lineTo(cx + gBotHalf, gBotY); ctx.lineTo(cx - gBotHalf, gBotY); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;   // glass ridges
  for (const f of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(cx + f * gTopHalf * 1.6, gTopY + 2); ctx.lineTo(cx + f * gBotHalf * 1.6, gBotY - 2); ctx.stroke(); }
  // A lighter foam line at the top so the shake reads as full to the rim.
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = Math.max(1, r * 0.09); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - gTopHalf * 0.85, gTopY + r * 0.05); ctx.lineTo(cx + gTopHalf * 0.85, gTopY + r * 0.05); ctx.stroke();
  // Hands cradling the glass.
  fillCircle(ctx, lhx, lhy, r * 0.19, SKIN); fillCircle(ctx, rhx, rhy, r * 0.19, SKIN);
  // Extra Slurp: a whipped-cream dome (+ a cherry at tier 2) mounded on the shake.
  if (slurpTier > 0) {
    const domeR = r * (0.22 + slurpTier * 0.13);
    ctx.fillStyle = "#fff6ea"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.arc(cx, gTopY + r * 0.02, domeR, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (slurpTier >= 2) fillCircle(ctx, cx, gTopY - domeR * 0.72, r * 0.12, "#e5484d", 1.2);   // cherry on top
  }
  // ---- Short straw poking up to his lips (idle sip). The long slurp reaching out
  // to a far dish is the ATTACK, drawn only when firing (attack-visuals pass). ----
  const strawPath = () => {
    ctx.moveTo(cx + r * 0.18, gTopY - r * 0.04);
    ctx.quadraticCurveTo(cx + r * 0.34, cy - r * 0.16, cx + r * 0.2, cy - r * 0.42);
  };
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = MDARK; ctx.lineWidth = r * 0.22; ctx.beginPath(); strawPath(); ctx.stroke();     // outline
  ctx.strokeStyle = "#f4f7fb"; ctx.lineWidth = r * 0.14; ctx.beginPath(); strawPath(); ctx.stroke(); // straw body
  ctx.save(); ctx.strokeStyle = "#e5484d"; ctx.lineWidth = r * 0.05; ctx.setLineDash([r * 0.14, r * 0.14]);   // candy stripe
  ctx.beginPath(); strawPath(); ctx.stroke(); ctx.restore();
  // Silly Straw: a SECOND bendy straw (the double-drain cue), with a silly loop at tier 2.
  if (strawTier > 0) {
    const straw2 = () => { ctx.moveTo(cx - r * 0.16, gTopY - r * 0.04); ctx.quadraticCurveTo(cx - r * 0.34, cy - r * 0.16, cx - r * 0.2, cy - r * 0.42); };
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = MDARK; ctx.lineWidth = r * 0.22; ctx.beginPath(); straw2(); ctx.stroke();
    ctx.strokeStyle = "#f4f7fb"; ctx.lineWidth = r * 0.14; ctx.beginPath(); straw2(); ctx.stroke();
    ctx.save(); ctx.strokeStyle = "#e5484d"; ctx.lineWidth = r * 0.05; ctx.setLineDash([r * 0.14, r * 0.14]); ctx.beginPath(); straw2(); ctx.stroke(); ctx.restore();
    if (strawTier >= 2) {   // a loop-de-loop on the second straw
      ctx.strokeStyle = "#f4f7fb"; ctx.lineWidth = r * 0.13; ctx.beginPath(); ctx.arc(cx - r * 0.34, cy - r * 0.5, r * 0.13, 0, 7); ctx.stroke();
    }
  }
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 0.95, hy - r * 0.5, r * 0.36); }
}

// Dispatch to a per-character mascot; fall back to the legacy glyph for towers
// not yet redesigned. `firing` triggers per-tower attack flourishes (later pass).
// One little kid in the huddle: yellow shirt, party hat, excited grin, arms up.
function drawKid(ctx, kx, ky, kr, shirt, hatColor, armsUp, teen = 0) {
  // Teenage Table stretches each kid into a lanky teen: a touch taller torso + hat,
  // longer arms. The stretch is deliberately gentle — enough to read "the kids grew
  // up" without letting a tier-2 huddle dwarf its neighbors or overhang the booth pad
  // (Issue #82; the old 0.5/0.55/0.6 coefficients made it ~2x every other tower).
  const bodyBot = ky + kr * (1.7 + teen * 0.08), armEnd = ky - kr * (0.28 + teen * 0.12), hatApex = ky - kr * (2.05 + teen * 0.09);
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(kx - kr * 0.92, bodyBot);
  ctx.quadraticCurveTo(kx - kr * 1.02, ky + kr * 0.45, kx, ky + kr * 0.55);
  ctx.quadraticCurveTo(kx + kr * 1.02, ky + kr * 0.45, kx + kr * 0.92, bodyBot);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (armsUp) {
    drawLimb(ctx, kx - kr * 0.66, ky + kr * 0.75, kx - kr * 1.16, armEnd, kr * 0.34, shirt);
    drawLimb(ctx, kx + kr * 0.66, ky + kr * 0.75, kx + kr * 1.16, armEnd, kr * 0.34, shirt);
    fillCircle(ctx, kx - kr * 1.16, armEnd, kr * 0.22, SKIN, 1.2);
    fillCircle(ctx, kx + kr * 1.16, armEnd, kr * 0.22, SKIN, 1.2);
  }
  fillCircle(ctx, kx, ky, kr, SKIN, 1.8);   // head
  // Party hat + pompom (taller on teens).
  ctx.fillStyle = hatColor; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(kx, hatApex); ctx.lineTo(kx - kr * 0.72, ky - kr * 0.72); ctx.lineTo(kx + kr * 0.72, ky - kr * 0.72); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(0.8, kr * 0.12);   // hat zigzag
  ctx.beginPath(); ctx.moveTo(kx - kr * 0.34, ky - kr * 1.1); ctx.lineTo(kx + kr * 0.06, ky - kr * 1.0); ctx.lineTo(kx - kr * 0.14, ky - kr * 0.86); ctx.stroke();
  fillCircle(ctx, kx, hatApex, kr * 0.2, "#fbfcff", 1);   // pompom
  // Face: eyes, rosy cheeks, open excited grin.
  const ex = kr * 0.36, eyy = ky - kr * 0.06, er = Math.max(1, kr * 0.17);
  ctx.fillStyle = "rgba(255,140,110,0.36)";
  ctx.beginPath(); ctx.arc(kx - kr * 0.56, ky + kr * 0.3, kr * 0.18, 0, 7); ctx.arc(kx + kr * 0.56, ky + kr * 0.3, kr * 0.18, 0, 7); ctx.fill();
  ctx.fillStyle = MDARK; ctx.beginPath(); ctx.arc(kx - ex, eyy, er, 0, 7); ctx.arc(kx + ex, eyy, er, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(kx - ex + er * 0.3, eyy - er * 0.4, er * 0.34, 0, 7); ctx.arc(kx + ex + er * 0.3, eyy - er * 0.4, er * 0.34, 0, 7); ctx.fill();
  ctx.fillStyle = "#7a2b2b"; ctx.beginPath(); ctx.ellipse(kx, ky + kr * 0.42, kr * 0.26, kr * 0.2, 0, 0, 7); ctx.fill();
}

// The Kids' Table (#zap) — not one diner but a rowdy huddle of little kids in party
// hats, all grabbing fistfuls at once (fast, cheap, tiny bites).
function drawKidsTable(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1, shirt = color;
  // Teenage Table grows the whole huddle into teenagers; Birthday Party t2 seats a 4th kid.
  const teenTier = opts.path === "teenageTable" ? (opts.tier || 0) : 0;
  const partyTier = opts.path === "birthdayParty" ? (opts.tier || 0) : 0;
  const s = 1 + teenTier * 0.03;  // teens are only a touch bigger — the lanky stretch (not raw scale) sells the age, so the huddle stays within the 42px booth pad (Issue #82)
  drawKid(ctx, cx, cy - r * 0.16, r * 0.5 * s, shirt, color, true, teenTier);              // back-center kid
  drawKid(ctx, cx - r * 0.64, cy + r * 0.34, r * 0.46 * s, shirt, "#ff6bd0", false, teenTier);  // front-left (pink hat)
  drawKid(ctx, cx + r * 0.64, cy + r * 0.34, r * 0.46 * s, shirt, "#7fe0ff", true, teenTier);   // front-right (cyan hat)
  if (partyTier >= 2) drawKid(ctx, cx, cy + r * 0.52, r * 0.44, shirt, "#9be870", true);   // the 4th kid, up front (green hat)
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx + r * 1.05, cy - r * 0.85, r * 0.4); }
}

// The Short-Order Cook (#cook) — art diversification: NOT a seated diner but a
// STATION with a person. A cook in a white toque stands behind a flat-top griddle,
// a red apron (signature color) the dominant read, flipping with a spatula. Griddle
// glow runs hotter on Seasoned Griddle; the spatula grows on Slinging Hash.
function drawShortOrderCook(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const griddleTier = opts.path === "seasonedGriddle" ? (opts.tier || 0) : 0;   // Order Up: hotter griddle
  const hashTier = opts.path === "slingingHash" ? (opts.tier || 0) : 0;         // Rush Ticket: bigger spatula
  const apron = color, whites = "#eef2fb", hair = "#3a2a1c";
  const headR = r * 0.46, hy = cy - r * 0.74, shoulderY = cy - r * 0.18;
  // Back arm resting on the griddle rim (behind the torso).
  drawLimb(ctx, cx - r * 0.5, shoulderY + r * 0.16, cx - r * 0.86, cy + r * 0.42, r * 0.24, whites);
  fillCircle(ctx, cx - r * 0.86, cy + r * 0.46, r * 0.16, SKIN);
  // Torso — white chef's shirt.
  ctx.fillStyle = whites; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.7, cy + r * 0.3, cx - r * 0.58, cy + r * 0.72);
  ctx.lineTo(cx + r * 0.58, cy + r * 0.72);
  ctx.quadraticCurveTo(cx + r * 0.7, cy + r * 0.3, cx + r * 0.6, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.3, cx - r * 0.6, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Red apron (SIGNATURE COLOR) over the shirt — a bib rectangle + skirt.
  ctx.fillStyle = apron; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;
  roundRect(ctx, cx - r * 0.44, cy - r * 0.02, r * 0.88, r * 0.78, r * 0.1); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;   // apron pocket seam
  ctx.beginPath(); ctx.moveTo(cx - r * 0.3, cy + r * 0.42); ctx.lineTo(cx + r * 0.3, cy + r * 0.42); ctx.stroke();
  // Side towel tucked at the apron (tier 1 marker, echoes the napkin-bib convention).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    roundRect(ctx, cx + r * 0.16, cy + r * 0.26, r * 0.2, r * 0.5, r * 0.05); ctx.fill(); ctx.stroke();
  }
  // Neck + head.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.16, hy + headR * 0.5, r * 0.32, r * 0.44, r * 0.1); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.06, headR * 0.22, SKIN);   // ears
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // A red neckerchief under the chin (ties the signature color to the face).
  ctx.fillStyle = apron; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - headR * 0.7, hy + headR * 0.86); ctx.lineTo(cx + headR * 0.7, hy + headR * 0.86); ctx.lineTo(cx, hy + headR * 1.4); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Toque (chef's hat) — a band + a puffy dome.
  ctx.fillStyle = whites; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  roundRect(ctx, cx - headR * 0.92, hy - headR * 0.66, headR * 1.84, headR * 0.62, headR * 0.14); ctx.fill(); ctx.stroke();   // band
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.86, hy - headR * 0.5);
  ctx.quadraticCurveTo(cx - headR * 1.16, hy - headR * 1.7, cx - headR * 0.3, hy - headR * 1.5);
  ctx.quadraticCurveTo(cx, hy - headR * 1.9, cx + headR * 0.3, hy - headR * 1.5);
  ctx.quadraticCurveTo(cx + headR * 1.16, hy - headR * 1.7, cx + headR * 0.86, hy - headR * 0.5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Focused face: eyes, cheeks, a small determined line of a mouth.
  drawFace(ctx, cx, hy, headR, { grin: false, cheeks: true });
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.2, headR * 0.12); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - headR * 0.2, hy + headR * 0.6); ctx.lineTo(cx + headR * 0.28, hy + headR * 0.56); ctx.stroke();
  // ---- Flat-top griddle in FRONT (drawn over the lower torso: he's behind it) ----
  const gY = cy + r * 0.66, gHalf = r * 0.98, gH = r * 0.34;
  ctx.fillStyle = "#3a4150"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // steel body
  roundRect(ctx, cx - gHalf, gY, gHalf * 2, gH, r * 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#20252f";   // dark cooking surface
  roundRect(ctx, cx - gHalf + r * 0.08, gY + r * 0.03, gHalf * 2 - r * 0.16, gH * 0.5, r * 0.05); ctx.fill();
  // Sear glow along the surface — hotter/brighter on Seasoned Griddle.
  const glow = ["rgba(255,150,90,0.5)", "rgba(255,150,90,0.72)", "rgba(255,120,70,0.92)"][griddleTier];
  ctx.strokeStyle = glow; ctx.lineWidth = Math.max(1.4, r * 0.12); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - gHalf * 0.7, gY + r * 0.12); ctx.lineTo(cx + gHalf * 0.7, gY + r * 0.12); ctx.stroke();
  for (const sx of [-gHalf * 0.4, gHalf * 0.35]) fillCircle(ctx, cx + sx, gY + r * 0.12, r * 0.07, "#ffcf9c", 1);   // sizzling dishes
  // Legs of the station.
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.6, r * 0.12);
  for (const lx of [-gHalf * 0.8, gHalf * 0.8]) { ctx.beginPath(); ctx.moveTo(cx + lx, gY + gH); ctx.lineTo(cx + lx, gY + gH + r * 0.4); ctx.stroke(); }
  // Front arm raised, flipping — a spatula (grows on Slinging Hash).
  const sr = r * (0.9 + hashTier * 0.28);
  const sx0 = cx + r * 0.5, sy0 = shoulderY + r * 0.12, hx = cx + r * 0.92, hyy = cy - r * 0.34;
  drawLimb(ctx, sx0, sy0, hx, hyy, r * 0.24, whites);
  fillCircle(ctx, hx, hyy, r * 0.17, SKIN);
  ctx.save(); ctx.translate(hx, hyy); ctx.rotate(-0.5);
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.6, r * 0.1);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -sr * 0.8); ctx.stroke();   // spatula handle
  ctx.fillStyle = "#c2c9d8"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  roundRect(ctx, -sr * 0.26, -sr * 1.24, sr * 0.52, sr * 0.44, sr * 0.08); ctx.fill(); ctx.stroke();   // spatula blade
  ctx.restore();
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx - r * 1.02, hy - r * 0.5, r * 0.4); }
}

// The Competitive Eater (#eater) — Slurper-derived table dressing, varied: a lean
// pro seated at a CONTEST table with a water cup and a stack of cleared plates. The
// green shirt (signature color) is the read; open, determined mouth mid-bite.
function drawCompetitiveEater(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const pace = opts.path === "recordPace" ? (opts.tier || 0) : 0;   // Mustard Belt: a belt buckle
  const dunk = opts.path === "waterDunk" ? (opts.tier || 0) : 0;    // Solomon Method: bigger water cup
  const shirt = color, pants = "#39415a", hy = cy - r * 0.58, headR = r * 0.52, shoulderY = cy - r * 0.02;
  // Seated legs.
  ctx.fillStyle = pants; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  for (const lx of [-r * 0.36, r * 0.36]) { roundRect(ctx, cx + lx - r * 0.24, cy + r * 0.74, r * 0.48, r * 0.7, r * 0.22); ctx.fill(); ctx.stroke(); }
  // Arms down to the table in front.
  const lhx = cx - r * 0.52, lhy = cy + r * 0.6, rhx = cx + r * 0.52, rhy = cy + r * 0.6;
  drawLimb(ctx, cx - r * 0.62, shoulderY + r * 0.18, lhx, lhy, r * 0.26, shirt);
  drawLimb(ctx, cx + r * 0.62, shoulderY + r * 0.18, rhx, rhy, r * 0.26, shirt);
  // Torso — lean build (narrower than the other seated diners).
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.56, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.55, cx - r * 0.44, cy + r * 1.12);
  ctx.quadraticCurveTo(cx, cy + r * 1.22, cx + r * 0.44, cy + r * 1.12);
  ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.55, cx + r * 0.56, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.3, cx - r * 0.56, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Napkin bib (level 2+).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.4, cy + r * 0.12); ctx.lineTo(cx + r * 0.4, cy + r * 0.12); ctx.lineTo(cx, cy + r * 0.58); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Mustard Belt (Record Pace t2): a champion's belt buckle at the waist.
  if (pace >= 2) {
    ctx.fillStyle = "#ffcf4a"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
    roundRect(ctx, cx - r * 0.2, cy + r * 0.62, r * 0.4, r * 0.26, r * 0.06); ctx.fill(); ctx.stroke();
  }
  // Neck + head.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.18, hy + headR * 0.5, r * 0.36, r * 0.46, r * 0.12); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.05, headR * 0.2, SKIN);   // ears
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  // Short athletic hair.
  ctx.fillStyle = "#2f2418"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.98, hy - headR * 0.06);
  ctx.quadraticCurveTo(cx - headR * 0.5, hy - headR * 1.12, cx, hy - headR * 1.02);
  ctx.quadraticCurveTo(cx + headR * 0.5, hy - headR * 1.12, cx + headR * 0.98, hy - headR * 0.06);
  ctx.quadraticCurveTo(cx + headR * 0.5, hy - headR * 0.5, cx, hy - headR * 0.46);
  ctx.quadraticCurveTo(cx - headR * 0.5, hy - headR * 0.5, cx - headR * 0.98, hy - headR * 0.06);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Determined face: eyes + cheeks, and a big open mouth mid-bite (an O).
  drawFace(ctx, cx, hy, headR, { grin: false, cheeks: true });
  ctx.fillStyle = "#7a2b2b"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(cx, hy + headR * 0.5, headR * 0.26, headR * 0.32, 0, 0, 7); ctx.fill(); ctx.stroke();
  // ---- Contest table dressing in front: a stack of cleared plates + a water cup ----
  // Plate stack (empties = the combo he's built).
  const pY = cy + r * 0.92;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? "#e7ecf5" : "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cx - r * 0.5, pY - i * r * 0.14, r * 0.42, r * 0.13, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  // Water cup (bigger on Water Dunk) — the signature prop.
  const cupH = r * (0.5 + dunk * 0.16), cupW = r * (0.34 + dunk * 0.08), cupX = cx + r * 0.55, cupTop = cy + r * 0.5;
  ctx.fillStyle = "#bfe3f0"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cupX - cupW / 2, cupTop); ctx.lineTo(cupX + cupW / 2, cupTop);
  ctx.lineTo(cupX + cupW * 0.38, cupTop + cupH); ctx.lineTo(cupX - cupW * 0.38, cupTop + cupH); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(1, r * 0.08); ctx.lineCap = "round";   // water line
  ctx.beginPath(); ctx.moveTo(cupX - cupW * 0.36, cupTop + r * 0.1); ctx.lineTo(cupX + cupW * 0.36, cupTop + r * 0.1); ctx.stroke();
  // Hands at the table.
  fillCircle(ctx, lhx, lhy, r * 0.17, SKIN); fillCircle(ctx, rhx, rhy, r * 0.17, SKIN);
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx - r * 1.02, hy - r * 0.62, r * 0.4); }
}

// The Pitmaster (#pit) — a STATION with a person (the cook precedent): a lone
// obsessive in a hickory-brown shirt (signature color) + BBQ cap stands behind a
// LONG offset smoker — wide shallow barrel, firebox, chimney puffing away. The
// Stall path thickens the chimney smoke; Competition Rub adds a rub shaker.
function drawPitmaster(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const stallTier = opts.path === "theStall" ? (opts.tier || 0) : 0;
  const hogTier = opts.path === "wholeHog" ? (opts.tier || 0) : 0;
  const shirt = color, headR = r * 0.44, hy = cy - r * 0.72, shoulderY = cy - r * 0.2;
  // Torso — hickory shirt, sleeves rolled.
  ctx.fillStyle = shirt; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.54, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.62, cy + r * 0.3, cx - r * 0.5, cy + r * 0.66);
  ctx.lineTo(cx + r * 0.5, cy + r * 0.66);
  ctx.quadraticCurveTo(cx + r * 0.62, cy + r * 0.3, cx + r * 0.54, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.28, cx - r * 0.54, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Side towel (tier-1 marker, the station convention).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    roundRect(ctx, cx - r * 0.42, cy + r * 0.2, r * 0.2, r * 0.44, r * 0.05); ctx.fill(); ctx.stroke();
  }
  // Neck + head, patient half-lidded focus.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.15, hy + headR * 0.5, r * 0.3, r * 0.42, r * 0.1); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.06, headR * 0.2, SKIN);
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  drawFace(ctx, cx, hy, headR, { grin: true, cheeks: true });
  // BBQ cap (brown crown + brim) — the lone-obsessive read.
  ctx.fillStyle = "#6e4522"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(cx, hy - headR * 0.3, headR * 0.88, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  roundRect(ctx, cx - headR * 1.18, hy - headR * 0.42, headR * 1.5, headR * 0.28, headR * 0.1); ctx.fill(); ctx.stroke();
  // Basting mop in the raised hand.
  const mhx = cx + r * 0.84, mhy = cy - r * 0.4;
  drawLimb(ctx, cx + r * 0.46, shoulderY + r * 0.14, mhx, mhy, r * 0.22, shirt);
  fillCircle(ctx, mhx, mhy, r * 0.15, SKIN);
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(mhx, mhy); ctx.lineTo(mhx + r * 0.26, mhy - r * 0.5); ctx.stroke();
  fillCircle(ctx, mhx + r * 0.3, mhy - r * 0.58, r * 0.14, "#f4f7ff", 1.4);   // mop head
  // ---- The long offset smoker in FRONT (wide, shallow) ----
  const sY = cy + r * 0.6, sHalf = r * 1.06, sH = r * 0.42;
  ctx.fillStyle = "#2f333d"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // barrel
  roundRect(ctx, cx - sHalf, sY, sHalf * 2, sH, r * 0.2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1;           // lid seam
  ctx.beginPath(); ctx.moveTo(cx - sHalf + r * 0.1, sY + sH * 0.42); ctx.lineTo(cx + sHalf - r * 0.1, sY + sH * 0.42); ctx.stroke();
  // Lid handle + firebox on the right end.
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.4, r * 0.09);
  ctx.beginPath(); ctx.moveTo(cx - r * 0.3, sY + sH * 0.2); ctx.lineTo(cx + r * 0.3, sY + sH * 0.2); ctx.stroke();
  ctx.fillStyle = "#3c2f26"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;
  roundRect(ctx, cx + sHalf - r * 0.16, sY + sH * 0.3, r * 0.42, sH * 0.72, r * 0.08); ctx.fill(); ctx.stroke();
  fillCircle(ctx, cx + sHalf + r * 0.05, sY + sH * 0.66, r * 0.07, "#ff9a5c", 1);   // ember glow
  // Chimney on the left end + smoke curls (thicker on The Stall).
  ctx.fillStyle = "#2f333d"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;
  roundRect(ctx, cx - sHalf - r * 0.06, sY - r * 0.46, r * 0.22, r * 0.5, r * 0.05); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#9aa2ad"; ctx.lineWidth = Math.max(1.3, r * 0.09); ctx.lineCap = "round"; ctx.globalAlpha = 0.8;
  const puffs = 1 + Math.min(2, stallTier);
  for (let i = 0; i < puffs; i++) {
    const px = cx - sHalf + r * 0.05, py = sY - r * (0.56 + i * 0.26);
    ctx.beginPath(); ctx.moveTo(px - r * 0.08, py + r * 0.08);
    ctx.quadraticCurveTo(px + r * 0.14, py, px - r * 0.04, py - r * 0.1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Whole Hog: a spice shaker sitting on the lid (the bigger-pit path's prop).
  if (hogTier >= 1) {
    ctx.fillStyle = "#ffcf4a"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.3;
    roundRect(ctx, cx + r * 0.42, sY - r * 0.24, r * 0.2, r * 0.26, r * 0.05); ctx.fill(); ctx.stroke();
  }
  // Station legs.
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.6, r * 0.12);
  for (const lx of [-sHalf * 0.78, sHalf * 0.78]) { ctx.beginPath(); ctx.moveTo(cx + lx, sY + sH); ctx.lineTo(cx + lx, sY + sH + r * 0.34); ctx.stroke(); }
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx - r * 1.0, hy - r * 0.5, r * 0.4); }
}

// The Syrup Slinger (internal id `ranch`, frozen) — a TALL prop with a tiny
// person: a three-tier fountain cascading MAPLE SYRUP (signature amber, the
// Tower Rework recolor), tended by a small superfan. Small footprint, tall
// silhouette. Quick Pour thickens the cascade; The Big Bottle t2 mounts the
// jug on top.
function drawRanchFountain(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const pourTier = opts.path === "quickPour" ? (opts.tier || 0) : 0;
  const bottleTier = opts.path === "bigBottle" ? (opts.tier || 0) : 0;
  const syrup = color, basin = "#c9d2de", fx = cx - r * 0.2;   // fountain sits left-of-center; the fan stands right
  // Basin (bottom) + two upper tiers, narrowing.
  ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  const tiers = [
    { y: cy + r * 0.66, w: r * 1.0, h: r * 0.3 },
    { y: cy + r * 0.06, w: r * 0.62, h: r * 0.24 },
    { y: cy - r * 0.5, w: r * 0.38, h: r * 0.2 },
  ];
  for (const tr of tiers) {
    ctx.fillStyle = basin;
    ctx.beginPath(); ctx.ellipse(fx, tr.y, tr.w, tr.h, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = syrup;   // pooled syrup on each tier
    ctx.beginPath(); ctx.ellipse(fx, tr.y - tr.h * 0.28, tr.w * 0.82, tr.h * 0.62, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  // Pedestal columns between tiers + the cascade (thicker on Extra Dressing).
  ctx.fillStyle = basin;
  roundRect(ctx, fx - r * 0.09, cy - r * 0.5, r * 0.18, r * 0.5, r * 0.05); ctx.fill(); ctx.stroke();
  roundRect(ctx, fx - r * 0.11, cy + r * 0.1, r * 0.22, r * 0.5, r * 0.05); ctx.fill(); ctx.stroke();
  const flow = Math.max(1.6, r * (0.1 + pourTier * 0.05));
  ctx.strokeStyle = syrup; ctx.lineWidth = flow; ctx.lineCap = "round";
  for (const [x0, y0, y1] of [[fx - r * 0.3, cy - r * 0.44, cy + r * 0.0], [fx + r * 0.3, cy - r * 0.44, cy + r * 0.0], [fx - r * 0.5, cy + r * 0.14, cy + r * 0.6], [fx + r * 0.5, cy + r * 0.14, cy + r * 0.6]]) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 * 1.01, (y0 + y1) / 2, x0, y1); ctx.stroke();
  }
  ctx.strokeStyle = MDARK;
  // Top spout: a nozzle jet — or the big syrup JUG at The Big Bottle t2.
  if (bottleTier >= 2) {
    ctx.fillStyle = "#8f99ab"; ctx.lineWidth = 1.8;
    roundRect(ctx, fx - r * 0.24, cy - r * 1.04, r * 0.48, r * 0.4, r * 0.1); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;   // keg hoops
    ctx.beginPath(); ctx.moveTo(fx - r * 0.24, cy - r * 0.94); ctx.lineTo(fx + r * 0.24, cy - r * 0.94); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx - r * 0.24, cy - r * 0.74); ctx.lineTo(fx + r * 0.24, cy - r * 0.74); ctx.stroke();
  } else {
    ctx.fillStyle = syrup; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(fx, cy - r * 0.78, r * (0.1 + bottleTier * 0.05), r * 0.16, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  // The superfan: a small figure at the basin's right, arms up in awe — the
  // tee ties them to the signature color.
  const fnx = cx + r * 0.66, fny = cy + r * 0.42, fheadR = r * 0.22;
  drawLimb(ctx, fnx - r * 0.14, fny + r * 0.1, fnx - r * 0.34, fny - r * 0.16, r * 0.14, syrup);
  drawLimb(ctx, fnx + r * 0.14, fny + r * 0.1, fnx + r * 0.34, fny - r * 0.16, r * 0.14, syrup);
  ctx.fillStyle = syrup; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;
  roundRect(ctx, fnx - r * 0.2, fny, r * 0.4, r * 0.5, r * 0.12); ctx.fill(); ctx.stroke();
  fillCircle(ctx, fnx, fny - fheadR * 0.6, fheadR, SKIN, 1.8);
  drawFace(ctx, fnx, fny - fheadR * 0.6, fheadR, { grin: true, cheeks: true });
  // Napkin bib on the superfan (tier-1 marker).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fnx - r * 0.14, fny + r * 0.06); ctx.lineTo(fnx + r * 0.14, fny + r * 0.06); ctx.lineTo(fnx, fny + r * 0.26); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, fx + r * 0.5, cy - r * 0.94, r * 0.4); }
}

// The Sample Lady (#sample) — a DEMO CART with a person: hairnet + pink vest
// (signature color), one toothpick sample held out, a tray of flagged samples
// on the cart. Happy Hour stacks a second tray (samples for everyone); On the
// House raises a bigger flag on the offered toothpick (the value-tag path).
// She never attacks (pure support) — the held-out sample bobs gently on
// opts.idle so the sampling stays alive as pure flavor.
function drawSampleLady(ctx, cx, cy, r, color, opts) {
  const level = opts.level || 1;
  const trayTier = opts.path === "happyHour" ? (opts.tier || 0) : 0;
  const flagTier = opts.path === "onTheHouse" ? (opts.tier || 0) : 0;
  const vest = color, blouse = "#f4f7fb", headR = r * 0.44, hy = cy - r * 0.7, shoulderY = cy - r * 0.18;
  // Torso: white blouse under the pink demo vest.
  ctx.fillStyle = blouse; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.52, shoulderY);
  ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.3, cx - r * 0.48, cy + r * 0.64);
  ctx.lineTo(cx + r * 0.48, cy + r * 0.64);
  ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.3, cx + r * 0.52, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - r * 0.26, cx - r * 0.52, shoulderY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = vest; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;   // vest panels
  roundRect(ctx, cx - r * 0.44, shoulderY + r * 0.02, r * 0.3, r * 0.72, r * 0.08); ctx.fill(); ctx.stroke();
  roundRect(ctx, cx + r * 0.14, shoulderY + r * 0.02, r * 0.3, r * 0.72, r * 0.08); ctx.fill(); ctx.stroke();
  // Side towel (tier-1 marker, station convention).
  if (level >= 2) {
    ctx.fillStyle = "#f4f7ff"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
    roundRect(ctx, cx - r * 0.1, cy + r * 0.3, r * 0.2, r * 0.36, r * 0.05); ctx.fill(); ctx.stroke();
  }
  // Neck + head with a hairnet bun + welcoming grin.
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.15, hy + headR * 0.5, r * 0.3, r * 0.42, r * 0.1); ctx.fill(); ctx.stroke();
  for (const ex of [-headR, headR]) fillCircle(ctx, cx + ex, hy + headR * 0.06, headR * 0.2, SKIN);
  fillCircle(ctx, cx, hy, headR, SKIN, 2);
  drawFace(ctx, cx, hy, headR, { grin: true, cheeks: true });
  ctx.fillStyle = "#8b8f98"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.6;   // hairnet dome + bun
  ctx.beginPath(); ctx.arc(cx, hy - headR * 0.28, headR * 0.86, Math.PI * 1.02, -Math.PI * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  fillCircle(ctx, cx, hy - headR * 1.06, headR * 0.3, "#8b8f98", 1.4);
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 0.8;   // net cross-hatch
  for (const dx of [-headR * 0.5, 0, headR * 0.5]) { ctx.beginPath(); ctx.moveTo(cx + dx, hy - headR * 0.9); ctx.lineTo(cx + dx * 0.6, hy - headR * 0.3); ctx.stroke(); }
  // The offered toothpick — held out front with a gentle welcoming bob (pure
  // flavor: deterministic, elapsed-driven), flag bigger on On the House.
  const ohx = cx + r * 0.78, ohy = cy - r * 0.32 + Math.sin((opts.idle || 0) * 2.4) * r * 0.06;
  drawLimb(ctx, cx + r * 0.44, shoulderY + r * 0.12, ohx, ohy, r * 0.2, blouse);
  fillCircle(ctx, ohx, ohy, r * 0.14, SKIN);
  ctx.strokeStyle = MDARK; ctx.lineWidth = Math.max(1.2, r * 0.07); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ohx, ohy); ctx.lineTo(ohx + r * 0.12, ohy - r * 0.42); ctx.stroke();
  fillCircle(ctx, ohx + r * 0.1, ohy - r * 0.34, r * 0.09, "#c98a45", 1.2);   // the sample cube
  const flagW = r * (0.24 + flagTier * 0.1);
  ctx.fillStyle = "#ffcf4a"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ohx + r * 0.12, ohy - r * 0.42); ctx.lineTo(ohx + r * 0.12 + flagW, ohy - r * 0.36); ctx.lineTo(ohx + r * 0.12, ohy - r * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
  // ---- The demo cart in FRONT ----
  const cartY = cy + r * 0.58, cartHalf = r * 0.86, cartH = r * 0.34;
  ctx.fillStyle = "#e7ecf5"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, cx - cartHalf, cartY, cartHalf * 2, cartH, r * 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = vest;   // vest-pink skirt band on the cart
  roundRect(ctx, cx - cartHalf, cartY + cartH * 0.55, cartHalf * 2, cartH * 0.45, r * 0.06); ctx.fill(); ctx.stroke();
  // Sample tray(s) on the cart: little cubes + toothpick flags (a second stack on Costco Saturday).
  const trays = 1 + Math.min(1, trayTier);
  for (let tIdx = 0; tIdx < trays; tIdx++) {
    const txc = cx - r * 0.34 + tIdx * r * 0.62, tyc = cartY - r * 0.08 - tIdx * r * 0.04;
    ctx.fillStyle = "#c9d2de"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.3;
    roundRect(ctx, txc - r * 0.26, tyc, r * 0.52, r * 0.12, r * 0.03); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const sxp = txc - r * 0.16 + i * r * 0.16;
      fillCircle(ctx, sxp, tyc - r * 0.02, r * 0.05, "#c98a45", 1);
      ctx.strokeStyle = MDARK; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(sxp, tyc - r * 0.05); ctx.lineTo(sxp, tyc - r * 0.2); ctx.stroke();
      ctx.fillStyle = "#ffcf4a";
      ctx.beginPath(); ctx.moveTo(sxp, tyc - r * 0.2); ctx.lineTo(sxp + r * 0.09, tyc - r * 0.17); ctx.lineTo(sxp, tyc - r * 0.14); ctx.closePath(); ctx.fill();
    }
  }
  // Cart wheels.
  for (const wx of [-cartHalf * 0.7, cartHalf * 0.7]) fillCircle(ctx, cx + wx, cartY + cartH + r * 0.1, r * 0.11, "#3a4150", 1.6);
  if (level >= 3) { ctx.fillStyle = "#fff2b0"; drawSpark4(ctx, cx - r * 1.0, hy - r * 0.5, r * 0.4); }
}

// Dispatch to a per-character mascot. Every tower id is a full mascot now.
function drawCustomer(ctx, typeId, cx, cy, r, color, opts = {}) {
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (typeId === "cannon") drawBigAppetite(ctx, cx, cy, r, color, opts);
  else if (typeId === "frost") drawPhotographer(ctx, cx, cy, r, color, opts);
  else if (typeId === "sniper") drawMilkshakeSlurper(ctx, cx, cy, r, color, opts);
  else if (typeId === "zap") drawKidsTable(ctx, cx, cy, r, color, opts);
  else if (typeId === "cook") drawShortOrderCook(ctx, cx, cy, r, color, opts);
  else if (typeId === "eater") drawCompetitiveEater(ctx, cx, cy, r, color, opts);
  else if (typeId === "pit") drawPitmaster(ctx, cx, cy, r, color, opts);
  else if (typeId === "ranch") drawRanchFountain(ctx, cx, cy, r, color, opts);
  else if (typeId === "sample") drawSampleLady(ctx, cx, cy, r, color, opts);
  else drawRegular(ctx, cx, cy, r, color, opts);   // arrow (default)
  ctx.restore();
}

// A cartoon kid hand reaching in toward (p.x,p.y) from p.angle and clenching:
// fingers start splayed and long, then curl short as it grabs.
function drawGrabHand(ctx, p) {
  const prog = 1 - p.life / p.maxLife;                 // 0 approach -> 1 clenched
  const reach = (1 - prog) * p.r * 1.3 + p.r * 0.3;    // hand moves in as it grabs
  const hx = p.x + Math.cos(p.angle) * reach, hy = p.y + Math.sin(p.angle) * reach;
  const toward = Math.atan2(p.y - hy, p.x - hx);
  const palmR = Math.max(2.4, p.r * 0.42);
  const spread = 0.6 - prog * 0.42, fLen = palmR * (1.6 - prog * 0.8);
  ctx.globalAlpha = p.life < p.maxLife * 0.35 ? p.life / (p.maxLife * 0.35) : 1;
  ctx.lineCap = "round";
  // A small arm reaching in from the side (behind the hand): yellow sleeve then a
  // skin forearm, so it reads as a kid grabbing rather than a floating hand.
  const armLen = p.r * 1.1;
  const ex = hx + Math.cos(p.angle) * armLen, ey = hy + Math.sin(p.angle) * armLen;
  const mx = hx + Math.cos(p.angle) * armLen * 0.5, my = hy + Math.sin(p.angle) * armLen * 0.5;
  ctx.strokeStyle = MDARK; ctx.lineWidth = palmR * 0.98; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = palmR * 0.74; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(mx, my); ctx.stroke();       // sleeve
  ctx.strokeStyle = SKIN; ctx.lineWidth = palmR * 0.74; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(hx, hy); ctx.stroke();           // forearm
  for (const off of [-1.5, -0.5, 0.5, 1.5]) {          // four fingers curling toward the dish
    const fa = toward + off * spread, fx = hx + Math.cos(fa) * fLen, fy = hy + Math.sin(fa) * fLen;
    ctx.strokeStyle = MDARK; ctx.lineWidth = palmR * 0.66; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = SKIN; ctx.lineWidth = palmR * 0.44; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
  }
  ctx.fillStyle = SKIN; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(hx, hy, palmR, 0, 7); ctx.fill(); ctx.stroke();   // palm
  ctx.fillStyle = "#ffe08a";                                                 // little kid sleeve cuff
  ctx.beginPath(); ctx.arc(hx - Math.cos(toward) * palmR * 0.95, hy - Math.sin(toward) * palmR * 0.95, palmR * 0.55, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
}

/* ---- Diner obstacles (Issue #65) ----------------------------------------
   Set dressing that blocks tower PLACEMENT (engine canPlace) and nothing else
   — no line-of-sight in this game. Drawn dimmer than units (furniture, not
   actors): floor-adjacent bodies, muted accents, MDARK outlines. Each prop
   scales off its balance.json rect (x/y/w/h) so layouts stay data-driven. */

// `pal` is the active map's theme.props palette (undefined for the diner, whose
// drawers then use their original hardcoded colors → byte-identical). Blue-Plate
// passes the retro palette to recolor the shared props + draw its new ones.
function drawObstacle(ctx, o, pal = {}) {
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // Shared grounding shadow, like the foods' soft ellipse.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h - 1, o.w * 0.5, Math.max(4, o.h * 0.07), 0, 0, 7); ctx.fill();
  if (o.kind === "jukebox") drawJukebox(ctx, o.x, o.y, o.w, o.h, pal);
  else if (o.kind === "counter") drawCounterIsland(ctx, o.x, o.y, o.w, o.h);
  else if (o.kind === "booths") drawBoothBank(ctx, o.x, o.y, o.w, o.h, pal);
  else if (o.kind === "dessert") drawDessertCase(ctx, o.x, o.y, o.w, o.h, pal);
  else if (o.kind === "mopbucket") drawMopBucket(ctx, o.x, o.y, o.w, o.h);
  else if (o.kind === "kitchen") drawKitchen(ctx, o.x, o.y, o.w, o.h, pal);
  else if (o.kind === "register") drawRegister(ctx, o.x, o.y, o.w, o.h, pal);
  else if (o.kind === "counterStools") drawCounterStools(ctx, o.x, o.y, o.w, o.h, pal);
  else if (o.kind === "prep") drawPrep(ctx, o.x, o.y, o.w, o.h, pal);
  else {
    // Unknown kind: a plain crate, so a data typo shows up instead of vanishing.
    ctx.fillStyle = "#2c3543"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
    roundRect(ctx, o.x + 2, o.y + 2, o.w - 4, o.h - 4, 6); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// Arch-top jukebox against the wall: dark record window with a warm glow arc,
// bubble-tube shoulders, speaker grille below.
function drawJukebox(ctx, x, y, w, h, pal = {}) {
  const bodyCol = pal.jukeboxBody || "#5c4030", glowCol = pal.jukeboxAccent || "#e8a04c";
  const r = w * 0.42;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(x + 2, y + h - 2);
    ctx.lineTo(x + 2, y + r);
    ctx.arcTo(x + 2, y + 2, x + w / 2, y + 2, r);
    ctx.arcTo(x + w - 2, y + 2, x + w - 2, y + r, r);
    ctx.lineTo(x + w - 2, y + h - 2);
    ctx.closePath();
  };
  ctx.fillStyle = bodyCol; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  body(); ctx.fill(); ctx.stroke();
  // Blue-Plate flourish (pal only, so the diner is untouched): a bright arch cap
  // + a colored base band, the 50s look.
  if (pal.jukeboxTop) {
    ctx.save(); body(); ctx.clip();
    ctx.fillStyle = pal.jukeboxTop; ctx.fillRect(x, y, w, h * 0.24);
    ctx.fillStyle = pal.jukeboxBase || "#2FB4A6"; ctx.fillRect(x, y + h - h * 0.14, w, h * 0.14);
    ctx.restore();
    ctx.strokeStyle = MDARK; ctx.lineWidth = 2; body(); ctx.stroke();
  }
  // Record window (inner arch) + spinning record + glow arc.
  const wx = x + 10, ww = w - 20, wy = y + 9, wr = ww * 0.5, wb = y + h * 0.54;
  ctx.beginPath();
  ctx.moveTo(wx, wb); ctx.lineTo(wx, wy + wr);
  ctx.arcTo(wx, wy, x + w / 2, wy, wr);
  ctx.arcTo(wx + ww, wy, wx + ww, wy + wr, wr);
  ctx.lineTo(wx + ww, wb); ctx.closePath();
  ctx.fillStyle = "#1a1420"; ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4; ctx.stroke();
  fillCircle(ctx, x + w / 2, y + h * 0.35, w * 0.13, "#241c2e", 1.1);
  fillCircle(ctx, x + w / 2, y + h * 0.35, w * 0.045, glowCol, 1);
  ctx.strokeStyle = glowCol; ctx.globalAlpha = 0.65; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.37, w * 0.23, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.globalAlpha = 1;
  // Bubble tubes along the shoulders.
  ctx.strokeStyle = "#a6733f"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 5.5, y + h * 0.56); ctx.lineTo(x + 5.5, y + r * 0.95); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - 5.5, y + h * 0.56); ctx.lineTo(x + w - 5.5, y + r * 0.95); ctx.stroke();
  // Speaker grille with vertical slats.
  ctx.fillStyle = "#3a2c20"; roundRect(ctx, x + 8, y + h * 0.62, w - 16, h * 0.28, 4); ctx.fill();
  ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4; roundRect(ctx, x + 8, y + h * 0.62, w - 16, h * 0.28, 4); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = 2.4;
  for (let i = 1; i <= 4; i++) {
    const sx = x + 8 + (w - 16) * (i / 5);
    ctx.beginPath(); ctx.moveTo(sx, y + h * 0.65); ctx.lineTo(sx, y + h * 0.87); ctx.stroke();
  }
}

// Counter island: steel worktop over diner-red panels, condiments on top.
function drawCounterIsland(ctx, x, y, w, h) {
  ctx.fillStyle = "#6e3230"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, x + 2, y + h * 0.16, w - 4, h * 0.84 - 2, 5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.30)"; ctx.lineWidth = 1.6;   // panel grooves
  for (const f of [1 / 3, 2 / 3]) { ctx.beginPath(); ctx.moveTo(x + w * f, y + h * 0.24); ctx.lineTo(x + w * f, y + h * 0.86); ctx.stroke(); }
  ctx.fillStyle = "#242b37"; roundRect(ctx, x + 5, y + h - 12, w - 10, 8, 3); ctx.fill();   // kick plate
  ctx.fillStyle = "#8f99ab"; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // steel top, slightly proud
  roundRect(ctx, x + 1, y + 2, w - 2, h * 0.18, 4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + w * 0.6, y + 7); ctx.stroke();   // sheen
  // Condiments + napkin holder on the top.
  fillCircle(ctx, x + w * 0.25, y + h * 0.11, 3.4, "#a03c36", 1.2);
  fillCircle(ctx, x + w * 0.38, y + h * 0.11, 3.4, "#c9a337", 1.2);
  ctx.fillStyle = "#aab4c5"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.2;
  roundRect(ctx, x + w * 0.58, y + h * 0.055, w * 0.2, h * 0.1, 2); ctx.fill(); ctx.stroke();
}

// A bank of two booths: facing red vinyl benches with a wooden table between.
function drawBoothBank(ctx, x, y, w, h, pal = {}) {
  const red = pal.boothRed || "#7e3634", table = pal.boothTable || "#8a6a45", seam = pal.boothSeam || "rgba(255,255,255,0.10)";
  const unit = (uy, uh) => {
    const benchH = uh * 0.30, tableH = uh * 0.26;
    ctx.fillStyle = red; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;
    roundRect(ctx, x + 2, uy, w - 4, benchH, 4); ctx.fill(); ctx.stroke();
    roundRect(ctx, x + 2, uy + uh - benchH, w - 4, benchH, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = seam;   // vinyl seam highlight
    ctx.fillRect(x + 6, uy + 3, w - 12, 2); ctx.fillRect(x + 6, uy + uh - benchH + 3, w - 12, 2);
    ctx.fillStyle = table; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;   // table
    roundRect(ctx, x + 6, uy + (uh - tableH) / 2, w - 12, tableH, 3); ctx.fill(); ctx.stroke();
    fillCircle(ctx, x + w / 2, uy + uh / 2, Math.min(5, w * 0.09), "#dfe5ee", 1.1);   // waiting plate
  };
  const gap = 6, uh = (h - 4 - gap) / 2;
  unit(y + 2, uh);
  unit(y + 2 + uh + gap, uh);
}

// Glass dessert display case on a steel base — cake slice, pie, donuts inside.
function drawDessertCase(ctx, x, y, w, h, pal = {}) {
  const baseCol = pal.dessertBase || "#3f4a5c";
  const baseH = h * 0.30, glassH = h - baseH - 2;
  ctx.fillStyle = baseCol; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // base cabinet
  roundRect(ctx, x + 2, y + 2 + glassH, w - 4, baseH - 2, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(x + 6, y + 4 + glassH, w - 12, 2);
  if (pal.dessertGlass) { ctx.globalAlpha = 0.5; ctx.fillStyle = pal.dessertGlass; }
  else ctx.fillStyle = "rgba(127,224,255,0.10)";
  ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;   // glass
  roundRect(ctx, x + 2, y + 2, w - 4, glassH, 4); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
  const shelfY = y + 2 + glassH * 0.52;
  ctx.strokeStyle = "rgba(255,255,255,0.20)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x + 5, shelfY); ctx.lineTo(x + w - 5, shelfY); ctx.stroke();
  const ty = shelfY - 3;   // top shelf: cake wedge + pie dome
  ctx.fillStyle = "#d38fa4"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x + w * 0.2, ty); ctx.lineTo(x + w * 0.32, ty - glassH * 0.34); ctx.lineTo(x + w * 0.42, ty); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c99b4a";
  ctx.beginPath(); ctx.arc(x + w * 0.66, ty, glassH * 0.2, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  const dy = y + glassH - 4;   // lower shelf: three donuts
  for (const f of [0.25, 0.5, 0.75]) fillCircle(ctx, x + w * f, dy, glassH * 0.11, "#b0794a", 1.1);
  ctx.strokeStyle = "rgba(255,255,255,0.13)"; ctx.lineWidth = 3;   // glass sheen
  ctx.beginPath(); ctx.moveTo(x + w * 0.16, y + 6); ctx.lineTo(x + w * 0.05, y + glassH * 0.5); ctx.stroke();
}

// Mop bucket + wet-floor sign — the humble hazard combo.
function drawMopBucket(ctx, x, y, w, h) {
  const sx = x + w * 0.08, sy = y + h - 6, sw = w * 0.4, sh = h * 0.52;   // A-frame sign
  ctx.fillStyle = "#c9a337"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw / 2, sy - sh); ctx.lineTo(sx + sw, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = MDARK; ctx.lineWidth = 2.2;   // "!" as shapes so it reads tiny
  ctx.beginPath(); ctx.moveTo(sx + sw / 2, sy - sh * 0.62); ctx.lineTo(sx + sw / 2, sy - sh * 0.3); ctx.stroke();
  fillCircle(ctx, sx + sw / 2, sy - sh * 0.14, 1.4, MDARK, 0.5);
  const bx = x + w * 0.72, bw = w * 0.4, bh = h * 0.42, by = y + h - bh - 3;   // bucket
  ctx.strokeStyle = MDARK; ctx.lineWidth = 4.4;   // mop handle (dark underlay, art-limb style)
  ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(x + w * 0.97, y + 4); ctx.stroke();
  ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(x + w * 0.97, y + 4); ctx.stroke();
  ctx.strokeStyle = "#cfc8b4"; ctx.lineWidth = 2;   // mop strands over the rim
  for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(bx, by + 5); ctx.quadraticCurveTo(bx + dx, by - 5, bx + dx * 1.8 - 2, by + 2); ctx.stroke(); }
  ctx.fillStyle = "#b8952e"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.8;   // tapered body
  ctx.beginPath(); ctx.moveTo(bx - bw / 2, by); ctx.lineTo(bx + bw / 2, by); ctx.lineTo(bx + bw * 0.4, by + bh); ctx.lineTo(bx - bw * 0.4, by + bh); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#8f7522"; ctx.fillRect(bx - bw / 2, by, bw, 3.4);   // wringer band
  ctx.fillStyle = "rgba(127,224,255,0.12)";   // the wet floor itself
  ctx.beginPath(); ctx.ellipse(x + w * 0.42, y + h - 3, w * 0.32, 3.4, 0, 0, 7); ctx.fill();
}

/* ---- Blue-Plate props (new; only this map uses these kinds) -------------- */

// The kitchen wall structure on the left edge: a navy panel with pass-through
// slots, a teal service light, and the "KITCHEN" placard. The belt emerges
// through it (drawn by drawPath); this is the placement-blocking structure.
function drawKitchen(ctx, x, y, w, h, pal = {}) {
  const navy = pal.navy || "#3B4552", teal = pal.teal || "#2FB4A6";
  ctx.fillStyle = navy; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(x + 3, y + 3, w - 6, 3);   // top sheen
  // Pass-through slots (dark windows) down the panel.
  ctx.fillStyle = "#141a20";
  for (const f of [0.28, 0.5, 0.72]) { roundRect(ctx, x + 4, y + h * f, w - 8, h * 0.07, 2); ctx.fill(); }
  // Teal service light near the bottom.
  fillCircle(ctx, x + w / 2, y + h - 14, Math.min(7, w * 0.28), teal, 1.4);
  // KITCHEN placard on a dark tab at the top, extending to the right of the panel.
  ctx.fillStyle = "#20262f"; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;
  roundRect(ctx, x, y - 30, 150, 24, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = teal; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("KITCHEN", x + 12, y - 17);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

// A cash register / service counter on a wood base: tan body, two dial discs,
// and a red key.
function drawRegister(ctx, x, y, w, h, pal = {}) {
  const wood = pal.wood || "#8a5a3a", tan = "#e3d5b0", red = pal.red || "#E8473F";
  ctx.fillStyle = wood; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // wood base
  roundRect(ctx, x, y + h - 10, w, 10, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = tan; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;    // body
  roundRect(ctx, x + 4, y, w - 8, h - 8, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x + 8, y + 4, w - 30, 2);   // sheen
  const cy = y + (h - 8) / 2;
  fillCircle(ctx, x + w * 0.28, cy, Math.min(7, h * 0.2), "#2a323d", 1.4);   // dial discs
  fillCircle(ctx, x + w * 0.44, cy, Math.min(7, h * 0.2), "#2a323d", 1.4);
  fillCircle(ctx, x + w * 0.28, cy, Math.min(2.4, h * 0.07), "#C6CCD5", 0.8);
  fillCircle(ctx, x + w * 0.44, cy, Math.min(2.4, h * 0.07), "#C6CCD5", 0.8);
  ctx.fillStyle = red; ctx.strokeStyle = MDARK; ctx.lineWidth = 1.4;   // red key
  roundRect(ctx, x + w * 0.62, cy - 8, 16, 16, 3); ctx.fill(); ctx.stroke();
}

// The lunch counter: a silver bar on a wood base with red stools out front.
function drawCounterStools(ctx, x, y, w, h, pal = {}) {
  const silver = pal.silver || "#C6CCD5", wood = pal.wood || "#8a5a3a", red = pal.red || "#E8473F", teal = pal.teal || "#2FB4A6";
  ctx.fillStyle = wood; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // wood apron
  roundRect(ctx, x, y + h * 0.5, w, h * 0.5, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = teal; ctx.fillRect(x + 3, y + h * 0.5, w - 6, 3);   // teal trim line
  ctx.fillStyle = silver; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // steel counter top
  roundRect(ctx, x, y, w, h * 0.42, 5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x + 6, y + 5); ctx.lineTo(x + w * 0.7, y + 5); ctx.stroke();   // sheen
  // Four red stool tops peeking out below the counter.
  const n = 4;
  for (let i = 0; i < n; i++) {
    const sx = x + w * ((i + 0.5) / n);
    fillCircle(ctx, sx, y + h - 3, Math.min(6, w * 0.05), red, 1.4);
    fillCircle(ctx, sx, y + h - 3, Math.min(2, w * 0.018), "#f7cabf", 0.6);
  }
}

// A small prep appliance: a silver box with three colored buttons on a wood base.
function drawPrep(ctx, x, y, w, h, pal = {}) {
  const silver = pal.silver || "#C6CCD5", wood = pal.wood || "#8a5a3a";
  const btns = [pal.red || "#E8473F", pal.teal || "#2FB4A6", pal.yellow || "#FFC64B"];
  ctx.fillStyle = wood; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // wood base
  roundRect(ctx, x, y + h - 8, w, 8, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = silver; ctx.strokeStyle = MDARK; ctx.lineWidth = 2;   // steel box
  roundRect(ctx, x + 3, y, w - 6, h - 7, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(x + 7, y + 4, w - 20, 2);   // sheen
  const cy = y + (h - 7) / 2 + 1;
  btns.forEach((c, i) => { const bx = x + w * (0.3 + i * 0.2); ctx.fillStyle = c; ctx.strokeStyle = MDARK; ctx.lineWidth = 1; roundRect(ctx, bx - 5, cy - 4, 10, 8, 2); ctx.fill(); ctx.stroke(); });
}

/* ---- Chrome icons (HUD / cards / panel) ---------------------------------
   Vector-only, no glyphs or assets — reusable at HUD size and shrunk onto
   chips. Colors come from the caller (COLOR palette) so the remaster re-points
   them centrally. These compose the same fillCircle/roundRect helpers as the
   mascots but draw NO mascot identity. */

// The Health Rating mark — a rating star seated on a little placard (the diner's
// hygiene grade). `color` drives the star (turns to the danger tint when lives
// run low). r = star radius; the placard scales off it.
function drawRatingIcon(ctx, x, y, color, r = 8) {
  ctx.save();
  ctx.translate(x, y);
  // Placard backing — a faint framed plaque so the star reads as a rating card.
  const pw = r * 2.3, ph = r * 2.2;
  ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
  roundRect(ctx, -pw / 2, -ph / 2, pw, ph, r * 0.42); ctx.fill(); ctx.stroke();
  // Star.
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r * 0.82 : r * 0.34;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.45; ctx.strokeStyle = MDARK; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.restore();
}

// The Tips currency mark — a gold coin with a rim, a top-left shine, and a $.
// One consistent Tips icon at HUD size (r≈8) and shrunk onto cost chips (r≈5).
function drawCurrencyIcon(ctx, x, y, color, r = 8) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = "#8a6a12"; ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();           // coin body
  ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, 7); ctx.stroke();                // inner rim
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath(); ctx.arc(-r * 0.34, -r * 0.34, r * 0.15, 0, 7); ctx.fill();  // shine
  ctx.fillStyle = "#6f5410"; ctx.font = "bold " + Math.round(r * 1.4) + "px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("$", 0, r * 0.14);
  ctx.restore();
}

// A small vector padlock — the locked-deck slot + upgrade-path locked tag
// (replaces the 🔒 glyph). s = half-size of the body.
function drawLockIcon(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.2, s * 0.32);
  ctx.beginPath(); ctx.arc(x, y - s * 0.32, s * 0.52, Math.PI * 1.05, Math.PI * -0.05); ctx.stroke();   // shackle
  ctx.lineWidth = 1;
  roundRect(ctx, x - s * 0.72, y - s * 0.05, s * 1.44, s * 1.05, s * 0.24); ctx.fill();                  // body
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.arc(x, y + s * 0.42, s * 0.16, 0, 7); ctx.fill();                                 // keyhole
  ctx.restore();
}

// A soft grounding shadow ellipse that lifts a seated customer off the floor.
function drawSoftShadow(ctx, x, y, rx, ry, color) {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); ctx.restore();
}

// The BLUE-PLATE SPECIAL wordmark (Issue #96) — an enamel diner sign, drawn
// vector at any size. Centered on (cx, cy); `w` is the sign-board width and
// everything scales off it. Palette: the named COLOR.sign* diner accents.
// Composition: cream enamel board with a navy rim + teal neon edge-glow, the
// blue plate itself (rimmed, with a fork) as the badge, "BLUE-PLATE" in navy,
// "SPECIAL" reversed out of a red ribbon, star sparks in the corners.
function drawWordmark(ctx, cx, cy, w) {
  const h = w * 0.34, x = cx - w / 2, y = cy - h / 2, r = h * 0.18;
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // Neon edge: a soft teal glow behind the board (shadowBlur on the rim pass).
  ctx.save();
  ctx.shadowColor = COLOR.signTeal; ctx.shadowBlur = w * 0.045;
  ctx.fillStyle = COLOR.signNavy; roundRect(ctx, x - w * 0.012, y - w * 0.012, w + w * 0.024, h + w * 0.024, r * 1.2); ctx.fill();
  ctx.restore();
  // Enamel face + navy rim + inner teal pinstripe.
  ctx.fillStyle = COLOR.signCream; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = COLOR.signNavy; ctx.lineWidth = Math.max(2, w * 0.011); roundRect(ctx, x, y, w, h, r); ctx.stroke();
  ctx.strokeStyle = COLOR.signTeal; ctx.lineWidth = Math.max(1.2, w * 0.006);
  roundRect(ctx, x + w * 0.022, y + w * 0.022, w - w * 0.044, h - w * 0.044, r * 0.7); ctx.stroke();
  // The blue plate badge (left): teal-rimmed plate + a raised fork.
  const px = x + w * 0.128, py = cy - h * 0.02, pr = h * 0.30;
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = COLOR.signNavy; ctx.lineWidth = Math.max(1.6, w * 0.007);
  ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = COLOR.signTeal; ctx.lineWidth = pr * 0.22;
  ctx.beginPath(); ctx.arc(px, py, pr * 0.78, 0, 7); ctx.stroke();
  ctx.strokeStyle = COLOR.signNavy; ctx.lineWidth = Math.max(1.4, pr * 0.12);
  ctx.beginPath(); ctx.moveTo(px, py + pr * 0.42); ctx.lineTo(px, py - pr * 0.18); ctx.stroke();   // fork handle
  for (const dx of [-pr * 0.16, 0, pr * 0.16]) {                                                    // tines
    ctx.beginPath(); ctx.moveTo(px + dx, py - pr * 0.18); ctx.lineTo(px + dx, py - pr * 0.46); ctx.stroke();
  }
  // "BLUE-PLATE" — heavy navy lettering with a yellow underline swash.
  const tx = x + w * 0.24;
  ctx.fillStyle = COLOR.signNavy; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = "900 " + Math.round(h * 0.34) + "px system-ui, sans-serif";
  ctx.fillText("BLUE-PLATE", tx, cy - h * 0.06);
  ctx.strokeStyle = COLOR.signYellow; ctx.lineWidth = Math.max(2, h * 0.045);
  ctx.beginPath(); ctx.moveTo(tx + w * 0.005, cy + h * 0.015); ctx.lineTo(tx + w * 0.62, cy + h * 0.015); ctx.stroke();
  // "SPECIAL" reversed out of a red ribbon with notched ends.
  const rw = w * 0.46, rh = h * 0.30, rx = tx + w * 0.055, ry = cy + h * 0.075, notch = rh * 0.42;
  ctx.fillStyle = COLOR.signRed; ctx.strokeStyle = COLOR.signNavy; ctx.lineWidth = Math.max(1.4, w * 0.005);
  ctx.beginPath();
  ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry);
  ctx.lineTo(rx + rw - notch, ry + rh / 2); ctx.lineTo(rx + rw, ry + rh);
  ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + notch, ry + rh / 2);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = COLOR.signCream; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold " + Math.round(rh * 0.62) + "px system-ui, sans-serif";
  ctx.fillText("S P E C I A L", rx + rw / 2, ry + rh / 2 + 0.5);
  // Corner star sparks (mustard).
  ctx.fillStyle = COLOR.signYellow;
  drawSpark4(ctx, x + w * 0.045, y + h * 0.2, h * 0.09);
  drawSpark4(ctx, x + w * 0.955, y + h * 0.82, h * 0.09);
  drawSpark4(ctx, x + w * 0.93, y + h * 0.16, h * 0.055);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// Subtle on-belt cues for the enemy STATUS layer (Roster Growth 2) — the same
// "state language" tier as the slow ring / freeze brackets. Deterministic
// (elapsed-driven wobble, no RNG) and drawn over the food so a glance answers
// "what's on that dish":
//   smoke dot → little gray curls rising off it (more stacks = more curls);
//   syrup dot → a maple-amber coating arc + drips sliding down (NOT the cyan
//               slow ring — that stays the Photographer's after-slow);
//   tag/amp   → a gold toothpick sample-flag planted on top (a value tag and
//               a damage amp share the flag — both are ampTimer-driven).
function drawStatusCues(ctx, e, elapsed) {
  const r = e.radius || 10;
  ctx.save();
  for (const d of e.dots || []) {
    if (d.src === "smoke") {
      const curls = Math.min(3, Math.ceil(d.stacks / 2) + (d.stacks >= d.maxStacks ? 1 : 0));
      ctx.strokeStyle = "#9aa2ad"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.globalAlpha = 0.75;
      for (let i = 0; i < curls; i++) {
        const ph = elapsed * 2.2 + i * 2.1;
        const cx = e.x + (i - (curls - 1) / 2) * (r * 0.7);
        const cy = e.y - r - 3 - ((ph * 6) % 8);
        ctx.beginPath();
        ctx.moveTo(cx - 2, cy + 3);
        ctx.quadraticCurveTo(cx + 3, cy + 1, cx - 1, cy - 2);
        ctx.quadraticCurveTo(cx - 4, cy - 4, cx + 1, cy - 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (d.src === "syrup") {
      ctx.strokeStyle = "#d98a2e"; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      const drips = 2;
      ctx.fillStyle = "#d98a2e";
      for (let i = 0; i < drips; i++) {
        const a = Math.PI * (1.25 + i * 0.25);
        const dx = e.x + Math.cos(a) * (r + 1), dy = e.y + Math.sin(a) * (r + 1);
        const slide = 2 + ((elapsed * 3 + i) % 2);
        ctx.beginPath(); ctx.ellipse(dx, dy + slide, 1.4, 2.4, 0, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  if (e.ampMul > 1 || (e.ampBonus > 0 && e.ampTimer > 0)) {
    // The sample flag: a toothpick with a little gold pennant, planted on top.
    const fx = e.x + r * 0.35, fy = e.y - r - 2;
    ctx.strokeStyle = MDARK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 7); ctx.stroke();
    ctx.fillStyle = "#ffcf4a"; ctx.strokeStyle = MDARK; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(fx, fy - 7); ctx.lineTo(fx + 6, fy - 5.5); ctx.lineTo(fx, fy - 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Trim a label with an ellipsis so it fits maxWidth on the tiny cards (the
// themed customer names are longer than the old Arrow/Cannon ones). Set the
// font before calling. Full names still show in the toolbar blurb + in-run panel.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

// Fit `text` into up to maxLines lines within maxWidth by SHRINKING the font
// (bold system-ui) from basePx down to minPx until it wraps cleanly without any
// ellipsis — so a tower NAME always renders in full (Roster Growth: names like
// "Short-Order Cook" no longer truncate). Returns { lines, px }; the caller sets
// the font from px before drawing. Only the pathological worst case (a single
// word longer than the card even at minPx) falls back to wrapLabel's ellipsis.
function fitWrappedName(ctx, text, maxWidth, maxLines, basePx, minPx) {
  for (let px = basePx; px >= minPx; px -= 0.5) {
    ctx.font = "bold " + px + "px system-ui, sans-serif";
    const lines = wrapLabel(ctx, text, maxWidth, maxLines);
    if (lines.length <= maxLines && lines.every((l) => l.indexOf("…") < 0 && ctx.measureText(l).width <= maxWidth)) {
      return { lines, px };
    }
  }
  ctx.font = "bold " + minPx + "px system-ui, sans-serif";
  return { lines: wrapLabel(ctx, text, maxWidth, maxLines), px: minPx };
}

// Word-wrap `text` into up to maxLines lines that each fit maxWidth (font
// pre-set). A single over-long word (or an overflowing last line) is ellipsized
// with fitText. Lets the taller hub cards show full multi-word names.
function wrapLabel(ctx, text, maxWidth, maxLines) {
  if (maxLines <= 1 || ctx.measureText(text).width <= maxWidth) return [fitText(ctx, text, maxWidth)];
  const words = text.split(" ");
  const lines = []; let cur = words[0] || "";
  for (let i = 1; i < words.length; i++) {
    const t = cur + " " + words[i];
    if (ctx.measureText(t).width <= maxWidth) cur = t;
    else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);
  if (lines.length <= maxLines) return lines.map((l) => fitText(ctx, l, maxWidth));
  const kept = lines.slice(0, maxLines - 1);
  kept.push(fitText(ctx, lines.slice(maxLines - 1).join(" "), maxWidth));
  return kept;
}
