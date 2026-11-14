// Heartfin (id `fish`): clip code ported from Art/Demos/heartfin_animation_demo.html (its <script>, sections
// "modes" and "render"). Numbers, timings, keyframes and seeds are copied unchanged; only the plumbing differs:
//   demo add(id, o)         -> c.add(id, o)           (A below; `beat` is not a part, it is summed locally)
//   demo setT(id, '...')    -> c.local(part).translate(...)...   (same SVG transform-list order)
//   demo api.S(cx, cy)      -> S(cx, cy): stage px relative to the feet (absolute demo numbers: x - SX, y - GY)
//   demo fxAdd / wordPop    -> c.fx.push / wordPop(c, ...)
// Part names are the ids tools/rigparts.mjs finds in the demo's DOM (see fish.build.mjs):
//   demo finL finR head seg1..5 -> part-fin-left part-fin-right part-head part-seg-1..5
//   demo tailB (clone of the tail, clip clipB) -> tailB-o ; the tail wrapper that scales with the beat -> tailA-o
// The two clip-paths (clipA below the seam, clipB above) sit inside moving wrappers in the demo, so they are
// baked into the bitmaps at rest and nothing moves under a fixed clip.
import {
  TAU, PI, sin, cos, exp, abs, max, clamp, lerp, sm, eob, eoc, eic, wrap, keys, rng, breath,
  blinker, wordPop,
} from './kit.js';

/* ---------- stage constants (demo: "stage constants") ---------- */
const SX = 480, GY = 540, KB = .43, CX = 270, CGY = 990;
const HB = 162, SEAM = 790, GAP = SEAM - HB;
const zoomOf = o => 1 + .78 * (1 - clamp(o));
const cl = (x, m) => clamp(x, -m, m);

const B = o => Object.assign({ x: 0, y: 0, r: 0, sx: 1, sy: 1, pv: 0, bend: 0 }, o);
const volume = sy => 1 + (1 - sy) * .65;
const bendK = o => .45 + .55 * clamp(o);
const pxu = (p, o) => p / (KB * zoomOf(o));
const bump = (u, w) => u > 0 && u < w ? sin(PI * u / w) : 0;
const lub = (t, per, off = 0) => { const u = wrap(t - off, per); return bump(u, .16) + .65 * bump(u - .2, .16); };
const armsUp = (A, u, wob = 0, T = 0) => { A('armL', { r: u + wob * sin(7 * T) }); A('armR', { r: -u - wob * sin(7 * T + 1) }); };
const blinkAmt = blinker(11, 1.1, 3.4);

const COL = ['#f0aacb', '#ec86b6', '#f06a8a', '#FFF1A8', '#7cc3e8', '#fbfaf6', '#FFD23C'];
const PINKS = ['#f0aacb', '#ec86b6', '#f06a8a', '#ffc2dc'];

/* ---------- Heartfin's own particle helpers (demo: confetti, rise, sparkle; they differ from the kit's) ---------- */
function confetti(c, t, t0, ox, oy, n, seed, speed = 520, life = 1.6) {
  const tau = t - t0; if (tau < 0 || tau > life) return; const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = -PI / 2 + (R() - .5) * 2.3, v = speed * (.45 + R() * .7), vx = cos(a) * v, vy = sin(a) * v;
    const kk = i % 3 == 0 ? 'heart' : i % 3 == 1 ? 'scrap' : 'star';
    c.fx.push({ k: kk, x: ox + vx * tau, y: oy + vy * tau + .5 * 900 * tau * tau, s: (kk == 'heart' ? .95 : 1) * (.8 + R() * .6), r: R() * 360 + tau * (R() - .5) * 900, c: kk == 'heart' ? PINKS[i % 4] : COL[i % COL.length], a: 1 - sm((tau - life * .55) / (life * .45)) });
  }
}
function rise(c, t, t0, ox, oy, n, seed, life = 1.7, spread = 50, rh = 150) {
  const tau = t - t0; if (tau < 0 || tau > life) return; const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const d = R() * .4 * life, sx = (R() - .5) * 2 * spread, hh = rh * (.6 + R() * .6), sc = .65 + R() * .55, ph = R() * 6; const u = (tau - d) / (life - .4 * life); if (u < 0 || u > 1) continue;
    c.fx.push({ k: 'heart', x: ox + sx + sin(u * 5 + ph) * 14, y: oy - u * hh, s: sc * eob(u * 4) * (1 - sm((u - .7) / .3) * .4), r: sin(u * 5 + ph) * 16, c: PINKS[i % 4], a: 1 - sm((u - .6) / .4) });
  }
}
function sparkle(c, t, t0, ox, oy, n, seed, speed = 150, life = .8, kinds = ['star', 'plus']) {
  const tau = t - t0; if (tau < 0 || tau > life) return; const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, v = speed * (.4 + R() * .8), u = tau / life;
    c.fx.push({ k: kinds[i % kinds.length], x: ox + cos(a) * v * tau, y: oy + sin(a) * v * tau - 30 * tau, s: (.5 + R() * .6) * (1 - u * .6) * eob(tau * 8), r: R() * 90, c: i % 2 ? '#FFF1A8' : '#fbfaf6', a: 1 - sm((u - .5) / .5) });
  }
}

