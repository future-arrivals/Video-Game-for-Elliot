// Direction A2 "Paper Page, cinematic" — canvas 2D engine for the style mockups.
// Written the way the real game could do it on a phone: everything that does not move is baked
// once into offscreen canvases (chunks, layers, prop sprites, glows, pre-blurred foreground);
// each frame is drawImage calls plus a handful of live strokes. No per-frame filters or blur.
// ASSETS (name -> data URL) is injected by the builder.
'use strict';
const W = 844, H = 390;
const DPR = Math.min(2, window.devicePixelRatio || 1);
const BS = Math.min(2.5, DPR * 1.3);              // bake scale for sprites/chunks (allows ~1.3x zoom)
const INK = '#1a1a1a', PEN = '#9d9485', PAPER = '#FBF8F0';
const LOOP = 15000;

// ---------------------------------------------------------------- utils
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const eOutCubic = u => 1 - Math.pow(1 - u, 3);
const eInOutCubic = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const eOutBack = (u, s = 2.2) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
const eInBack = (u, s = 1.8) => (s + 1) * u * u * u - s * u * u;
const seg = (t, a, b) => clamp((t - a) / (b - a));
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

function wobPts(pts, closed, amp = 1.6, seed = 1, step = 14) {
  const r = rng(seed); const p0 = r() * 6.28, p1 = r() * 6.28; const out = []; let t = 0;
  const n = pts.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, k = Math.max(1, Math.floor(L / step));
    const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let j = 0; j < k; j++) {
      const u = j / k; t += L / k;
      const o = amp * (Math.sin(t * .07 + p0) * .6 + Math.sin(t * .19 + p1) * .3 + (r() - .5) * .4);
      out.push([x0 + (x1 - x0) * u + nx * o, y0 + (y1 - y0) * u + ny * o]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
// catmull-rom -> Path2D, with length and bbox
function toPath(pts, closed) {
  const p = new Path2D(); const n = pts.length; let len = 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  p.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n];
    const A = closed || i > 0 ? a : b, D = closed || i + 2 < n ? d : c;
    p.bezierCurveTo(b[0] + (c[0] - A[0]) / 6, b[1] + (c[1] - A[1]) / 6, c[0] - (D[0] - b[0]) / 6, c[1] - (D[1] - b[1]) / 6, c[0], c[1]);
    len += Math.hypot(c[0] - b[0], c[1] - b[1]);
  }
  if (closed) p.closePath();
  return { p, len: len * 1.05, bb: [x0, y0, x1, y1] };
}
const W_ = (pts, closed = true, amp = 1.6, seed = 1, step = 14) => toPath(wobPts(pts, closed, amp, seed, step), closed);
function ell(cx, cy, rx, ry, n = 18, jit = 0, seed = 0) { const r = rng(seed); const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + (r() - .5) * jit; o.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]); } return o; }
function heartPts(cx, cy, s) { const o = []; for (let i = 0; i < 28; i++) { const t = i / 28 * Math.PI * 2; o.push([cx + 16 * Math.pow(Math.sin(t), 3) * s / 32, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s / 32]); } return o; }

// ---------------------------------------------------------------- props (parts = strokes + fills)
// part: {g: toPath result, fill, stroke, lw, dash}
function part(g, fill, stroke, lw, dash) { return { g, fill, stroke, lw, dash }; }
function makeProp(kind, x, y, s, seed, ink) {
  const P = []; const L = ink ? INK : PEN; const lw = ink ? 4 : 2;
  if (kind === 'pumpkin') {
    P.push(part(W_(ell(x, y - 20 * s, 30 * s, 21 * s, 14, .1, seed), true, 1.1, seed), '#F6D2A6', L, lw));
    P.push(part(W_([[x - 9 * s, y - 39 * s], [x - 15 * s, y - 20 * s], [x - 9 * s, y - 1 * s]], false, .6, seed + 1), null, L, lw * .8));
    P.push(part(W_([[x + 9 * s, y - 39 * s], [x + 15 * s, y - 20 * s], [x + 9 * s, y - 1 * s]], false, .6, seed + 2), null, L, lw * .8));
    P.push(part(W_([[x, y - 40 * s], [x + 3 * s, y - 50 * s]], false, .3, seed + 3), null, '#a9987a', 3.5));
  } else if (kind === 'post') {
    P.push(part(W_([[x - 6, y], [x - 5, y - 46], [x, y - 52], [x + 5, y - 46], [x + 6, y]], true, .5, seed, 8), '#EEDFC3', L, lw));
  } else if (kind === 'rail') { // x..s = x2
    P.push(part(W_([[x, y - 36], [s, y - 36]], false, 1, seed, 20), null, L, 2));
    P.push(part(W_([[x, y - 18], [s, y - 18]], false, 1, seed + 1, 20), null, L, 2));
  } else if (kind === 'scarecrow') {
    P.push(part(W_([[x, y], [x, y - 92]], false, .6, seed), null, L, 3));
    P.push(part(W_([[x - 38, y - 66], [x + 38, y - 64]], false, .8, seed + 1), null, L, 3));
    P.push(part(W_([[x - 26, y - 70], [x + 26, y - 70], [x + 22, y - 32], [x - 22, y - 32]], true, 1.2, seed + 2), '#E9C9C0', L, 2));
    P.push(part(W_([[x - 4, y - 68], [x - 4, y - 34]], false, .5, seed + 9), null, L, 1.5, [3, 4]));
    P.push(part(W_(ell(x, y - 84, 14, 14, 12), true, .8, seed + 3), '#F3E3BE', L, 2));
    P.push(part(W_([[x - 24, y - 92], [x + 24, y - 92], [x + 8, y - 98], [x + 2, y - 118], [x - 10, y - 98]], true, .8, seed + 4), '#D9CBA9', L, 2));
    for (const d of [-1, 1]) P.push(part(W_([[x + 38 * d, y - 66], [x + 46 * d, y - 72], [x + 40 * d, y - 60], [x + 48 * d, y - 62]], false, .4, seed + 5 + d), null, '#c9b27a', 2));
  } else if (kind === 'cart') {
    P.push(part(W_([[x - 50, y - 50], [x + 50, y - 50], [x + 42, y - 18], [x - 42, y - 18]], true, 1, seed), '#EAD3B0', L, lw));
    for (const k of [-24, 0, 24]) P.push(part(W_(ell(x + k, y - 56, 15, 11, 12), true, .7, seed + k + 50), '#F6D2A6', L, lw * .8));
    for (const k of [-30, 30]) { P.push(part(W_(ell(x + k, y - 14, 14, 14, 14), true, .6, seed + k), '#F4ECDC', L, lw)); P.push(part(W_([[x + k - 10, y - 14], [x + k + 10, y - 14]], false, .3, seed + k + 3), null, L, 1.5)); P.push(part(W_([[x + k, y - 24], [x + k, y - 4]], false, .3, seed + k + 4), null, L, 1.5)); }
    P.push(part(W_([[x + 50, y - 34], [x + 82, y - 44]], false, .5, seed + 9), null, L, 3));
  } else if (kind === 'hay') {
    P.push(part(W_([[x - 34, y], [x - 34, y - 34], [x + 34, y - 34], [x + 34, y]], true, 1.2, seed), '#F2E2A8', L, lw));
    for (const k of [-12, 12]) P.push(part(W_([[x + k, y - 32], [x + k, y - 2]], false, .6, seed + k), null, L, 1.5));
  } else if (kind === 'vine') {
    const pts = []; for (let i = 0; i <= 12; i++) pts.push([x + i * s / 12, y + Math.sin(i * 1.3 + seed) * 8]);
    P.push(part(W_(pts, false, 1, seed, 10), null, '#a8c28b', 2.2));
    for (let i = 1; i < 12; i += 3) { const lx = x + i * s / 12, ly = y + Math.sin(i * 1.3 + seed) * 8; P.push(part(W_([[lx, ly], [lx + 6, ly - 10], [lx + 12, ly - 4]], true, .4, seed + i), '#DCE9C8', '#a8c28b', 1.6)); }
  } else if (kind === 'sign') {
    P.push(part(W_([[x, y], [x, y - 56]], false, .4, seed), null, L, 3));
    P.push(part(W_([[x - 28, y - 70], [x + 26, y - 70], [x + 40, y - 58], [x + 26, y - 46], [x - 28, y - 46]], true, .8, seed + 1), '#EEDFC3', L, 2));
    P.push(part(W_(ell(x + 4, y - 58, 7, 6, 10), true, .4, seed + 2), '#F6D2A6', L, 1.6));
  } else if (kind === 'boulder') {           // interactive: ink + full colour
    P.push(part(W_(ell(x, y - 30, 40, 32, 12, .18, seed), true, 1.3, seed), '#A09A8E', INK, 4.5));
    P.push(part(W_([[x - 14, y - 46], [x - 4, y - 34], [x - 10, y - 24]], false, .4, seed + 1), null, INK, 3));
    P.push(part(W_([[x + 16, y - 44], [x + 8, y - 30]], false, .4, seed + 2), null, INK, 3));
  } else if (kind === 'candy') {             // interactive pickup (static halo baked in)
    P.push(part(W_(ell(x, y - 22, 24, 24, 16), true, .6, seed), '#FFF1A8', '#E8C94A', 2.5));
    P.push(part(W_([[x - 22, y - 32], [x - 8, y - 22], [x - 22, y - 12]], true, .5, seed + 1), '#E99DBB', INK, 3));
    P.push(part(W_([[x + 22, y - 32], [x + 8, y - 22], [x + 22, y - 12]], true, .5, seed + 2), '#E99DBB', INK, 3));
    P.push(part(W_(ell(x, y - 22, 10, 9, 12), true, .4, seed + 3), '#D03C30', INK, 3.5));
  } else if (kind === 'lolly') {
    P.push(part(W_(ell(x, y - 26, 24, 24, 16), true, .6, seed), '#FFF1A8', '#E8C94A', 2.5));
    P.push(part(W_([[x + 2, y - 26], [x + 10, y - 6]], false, .3, seed + 1), null, INK, 3.5));
    P.push(part(W_(ell(x, y - 32, 11, 11, 14), true, .4, seed + 2), '#82A836', INK, 3.5));
    const sp = []; for (let i = 0; i < 22; i++) { const a = i * .6, r = 1 + i * .4; sp.push([x + Math.cos(a) * r, y - 32 + Math.sin(a) * r]); }
    P.push(part(toPath(sp, false), null, '#FBF8F0', 2.4));
  } else if (kind === 'spot') {              // dashed "a power fits here" + icon spot
    P.push(part(W_([[x - 62, y - 18], [x + 62, y - 22], [x + 64, y + 10], [x - 62, y + 12]], true, 1, seed), 'rgba(255,255,255,.5)', INK, 3.5, [9, 8]));
  }
  let bb = [1e9, 1e9, -1e9, -1e9];
  for (const q of P) { const b = q.g.bb; bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; }
  const pad = 8; bb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
  return { kind, x, y, parts: P, bb, ink: !!ink, cache: null };
}
function drawParts(ctx, parts, p) {   // p: reveal 0..1 (pencil draws in, then colour washes in)
  const q = clamp(p / .7), f = clamp((p - .35) / .65);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const k of parts) {
    if (k.fill && f > 0) { ctx.globalAlpha = f; ctx.fillStyle = k.fill; ctx.fill(k.g.p); ctx.globalAlpha = 1; }
    if (k.stroke && q > 0) {
      ctx.strokeStyle = k.stroke; ctx.lineWidth = k.lw;
      if (k.dash) { ctx.setLineDash(k.dash); ctx.globalAlpha = q; }
      else if (q < 1) { ctx.setLineDash([k.g.len, k.g.len]); ctx.lineDashOffset = k.g.len * (1 - q); }
      ctx.stroke(k.g.p); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
    }
  }
}
function bakeProp(pr) {
  const [x0, y0, x1, y1] = pr.bb; const c = mk((x1 - x0) * BS, (y1 - y0) * BS); const g = c.getContext('2d');
  g.scale(BS, BS); g.translate(-x0, -y0); drawParts(g, pr.parts, 1); pr.cache = c;
}

