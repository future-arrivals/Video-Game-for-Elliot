// Effects: deterministic functions of progress u (0..1), so they are cheap and can be scrubbed.
// Ported from Source/a2_engine.js. Callers pass progress; nothing here keeps state.
import { W, H, INK, PAPER, rng, lerp, eOutCubic, eInOutCubic, clamp } from './core.js';

/** Paper-scrap burst at progress u. */
export function burst(ctx, x, y, u, seed, n, cols, spd, grav = 0) {
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
/** Marker speed lines radiating outward. */
export function speedLines(ctx, x, y, u, seed, n = 18, r0 = 70, r1 = 240, col = INK) {
  if (u <= 0 || u >= 1) return; const r = rng(seed); ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + r() * .2; const a0 = r0 + eOutCubic(u) * (r1 - r0) * .55, a1 = a0 + 26 + r() * 40 * (1 - u);
    ctx.lineWidth = 4 * (1 - u) + 1; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * a0, y + Math.sin(a) * a0 * .8); ctx.lineTo(x + Math.cos(a) * a1, y + Math.sin(a) * a1 * .8); ctx.stroke();
  }
}
/** Ink ring on the ground. */
export function ring(ctx, x, y, u, r1, col = INK) {
  if (u <= 0 || u >= 1) return; ctx.globalAlpha = 1 - u; ctx.strokeStyle = col; ctx.lineWidth = 6 * (1 - u) + 1;
  ctx.beginPath(); ctx.ellipse(x, y, r1 * eOutCubic(u), r1 * .45 * eOutCubic(u), 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
}
/** Decaying shake offset [dx, dy] at time t (ms) for a shake that started at t0. */
export function shake(t, t0, dur, amp, seed = 1) {
  const u = (t - t0) / dur; if (u < 0 || u > 1) return [0, 0]; const k = amp * Math.pow(1 - u, 2);
  return [Math.sin(t * .09 + seed) * k, Math.cos(t * .113 + seed * 3) * k];
}
/** Page-turn wipe: a paper sheet sweeps across with its curled ink edge (screen space). */
export function pageTurn(ctx, u, dir = 1) {
  if (u <= 0 || u >= 1) return; const x = dir > 0 ? lerp(W + 120, -160, eInOutCubic(u)) : lerp(-160, W + 120, eInOutCubic(u));
  ctx.save(); ctx.fillStyle = PAPER; ctx.beginPath();
  if (dir > 0) { ctx.moveTo(x, 0); ctx.lineTo(W + 200, 0); ctx.lineTo(W + 200, H); ctx.lineTo(x - 90, H); } else { ctx.moveTo(-200, 0); ctx.lineTo(x, 0); ctx.lineTo(x - 90, H); ctx.lineTo(-200, H); }
  ctx.closePath(); ctx.fill();
  const gr = ctx.createLinearGradient(x - 60, 0, x + 40, 0); gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(.6, 'rgba(60,40,20,.25)'); gr.addColorStop(1, 'rgba(60,40,20,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 60, 0); ctx.lineTo(x - 30, H); ctx.lineTo(x - 120, H); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 90, H); ctx.stroke(); ctx.restore();
}
/** Letterbox bars, k 0..1 (46 px each at 1). */
export function letterbox(ctx, k) { if (k <= 0) return; const h = 46 * k; ctx.fillStyle = '#16121c'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); }
/** Letterbox in over 180 ms (ease-out-cubic), out over 220 ms (ease-in-out). ms since in / since out. */
export function letterboxAmount(msSinceIn, msSinceOut = -1) {
  if (msSinceOut >= 0) return 1 - eInOutCubic(clamp(msSinceOut / 220));
  return eOutCubic(clamp(msSinceIn / 180));
}
/** Impact flash (flash rule: one per impact, at most 0.7 opacity, 120 ms). ms since the impact. */
export function flash(ctx, ms) {
  if (ms < 0 || ms >= 120) return; ctx.fillStyle = `rgba(255,252,240,${.7 * (1 - ms / 120)})`; ctx.fillRect(0, 0, W, H);
}