/* ---------- clips (demo: M.idle ... M.happy). state(t, form) -> { b, open, zoom, flash? } ---------- */
const M = {};
/* 1: idle */
M.idle = { label: 'Idle', dur: 6.4, loop: true,
  state(t, form) { const br = breath(t); const sy = 1 + .022 * br; return { b: B({ sy, sx: volume(sy), r: .8 * sin(TAU * t / 6.4), bend: (10 * sin(TAU * t / 6.4) + 5 * sin(TAU * t / 3.2 + 1)) * bendK(form) }), open: form, zoom: zoomOf(form) }; },
  extra(t, st, T, A, api) {
    A('beat', { x: lub(t, 1.6) });
    const [hx, hy] = api.head(st); rise(api.c, t, 3.0, hx + 20, hy - 30, 1, 4, 1.8, 6, 130);
  } };
/* 2: waddle */
const WP = 1.2;
M.walk = { label: 'Waddle', dur: 2.4, loop: true,
  state(t, form) {
    const ph = TAU * t / WP, o = form;
    const y = pxu(9, o) * (1 - cos(2 * ph)) / 2, r = 3.2 * sin(ph), sy = 1 - .025 * cos(2 * ph);
    return { b: B({ y, r, sy, sx: volume(sy), bend: (20 + 9 * sin(ph - .5)) * bendK(o) }), open: o, zoom: zoomOf(o) };
  },
  extra(t, st, T, A, api) {
    const ph = TAU * t / WP; const s = sin(ph), c = cos(ph);
    const lift = (v) => max(0, -v);
    A('legL', { r: -30 * s, sy: 1 - .14 * lift(c * 0 + s) }); A('legX', { r: -26 * s, sy: 1 - .14 * lift(s) });
    A('legRL', { r: 30 * s, sy: 1 - .14 * lift(-s) }); A('legRS', { r: 26 * s, sy: 1 - .14 * lift(-s) });
    A('armL', { r: 16 * s - 6 }); A('armR', { r: -16 * s + 6 });
    A('part-fin-left', { r: -14 * sin(2 * ph) }); A('part-fin-right', { r: 14 * sin(2 * ph + .4) });
    A('whiskL', { r: 9 * sin(2 * ph + 1) }); A('whiskR', { r: -9 * sin(2 * ph + 1) });
    A('beat', { x: lub(t, WP) * .5 });
    A('smile', { sy: 1 + .1 * max(0, sin(2 * ph)) });
  },
  scroll(T) { return T * 110; } };
