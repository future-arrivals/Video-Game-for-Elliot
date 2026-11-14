// Props: pencil scenery (pale, thin, PEN outline) and ink interactables (black marker, full colour).
// A prop is a list of parts (wobbly path + fill/stroke) baked once into its own sprite.
// Ported from Source/a2_engine.js makeProp/drawParts/bakeProp, plus hedge, blanket, crate, corn, leaves.
import { R, INK, PEN, PAPER, clamp, lerp, mk, wob, ell, tone, streaks } from './core.js';
import { KINDS } from './propkinds.js';   // M2 kinds: gate, posts, plate, stone, do-over, giant pumpkin, door, reeds...

// Field look (Task 7). All of it is opt-in through makeProp's `look` argument, so the battle screen,
// which calls makeProp/drawParts without one, draws exactly as before.
const SHADOW_ON = true;          // item 4: baked smudge shadow under a prop whose look asks for one
const SHADOW_ALPHA = { pencil: .13, ink: .2 };
const STREAKS_ON = true;         // item 6: marker streaks inside ink fills whose look asks for them
const STREAK_DARK = .9;          // streak colour = fill x this (about 6-10% darker once overlapped at .55)
const HEDGE_W = .8;              // hedge width when look.fit is set: keeps hedges inside their tile column
const HEDGE_LOW = .5;            // hedge height when look.low is set: a trimmed hedge in front of a boulder or gate

const part = (g, fill, stroke, lw, dash) => ({ g, fill, stroke, lw, dash });
/** Kinds tall enough to hide the lead; these fade to 50% when standing in front of it. */
export const STANDEE = new Set(['hedge', 'boulder', 'post', 'scarecrow', 'sign', 'cart', 'hay', 'corn', 'crate', 'pumpkin',
  'gate', 'gateopen', 'gateswing1', 'gateswing2', 'gateswing3', 'candypost', 'bellpost', 'bellrung', 'doover', 'door', 'reeds', 'stall', 'baretree', 'jack']);

/** Builds a prop whose feet are at world px (x, y). Returns {kind, x, y, parts, bb, ink, cache}.
 *  look (optional, field only): { k: scale about the feet, sat, line (pencil strength 0..1),
 *  mix: hex, amt: 0..1 (depth tint), shadow: bool, streaks: bool, fit: bool (hedge fits its tile),
 *  low: bool (a trimmed hedge, HEDGE_LOW tall) } */