// ---------------------------------------------------------------- images / sprites
const IM = {}, SPR = {};
function loadImages() {
  return Promise.all(Object.entries(ASSETS).map(([k, src]) => new Promise((res, rej) => { const i = new Image(); i.onload = () => { IM[k] = i; res(); }; i.onerror = () => rej(new Error('image ' + k)); i.src = src; })));
}
function sprite(key, h, src) {             // pre-scaled to display height h (at bake scale)
  const im = IM[src || key]; const w = h * im.width / im.height; const c = mk(w * BS, h * BS);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
  return (SPR[key] = { c, w, h });
}
function haloOf(s, r, col) {               // cream paper cut-out behind a sprite (for dark scenes)
  const c = mk(s.c.width + r * 2 * BS, s.c.height + r * 2 * BS), g = c.getContext('2d');
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.drawImage(s.c, r * BS + Math.cos(a) * r * BS, r * BS + Math.sin(a) * r * BS); }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return { c, w: s.w + 2 * r, h: s.h + 2 * r };
}
function tinted(s, col) { const c = mk(s.c.width, s.c.height), g = c.getContext('2d'); g.drawImage(s.c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); return { c, w: s.w, h: s.h }; }
function blurred(drawFn, w, h, k = 6) {    // fake depth of field: draw small, scale up (no filters)
  const sm = mk(w / k, h / k), g = sm.getContext('2d'); g.scale(1 / k, 1 / k); drawFn(g);
  const c = mk(w * DPR, h * DPR), g2 = c.getContext('2d'); g2.imageSmoothingQuality = 'high'; g2.drawImage(sm, 0, 0, c.width, c.height);
  return { c, w, h };
}
function radial(w, h, stops) { const c = mk(w * DPR, h * DPR), g = c.getContext('2d'); g.scale(DPR * w / h, DPR); const gr = g.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, h, h); return { c, w, h }; }
function blit(ctx, s, cx, by, sx = 1, sy = 1, rot = 0, alpha = 1) {   // bottom-centre anchor
  ctx.save(); ctx.translate(cx, by); if (rot) ctx.rotate(rot); ctx.scale(sx, sy); if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(s.c, -s.w / 2, -s.h, s.w, s.h); ctx.restore();
}

// ---------------------------------------------------------------- world: Pumpkin Patch slice
const WORLD = { w: 2900, top: 104, river: [1900, 1990], pathY: [246, 300] };
let PROPS = [], TUFTS = [], LAYERS = {}, CHUNKS = [], FG = [], UI = {};
function buildWorld() {
  const r = rng(7); const add = (k, x, y, s, ink) => PROPS.push(makeProp(k, x, y, s, (r() * 1e6) | 0, ink));
  // fence along the north edge, with a gap
  for (let x = 40; x < 1860; x += 66) { if (x > 830 && x < 1060) continue; add('post', x, 140, 1); if (x + 66 < 1860 && !(x + 66 > 830 && x + 66 < 1060)) add('rail', x, 140, x + 66); }
  for (let x = 2040; x < 2860; x += 66) { add('post', x, 140, 1); if (x + 66 < 2860) add('rail', x, 140, x + 66); }
  // pumpkin field (scenery)
  const avoid = [[560, 640, 120, 240], [1100, 1220, 150, 250], [1270, 1400, 300, 400], [1540, 1700, 150, 250], [380, 470, 310, 380], [930, 1030, 150, 210], [1740, 1820, 150, 240]];
  const free = (x, y) => !avoid.some(([a, b, c, d]) => x > a && x < b && y > c && y < d) && !(x > 1860 && x < 2030);
  for (let i = 0; i < 70; i++) {
    const x = 20 + r() * 2860, y = r() < .5 ? 165 + r() * 70 : 330 + r() * 70;
    if (free(x, y)) add('pumpkin', x, y, .7 + r() * .5);
  }
  add('scarecrow', 600, 222, 1); add('cart', 1330, 372, 1); add('hay', 420, 362, 1); add('hay', 980, 196, 1); add('hay', 2300, 210, 1);
  add('vine', 120, 222, 160); add('vine', 700, 380, 180); add('vine', 1420, 228, 120); add('vine', 2150, 380, 200);
  add('sign', 1785, 236, 1);
  // interactive (ink)
  add('boulder', 1150, 206, 1, true); add('lolly', 520, 258, 1, true); add('candy', 1720, 300, 1, true); add('candy', 2420, 284, 1, true);
  add('spot', 1945, 280, 1, true);
  for (const p of PROPS) bakeProp(p);
  // grass tufts (live, they sway)
  for (let i = 0; i < 110; i++) { const x = r() * 2880, y = 150 + r() * 250; if ((y > 240 && y < 306) || (x > 1880 && x < 2010)) continue; TUFTS.push({ x, y, s: .7 + r() * .6, ph: r() * 6 }); }
}

