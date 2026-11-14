// Battle UI pieces: heart bars (with previews), big marker digits, the move cards, the enemy's bubble
// (its hearts and next move) with the small strip under it, the type wheel, teammate tags, badges and
// the Run ring. Pure drawing.
// Ink levels: only the lifted card (and the teammate tags while you must pick one) are in full ink with
// highlighter yellow; every other panel is pale pencil on paper. Hearts, icons and digits keep their ink.
import { INK, PAPER, FONT, wob, heartPts, clamp, eOutBack } from '../core.js';
import { drawPsShape } from '../../input/touch.js';
import { drawIcon, drawTypeIcon, drawSparkle, drawDumbbell, drawWeb, drawFood, drawHeartIcon, COLOURS } from './icons.js';
import { LAYOUT, CARD_W, CARD_H, PS_COLOURS } from './layout.js';

const RED = '#D03C30';
export const PENCIL = '#A39C8E', PENCIL_TEXT = '#7A7366', YELLOW = '#FFF1A8';
const cache = new Map();
const cached = (key, make) => cache.get(key) || (cache.set(key, make()), cache.get(key));
const heartPath = (s, seed) => cached(`h${s}|${seed}`, () => wob(heartPts(0, 0, s), true, .5, 80 + seed, 6).p);
const rectPath = (w, h, seed, amp = .9) => cached(`r${w}|${h}|${seed}|${amp}`, () => wob([[0, 0], [w, 0], [w, h], [0, h]], true, amp, seed));

/** Paper tag at (x, y): pale pencil outline by default, a faint drop shadow. */
export function tag(g, x, y, w, h, seed, fill = PAPER, edge = PENCIL, lw = 2) {
  const t = rectPath(Math.round(w), Math.round(h), seed, .6);
  g.save(); g.translate(x, y + 2); g.fillStyle = 'rgba(80,55,25,.10)'; g.fill(t.p); g.restore();
  g.save(); g.translate(x, y); g.fillStyle = fill; g.fill(t.p); g.strokeStyle = edge; g.lineWidth = lw; g.stroke(t.p); g.restore();
}

/** One heart. kind: 'full' | 'empty' | 'hollow' (about to be lost: jiggles) | 'ghost' (about to be healed). */
export function heartAt(g, x, y, s, kind, seed, t = 0) {
  const p = heartPath(s, seed % 12);
  g.save(); g.translate(x, y);
  if (kind === 'hollow') { g.rotate(Math.sin(t * .025 + seed * 1.7) * .22); g.translate(0, Math.sin(t * .031 + seed) * 2); }
  if (kind === 'ghost') { const k = 1 + Math.sin(t * .012 + seed) * .08; g.scale(k, k); }
  g.lineJoin = 'round';
  if (kind === 'full') { g.fillStyle = RED; g.fill(p); }
  else if (kind === 'ghost') { g.fillStyle = `rgba(125,190,106,${.55 + Math.sin(t * .012 + seed) * .2})`; g.fill(p); }
  else { g.fillStyle = PAPER; g.fill(p); }
  if (kind === 'hollow') { g.setLineDash([4, 3]); g.strokeStyle = RED; g.lineWidth = s > 14 ? 3 : 2; g.stroke(p); g.setLineDash([]); }
  else { g.strokeStyle = kind === 'ghost' ? '#3f7a34' : kind === 'empty' ? PENCIL : INK; g.lineWidth = s > 14 ? 2.6 : 1.8; g.stroke(p); }
  g.restore();
}