export function makeProp(kind, x, y, s, seed, ink, look) {
  const P = []; const L = ink ? INK : PEN; const lw = ink ? 4 : 2;
  if (kind === 'pumpkin') {
    P.push(part(wob(ell(x, y - 20 * s, 30 * s, 21 * s, 14, .1, seed), true, 1.1, seed), '#F6D2A6', L, lw));
    P.push(part(wob([[x - 9 * s, y - 39 * s], [x - 15 * s, y - 20 * s], [x - 9 * s, y - 1 * s]], false, .6, seed + 1), null, L, lw * .8));
    P.push(part(wob([[x + 9 * s, y - 39 * s], [x + 15 * s, y - 20 * s], [x + 9 * s, y - 1 * s]], false, .6, seed + 2), null, L, lw * .8));
    P.push(part(wob([[x, y - 40 * s], [x + 3 * s, y - 50 * s]], false, .3, seed + 3), null, '#a9987a', 3.5));
  } else if (kind === 'post') {
    P.push(part(wob([[x - 6, y], [x - 5, y - 46], [x, y - 52], [x + 5, y - 46], [x + 6, y]], true, .5, seed, 8), '#EEDFC3', L, lw));
  } else if (kind === 'rail') { // x .. s = x2
    P.push(part(wob([[x, y - 36], [s, y - 36]], false, 1, seed, 20), null, L, 2));
    P.push(part(wob([[x, y - 18], [s, y - 18]], false, 1, seed + 1, 20), null, L, 2));
  } else if (kind === 'scarecrow') {
    P.push(part(wob([[x, y], [x, y - 92]], false, .6, seed), null, L, 3));
    P.push(part(wob([[x - 38, y - 66], [x + 38, y - 64]], false, .8, seed + 1), null, L, 3));
    P.push(part(wob([[x - 26, y - 70], [x + 26, y - 70], [x + 22, y - 32], [x - 22, y - 32]], true, 1.2, seed + 2), '#E9C9C0', L, 2));
    P.push(part(wob([[x - 4, y - 68], [x - 4, y - 34]], false, .5, seed + 9), null, L, 1.5, [3, 4]));
    P.push(part(wob(ell(x, y - 84, 14, 14, 12), true, .8, seed + 3), '#F3E3BE', L, 2));
    P.push(part(wob([[x - 24, y - 92], [x + 24, y - 92], [x + 8, y - 98], [x + 2, y - 118], [x - 10, y - 98]], true, .8, seed + 4), '#D9CBA9', L, 2));
    for (const d of [-1, 1]) P.push(part(wob([[x + 38 * d, y - 66], [x + 46 * d, y - 72], [x + 40 * d, y - 60], [x + 48 * d, y - 62]], false, .4, seed + 5 + d), null, '#c9b27a', 2));
  } else if (kind === 'cart') {
    P.push(part(wob([[x - 50, y - 50], [x + 50, y - 50], [x + 42, y - 18], [x - 42, y - 18]], true, 1, seed), '#EAD3B0', L, lw));
    for (const k of [-24, 0, 24]) P.push(part(wob(ell(x + k, y - 56, 15, 11, 12), true, .7, seed + k + 50), '#F6D2A6', L, lw * .8));
    for (const k of [-30, 30]) { P.push(part(wob(ell(x + k, y - 14, 14, 14, 14), true, .6, seed + k), '#F4ECDC', L, lw)); P.push(part(wob([[x + k - 10, y - 14], [x + k + 10, y - 14]], false, .3, seed + k + 3), null, L, 1.5)); P.push(part(wob([[x + k, y - 24], [x + k, y - 4]], false, .3, seed + k + 4), null, L, 1.5)); }
    P.push(part(wob([[x + 50, y - 34], [x + 82, y - 44]], false, .5, seed + 9), null, L, 3));
  } else if (kind === 'hay') {
    P.push(part(wob([[x - 34, y], [x - 34, y - 34], [x + 34, y - 34], [x + 34, y]], true, 1.2, seed), '#F2E2A8', L, lw));
    for (const k of [-12, 12]) P.push(part(wob([[x + k, y - 32], [x + k, y - 2]], false, .6, seed + k), null, L, 1.5));
  } else if (kind === 'vine') {
    const pts = []; for (let i = 0; i <= 12; i++) pts.push([x + i * s / 12, y + Math.sin(i * 1.3 + seed) * 8]);
    P.push(part(wob(pts, false, 1, seed, 10), null, '#a8c28b', 2.2));
    for (let i = 1; i < 12; i += 3) { const lx = x + i * s / 12, ly = y + Math.sin(i * 1.3 + seed) * 8; P.push(part(wob([[lx, ly], [lx + 6, ly - 10], [lx + 12, ly - 4]], true, .4, seed + i), '#DCE9C8', '#a8c28b', 1.6)); }
  } else if (kind === 'sign') {   // arrow pointing along +x (toward the giant pumpkin)
    P.push(part(wob([[x, y], [x, y - 56]], false, .4, seed), null, L, 3));
    P.push(part(wob([[x - 28, y - 70], [x + 26, y - 70], [x + 40, y - 58], [x + 26, y - 46], [x - 28, y - 46]], true, .8, seed + 1), '#EEDFC3', L, 2));
    P.push(part(wob(ell(x + 4, y - 58, 7, 6, 10), true, .4, seed + 2), '#F6D2A6', L, 1.6));
  } else if (kind === 'crate') {
    P.push(part(wob([[x - 22, y], [x - 22, y - 38], [x + 22, y - 38], [x + 22, y]], true, .8, seed, 10), '#EAD9B8', L, lw));
    P.push(part(wob([[x - 20, y - 2], [x + 20, y - 36]], false, .5, seed + 1), null, L, 1.5));
    P.push(part(wob([[x - 22, y - 19], [x + 22, y - 19]], false, .5, seed + 2), null, L, 1.5));
  } else if (kind === 'corn') {
    for (let i = -1; i <= 1; i++) {
      const bx = x + i * 9, top = y - 70 - (i === 0 ? 14 : 0);
      P.push(part(wob([[bx, y], [bx + i * 4, top]], false, .8, seed + i), null, '#b4a576', 2.4));
      for (let k = 0; k < 3; k++) { const ly = y - 18 - k * 18, d = (k + i) % 2 ? 1 : -1; P.push(part(wob([[bx + i * k, ly], [bx + d * 14, ly - 10], [bx + d * 22, ly + 2]], false, .6, seed + 10 * k + i), null, '#b9c38e', 2)); }
    }
  } else if (kind === 'leaves') {     // flat pumpkin-leaf patch
    for (let k = 0; k < 3; k++) { const lx = x + (k - 1) * 16, ly = y - (k % 2) * 6;
      P.push(part(wob(ell(lx, ly - 5, 13, 6, 10, .3, seed + k), true, .7, seed + k), '#DCE7C2', '#a9b693', 1.6)); }
  } else if (kind === 'hedge') {      // interactive standee: ink + full colour
    const pts = [[x + 26, y]]; const r = Math.round(seed) % 7;
    const hw = look && look.fit ? HEDGE_W : 1, hh = look && look.low ? HEDGE_LOW : 1; pts[0][0] = x + 26 * hw;
    for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; const bump = 1 + (i % 2 ? .1 : -.04) + ((i + r) % 3) * .03; pts.push([x + Math.cos(a) * 28 * hw * bump, y - (10 + Math.sin(a) * 50 * bump) * hh]); }
    pts.push([x - 26 * hw, y]);
    P.push(part(wob(pts, true, 1.6, seed, 9), '#7FB24E', INK, 4));
    P.push(part(wob(ell(x - 8, y - 40 * hh, 11, 8 * hh, 10, .2, seed + 3), true, .8, seed + 3), '#9DCB68', null, 0));
    for (const [dx, dy] of [[-12, -22], [8, -36], [12, -16], [-4, -50]]) P.push(part(wob([[x + dx - 5, y + dy * hh - 3], [x + dx, y + dy * hh + 2], [x + dx + 5, y + dy * hh - 3]], false, .3, seed + dx), null, INK, 2.4));
  } else if (kind === 'boulder') {
    P.push(part(wob(ell(x, y - 24 * s, 34 * s, 26 * s, 12, .18, seed), true, 1.3, seed), '#A09A8E', INK, 4.5));
    P.push(part(wob([[x - 12 * s, y - 38 * s], [x - 3 * s, y - 28 * s], [x - 8 * s, y - 19 * s]], false, .4, seed + 1), null, INK, 3));
    P.push(part(wob([[x + 13 * s, y - 36 * s], [x + 7 * s, y - 24 * s]], false, .4, seed + 2), null, INK, 3));
  } else if (kind === 'blanket') {    // rest blanket, flat on the ground: red/white checks
    const q = [[x - 38, y - 9], [x + 30, y - 12], [x + 40, y + 10], [x - 30, y + 13]];
    P.push(part(wob(q, true, .8, seed, 12), '#E4574A', null, 0));
    const at = (u, v) => [lerp(lerp(q[0][0], q[1][0], u), lerp(q[3][0], q[2][0], u), v), lerp(lerp(q[0][1], q[1][1], u), lerp(q[3][1], q[2][1], u), v)];
    for (const u of [.2, .4, .6, .8]) P.push(part(wob([at(u, .04), at(u, .96)], false, .3, seed + u * 10), null, 'rgba(255,248,236,.8)', 5));
    for (const v of [.33, .66]) P.push(part(wob([at(.03, v), at(.97, v)], false, .3, seed + v * 10), null, 'rgba(255,248,236,.8)', 4));
    P.push(part(wob(q, true, .8, seed, 12), null, INK, 3.5));
  } else if (kind === 'glow') {       // pickup glow disc
    P.push(part(wob(ell(x, y - 22, 21, 21, 16), true, .6, seed), '#FFF1A8', '#E8C94A', 2.5));
  } else if (kind === 'spot') {       // dashed "a power fits here"
    P.push(part(wob([[x - 62, y - 18], [x + 62, y - 22], [x + 64, y + 10], [x - 62, y + 12]], true, 1, seed), 'rgba(255,255,255,.5)', INK, 3.5, [9, 8]));
  } else if (KINDS[kind]) KINDS[kind](P, part, x, y, s, seed, L, lw);
  let bb = [1e9, 1e9, -1e9, -1e9];
  for (const q of P) { const b = q.g.bb; bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; }
  const pr = { kind, x, y, parts: P, bb, ink: !!ink, standee: STANDEE.has(kind), cache: null, k: 1 };
  if (look) applyLook(pr, look);
  const pad = 8, k = pr.k, b0 = pr.bb;
  pr.bb = [x + (b0[0] - x) * k - pad, y + (b0[1] - y) * k - pad, x + (b0[2] - x) * k + pad, y + (b0[3] - y) * k + pad];
  return pr;
}