/* 3: unfold */
const UT = 1.5, CT = 5.7;
const SEG_T = [2.2, 2.56, 2.92, 3.28, 3.64];
M.unfold = { label: 'Unfold', dur: 7.4, loop: false, forms: [0],
  state(t) {
    const br = breath(t); let sy = 1 + .02 * br, x = 0, y = 0, open = 0, bend = 0, r = 0;
    if (t < UT) {
      const c = sm((t - .6) / .4) * (1 - sm((t - 1.4) / .1)), sh = sm((t - .9) / .55);
      sy *= 1 - .2 * c; x = 3.5 * sh * sin(TAU * 9 * (t - .6)); open = 0;
    } else if (t < CT) {
      const tau = t - UT; open = 1 - exp(-4.2 * tau) * cos(5.4 * tau);
      sy = keys(tau, [[0, .8], [.09, 1.2], [.26, .94], [.42, 1.04], [.62, 1], [1, 1]]) * (1 + .015 * br * sm(tau - .8));
      y = pxu(10, 1) * sin(PI * clamp(tau / .46)); bend = 24 * exp(-2.4 * tau) * sin(8 * tau + .4);
      if (tau > 2.45) { bend += 0; }
    } else {
      const tc = t - CT; const o = 1 - eic(tc / .3) * 1.04; open = tc < .3 ? o : 0;
      sy = tc < .3 ? lerp(1.03, 1.1, tc / .3) : keys(tc - .3, [[0, .72], [.12, 1.1], [.3, .96], [.5, 1.01], [.8, 1]]);
      if (tc > 1.7) sy = 1 + .02 * br;
    }
    const oc = clamp(open, 0, 1.08);
    return { b: B({ x, y, r, sy, sx: volume(sy), bend: bend * bendK(oc) }), open: oc, zoom: zoomOf(oc) };
  },
  extra(t, st, T, A, api) {
    const tau = t - UT;
    if (t < UT) {
      const w = sm((t - .8) / .5), sh = sm((t - .9) / .55);
      A('eyeL', { sx: 1 + .35 * w, sy: 1 + .35 * w }); A('eyeR', { sx: 1 + .35 * w, sy: 1 + .35 * w });
      A('armL', { r: -sh * 7 * sin(TAU * 12 * t) - w * 16 }); A('armR', { r: sh * 7 * sin(TAU * 12 * t + 1) + w * 16 });
      A('smile', { sx: 1 - .3 * w, sy: 1 - .5 * w });
      A('beat', { x: (t < .6 ? lub(t, 1.1) : lub(t, max(.28, lerp(.9, .28, sm((t - .5) / .9))))) * (1 + sh * .5) });
      A('legL', { r: sh * 4 * sin(TAU * 14 * t) }); A('legRL', { r: -sh * 4 * sin(TAU * 14 * t + 1) });
    }
    if (t >= UT && t < CT) {
      const a = sm(tau / .2) * (1 - sm((tau - .5) / .7));
      armsUp(A, 26 * a + 8 * exp(-2 * tau) * sin(14 * tau));
      A('eyeL', { sx: 1 + .3 * exp(-3 * tau), sy: 1 + .3 * exp(-3 * tau) }); A('eyeR', { sx: 1 + .3 * exp(-3 * tau), sy: 1 + .3 * exp(-3 * tau) });
      A('smile', { sx: 1 + .25 * sm(tau * 2), sy: 1 + .4 * sm(tau * 2) });
      A('part-fin-left', { sx: eob((tau - .2) / .35), r: 20 * exp(-2.5 * tau) * sin(15 * tau) }); A('part-fin-right', { sx: eob((tau - .25) / .35), r: -20 * exp(-2.5 * tau) * sin(15 * tau + .5) });
      A('whiskL', { r: 22 * exp(-3 * tau) * sin(14 * tau) }); A('whiskR', { r: -22 * exp(-3 * tau) * sin(14 * tau + .6) });
      A('beat', { x: lub(tau, 1.2, .1) * .6 + bump(tau - .05, .3) });
      api.glow(tau);
      const hp = api.head(st);
      if (tau < 1.8) confetti(api.c, t, UT + .2, hp[0], hp[1] - 30, 22, 3, 480, 1.8);
      api.word('POP!', hp[0] - 170, hp[1] + 30, t, UT + .14, .8, -10);
      SEG_T.forEach((s0, i) => {
        const u = t - s0; const p = u > 0 ? exp(-5 * u) * sin(16 * u) : 0;
        if (i == 0) { A('part-seg-1', { sx: 1 + .07 * p, sy: 1 + .07 * p }); A('whiskL', { r: 12 * p }); A('whiskR', { r: -12 * p }); }
        if (i == 1) {
          A('part-seg-2', { sx: 1 + .05 * p, sy: 1 + .05 * p }); const hp2 = u > 0 ? exp(-4.5 * u) * max(0, sin(PI * u / .18)) + exp(-4 * max(u - .3, 0)) * bump(u - .3, .18) * .8 : 0;
          A('heartL', { sx: 1 + .34 * hp2, sy: 1 + .34 * hp2 });
          A('heartR', { sx: 1 + .34 * bump(u - .08, .2) * exp(-3 * max(u, 0)) + .3 * bump(u - .38, .18), sy: 1 + .34 * bump(u - .08, .2) * exp(-3 * max(u, 0)) + .3 * bump(u - .38, .18) });
        }
        if (i == 2) { A('part-seg-3', { sx: 1 + .06 * p, sy: 1 + .06 * p }); }
        if (i == 3) { A('part-seg-4', { sx: 1 + .05 * p, sy: 1 + .05 * p }); A('scribble', { x: u > 0 ? 4 * exp(-3 * u) * sin(TAU * 13 * u) : 0 }); }
        if (i == 4) { A('part-seg-5', { sx: 1 + .05 * p, sy: 1 + .05 * p }); const hb = u > 0 ? exp(-3.5 * u) * max(0, sin(PI * u / .22)) * 1 + bump(u - .34, .22) * .7 : 0; A('heartIU', { sx: 1 + .5 * hb, sy: 1 + .5 * hb }); }
        const yc = [217, 318, 430, 523, 640][i]; const sp = api.S(270, yc);
        sparkle(api.c, t, s0, sp[0], sp[1], i == 2 ? 8 : 7, 40 + i, i == 4 ? 150 : 110, .75);
        if (i == 1) { const l = api.S(190, 310), r2 = api.S(286, 315); rise(api.c, t, s0 + .02, l[0], l[1], 2, 60, 1.3, 10, 70); rise(api.c, t, s0 + .1, r2[0], r2[1], 2, 61, 1.3, 10, 70); }
        if (i == 3) { const sc = api.S(255, 525); if (u > 0 && u < .9) { const R = rng(77); for (let j = 0; j < 7; j++) { const vx = (R() - .5) * 120, vy = -40 - R() * 60; api.c.fx.push({ k: 'scrap', x: sc[0] + vx * u, y: sc[1] + vy * u + 380 * u * u, s: .9, r: R() * 200 + u * 300, c: '#4a4648', a: 1 - sm((u - .5) / .4) }); } } }
        if (i == 4) { const hp3 = api.S(215, 632); rise(api.c, t, s0, hp3[0], hp3[1], 6, 90, 1.7, 40, 170); }
      });
      api.word('AWW!', hp[0] + 175, hp[1] + 40, t, UT + 2.62, .95, 6);
      if (tau > 2.6 && tau < 3.3) { rise(api.c, t, UT + 2.6, hp[0], hp[1], 7, 120, 1.6, 90, 140); }
    }
  } };