/** A row of hearts. bar: { max, shown, lost (preview), heal (preview) }. Returns the x of each heart. */
export function heartsRow(g, x, y, s, gap, bar, t, seed = 0) {
  const xs = [];
  const full = bar.shown - (bar.lost || 0);
  for (let i = 0; i < bar.max; i++) {
    const kind = i < full ? 'full' : i < bar.shown ? 'hollow' : i < bar.shown + (bar.heal || 0) ? 'ghost' : 'empty';
    heartAt(g, x + i * gap, y, s, kind, i + seed, t); xs.push(x + i * gap);
  }
  return xs;
}
const HS = 20, HGAP = 22;                                   // heart size and spacing in the two big bars
/** Your hearts on a pencil tag beside your character's feet. */
export function playerHearts(g, bar, t) {
  const L = LAYOUT.playerHearts;
  tag(g, L.x, L.y, 22 + bar.max * HGAP, L.h, 94);
  heartsRow(g, L.x + 22, L.y + L.h / 2 + 1, HS, HGAP, bar, t, 94);
}
// The enemy's hearts fit inside the bubble: a long row (Big Ghost's 11) packs tighter with smaller hearts.
function enemyHeartGeom(max) { const fit = (LAYOUT.bubble.w - 30) / Math.max(1, max - 1); return fit >= HGAP ? { gap: HGAP, s: HS } : { gap: fit, s: Math.min(HS, fit * .95) }; }
/** Centre of heart i of a bar (screen px) and its size. which: 'player' | 'enemy' | 'l1' | 'r1'. */
export function heartSpotOf(which, i, max) {
  if (which === 'player') { const L = LAYOUT.playerHearts; return [L.x + 22 + i * HGAP, L.y + L.h / 2 + 1, HS]; }
  if (which === 'enemy') { const B = LAYOUT.bubble, q = enemyHeartGeom(max); return [B.x + B.w / 2 - (max - 1) * q.gap / 2 + i * q.gap, B.y + 25, q.s]; }
  const L = LAYOUT[which]; return [L.x + (which === 'l1' ? 78 : 50), L.y + L.h / 2, 13];
}

/** Big marker digit: ink figure with a paper rim so it reads on anything. */
export function digit(g, n, x, y, size, fill = INK, align = 'center') {
  g.save(); g.font = `900 ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = PAPER; g.lineWidth = Math.max(4, size * .2); g.strokeText(String(n), x, y);
  g.fillStyle = fill; g.fillText(String(n), x, y); g.restore();
}
/** Small type arrow beside a digit: +1 green up, -1 red down. */
export function typeArrow(g, dir, x, y, s = 9) {
  if (!dir) return;
  g.save(); g.fillStyle = dir > 0 ? '#3E9A4A' : RED; g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round';
  g.beginPath(); const d = dir > 0 ? -1 : 1;
  g.moveTo(x, y + d * s); g.lineTo(x + s * .9, y); g.lineTo(x + s * .35, y); g.lineTo(x + s * .35, y - d * s);
  g.lineTo(x - s * .35, y - d * s); g.lineTo(x - s * .35, y); g.lineTo(x - s * .9, y); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function word(g, text, x, y, size, align = 'left', col = INK) {
  g.save(); g.fillStyle = col; g.font = `800 ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(String(text).toUpperCase(), x, y); g.restore();
}
function psBadge(g, shape, x, y, r, dim, ink) {
  g.save(); g.fillStyle = '#fff'; g.strokeStyle = ink ? INK : PENCIL; g.lineWidth = ink ? 2.5 : 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
  drawPsShape(g, shape, x, y + (shape === 'triangle' ? 1 : 0), r * .5, dim ? '#aaa' : PS_COLOURS[shape], 3.2); g.restore();
}

/** One move card in the diamond. c: { empty, word, icon, number, kind, enabled, arrow, lifted, wiggle (0..1), press (0..1), webbed }
 *  An empty slot is not drawn; pressing it only shakes a faint button badge for a moment. */
export function card(g, shape, c, t) {
  const p = LAYOUT.cards[shape];
  let x = p.x, y = p.y;
  g.save();
  const a0 = g.globalAlpha;                              // the UI fade the caller set (alphas below multiply it)
  if (c.empty) {
    if (c.wiggle) { g.globalAlpha = a0 * .6 * (1 - c.wiggle); g.translate(x + CARD_W / 2 + Math.sin(c.wiggle * Math.PI * 6) * 6, y + CARD_H / 2); psBadge(g, shape, 0, 0, 14, true); }
    g.restore(); return;
  }
  if (c.lifted) y -= 9;
  if (c.press) y += 4 * Math.sin(c.press * Math.PI);
  g.translate(x + CARD_W / 2, y + CARD_H / 2);
  if (c.wiggle) g.rotate(Math.sin(c.wiggle * Math.PI * 6) * .12 * (1 - c.wiggle));
  if (c.lifted) g.rotate(-.02);
  g.translate(-CARD_W / 2, -CARD_H / 2);
  const r = rectPath(CARD_W, CARD_H, 200 + shape.length, 1.1);
  g.save(); g.translate(0, c.lifted ? 9 : 3); g.fillStyle = c.lifted ? 'rgba(70,45,20,.22)' : 'rgba(70,45,20,.10)'; g.fill(r.p); g.restore();
  const off = !c.enabled, ink = !!c.lifted;
  g.fillStyle = off ? '#ECE7DC' : ink ? YELLOW : PAPER; g.fill(r.p);
  g.strokeStyle = ink ? INK : PENCIL; g.lineWidth = ink ? 4.5 : 2; g.stroke(r.p);
  if (off) g.globalAlpha = a0 * .45;
  drawIcon(g, c.icon, 22, 30, 15);
  word(g, c.word, 42, 17, c.word.length > 5 ? 13 : 15, 'left', ink ? INK : PENCIL_TEXT);
  if (c.number != null) {
    if (c.kind === 'heal') { drawHeartIcon(g, 72, 40, 34, COLOURS.GREEN, 2.6); digit(g, c.number, 72, 39, 24); }
    else if (c.kind === 'badge') {
      g.beginPath(); g.arc(74, 39, 15, 0, 7); g.fillStyle = '#FFE7A6'; g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 2; g.stroke();
      digit(g, c.number, 74, 40, 26);
    } else digit(g, c.number, 72, 39, 32);
    typeArrow(g, c.arrow, 96, 40, 7);
  }
  g.globalAlpha = a0;
  if (c.webbed) { g.save(); g.globalAlpha = a0 * .75; drawWeb(g, CARD_W / 2 + 20, CARD_H / 2 + 4, 26); g.restore(); }
  psBadge(g, shape, CARD_W - 2, 2, 13, off, ink);
  g.restore();
}