const FLAT = new Set(['leaves', 'vine', 'blanket', 'glow', 'spot', 'rail', 'plate', 'platedown', 'stone', 'lily', 'mat']);
function applyLook(pr, L) {
  pr.k = L.k ?? 1;
  if (!pr.ink) for (const q of pr.parts) {        // item 2 (quieter) and item 3 (depth tint) for pencil
    const t = { sat: L.sat ?? 1, mix: L.mix, amt: L.amt ?? 0 };
    if (q.fill) q.fill = tone(q.fill, t);
    if (q.stroke) { q.stroke = tone(tone(q.stroke, { sat: t.sat, mix: PAPER, amt: (1 - (L.line ?? 1)) * .8 }), t); q.lw *= .85 + .15 * (L.line ?? 1); }
  }
  if (L.streaks && STREAKS_ON && pr.ink) { const body = pr.parts.find(q => q.fill); if (body) body.streak = true; }
  if (L.shadow && SHADOW_ON && !FLAT.has(pr.kind)) {
    const w = (pr.bb[2] - pr.bb[0]) * pr.k;
    pr.shadow = { rx: Math.min(60, w * .42), ry: pr.ink ? 6 : 4.5, a: pr.ink ? SHADOW_ALPHA.ink : SHADOW_ALPHA.pencil };
    pr.bb = [pr.bb[0], pr.bb[1], pr.bb[2], Math.max(pr.bb[3], pr.y + pr.shadow.ry + 1)];
  }
}

