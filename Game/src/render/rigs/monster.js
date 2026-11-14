// Munch (id `monster`): clip code ported from Art/Demos/munch_animation_demo.html (its <script>, sections
// "modes" and "render"). Numbers, timings and keyframes are copied unchanged; only the plumbing differs:
//   demo add(id, o)              -> c.add(id, o)                  (same accumulate rules)
//   demo setT('part-top', '...') -> c.local('part-top').translate(...)...   (same SVG transform-list order)
//   demo api.S(cx, cy)           -> S(cx, cy): stage px relative to the feet (the demo returns absolute stage px;
//                                   absolute demo numbers such as y = 100 are written here as 100 - GY)
//   demo fxAdd / wordPop          -> c.fx.push / wordPop(c, ...)  (drawn by drawRigFx)
// The art and the part pivots come from the same page via tools/rigparts.mjs (see monster.build.mjs).
import {
  TAU, PI, sin, cos, exp, clamp, lerp, sm, eob, eoc, eic, wrap, cl, keys, breath, blinker, confetti, crumbs, wordPop,
} from './kit.js';

/* ---------- stage constants (demo: "stage constants") ---------- */
const SX = 480, GY = 540, BASE = 0.8, CX = 245, CGY = 624;
const HINGE_Y = 151.8, GAP = 354.2;
const Z = w => .86 + .59 * w; const zf = o => Z(1 - clamp(o));        // folded form is shown larger (camera push-in)
const B = o => Object.assign({ x: 0, y: 0, r: 0, sx: 1, sy: 1, pv: 0 }, o);
const volume = sy => 1 + (1 - sy) * .65;
const topY = st => 27 + GAP * (1 - st.open);
const COL = ['#E8921C', '#FFD23C', '#202c5e', '#ef6d27', '#f06a8a', '#7cc3e8', '#fbfaf6'];
const blinkAmt = blinker(11, 1.1, 3.4);
const ARMS_TOP = ['arm-top-l1', 'arm-top-l2', 'arm-top-l3', 'arm-top-r1', 'arm-top-r2', 'arm-top-r3'];
const ARMS_L = ARMS_TOP.slice(0, 3), ARMS_R = ARMS_TOP.slice(3);
const FOODS = ['food-round', 'food-sausage', 'food-fish-1', 'food-fish-2', 'food-triangle', 'food-pizza', 'food-fish-3'];

function openClose(t, ev) { // chomp events -> open amount
  let o = 1;
  for (const e of ev) {
    const tau = t - e.s;
    if (tau > -.22 && tau < 0) o = 1 + .12 * sm((tau + .22) / .22);
    else if (tau >= 0) {
      const hold = e.hold || 0;
      if (tau < .09) o = lerp(1.12, 1 - e.d, eic(tau / .09));
      else if (tau < .15 + hold) o = 1 - e.d + .015 * sin(tau * 60);
      else { const u = tau - .15 - hold; if (u < 1.2) o = 1 - e.d * exp(-8 * u) * cos(15 * u); }
    }
  }
  return o;
}
function flashAt(h) {
  if (h < 0) return null; if (h < .06) return { a: .8, c: [1, 1, 1] }; if (h < .12) return { a: 0, c: [1, 1, 1] }; if (h < .2) return { a: .7, c: [1, 1, 1] };
  if (h < .8) return { a: .55 * exp(-5 * (h - .2)), c: [1, .35, .32] }; return null;
}

/* ---------- clips (demo: M.idle ... M.happy). state(t, form) -> { b, open, zoom, rh?, flash? } ---------- */
const HOP = 1.2;
const hopU = t => { const idx = Math.floor(t / HOP); return { u: (t - idx * HOP) / HOP, s: idx % 2 ? -1 : 1, idx }; };
const UT = 1.6, CT = 4.15;
const CEV = [{ s: .5, d: .68 }, { s: 1.15, d: .72 }, { s: 1.8, d: .9, hold: .8 }];
const HT = .45;

const M = {};
M.idle = { label: 'Idle', dur: 6.4, loop: true,
  state(t, form) { const br = breath(t); const sy = 1 + .028 * br; return { b: B({ sy, sx: volume(sy), r: 1.1 * sin(TAU * t / 6.4) }), open: form, zoom: zf(form) }; } };

