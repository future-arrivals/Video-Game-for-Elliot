// Canvas rig runtime: draws a character as separately posed bitmap parts, ported from its demo page
// (Art/Demos/*_animation_demo.html). No SVG, no filters at runtime: one atlas image per character.
//
// API
//   loadRig(assets, id) -> Rig | null
//       Needs assets.img['rig_' + id] (the atlas) and assets.rigs[id] (its JSON); both come from loadAssets().
//       Cached in assets.cache.rigs. null if the character has no rig yet.
//   rig.clips -> { [name]: { name, label, dur (s), loop (bool), forms ([0] folded only, [1] open only, [0, 1] both) } }
//   rig.order -> clip names in the demo's key order (keys 1..6)
//   rigPose(rig, clip, t, opts?, out?) -> Pose
//       t: seconds into the clip. Looping clips wrap t, one-shot clips clamp it to [0, dur] (their last frame
//          is a rest pose). The demo pages loop every clip; the game should play the one-shots once.
//       opts.form: 0 folded .. 1 open (or 'folded' / 'open'); clips that drive the fold themselves ignore it.
//       opts.T: global seconds for the always-running layers (eye wander, blinks, idle sways). Default t.
//          Pass a running clock so the eyes do not jump when the clip changes.
//       opts.zoom: true applies the demo's "camera push-in" (folded drawn ~1.7x bigger than open; the unfold
//          clip zooms out as it opens). Default false: both forms at the same units-to-px scale, like drawMember.
//       out: a Pose from an earlier call to reuse (no allocation per frame apart from the clip's own maths).
//   drawRig(ctx, rig, pose, sx, sy, scale, opts?)
//       Draws the character with its feet at (sx, sy) in the current transform. scale = screen px per
//       character unit (the SVG's units; drawMember uses FOLDED_H / 287 for Munch). Draws, in order: glow,
//       ground shadow, the parts (with the hit flash). opts: { flip: false (mirror about the feet),
//       alpha: 1, shadow: true, glow: true, flashMax: .7 (house flash rule caps the demo's .8 white) }.
//   drawRigFx(ctx, rig, pose, sx, sy, scale, opts?)
//       The clip's particles (confetti, crumbs, stars, spike) and its word pop (POP!, CHOMP!, OUCH!...).
//       Separate so the game can draw it above everything else, or not at all. opts: { flip }.
//   pose.shake [dx, dy] and pose.scroll are stage effects (screen shake, the hop's scrolling ground) in demo
//   stage px; multiply by scale / rig.stagePx to get screen px. drawRig does not apply them.
//
// Rig JSON (Game/assets/rigs/<id>/rig.json, written by tools/rigparts.mjs)
//   { v: 1, id, scale: atlas px per unit, atlas: [w, h],
//     parts:  [[name, parentIndex | -1, pivotX, pivotY], ...]   in draw order, parents before children
//     layers: [[partIndex, ax, ay, aw, ah, ox, oy], ...]        in draw order: atlas rect (px) and where its
//                                                               top-left sits in the part's space (units) }
//   A part's world matrix = parent world x local; local = (clip's explicit local) x (accumulated pose about the
//   pivot: translate(pivot + x, y) rotate(r) skewX(k) scale(sx, sy) translate(-pivot)), the demos' formula.
//   Units: character units = the SVG's user units. "Stage px" = the demo page's 960x600 stage, which shows
//   the character at rig.stagePx px per unit (times zoom).
//
// Clip code (src/render/rigs/<id>.js) exports { id, stagePx, feet, clips, order, pose(c) }. pose(c) is the port
// of the demo's render(): it reads c.t, c.T, c.form, c.clip, c.useZoom and calls
//   c.add(part, { x, y, r, sx, sy, k })    accumulate like the demo's add()
//   c.local(part) / c.root()                -> matrix builder: .translate(x, y) .rotate(deg, cx?, cy?) .scale(sx, sy?) .skewX(deg)
//   c.alpha(part, a), c.hide(part), c.pivot(part) -> [x, y]
// and sets c.zoom, c.open, c.shadow, c.glow, c.flash, c.shake, c.scroll, c.fx (array), c.word.
import monster from './rigs/monster.js';