/** p: reveal 0..1 (pencil draws in, then the colour washes in). 1 = fully drawn. */
export function drawParts(ctx, parts, p = 1) {
  const q = clamp(p / .7), f = clamp((p - .35) / .65);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const k of parts) {
    if (k.fill && f > 0) { ctx.globalAlpha = f; ctx.fillStyle = k.fill; ctx.fill(k.g.p); ctx.globalAlpha = 1;
      if (k.streak) streaks(ctx, k.g.p, k.g.bb, tone(k.fill, { mul: STREAK_DARK }), (k.g.len * 7) | 0); }
    if (k.stroke && q > 0) {
      ctx.strokeStyle = k.stroke; ctx.lineWidth = k.lw;
      if (k.dash) { ctx.setLineDash(k.dash); ctx.globalAlpha = q; }
      else if (q < 1) { ctx.setLineDash([k.g.len, k.g.len]); ctx.lineDashOffset = k.g.len * (1 - q); }
      ctx.stroke(k.g.p); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
    }
  }
}

/** Bakes a prop into its own sprite at bake scale. `extra(g)` may draw more on top in world coords. */
export function bakeProp(pr, extra) {
  const [x0, y0, x1, y1] = pr.bb; const c = mk((x1 - x0) * R.BS, (y1 - y0) * R.BS); const g = c.getContext('2d');
  g.scale(R.BS, R.BS); g.translate(-x0, -y0);
  if (pr.shadow) {                                  // soft smudge on the ground under the feet
    const { rx, ry, a } = pr.shadow; g.save(); g.translate(pr.x, pr.y); g.scale(rx / ry, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry); gr.addColorStop(0, `rgba(90,65,40,${a})`); gr.addColorStop(.6, `rgba(90,65,40,${a * .5})`); gr.addColorStop(1, 'rgba(90,65,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, 7); g.fill(); g.restore();
  }
  if (pr.k !== 1 && pr.k != null) { g.translate(pr.x, pr.y); g.scale(pr.k, pr.k); g.translate(-pr.x, -pr.y); }
  drawParts(g, pr.parts, 1); if (extra) extra(g);
  pr.cache = c; return pr;
}
/** Draws a baked prop at its own world position, optionally offset and faded. */
export function drawProp(ctx, pr, dy = 0, alpha = 1) {
  const [x0, y0, x1, y1] = pr.bb;
  if (alpha < 1) { ctx.globalAlpha = alpha; ctx.drawImage(pr.cache, x0, y0 + dy, x1 - x0, y1 - y0); ctx.globalAlpha = 1; }
  else ctx.drawImage(pr.cache, x0, y0 + dy, x1 - x0, y1 - y0);
}
/** Draws a prop baked at one place shifted by (dx, dy) world px (stones are baked once, drawn on any tile). */
export function drawPropAt(ctx, pr, dx, dy) {
  const [x0, y0, x1, y1] = pr.bb; ctx.drawImage(pr.cache, x0 + dx, y0 + dy, x1 - x0, y1 - y0);
}
