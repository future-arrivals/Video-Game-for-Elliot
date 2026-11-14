// Webster the spider-bat (id `spider`): clip code ported from Art/Demos/webster_animation_demo.html (its <script>,
// sections "Webster: rig", "modes" and "render"). Numbers, timings, keyframes and seeds are copied unchanged; only
// the plumbing differs:
//   demo add(id, o)         -> c.add(id, o)
//   demo api.S(cx, cy)      -> S(cx, cy): stage px relative to the feet point (demo absolute x - SX, y - GY)
//   demo fxAdd / wordPop    -> c.fx.push / wordPop(c, ...)
// Part names are the demo's element ids (wing-l, wing-l2, l1..r3c, head, brow-l, eye-a, jaw ...).
// Ported: idle, walk (Skitter), ouch (hurt), yay (taunt). Left out: drop (the web drop is mostly the silk thread
// and the runtime cannot draw a thread) and shot (needs the strand and the net). The silk thread itself is not
// drawn in any clip. The demo's #maw (the dark mouth) is opacity 0 in the art file, so the atlas has no layer for it.
import {
  TAU, PI, sin, cos, exp, abs, max, clamp, lerp, sm, eob, eoc, eic, wrap, cl, keys, blinker, wordPop, confetti,
} from './kit.js';

/* ---------- stage constants (demo: "stage constants" and CH) ---------- */
const SX = 480, GY = 540;
const PX = 158, PY = 92, K0 = 1.8, CY = 300, FEET = 147, SHW = 80, AO = 23;
const GROUND = -141, AY = -250;
const HANG_Y = CY - AO * K0 - (AY + 475);   // b.y of a body hanging straight down at rest length (about 34)
const LG = ['l1', 'l2', 'l3', 'r1', 'r2', 'r3'];
const blinkAmt = blinker(11, 1.1, 3.4);
const CONF = ['#3a3a3a', '#fbfaf6', '#7cc3e8', '#f06a8a', '#FFD23C', '#8a8f9c'];

const B = o => Object.assign({ x: 0, y: 0, r: 0, sx: 1, sy: 1 }, o);
function flashAt(h) {
  if (h < 0) return null; if (h < .06) return { a: .8, c: [1, 1, 1] }; if (h < .12) return { a: .0, c: [1, 1, 1] }; if (h < .2) return { a: .7, c: [1, 1, 1] };
  if (h < .8) return { a: .55 * exp(-5 * (h - .2)), c: [1, .35, .32] }; return null;
}
const FACE = o => Object.assign({ mouth: 0, brow: 0, raise: 0, eye: 1, squint: 0, look: 0, hr: 0 }, o);
const flapP = (ph, amp, bias, bend = -6) => ({ ph, amp, bias, bend });
const LP = o => Object.assign({ ph: 0, amp: 0, w: .7, k: .8, curl: 0, tri: 0 }, o);
/* body placement from the stage point where the thread meets the top of his head */
function place(tx, ty, r, sx, sy) {
  const c = cos(r * PI / 180), s = sin(r * PI / 180), K = K0;
  const rx = AO * sy * s, ry = -AO * sy * c; return B({ x: tx - SX - rx * K, y: CY + ry * K - ty, r, sx, sy });
}
function hang(L, th, r, sx, sy, ax = SX) {
  const tx = ax + L * sin(th * PI / 180), ty = AY + L * cos(th * PI / 180);
  return { b: place(tx, ty, r, sx, sy), thread: { ax, ay: AY, tx, ty, sway: -th * .6 } };
}
const chat = (t, s, e, n) => t > s && t < e ? .5 * Math.max(0, sin(TAU * n * (t - s))) : 0;

