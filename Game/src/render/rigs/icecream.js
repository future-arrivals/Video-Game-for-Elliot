// Scoops (ids `icecream` = open tower, `icecream_folded` = folded cone) ported from Art/Demos/scoops_animation_demo.html.
// The demo draws two separate pictures (#rigU open, #rigF folded) and swaps between them, so there are two rigs
// that share this file: the maths is written once, `makeDef(open)` picks the drawing. Numbers, timings and
// keyframes are copied unchanged from the demo; only the plumbing differs:
//   demo add(id, o)         -> c.add(id, o)  (skipped for parts the other drawing does not have)
//   demo setEl(el, matrix)  -> c.local(part).apply(...matrix)  (the demo's DOMMatrix chain, kept as plain arrays)
//   demo api.S(lx, ly)      -> S(lx, ly): stage px relative to the feet
//   demo fxAdd / wordPop    -> c.fx.push / wordPop(c, ...)
// Left out: the Unfold clip. It swaps one drawing for the other mid-clip, which needs both rigs at once; the game
// draws its own hinge flip for that.
import { TAU, PI, sin, cos, exp, abs, clamp, lerp, sm, eob, eoc, wrap, cl, keys, rng, wordPop } from './kit.js';

/* ---------- stage constants (demo: "stage constants") ---------- */
const KF = 1.05, KU = .62;
const CXU = 270, GU = 815, CXF = 190, GF = 412;
const COL = ['#D03C37', '#FFD23C', '#2fadaa', '#ef96c0', '#963a19', '#7cc3e8', '#fbfaf6'];
const B = o => Object.assign({ x: 0, y: 0, r: 0, sx: 1, sy: 1 }, o);
const breath = t => { const b = sin(TAU * t / 3.2); return b + .25 * sin(TAU * t / 1.6); };
const volume = sy => 1 + (1 - sy) * .55;
const KOF = f => f ? KU : KF;

/* ---------- 2D matrices as [a, b, c, d, e, f], post-multiplied like the demo's DOMMatrix ---------- */
const I = () => [1, 0, 0, 1, 0, 0];
const mul = (A, B2) => [A[0] * B2[0] + A[2] * B2[1], A[1] * B2[0] + A[3] * B2[1], A[0] * B2[2] + A[2] * B2[3], A[1] * B2[2] + A[3] * B2[3],
  A[0] * B2[4] + A[2] * B2[5] + A[4], A[1] * B2[4] + A[3] * B2[5] + A[5]];
const tr = (M, x, y = 0) => mul(M, [1, 0, 0, 1, x, y]);
const sc = (M, x, y = x) => mul(M, [x, 0, 0, y, 0, 0]);
const rt = (M, deg) => { const r = deg * PI / 180, c = cos(r), s = sin(r); return mul(M, [c, s, -s, c, 0, 0]); };

/* ---------- helpers pasted from the demo ---------- */
function confetti(c, t, t0, ox, oy, n, seed, speed = 520, life = 1.6) {
  const tau = t - t0; if (tau < 0 || tau > life) return; const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = -PI / 2 + (R() - .5) * 2.3, v = speed * (.45 + R() * .7), vx = cos(a) * v, vy = sin(a) * v;
    c.fx.push({ k: i % 3 ? 'scrap' : 'star', x: ox + vx * tau, y: oy + vy * tau + .5 * 900 * tau * tau, s: (i % 3 ? 1.1 : .9) * (.8 + R() * .6), r: R() * 360 + tau * (R() - .5) * 900, c: COL[i % COL.length], a: 1 - sm((tau - life * .55) / (life * .45)) });
  }
}
function sweat(c, t, t0, t1, every, ox, oy, seed, amt = 1) {
  if (t < t0 || t > t1) return;
  const n0 = Math.floor((t - t0) / every);
  for (let k = Math.max(0, n0 - 3); k <= n0; k++) {
    const ts = t0 + k * every, tau = t - ts; if (tau < 0 || tau > .7) continue; const q = rng(seed + k * 13); const side = q() < .5 ? -1 : 1;
    const vx = side * (70 + q() * 90), vy = -(120 + q() * 120);
    c.fx.push({ k: 'drop', x: ox + side * (30 + q() * 20) + vx * tau, y: oy + vy * tau + .5 * 700 * tau * tau, s: (.7 + q() * .4) * amt, r: side * (20 + tau * 160), c: '#7cc3e8', a: 1 - sm((tau - .45) / .25) });
  }
}
function mkBlinks(seed) { const a = [], R = rng(seed); let t = .6 + R() * 1.5; for (let i = 0; i < 300; i++) { a.push(t); const r = R(); if (r < .18) a.push(t + .26); t += 1.3 + R() * 3.6 + (r > .85 ? 2.2 : 0); } return a; }
const BL = [null, mkBlinks(11), mkBlinks(23), mkBlinks(37), mkBlinks(41), mkBlinks(59)];
function blinkAmt(arr, T) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= T) lo = m; else hi = m - 1; }
  const d = T - arr[lo]; if (d < 0 || d > .2) return 0; return d < .07 ? d / .07 : 1 - sm((d - .07) / .13);
}
function flashAt(h) {
  if (h < 0) return null; if (h < .06) return { a: .8, c: [1, 1, 1] }; if (h < .12) return { a: 0, c: [1, 1, 1] }; if (h < .2) return { a: .7, c: [1, 1, 1] };
  if (h < .8) return { a: .55 * exp(-5 * (h - .2)), c: [1, .35, .32] }; return null;
}