/* 4: heal */
const HEAL_T0 = .9, HEAL_N = 5, HEAL_LIFE = 1.35, HEAL_STEP = .22;
const y0c = hp => hp[1] + 60;
M.heal = { label: 'Heal', dur: 4.4, loop: false,
  state(t, form) {
    const o = form; let sy = 1 + .02 * breath(t), y = 0, x = 0, r = 0, bend = 0;
    const c = sm(t / .5) * (1 - sm((t - .62) / .1)); sy *= 1 - .15 * c;
    const u = t - .66; if (u > 0) { sy *= keys(u, [[0, .9], [.12, 1.12], [.4, 1.02], [.8, 1]]); y = pxu(12, o) * sin(PI * clamp(u / .42)); }
    bend = 26 * sm((t - .5) / .3) * (1 - sm((t - 2.0) / .9)) + 3 * sin(TAU * t / 1.1) * sm((t - .8) / .3) * (1 - sm((t - 3.5) / .5));
    r = -2 * sm((t - .5) / .3) * (1 - sm((t - 2.0) / .9));
    return { b: B({ x, y, r, sy, sx: volume(sy), bend: bend * bendK(o) }), open: o, zoom: zoomOf(o) };
  },
  extra(t, st, T, A, api) {
    const form = api.form;
    const arm = keys(t, [[0, 0], [.2, -14], [.6, -14], [.95, 26], [1.25, 23], [2.1, 23], [2.9, 8], [3.6, 0]]);
    armsUp(A, arm, t > .9 && t < 2.2 ? 7 : 0, T);
    A('part-fin-left', { r: keys(t, [[0, 0], [.6, -8], [1.0, 22], [2.2, 22], [3, 0]]) + 5 * sin(9 * T) }); A('part-fin-right', { r: -keys(t, [[0, 0], [.6, -8], [1.0, 22], [2.2, 22], [3, 0]]) - 5 * sin(9 * T + 1) });
    let bt = lub(t, .9) * sm(t / .4) * (t < .8 ? 1 : 0) + (t < .8 ? lub(t, .42) * sm((t - .2) / .5) * .5 : 0);
    for (let k = 0; k < HEAL_N; k++) bt += bump(t - (HEAL_T0 + HEAL_STEP * k) + .05, .22) * 1.1;
    A('beat', { x: bt }); A('smile', { sx: 1 + .3 * sm((t - 1) / .4), sy: 1 + .4 * sm((t - 1) / .4) * (1 - sm((t - 3.4) / .5)) });
    A('eyeL', { sy: 1 - .4 * sm((t - 1) / .3) * (1 - sm((t - 3) / .4)) }); A('eyeR', { sy: 1 - .4 * sm((t - 1) / .3) * (1 - sm((t - 3) / .4)) });
    const hp = api.head(st);
    /* chest glow */
    const gl = sm(t / .7) * (1 - sm((t - 2.1) / .7)); api.glow(0, gl, hp[0], hp[1] + 10, (1.0 + .15 * sin(18 * t)) * .8);
    api.word('HEAL!', hp[0] - 170, hp[1] + (form ? 30 : -30), t, .86, .85, -8);
    /* hearts in flight */
    let tgtGlow = 0, ty0 = 0, y0 = 0;
    for (let k = 0; k < HEAL_N; k++) {
      const tb = HEAL_T0 + HEAL_STEP * k; const x0 = hp[0] + 30; y0 = hp[1] + (form ? 0 : -10); const x1 = 1040 - SX, y1 = y0 + 30 + (k - 2) * 34;
      const pos = tau => { const e = Math.pow(clamp(tau), 1.25); return [lerp(x0, x1, e), lerp(y0, y1, e) - (form ? 45 : 170) * sin(PI * Math.pow(clamp(tau), .8)) + 16 * sin(TAU * (tau * 2.2 + k * .31)) * sin(PI * clamp(tau))]; };
      const tau = (t - tb) / HEAL_LIFE;
      if (tau > 0 && tau < 1) {
        const [x, y] = pos(tau); const s = (1.15 + .35 * sin(TAU * tau * 2 + k)) * eob(tau * 6) * (tau > .9 ? 1 - sm((tau - .9) / .1) : 1);
        api.c.fx.push({ k: 'heart', x, y, s: s * 2.1, r: -14 + 22 * sin(TAU * (tau * 2.4 + k * .2)), c: PINKS[k % 4], a: 1 });
        for (let j = 1; j <= 3; j++) { const tj = tau - .05 * j; if (tj <= 0) continue; const [px, py] = pos(tj); api.c.fx.push({ k: j == 2 ? 'plus' : 'star', x: px + 4 * sin(j * 5 + k), y: py + 8 * j * .6, s: (1 - j * .22) * .9, r: tj * 300, c: j % 2 ? '#FFF1A8' : '#fbfaf6', a: 1 - j * .25 }); }
        if (tau > .62 && tau < .9) tgtGlow = max(tgtGlow, 1); if (tau > .62) ty0 = y1;
      }
      const ta = tb + HEAL_LIFE * .78;
      if (t >= ta && t < ta + .9) {
        const u = t - ta;
        for (let j = 0; j < 5; j++) { const R = rng(300 + k * 7 + j); const a = -PI + R() * PI * .9 - .2, v = 90 + R() * 130; api.c.fx.push({ k: j % 2 ? 'plus' : 'star', x: 930 - SX + cos(a) * v * u * .9, y: y1 + sin(a) * v * u - 20 * u + 60 * u * u * .5, s: (1 + R() * .9) * (1 - u / .9 * .5) * eob(u * 8), r: R() * 70, c: j % 2 ? '#8be08d' : '#FFF1A8', a: 1 - sm((u - .4) / .5) }); }
      }
    }
    const lastArr = HEAL_T0 + HEAL_STEP * (HEAL_N - 1) + HEAL_LIFE * .78;
    const gT = sm((t - (HEAL_T0 + HEAL_LIFE * .7)) / .3) * (1 - sm((t - lastArr - .4) / .9));
    if (gT > .01) { api.tglow(gT, 985 - SX, y0c(hp)); }
  } };