const DEFS = { monster };
const INK = '#1a1a1a';

/* ---------- loading ---------- */
export function loadRig(assets, id) {
  const cache = assets.cache.rigs || (assets.cache.rigs = {});
  if (id in cache) return cache[id];
  const def = DEFS[id], json = assets.rigs && assets.rigs[id], im = assets.img['rig_' + id];
  if (!def || !json || !im) return (cache[id] = null);
  const n = json.parts.length;
  const rig = {
    id, def, clips: def.clips, order: def.order, stagePx: def.stagePx, feet: def.feet, scale: json.scale,
    n, names: json.parts.map(p => p[0]), index: new Map(json.parts.map((p, i) => [p[0], i])),
    parent: Int16Array.from(json.parts, p => p[1]), piv: Float64Array.from(json.parts.flatMap(p => [p[2], p[3]])),
    // per layer: part, sx, sy, sw, sh (atlas px), dx, dy, dw, dh (units)
    L: Float64Array.from(json.layers.flatMap(l => [l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[3] / json.scale, l[4] / json.scale])),
    nl: json.layers.length, img: toCanvas(im, json.atlas), tints: new Map(), sprites: null,
  };
  return (cache[id] = rig);
}
function toCanvas(im, [w, h]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(im, 0, 0, w, h); return c;
}

/* ---------- matrices: [a, b, c, d, e, f] at offset o, SVG/canvas order ---------- */
const D2R = Math.PI / 180;
function mul(A, ao, B, bo, O, oo) { // O = A x B (O may alias A or B)
  const a = A[ao] * B[bo] + A[ao + 2] * B[bo + 1], b = A[ao + 1] * B[bo] + A[ao + 3] * B[bo + 1];
  const c = A[ao] * B[bo + 2] + A[ao + 2] * B[bo + 3], d = A[ao + 1] * B[bo + 2] + A[ao + 3] * B[bo + 3];
  const e = A[ao] * B[bo + 4] + A[ao + 2] * B[bo + 5] + A[ao + 4], f = A[ao + 1] * B[bo + 4] + A[ao + 3] * B[bo + 5] + A[ao + 5];
  O[oo] = a; O[oo + 1] = b; O[oo + 2] = c; O[oo + 3] = d; O[oo + 4] = e; O[oo + 5] = f;
}
const ident = (M, o) => { M[o] = 1; M[o + 1] = 0; M[o + 2] = 0; M[o + 3] = 1; M[o + 4] = 0; M[o + 5] = 0; };
const TMP = new Float64Array(6);
/** Chainable post-multiplying builder over one slot of a matrix array (like an SVG transform list). */
class MatB {
  constructor() { this.M = null; this.o = 0; }
  at(M, o) { this.M = M; this.o = o; ident(M, o); return this; }
  apply(a, b, c, d, e, f) { TMP[0] = a; TMP[1] = b; TMP[2] = c; TMP[3] = d; TMP[4] = e; TMP[5] = f; mul(this.M, this.o, TMP, 0, this.M, this.o); return this; }
  translate(x, y = 0) { return this.apply(1, 0, 0, 1, x, y); }
  scale(sx, sy = sx) { return this.apply(sx, 0, 0, sy, 0, 0); }
  rotate(deg, cx, cy) {
    const r = deg * D2R, c = Math.cos(r), s = Math.sin(r);
    if (cx == null) return this.apply(c, s, -s, c, 0, 0);
    return this.translate(cx, cy).apply(c, s, -s, c, 0, 0).translate(-cx, -cy);
  }
  skewX(deg) { return this.apply(1, 0, Math.tan(deg * D2R), 1, 0, 0); }
}