function bakeGround() {
  // grain tile
  const gt = mk(160, 160), gg = gt.getContext('2d'), r = rng(3);
  for (let i = 0; i < 900; i++) { gg.fillStyle = r() < .5 ? 'rgba(90,70,40,.07)' : 'rgba(255,255,255,.35)'; gg.fillRect(r() * 160, r() * 160, 1 + r() * 1.5, 1 + r() * 1.5); }
  gg.strokeStyle = 'rgba(120,100,70,.05)'; for (let i = 0; i < 14; i++) { const x = r() * 160, y = r() * 160; gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + r() * 18 - 9, y + r() * 18 - 9); gg.stroke(); }
  LAYERS.grain = gt;
  const edge = []; for (let x = -40; x <= WORLD.w + 40; x += 40) edge.push([x, WORLD.top + Math.sin(x * .013) * 4]);
  const sheet = W_([...edge, [WORLD.w + 40, 460], [-40, 460]], true, 2, 21, 30);
  const path1 = W_([[-40, 248], [400, 240], [800, 252], [1200, 242], [1600, 250], [1905, 246], [1905, 302], [1600, 300], [1200, 296], [800, 304], [400, 296], [-40, 302]], true, 2, 22, 30);
  const path2 = W_([[1985, 244], [2400, 238], [2940, 248], [2940, 300], [2400, 296], [1985, 302]], true, 2, 23, 30);
  const river = W_([[1902, 92], [1990, 92], [1996, 250], [1986, 330], [1994, 470], [1898, 470], [1906, 330], [1896, 250]], true, 2.5, 24, 30);
  const CW = 600;
  for (let x0 = 0; x0 < WORLD.w; x0 += CW) {
    const c = mk(CW * BS, (470 - 80) * BS), g = c.getContext('2d');
    g.scale(BS, BS); g.translate(-x0, -80);
    // contact shadow where the playfield sheet sits on the lower sheet
    for (let i = 0; i < 6; i++) { g.save(); g.translate(0, -i * 1.5); g.fillStyle = `rgba(90,60,30,${.05 - i * .007})`; g.fill(sheet.p); g.restore(); }
    g.fillStyle = PAPER; g.fill(sheet.p);
    g.save(); g.clip(sheet.p); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = g.createPattern(gt, 'repeat'); g.fillRect(0, 0, c.width, c.height); g.restore();
    g.strokeStyle = '#d9cfbb'; g.lineWidth = 1.5; g.stroke(sheet.p);
    g.fillStyle = '#F2E2BD'; g.strokeStyle = PEN; g.lineWidth = 2; g.fill(path1.p); g.stroke(path1.p); g.fill(path2.p); g.stroke(path2.p);
    g.fillStyle = '#8CC8DC'; g.fill(river.p); g.strokeStyle = INK; g.lineWidth = 4.5; g.lineJoin = 'round'; g.stroke(river.p);
    CHUNKS.push({ x0, c });
  }
}
function bakeLayers() {
  // sky wash (screen space)
  { const c = mk(W * DPR, H * DPR), g = c.getContext('2d'); g.scale(DPR, DPR); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#F5E6C8'); gr.addColorStop(.35, '#F8EFDD'); gr.addColorStop(1, PAPER); g.fillStyle = gr; g.fillRect(0, 0, W, H); LAYERS.sky = c; }
  // far layer (parallax .25): hills, trees, the giant pumpkin landmark
  { const X0 = -700, X1 = 1600, Y0 = -40, Y1 = 130; const c = mk((X1 - X0) * DPR, (Y1 - Y0) * DPR), g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(-X0, -Y0);
    const h1 = W_([[X0, 80], [-300, 46], [100, 70], [500, 30], [900, 64], [1300, 40], [X1, 70], [X1, Y1], [X0, Y1]], true, 2, 31, 40);
    g.fillStyle = '#EFE2C8'; g.fill(h1.p); g.strokeStyle = '#c8b99e'; g.lineWidth = 1.6; g.stroke(h1.p);
    const r = rng(9); for (let i = 0; i < 26; i++) { const x = X0 + r() * (X1 - X0), y = 60 + r() * 30; const t = W_(ell(x, y - 12, 9, 11, 10), true, .6, i); g.fillStyle = '#E3E3C4'; g.fill(t.p); g.stroke(t.p); g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x, y + 6); g.stroke(); }
    // giant pumpkin: pale but warm, door-mouth glowing
    const gx = 520, gy = 124; g.save(); g.translate(gx, gy); g.scale(.74, .74); g.translate(-gx, -gy);
    const body = W_(ell(gx, gy - 58, 96, 62, 22, .05, 5), true, 2, 32);
    g.fillStyle = '#F4C28A'; g.fill(body.p); g.strokeStyle = '#a7835d'; g.lineWidth = 2.2; g.stroke(body.p);
    for (const d of [-50, -22, 22, 50]) { const rr = W_([[gx + d * .6, gy - 118], [gx + d, gy - 58], [gx + d * .6, gy + 2]], false, .8, d + 40); g.stroke(rr.p); }
    const stem = W_([[gx - 8, gy - 118], [gx - 4, gy - 140], [gx + 8, gy - 146], [gx + 8, gy - 118]], true, .6, 33); g.fillStyle = '#C9B38A'; g.fill(stem.p); g.stroke(stem.p);
    const mouth = W_([[gx - 44, gy - 40], [gx - 30, gy - 30], [gx - 16, gy - 42], [gx, gy - 30], [gx + 16, gy - 42], [gx + 30, gy - 30], [gx + 44, gy - 40], [gx + 36, gy - 10], [gx - 36, gy - 10]], true, .6, 34);
    g.fillStyle = '#FFE7A6'; g.fill(mouth.p); g.stroke(mouth.p);
    for (const d of [-1, 1]) { const e = W_([[gx + d * 34, gy - 82], [gx + d * 18, gy - 64], [gx + d * 46, gy - 64]], true, .4, 35 + d); g.fillStyle = '#FFE7A6'; g.fill(e.p); g.stroke(e.p); }
    g.restore(); LAYERS.far = { c, X0, Y0, f: .25 };
  }
  // mid layer (parallax .55): hedge row
  { const X0 = -500, X1 = 2400, Y0 = 50, Y1 = 125; const c = mk((X1 - X0) * DPR, (Y1 - Y0) * DPR), g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(-X0, -Y0);
    const pts = [[X0, Y1]]; for (let x = X0; x <= X1; x += 34) pts.push([x, 92 - Math.abs(Math.sin(x * .05)) * 16]); pts.push([X1, Y1]);
    const hd = W_(pts, true, 1.5, 41, 12); g.fillStyle = '#DDE7C6'; g.fill(hd.p); g.strokeStyle = '#a9b693'; g.lineWidth = 1.8; g.stroke(hd.p);
    LAYERS.mid = { c, X0, Y0, f: .55 };
  }
  // light: warm wash, light shafts, vignette (afternoon) + dusk version
  const light = (dusk) => { const c = mk(W * DPR, H * DPR), g = c.getContext('2d'); g.scale(DPR, DPR);
    let gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, dusk ? 'rgba(150,80,160,.20)' : 'rgba(255,196,110,.20)'); gr.addColorStop(1, dusk ? 'rgba(240,120,60,.16)' : 'rgba(255,196,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const [a, w] of [[60, 70], [210, 40], [330, 90]]) { const sg = g.createLinearGradient(a, 0, a + 160, H); sg.addColorStop(0, `rgba(255,240,200,${dusk ? .05 : .13})`); sg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = sg; g.beginPath(); g.moveTo(a, 0); g.lineTo(a + w, 0); g.lineTo(a + w + 260, H); g.lineTo(a + 260, H); g.fill(); }
    gr = g.createRadialGradient(W / 2, H / 2, W * .32, W / 2, H / 2, W * .66); gr.addColorStop(0, 'rgba(70,45,20,0)'); gr.addColorStop(1, dusk ? 'rgba(40,20,50,.42)' : 'rgba(80,50,20,.26)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return c; };
  LAYERS.light = light(false); LAYERS.dusk = light(true);
  LAYERS.shadow = radial(60, 18, [[0, 'rgba(70,50,30,.38)'], [.6, 'rgba(70,50,30,.16)'], [1, 'rgba(70,50,30,0)']]);
  // foreground, pre-blurred (parallax 1.4)
  const leaf = blurred(g => { g.fillStyle = '#5f8a3c'; g.strokeStyle = '#2f4a1c'; g.lineWidth = 6; const l = W_([[10, 230], [40, 120], [120, 40], [200, 70], [240, 150], [200, 230]], true, 4, 51, 20); g.fill(l.p); g.stroke(l.p); g.beginPath(); g.moveTo(30, 230); g.quadraticCurveTo(110, 140, 190, 90); g.stroke(); }, 250, 240, 7); leaf.w = 170; leaf.h = 163;
  const grass = blurred(g => { g.strokeStyle = '#6d9446'; g.lineWidth = 10; g.lineCap = 'round'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(40 + i * 18, 200); g.quadraticCurveTo(30 + i * 20, 90, 20 + i * 24 + (i % 2) * 30, 10 + (i % 3) * 20); g.stroke(); } }, 220, 200, 7); grass.w = 165; grass.h = 150;
  const post = blurred(g => { g.fillStyle = '#b89a6c'; g.strokeStyle = '#4a3a24'; g.lineWidth = 6; const p = W_([[30, 260], [26, 30], [60, 4], [94, 30], [90, 260]], true, 2, 52, 20); g.fill(p.p); g.stroke(p.p); }, 120, 260, 7); post.w = 84; post.h = 182;
  const r = rng(11); for (let x = -200; x < 4300; x += 380 + r() * 260) { const k = r(); FG.push({ s: k < .45 ? grass : k < .8 ? leaf : post, x, flip: r() < .5, dy: 45 + r() * 45 }); }
  // UI (baked)
  { const c = mk(W * DPR, 70 * DPR), g = c.getContext('2d'); g.scale(DPR, DPR);
    const tag = (pts, s) => { const t = W_(pts, true, .6, s); g.save(); g.translate(0, 3); g.fillStyle = 'rgba(80,55,25,.18)'; g.fill(t.p); g.restore(); g.fillStyle = PAPER; g.fill(t.p); g.strokeStyle = '#cfc5b1'; g.lineWidth = 1.5; g.stroke(t.p); };
    tag([[14, 12], [190, 12], [190, 52], [14, 52]], 61);
    for (let i = 0; i < 6; i++) { const h = W_(heartPts(38 + i * 26, 32, 20), true, .5, 70 + i, 6); g.fillStyle = i < 5 ? '#D03C30' : PAPER; g.fill(h.p); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke(h.p); }
    tag([[716, 12], [830, 12], [830, 52], [716, 52]], 62);
    const cp = makeProp('candy', 752, 54, 1, 63, true); cp.parts.shift(); drawParts(g, cp.parts, 1);
    g.fillStyle = INK; g.font = '800 26px ' + FONT; g.textAlign = 'center'; g.fillText('3', 800, 42);
    UI.hud = c; }
}
const FONT = 'Andika, "Avenir Next Rounded", "Arial Rounded MT Bold", Verdana, "DejaVu Sans", sans-serif';

// ---------------------------------------------------------------- per-frame world render
// state: {cx, cy, z, t, front, actors:[{s, x, y, sx, sy, rot, shadow}], fx:[fn], lb (0..1), shake:[dx,dy], flash, dusk, ui, wipe}
function drawLayer(ctx, L, st) {
  const zf = 1 + (st.z - 1) * L.f;
  const sx = (0 - st.cx * L.f) * zf + W / 2, sy = (-205 - (st.cy - 205) * L.f) * zf + H / 2;
  ctx.drawImage(L.c, sx + L.X0 * zf, sy + L.Y0 * zf, L.c.width / DPR * zf, L.c.height / DPR * zf);
}
function renderWorld(ctx, st) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(LAYERS.sky, 0, 0, W, H);
  const sh = st.shake || [0, 0];
  ctx.translate(sh[0], sh[1]);
  drawLayer(ctx, LAYERS.far, st);
  // a bat crossing the far layer
  if (SPR.batfar) { const u = ((st.t / 6000) % 1); const zf = 1 + (st.z - 1) * .25; const bx = (lerp(-300, 1300, u) - st.cx * .25) * zf + W / 2, by = (30 + Math.sin(u * 30) * 8 - 205 - (st.cy - 205) * .25) * zf + H / 2; blit(ctx, SPR.batfar, bx, by, 1, 1, 0, .55); }
  drawLayer(ctx, LAYERS.mid, st);
  // playfield (world space)
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(st.z, st.z); ctx.translate(-st.cx, -st.cy);
  const vx0 = st.cx - W / 2 / st.z - 60, vx1 = st.cx + W / 2 / st.z + 60;
  for (const ch of CHUNKS) if (ch.x0 + 600 > vx0 && ch.x0 < vx1) ctx.drawImage(ch.c, ch.x0, 80, 600, 390);
  if (st.fxUnder) st.fxUnder(ctx);
  // river ripples (live, move with the current)
  ctx.strokeStyle = '#3F86A6'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const y = 100 + ((i * 47 + st.t * .06) % 370); const x = 1922 + (i % 3) * 16; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 7, y - 6, x + 14, y); ctx.quadraticCurveTo(x + 21, y + 6, x + 28, y); ctx.stroke(); }
  // y-sorted props + actors + tufts
  const items = [];
  for (const p of PROPS) { if (p.bb[2] < vx0 || p.bb[0] > vx1) continue; const rv = p.ink ? clamp((st.front - p.x) / 90) : clamp((st.front - p.x) / 160); if (rv <= 0) continue; items.push({ y: p.y, p, rv }); }
  for (const tf of TUFTS) { if (tf.x < vx0 || tf.x > vx1) continue; const rv = clamp((st.front - tf.x) / 160); if (rv > 0) items.push({ y: tf.y, tf, rv }); }
  for (const a of st.actors) items.push({ y: a.y + (a.zb || 0), a });
  items.sort((m, n) => m.y - n.y);
  for (const it of items) {
    if (it.p) {
      const p = it.p;
      if (p.kind === 'spot' && st.spotUsed) continue;
      if ((p.kind === 'candy' || p.kind === 'lolly') && st.leadX != null && st.leadX > p.x - 20) {   // collected: pop + sparkle
        const u = (st.leadX - p.x + 20) / 70; if (u >= 1) continue;
        const k = 1 + eOutCubic(u) * .7; ctx.save(); ctx.translate(p.x, p.y - 22 - u * 50); ctx.scale(k, k); ctx.globalAlpha = 1 - u; ctx.drawImage(p.cache, p.bb[0] - p.x, p.bb[1] - p.y + 22, p.bb[2] - p.bb[0], p.bb[3] - p.bb[1]); ctx.restore();
        burst(ctx, p.x, p.y - 22, u, p.x | 0, 10, ['#FFF1A8', '#E99DBB', '#D03C30'], 70, 0); continue;
      }
      if (it.rv >= 1) { let dy = 0; if (p.kind === 'candy' || p.kind === 'lolly') dy = Math.sin(st.t * .004 + p.x) * 3; ctx.drawImage(p.cache, p.bb[0], p.bb[1] + dy, p.bb[2] - p.bb[0], p.bb[3] - p.bb[1]); }
      else drawParts(ctx, p.parts, it.rv);       // live "drawing in" only while revealing
      if (p.kind === 'spot' && it.rv >= 1 && SPR.fishIcon) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 19, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); blit(ctx, SPR.fishIcon, p.x, p.y + 10, 1, 1, 0, .95 - .25 * (Math.sin(st.t * .006) * .5 + .5)); }
    } else if (it.tf) {
      const tf = it.tf, sw = Math.sin(st.t * .0032 + tf.ph + tf.x * .01) * .16;
      ctx.globalAlpha = it.rv; ctx.strokeStyle = '#9fbf7f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let b = -1; b <= 1; b++) { const ang = sw + b * .45; ctx.beginPath(); ctx.moveTo(tf.x + b * 3, tf.y); ctx.quadraticCurveTo(tf.x + b * 3 + Math.sin(ang) * 5 * tf.s, tf.y - 6 * tf.s, tf.x + b * 3 + Math.sin(ang) * 10 * tf.s, tf.y - 12 * tf.s * Math.cos(ang)); ctx.stroke(); }
      ctx.globalAlpha = 1;
    } else {
      const a = it.a;
      if (a.shadow !== false) ctx.drawImage(LAYERS.shadow.c, a.x - a.s.w * .42, a.y - 7, a.s.w * .84, 14);
      if (a.halo) blit(ctx, a.halo, a.x, a.y + 4, a.sx || 1, a.sy || 1, a.rot || 0);
      blit(ctx, a.s, a.x, a.y - (a.lift || 0), a.sx || 1, a.sy || 1, a.rot || 0, a.alpha == null ? 1 : a.alpha);
      if (a.after) a.after(ctx);
    }
  }
  if (st.fx) st.fx(ctx);
  ctx.restore();
  // foreground (pre-blurred, parallax 1.4)
  { const f = 1.4, zf = 1 + (st.z - 1) * f; for (const o of FG) { const x = (o.x - st.cx * f) * zf + W / 2; if (x < -300 || x > W + 300) continue; const s = o.s; ctx.save(); ctx.translate(x, H + o.dy + (st.cy - 205) * -.4); if (o.flip) ctx.scale(-1, 1); ctx.drawImage(s.c, -s.w / 2, -s.h, s.w * zf, s.h * zf); ctx.restore(); } }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // light + dust motes
  ctx.drawImage(LAYERS.light, 0, 0, W, H);
  if (st.dusk > 0) { ctx.globalAlpha = st.dusk; ctx.drawImage(LAYERS.dusk, 0, 0, W, H); ctx.globalAlpha = 1; }
  ctx.fillStyle = '#FFF4D0';
  for (let i = 0; i < 22; i++) { const r = rng(100 + i), bx = r() * W, by = r() * H; const x = (bx + st.t * (.012 + r() * .02) - st.cx * .3) % (W + 40); const y = by + Math.sin(st.t * .0012 + i) * 14; ctx.globalAlpha = .25 + .35 * (Math.sin(st.t * .003 + i * 2) * .5 + .5); ctx.beginPath(); ctx.arc((x + W + 40) % (W + 40) - 20, y, 1.2 + r() * 1.6, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  // drifting leaves (screen space)
  for (let i = 0; i < 4; i++) { const x = ((i * 260 + st.t * .07) % (W + 120)) - 60, y = ((i * 97 + st.t * .03) % (H + 60)) - 30 + Math.sin(st.t * .002 + i) * 18; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(st.t * .003 + i) * 1.2); ctx.fillStyle = i % 2 ? '#E8A04A' : '#C9772E'; ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
  if (st.over) st.over(ctx);
  if (st.ui) ctx.drawImage(UI.hud, 0, 0, W, 70);
  if (st.flash > 0) { ctx.fillStyle = `rgba(255,252,240,${st.flash})`; ctx.fillRect(0, 0, W, H); }
  letterbox(ctx, st.lb || 0);
  if (st.wipe) st.wipe(ctx);
}
function letterbox(ctx, k) { if (k <= 0) return; const h = 46 * k; ctx.fillStyle = '#16121c'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); }