/** The enemy's bubble: its hearts on top, its next move (word, icon, big digit) below; the tail points at it.
 *  b: { word, number (null = no digit), arrow, dizzy, changed, pop (0..1), webIcon }, bar: { max, shown, lost } */
export function bubble(g, b, bar, t) {
  const B = LAYOUT.bubble;
  const k = b.pop == null ? 1 : eOutBack(clamp(b.pop), 2);
  const shape = cached('bubble', () => wob([[B.x, B.y], [B.x + B.w, B.y], [B.x + B.w, B.y + B.h * .5], [B.tipX, B.tipY], [B.x + B.w, B.y + B.h * .78],
    [B.x + B.w, B.y + B.h], [B.x, B.y + B.h]], true, 1, 93));
  g.save(); g.translate(0, 3); g.fillStyle = 'rgba(70,45,20,.10)'; g.fill(shape.p); g.restore();
  g.fillStyle = '#fff'; g.fill(shape.p); g.strokeStyle = PENCIL; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke(shape.p);
  if (bar && bar.ghosts) {                                // boss phase 1: one small ghost per Little Ghost left (faint when gone)
    const G = bar.ghosts, s = G.sprite, k = 30 / s.h, w = s.w * k, gap = 40, x0 = B.x + B.w / 2 - (G.max - 1) * gap / 2;
    for (let i = 0; i < G.max; i++) {
      g.save(); g.globalAlpha *= i < G.n ? 1 : .2;
      g.translate(x0 + i * gap, B.y + 25 + (i < G.n ? Math.sin(t * .004 + i * 2) * 2 : 0)); g.scale(-1, 1);
      g.drawImage(s.c, -w / 2, -15, w, 30); g.restore();
    }
    g.save(); g.strokeStyle = 'rgba(163,156,142,.55)'; g.lineWidth = 1.5; g.setLineDash([5, 5]);
    g.beginPath(); g.moveTo(B.x + 14, B.y + 48); g.lineTo(B.x + B.w - 14, B.y + 48); g.stroke(); g.restore();
  } else if (bar) {                                       // hearts do not pop with the move
    const [x0, y0] = heartSpotOf('enemy', 0, bar.max), q = enemyHeartGeom(bar.max);
    heartsRow(g, x0, y0, q.s, q.gap, bar, t, 95);
    g.save(); g.strokeStyle = 'rgba(163,156,142,.55)'; g.lineWidth = 1.5; g.setLineDash([5, 5]);
    g.beginPath(); g.moveTo(B.x + 14, B.y + 48); g.lineTo(B.x + B.w - 14, B.y + 48); g.stroke(); g.restore();
  }
  g.save(); const mx = B.x + B.w / 2, my = B.y + 78; g.translate(mx, my); g.scale(k, k); g.translate(-mx, -my);
  word(g, b.word, B.x + 14, B.y + 64, 17);
  drawIcon(g, b.word.toLowerCase(), B.x + 34, B.y + 91, 13);
  if (b.dizzy) for (let i = 0; i < 3; i++) drawSparkle(g, B.x + 100 + i * 20, B.y + 78 + Math.sin(t * .006 + i) * 4, 8);
  else if (b.number != null) {
    const jig = b.changed ? Math.sin(t * .02) * 3 : 0;
    digit(g, b.number, B.x + 128, B.y + 79 + jig, 50, b.changed ? '#B8327A' : INK);
    typeArrow(g, b.arrow, B.x + 156, B.y + 80, 8);
  }
  if (b.webIcon) drawWeb(g, B.x + 128, B.y + 79, 20);
  g.restore();
}

