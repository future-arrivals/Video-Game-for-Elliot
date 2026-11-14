// Battle staging: the baked backdrop (the place the fight started, seen from a low camera), the two
// actors, and the timed effects (marker strokes, hit sparks, digits, torn hearts, confetti, the page tear).
// Everything is a pure function of the view-model and the clock it is given.
import { W, H, R, INK, PAPER, PEN, FONT, mk, rng, wob, ell, clamp, lerp, eOutCubic, eOutBack, eInOutCubic, heartPts } from '../core.js';
import { bakeSky, bakeFar, bakeMid, bakeLight, bakeForeground } from '../layers.js';
import { makeProp, drawParts } from '../props.js';
import { burst, speedLines, ring } from '../fx.js';
import { drawMember, drawCreature, prepareActors } from '../actors.js';
import { LAYOUT } from './layout.js';
import { digit } from './ui.js';
import { drawWeb } from './icons.js';
import { candyArt } from '../sprites.js';

const PUMPKIN = { S1: .75, S2: .8, S3: .85, S4: .9, S5: 1, S6: 1.25, S7: 1.25 };
const HORIZON = 166;

/** Bakes the screen-sized backdrop once. stage: a Stage or stage data ({ id, width }) or null (plain page). */
export function bakeBackdrop(stage) {
  const c = mk(W * R.DPR, H * R.DPR), g = c.getContext('2d'); g.scale(R.DPR, R.DPR);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const r = rng(stage ? [...String(stage.id)].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) : 3);
  if (stage) {
    g.drawImage(bakeSky(), 0, 0, W, H);
    const stageW = (stage.width || 28) * 48, ps = PUMPKIN[stage.id] ?? .8, px = 300, k = 1.25;
    const F = bakeFar(stageW, ps, px, 9);
    const dx = 735 - px * k, dy = 196 - 96 * k;
    g.drawImage(F.c, dx + F.X0 * k, dy + F.Y0 * k, F.c.width / R.DPR * k, F.c.height / R.DPR * k);
    const M = bakeMid(stageW); g.drawImage(M.c, -300, 98, M.c.width / R.DPR, M.c.height / R.DPR);
  } else {
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(157,148,133,.35)'; g.lineWidth = 1;
    for (let y = 40; y < HORIZON; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }
  // the ground sheet in perspective, with the path running toward the camera
  const gp = wob([[-40, HORIZON], [W / 2, HORIZON - 3], [W + 40, HORIZON - 6], [W + 40, H + 40], [-40, H + 40]], true, 2, 90, 30);
  for (let i = 0; i < 5; i++) { g.save(); g.translate(0, -i * 1.5); g.fillStyle = `rgba(90,60,30,${.05 - i * .008})`; g.fill(gp.p); g.restore(); }
  g.fillStyle = PAPER; g.fill(gp.p); g.strokeStyle = '#d9cfbb'; g.lineWidth = 1.5; g.stroke(gp.p);
  g.save(); g.clip(gp.p); g.strokeStyle = 'rgba(120,100,70,.06)'; g.lineWidth = 1;
  for (let i = 0; i < 260; i++) { const x = r() * W, y = HORIZON + r() * (H - HORIZON); g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 16 - 8, y + r() * 10 - 5); g.stroke(); }
  g.restore();
  if (stage) {
    const path = wob([[372, HORIZON - 1], [468, HORIZON - 2], [W + 60, H + 20], [-60, H + 20]], true, 2, 91, 30);
    g.fillStyle = '#F2E2BD'; g.fill(path.p); g.strokeStyle = PEN; g.lineWidth = 2; g.stroke(path.p);
    // only two small pumpkins, out at the edges: the middle of the page is where the fight happens
    for (const [x, y, s] of [[34, 186, .55], [812, 192, .55]]) drawParts(g, makeProp('pumpkin', x, y, s, (r() * 1e6) | 0).parts, 1);
  }
  // the whole backdrop about 30% paler, so the actors and the cards read first (the disc goes on after)
  g.save(); g.globalAlpha = .3; g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.restore();
  // the enemy's raised paper disc
  const D = LAYOUT.disc;
  const disc = wob(ell(D.x, D.y, D.rx, D.ry, 18), true, 1.4, 92);
  g.save(); g.translate(0, 6); g.fillStyle = 'rgba(80,55,25,.2)'; g.fill(disc.p); g.restore();
  g.save(); g.translate(0, 3); g.fillStyle = '#C9D7AE'; g.fill(disc.p); g.restore();
  g.fillStyle = '#E5EFCF'; g.fill(disc.p); g.strokeStyle = PEN; g.lineWidth = 2; g.stroke(disc.p);
  scratch();                                            // make the hit-flash canvas now, not on the first hit
  return c;
}