// ---------------------------------------------------------------- effects
function burst(ctx, x, y, u, seed, n, cols, spd, grav = 0) {   // deterministic particle burst at progress u (0..1)
  if (u <= 0 || u >= 1) return; const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, v = spd * (.5 + r() * .7), rot = r() * 6;
    const d = eOutCubic(u) * v; const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * .7 + grav * u * u;
    ctx.save(); ctx.translate(px, py); ctx.rotate(rot + u * 6); ctx.globalAlpha = 1 - u * u;
    ctx.fillStyle = cols[i % cols.length]; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(7, -3); ctx.lineTo(4, 5); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function speedLines(ctx, x, y, u, seed, n = 18, r0 = 70, r1 = 240, col = INK) { // marker strokes radiating outward
  if (u <= 0 || u >= 1) return; const r = rng(seed); ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + r() * .2; const a0 = r0 + eOutCubic(u) * (r1 - r0) * .55, a1 = a0 + 26 + r() * 40 * (1 - u);
    ctx.lineWidth = 4 * (1 - u) + 1; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * a0, y + Math.sin(a) * a0 * .8); ctx.lineTo(x + Math.cos(a) * a1, y + Math.sin(a) * a1 * .8); ctx.stroke(); }
}
function ring(ctx, x, y, u, r1, col = INK) { if (u <= 0 || u >= 1) return; ctx.globalAlpha = 1 - u; ctx.strokeStyle = col; ctx.lineWidth = 6 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(x, y, r1 * eOutCubic(u), r1 * .45 * eOutCubic(u), 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
function shake(t, t0, dur, amp, seed = 1) { const u = (t - t0) / dur; if (u < 0 || u > 1) return [0, 0]; const k = amp * Math.pow(1 - u, 2); return [Math.sin(t * .09 + seed) * k, Math.cos(t * .113 + seed * 3) * k]; }
function pageTurn(ctx, u, dir = 1) {  // fast page-turn wipe: a paper sheet sweeps across with its curled edge
  if (u <= 0 || u >= 1) return; const x = dir > 0 ? lerp(W + 120, -160, eInOutCubic(u)) : lerp(-160, W + 120, eInOutCubic(u));
  ctx.save(); ctx.fillStyle = PAPER; ctx.beginPath();
  if (dir > 0) { ctx.moveTo(x, 0); ctx.lineTo(W + 200, 0); ctx.lineTo(W + 200, H); ctx.lineTo(x - 90, H); } else { ctx.moveTo(-200, 0); ctx.lineTo(x, 0); ctx.lineTo(x - 90, H); ctx.lineTo(-200, H); }
  ctx.closePath(); ctx.fill();
  const gr = ctx.createLinearGradient(x - 60, 0, x + 40, 0); gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(.6, 'rgba(60,40,20,.25)'); gr.addColorStop(1, 'rgba(60,40,20,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 60, 0); ctx.lineTo(x - 30, H); ctx.lineTo(x - 120, H); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 90, H); ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- demo timeline (15 s loop)
const T = { walkEnd: 6900, pushIn: 6300, lbIn: 7050, antic: 7250, snap: 7650, open: 7710, impact: 7800, hold: 8500, tip: 8900, land: 9250, lbOut: 9700, cross: 9900, crossEnd: 12000, wipe: 14250 };
const STOP = 1838;
function trap(u, a = .1) { u = clamp(u); const v = 1 / (1 - a); return u < a ? v * u * u / (2 * a) : u > 1 - a ? 1 - v * (1 - u) * (1 - u) / (2 * a) : v * (u - a / 2); }
const leadX = t => lerp(160, STOP, trap(t / T.walkEnd, .07));
let CAM = null;
function buildCamera() {        // pre-integrated, critically-damped style follow (deterministic, scrubbable)
  const N = Math.ceil(LOOP / 1000 * 120); CAM = new Float32Array(N * 3); let cx = 460, cy = 205, z = 1, px = leadX(0);
  for (let i = 0; i < N; i++) {
    const t = i * 1000 / 120, dt = 1 / 120;
    const juice = juiceX(t), lx = t < T.lbOut ? leadX(t) : juice; const v = (lx - px) / dt; px = lx;
    let tx = lx + clamp(v * .32, -90, 90) + 40, ty = 205, tz = 1, k = 9;          // follow with lead
    if (t > 2600 && t < 4600) { tz = .86; ty = 190; k = 5; }                         // vista pull-back
    if (t > T.pushIn && t < T.lbIn) { tz = 1.14; tx = lerp(tx, 1930, .5); k = 7; }    // power spot nearby: push in
    if (t >= T.lbIn && t < T.lbOut) { tz = t < T.antic + 200 ? 1.4 : t < T.tip ? 1.18 : 1.22; tx = t < T.tip ? STOP + 40 : 1930; ty = t < T.antic + 200 ? 236 : t < T.tip ? 176 : 236; k = t < T.antic + 200 ? 14 : 10; }  // hero moment
    if (t >= T.lbOut) { k = 8; }
    if (t > 12400) { tz = .92; ty = 196; }
    const a = 1 - Math.exp(-k * dt); cx += (tx - cx) * a; cy += (ty - cy) * a; z += (tz - z) * (1 - Math.exp(-k * .8 * dt));
    CAM[i * 3] = cx; CAM[i * 3 + 1] = cy; CAM[i * 3 + 2] = z;
  }
}
function juiceX(t) { if (t < T.cross) return Math.min(leadX(Math.max(0, t - 380)), leadX(t) - 64); return lerp(STOP - 64, 2560, trap((t - T.cross) / (T.wipe - T.cross + 300), .12)); }
function beaverX(t) { if (t < T.cross + 250) return Math.min(leadX(Math.max(0, t - 760)), leadX(t) - 128); return lerp(STOP - 128, 2480, trap((t - T.cross - 250) / (T.wipe - T.cross + 50), .12)); }

function demoState(t) {
  // hit-stop: freeze motion for 90 ms at the snap-open impact
  const tm = t >= T.impact && t < T.impact + 80 ? T.impact : t;
  const i = Math.min(CAM.length / 3 - 1, Math.floor(tm / 1000 * 120));
  const st = { t: tm, cx: CAM[i * 3], cy: CAM[i * 3 + 1], z: CAM[i * 3 + 2], ui: true, actors: [] };
  const walking = tm < T.walkEnd - 150;
  const fx = leadX(tm), fy = 272;
  st.front = Math.max(leadX(tm), juiceX(tm)) + 420;
  st.dusk = clamp((st.cx - 900) / 1500) * .85;
  // letterbox
  st.lb = tm < T.lbIn ? 0 : tm < T.lbOut ? eOutCubic(seg(tm, T.lbIn, T.lbIn + 180)) : 1 - eInOutCubic(seg(tm, T.lbOut, T.lbOut + 220));
  // party
  const bob = (x, ph) => walking ? Math.abs(Math.sin(tm * .014 + ph)) * 4 : 0;
  const jx = juiceX(tm), bx = beaverX(tm);
  const jWalk = tm < T.walkEnd || (tm > T.cross && tm < T.wipe + 300);
  const onBridge = x => x > 1880 && x < 2010;
  st.actors.push({ s: SPR.juice, x: jx, y: 278, lift: (jWalk ? Math.abs(Math.sin(tm * .015 + 1)) * 4 : 0) + (onBridge(jx) ? 6 : 0), rot: jWalk ? Math.sin(tm * .015) * .05 : 0, zb: 30 });
  st.actors.push({ s: SPR.beaver, x: bx, y: 266, lift: (jWalk ? Math.abs(Math.sin(tm * .015 + 2)) * 4 : 0) + (onBridge(bx) ? 6 : 0), rot: jWalk ? Math.sin(tm * .015 + 1) * .05 : 0, zb: 30 });
  // owl wandering near the cart
  { const ox = 1610 + Math.sin(tm * .0011) * 50, oy = 206 + Math.sin(tm * .0019) * 14; st.actors.push({ s: SPR.owl, x: ox, y: oy, sx: Math.cos(tm * .0011) > 0 ? 1 : -1, lift: Math.abs(Math.sin(tm * .008)) * 6 }); }
  // the fish: walk, then the unfold
  const fish = { s: SPR.fish, x: fx, y: fy, lift: bob(fx, 0), rot: walking ? Math.sin(tm * .014) * .06 : 0 };
  let over = null, under = null;
  if (tm >= T.antic && tm < T.snap) {            // anticipation: squash down, wobble, crease appears
    const u = seg(tm, T.antic, T.snap); const q = eOutCubic(u);
    fish.sy = 1 - .2 * q; fish.sx = 1 + .14 * q; fish.rot = Math.sin(tm * .09) * .04 * q; fish.lift = 0;
    fish.after = c => { c.strokeStyle = INK; c.lineWidth = 2.5; c.setLineDash([6, 5]); c.globalAlpha = q; c.beginPath(); c.moveTo(fx - 36, fy - 38 * fish.sy); c.lineTo(fx + 36, fy - 38 * fish.sy); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; };
  } else if (tm >= T.snap && tm < T.open) {      // snap: folded shape flips edge-on (60 ms)
    const u = seg(tm, T.snap, T.open); fish.s = SPR.fishDark; fish.sy = .8 * (1 - u) + .02; fish.sx = 1.14;
  } else if (tm >= T.open && tm < T.tip) {       // OPEN: snaps up past full size, impact + hit-stop at the peak, then damped settle
    let sy, sx;
    if (tm < T.impact) { const u = eOutCubic(seg(tm, T.open, T.impact)); sy = .05 + 1.13 * u; sx = 1.25 - .3 * u; }
    else { const d = Math.max(0, tm - T.impact - 80); const w = Math.exp(-d * .009) * Math.cos(d * .03); sy = 1 + .18 * w; sx = 1 - .1 * w; }
    Object.assign(fish, { s: SPR.fishLong, sy, sx, lift: 0, rot: 0 });
    const wf = 1 - seg(tm, T.impact, T.impact + 220);
    if (wf > 0) fish.after = c => { c.globalAlpha = .85 * wf; blit(c, SPR.fishLongDark, fx, fy, sx, sy); c.globalAlpha = 1; };
  } else if (tm >= T.tip) {                      // tip over to become the bridge, landing with a thump
    const u = seg(tm, T.tip, T.land); const a = eInBack(u, 1.4) * Math.PI / 2;
    const landed = tm >= T.land; const sq = landed ? 1 - .12 * Math.exp(-(tm - T.land) * .012) * Math.cos((tm - T.land) * .04) : 1;
    Object.assign(fish, { s: SPR.fishLong, x: fx + 8, y: fy + 12, rot: Math.min(a, Math.PI / 2), lift: 0, shadow: false, sy: 1, sx: sq, zb: 2 });
  }
  st.actors.push(fish);
  // effects
  st.fx = c => {
    speedLines(c, fx, fy - 90, seg(t, T.impact, T.impact + 420), 5, 22, 70, 300);
    burst(c, fx, fy - 90, seg(t, T.impact, T.impact + 700), 9, 24, ['#E99DBB', '#FBF8F0', '#F0AACB'], 210, 140);
    ring(c, fx, fy, seg(t, T.impact, T.impact + 380), 160);
    ring(c, fx + 100, fy + 10, seg(t, T.land, T.land + 360), 140, '#3F86A6');
    burst(c, 1945, fy, seg(t, T.land, T.land + 600), 13, 16, ['#8CC8DC', '#FBF8F0'], 150, 160);
    if (tm >= T.antic && tm < T.snap) burst(c, fx, fy - 4, seg(tm, T.antic, T.snap), 4, 8, ['#E3D6BC'], 50, 0);
    if (tm >= T.impact + 80 && tm < T.hold + 200) {     // hand-lettered pop word
      const u = seg(tm, T.impact + 80, T.impact + 280), k = eOutBack(u, 3) * (1 - seg(tm, T.hold - 100, T.hold + 200));
      c.save(); c.translate(fx + 120, fy - 150); c.rotate(-.12); c.scale(k, k);
      c.font = '900 34px ' + FONT; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 8; c.strokeStyle = INK; c.strokeText('LONG!', 0, 0); c.fillStyle = '#E99DBB'; c.fillText('LONG!', 0, 0); c.restore();
    }
  };
  st.flash = t >= T.impact && t < T.impact + 120 ? .7 * (1 - (t - T.impact) / 120) : 0;
  st.leadX = fx; st.spotUsed = tm >= T.land;
  const s1 = shake(t, T.impact, 380, 10, 1), s2 = shake(t, T.land, 260, 5, 2), s0 = tm >= T.antic && tm < T.snap ? [Math.sin(t * .2) * 1.2, 0] : [0, 0];
  st.shake = [s1[0] + s2[0] + s0[0], s1[1] + s2[1] + s0[1]];
  // page-turn out at the end of the loop, page-turn in at the start
  st.wipe = c => { if (t > T.wipe) pageTurn(c, seg(t, T.wipe, LOOP + 250)); if (t < 400) { c.fillStyle = PAPER; c.globalAlpha = 1 - seg(t, 0, 400); c.fillRect(0, 0, W, H); c.globalAlpha = 1; } };
  return st;
}

// ---------------------------------------------------------------- battle (static frame)
function card(g, x, y, ic, word, badge, hits, active, seed) {
  const pts = [[x, y], [x + 150, y], [x + 150, y + 64], [x, y + 64]];
  const t = W_(pts, true, 1.1, seed); g.save(); g.translate(0, 4); g.fillStyle = 'rgba(70,45,20,.2)'; g.fill(t.p); g.restore();
  g.fillStyle = active ? '#FFF1A8' : PAPER; g.fill(t.p); g.strokeStyle = INK; g.lineWidth = active ? 4.5 : 3; g.stroke(t.p);
  icon(g, ic, x + 10, y + 12); g.fillStyle = INK; g.font = `800 ${word.length > 5 ? 17 : 21}px ${FONT}`; g.textAlign = 'left'; g.fillText(word, x + 56, y + 32);
  stars(g, hits, x + 64, y + 48); psBadge(g, badge, x + 150, y, 13);
}
function stars(g, n, x, y) { for (let i = 0; i < n; i++) { g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 3.2 : 6.8, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(x + i * 13 + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); g.fillStyle = '#D03C30'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke(); } }
function psBadge(g, k, cx, cy, r) {
  const col = { x: '#5b8fd6', o: '#e2574c', t: '#2fae8f' }[k]; g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.stroke();
  g.strokeStyle = col; g.lineWidth = 3.5; g.beginPath(); const s = r * .48;
  if (k === 'x') { g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s); g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s); }
  else if (k === 'o') g.arc(cx, cy, s, 0, 7); else { g.moveTo(cx, cy - s * 1.1); g.lineTo(cx + s, cy + s * .75); g.lineTo(cx - s, cy + s * .75); g.closePath(); }
  g.stroke();
}
function icon(g, k, x, y) {
  g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 3;
  const F = (pts, fill, s, cl = true) => { const t = W_(pts, cl, .5, s, 8); if (fill) { g.fillStyle = fill; g.fill(t.p); } g.stroke(t.p); };
  if (k === 'hide') { F([[6, 6], [28, 6], [34, 12], [34, 34], [6, 34]], '#F3D36A', 1); g.setLineDash([4, 4]); F([[6, 20], [34, 20]], null, 2, false); g.setLineDash([]); }
  if (k === 'splash') F([[20, 4], [30, 22], [28, 32], [20, 36], [12, 32], [10, 22]], '#8CC8DC', 3);
  if (k === 'open') { F([[4, 10], [18, 6], [18, 34], [4, 30]], '#E99DBB', 4); F([[22, 6], [36, 10], [36, 30], [22, 34]], '#E99DBB', 5); }
  if (k === 'hoot') { F(ell(14, 20, 9, 9, 10), '#EEB23E', 6); for (const r of [8, 14]) { g.beginPath(); g.arc(22, 20, r, -.8, .8); g.stroke(); } }
  g.restore();
}
function hearts(g, n, full, x, y, s, gap) { for (let i = 0; i < n; i++) { const h = W_(heartPts(x + i * gap, y, s), true, .5, 80 + i, 6); g.fillStyle = i < full ? '#D03C30' : PAPER; g.fill(h.p); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke(h.p); } }
function paperTag(g, x, y, w, h, s) { const t = W_([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, .6, s); g.save(); g.translate(0, 3); g.fillStyle = 'rgba(80,55,25,.2)'; g.fill(t.p); g.restore(); g.fillStyle = PAPER; g.fill(t.p); g.strokeStyle = '#cfc5b1'; g.lineWidth = 1.5; g.stroke(t.p); }

function renderBattle(ctx) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(LAYERS.sky, 0, 0, W, H);
  // low camera: horizon low-ish, far layer scaled up, the giant pumpkin looming behind the enemy
  const F = LAYERS.far; ctx.drawImage(F.c, -905, -8, F.c.width / DPR * 1.25, F.c.height / DPR * 1.25);
  const M = LAYERS.mid; ctx.drawImage(M.c, -300, 100, M.c.width / DPR, M.c.height / DPR);
  // ground plane in perspective
  const g = ctx; const gp = W_([[-40, 166], [W + 40, 160], [W + 40, H + 40], [-40, H + 40]], true, 2, 90, 30);
  g.fillStyle = PAPER; g.fill(gp.p); g.save(); g.clip(gp.p); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = g.createPattern(LAYERS.grain, 'repeat'); g.fillRect(0, 0, W * DPR, H * DPR); g.restore();
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.strokeStyle = '#d9cfbb'; g.lineWidth = 1.5; g.stroke(gp.p);
  const path = W_([[380, 166], [470, 166], [W + 60, H + 20], [-60, H + 20]], true, 2, 91, 30); g.fillStyle = '#F2E2BD'; g.fill(path.p); g.strokeStyle = PEN; g.lineWidth = 2; g.stroke(path.p);
  // scenery near horizon (small) — pencil
  for (const [x, y, s, sd] of [[60, 190, .6, 1], [150, 182, .5, 2], [720, 186, .55, 3], [800, 196, .7, 4], [260, 178, .4, 5]]) drawParts(g, makeProp('pumpkin', x, y, s, sd).parts, 1);
  drawParts(g, makeProp('scarecrow', 120, 176, 1, 7).parts.map(p => p), 1);
  // enemy stage + enemy
  const disc = W_(ell(618, 196, 110, 22, 18), true, 1.4, 92); g.save(); g.translate(0, 5); g.fillStyle = 'rgba(80,55,25,.18)'; g.fill(disc.p); g.restore(); g.fillStyle = '#E5EFCF'; g.fill(disc.p); g.strokeStyle = PEN; g.lineWidth = 2; g.stroke(disc.p);
  g.drawImage(LAYERS.shadow.c, 570, 186, 96, 18); blit(g, SPR.owlBig, 618, 198);
  // next-move bubble
  const bub = W_([[400, 54], [552, 54], [552, 120], [530, 120], [560, 140], [508, 120], [400, 120]], true, 1, 93); g.fillStyle = '#fff'; g.fill(bub.p); g.strokeStyle = INK; g.lineWidth = 3.5; g.stroke(bub.p);
  icon(g, 'hoot', 410, 66); g.fillStyle = INK; g.font = '800 21px ' + FONT; g.textAlign = 'left'; g.fillText('HOOT', 458, 90); stars(g, 1, 466, 106);
  g.fillStyle = '#6b655b'; g.font = '700 13px ' + FONT; g.textAlign = 'center'; g.fillText('next', 476, 48);
  // player: big, low, close to camera
  g.drawImage(LAYERS.shadow.c, 110, 350, 230, 40); blit(g, SPR.fishBig, 225, 378);
  // move effect: SPLASH as marker strokes in flight
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = INK; g.lineWidth = 17; g.beginPath(); g.moveTo(300, 250); g.quadraticCurveTo(420, 120, 540, 160); g.stroke();
  g.strokeStyle = '#8CC8DC'; g.lineWidth = 11; g.stroke();
  for (const [x, y, r] of [[560, 150, 9], [575, 178, 7], [548, 186, 6], [590, 160, 5]]) { const d = W_([[x, y - r * 1.6], [x + r, y], [x, y + r], [x - r, y]], true, .3, x); g.fillStyle = '#8CC8DC'; g.fill(d.p); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke(d.p); }
  speedLines(g, 600, 160, .35, 21, 14, 40, 160);
  // hit spark on the owl
  g.save(); g.translate(600, 150); g.rotate(.2); g.fillStyle = '#FFF1A8'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < 16; k++) { const r = k % 2 ? 14 : 34, a = k * Math.PI / 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); g.restore();
  // foreground blur
  g.drawImage(FG.find(o => o.s.w === 170).s.c, -50, 270, 210, 200);
  // UI
  paperTag(g, 14, 12, 228, 40, 94); hearts(g, 8, 6, 36, 32, 18, 26);
  paperTag(g, 668, 12, 160, 40, 95); hearts(g, 5, 3, 690, 32, 18, 28);
  card(g, 330, 300, 'hide', 'HIDE', 'x', 0, false, 96); card(g, 500, 300, 'splash', 'SPLASH', 'o', 1, true, 97); card(g, 670, 300, 'open', 'LONG', 't', 3, false, 98);
  g.drawImage(LAYERS.light, 0, 0, W, H);
}

// ---------------------------------------------------------------- boss intro (static frame)
function renderBoss(ctx) {
  const g = ctx; g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#2A2238'; g.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = .5; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = g.createPattern(LAYERS.grain, 'repeat'); g.fillRect(0, 0, W * DPR, H * DPR); g.restore(); g.setTransform(DPR, 0, 0, DPR, 0, 0);
  // inside the pumpkin: ribs as dim orange pencil
  g.strokeStyle = '#7a4a34'; g.lineWidth = 3;
  for (const [x, b] of [[-60, 160], [90, 90], [260, 40], [584, -40], [754, -90], [904, -160]]) { const r = W_([[x, -20], [x + b * .5, H / 2], [x, H + 20]], false, 2, x + 300, 20); g.stroke(r.p); }
  const floor = W_(ell(W / 2, H - 40, 520, 110, 24), true, 3, 301); g.fillStyle = '#382c4c'; g.fill(floor.p);
  // lantern pools (lit ground)
  const pool = radial(340, 110, [[0, 'rgba(255,205,120,.55)'], [.5, 'rgba(255,190,100,.22)'], [1, 'rgba(255,190,100,0)']]);
  g.drawImage(pool.c, 30, 270, 340, 110); g.drawImage(pool.c, 520, 250, 300, 96);
  for (const [x, len] of [[150, 90], [700, 70]]) { g.strokeStyle = '#120e18'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, len); g.stroke();
    const glow = radial(150, 150, [[0, 'rgba(255,214,140,.5)'], [1, 'rgba(255,214,140,0)']]); g.drawImage(glow.c, x - 75, len - 50, 150, 150);
    const l = W_([[x - 14, len], [x + 14, len], [x + 18, len + 34], [x - 18, len + 34]], true, .6, x); g.fillStyle = '#FFD27A'; g.fill(l.p); g.strokeStyle = INK; g.lineWidth = 3.5; g.stroke(l.p); }
  // boss ghost (stand-in redraw in his style: heart eyes, big open mouth)
  const glowB = radial(380, 380, [[0, 'rgba(190,230,255,.45)'], [.6, 'rgba(190,230,255,.12)'], [1, 'rgba(190,230,255,0)']]); g.drawImage(glowB.c, 390, -10, 380, 380);
  speedLines(g, 580, 170, .3, 31, 26, 120, 420, 'rgba(255,240,210,.7)');
  g.save(); g.translate(580, 300); g.scale(.82, .82); g.translate(-580, -300);
  const gb = W_([[490, 300], [486, 150], [510, 80], [580, 52], [650, 80], [676, 150], [672, 300], [646, 280], [620, 304], [592, 282], [566, 306], [540, 282], [514, 304]], true, 2, 302);
  g.fillStyle = '#FBF8F0'; g.fill(gb.p); g.strokeStyle = INK; g.lineWidth = 5.5; g.lineJoin = 'round'; g.stroke(gb.p);
  for (const d of [-1, 1]) { const e = W_(heartPts(580 + d * 34, 128, 34), true, .5, 303 + d, 6); g.fillStyle = INK; g.fill(e.p); g.fillStyle = '#fff'; g.beginPath(); g.arc(574 + d * 34, 120, 4, 0, 7); g.fill(); }
  const m = W_(ell(580, 196, 30, 34, 16), true, 1, 305); g.fillStyle = INK; g.fill(m.p);
  const arm = W_([[490, 190], [440, 150], [430, 120]], false, 1, 306); g.lineWidth = 5.5; g.stroke(arm.p); const arm2 = W_([[672, 190], [720, 160], [736, 120]], false, 1, 307); g.stroke(arm2.p); g.restore();
  // small ghosts with cream halos
  for (const [x, y, h] of [[430, 250, 46], [770, 220, 52], [720, 312, 40]]) { const s = SPR.ghostH; const k = h / s.h; blit(g, SPR.ghostHalo, x, y + 3 * k, k, k); blit(g, s, x, y, k, k); }
  // the party in the lantern pool: cream paper cut-out halos keep black outlines readable on dark
  for (const [k, x, y] of [['beaver', 110, 318], ['juice', 192, 326], ['fish', 276, 320]]) { g.drawImage(LAYERS.shadow.c, x - 32, y - 7, 64, 14); blit(g, SPR[k + 'Halo'], x, y + 5); blit(g, SPR[k], x, y); }
  // pumpkin mouth teeth framing the shot (we just came through)
  const top = [[-20, 46]]; for (let i = 0; i <= 12; i++) top.push([i * 72, 46 + (i % 2 ? 46 : 0)]); top.push([W + 20, 46], [W + 20, 30], [-20, 30]);
  const tt = W_(top, true, 1.5, 308, 20); g.fillStyle = '#C8661E'; g.fill(tt.p); g.strokeStyle = INK; g.lineWidth = 4.5; g.stroke(tt.p);
  const bot = [[-20, H - 46]]; for (let i = 0; i <= 12; i++) bot.push([i * 72 + 36, H - 46 - (i % 2 ? 18 : 0)]); bot.push([W + 20, H - 46], [W + 20, H - 30], [-20, H - 30]);
  const bt = W_(bot, true, 1.5, 309, 20); g.fill(bt.p); g.stroke(bt.p);
  // vignette + letterbox + title slam
  const vg = g.createRadialGradient(W / 2, H / 2, W * .25, W / 2, H / 2, W * .65); vg.addColorStop(0, 'rgba(10,6,16,0)'); vg.addColorStop(1, 'rgba(10,6,16,.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  letterbox(g, 1);
  g.save(); g.translate(W / 2, H - 14); g.rotate(-.02); g.font = '900 30px ' + FONT; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = INK; g.strokeText('BIG GHOST!', 0, 0); g.fillStyle = '#FBF8F0'; g.fillText('BIG GHOST!', 0, 0); g.restore();
  g.fillStyle = '#c9bfa8'; g.font = '700 13px ' + FONT; g.textAlign = 'center'; g.fillText('inside the giant pumpkin', W / 2, 30);
}

// ---------------------------------------------------------------- overworld still
function overworldState() {
  const st = { t: 3200, cx: 1560, cy: 200, z: 1, ui: true, front: 1e9, dusk: .25, actors: [] };
  st.actors.push({ s: SPR.beaver, x: 1400, y: 268 }, { s: SPR.juice, x: 1468, y: 278 }, { s: SPR.fish, x: 1545, y: 272, rot: .04, lift: 3 });
  st.actors.push({ s: SPR.owl, x: 1640, y: 206, sx: -1 }, { s: SPR.cat, x: 1240, y: 360 });
  return st;
}

// ---------------------------------------------------------------- boot
let READY = false;
async function boot() {
  await loadImages();
  sprite('fish', 78, 'fish_folded'); sprite('fishLong', 190, 'fish_unfolded'); sprite('juice', 72, 'juicebox'); sprite('beaver', 74, 'beaver'); sprite('owl', 70, 'orangeowl'); sprite('cat', 76, 'firecat');
  sprite('fishIcon', 26, 'fish_folded'); sprite('batfar', 24, 'bat'); sprite('ghostH', 60, 'ghost');
  sprite('owlBig', 130, 'orangeowl'); sprite('fishBig', 220, 'fish_folded');
  SPR.fishDark = tinted(SPR.fish, 'rgba(90,60,40,.35)'); SPR.fishLongDark = tinted(SPR.fishLong, 'rgba(255,252,240,1)');
  for (const k of ['fish', 'juice', 'beaver']) SPR[k + 'Halo'] = haloOf(SPR[k], 6, '#F3E9D2');
  SPR.ghostHalo = haloOf(SPR.ghostH, 5, '#E9F4FF');
  bakeGround(); bakeLayers(); buildWorld(); buildCamera();
  READY = true;
}