/* ---------- pose ---------- */
class Pose {
  constructor(rig) {
    const n = rig.n; this.rig = rig;
    this.lm = new Float64Array(n * 6); this.world = new Float64Array(n * 6); this.rootM = new Float64Array(6);
    this.hasLocal = new Uint8Array(n); this.acc = new Float64Array(n * 6); this.hasAcc = new Uint8Array(n);
    this.alphaP = new Float32Array(n); this.vis = new Uint8Array(n);
    this.fx = []; this.shake = [0, 0]; this._b = new MatB(); this._warned = new Set();
    // bound so clip code can keep `const A = c.add`
    this.add = (id, o) => {
      const i = this.idx(id); if (i < 0) return; const a = this.acc, k = i * 6;
      if (!this.hasAcc[i]) { this.hasAcc[i] = 1; a[k] = 0; a[k + 1] = 0; a[k + 2] = 0; a[k + 3] = 0; a[k + 4] = 1; a[k + 5] = 1; }
      if (o.x) a[k] += o.x; if (o.y) a[k + 1] += o.y; if (o.r) a[k + 2] += o.r; if (o.k) a[k + 3] += o.k;
      if (o.sx) a[k + 4] *= o.sx; if (o.sy) a[k + 5] *= o.sy;          // demo: `if(o.sx)a.sx*=o.sx`
    };
  }
  idx(id) {
    const i = this.rig.index.get(id);
    if (i === undefined) { if (!this._warned.has(id)) { this._warned.add(id); console.warn(`rig ${this.rig.id}: no part named ${id}`); } return -1; }
    return i;
  }
  local(id) { const i = this.idx(id); if (i < 0) return this._b.at(TMP_SINK, 0); this.hasLocal[i] = 1; return this._b.at(this.lm, i * 6); }
  root() { return this._b.at(this.rootM, 0); }
  alpha(id, a) { const i = this.idx(id); if (i >= 0) this.alphaP[i] *= a; }
  hide(id) { const i = this.idx(id); if (i >= 0) this.vis[i] = 0; }
  pivot(id) { const i = this.idx(id); return i < 0 ? [0, 0] : [this.rig.piv[i * 2], this.rig.piv[i * 2 + 1]]; }
}
const TMP_SINK = new Float64Array(6);

export function rigPose(rig, clip, t, opts = {}, out) {
  const P = out && out.rig === rig ? out : new Pose(rig);
  const def = rig.def, cd = def.clips[clip] || def.clips[def.order[0]];
  t = cd.loop ? ((t % cd.dur) + cd.dur) % cd.dur : Math.min(cd.dur, Math.max(0, t));
  let form = opts.form ?? 0; if (form === 'open') form = 1; else if (form === 'folded') form = 0;
  P.clip = cd.name; P.t = t; P.T = opts.T ?? t; P.form = form; P.useZoom = !!opts.zoom; P.dur = cd.dur; P.loop = cd.loop;
  P.hasLocal.fill(0); P.hasAcc.fill(0); P.alphaP.fill(1); P.vis.fill(1); ident(P.rootM, 0);
  P.fx.length = 0; P.word = null; P.glow = null; P.flash = null; P.shadow = null; P.shake[0] = P.shake[1] = 0; P.scroll = 0;
  P.zoom = 1; P.open = form;
  def.pose(P);
  P.k = P.useZoom ? P.zoom : 1;
  // world matrices, inherited alpha/visibility
  const n = rig.n, W = P.world, Lm = P.lm, A = P.acc, pv = rig.piv, par = rig.parent;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    if (P.hasLocal[i]) { W[o] = Lm[o]; W[o + 1] = Lm[o + 1]; W[o + 2] = Lm[o + 2]; W[o + 3] = Lm[o + 3]; W[o + 4] = Lm[o + 4]; W[o + 5] = Lm[o + 5]; }
    else ident(W, o);
    if (P.hasAcc[i]) {
      const px = pv[i * 2], py = pv[i * 2 + 1], r = A[o + 2] * D2R, cs = Math.cos(r), sn = Math.sin(r), tk = Math.tan(A[o + 3] * D2R), sx = A[o + 4], sy = A[o + 5];
      // R x skewX x S = [cs, sn, -sn, cs] x [1, 0, tk, 1] x [sx, 0, 0, sy]
      const a = cs * sx, b = sn * sx, c = (cs * tk - sn) * sy, d = (sn * tk + cs) * sy;
      TMP[0] = a; TMP[1] = b; TMP[2] = c; TMP[3] = d; TMP[4] = px + A[o] - (a * px + c * py); TMP[5] = py + A[o + 1] - (b * px + d * py);
      mul(W, o, TMP, 0, W, o);
    }
    const p = par[i];
    if (p >= 0) { mul(W, p * 6, W, o, W, o); P.alphaP[i] *= P.alphaP[p]; if (!P.vis[p]) P.vis[i] = 0; }
  }
  return P;
}