M.hop = { label: 'Hop', dur: 2.4, loop: true,
  state(t, form) {
    const { u, s } = hopU(t);
    const y = u > .27 && u < .72 ? 74 * (1 - Math.pow((u - .27) / .225 - 1, 2)) : 0;
    const sy = keys(u, [[0, 1], [.2, .78], [.27, 1.2], [.5, 1.06], [.72, 1.13], [.78, .72], [.86, 1.07], [.93, .98], [1, 1]]);
    const r = s * keys(u, [[0, 0], [.2, -6], [.5, 6], [.78, 3.5], [.9, -2], [1, 0]]);
    return { b: B({ y, sy, sx: volume(sy), r }), open: form, zoom: zf(form) };
  },
  extra(t, st, A) {
    const { u, s } = hopU(t); const air = u > .27 && u < .76 ? sin(PI * (u - .27) / .49) : 0;
    const ant = sm(u / .2) * (1 - sm((u - .2) / .07)); const land = u > .76 ? exp(-9 * (u - .76)) * sin(26 * (u - .76)) : 0;
    const k = s * 34 * air;
    A('leg-left-1', { r: -k + ant * 14 - s * land * 9 }); A('leg-left-2', { r: -k * .8 + ant * 10 + s * land * 8 });
    A('leg-right-long', { r: k - ant * 12 + s * land * 9 }); A('leg-right-short', { r: k * .9 - ant * 10 - s * land * 7 });
    const up = air * .8 + sm((u - .2) / .08) * (1 - sm((u - .3) / .1)) * .6;
    const dn = ant * 1;
    for (const [id, sg] of [['arm-top-l1', 1], ['arm-top-l2', 1], ['arm-top-l3', 1], ['arm-top-r1', -1], ['arm-top-r2', -1], ['arm-top-r3', -1]])
      A(id, { r: sg * (26 * up - 30 * dn + 7 * sin(TAU * u * 3 + sg)) });
    A('boot-foot', { r: s * 8 * air }); A('boot-toe', { r: -s * 6 * air }); A('fur-left', { r: -14 * air }); A('fur-right', { r: 14 * air });
  },
  scroll(t) { const idx = Math.floor(t / HOP), { u } = hopU(t); return idx * 120 + 120 * sm((u - .27) / .5); } };

M.unfold = { label: 'Unfold', dur: 6.4, loop: false, forms: [0],
  state(t) {
    const br = breath(t); let sy = 1 + .02 * br, x = 0, y = 0, r = 0, open = 0, zoom = zf(0), pv = 0;
    if (t < UT) { // folded + anticipation
      const c = sm((t - .7) / .35) * (1 - sm((t - 1.52) / .08)); const sh = sm((t - .95) / .6);
      sy = sy * (1 - .2 * c); x = 5.5 * sh * sin(TAU * 9 * (t - .7));
      open = 0; zoom = zf(0);
    } else if (t < CT) {
      const tau = t - UT; open = 1 - exp(-8 * tau) * cos(11.5 * tau);
      sy = keys(tau, [[0, .8], [.09, 1.2], [.26, .93], [.42, 1.04], [.62, 1], [1, 1]]) * (1 + .015 * br * sm(tau - .8));
      y = 18 * sin(PI * clamp(tau / .46)); zoom = Z(1 - clamp(open, 0, 1.08));
      x = 0;
    } else {
      const tc = t - CT; const o = 1 - eic(tc / .26) * 1.05; open = tc < .26 ? o : -.05;
      sy = tc < .26 ? lerp(1.04, 1.12, tc / .26) : keys(tc - .26, [[0, .7], [.12, 1.1], [.3, .96], [.5, 1.01], [.8, 1]]);
      zoom = Z(1 - clamp(open, 0, 1)); y = 0;
      if (tc > .26 && tc < .5) open = -.05 + .05 * exp(-10 * (tc - .26)) * cos(40 * (tc - .26));
      if (tc > 1.6) sy = 1 + .02 * br;
    }
    const rh = t >= UT ? (-27 * sin(PI * clamp((t - UT) / .36)) * ((t - UT) < .36 ? 1 : 0) + 5 * exp(-5 * (t - UT)) * sin(16 * (t - UT))) : 0;
    return { b: B({ x, y, r, sy, sx: volume(sy), pv }), open, zoom, rh, pre: t < UT };
  },
  extra(t, st, A, api) {
    const tau = t - UT;
    if (t < UT) {
      const w = sm((t - .8) / .5); const sh = sm((t - .95) / .6);
      A('eye-left', { sx: 1 + .3 * w, sy: 1 + .3 * w }); A('eye-right', { sx: 1 + .3 * w, sy: 1 + .3 * w }); A('brow-left', { y: -7 * w }); A('brow-right', { y: -7 * w });
      A('pin-left', { r: sh * 7 * sin(TAU * 14 * t) }); A('pin-right', { r: -sh * 7 * sin(TAU * 14 * t + 1) });
      A('fringe-top', { k: sh * 3 * sin(TAU * 16 * t) });
      for (const id of ARMS_L) A(id, { r: -sh * 8 * sin(TAU * 12 * t) - w * 10 });
      for (const id of ARMS_R) A(id, { r: sh * 8 * sin(TAU * 12 * t + 1) + w * 10 });
    }
    if (t >= UT && t < CT) {
      const a = sm(tau / .2) * (1 - sm((tau - .5) / .7));
      for (const id of ARMS_L) A(id, { r: -16 * a });
      for (const id of ARMS_R) A(id, { r: 16 * a });
      A('eye-left', { sx: 1 + .25 * exp(-3 * tau), sy: 1 + .25 * exp(-3 * tau) }); A('eye-right', { sx: 1 + .25 * exp(-3 * tau), sy: 1 + .25 * exp(-3 * tau) });
      api.glow(tau);
      const [px, py] = api.S(222, 150 - 80);
      confetti(api.c, t, UT + .12, px, py, 22, 3, 600, 1.8, COL);
      const [wx, wy] = api.S(222, -10);
      api.word('POP!', wx, wy, t, UT + .14, .8);
    }
  },
  foods(t, i) { // -> { pop, j }
    const tau = t - UT; let pop = 0;
    if (t < UT) pop = 0; else if (t < CT) pop = eob((tau - .1 - .075 * i) / .38); else { const tc = t - CT; pop = 1 - sm(tc / .2); }
    return { pop: Math.max(pop, 0), j: (t > UT + .5 && t < CT) ? 1 : 0 };
  } };