/* 5: hurt */
const HT = .45;
M.hurt = { label: 'Ouch', dur: 3.6, loop: false,
  state(t, form) {
    const h = t - HT, o = form; let x = 0, y = 0, r = 0, sx = 1, sy = 1, bend = 0;
    if (h > 0) {
      const xk = lerp(115, 200, o); x = -xk * eoc(h / .4); if (h > 1.25) x = -xk * (1 - sm((h - 1.25) / .8));
      y = pxu(30, o) * sin(PI * clamp(h / .42)) + (h > 1.25 && h < 2.05 ? pxu(9, o) * sin(PI * (h - 1.25) / .8) : 0);
      r = -12 * exp(-4.2 * h) * cos(12 * h) + (h > 1.25 && h < 2.1 ? 3 * sin(PI * (h - 1.25) / .85) : 0);
      sx = 1 - .24 * exp(-9 * h) * cos(24 * h); sy = 1 + .28 * exp(-9 * h) * cos(24 * h);
      bend = -40 * exp(-3 * h) * cos(11 * h) * bendK(o) - 10 * exp(-2 * h);
    } else { sy = 1 + .028 * breath(t); sx = volume(sy); }
    return { b: B({ x, y, r, sx, sy, bend }), open: o, zoom: zoomOf(o), flash: flashAt(h) };
  },
  extra(t, st, T, A, api) {
    const form = api.form; const h = t - HT;
    if (h > 0) {
      const w = exp(-3 * h);
      const eb = 1 + .5 * exp(-1.5 * h) * (h < .55 ? 1 : 0); const sq = sm((h - .5) / .12) * (1 - sm((h - 1.7) / .4));
      A('eyeL', { sx: eb, sy: eb * (1 - .85 * sq) }); A('eyeR', { sx: eb, sy: eb * (1 - .85 * sq) });
      A('smile', { sy: 1 - 2.3 * sm((h - .04) / .08) * (1 - sm((h - 1.9) / .4)), sx: 1 + .1 * w });
      A('armL', { r: 42 * w * cos(14 * h) }); A('armR', { r: -42 * w * cos(14 * h + .4) });
      A('whiskL', { r: 30 * w * sin(16 * h) }); A('whiskR', { r: -30 * w * sin(16 * h + .5) });
      A('part-fin-left', { r: 34 * w * sin(15 * h) }); A('part-fin-right', { r: -34 * w * sin(15 * h + .4) });
      A('legL', { r: 16 * w * sin(14 * h) }); A('legX', { r: -14 * w * sin(14 * h) }); A('legRL', { r: -16 * w * sin(14 * h) }); A('legRS', { r: 14 * w * sin(14 * h) });
      A('beat', { x: -.7 * sm(h / .05) * exp(-3 * h) + .6 * bump(wrap(h - .3, .5), .2) * (h > .3 && h < 1.6 ? 1 : 0) });
      const hp = api.head(st);
      if (h < .3) { const s = eob(h / .1) * (1 - sm((h - .18) / .12)); api.c.fx.push({ k: 'spike', x: hp[0] + (form ? 60 : 90), y: hp[1] + (form ? 10 : 40), s: 2.1 * s, r: h * 60, c: '#FFD23C', a: 1 }); }
      api.word('OUCH!', hp[0] - 150, hp[1] - (form ? 20 : 60), t, HT + .04, .8, -10);
      if (h > .3 && h < 1.6) {
        const u = h - .3; [-1, 1].forEach((sg, i) => {
          const ex = hp[0] + (sg < 0 ? -34 : 36) * (form ? .75 : 1.1), ey = hp[1] + (form ? -4 : 4);
          const uu = (u - .1 * i) % .9; if (uu > 0) api.c.fx.push({ k: 'drop', x: ex + sg * uu * 34, y: ey + uu * uu * 160 + uu * 18, s: .9 * (1 - uu / 1.1), c: '#9ad7f2', a: 1 - sm((uu - .5) / .4) });
        });
      }
      if (h > .35 && h < 1.9) {
        const a = 1 - sm((h - 1.5) / .4), [hx, hy] = api.head(st);
        for (let i = 0; i < 3; i++) { const an = h * 5 + i * TAU / 3; api.c.fx.push({ k: 'star', x: hx + cos(an) * 70, y: hy - 70 + sin(an) * 18 - sm((h - .35) / .15) * 8, s: .9 + .2 * sin(an + 1), r: an * 40, c: i == 1 ? '#f06a8a' : '#FFD23C', a }); }
      }
    }
  } };