/* ---------- drawing ---------- */
function sprites(rig) {
  if (rig.sprites) return rig.sprites;
  const radial = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
  };
  // the demos' #shadowG and #glowG radial gradients, baked once
  return (rig.sprites = {
    shadow: radial([[0, 'rgba(58,42,16,.5)'], [.6, 'rgba(58,42,16,.22)'], [1, 'rgba(58,42,16,0)']]),
    glow: radial([[0, 'rgba(255,246,192,.95)'], [.5, 'rgba(255,226,122,.45)'], [1, 'rgba(255,226,122,0)']]),
  });
}
function tint(rig, c) { // atlas silhouette in one colour (the demo's flash colour matrix, baked per colour)
  const key = c.join(',');
  let t = rig.tints.get(key); if (t) return t;
  t = document.createElement('canvas'); t.width = rig.img.width; t.height = rig.img.height;
  const g = t.getContext('2d'); g.drawImage(rig.img, 0, 0); g.globalCompositeOperation = 'source-in';
  g.fillStyle = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`; g.fillRect(0, 0, t.width, t.height);
  rig.tints.set(key, t); return t;
}
const M0 = new Float64Array(6), MW = new Float64Array(6);

export function drawRig(ctx, rig, pose, sx, sy, scale, opts = {}) {
  const base = ctx.getTransform(), ga = ctx.globalAlpha, a0 = ga * (opts.alpha ?? 1), flip = opts.flip ? -1 : 1;
  const fs = scale / rig.stagePx;                                     // demo stage px -> screen px
  const sp = sprites(rig);
  if (opts.glow !== false && pose.glow) {
    const g = pose.glow; ctx.globalAlpha = a0 * g.a;
    ctx.drawImage(sp.glow, sx + (g.x * flip - g.r) * fs, sy + (g.y - g.r) * fs, 2 * g.r * fs, 2 * g.r * fs);
  }
  if (opts.shadow !== false && pose.shadow) {
    const s = pose.shadow; ctx.globalAlpha = a0 * s.a;
    ctx.drawImage(sp.shadow, sx + (s.x * flip - s.rx) * fs, sy + (s.y - s.ry) * fs, 2 * s.rx * fs, 2 * s.ry * fs);
  }
  // M0 = base x translate(sx, sy) x scale(f * flip, f) x root
  const f = scale * pose.k;
  M0[0] = base.a * f * flip; M0[1] = base.b * f * flip; M0[2] = base.c * f; M0[3] = base.d * f;
  M0[4] = base.a * sx + base.c * sy + base.e; M0[5] = base.b * sx + base.d * sy + base.f;
  mul(M0, 0, pose.rootM, 0, M0, 0);
  const L = rig.L, W = pose.world, img = rig.img, fl = opts.flash !== false && pose.flash;
  const flA = fl ? Math.min(fl.a, opts.flashMax ?? .7) : 0, tim = flA > .01 ? tint(rig, fl.c) : null;
  for (let j = 0, o = 0; j < rig.nl; j++, o += 9) {
    const p = L[o]; if (!pose.vis[p]) continue;
    const al = pose.alphaP[p]; if (al <= .002) continue;
    mul(M0, 0, W, p * 6, MW, 0);
    ctx.setTransform(MW[0], MW[1], MW[2], MW[3], MW[4], MW[5]);
    ctx.globalAlpha = a0 * al;
    ctx.drawImage(img, L[o + 1], L[o + 2], L[o + 3], L[o + 4], L[o + 5], L[o + 6], L[o + 7], L[o + 8]);
    if (tim) { ctx.globalAlpha = a0 * al * flA; ctx.drawImage(tim, L[o + 1], L[o + 2], L[o + 3], L[o + 4], L[o + 5], L[o + 6], L[o + 7], L[o + 8]); }
  }
  ctx.setTransform(base); ctx.globalAlpha = ga;
}

/* ---------- fx: the demos' <symbol>s and word pop ---------- */
const SYMBOLS = {
  star: 'M0,-10 L3,-3.5 L10,-3 L4.6,1.6 L6.2,8.6 L0,4.8 L-6.2,8.6 L-4.6,1.6 L-10,-3 L-3,-3.5Z',
  dot: 'M5,0 A5,5 0 1 1 -5,0 A5,5 0 1 1 5,0Z',
  scrap: 'M-5,-3.5 L5,-3.5 Q6,-3.5 6,-2.5 L6,2.5 Q6,3.5 5,3.5 L-5,3.5 Q-6,3.5 -6,2.5 L-6,-2.5 Q-6,-3.5 -5,-3.5Z',
  spike: 'M0,-30 L7,-12 L26,-20 L15,-4 L34,2 L14,8 L22,28 L6,16 L0,34 L-6,16 L-22,28 L-14,8 L-34,2 L-15,-4 L-26,-20 L-7,-12Z',
};
let PATHS = null;
const WORD_FONT = '900 52px Andika, "Avenir Next Rounded", "Arial Rounded MT Bold", Verdana, sans-serif';

export function drawRigFx(ctx, rig, pose, sx, sy, scale, opts = {}) {
  if (!pose.fx.length && !pose.word) return;
  if (!PATHS) PATHS = Object.fromEntries(Object.entries({ ...SYMBOLS, ...(rig.def.symbols || {}) }).map(([k, d]) => [k, new Path2D(d)]));
  const base = ctx.getTransform(), a0 = ctx.globalAlpha, flip = opts.flip ? -1 : 1, fs = scale / rig.stagePx;
  ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  for (const o of pose.fx) {
    const path = PATHS[o.k]; if (!path || o.a <= 0) continue;
    ctx.setTransform(base); ctx.translate(sx + o.x * fs * flip, sy + o.y * fs); ctx.rotate((o.r || 0) * D2R * flip); ctx.scale(o.s * fs, o.s * fs);
    ctx.globalAlpha = a0 * (o.a ?? 1); ctx.fillStyle = o.c; ctx.lineWidth = 2.5 / Math.max(o.s, .3);
    ctx.fill(path); ctx.stroke(path);
  }
  const w = pose.word;
  if (w && w.a > .001) {
    ctx.setTransform(base); ctx.translate(sx + w.x * fs * flip, sy + w.y * fs); ctx.rotate(w.r * D2R * flip); ctx.scale(w.s * fs, w.s * fs);
    ctx.globalAlpha = a0 * w.a; ctx.font = WORD_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.fillStyle = '#FFF1A8';
    ctx.strokeText(w.text, 0, 0); ctx.fillText(w.text, 0, 0);
  }
  ctx.setTransform(base); ctx.globalAlpha = a0;
}
