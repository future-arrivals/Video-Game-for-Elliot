// Spook the ghost (id `ghost`): clip code ported from Art/Demos/spook_animation_demo.html (its <script>, sections
// "stage constants", "modes" and "render"). Numbers, timings, keyframes and seeds are copied unchanged; only the
// plumbing differs:
//   demo add(id, o)         -> c.add(id, o)
//   demo api.S(cx, cy)      -> S(cx, cy): stage px relative to the stage point (SX, GY)
//   demo fxAdd / wordPop    -> c.fx.push / wordPop(c, ...)
// Part names are the demo's element ids (arm-l, arm-r, body-path, eye-a, eye-b, mouth, mouth-in, mouth-open).
// Ported: idle, float, hurt. Left out: fade (needs the hedge scenery), boo (its starburst and scare lines are drawn
// behind him in the demo; the runtime has no back fx layer and no stretched sprites), happy (the two cameo ghosts are
// other drawings, not parts of this one).
// APPROXIMATION: the demo re-draws #body-path every frame, shifting each point by D(x, y) (the tail lags and ripples).
// A bitmap cannot be re-bent, so the body is a rigid piece here: it gets a skewX about the top of the body that matches
// the sway term `sw` (least-squares slope of sw*u^2 over the body, 0.75*sw per body height). The ripple term `wv` is
// not drawn on the body. The face parts follow the demo exactly (their pivots move by D, as in the demo).
import {
  TAU, PI, sin, cos, exp, clamp, lerp, sm, eob, eoc, wrap, cl, keys, blinker, wordPop,
} from './kit.js';

/* ---------- stage constants ---------- */
const SX = 480, SY0 = 292, GY = 540, BASE = 1.5, PX = 143, PY = 125;
const BOT = 225.5;                       // lowest point of #body-path (the tail tip), character units
const PARTS = { 'arm-l': [82, 104], 'arm-r': [203, 100], 'eye-a': [140, 50], 'eye-b': [183, 55], 'mouth': [146, 112], 'mouth-in': [148, 119], 'mouth-open': [146, 108] };
const blinkAmt = blinker(11, 1.1, 3.4);

const B = o => Object.assign({ x: 0, y: 0, r: 0, sx: 1, sy: 1, op: 1, zoom: 1 }, o);
const vol = sy => 1 + (1 - sy) * .6;
const bob = t => sin(TAU * t / 2.6);

/* ---------- body bend (demo: D) ---------- */
const D = (bend, x, y) => { const u = clamp((y - 20) / 206); return [x + bend.sw * u * u + bend.wv * u * sin(4.2 * u - bend.ph), y]; };

/* ---------- clips ---------- */
const M = {};
/* 1: idle */
M.idle = { label: 'Idle', dur: 7, loop: true,
  state(t) {
    const g = sm((t - 4.1) / .12) * (1 - sm((t - 5.3) / .2)), gs = sin(TAU * 9 * t);
    const sy = 1 + .025 * sin(TAU * t / 2.6 + 1) + .035 * g * gs;
    return { b: B({ y: 12 * bob(t), x: 3 * g * gs, r: 2.2 * sin(TAU * t / 3.9) + 2 * g * sin(TAU * 9 * t + 1), sy, sx: vol(sy) }), mo: .6 * g * (.75 + .25 * gs), g };
  },
  extra(t, st, T, A) {
    const g = st.g;
    A('arm-l', { r: 10 * sin(TAU * t / 2.6 - .7) + g * 16 * sin(TAU * 7 * t) }); A('arm-r', { r: -10 * sin(TAU * t / 2.6 - 1.1) - g * 16 * sin(TAU * 7 * t + .8) });
    A('eye-a', { sy: 1 - .6 * g, sx: 1 + .1 * g }); A('eye-b', { sy: 1 - .6 * g, sx: 1 + .1 * g });
    if (t > 5.8 && t < 6.7) { const k = sm((t - 5.8) / .15) * (1 - sm((t - 6.4) / .25)); A('eye-a', { x: -7 * k, y: 1 * k }); A('eye-b', { x: -7 * k, y: 1 * k }); }
  },
  bend(t, T) { return { sw: 0, wv: 5, ph: T * 3.2 }; } };