/* ---------- clips (demo: M.idle, M.walk, M.lift, M.hurt, M.happy). state(t, form) as in the demo ---------- */
const M = {};
M.idle = { label: 'Idle', dur: 6.4, loop: true,
  state(t, form) { const sy = 1 + .02 * breath(t); return { b: B({ sy, sx: volume(sy), r: .5 * sin(TAU * t / 6.4) }), form, K: KOF(form) }; },
  extra(c, A) {
    const { t } = c;
    const hb = sm(sin(TAU * t / 1.6) * .5 + .5); A('h3L', { sx: 1 + .07 * hb, sy: 1 + .07 * hb }); A('h3R', { sx: 1 + .07 * hb, sy: 1 + .07 * hb });
    const g = sm((t - 2.3) / .3) * (1 - sm((t - 3.9) / .4)); const cu = g * (.5 - .5 * cos(TAU * (t - 2.3) / .75));
    c.arm.u[0] += .75 * cu; c.arm.u[1] += .75 * (g * (.5 - .5 * cos(TAU * (t - 2.38) / .75)));
    A('b5L', { y: 3 * g, r: 8 * g }); A('b5R', { y: 3 * g, r: -8 * g }); A('m5', { sx: 1 + .25 * g }); A('x2L', { sx: 1 + .15 * g, sy: 1 + .15 * g }); A('x2R', { sx: 1 + .15 * g, sy: 1 + .15 * g });
    c.sc[3].sy *= 1 + .02 * g;
  } };

const WP = 1.1;
M.walk = { label: 'Waddle', dur: 2.2, loop: true,
  state(t, form) {
    const ph = TAU * t / WP, ay = abs(sin(ph));
    const sy = 1 + .045 * ay - .08 * Math.pow(1 - ay, 5);
    return { b: B({ x: 7 * cos(ph), y: 11 * ay, r: -3.4 * cos(ph), sy, sx: volume(sy) }), form, K: KOF(form) };
  },
  extra(c, A) {
    const { t } = c; const ph = TAU * t / WP, k = cos(ph), ay = abs(sin(ph));
    const kk = 24 * k; A('lm8', { r: kk }); A('lm6', { r: kk * .7 }); A('lm9', { r: -kk }); A('lm7', { r: -kk * .7 });
    A('lm4', { r: kk * .8 }); A('lm5', { r: -kk * .8 });
    for (let i = 0; i < 6; i++) A('lm' + i, { r: (i % 2 ? -1 : 1) * 5 * sin(ph * 2 + i) });
    c.arm.u[0] += .12 + .5 * sin(ph - .5); c.arm.u[1] += .12 - .5 * sin(ph - .5 + .2);
    c.arm.psi[0] += -14 * sin(ph - 1.3); c.arm.psi[1] += 14 * sin(ph - 1.3);
    A('chL', { r: -12 * (ay - .5) }); A('chR', { r: 12 * (ay - .5) });
  },
  scroll(t) { return t * 210; } };