/** Overlays drawn on top of the actors: afternoon light and a blurred foreground leaf. */
export function bakeOverlays(stage) {
  const leaf = bakeForeground(1200, 5).map(o => o.s).find(s => s.w === 110);
  return { light: bakeLight(!!stage && /S[5-7]/.test(stage.id)), leaf };
}

// ---- actors -------------------------------------------------------------------------------

let off = null;                                         // scratch canvas for the white hit flash
function scratch() {
  if (!off || off.width !== Math.ceil(W * R.DPR)) off = mk(W * R.DPR, H * R.DPR);
  const g = off.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, off.width, off.height); g.setTransform(R.DPR, 0, 0, R.DPR, 0, 0);
  return g;
}
/** Draws drawFn normally, then (if a > 0) the same silhouette washed white at opacity a (max .7). */
function withFlash(ctx, a, drawFn) {
  drawFn(ctx);
  if (!(a > 0)) return;
  const g = scratch(); drawFn(g);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#FFFDF4'; g.fillRect(0, 0, off.width, off.height); g.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.globalAlpha = Math.min(.7, a); ctx.drawImage(off, 0, 0, W, H); ctx.restore();
}
function outlinePulse(ctx, x, y, rx, ry, u) {
  if (!(u > 0 && u < 1)) return;
  ctx.save(); ctx.strokeStyle = '#F2B83A'; ctx.lineWidth = 6 * (1 - u) + 1; ctx.globalAlpha = 1 - u;
  ctx.beginPath(); ctx.ellipse(x, y, rx * (1 + u * .25), ry * (1 + u * .25), 0, 0, 7); ctx.stroke(); ctx.restore();
}

/** The enemy on its disc. e: { kind, dx, dy, curl 0..1, flash, pulse, win (ms since the win, or null) }
 *  Win beat: the creature drops onto the disc, tips over dizzy with little circling stars, and a wrapped candy
 *  pops out of it and lands on the disc in front. */
export function drawEnemy(ctx, assets, e, t) {
  const A = prepareActors(assets), r = A.creatures[e.kind]; if (!r) return;
  const L = LAYOUT.enemy, k = L.h / (r.s.h * r.k), x = L.x + (e.dx || 0), y = L.y + (e.dy || 0);
  const win = e.win != null && e.win >= 0 ? e.win : null;
  const draw = g => {
    g.save(); g.translate(x, y);
    if (win != null) {
      const fall = r.d.fly * k * (1 - clamp(win / 220) ** 2);              // a flyer drops onto the disc first
      const tip = 1.3 * eOutBack(clamp((win - 140) / 420), 1.8);            // then tips over backwards (pivot: its feet)
      const sw = r.s.w * r.k * k * .9;                                        // the shadow stays flat on the disc
      g.drawImage(A.shadow.c, -sw / 2, -8, sw, 16);
      g.translate(0, -fall); g.rotate(tip);
      g.scale(k * (1 + .08 * Math.sin(clamp(win / 220) * Math.PI)), k);
      drawCreature(g, assets, { uid: 'battle', kind: e.kind, faceX: -1, mode: 'patrol' }, 0, 0, t, { still: true, shadow: false });
    } else {
      g.scale(k * (1 + (e.curl || 0) * .12), k * (1 - (e.curl || 0) * .3));
      drawCreature(g, assets, { uid: 'battle', kind: e.kind, faceX: -1, mode: 'patrol' }, 0, 0, t);
    }
    g.restore();
  };
  withFlash(ctx, e.flash, draw);
  outlinePulse(ctx, x, y - L.h * .55, 70, 74, e.pulse);
  if (win != null) { dizzyStars(ctx, x + 34, y - L.h * .42, win, t); droppedCandy(ctx, assets, x, y, win); }
}