/* 2: float */
M.float = { label: 'Float (glide)', dur: 3.2, loop: true,
  state(t) { const c = TAU * t / 1.6; return { b: B({ y: 15 * sin(c), r: 9 + 3 * sin(c - 1.2), sy: 1 + .03 * sin(c + .6), sx: 1 - .02 * sin(c + .6) }), mo: .18 + .08 * sin(c - .5) }; },
  extra(t, st, T, A) {
    const c = TAU * t / 1.6;
    A('arm-l', { r: 14 + 12 * sin(2 * c - .3) }); A('arm-r', { r: 6 + 22 * sin(2 * c - 1) });
    A('eye-a', { x: 2.5, y: 0 }); A('eye-b', { x: 2.5, y: 0 });
  },
  bend(t, T) { const c = TAU * t / 1.6; return { sw: -44 + 6 * sin(c), wv: 11, ph: TAU * t / .8 }; },
  scroll(t) { return t * 150; } };
/* 5: ouch */
const HT = .45;
function flashAt(h) {
  if (h < 0) return null; if (h < .06) return { a: .8, c: [1, 1, 1] }; if (h < .12) return { a: .0, c: [1, 1, 1] }; if (h < .2) return { a: .7, c: [1, 1, 1] };
  if (h < .8) return { a: .55 * exp(-5 * (h - .2)), c: [1, .35, .32] }; return null;
}
M.hurt = { label: 'Ouch! (hurt)', dur: 3.8, loop: false,
  state(t) {
    const h = t - HT; let x = 0, y = 12 * bob(t), r = 0, sx = 1, sy = 1 + .025 * sin(TAU * t / 2.6 + 1), op = 1, mo = 0;
    if (h > 0) {
      x = -100 * eoc(h / .4); if (h > 1.35) x = -100 * (1 - sm((h - 1.35) / .9));
      y += 40 * sin(PI * clamp(h / .45)) + (h > 1.35 && h < 2.15 ? 10 * sin(PI * (h - 1.35) / .8) : 0);
      r = -20 * exp(-4 * h) * cos(12 * h) + (h > 1.35 && h < 2.2 ? 5 * sin(PI * (h - 1.35) / .85) : 0);
      sx = 1 - .24 * exp(-9 * h) * cos(24 * h); sy = 1 + .28 * exp(-9 * h) * cos(24 * h);
      if (h > .08 && h < .85) op = .55 + .45 * (sin(34 * h) > 0 ? 1 : 0);
      mo = h < 1.5 ? clamp(.9 * exp(-1.2 * h) * (1 + .25 * sin(18 * h)), 0, 1.2) : 0;
    }
    return { b: B({ x, y, r, sx, sy, op }), mo, flash: flashAt(h) };
  },
  extra(t, st, T, A, api) {
    const h = t - HT;
    if (h > 0) {
      const w = exp(-2.6 * h);
      A('eye-a', { sx: 1 + .4 * exp(-1.4 * h), sy: 1 + .4 * exp(-1.4 * h) }); A('eye-b', { sx: 1 + .4 * exp(-1.4 * h), sy: 1 + .4 * exp(-1.4 * h) });
      A('arm-l', { r: (38 + 30 * cos(15 * h)) * w }); A('arm-r', { r: -(38 + 30 * cos(15 * h + .5)) * w });
      const [bx, by] = api.S(PX + 30, 70);
      if (h < .3) { const s = eob(h / .1) * (1 - sm((h - .18) / .12)); api.c.fx.push({ k: 'spike', x: bx + 30, y: by - 10, s: 2.1 * s, r: h * 60, c: '#FFD23C', a: 1 }); }
      api.word('OUCH!', -150, 120 - GY, t, HT + .04, .8, -10);   // demo: x = SX - 150, y = 120 in absolute stage px
      if (h > .35 && h < 1.95) {
        const a = 1 - sm((h - 1.55) / .4), [hx, hy] = api.S(PX, -4);
        for (let i = 0; i < 3; i++) { const an = h * 5 + i * TAU / 3; api.c.fx.push({ k: 'star', x: hx + cos(an) * 70, y: hy + sin(an) * 18 - sm((h - .35) / .15) * 8, s: .9 + .2 * sin(an + 1), r: an * 40, c: i == 1 ? '#f06a8a' : '#FFD23C', a }); }
      }
    }
  },
  bend(t, T) { const h = t - HT; const w = h > 0 ? exp(-2.4 * h) : 0; return { sw: -70 * w * cos(10 * h) || 0, wv: 5 + 16 * w, ph: T * 9 }; },
  shake(t) { const h = t - HT; return h > 0 && h < .4 ? exp(-9 * h) * sin(70 * h) * 7 : 0; } };
const ORDER = ['idle', 'float', 'hurt'];

