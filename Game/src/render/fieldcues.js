// Screen-space cues for the field scene: rising hearts, the "more soon" bubble, the pause card, the "!" over
// a creature that spotted the lead, a candy flying up to the HUD counter. Full colour, black ink, no words.
import { W, H, INK, PEN, PAPER, FONT, clamp, eOutCubic, eInOutCubic, rng } from './core.js';
import { candyArt } from './sprites.js';

export const EXIT_BUBBLE = 1.5;     // seconds
const BANG = { w: 26, h: 40, lift: 70, pop: .18, fill: '#FFE14D' };
const FLY = { w: 34, arc: 70 };


export function drawRisingHearts(ctx, x, y, u) {
  const r = rng(11);
  ctx.save(); ctx.lineJoin = 'round';
  for (let i = 0; i < 5; i++) {
    const d = i * .1, v = clamp((u - d) / (1 - d)); if (v <= 0 || v >= 1) continue;
    const hx = x + (r() - .5) * 70 + Math.sin(v * 6 + i) * 6, hy = y - 10 - eOutCubic(v) * 70, s = 7 + r() * 4;
    ctx.globalAlpha = 1 - v * v;
    ctx.beginPath(); ctx.moveTo(hx, hy + s * .9);
    ctx.bezierCurveTo(hx - s * 1.6, hy - s * .2, hx - s * .6, hy - s * 1.3, hx, hy - s * .4);
    ctx.bezierCurveTo(hx + s * .6, hy - s * 1.3, hx + s * 1.6, hy - s * .2, hx, hy + s * .9);
    ctx.fillStyle = '#D03C30'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
  }
  ctx.restore();
}

// A pencil thought bubble with a little padlock and "..." : "more soon".
export function drawMoreSoonBubble(ctx, x, y, age) {
  const a = clamp(age / .18) * clamp((EXIT_BUBBLE - age) / .25);
  const pop = .85 + .15 * eOutCubic(clamp(age / .25));
  const bx = clamp(x + 30, 80, W - 80), by = clamp(y - 52, 60, H - 60);
  ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // trailing dots down to the lead
  ctx.fillStyle = PAPER; ctx.strokeStyle = PEN; ctx.lineWidth = 2;
  for (const [t, r] of [[.25, 4], [.55, 6.5]]) { ctx.beginPath(); ctx.arc(x + (bx - x) * t, y + (by + 30 - y) * t, r, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.translate(bx, by); ctx.scale(pop, pop);
  // cloud: a ring of bumps
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
    const p = t => [Math.cos(t) * 58, Math.sin(t) * 34];
    const [x0, y0] = p(t0), [x1, y1] = p(t1), tm = (t0 + t1) / 2;
    if (!i) ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(Math.cos(tm) * 74, Math.sin(tm) * 46, x1, y1);
  }
  ctx.closePath(); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = PEN; ctx.lineWidth = 2.4; ctx.stroke();
  // padlock
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(-18, -6, 9, Math.PI, 0); ctx.lineTo(-9, 2); ctx.moveTo(-27, -6); ctx.lineTo(-27, 2); ctx.stroke();
  ctx.fillStyle = '#F4C84A'; ctx.beginPath(); ctx.roundRect(-32, 0, 28, 22, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-18, 9, 3, 0, 7); ctx.fill(); ctx.fillRect(-19.2, 10, 2.4, 6);
  // pencil dots, appearing one by one
  for (let i = 0; i < 3; i++) if (age > .25 + i * .2) { ctx.beginPath(); ctx.arc(12 + i * 13, 12, 3.6, 0, 7); ctx.fill(); }
  ctx.restore();
}

// Dim page; a controller picture when the pad went away, two pencil bars otherwise.
export function drawPaused(ctx, pad, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(40,30,20,.45)'; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // paper card
  ctx.fillStyle = 'rgba(80,55,25,.25)'; ctx.beginPath(); ctx.roundRect(-130, -86, 260, 176, 18); ctx.fill();
  ctx.fillStyle = PAPER; ctx.beginPath(); ctx.roundRect(-130, -90, 260, 176, 18); ctx.fill();
  ctx.strokeStyle = '#cfc5b1'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  if (pad) {
    const bob = Math.sin(t * .004) * 3;
    ctx.translate(0, -10 + bob);
    // controller body with two grips
    ctx.fillStyle = '#E9E3D6';
    ctx.beginPath();
    ctx.moveTo(-70, -22); ctx.quadraticCurveTo(-80, -30, -60, -32); ctx.lineTo(60, -32); ctx.quadraticCurveTo(80, -30, 70, -22);
    ctx.quadraticCurveTo(96, 30, 82, 46); ctx.quadraticCurveTo(66, 58, 50, 30); ctx.lineTo(-50, 30);
    ctx.quadraticCurveTo(-66, 58, -82, 46); ctx.quadraticCurveTo(-96, 30, -70, -22); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // d-pad
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-52, -6); ctx.lineTo(-32, -6); ctx.moveTo(-42, -16); ctx.lineTo(-42, 4); ctx.stroke();
    // buttons
    for (const [bx, by] of [[42, -16], [52, -6], [42, 4], [32, -6]]) { ctx.beginPath(); ctx.arc(bx, by, 4, 0, 7); ctx.stroke(); }
    // sticks
    ctx.fillStyle = PAPER; for (const sx of [-20, 20]) { ctx.beginPath(); ctx.arc(sx, 14, 8, 0, 7); ctx.fill(); ctx.stroke(); }
    // a dangling cable with a question-ish wiggle: "where did it go?"
    ctx.strokeStyle = PEN; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -32); ctx.bezierCurveTo(10, -52, -14, -60, 4, -74); ctx.stroke();
  } else {
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.roundRect(-30, -42, 20, 76, 6); ctx.fill();
    ctx.beginPath(); ctx.roundRect(10, -42, 20, 76, 6); ctx.fill();
  }
  ctx.restore();
  ctx.save(); ctx.fillStyle = INK; ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', W / 2, H / 2 + 66); ctx.restore();
}

// A yellow "!" card over a creature that just spotted the lead; pops in, then holds.
export function drawBang(ctx, x, y, age) {
  const s = .6 + .4 * eOutCubic(clamp(age / BANG.pop));
  ctx.save(); ctx.translate(x, y - BANG.lift); ctx.scale(s, s); ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(-BANG.w / 2, -BANG.h / 2, BANG.w, BANG.h, 8);
  ctx.fillStyle = BANG.fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(-3.5, -14, 7, 18, 3); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 11, 4, 0, 7); ctx.fill();
  ctx.restore();
}

// A candy flying on an arc from (x0, y0) to the HUD candy counter at `to` {x, y} (hud.js candyCounterAt), u 0..1.
export function drawCandyFly(ctx, assets, x0, y0, u, to) {
  const e = eInOutCubic(clamp(u)), { x: x1, y: y1 } = to;
  const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e - Math.sin(e * Math.PI) * FLY.arc;
  const im = candyArt(assets), w = FLY.w, h = w * im.height / im.width;
  ctx.save(); ctx.translate(x, y); ctx.rotate(e * 6); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
}