/* ---------- clips (demo: M.idle, M.walk, M.ouch, M.yay). state(t) -> { b, fl, leg, face, ... } ---------- */
const M = {};
/* 1: idle (dangling) */
M.idle = { label: 'Idle', dur: 6.4, loop: true,
  state(t) {
    const th = 5 * sin(TAU * t / 3.2), L = 475 + 8 * sin(TAU * t / 1.6 + .5);
    const h = hang(L, th, th * .8 + 2.5 * sin(TAU * t / 1.6 + 1), 1, 1 + .02 * sin(TAU * t / 1.6));
    const lk = keys(t, [[0, 0], [1.5, 0], [1.9, -1], [2.6, -1], [3.0, 1], [3.9, 1], [4.3, 0], [6.4, 0]]);
    return Object.assign(h, { fl: flapP(TAU * 1.25 * t, 10, 22, -8), leg: LP({ ph: TAU * t / 1.6, amp: 9, w: .5, curl: 4 }),
      face: FACE({ mouth: chat(t, 2.8, 3.5, 7) + chat(t, 5.3, 5.8, 7), look: lk, hr: lk * 4, brow: .2 * sin(TAU * t / 3.2) }) });
  },
  extra() {} };
/* 2: skitter (movement) */
M.walk = { label: 'Skitter', dur: 3.2, loop: true,
  state(t) {
    const ph = TAU * 2.5 * t;
    return { b: B({ x: 6 * sin(TAU * t / 3.2), y: GROUND + 5 * (1 - cos(2 * ph)) / 2, r: 2.5 * sin(ph), sx: 1, sy: 1 - .02 * cos(2 * ph) }),
      fl: flapP(TAU * 5 * t, 8, 38, -6), leg: LP({ ph, amp: 26, k: .55, tri: 1 }), face: FACE({ mouth: chat(t, .3, 3, 6) * .45, look: 1, hr: 2 * sin(ph), brow: .4, eye: 1 }), shw: 1 };
  },
  scroll: t => t * 300, extra() {} };
/* 5: ouch */
const HT = .4;
M.ouch = { label: 'Ouch! (hurt)', dur: 3.2, loop: false,
  state(t) {
    const h = t - HT, hh = Math.max(h, 0);
    const th = h > 0 ? 40 * exp(-1.6 * h) * sin(6 * h) : 0 + 3 * sin(TAU * t / 3.2);
    const L = 475 + (h > 0 ? 24 * exp(-4 * h) * cos(18 * h) : 8 * sin(TAU * t / 1.6));
    const r = th * .7 + (h > 0 ? 10 * exp(-3 * h) * sin(14 * h) : 0);
    const sx = h > 0 ? 1 - .2 * exp(-9 * h) * cos(22 * h) : 1, sy = h > 0 ? 1 + .24 * exp(-9 * h) * cos(22 * h) : 1;
    const hit = h > 0 ? 1 : 0;
    const bias = keys(t, [[0, 22], [.4, 22], [.5, 70], [1.4, 70], [2.0, 30], [2.5, 22]]), amp = keys(t, [[0, 10], [.4, 10], [.5, 5], [1.4, 5], [1.8, 14], [2.5, 10]]), bend = keys(t, [[.4, -8], [.5, -55], [1.4, -55], [1.9, -8]]);
    return Object.assign(hang(L, th, r, sx, sy), { fl: flapP(TAU * 2.5 * t, amp, bias, bend),
      leg: LP({ ph: TAU * 5 * t, amp: hit * 32 * exp(-1.1 * hh) + 9 * (1 - hit), w: .6, k: 1, curl: hit * -14 * exp(-1.5 * hh) }),
      face: FACE({ eye: 1 + .65 * hit * exp(-1.2 * hh), mouth: hit ? .9 * sm(h / .08) * (1 - sm((h - 1.2) / .3)) * (.8 + .2 * sin(TAU * 6 * h)) : 0, brow: hit * -1.2 * sm(h / .1) * (1 - sm((h - 1.3) / .8)), raise: hit * .8 * exp(-2 * hh), hr: hit * -8 * exp(-2 * hh), look: -1 }), flash: flashAt(h) });
  },
  shake(t) { const h = t - HT; return h > 0 && h < .4 ? exp(-9 * h) * sin(70 * h) * 7 : 0; },
  extra(t, st, T, A, api) {
    const h = t - HT;
    if (h > 0) {
      const [hx, hy] = api.S(158, 85);
      if (h < .3) { const s = eob(h / .1) * (1 - sm((h - .18) / .12)); api.c.fx.push({ k: 'spike', x: hx - 110, y: hy - 10, s: 2.1 * s, r: h * 60, c: '#FFD23C', a: 1 }); }
      api.word('OUCH!', hx + 40, Math.max(hy - 170, 80 - GY), t, HT + .04, .8, -10);   // demo: max(hy-170, 80) in absolute stage px
      if (h > .35 && h < 1.9) {
        const a = 1 - sm((h - 1.5) / .4);
        for (let i = 0; i < 3; i++) { const an = h * 5 + i * TAU / 3; api.c.fx.push({ k: 'star', x: hx + cos(an) * 85, y: hy - 62 + sin(an) * 16, s: .9 + .2 * sin(an + 1), r: an * 40, c: i == 1 ? '#f06a8a' : '#FFD23C', a }); }
      }
    }
  } };
