// Shared maths for rig clip code. These are copied verbatim (renamed only) from the helper block at the top of
// every Art/Demos/*_animation_demo.html script, so a clip ported from a demo behaves number-for-number the same.
// Keep them exactly as the demos have them (e.g. `keys` eases each segment with smoothstep, `rng` is mulberry32).

export const TAU = Math.PI * 2, PI = Math.PI;
export const { sin, cos, exp, abs, min, max, floor, pow } = Math;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const eob = t => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const eoc = t => 1 - Math.pow(1 - clamp(t), 3);
export const eic = t => { t = clamp(t); return t * t * t; };
export const wrap = (t, d) => ((t % d) + d) % d;
/** Clamp to +-m (the demos' `cl`). */
export const cl = (x, m) => clamp(x, -m, m);
/** Keyframes [[t, v], ...] with a smoothstep between neighbours (the demos' `keys`). */
export function keys(t, k) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) if (t < k[i + 1][0]) { const u = (t - k[i][0]) / (k[i + 1][0] - k[i][0]); return lerp(k[i][1], k[i + 1][1], sm(u)); }
  return k[k.length - 1][1];
}
/** Seeded random (the demos' `rng`, mulberry32). Same seed, same numbers as the demo page. */
export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** The demos' breathing wave and squash-preserving width. */
export const breath = t => { const b = sin(TAU * t / 3.2); return b + .25 * sin(TAU * t / 1.6); };

/** Blink schedule (the demos' `blinks` + `blinkAmt`): returns amt(T) 0 open .. 1 shut, on global time T. */
export function blinker(seed = 11, first = 1.1, spread = 3.4) {
  const bl = []; const R = rng(seed); let t = first;
  for (let i = 0; i < 400; i++) { bl.push(t); const r = R(); if (r < .18) bl.push(t + .26); t += 1.3 + R() * spread + (r > .85 ? 2.2 : 0); }
  return T => {
    let lo = 0, hi = bl.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bl[m] <= T) lo = m; else hi = m - 1; }
    const d = T - bl[lo]; if (d < 0 || d > .2) return 0; return d < .07 ? d / .07 : 1 - sm((d - .07) / .13);
  };
}

/* ---- particle helpers (the demos' confetti / crumbs). They push sprites into c.fx in stage px. ---- */
/** Confetti burst from stage point (ox, oy) at time t0. cols: palette; kinds(i) picks the symbol. */
export function confetti(c, t, t0, ox, oy, n, seed, speed = 520, life = 1.6, cols, kind = i => i % 3 ? 'scrap' : 'star', size = i => i % 3 ? 1.1 : .9) {
  const tau = t - t0; if (tau < 0 || tau > life) return; const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = -PI / 2 + (R() - .5) * 2.3, v = speed * (.45 + R() * .7), vx = cos(a) * v, vy = sin(a) * v;
    c.fx.push({ k: kind(i), x: ox + vx * tau, y: oy + vy * tau + .5 * 900 * tau * tau, s: size(i) * (.8 + R() * .6), r: R() * 360 + tau * (R() - .5) * 900, c: cols[i % cols.length], a: 1 - sm((tau - life * .55) / (life * .45)) });
  }
}
export function crumbs(c, t, t0, ox, oy, n, seed, speed = 260, life = .7, col = '#FFD23C', col2 = '#ef6d27') {
  const tau = t - t0; if (tau < 0 || tau > life) return; const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * .6, v = speed * (.5 + R() * .6);
    c.fx.push({ k: 'dot', x: ox + cos(a) * v * tau * (1 - .4 * tau), y: oy + sin(a) * v * tau + 300 * tau * tau, s: (1 - tau / life) * (.5 + R() * .5), c: i % 2 ? col : col2, a: 1 });
  }
}
/** The demos' wordPop: sets c.word (the last active call in a frame wins, as in the demo's single <text>). */
export function wordPop(c, txt, x, y, t, t0, life, rot = -8) {
  const tau = t - t0; if (tau < 0 || tau > life) return false;
  const s = eob(tau / .14) * (1 - sm((tau - life + .15) / .15) * .3);
  c.word = { text: txt, x, y, r: rot, s: Math.max(s, .01), a: 1 - sm((tau - life + .12) / .12) };
  return true;
}