function flashAt(h) {
  if (h < 0) return null; if (h < .06) return { a: .8, c: [1, 1, 1] }; if (h < .12) return { a: .0, c: [1, 1, 1] }; if (h < .2) return { a: .7, c: [1, 1, 1] };
  if (h < .8) return { a: .55 * exp(-5 * (h - .2)), c: [1, .35, .32] }; return null;
}
/* 6: happy */
M.happy = { label: 'Yay', dur: 3.4, loop: false,
  state(t, form) {
    const o = form; let y = 0, sy = 1 + .02 * breath(t), sxm = 1, bend = 0;
    const hop = (s, e, H) => { const u = (t - s) / (e - s); return u > 0 && u < 1 ? H * 4 * u * (1 - u) : 0; };
    y = hop(.55, 1.15, pxu(o ? 34 : 100, o)) + hop(1.95, 2.7, pxu(o ? 50 : 140, o));
    sy *= keys(t, [[0, 1], [.2, .8], [.28, .82], [.36, 1.2], [.9, 1.08], [1.15, 1.1], [1.22, .74], [1.34, 1.08], [1.45, 1], [1.7, 1], [1.85, .76], [1.95, .8], [2.02, 1.22], [2.55, 1.08], [2.7, 1.12], [2.78, .72], [2.92, 1.08], [3.05, .99], [3.4, 1]]);
    if (o) sy = 1 + (sy - 1) * .55;
    if (t > 2.0 && t < 2.72) sxm = cos(TAU * sm((t - 2.0) / .7));
    bend = (14 * sin(TAU * 1.6 * t) * (t > .5 && t < 1.3 ? 1 : 0) + 20 * sin(PI * clamp((t - 1.95) / .8)) * cos(TAU * 2 * t)) * bendK(o);
    const r = (t > .55 && t < 1.15) ? 6 * sin(PI * (t - .55) / .6) : 0;
    return { b: B({ y, r, sy, sx: volume(sy) * sxm, bend }), open: o, zoom: zoomOf(o) };
  },
  extra(t, st, T, A, api) {
    const up = keys(t, [[0, 0], [.25, -.5], [.45, 0], [.55, 1], [1.15, 1], [1.4, .2], [1.7, 0], [1.85, -.5], [1.95, -.3], [2.02, 1], [2.7, 1], [2.95, .1], [3.4, 0]]);
    armsUp(A, up > 0 ? up * (26 + 8 * sin(TAU * 3.2 * T)) : up * 14);
    A('whiskL', { r: up * 18 * sin(TAU * 3.2 * T) }); A('whiskR', { r: -up * 18 * sin(TAU * 3.2 * T + 1) });
    const sq = keys(t, [[0, 0], [.3, .6], [.5, 1], [1.2, 1], [1.5, 0], [1.8, .4], [2, 1], [2.8, 1], [3.1, 0]]);
    A('eyeL', { sy: 1 - .7 * sq, sx: 1 + .2 * sq }); A('eyeR', { sy: 1 - .7 * sq, sx: 1 + .2 * sq });
    A('smile', { sx: 1 + .35 * sq, sy: 1 + .7 * sq });
    A('part-fin-left', { r: sq * 20 * sin(TAU * 3.6 * T) }); A('part-fin-right', { r: -sq * 20 * sin(TAU * 3.6 * T + .5) });
    A('legL', { r: sq * 8 * sin(TAU * 3.2 * T) }); A('legRL', { r: -sq * 8 * sin(TAU * 3.2 * T) });
    A('beat', { x: lub(t, .5) * .8 * sq });
    const hp = api.head(st);
    confetti(api.c, t, .95, hp[0], hp[1] - 20, 22, 5, 560, 1.7); confetti(api.c, t, 2.45, hp[0], hp[1] - 20, 30, 8, 700, 1.9);
    rise(api.c, t, 2.1, hp[0], hp[1], 5, 31, 1.6, 70, 140);
    api.word('YAY!', hp[0] + 150, hp[1] + 10, t, .62, .9, 8);
    api.word('WHEE!', hp[0] - 160, hp[1] + 10, t, 2.1, .9, -8);
  } };