M.chomp = { label: 'Chomp', dur: 4.4, loop: false, forms: [1],
  state(t) {
    const open = openClose(t, CEV); let sy = 1 + .02 * breath(t), y = 0, rh = 0;
    for (const e of CEV) {
      const tau = t - e.s;
      if (tau > -.2 && tau < 0) sy *= 1 + .03 * sm((tau + .2) / .2);
      else if (tau >= 0 && tau < .5) sy *= 1 - .11 * exp(-9 * tau) * cos(18 * tau);
      if (tau > .1 && tau < .7) y += 7 * sin(PI * (tau - .1) / .6) * exp(-2 * (tau - .1));
    }
    const g = t - 2.0; if (g > 0 && g < .7) { const u = g / .7; sy *= 1 + .09 * sin(PI * u) * cos(u * 7); }
    const bt = t - 3.0; if (bt > 0 && bt < .7) { const burp = exp(-6 * bt) * sin(20 * bt); sy *= 1 + .06 * burp; }
    rh = (open > 1 ? -(open - 1) * 35 : (1 - open) * -4);
    return { b: B({ y, sy, sx: volume(sy) }), open, zoom: Z(.55 * (1 - clamp(open, 0, 1.08))), rh };
  },
  extra(t, st, A, api) {
    const g = t - 2.05; const sq = g > 0 && g < .6 ? sin(PI * g / .6) : 0;
    A('eye-left', { sy: 1 - .8 * sq }); A('eye-right', { sy: 1 - .8 * sq });
    for (const e of CEV) {
      const tau = t - e.s;
      if (tau > 0 && tau < .12) { const a = sm(tau / .05); A('eye-left', { sy: 1 - .5 * a }); A('eye-right', { sy: 1 - .5 * a }); A('brow-left', { y: 5 * a }); A('brow-right', { y: 5 * a }); }
    }
    CEV.forEach((e, i) => {
      const [x, y] = api.S(228, 520 - 60);
      crumbs(api.c, t, e.s + .07, x, y, i == 2 ? 14 : 9, 20 + i, 320, .8, i % 2 ? '#f06a8a' : '#FFD23C');
      api.word(['CHOMP!', 'CHOMP!', 'CHOMP!!'][i], api.S(228, 150)[0] + (i - 1) * 70, 100 - (i * 8) - GY, t, e.s + .09, .55, [-8, 7, -4][i]);
    });
    api.word('GULP', api.S(228, 100)[0], 100 - GY, t, 2.0, .6, -5);
    api.word('BURP!', api.S(228, 100)[0], 92 - GY, t, 3.03, .6, 6);
    confetti(api.c, t, 3.05, api.S(228, 330)[0], api.S(228, 380)[1], 10, 9, 380, 1.2, COL);
  },
  foods(t, i) {
    let pop = 1; if (t > 1.95 && t < 2.75) pop = 0; else if (t >= 2.75) pop = eob((t - 2.75 - .06 * i) / .32);
    let j = 0; for (const e of CEV) { const tau = t - e.s - .12; if (tau > 0 && tau < 1.4) j += exp(-4.5 * tau) * sin(15 * tau - i * .9); }
    if (t > 2.75) j += exp(-4 * (t - 2.75)) * sin(14 * (t - 2.75) - i * .9) * 1.3;
    return { pop: Math.max(pop, 0), j, jy: (t < .5 || t > 3.7) ? 0 : 1 };
  } };