const strain = t => keys(t, [[0, 0], [.7, 0], [1.7, 1], [2.3, 1], [2.95, .15], [3.1, 0], [6.4, 0]]);
const liftU = t => keys(t, [[0, -.9], [.5, -.9], [1.8, 1.0], [2.35, 1.0], [3.0, -.7], [3.3, -.9], [3.45, -1.1], [3.62, 1.35], [3.78, 1.25], [4.02, 1.28], [4.15, .1], [4.5, .05], [4.62, 1.38], [5.2, 1.3], [5.65, .4], [6.1, -.5], [6.4, -.9]]);
M.lift = { label: 'Lift', dur: 6.4, loop: true, forms: [1],
  state(t) {
    const s = strain(t);
    const sy = keys(t, [[0, 1], [.4, .95], [1.7, .94], [2.35, .93], [2.9, 1], [3.2, .9], [3.42, .8], [3.52, 1.13], [3.8, 1.07], [4.02, 1.1], [4.1, .78], [4.22, 1.04], [4.45, .92], [4.55, 1.12], [4.95, 1.06], [5.12, .88], [5.25, 1.03], [5.5, 1], [6.4, 1]]) + .012 * breath(t);
    const y = 34 * sin(PI * clamp((t - 3.52) / .55)) + 20 * sin(PI * clamp((t - 4.55) / .46));
    return { b: B({ x: 1.6 * s * sin(TAU * 21 * t), y, sy, sx: volume(sy) }), form: 1, K: KU };
  },
  extra(c, A, api) {
    const { t } = c; const s = strain(t), u = liftU(t);
    const tr1 = sin(TAU * 19 * t), tr2 = sin(TAU * 23 * t + 1.3);
    c.arm.u[0] = u + .05 * s * tr1; c.arm.u[1] = u + .05 * s * tr2;
    c.arm.psi[0] += -5 * u + 3 * s * tr2; c.arm.psi[1] += 5 * u - 3 * s * tr1;
    c.arm.psi[0] += 12 * s; c.arm.psi[1] += -12 * s;
    for (let j = 1; j <= 5; j++) c.sc[j].a += s * (.9 + .3 * j) * sin(TAU * 20 * t + j * 1.7);
    for (let j = 1; j <= 5; j++) c.sc[j].x += s * .9 * sin(TAU * 24 * t + j * 2.1);
    A('b5L', { y: 7 * s, r: 12 * s }); A('b5R', { y: 7 * s, r: -12 * s });
    A('e5L', { sy: 1 - .5 * s, sx: 1 + .12 * s }); A('e5R', { sy: 1 - .5 * s, sx: 1 + .12 * s });
    A('m5', { sx: 1 + .35 * s, sy: 1 + .8 * s + .3 * s * tr2 });
    A('e4L', { sy: 1 - .85 * s }); A('e4R', { sy: 1 - .85 * s });
    A('h3L', { sx: 1 - .15 * s, sy: 1 - .15 * s, y: 3 * s * tr1 }); A('h3R', { sx: 1 - .15 * s, sy: 1 - .15 * s, y: 3 * s * tr2 }); A('m3', { sx: 1 + .6 * s, sy: 1 + .6 * s });
    A('x2L', { sx: 1 + .35 * s, sy: 1 + .35 * s, x: 1.5 * s * tr1 }); A('x2R', { sx: 1 + .35 * s, sy: 1 + .35 * s, x: -1.5 * s * tr2 });
    A('e1L', { sx: 1 + .28 * s, sy: 1 + .28 * s }); A('e1R', { sx: 1 + .28 * s, sy: 1 + .28 * s }); A('m1', { sx: 1 + .2 * s, sy: 1 + .5 * s });
    for (const n of ['lm8', 'lm6']) A(n, { r: -12 * s + 4 * s * tr1 }); for (const n of ['lm9', 'lm7']) A(n, { r: 12 * s + 4 * s * tr2 });
    A('chL', { r: 6 * s * tr1 }); A('chR', { r: -6 * s * tr2 });
    const ex = sm((t - 2.95) / .15) * (1 - sm((t - 3.4) / .3));
    A('m5', { sx: 1 + .5 * ex, sy: 1 + .9 * ex });
    const tri = keys(t, [[3.5, 0], [3.62, 1], [5.4, 1], [5.9, 0]]);
    A('e5L', { sy: 1 - .55 * tri, sx: 1 + .12 * tri }); A('e5R', { sy: 1 - .55 * tri, sx: 1 + .12 * tri }); A('e4L', { sy: 1 - .55 * tri }); A('e4R', { sy: 1 - .55 * tri });
    A('e1L', { sy: 1 - .5 * tri }); A('e1R', { sy: 1 - .5 * tri });
    const bt = tri * (.5 + .5 * sin(TAU * 3.2 * t)); A('h3L', { sx: 1 + .25 * bt, sy: 1 + .25 * bt }); A('h3R', { sx: 1 + .25 * bt, sy: 1 + .25 * bt });
    A('m5', { sx: 1 + .4 * tri, sy: 1 + .3 * tri });
    const pump = keys(t, [[3.5, 0], [3.62, 1], [4.1, .4], [4.5, .3], [4.62, 1], [5.3, .6], [5.8, 0]]);
    for (let i = 0; i < 6; i++) A('lm' + i, { r: (i % 2 ? -1 : 1) * pump * 14 * sin(TAU * 4 * t + i) });
    const [hx, hy] = api.S(268, 150);
    sweat(c.c, t, 1.0, 2.6, .16, hx, hy - 4, 31, 1); sweat(c.c, t, 3.62, 4.6, .18, hx, hy, 57, .9);
    const [wx, wy] = api.S(268, 10);
    api.word('UNNGH...', wx, wy + 16, t, 1.55, .95, -4);
    api.word('YEAH!', wx - 10, wy + 16, t, 3.64, .8, -7);
    api.word('YEAH!!', wx + 10, wy + 16, t, 4.66, .9, 6);
    confetti(c.c, t, 3.6, hx, hy, 24, 4, 620, 1.7); confetti(c.c, t, 4.62, hx, hy, 32, 9, 720, 1.9);
  },
  shake(t) { let s = 0; const q = t - 4.07; if (q > 0 && q < .4) s += exp(-12 * q) * sin(66 * q) * 6; const r = t - 3.55; if (r > 0 && r < .3) s += exp(-12 * r) * sin(60 * r) * 4; return s; } };