/* ---------- per-frame pose (demo: render(T)) ---------- */
function pose(c) {
  const m = M[c.clip], t = c.t, T = c.T;
  const st = m.state(t), b = st.b;
  const K = BASE * (c.useZoom ? b.zoom : 1); c.zoom = b.zoom;
  const lag = d => m.state(wrap(t - d, m.dur)).b;
  const vel = d => { const a = lag(d), q = lag(d + .04); return { x: (a.x - q.x) / .04, y: (a.y - q.y) / .04, r: (a.r - q.r) / .04, sy: (a.sy - q.sy) / .04 }; };
  const v2 = vel(.09), v3 = vel(.14);
  const A = c.add;
  /* shared secondary motion */
  A('arm-l', { r: -cl(v2.y * .03, 30) - cl(v2.x * .02, 18) + cl(v2.r * .1, 12) + 3 * sin(1.3 * T) });
  A('arm-r', { r: cl(v3.y * .03, 30) + cl(v3.x * .02, 18) - cl(v3.r * .1, 12) - 3 * sin(1.1 * T + 1) });
  /* face lags body */
  for (const id of ['eye-a', 'eye-b', 'mouth', 'mouth-in']) A(id, { x: cl(-v2.x * .02, 5), y: cl(v2.y * .01, 4) });
  const lx = 3 * sin(.6 * T) + 1.5 * sin(1.7 * T + 1), ly = 1.2 * sin(.9 * T + 2); const bl = blinkAmt(T);
  A('eye-a', { x: lx, y: ly, sy: 1 - .92 * bl }); A('eye-b', { x: lx, y: ly, sy: 1 - .92 * bl });
  A('mouth', { x: lx * .4 }); A('mouth-in', { x: lx * .4 });
  /* mouth open */
  const mo = Math.max(st.mo || 0, 0);
  A('mouth-open', { sx: Math.max(mo, .001), sy: Math.max(mo, .001) });
  const lipFade = 1 - clamp((mo - .12) * 5);
  c.alpha('mouth', lipFade); c.alpha('mouth-in', lipFade);
  if (mo < .03) c.hide('mouth-open');
  const S = (cx, cy) => [(cx - PX + b.x) * K, (SY0 - GY) + (cy - PY - b.y) * K];   // demo S() minus (SX, GY)
  const api = { c, S, word: (txt, x, y, tt, t0, life, rot, sc) => wordPop(c, txt, x, y, tt, t0, life, rot) };
  m.extra(t, st, T, A, api);
  /* bend + body */
  const bend = m.bend(t, T, b, v2);
  for (const id in PARTS) { const pv = PARTS[id], d = D(bend, pv[0], pv[1]); A(id, { x: d[0] - pv[0] }); }   // demo: translate(d[0] + a.x, pv[1] + a.y)
  A('body-path', { k: Math.atan(.75 * bend.sw / 206) * 180 / PI });
  /* rig transform: demo translate(SX SY0) scale(K) translate(b.x -b.y) rotate scale translate(-PX -PY), here in units
     relative to the stage point (SX, GY). c.form === 1 (the game's walking view): the tail tip at rest sits on the ground point. */
  const base = c.form === 1 ? -(BOT - PY) : (SY0 - GY) / BASE;
  c.root().translate(0, base).scale(c.useZoom ? b.zoom : 1).translate(b.x, -b.y).rotate(b.r).scale(b.sx, b.sy).translate(-PX, -PY);
  if (b.op < 1) for (const id of ['arm-l', 'arm-r', 'body-path', 'eye-a', 'eye-b', 'mouth', 'mouth-in', 'mouth-open']) c.alpha(id, b.op);   // demo: opacity on #rig (overlaps show through while fading)
  /* shadow (stage px, relative to the stage point) */
  const bottomH = Math.max(b.y, 0); const sc = 1 / (1 + bottomH / 200);
  const rx = 84 * K / 1.5 * 1.5 * sc * (1 + (1 - b.sy) * .3) * (.9 + .1 * b.zoom);
  c.shadow = { x: b.x * K, y: 3, rx, ry: rx * .15, a: (.35 + .6 * sc) * b.op };
  /* world */
  c.scroll = m.scroll ? m.scroll(t) : 0;
  const shk = m.shake ? m.shake(t) : 0; c.shake[0] = shk; c.shake[1] = shk * .4;
  c.flash = st.flash && st.flash.a > .01 ? st.flash : null;
}

export default {
  id: 'ghost',
  name: 'Spook',
  stagePx: BASE,
  feet: [PX, BOT],           // character units: the tail tip
  clips: Object.fromEntries(Object.entries(M).map(([k, v]) => [k, { name: k, label: v.label, dur: v.dur, loop: v.loop, forms: [0, 1] }])),
  order: ORDER,
  pose,
};