// Three little stars circling over the knocked-over creature's head (from 450 ms into the win).
function dizzyStars(ctx, x, y, win, t) {
  const a = clamp((win - 450) / 200); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const ang = t * .005 + i * Math.PI * 2 / 3, sx = x + Math.cos(ang) * 38, sy = y + Math.sin(ang) * 11, s = 7 + 2 * Math.sin(ang);
    ctx.beginPath();
    for (let j = 0; j < 10; j++) { const rr = j % 2 ? s * .45 : s, q = j * Math.PI / 5 - Math.PI / 2; ctx.lineTo(sx + Math.cos(q) * rr, sy + Math.sin(q) * rr); }
    ctx.closePath(); ctx.fillStyle = '#FFE27A'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}

// The dropped candy: pops up out of the creature at 300 ms, arcs onto the disc in front, bounces once, glints.
function droppedCandy(ctx, assets, x, y, win) {
  const ms = win - 300; if (ms < 0) return;
  const im = candyArt(assets), w = 58, h = w * im.height / im.width;
  const x0 = x, y0 = y - 70, x1 = x - 78, y1 = y + 6;
  let cx, cy, rot, sq = 0;
  if (ms < 520) {                                       // the arc
    const u = ms / 520; cx = lerp(x0, x1, u); cy = lerp(y0, y1, u) - Math.sin(u * Math.PI) * 90 * (1 - u * .3); rot = -u * (Math.PI * 2 + .2);
  } else {                                              // one small bounce, then rest
    const v = (ms - 520) / 260; cx = x1; rot = -.2 + .25 * Math.sin(clamp(v) * Math.PI);
    cy = y1 - (v < 1 ? Math.sin(v * Math.PI) * 16 : 0); sq = v < .15 ? (1 - v / .15) * .25 : 0;
  }
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1 + sq, 1 - sq); ctx.translate(0, -h / 2); ctx.rotate(rot);
  ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
  if (ms >= 520) {
    ring(ctx, x1, y1 + 2, (ms - 520) / 420, 46, '#E99DBB');
    const g = (ms - 760) % 1400;                        // a glint every 1.4 s
    if (ms > 760 && g < 360) {
      const u = g / 360, s = 10 * Math.sin(u * Math.PI), gx = x1 + 18, gy = y1 - h * .8;
      ctx.save(); ctx.fillStyle = '#FFFDF4'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(gx, gy - s); ctx.quadraticCurveTo(gx, gy, gx + s, gy); ctx.quadraticCurveTo(gx, gy, gx, gy + s);
      ctx.quadraticCurveTo(gx, gy, gx - s, gy); ctx.quadraticCurveTo(gx, gy, gx, gy - s); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
}

/** The active character, large in the near foreground. p: { member, dx, dy, scale, ko 0..1, flash, pulse, squash, alpha, pace } */
export function drawPlayer(ctx, assets, p, t) {
  const L = LAYOUT.player, x = L.x + (p.dx || 0), y = L.y + (p.dy || 0);
  const draw = g => {
    g.save(); g.translate(x, y);
    if (p.ko) { g.translate(30 * eOutCubic(clamp(p.ko)), 0); g.rotate(1.3 * eOutCubic(clamp(p.ko))); g.globalAlpha = 1 - .35 * clamp(p.ko); }
    const sq = p.squash || 0; g.scale(p.scale * (1 + sq * .1), p.scale * (1 - sq * .08));
    if (p.alpha != null && p.alpha < 1) g.globalAlpha = p.alpha;
    drawMember(g, assets, p.member, 0, 0, t, { shadow: !p.ko, pace: p.pace || 'battle' });
    g.restore();
  };
  withFlash(ctx, p.flash, draw);
  outlinePulse(ctx, x, y - 90, 90, 110, p.pulse);
  if (p.ko >= 1) {
    ctx.save(); ctx.fillStyle = INK; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) { const u = ((t / 1500) + i / 3) % 1; ctx.globalAlpha = Math.sin(u * Math.PI); ctx.font = `900 ${16 + u * 14}px ${FONT}`; ctx.fillText('z', x + 150 + u * 22, y - 60 - u * 40); }
    ctx.restore();
  }
}