/** The enemy's strip as a row of small icons under its bubble; the current one sits on a yellow dot with an
 *  ink caret that slides from the previous one. s: { strip, pointer, dizzy, from, u } */
export function strip(g, s, t) {
  const L = LAYOUT.strip, B = LAYOUT.bubble, n = s.strip.length, x0 = B.x + B.w / 2 - (n - 1) * L.gap / 2;
  const at = i => x0 + i * L.gap;
  const u = s.u == null ? 1 : eOutBack(clamp(s.u), 1.6);
  const px = s.from == null ? at(s.pointer) : at(s.from) + (at(s.pointer) - at(s.from)) * u;
  g.save(); g.beginPath(); g.arc(px, L.y, 14, 0, 7); g.fillStyle = YELLOW; g.fill(); g.restore();
  const a0 = g.globalAlpha;
  s.strip.forEach((c, i) => {
    const x = at(i), cur = i === s.pointer;
    g.globalAlpha = a0 * (cur ? 1 : .45);
    drawIcon(g, c.word.toLowerCase(), x, L.y, cur ? 10 : 8);
    if (c.form === 'folded') { g.globalAlpha *= .9; drawIcon(g, 'fold', x + 11, L.y - 9, 4.5); }
    if (cur && s.dizzy) { g.globalAlpha = a0; for (let k = 0; k < 3; k++) { const a = t * .004 + k * 2.1; drawSparkle(g, x + Math.cos(a) * 18, L.y - 4 + Math.sin(a) * 5, 5); } }
  });
  g.globalAlpha = a0;
  const py = L.y + 17;
  g.save(); g.fillStyle = INK; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 6, py + 7); g.lineTo(px - 6, py + 7); g.closePath(); g.fill(); g.restore();
}

const BEATS = { sweet: 'spooky', spooky: 'chompy', chompy: 'sweet' };
/** The three-icon type wheel (pencil). types: [ids in data order]. mark: { [type]: true } rings the ones in play. */
export function typeWheel(g, types, mark) {
  const L = LAYOUT.wheel, pos = {};
  g.save();
  g.beginPath(); g.arc(L.x, L.y, L.r + 6, 0, 7); g.fillStyle = 'rgba(251,248,240,.9)'; g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 1.6; g.stroke();
  types.forEach((ty, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; pos[ty] = [L.x + Math.cos(a) * L.r * .72, L.y + Math.sin(a) * L.r * .72]; });
  g.strokeStyle = PENCIL; g.fillStyle = PENCIL; g.lineWidth = 1.6;
  for (const ty of types) {
    const to = BEATS[ty]; if (!pos[to]) continue;
    const [x0, y0] = pos[ty], [x1, y1] = pos[to], mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.beginPath(); g.moveTo(mx - Math.cos(a) * 4, my - Math.sin(a) * 4); g.lineTo(mx + Math.cos(a) * 4, my + Math.sin(a) * 4); g.stroke();
    g.beginPath(); g.moveTo(mx + Math.cos(a) * 6, my + Math.sin(a) * 6); g.lineTo(mx + Math.cos(a + 2.5) * 4, my + Math.sin(a + 2.5) * 4); g.lineTo(mx + Math.cos(a - 2.5) * 4, my + Math.sin(a - 2.5) * 4); g.closePath(); g.fill();
  }
  for (const ty of types) {
    const [x, y] = pos[ty];
    if (mark[ty]) { g.beginPath(); g.arc(x, y, 10, 0, 7); g.fillStyle = YELLOW; g.fill(); }
    drawTypeIcon(g, ty, x, y, 8);
  }
  g.restore();
}

/** A small teammate tag in a top corner, in the field HUD's follower style: shoulder label, portrait, heart, number.
 *  p: { side, sprite (baked folded sprite), bar, sleepy, pulse (pick me: knocked-out state), lifted, wiggle, webbed } */