const HT = .45;
M.hurt = { label: 'Ouch! (hurt)', dur: 3.6, loop: false,
  state(t, form) {
    const h = t - HT; let x = 0, y = 0, r = 0, sx = 1, sy = 1;
    if (h > 0) {
      x = -96 * eoc(h / .4); if (h > 1.25) x = -96 * (1 - sm((h - 1.25) / .8));
      y = 22 * sin(PI * clamp(h / .42)) + (h > 1.25 && h < 2.05 ? 9 * sin(PI * (h - 1.25) / .8) : 0);
      r = -12 * exp(-4.2 * h) * cos(12 * h) + (h > 1.25 && h < 2.1 ? 3 * sin(PI * (h - 1.25) / .85) : 0);
      sx = 1 - .22 * exp(-9 * h) * cos(24 * h); sy = 1 + .26 * exp(-9 * h) * cos(24 * h);
    } else { sy = 1 + .02 * breath(t); sx = volume(sy); }
    return { b: B({ x, y, r, sx, sy }), form, K: KOF(form), flash: flashAt(h) };
  },
  extra(c, A, api) {
    const { t } = c; const h = t - HT; if (h <= 0) return; const w = exp(-3 * h), e = exp(-1.5 * h);
    for (let j = 1; j <= 5; j++) { const hh = h - .05 * j; if (hh > 0) c.sc[j].a += 13 * exp(-3 * hh) * sin(14 * hh); }
    for (const n of ['e5L', 'e5R', 'e4L', 'e4R', 'e1L', 'e1R']) A(n, { sx: 1 + .4 * e, sy: 1 + .4 * e });
    A('b5L', { r: 14 * exp(-1.2 * h), y: -5 * exp(-1.2 * h) }); A('b5R', { r: -14 * exp(-1.2 * h), y: -5 * exp(-1.2 * h) });
    A('m5', { sx: 1 + .5 * e, sy: 1 + 1.8 * e }); A('m3', { sx: 1 + .8 * e, sy: 1 + .8 * e }); A('m1', { sx: 1 + .4 * e, sy: 1 + .9 * e });
    A('x2L', { sx: 1 + .35 * e, sy: 1 + .35 * e, y: -3 * w }); A('x2R', { sx: 1 + .35 * e, sy: 1 + .35 * e, y: -3 * w });
    const hs = .75 + .3 * sin(18 * h) * w; A('h3L', { sx: hs, sy: hs }); A('h3R', { sx: hs, sy: hs });
    c.arm.u[0] += 1.2 * w * (.55 + .45 * cos(11 * h)); c.arm.u[1] += 1.2 * w * (.55 + .45 * cos(11 * h + .6));
    c.arm.psi[0] += 40 * w * sin(13 * h); c.arm.psi[1] += -40 * w * sin(13 * h + .4);
    A('chL', { r: -55 * w * sin(13 * h) }); A('chR', { r: 55 * w * sin(13 * h + .5) });
    for (let i = 0; i < 10; i++) A('lm' + i, { r: (i % 2 ? -1 : 1) * 26 * w * sin(15 * h + i) });
    const [bx, by] = api.S(270, 330);
    if (h < .3) { const s = eob(h / .1) * (1 - sm((h - .18) / .12)); c.c.fx.push({ k: 'spike', x: bx + (c.form ? 90 : 70), y: by - 40, s: 2.1 * s, r: h * 60, c: '#FFD23C', a: 1 }); }
    const tp = api.S(268, 14);
    api.word('OUCH!', tp[0] - 30, tp[1] + 30, t, HT + .04, .8, -10);
    if (h > .35 && h < 1.9) {
      const a = 1 - sm((h - 1.5) / .4), [hx, hy] = api.S(268, c.form ? 50 : 90);
      for (let i = 0; i < 3; i++) { const an = h * 5 + i * TAU / 3; c.c.fx.push({ k: 'star', x: hx + cos(an) * 80, y: hy + sin(an) * 20, s: .9 + .2 * sin(an + 1), r: an * 40, c: i == 1 ? '#ef96c0' : '#FFD23C', a }); }
    }
  },
  shake(t) { const h = t - HT; return h > 0 && h < .4 ? exp(-9 * h) * sin(70 * h) * 7 : 0; } };