M.hurt = { label: 'Ouch', dur: 3.6, loop: false,
  state(t, form) {
    const h = t - HT; let x = 0, y = 0, r = 0, sx = 1, sy = 1;
    if (h > 0) {
      x = -96 * eoc(h / .4); if (h > 1.25) x = -96 * (1 - sm((h - 1.25) / .8));
      y = 34 * sin(PI * clamp(h / .42)) + (h > 1.25 && h < 2.05 ? 10 * sin(PI * (h - 1.25) / .8) : 0);
      r = -17 * exp(-4.2 * h) * cos(12 * h) + (h > 1.25 && h < 2.1 ? 4 * sin(PI * (h - 1.25) / .85) : 0);
      sx = 1 - .24 * exp(-9 * h) * cos(24 * h); sy = 1 + .28 * exp(-9 * h) * cos(24 * h);
    } else { sy = 1 + .028 * breath(t); sx = volume(sy); }
    return { b: B({ x, y, r, sx, sy }), open: form, zoom: zf(form), flash: flashAt(h) };
  },
  extra(t, st, A, api) {
    const h = t - HT;
    if (h > 0) {
      const w = exp(-3 * h);
      A('eye-left', { sx: 1 + .38 * exp(-1.5 * h), sy: 1 + .38 * exp(-1.5 * h) }); A('eye-right', { sx: 1 + .38 * exp(-1.5 * h), sy: 1 + .38 * exp(-1.5 * h) });
      A('brow-left', { r: -16 * exp(-1.2 * h), y: -5 * exp(-1.2 * h) }); A('brow-right', { r: 16 * exp(-1.2 * h), y: -5 * exp(-1.2 * h) });
      for (const id of ARMS_L) A(id, { r: 36 * w * cos(14 * h) });
      for (const id of ARMS_R) A(id, { r: -36 * w * cos(14 * h + .4) });
      A('pin-left', { r: 30 * w * sin(16 * h) }); A('pin-right', { r: -30 * w * sin(16 * h + .5) });
      A('fringe-top', { k: 14 * w * sin(15 * h) }); A('fringe-bottom', { k: -10 * w * sin(13 * h) });
      A('fur-left', { r: 22 * w * sin(18 * h) }); A('fur-right', { r: -22 * w * sin(18 * h) });
      A('leg-left-1', { r: 12 * w * sin(14 * h) }); A('leg-left-2', { r: -10 * w * sin(14 * h) }); A('leg-right-long', { r: -12 * w * sin(14 * h) }); A('leg-right-short', { r: 10 * w * sin(14 * h) });
      const [bx, by] = api.S(400, 624 - (90 + 210 * st.open));
      if (h < .3) { const s = eob(h / .1) * (1 - sm((h - .18) / .12)); api.c.fx.push({ k: 'spike', x: bx + 30, y: by - 30, s: 2.1 * s, r: h * 60, c: '#FFD23C', a: 1 }); }
      api.word('OUCH!', api.S(222, topY(st))[0] - 40, api.S(222, topY(st) - 60)[1], t, HT + .04, .8, -10);
      if (h > .35 && h < 1.9) {
        const a = 1 - sm((h - 1.5) / .4), [hx, hy] = api.S(222, topY(st) - 30);
        for (let i = 0; i < 3; i++) { const an = h * 5 + i * TAU / 3; api.c.fx.push({ k: 'star', x: hx + cos(an) * 70, y: hy + sin(an) * 18 - sm((h - .35) / .15) * 8, s: .9 + .2 * sin(an + 1), r: an * 40, c: i == 1 ? '#f06a8a' : '#FFD23C', a }); }
      }
    }
  } };