export function portrait(g, p, t) {
  const L = LAYOUT[p.side], l1 = p.side === 'l1', cx = L.x + L.w / 2, cy = L.y + L.h / 2;
  const hot = p.lifted || p.pulse;
  g.save();
  if (p.lifted) g.translate(0, 4);
  if (p.pulse) { const k = 1 + .06 * Math.sin(t * .008); g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy); }
  if (p.wiggle) { g.translate(cx, cy); g.rotate(Math.sin(p.wiggle * Math.PI * 6) * .12 * (1 - p.wiggle)); g.translate(-cx, -cy); }
  tag(g, L.x, L.y, L.w, L.h, l1 ? 71 : 72, hot ? YELLOW : PAPER, hot ? INK : PENCIL, hot ? 3 : 2);
  word(g, p.side.toUpperCase(), l1 ? L.x + 8 : L.x + L.w - 8, cy + 1, 13, l1 ? 'left' : 'right', hot ? INK : PENCIL_TEXT);
  const s = p.sprite, k = Math.min(26 / s.h, 36 / s.w), h = s.h * k, w = s.w * k, px = L.x + (l1 ? 48 : 24);
  g.save(); if (p.sleepy) g.globalAlpha *= .35;
  g.drawImage(s.c, px - w / 2, cy - h / 2, w, h); g.restore();
  if (p.sleepy) word(g, 'z', px + 12, cy - 10 + Math.sin(t * .004) * 2, 14, 'center');
  const [hx, hy] = heartSpotOf(p.side, 0), b = p.bar;
  const kind = b.shown <= 0 ? 'empty' : b.lost ? 'hollow' : b.heal ? 'ghost' : 'full';
  heartAt(g, hx, hy, 13, kind, l1 ? 3 : 5, t);
  word(g, Math.max(0, b.shown - (b.lost || 0)) + (b.heal ? '+' + b.heal : ''), hx + 10, cy + 1, b.heal ? 13 : 16, 'left', b.heal ? '#3E8A3A' : INK);
  if (p.webbed) { g.globalAlpha *= .85; drawWeb(g, px, cy, 18); }
  g.restore();
}

/** Badges in a row beside the active character. b: { fresh, lift, tummy, sticky, pop: { key: 0..1 } } */
export function badges(g, b, t) {
  const L = LAYOUT.badges; let x = L.x;
  const one = (key, draw, n) => {
    const pu = b.pop && b.pop[key] != null ? b.pop[key] : 1, k = eOutBack(clamp(pu), 2.4);
    g.save(); g.translate(x, L.y); g.scale(k, k);
    g.beginPath(); g.arc(0, 0, 19, 0, 7); g.fillStyle = PAPER; g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 2; g.stroke();
    draw(g); if (n != null) { g.beginPath(); g.arc(15, 12, 11, 0, 7); g.fillStyle = '#FFE7A6'; g.fill(); g.strokeStyle = PENCIL; g.lineWidth = 1.8; g.stroke(); digit(g, n, 15, 13, 18); }
    g.restore(); x += L.gap;
  };
  if (b.fresh) one('fresh', gg => drawSparkle(gg, 0, 0, 13 + Math.sin(t * .01) * 1.5));
  if (b.lift) one('lift', gg => drawDumbbell(gg, 0, 0, 13), b.lift);
  if (b.tummy) one('tummy', gg => drawFood(gg, b.tummy, 0, 0, 13), b.tummy);
  if (b.sticky) one('sticky', gg => drawWeb(gg, 0, 0, 14));
}

/** Hold-R2 Run ring: small and pencil at rest; while R2 is held it grows, turns ink and fills. r: { progress 0..1 } */
export function runRing(g, r) {
  const L = LAYOUT.run, on = r.progress > 0, rr = on ? L.r + 7 : L.r;
  g.save(); g.beginPath(); g.arc(L.x, L.y, rr, 0, 7); g.fillStyle = on ? YELLOW : 'rgba(251,248,240,.85)'; g.fill();
  g.strokeStyle = on ? INK : PENCIL; g.lineWidth = on ? 2 : 1.5; g.stroke();
  if (on) { g.beginPath(); g.arc(L.x, L.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(r.progress)); g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; g.stroke(); }
  g.font = `800 ${on ? 11 : 8}px ${FONT}`; g.fillStyle = on ? INK : PENCIL_TEXT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R2', L.x, L.y + 1);
  g.restore();
  word(g, 'RUN', L.x - rr - 5, L.y, on ? 15 : 11, 'right', on ? INK : PENCIL_TEXT);
}