const ORDER = ['idle', 'walk', 'unfold', 'heal', 'hurt', 'happy'];

/* part names in the rig (the demo's P keys -> element ids) */
const ACC = ['part-fin-left', 'part-fin-right', 'part-seg-1', 'part-seg-2', 'part-seg-3', 'part-seg-4', 'tailB-o', 'part-seg-5'];
const YC = { 'tailB-o': 735, 'part-fin-left': 703.368408203125, 'part-fin-right': 638.5796966552734 };   // demo P[id].yc (bbox centre y)

/* ---------- per-frame pose (demo: render(T)) ---------- */
function pose(c) {
  const m = M[c.clip], t = c.t, T = c.T, form = c.form;
  const st = m.state(t, form), b = st.b;
  c.zoom = st.zoom; c.open = st.open;
  const K = KB * (c.useZoom ? st.zoom : 1);
  const lag = d => m.state(wrap(t - d, m.dur), form).b;
  const vel = d => { const a = lag(d), q = lag(d + .04); return { x: (a.x - q.x) / .04, y: (a.y - q.y) / .04, r: (a.r - q.r) / .04, sy: (a.sy - q.sy) / .04 }; };
  let beat = 0;
  const A = (id, o) => {
    if (id === 'beat') { if (o.x) beat += o.x; return; }
    if (o.sx === 0 || o.sy === 0) o = { ...o, sx: o.sx === 0 ? 1e-6 : o.sx, sy: o.sy === 0 ? 1e-6 : o.sy };   // demo: `if(o.sx!=null)a.sx*=o.sx` multiplies by 0; c.add skips 0
    c.add(id, o);
  };
  const open = st.open;
  /* ---- shared secondary motion (overlapping action) ---- */
  const v1 = vel(.05), v2 = vel(.09), v3 = vel(.13);
  A('armL', { r: -cl(v1.y * .02 * K / .46, 30) - cl(v1.x * .02, 14) + 4 * sin(1.3 * T) + cl(v1.r * .1, 10) });
  A('armR', { r: cl(v2.y * .02 * K / .46, 30) - cl(v2.x * .02, 14) + 4 * sin(1.1 * T + 1.2) + cl(v2.r * .1, 10) });
  A('whiskL', { r: cl(v2.y * .02, 22) + 5 * sin(2.2 * T + .5) }); A('whiskR', { r: -cl(v2.y * .02, 22) + 5 * sin(2.0 * T + 1.3) });
  A('part-fin-left', { r: cl(v3.y * .016, 20) + 4 * sin(1.9 * T + .5) }); A('part-fin-right', { r: -cl(v3.y * .016, 20) + 4 * sin(1.7 * T + 1.1) });
  A('legL', { r: 2.2 * sin(1.1 * T) + cl(v2.y * .012, 8) }); A('legX', { r: -2.2 * sin(1.1 * T + .8) - cl(v2.y * .01, 7) });
  A('legRL', { r: -2.2 * sin(1.1 * T) - cl(v2.y * .012, 8) }); A('legRS', { r: 2 * sin(1.1 * T + .8) + cl(v2.y * .01, 7) });
  /* eyes: wander + blink */
  const lx = 2.4 * sin(.6 * T) + 1.2 * sin(1.7 * T + 1), ly = 1.2 * sin(.9 * T + 2); const bl = blinkAmt(T);
  A('eyeL', { x: lx, y: ly, sy: 1 - .92 * bl }); A('eyeR', { x: lx, y: ly, sy: 1 - .92 * bl });
  /* the small hearts beat softly on their own when the body is open */
  const bs = lub(T, 1.6, .12); A('heartL', { sx: 1 + .07 * bs, sy: 1 + .07 * bs }); A('heartR', { sx: 1 + .07 * lub(T, 1.6, .2), sy: 1 + .07 * lub(T, 1.6, .2) }); A('heartIU', { sx: 1 + .07 * lub(T, 1.6, .3), sy: 1 + .07 * lub(T, 1.6, .3) });
  A('smile', { sx: 1 + .06 * bs, sy: 1 + .1 * bs });
  /* mode specifics */
  let glowOn = 0, glowPos = null, tglowV = null;
  const S = (cx, cy) => [(cx - CX + b.x) * K, (cy - CGY - b.y) * K];
  const api = {
    c, form, S,
    head: st => { const ty = GAP * (1 - clamp(st.open, 0, 1.08)); return S(281, 98 + ty); },
    word: (txt, x, y, tt, t0, life, rot) => wordPop(c, txt, x, y, tt, t0, life, rot),
    glow: (tau, a, x, y, r) => { if (a == null) { glowOn = sm(1 - tau / .6); glowPos = null; } else { glowOn = a; glowPos = [x, y, r]; } },
    tglow: (a, x, y) => { tglowV = [a, x, y]; },
  };
  m.extra(t, st, T, A, api);
  const oc = clamp(open, 0, 1.08);
  /* ---- rig transform (character units -> feet-relative units) ---- */
  c.root().translate(b.x, -b.y).translate(0, -b.pv).rotate(b.r).translate(0, b.pv).scale(b.sx, b.sy).translate(-CX, -CGY);
  /* ---- bend: a lean that grows toward the top, arriving later the higher up ---- */
  const ty = GAP * (1 - oc), Hc = CGY - (19 + ty);
  const bnd = (mb, yd) => { const h = clamp((CGY - yd) / Hc, 0, 1); const bl = lag(.12 * h).bend || 0; return mb.translate(bl * h * h, 0).translate(0, yd).skewX(Math.atan(-2 * bl * h / Hc) * 180 / PI).translate(0, -yd); };
  /* ---- head ---- */
  const hs = 1 + .05 * beat * (.35 + .65 * clamp(oc)), py = lerp(170, 905 - ty, 1 - clamp(oc));
  bnd(c.local('part-head'), 98 + ty).translate(0, ty).translate(281, py).scale(hs, hs).translate(-281, -py);
  /* ---- tail: V and legs stay on the ground; only a beat pulse when folded ---- */
  const tb = 1 + .045 * beat * (1 - clamp(oc));
  c.local('tailA-o').translate(275, 905).scale(tb, tb).translate(-275, -905);
  /* ---- accordion parts ---- */
  const hid = oc < .02;
  const ao = Math.max(oc, .001);
  for (const id of ACC) {
    if (hid) { c.hide(id); continue; }
    const yc = YC[id] != null ? YC[id] : c.pivot(id)[1];
    const yd = SEAM + ao * (yc - SEAM);
    const mb = bnd(c.local(id), yd);
    if (id === 'tailB-o') mb.translate(275, 905).scale(tb, tb).translate(-275, -905);
    mb.translate(0, SEAM).scale(1, ao).translate(0, -SEAM);
  }
  /* ---- shadow (stage px, relative to the feet) ---- */
  const hgt = Math.max(b.y, 0); const sc = 1 / (1 + hgt / 230);
  const rx = 135 * K * sc * (1 + (1 - b.sy) * .5);
  c.shadow = { x: b.x * K, y: 3, rx, ry: rx * .15, a: .95 * (.4 + .6 * sc) };
  /* ---- world ---- */
  c.scroll = c.clip === 'walk' ? M.walk.scroll(T) : 0;
  let shk = 0; if (c.clip === 'unfold' && t > UT && t < UT + .6) shk = exp(-8 * (t - UT)) * sin(60 * (t - UT)) * 6;
  if (c.clip === 'hurt' && t > HT && t < HT + .4) shk = exp(-9 * (t - HT)) * sin(70 * (t - HT)) * 7;
  c.shake[0] = shk; c.shake[1] = shk * .4;
  /* ---- glow / flash ---- */
  // The runtime has one glow (the demo's pink chest glow #glowC). The teammate glow #glowT (heal, at the right edge)
  // is drawn through the same slot only while the chest glow is off.
  if (glowOn > .01) {
    let gx, gy, gr; if (glowPos) { [gx, gy, gr] = glowPos; gr *= 240 * K / .46 * .6; } else { [gx, gy] = api.head(st); gy += 40; gr = 230 * K * (1.2 - glowOn * .4); }
    c.glow = { x: gx, y: gy, r: gr, a: clamp(glowOn) };
  } else if (tglowV) c.glow = { x: tglowV[1], y: tglowV[2], r: 150 + 60 * tglowV[0], a: tglowV[0] };
  c.flash = st.flash && st.flash.a > .01 ? st.flash : null;
}