M.happy = { label: 'Yay', dur: 3.2, loop: false,
  state(t, form) {
    let y = 0, r = 0, pv = 0, sy = 1 + .02 * breath(t);
    const hop = (s, e, H) => { const u = (t - s) / (e - s); return u > 0 && u < 1 ? H * 4 * u * (1 - u) : 0; };
    y = hop(.55, 1.15, 105) + hop(1.95, 2.7, 135);
    sy *= keys(t, [[0, 1], [.2, .8], [.28, .82], [.36, 1.2], [.9, 1.08], [1.15, 1.1], [1.22, .74], [1.34, 1.08], [1.45, 1], [1.7, 1], [1.85, .76], [1.95, .8], [2.02, 1.22], [2.55, 1.08], [2.7, 1.12], [2.78, .72], [2.92, 1.08], [3.05, .99], [3.2, 1]]);
    if (t > 2.0 && t < 2.72) { r = 360 * sm((t - 2.0) / .7); pv = 110; }
    if (t > .55 && t < 1.15) r = 6 * sin(PI * (t - .55) / .6);
    return { b: B({ y, r, pv, sy, sx: volume(sy) }), open: form, zoom: zf(form) };
  },
  extra(t, st, A, api) {
    const up = keys(t, [[0, 0], [.25, -.5], [.45, 0], [.55, 1], [1.15, 1], [1.4, .2], [1.7, 0], [1.85, -.5], [1.95, -.3], [2.02, 1], [2.7, 1], [2.95, .1], [3.2, 0]]);
    const fl = sin(TAU * 3.2 * t);
    for (const [id, sg, ph] of [['arm-top-l1', 1, 0], ['arm-top-l2', 1, .7], ['arm-top-l3', 1, 1.4], ['arm-top-r1', -1, .3], ['arm-top-r2', -1, 1], ['arm-top-r3', -1, 1.7]])
      A(id, { r: sg * (up > 0 ? up * (30 + 10 * sin(TAU * 3.2 * t + ph)) : up * 20) });
    const sq = keys(t, [[0, 0], [.3, .6], [.5, 1], [1.2, 1], [1.5, 0], [1.8, .4], [2, 1], [2.8, 1], [3.0, 0]]);
    A('eye-left', { sy: 1 - .62 * sq, sx: 1 + .12 * sq }); A('eye-right', { sy: 1 - .62 * sq, sx: 1 + .12 * sq });
    A('brow-left', { y: -4 * sq, r: -8 * sq }); A('brow-right', { y: -4 * sq, r: 8 * sq });
    A('boot-toe', { r: 10 * fl * sq }); A('leg-left-1', { r: sq * 6 * sin(TAU * 3.2 * t) }); A('leg-right-long', { r: -sq * 6 * sin(TAU * 3.2 * t) });
    const [cx, cy] = api.S(222, 624 - (70 + 230 * st.open));
    confetti(api.c, t, .95, cx, cy - 90, 20, 5, 560, 1.7, COL); confetti(api.c, t, 2.45, cx, cy - 60, 30, 8, 700, 1.9, COL);
    api.word('YAY!', api.S(222, 0)[0] + 120, api.S(222, topY(st) - 30)[1], t, .62, .9, 8);
    api.word('WHEE!', api.S(222, 0)[0] - 130, api.S(222, topY(st) - 30)[1], t, 2.1, .9, -8);
  } };