/* 6: yay (taunt) */
M.yay = { label: 'Yay! (taunt)', dur: 3.6, loop: false,
  state(t) {
    let L = 475, th = 0, sx = 1, sy = 1;
    const c = sm((t - .1) / .25) * (1 - sm((t - .38) / .08));
    L += -18 * c; sy = 1 - .1 * c;
    if (t > .4 && t < 1.4) { const u = t - .4; L = 475 + 95 * sin(TAU * u / .5) * exp(-.8 * u) * (u < .99 ? 1 : 0); sy *= 1 + .1 * cos(TAU * u / .5) * exp(-1 * u); }
    const ph2 = TAU * 2 * sm((t - .9) / 1.3) * (t > .9 && t < 2.2 ? 1 : 0) + (t >= 2.2 ? TAU * 2 : 0);
    sx = cos(ph2);
    const w = sm((t - 1.6) / .3) * (1 - sm((t - 3.2) / .3));
    th = 7 * w * sin(TAU * t / .9);
    if (t > 2.2 && t < 2.8) { const q = t - 2.2; sy *= 1 - .1 * exp(-8 * q) * cos(26 * q); }
    const hh = hang(L, th, th * .6, sx, sy);
    const lw = keys(t, [[0, 0], [.6, 0], [.9, 1], [3.0, 1], [3.4, 0]]);
    return Object.assign(hh, { fl: flapP(TAU * 2.5 * t, 16, 30, -6),
      leg: LP({ ph: TAU * 5 * t, amp: 8 + 24 * lw, w: .8, k: 1, curl: 0 }),
      face: FACE({ mouth: (.15 + .85 * abs(sin(TAU * 3 * t))) * lw * .7, brow: .6, raise: lw, squint: .45 * lw, hr: 6 * w * sin(TAU * 3.3 * t), look: sin(TAU * t / 1.2) * w }) });
  },
  extra(t, st, T, A, api) {
    const [cx, cy] = api.S(158, 92);
    api.word('HEH HEH!', -170, 170 - GY, t, .95, .8, -8); api.word('GOTCHA!', 160, 150 - GY, t, 2.35, .95, 7);
    confetti(api.c, t, 2.2, cx, cy - 40, 18, 5, 560, 1.5, CONF);
  } };
const ORDER = ['idle', 'walk', 'ouch', 'yay'];