M.happy = { label: 'Yay! (happy)', dur: 3.4, loop: false,
  state(t, form) {
    let y = 0, sy = 1 + .02 * breath(t);
    const hop = (s, e, H) => { const u = (t - s) / (e - s); return u > 0 && u < 1 ? H * 4 * u * (1 - u) : 0; };
    y = hop(.55, 1.15, 60) + hop(1.95, 2.7, 56);
    sy *= keys(t, [[0, 1], [.2, .82], [.28, .84], [.36, 1.15], [.9, 1.06], [1.15, 1.08], [1.22, .78], [1.34, 1.06], [1.45, 1], [1.7, 1], [1.85, .8], [1.95, .82], [2.02, 1.1], [2.55, 1.04], [2.7, 1.06], [2.78, .78], [2.92, 1.06], [3.05, .99], [3.4, 1]]);
    return { b: B({ y, sy, sx: volume(sy) }), form, K: KOF(form) };
  },
  extra(c, A, api) {
    const { t } = c;
    const up = keys(t, [[0, 0], [.25, -.4], [.45, 0], [.55, 1.2], [1.15, 1.2], [1.4, .25], [1.7, 0], [1.85, -.4], [1.95, -.3], [2.02, 1.3], [2.7, 1.3], [2.95, .15], [3.4, 0]]);
    const w = sin(TAU * 3.2 * t);
    c.arm.u[0] = up + (up > .5 ? .12 * w : 0); c.arm.u[1] = up + (up > .5 ? .12 * sin(TAU * 3.2 * t + 1) : 0);
    c.arm.psi[0] += up > .5 ? 10 * w : 0; c.arm.psi[1] += up > .5 ? -10 * sin(TAU * 3.2 * t + 1) : 0;
    const sq = keys(t, [[0, 0], [.3, .6], [.5, 1], [1.2, 1], [1.5, 0], [1.8, .4], [2, 1], [2.8, 1], [3.0, 0]]);
    for (const n of ['e5L', 'e5R', 'e4L', 'e4R', 'e1L', 'e1R']) A(n, { sy: 1 - .62 * sq, sx: 1 + .12 * sq });
    A('b5L', { y: -4 * sq, r: -8 * sq }); A('b5R', { y: -4 * sq, r: 8 * sq }); A('m5', { sx: 1 + .5 * sq, sy: 1 + .5 * sq }); A('m1', { sx: 1 + .3 * sq, sy: 1 + .3 * sq }); A('m3', { sx: 1 + .4 * sq, sy: 1 + .4 * sq });
    const hb = 1 + .22 * sq * (.5 + .5 * sin(TAU * 3.2 * t)); A('h3L', { sx: hb, sy: hb }); A('h3R', { sx: hb, sy: hb });
    A('x2L', { sy: 1 - .3 * sq }); A('x2R', { sy: 1 - .3 * sq });
    const bounce = sin(TAU * 3.2 * t) * sq; A('chL', { r: -14 * bounce }); A('chR', { r: 14 * bounce });
    for (let i = 0; i < 10; i++) A('lm' + i, { r: (i % 2 ? -1 : 1) * sq * 9 * sin(TAU * 3.2 * t + i * .5) });
    if (t > 1.95 && t < 2.9) for (let j = 1; j <= 5; j++) { const u = (t - 1.95 - .075 * (j - 1)) / .55; c.sc[j].spin = u > 0 && u < 1 ? cos(TAU * sm(u)) : 1; }
    const [cx, cy] = api.S(268, 200);
    confetti(c.c, t, .95, cx, cy, 22, 5, 560, 1.7); confetti(c.c, t, 2.45, cx, cy, 32, 8, 700, 1.9);
    const tp = api.S(268, 14);
    api.word('YAY!', tp[0] + 140, tp[1] + 50, t, .62, .9, 8);
    api.word('WHEE!', tp[0] - 140, tp[1] + 50, t, 2.1, .9, -8);
  } };