export default {
  id: 'fish',
  name: 'Heartfin',
  stagePx: KB,               // demo stage px per character unit at zoom 1
  feet: [CX, CGY],           // character units that land on the (sx, sy) feet point
  forms: { folded: 0, open: 1 },
  clips: Object.fromEntries(Object.entries(M).map(([k, v]) => [k, { name: k, label: v.label, dur: v.dur, loop: v.loop, forms: v.forms || [0, 1] }])),
  order: ORDER,
  wordFill: '#FDE6F1',   // the demo's pale pink word pops
  glow: [[0, 'rgba(255,211,230,.95)'], [.5, 'rgba(247,166,203,.45)'], [1, 'rgba(247,166,203,0)']],   // the demo's #glowG
  symbols: {
    heart: 'M0 9 C-14 -1 -10 -12 -4.2 -10.5 C-2 -10 0 -7.5 0 -5.5 C0 -7.5 2 -10 4.2 -10.5 C10 -12 14 -1 0 9Z',
    plus: 'M-3.5 -10 H3.5 V-3.5 H10 V3.5 H3.5 V10 H-3.5 V3.5 H-10 V-3.5 H-3.5Z',
    drop: 'M0 -10 C6 -2 7 3 0 7 C-7 3 -6 -2 0 -10Z',
  },
  pose,
};
