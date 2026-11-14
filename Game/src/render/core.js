// Drawing constants and helpers shared by all render modules.
// Wobble lines, rng, easings are ported from Source/a2_engine.js (the A2 demo).

export const W = 844, H = 390;                 // logical screen
export const TILE_W = 48, TILE_D = 30;         // one tile: 48 across x 30 deep
export const HORIZON = 86, GROUND_BOTTOM = 356; // screen bands at zoom 1
export const INK = '#1a1a1a', PEN = '#9d9485', PAPER = '#FBF8F0';
export const FONT = 'Andika, "Avenir Next Rounded", "Arial Rounded MT Bold", Verdana, sans-serif';

// Bake scales. DPR = logical px -> backing px for screen-sized bakes; BS = bake scale for world sprites
// (a little higher so a 1.3x push-in stays crisp). Set once by main.js before anything is baked.
export const R = { DPR: 1, BS: 1.3 };
export function setBakeScale(pxPerLogical) {
  R.DPR = Math.max(1, Math.min(2.5, pxPerLogical));
  R.BS = Math.min(2.6, R.DPR * 1.3);
}

// world (tile units) -> world px at zoom 1
export const wx = x => x * TILE_W;
export const wy = y => HORIZON + y * TILE_D;

// ---------------------------------------------------------------- utils
export function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, u) => a + (b - a) * u;
export const eOutCubic = u => 1 - Math.pow(1 - u, 3);
export const eInCubic = u => u * u * u;
export const eInOutCubic = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
export const eOutBack = (u, s = 2.2) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
export const eInBack = (u, s = 1.8) => (s + 1) * u * u * u - s * u * u;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}

// ---------------------------------------------------------------- wobble lines
export function wobPts(pts, closed, amp = 1.6, seed = 1, step = 14) {
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
export function toPath(pts, closed) {
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
/** Wobbly marker path through points: {p: Path2D, len, bb}. */
export const wob = (pts, closed = true, amp = 1.6, seed = 1, step = 14) => toPath(wobPts(pts, closed, amp, seed, step), closed);
export function ell(cx, cy, rx, ry, n = 18, jit = 0, seed = 0) { const r = rng(seed); const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + (r() - .5) * jit; o.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]); } return o; }
export function heartPts(cx, cy, s) { const o = []; for (let i = 0; i < 28; i++) { const t = i / 28 * Math.PI * 2; o.push([cx + 16 * Math.pow(Math.sin(t), 3) * s / 32, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s / 32]); } return o; }

/** Paper tag (UI): wobbly rectangle with a soft baked drop shadow. */
export function paperTag(g, x, y, w, h, seed) {
  const t = wob([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, .6, seed);
  g.save(); g.translate(0, 3); g.fillStyle = 'rgba(80,55,25,.18)'; g.fill(t.p); g.restore();
  g.fillStyle = PAPER; g.fill(t.p); g.strokeStyle = '#cfc5b1'; g.lineWidth = 1.5; g.stroke(t.p);
}