/* ---------- joints and the dumbbell arms ---------- */
const JU = [null, [270, 680], [270, 598], [268, 465], [268, 372], [268, 236]];
const ARM = { L: { S: [178, 550], H: [102, 467] }, R: { S: [374, 520], H: [441, 432] } };
for (const k of ['L', 'R']) { const a = ARM[k]; a.v = [a.H[0] - a.S[0], a.H[1] - a.S[1]]; a.a0 = Math.atan2(a.v[1], a.v[0]) * 180 / PI; }
const LB = [5, 5, 4, 4, 3, 3, 0, 0, 0, 0];   // which scoop's matrix each open-form limb rides

/* demo: defaults(c, A), the always-on secondary motion */
function defaults(c, A) {
  const { T, b, lag, vel } = c;
  for (let j = 1; j <= 5; j++) {
    const L = lag(.05 * j), s = c.sc[j];
    s.a = cl((L.x - b.x) * .07, 6) + cl((L.r - b.r) * .7, 6) + (.5 + .18 * j) * sin(TAU * T / 4.4 - .9 * j);
    s.sy = 1 + cl((L.y - b.y) * .0022, .06) + cl((L.sy - b.sy) * .8, .1) + .013 * sin(TAU * T / 3.2 - .5 * j);
  }
  const lx = 2.4 * sin(.6 * T) + 1.2 * sin(1.7 * T + 1), ly = 1 * sin(.9 * T + 2);
  const bl = j => 1 - .92 * blinkAmt(BL[j], T);
  A('e5L', { x: lx, y: ly, sy: bl(5) }); A('e5R', { x: lx, y: ly, sy: bl(5) });
  A('e4L', { x: lx * .8, y: ly, sy: bl(4) }); A('e4R', { x: lx * .8, y: ly, sy: bl(4) });
  A('e1L', { x: lx * .8, y: ly, sy: bl(1) }); A('e1R', { x: lx * .8, y: ly, sy: bl(1) });
  A('b5L', { x: lx * .5 }); A('b5R', { x: lx * .5 });
  const vc = vel(.07);
  A('chL', { r: -cl(vc.y * .03, 32) + cl(-vc.x * .02, 16) + 3 * sin(1.7 * T) + cl(vc.r * .2, 14) }); A('chR', { r: cl(vc.y * .03, 32) + cl(-vc.x * .02, 16) + 3 * sin(1.5 * T + 1) + cl(vc.r * .2, 14) });
  A('stem', { r: 2 * sin(1.9 * T) });
  for (let i = 0; i < 10; i++) {
    const sg = (i % 2 ? -1 : 1); const vv = vel(.05 + .02 * (i >> 1));
    A('lm' + i, { r: sg * (cl(-vv.y * .012, 12) + 3 * sin(1.3 * T + i * .9)) + cl(-vv.x * .02, 9) });
  }
  const va = vel(.06);
  c.arm.u = [.06 * sin(1.3 * T) + cl(-va.y * .0035, .6), .06 * sin(1.15 * T + 1) + cl(-va.y * .0035, .6)];
  c.arm.psi = [cl(va.y * .01, 12) + 2 * sin(1.5 * T), -cl(va.y * .01, 12) - 2 * sin(1.4 * T + 1)];
}