/* ---------- per-frame pose (demo: render(T)) ---------- */
function pose(c) {
  const m = M[c.clip], t = c.t, T = c.T, form = c.form;
  const st = m.state(t, form), b = st.b;
  c.zoom = st.zoom; c.open = st.open;
  const K = BASE * (c.useZoom ? st.zoom : 1);
  const lag = d => m.state(wrap(t - d, m.dur), form).b;
  const vel = d => { const a = lag(d), q = lag(d + .04); return { x: (a.x - q.x) / .04, y: (a.y - q.y) / .04, r: (a.r - q.r) / .04, sy: (a.sy - q.sy) / .04 }; };
  const A = c.add;
  /* ---- shared secondary motion (overlapping action) ---- */
  const v2 = vel(.09), v3 = vel(.13);
  A('fringe-top', { k: cl(-v2.x * .02, 16) + 1.8 * sin(2.2 * T + .5) + cl(v2.r * .06, 10), sy: 1 - cl(v2.y * .00032, .2), sx: 1 + cl(v2.y * .00012, .08) });
  A('fringe-bottom', { k: cl(-v3.x * .02, 16) + 1.5 * sin(2 * T + 2.1) + cl(v3.r * .05, 10), sy: 1 + cl(v3.y * .0003, .18), sx: 1 - cl(v3.y * .0001, .06) });
  const armPh = [0, .9, 1.8, .4, 1.3, 2.2], armF = [1.3, 1.1, 1.5, 1.2, 1.45, 1.05];
  ARMS_TOP.forEach((id, i) => {
    const sg = i < 3 ? 1 : -1; const v = vel(.05 + .03 * (i % 3) + .015 * i);
    A(id, { r: -sg * cl(v.y * .034, 38) - cl(v.x * .03, 22) + (4 + 1.2 * (i % 3)) * sin(armF[i] * T + armPh[i]) + cl(v.r * .12, 12) });
  });
  A('pin-left', { r: cl(-v3.x * .03, 26) + cl(v3.r * .35, 20) + 4 * sin(2.6 * T) + -cl(v2.y * .01, 10), sy: 1 - cl(v2.y * .0003, .2) });
  A('pin-right', { r: cl(-v3.x * .03, 26) + cl(v3.r * .35, 20) + 4 * sin(2.3 * T + 1.4) + cl(v2.y * .01, 10), sy: 1 - cl(v2.y * .0003, .2) });
  A('fur-left', { r: cl(-v2.x * .04, 25) + cl(v2.y * .02, 20) + 5 * sin(2.8 * T) }); A('fur-right', { r: cl(-v2.x * .04, 25) - cl(v2.y * .02, 20) + 5 * sin(2.5 * T + 1) });
  A('leg-left-1', { r: 2.2 * sin(1.1 * T) + cl(v2.y * .012, 8) }); A('leg-left-2', { r: -2.2 * sin(1.1 * T + .8) - cl(v2.y * .01, 7) });
  A('leg-right-long', { r: -2.2 * sin(1.1 * T) - cl(v2.y * .012, 8) }); A('leg-right-short', { r: 2 * sin(1.1 * T + .8) + cl(v2.y * .01, 7) });
  A('boot-toe', { r: cl(v3.y * .012, 10) + cl(-v3.x * .02, 9) + 1.5 * sin(1.5 * T) }); A('boot-foot', { r: cl(-v3.x * .01, 6) });
  /* eyes: wander + blink (global time) */
  const lx = 3.2 * sin(.6 * T) + 1.6 * sin(1.7 * T + 1), ly = 1.4 * sin(.9 * T + 2); const bl = blinkAmt(T);
  A('eye-left', { x: lx, y: ly, sy: 1 - .92 * bl }); A('eye-right', { x: lx, y: ly, sy: 1 - .92 * bl }); A('brow-left', { x: lx * .5 }); A('brow-right', { x: lx * .5 });
  /* inner limbs when open */
  [['arm-mid-left', 0], ['arm-low-left', .8], ['arm-mid-right', 1.6], ['arm-low-right', 2.4]].forEach(([id, ph], i) => A(id, { r: (i < 2 ? -1 : 1) * (4 * sin(1.2 * T + ph) + cl(v3.y * .012, 10)) }));
  /* head lags body */
  const L = lag(.07);
  const topLag = { r: cl((L.r - b.r) * .6, 6), sy: 1 + cl((L.sy - b.sy) * .7, .07), y: cl((L.y - b.y) * -.1, 5) };
  /* mode specifics */
  let glowOn = 0;
  const S = (cx, cy) => [(cx - CX + b.x) * K, (cy - CGY - b.y) * K];
  const api = { c, S, word: (txt, x, y, tt, t0, life, rot) => wordPop(c, txt, x, y, tt, t0, life, rot), glow: tau => { glowOn = sm(1 - tau / .6); } };
  if (m.extra) m.extra(t, st, A, api);
  /* ---- rig transform (character units -> feet-relative units) ---- */
  c.root().translate(b.x, -b.y).translate(0, -b.pv).rotate(b.r).translate(0, b.pv).scale(b.sx, b.sy).translate(-CX, -CGY);
  /* ---- open / fold ---- */
  const open = st.open, ty = GAP * (1 - open); const rh = (st.rh || 0) + topLag.r;
  c.local('part-top').translate(0, ty + topLag.y).rotate(rh, 140, 152).translate(222, 152).scale(1, topLag.sy).translate(-222, -152);
  const sv = Math.max(open, .001);
  if (open < .03) { c.hide('part-inside'); c.hide('foods'); }
  c.alpha('part-inside', sm((open - .3) / .4));
  c.local('part-inside').translate(0, HINGE_Y + ty).scale(1, sv).translate(0, -HINGE_Y);
  /* foods */
  const chomp = c.clip === 'chomp', gentle = chomp ? 0 : 1;
  FOODS.forEach((id, i) => {
    const f = m.foods ? m.foods(t, i) : { pop: 1, j: 0 }; const cyOrig = c.pivot(id)[1];
    const yy = 329 + ty / 2 + (cyOrig - 329) * sv;
    const s1 = Math.min(1, sv * 1.15) * Math.max(f.pop, .001), sxF = Math.max(f.pop, .001) * (1 + (1 - Math.min(1, sv)) * .3);
    const idle = gentle * (3.4 * sin(2.1 * T + i * 1.3)), idleR = gentle * 3 * sin(1.7 * T + i * 2.1);
    let jy = 0, jr = 0, jsx = 1, jsy = 1;
    if (chomp) { const j = f.j || 0; jy = -Math.abs(j) * 26 * (f.jy ? 1 : 0.4); jr = j * 10; jsy = 1 + j * .1 * (j > 0 ? 1 : 0.5); jsx = 1 - j * .07; jy += 3 * sin(2.1 * T + i); }
    const dy = (yy - cyOrig) + idle + jy;
    A(id, { y: dy, r: idleR + jr, sx: sxF * jsx, sy: s1 * jsy });
  });
  /* ---- shadow (stage px, relative to the feet) ---- */
  const hgt = Math.max(b.y, 0); const sc = 1 / (1 + hgt / 230);
  const rx = lerp(104, 132, clamp(open)) * K * sc * (1 + (1 - b.sy) * .5);
  c.shadow = { x: b.x * K, y: 3, rx, ry: rx * .15, a: .95 * (.4 + .6 * sc) };
  /* ---- world: ground scroll (hop) and shake ---- */
  c.scroll = c.clip === 'hop' ? M.hop.scroll(t) : 0;
  let shk = 0;
  if (c.clip === 'unfold' && t > UT && t < UT + .6) shk = exp(-8 * (t - UT)) * sin(60 * (t - UT)) * 6;
  if (chomp) for (const e of CEV) { const tau = t - e.s - .07; if (tau > 0 && tau < .3) shk += exp(-14 * tau) * sin(70 * tau) * 4; }
  if (c.clip === 'hurt' && t > HT && t < HT + .4) shk = exp(-9 * (t - HT)) * sin(70 * (t - HT)) * 7;
  c.shake[0] = shk; c.shake[1] = shk * .4;
  /* ---- glow / flash ---- */
  if (glowOn > .01) { const [gx, gy] = S(222, 330); c.glow = { x: gx, y: gy, r: 250 * K * (1.2 - glowOn * .4), a: glowOn }; }
  c.flash = st.flash && st.flash.a > .01 ? st.flash : null;
}

export default {
  id: 'monster',
  name: 'Munch',
  stagePx: BASE,             // demo stage px per character unit at zoom 1 (fx, shadow, glow, shake are in demo stage px)
  feet: [CX, CGY],           // character units that land on the (sx, sy) feet point
  forms: { folded: 0, open: 1 },
  clips: Object.fromEntries(Object.entries(M).map(([k, v]) => [k, { name: k, label: v.label, dur: v.dur, loop: v.loop, forms: v.forms || [0, 1] }])),
  order: ['idle', 'hop', 'unfold', 'chomp', 'hurt', 'happy'],
  pose,
};