/** Draw scale for the active character: the open drawing about LAYOUT.player.h tall, the folded one at least
 *  FOLDED_MIN tall. `open` is 0..1 (how far the hinge has opened), so the scale follows the hinge. */
const FOLDED_MIN = 128;
export function playerScale(assets, id, open = 1) {
  const r = prepareActors(assets).chars[id]; if (!r) return 1.3;
  const kO = clamp(LAYOUT.player.h / r.open.s.h, 1, 1.65), kF = Math.max(kO, FOLDED_MIN / r.folded.s.h);
  return lerp(kF, kO, clamp(open));
}

// ---- effects (screen space, timed on the real clock) ------------------------------------------------

function curve(a, b, bend) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - bend; return u => [lerp(lerp(a[0], mx, u), lerp(mx, b[0], u), u), lerp(lerp(a[1], my, u), lerp(my, b[1], u), u)]; }

/** A thick coloured marker stroke with an ink edge, drawn along its path, then its tail retracts. */
function markerStroke(ctx, f, ms) {
  const dur = f.dur || 220, head = clamp(ms / dur), tail = clamp((ms - dur - 60) / 160);
  if (tail >= 1) return;
  const P = curve(f.from, f.to, f.bend ?? 90), n = 24, pts = [];
  for (let i = 0; i <= n; i++) { const u = lerp(tail, head, i / n); pts.push(P(eOutCubic(u))); }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  path(); ctx.strokeStyle = INK; ctx.lineWidth = (f.w || 12) + 6; ctx.stroke();
  path(); ctx.strokeStyle = f.col; ctx.lineWidth = f.w || 12; ctx.stroke();
  ctx.restore();
  if (head >= 1) burst(ctx, f.to[0], f.to[1], clamp((ms - dur) / 380), f.seed || 3, 7, [f.col, PAPER], 60);
}
function hitSpark(ctx, x, y, u, seed) {
  if (u <= 0 || u >= 1) return;
  const k = eOutBack(clamp(u * 3), 2) * (1 - eOutCubic(clamp((u - .5) * 2)));
  ctx.save(); ctx.translate(x, y); ctx.rotate(seed); ctx.scale(k, k); ctx.fillStyle = '#FFF1A8'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); for (let i = 0; i < 16; i++) { const rr = i % 2 ? 13 : 32, a = i * Math.PI / 8; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function popDigit(ctx, f, ms) {
  const life = f.life || 900; if (ms > life) return;
  const k = eOutBack(clamp(ms / 160), 3), fade = 1 - clamp((ms - life + 250) / 250);
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(f.x, f.y - eOutCubic(clamp(ms / life)) * 26); ctx.scale(k, k);
  digit(ctx, (f.sign || '') + f.n, 0, 0, f.size || 64, f.col || INK); ctx.restore();
}
function tornHeart(ctx, f, ms) {
  const u = clamp(ms / 650); if (u >= 1) return;
  const pts = heartPts(0, 0, f.s);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(f.x + side * (4 + u * 18), f.y + u * u * 60 - Math.sin(u * Math.PI) * 10); ctx.rotate(side * u * 1.4); ctx.globalAlpha = 1 - u;
    ctx.beginPath(); ctx.rect(side < 0 ? -f.s : 0, -f.s, f.s, f.s * 2); ctx.clip();
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = '#D03C30'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -f.s * .35); ctx.lineTo(side * 3, -f.s * .1); ctx.lineTo(-side * 2, f.s * .1); ctx.lineTo(side * 2, f.s * .35); ctx.stroke();
    ctx.restore();
  }
}
function wordFlag(ctx, f, ms) {
  const life = f.life || 700; if (ms > life) return;
  const k = eOutBack(clamp(ms / 140), 2.4), a = 1 - clamp((ms - life + 160) / 160);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, f.y); ctx.scale(k, k); ctx.rotate(-.04);
  ctx.font = `900 22px ${FONT}`; const w = ctx.measureText(f.text).width + 24;
  ctx.fillStyle = '#FFF1A8'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.rect(-w / 2, -17, w, 34); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, 0, 1); ctx.restore();
}
function webWrap(ctx, f, ms) {
  const u = clamp(ms / 600); if (ms > 900) return;
  ctx.save(); ctx.globalAlpha = 1 - clamp((ms - 700) / 200);
  for (const [x, y, s] of f.spots) { ctx.save(); ctx.translate(x, y); ctx.rotate(u * 2); drawWeb(ctx, 0, 0, s * eOutBack(u, 1.5)); ctx.restore(); }
  ctx.restore();
}
function gulpSuck(ctx, f, ms) {
  const u = clamp(ms / 500); if (u >= 1) return;
  for (let i = 0; i < 6; i++) {
    const v = clamp(u * 1.4 - i * .07); if (v <= 0 || v >= 1) continue;
    const P = curve(f.from, f.to, 40 + i * 12), [x, y] = P(eInOutCubic(v));
    ctx.save(); ctx.globalAlpha = 1 - v * .6; ctx.fillStyle = i % 2 ? '#FFE7A6' : '#E99DBB'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7 - v * 3, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}

/** Draws every live effect. fx: [{ kind, t0, ... }], t: real ms. */
export function drawEffects(ctx, fx, t) {
  for (const f of fx) {
    const ms = t - f.t0; if (ms < 0) continue;
    if (f.kind === 'stroke') markerStroke(ctx, f, ms);
    else if (f.kind === 'spark') { hitSpark(ctx, f.x, f.y, ms / 260, f.seed || .3); speedLines(ctx, f.x, f.y, ms / 420, 21, 14, 40, 150); }
    else if (f.kind === 'ring') ring(ctx, f.x, f.y, ms / 420, f.r || 90, f.col || INK);
    else if (f.kind === 'digit') popDigit(ctx, f, ms);
    else if (f.kind === 'tear') tornHeart(ctx, f, ms);
    else if (f.kind === 'burst') burst(ctx, f.x, f.y, ms / (f.dur || 600), f.seed || 1, f.n || 10, f.cols || ['#FFE27A', PAPER], f.spd || 70, f.grav || 0);
    else if (f.kind === 'word') wordFlag(ctx, f, ms);
    else if (f.kind === 'web') webWrap(ctx, f, ms);
    else if (f.kind === 'gulp') gulpSuck(ctx, f, ms);
  }
}

/** Lose: the page tears from the top down along a jagged line, then the halves part a little. u 0..1. */
export function pageTear(ctx, u) {
  if (u <= 0) return;
  const r = rng(77), pts = []; const x0 = W * .52;
  for (let y = -10; y <= H + 10; y += 18) pts.push([x0 + (r() - .5) * 34 + (y / H) * -30, y]);
  const reach = eInOutCubic(clamp(u / .6)) * (H + 20), gap = eOutCubic(clamp((u - .55) / .45)) * 26;
  const vis = pts.filter(p => p[1] <= reach);
  if (vis.length < 2) return;
  ctx.save();
  if (gap > 0) {                                        // the dark desk showing through the tear
    ctx.fillStyle = '#4A3B2E'; ctx.beginPath();
    vis.forEach(([x, y], i) => (i ? ctx.lineTo(x - gap / 2, y) : ctx.moveTo(x - gap / 2, y)));
    for (let i = vis.length - 1; i >= 0; i--) ctx.lineTo(vis[i][0] + gap / 2 + (i % 2 ? 3 : -2), vis[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,25,15,.18)'; ctx.fillRect(0, 0, W, H);
  }
  for (const side of [-1, 1]) {                         // torn paper edges: white fibres with an ink line
    ctx.beginPath(); vis.forEach(([x, y], i) => (i ? ctx.lineTo(x + side * gap / 2, y) : ctx.moveTo(x + side * gap / 2, y)));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineJoin = 'miter'; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.restore();
}