/* demo: drawU / drawF (the matrices the demo writes onto the scoop groups, limbs, arms) */
function drawU(c, X, A) {
  const { sc: S } = X; let Mx = I(), prevD = 0, prevX = 0; const As = [I()]; let prevST = 1;
  for (let j = 1; j <= 5; j++) {
    const s = S[j], J = JU[j];
    const lift = j > 1 ? -(JU[j - 1][1] - J[1]) * (prevST - 1) : 0;
    Mx = tr(Mx, s.x - prevX, s.dy - prevD + lift); Mx = tr(Mx, J[0], J[1]); Mx = rt(Mx, s.a); Mx = tr(Mx, -J[0], -J[1]); prevD = s.dy + 0 * lift; prevX = s.x;
    const stj = s.st * s.sy; prevST = stj;
    let Aj = Mx; if (stj !== 1) Aj = tr(sc(tr(Aj, J[0], J[1]), 1, stj), -J[0], -J[1]);
    { const sx2 = s.sxs * s.spin; if (sx2 !== 1) Aj = tr(sc(tr(Aj, CXU, 0), sx2, 1), -CXU, 0); }
    As[j] = Aj; c.local('u-scoop-' + j).apply(...Aj);
  }
  c.local('u-cherries').apply(...As[5]);
  for (let i = 0; i < 10; i++) c.local('lm' + i).apply(...As[LB[i]]);
  const k = X.arm.k;
  [['L', 0], ['R', 1]].forEach(([n, i]) => {
    const a = ARM[n], u = X.arm.u[i], sgn = i ? -1 : 1;
    const phi = sgn * (u >= 0 ? 26 * u : 40 * u), sl = u > 0 ? 1 + .7 * Math.min(u, 1.5) : 1 + .12 * u;
    const Sx = a.S, H0 = a.H;
    let Mm = tr(As[2], Sx[0], Sx[1]); Mm = sc(Mm, k); Mm = rt(Mm, phi); Mm = rt(Mm, a.a0); Mm = sc(Mm, sl, 1); Mm = rt(Mm, -a.a0); Mm = tr(Mm, -Sx[0], -Sx[1]);
    const r = phi * PI / 180, vx = a.v[0] * sl, vy = a.v[1] * sl;
    const H = [Sx[0] + k * (vx * cos(r) - vy * sin(r)), Sx[1] + k * (vx * sin(r) + vy * cos(r))];
    let D = tr(As[2], H[0], H[1]); D = sc(D, k); D = rt(D, X.arm.psi[i]); D = tr(D, -H0[0], -H0[1]);
    c.local('arm' + n).apply(...Mm); c.local('db' + n).apply(...D);
  });
}
function drawF(c, X) {
  const { sc: S, st } = X; const s1 = S[1], s5 = S[5];
  let M1 = tr(I(), s1.x, 0); M1 = tr(M1, 190, 285); M1 = rt(M1, s1.a * .8); M1 = tr(M1, -190, -285);
  const A1 = s1.spin !== 1 ? tr(sc(tr(M1, CXF, 0), s1.spin, 1), -CXF, 0) : M1;
  const fl = st.flap == null ? 1 : st.flap;
  let M5 = tr(M1, s5.x * .8, 0); M5 = tr(M5, 190, 254); M5 = rt(M5, s5.a * .9 + S[3].a * .3); M5 = sc(M5, 1, s5.sy * Math.max(fl, .0001)); M5 = tr(M5, -190, -254);
  const A5 = s5.spin !== 1 ? tr(sc(tr(M5, CXF, 0), s5.spin, 1), -CXF, 0) : M5;
  c.local('f-scoop-1').apply(...A1); c.local('f-scoop-5').apply(...A5); c.local('f-cherries').apply(...A5);
  const lb = [A5, A5, A1, A1, I(), I()];
  for (let i = 0; i < 6; i++) c.local('lm' + i).apply(...lb[i]);
}

