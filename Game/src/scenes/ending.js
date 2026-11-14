// The ending moment after Big Ghost is beaten: confetti and a big drawn star card with two hearts, no words.
// Drawn over the field for ENDING.secs while the field waits. Pure drawing of an age; no flashing (everything
// eases in and out, nothing blinks).
import { W, H, INK, PAPER, rng, clamp, eOutCubic } from '../render/core.js';

export const ENDING = {
  secs: 3, sound: 'fanfare',
  fadeIn: .3, fadeOut: .5,
  confetti: { n: 70, minSpeed: 120, maxSpeed: 210, sway: 26, size: 7, delay: .8, cols: ['#E4574A', '#F6D24A', '#7FC25B', '#5DA9DA', '#E99DBB', '#F39A3B'] },
  card: { w: 230, h: 170, y: H / 2 - 6, fill: PAPER, line: INK, lw: 4, tilt: -.03 },
  star: { r: 62, inner: .45, fill: '#F6D24A', lw: 4, y: -4 },
  heart: { s: 13, fill: '#E4574A', dx: 84, dy: 50, rise: 8 },
};

export function drawEnding(ctx, age, timeMs = 0) {
  const E = ENDING, u = clamp(age / E.secs);
  const a = clamp(age / E.fadeIn) * clamp((E.secs - age) / E.fadeOut);
  ctx.save(); ctx.lineJoin = 'round';
  // confetti: paper scraps falling and swaying
  const C = E.confetti, r = rng(4242);
  for (let i = 0; i < C.n; i++) {
    const x0 = r() * W, sp = C.minSpeed + r() * (C.maxSpeed - C.minSpeed), d = r() * C.delay, ph = r() * 6, rot = r() * 6, col = C.cols[i % C.cols.length];
    const t = age - d; if (t <= 0) continue;
    const y = -12 + sp * t, x = x0 + Math.sin(t * 2 + ph) * C.sway;
    if (y > H + 12) continue;
    ctx.save(); ctx.globalAlpha = clamp((E.secs - age) / E.fadeOut); ctx.translate(x, y); ctx.rotate(rot + t * 2.5);
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.rect(-C.size / 2, -C.size / 3, C.size, C.size * .66); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // card with the star
  const K = E.card, pop = .7 + .3 * eOutCubic(clamp(age / .4));
  ctx.globalAlpha = a; ctx.translate(W / 2, K.y); ctx.rotate(K.tilt); ctx.scale(pop, pop);
  ctx.fillStyle = K.fill; ctx.strokeStyle = K.line; ctx.lineWidth = K.lw;
  ctx.beginPath(); ctx.roundRect(-K.w / 2, -K.h / 2, K.w, K.h, 14); ctx.fill(); ctx.stroke();
  const S = E.star; ctx.translate(0, S.y);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const rad = S.r * (i % 2 ? S.inner : 1), ang = -Math.PI / 2 + i * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * rad, Math.sin(ang) * rad); }
  ctx.closePath(); ctx.fillStyle = S.fill; ctx.fill(); ctx.lineWidth = S.lw; ctx.stroke();
  for (const d of [-1, 1]) {       // a heart each side, gently bobbing
    const H2 = E.heart, hx = d * H2.dx, hy = H2.dy + Math.sin(timeMs * .003 + d) * H2.rise * .3, s = H2.s;
    ctx.beginPath(); ctx.moveTo(hx, hy + s * .9);
    ctx.bezierCurveTo(hx - s * 1.6, hy - s * .2, hx - s * .6, hy - s * 1.3, hx, hy - s * .4);
    ctx.bezierCurveTo(hx + s * .6, hy - s * 1.3, hx + s * 1.6, hy - s * .2, hx, hy + s * .9);
    ctx.fillStyle = H2.fill; ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();
  }
  ctx.restore();
}