/* ---------- per-frame pose (demo: render(T) and CH.common) ---------- */
function pose(c) {
  const m = M[c.clip], t = c.t, T = c.T;
  const st = m.state(t), b = st.b, K = K0;
  const lag = d => m.state(wrap(t - d, m.dur));
  const vel = d => { const a = lag(d).b, q = lag(d + .04).b; return { x: (a.x - q.x) / .04, y: (a.y - q.y) / .04, r: (a.r - q.r) / .04, sy: (a.sy - q.sy) / .04 }; };
  const A = c.add;
  /* ---- CH.common ---- */
  const fl = st.fl, f = st.face, lg = st.leg;
  const up = fl.bias + fl.amp * sin(fl.ph);
  const tip = fl.bend + fl.amp * .85 * (sin(fl.ph - 1.15) - sin(fl.ph));
  const shr = 1 - clamp(up, 0, 90) * .0017;
  A('wing-l', { r: up, sx: shr }); A('wing-l2', { r: tip }); A('wing-r', { r: -up, sx: shr }); A('wing-r2', { r: -tip });
  const v = vel(.08);
  for (let i = 0; i < 6; i++) {
    const sg = i < 3 ? -1 : 1;
    const phi = lg.tri ? lg.ph + (((i == 0 || i == 2 || i == 4)) ? 0 : PI) : lg.ph - lg.w * i;
    const a = lg.amp * sin(phi), cu = sg * lg.curl;
    A(LG[i], { r: cu + a + cl(v.x * .012, 9) });
    A(LG[i] + 'b', { r: cu * .7 + lg.amp * lg.k * sin(phi - .9) + cl(v.x * .008, 7) });
    A(LG[i] + 'c', { r: cu * .5 + lg.amp * lg.k * 1.2 * sin(phi - 1.8) + cl(v.x * .008, 6) });
  }
  const vh = vel(.09);
  A('head', { r: f.hr + cl(-vh.x * .01, 7) + cl(vh.r * .07, 7), y: cl(-vh.y * .003, 3) });
  const lx = f.look * 4 + 1.4 * sin(.7 * T), ly = 1.1 * sin(.9 * T + 2); const bl = Math.max(blinkAmt(T), f.squint); const s = f.eye;
  A('eye-a', { x: lx, y: ly, sx: s, sy: s * (1 - .9 * bl) }); A('eye-b', { x: lx, y: ly, sx: s, sy: s * (1 - .9 * bl) });
  A('brow-l', { r: f.brow * 14, y: -f.raise * 7 }); A('brow-r', { r: -f.brow * 14, y: -f.raise * 7 });
  A('jaw', { y: 9 * f.mouth, sy: 1 + .08 * f.mouth });
  // demo: A('maw', { sy: max(mouth * 1.15, .02) }) and its opacity switch: no layer for #maw in the atlas
  /* ---- mode specifics ---- */
  const S = (cx, cy) => {
    const dx = (cx - PX) * b.sx, dy = (cy - PY) * b.sy, cs = cos(b.r * PI / 180), sn = sin(b.r * PI / 180);
    return [b.x + (dx * cs - dy * sn) * K, CY - b.y + (dx * sn + dy * cs) * K - GY];
  };
  const api = { c, S, word: (txt, x, y, tt, t0, life, rot) => wordPop(c, txt, x, y, tt, t0, life, rot) };
  m.extra(t, st, T, A, api);
  /* ---- rig transform: demo translate(SX+b.x CY-b.y) scale(K) rotate(r) scale(sx sy) translate(-PX -PY), here in
     units relative to the feet point (SX, GY) ---- */
  // c.form === 1 (passed by the game's walking view only; the dev page uses 0): the hanging clips have no thread there, so the body is lowered by
  // the hang height (a body hanging straight at rest has b.y = HANG_Y) to stand on the ground like the skitter.
  const drop = c.form === 1 && st.thread ? HANG_Y - GROUND : 0;
  c.root().translate(b.x / K, (CY - GY - b.y - drop) / K).rotate(b.r).scale(b.sx, b.sy).translate(-PX, -PY);
  /* ---- shadow (stage px, relative to the feet) ---- */
  const feetY = CY + (FEET - PY) * K - b.y, hgt = max(0, GY - feetY); const sc = 1 / (1 + hgt / 260);
  const rx = SHW * K * sc * (st.shw || 1);
  c.shadow = { x: b.x, y: 3, rx, ry: rx * .15, a: .95 * (.35 + .65 * sc) };
  /* ---- world ---- */
  c.scroll = m.scroll ? m.scroll(t) : 0;
  const shk = m.shake ? m.shake(t) : 0; c.shake[0] = shk; c.shake[1] = shk * .4;
  c.flash = st.flash && st.flash.a > .01 ? st.flash : null;
}

export default {
  id: 'spider',
  name: 'Webster',
  stagePx: K0,               // demo stage px per character unit
  feet: [PX, FEET],          // character units of the feet (the root above already puts the feet at the origin)
  clips: Object.fromEntries(Object.entries(M).map(([k, v]) => [k, { name: k, label: v.label, dur: v.dur, loop: v.loop, forms: [0, 1] }])),
  order: ORDER,
  pose,
};