/* ---------- per-frame pose (demo: render(T)) ---------- */
function makePose(open) {
  const FORM = open ? 1 : 0, CX = open ? CXU : CXF, CG = open ? GU : GF;
  return function pose(c) {
    const m = M[c.clip], t = c.t, T = c.T, rig = c.rig;
    const A = (id, o) => { if (rig.index.has(id)) c.add(id, o); };
    const st = m.state(t, FORM), b = st.b, K = st.K;
    c.zoom = 1; c.open = FORM;
    const lag = d => m.state(wrap(t - d, m.dur), FORM).b;
    const vel = d => { const a = lag(d), q = lag(d + .04); return { x: (a.x - q.x) / .04, y: (a.y - q.y) / .04, r: (a.r - q.r) / .04, sy: (a.sy - q.sy) / .04 }; };
    const X = { t, T, st, b, form: FORM, lag, vel, c, sc: [null], arm: { u: [0, 0], psi: [0, 0], k: 1 } };
    for (let j = 1; j <= 5; j++) X.sc[j] = { a: 0, sy: 1, st: 1, sxs: 1, x: 0, dy: 0, spin: 1 };
    defaults(X, A);
    const S = (lx, ly) => [(lx - CX + b.x) * K, (ly - CG - b.y) * K];
    const api = { S, word: (txt, x, y, tt, t0, life, rot) => wordPop(c, txt, x, y, tt, t0, life, rot) };
    if (m.extra) m.extra(X, A, api);
    c.root().translate(b.x, -b.y).rotate(b.r).scale(b.sx, b.sy).translate(-CX, -CG);
    if (open) drawU(c, X, A); else drawF(c, X);
    /* shadow (stage px, relative to the feet) */
    const hgt = Math.max(b.y, 0), sc2 = 1 / (1 + hgt / 260);
    const rx = (open ? 112 : 118) * K * sc2 * (1 + (1 - b.sy) * .5);
    c.shadow = { x: b.x * K, y: 3, rx, ry: rx * .15, a: .95 * (.4 + .6 * sc2) };
    c.scroll = c.clip === 'walk' ? M.walk.scroll(t) : 0;
    const shk = m.shake ? m.shake(t) : 0; c.shake[0] = shk; c.shake[1] = shk * .4;
    c.flash = st.flash && st.flash.a > .01 ? st.flash : null;
  };
}

const clipsOf = (names, open) => Object.fromEntries(names.map(k => [k, { name: k, label: M[k].label, dur: M[k].dur, loop: M[k].loop, forms: M[k].forms || (open ? [1] : [0]) }]));
function makeDef(open) {
  const names = open ? ['idle', 'walk', 'lift', 'hurt', 'happy'] : ['idle', 'walk', 'hurt', 'happy'];
  const clips = clipsOf(names, open);
  return {
    id: open ? 'icecream' : 'icecream_folded', name: open ? 'Scoops' : 'Scoops (folded)',
    stagePx: open ? KU : KF,                 // demo stage px per unit in this form
    feet: open ? [CXU, GU] : [CXF, GF],
    forms: open ? { open: 1 } : { folded: 0 },
    clips, order: names,
    symbols: { drop: 'M0 -13 C 6 -3 9 3 0 9 C -9 3 -6 -3 0 -13Z' },
    pose: makePose(open),
  };
}
export const icecream_folded = makeDef(false);
export default makeDef(true);
