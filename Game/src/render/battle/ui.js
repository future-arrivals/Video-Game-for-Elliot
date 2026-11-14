// Battle UI pieces: heart bars (with previews), big marker digits, the move cards, the enemy strip,
// the intent bubble, the type wheel, teammate portraits, badges and the Run ring. Pure drawing.
import { INK, PAPER, PEN, FONT, wob, heartPts, clamp, eOutBack } from '../core.js';
import { drawPsShape } from '../../input/touch.js';
import { drawIcon, drawTypeIcon, drawSparkle, drawDumbbell, drawWeb, drawFood, drawHeartIcon, COLOURS } from './icons.js';
import { LAYOUT, CARD_W, CARD_H, PS_COLOURS } from './layout.js';

const RED = '#D03C30';
const cache = new Map();
const cached = (key, make) => cache.get(key) || (cache.set(key, make()), cache.get(key));
const heartPath = (s, seed) => cached(`h${s}|${seed}`, () => wob(heartPts(0, 0, s), true, .5, 80 + seed, 6).p);
const rectPath = (w, h, seed, amp = .9) => cached(`r${w}|${h}|${seed}|${amp}`, () => wob([[0, 0], [w, 0], [w, h], [0, h]], true, amp, seed));

/** Paper tag with a soft drop shadow at (x, y). */
export function tag(g, x, y, w, h, seed, fill = PAPER, edge = '#cfc5b1', lw = 1.5) {
  const t = rectPath(Math.round(w), Math.round(h), seed, .6);
  g.save(); g.translate(x, y + 3); g.fillStyle = 'rgba(80,55,25,.18)'; g.fill(t.p); g.restore();
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
  else { g.strokeStyle = kind === 'ghost' ? '#3f7a34' : INK; g.lineWidth = s > 14 ? 2.6 : 1.8; g.stroke(p); }
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
/** A heart bar on a paper tag. Returns { xs, y, s } so effects can tear hearts off at the right spot. */
export function heartsTag(g, x, y, bar, t, seed, s = 20, gap = 22) {
  const w = 22 + bar.max * gap;
  tag(g, x, y, w, 44, seed);
  const xs = heartsRow(g, x + 22, y + 23, s, gap, bar, t, seed);
  return { xs, y: y + 23, s };
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
function psBadge(g, shape, x, y, r, dim) {
  g.save(); g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
  drawPsShape(g, shape, x, y + (shape === 'triangle' ? 1 : 0), r * .5, dim ? '#aaa' : PS_COLOURS[shape], 3.2); g.restore();
}

/** One move card in the diamond. c: { empty, word, icon, number, kind, enabled, arrow, lifted, wiggle (0..1), press (0..1), webbed } */
export function card(g, shape, c, t) {
  const p = LAYOUT.cards[shape];
  let x = p.x, y = p.y;
  g.save();
  const a0 = g.globalAlpha;                              // the UI fade the caller set (alphas below multiply it)
  if (c.empty) {
    const r = rectPath(CARD_W, CARD_H, 300 + shape.length, 1.4);
    g.translate(x, y); g.setLineDash([6, 6]); g.strokeStyle = PEN; g.lineWidth = 2; g.stroke(r.p); g.setLineDash([]);
    g.globalAlpha = a0 * .45; psBadge(g, shape, CARD_W, 0, 12, true); g.restore(); return;
  }
  if (c.lifted) y -= 9;
  if (c.press) y += 4 * Math.sin(c.press * Math.PI);
  g.translate(x + CARD_W / 2, y + CARD_H / 2);
  if (c.wiggle) g.rotate(Math.sin(c.wiggle * Math.PI * 6) * .12 * (1 - c.wiggle));
  if (c.lifted) g.rotate(-.02);
  g.translate(-CARD_W / 2, -CARD_H / 2);
  const r = rectPath(CARD_W, CARD_H, 200 + shape.length, 1.1);
  g.save(); g.translate(0, c.lifted ? 9 : 4); g.fillStyle = 'rgba(70,45,20,.22)'; g.fill(r.p); g.restore();
  const off = !c.enabled;
  g.fillStyle = off ? '#E4DED2' : c.lifted ? '#FFF1A8' : PAPER; g.fill(r.p);
  g.strokeStyle = off ? '#A8A091' : INK; g.lineWidth = c.lifted ? 4.5 : 3; g.stroke(r.p);
  if (off) g.globalAlpha = a0 * .45;
  drawIcon(g, c.icon, 22, 30, 15);
  word(g, c.word, 42, 17, c.word.length > 5 ? 13 : 15);
  if (c.number != null) {
    if (c.kind === 'heal') { drawHeartIcon(g, 72, 40, 34, COLOURS.GREEN, 2.6); digit(g, c.number, 72, 39, 24); }
    else if (c.kind === 'badge') {
      g.beginPath(); g.arc(74, 39, 15, 0, 7); g.fillStyle = '#FFE7A6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
      digit(g, c.number, 74, 40, 26);
    } else digit(g, c.number, 72, 39, 32);
    typeArrow(g, c.arrow, 96, 40, 7);
  }
  g.globalAlpha = a0;
  if (c.webbed) { g.save(); g.globalAlpha = a0 * .75; drawWeb(g, CARD_W / 2 + 20, CARD_H / 2 + 4, 26); g.restore(); }
  psBadge(g, shape, CARD_W - 2, 2, 13, off);
  g.restore();
}

/** Enemy strip: every card in order, the pointer on the current one. s: { strip, pointer, dizzy, from, u } */
export function strip(g, s, t) {
  const L = LAYOUT.strip, n = s.strip.length, w = n * L.cw + (n - 1) * L.gap, x0 = L.cx - w / 2;
  s.strip.forEach((c, i) => {
    const x = x0 + i * (L.cw + L.gap), cur = i === s.pointer;
    tag(g, x, L.y, L.cw, L.ch, 400 + i, cur ? '#FFF1A8' : PAPER, cur ? INK : '#bdb29c', cur ? 3 : 1.5);
    drawIcon(g, c.word.toLowerCase(), x + 18, L.y + 23, 12);
    word(g, c.word, x + 33, L.y + 23, c.word.length > 4 ? 11 : 12);
    if (c.form === 'folded') { g.save(); g.globalAlpha *= .9; drawIcon(g, 'fold', x + L.cw - 8, L.y + 8, 6); g.restore(); }
    if (cur && s.dizzy) for (let k = 0; k < 3; k++) { const a = t * .004 + k * 2.1; drawSparkle(g, x + L.cw / 2 + Math.cos(a) * 26, L.y + 6 + Math.sin(a) * 6, 6); }
  });
  // pointer: an ink arrow under the current card, sliding from the previous one
  const at = i => x0 + i * (L.cw + L.gap) + L.cw / 2;
  const u = s.u == null ? 1 : eOutBack(clamp(s.u), 1.6);
  const px = s.from == null ? at(s.pointer) : at(s.from) + (at(s.pointer) - at(s.from)) * u, py = L.y + L.ch + 4;
  g.save(); g.fillStyle = INK; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 9, py + 10); g.lineTo(px - 9, py + 10); g.closePath(); g.fill(); g.restore();
}

/** Intent bubble by the enemy. b: { word, number (null = no digit), arrow, dizzy, changed, pop (0..1) } */
export function bubble(g, b, t) {
  const B = LAYOUT.bubble;
  const k = b.pop == null ? 1 : eOutBack(clamp(b.pop), 2);
  g.save(); g.translate(B.x + B.w / 2, B.y + B.h / 2); g.scale(k, k); g.translate(-B.x - B.w / 2, -B.y - B.h / 2);
  const shape = cached('bubble', () => wob([[B.x, B.y], [B.x + B.w, B.y], [B.x + B.w, B.y + B.h * .45], [B.tipX, B.tipY], [B.x + B.w, B.y + B.h * .75],
    [B.x + B.w, B.y + B.h], [B.x, B.y + B.h]], true, 1, 93));
  g.save(); g.translate(0, 4); g.fillStyle = 'rgba(70,45,20,.18)'; g.fill(shape.p); g.restore();
  g.fillStyle = '#fff'; g.fill(shape.p); g.strokeStyle = INK; g.lineWidth = 3.5; g.lineJoin = 'round'; g.stroke(shape.p);
  drawIcon(g, b.word.toLowerCase(), B.x + 26, B.y + 42, 17);
  word(g, b.word, B.x + 10, B.y + 14, 14);
  if (b.dizzy) for (let i = 0; i < 3; i++) drawSparkle(g, B.x + 82 + i * 18, B.y + 44 + Math.sin(t * .006 + i) * 4, 8);
  else if (b.number != null) {
    const jig = b.changed ? Math.sin(t * .02) * 3 : 0;
    digit(g, b.number, B.x + 92, B.y + 42 + jig, 46, b.changed ? '#B8327A' : INK);
    typeArrow(g, b.arrow, B.x + 124, B.y + 42, 8);
  }
  if (b.webIcon) drawWeb(g, B.x + 98, B.y + 42, 20);
  g.restore();
}

const BEATS = { sweet: 'spooky', spooky: 'chompy', chompy: 'sweet' };
/** The three-icon type wheel. types: [ids in data order]. mark: { [type]: true } rings the ones in play. */
export function typeWheel(g, types, mark) {
  const L = LAYOUT.wheel, pos = {};
  g.save(); g.globalAlpha *= .95;
  g.beginPath(); g.arc(L.x, L.y, L.r + 6, 0, 7); g.fillStyle = 'rgba(251,248,240,.85)'; g.fill(); g.strokeStyle = '#cfc5b1'; g.lineWidth = 1.5; g.stroke();
  types.forEach((ty, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; pos[ty] = [L.x + Math.cos(a) * L.r * .72, L.y + Math.sin(a) * L.r * .72]; });
  g.strokeStyle = PEN; g.fillStyle = PEN; g.lineWidth = 1.6;
  for (const ty of types) {
    const to = BEATS[ty]; if (!pos[to]) continue;
    const [x0, y0] = pos[ty], [x1, y1] = pos[to], mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.beginPath(); g.moveTo(mx - Math.cos(a) * 4, my - Math.sin(a) * 4); g.lineTo(mx + Math.cos(a) * 4, my + Math.sin(a) * 4); g.stroke();
    g.beginPath(); g.moveTo(mx + Math.cos(a) * 6, my + Math.sin(a) * 6); g.lineTo(mx + Math.cos(a + 2.5) * 4, my + Math.sin(a + 2.5) * 4); g.lineTo(mx + Math.cos(a - 2.5) * 4, my + Math.sin(a - 2.5) * 4); g.closePath(); g.fill();
  }
  for (const ty of types) {
    const [x, y] = pos[ty];
    if (mark[ty]) { g.beginPath(); g.arc(x, y, 10.5, 0, 7); g.fillStyle = '#FFF1A8'; g.fill(); }
    drawTypeIcon(g, ty, x, y, 8.5);
  }
  g.restore();
}

/** Teammate portrait standing in for L1 / R1. p: { side, sprite (baked folded sprite), bar, sleepy, pulse, lifted, wiggle } */
export function portrait(g, p, t) {
  const L = LAYOUT[p.side];
  g.save();
  let dy = p.lifted ? 6 : 0;
  if (p.pulse) { const k = 1 + .05 * Math.sin(t * .008); g.translate(L.x + L.w / 2, L.y + L.h / 2); g.scale(k, k); g.translate(-L.x - L.w / 2, -L.y - L.h / 2); }
  if (p.wiggle) { g.translate(L.x + L.w / 2, L.y + L.h / 2); g.rotate(Math.sin(p.wiggle * Math.PI * 6) * .12 * (1 - p.wiggle)); g.translate(-L.x - L.w / 2, -L.y - L.h / 2); }
  g.translate(0, dy);
  tag(g, L.x, L.y, L.w, L.h, p.side === 'l1' ? 71 : 72, p.lifted ? '#FFF1A8' : p.pulse ? '#FFF6CF' : PAPER, p.lifted || p.pulse ? INK : '#cfc5b1', p.lifted || p.pulse ? 3 : 1.5);
  const s = p.sprite, h = 40, w = s.w * h / s.h;
  g.save(); if (p.sleepy) g.globalAlpha *= .35;
  g.drawImage(s.c, L.x + L.w / 2 - w / 2 + (p.side === 'l1' ? 8 : -8), L.y + 6, w, h); g.restore();
  if (p.sleepy) { g.save(); g.fillStyle = INK; g.font = `900 22px ${FONT}`; g.textAlign = 'center'; g.fillText('z', L.x + L.w / 2 + 18, L.y + 22 + Math.sin(t * .004) * 3); g.restore(); }
  // shoulder label
  g.save(); g.font = `800 13px ${FONT}`; g.fillStyle = '#6b655b'; g.textAlign = p.side === 'l1' ? 'left' : 'right'; g.textBaseline = 'middle';
  g.fillText(p.side.toUpperCase(), p.side === 'l1' ? L.x + 6 : L.x + L.w - 6, L.y + 14); g.restore();
  const n = p.bar.max, gap = Math.min(8.5, (L.w - 12) / n);
  const a0 = g.globalAlpha;
  if (p.sleepy) g.globalAlpha = a0 * .5;
  heartsRow(g, L.x + 6 + gap / 2 + (L.w - 12 - gap * n) / 2, L.y + L.h - 14, 7.5, gap, p.bar, t, p.side.length * 5);
  if (p.webbed) { g.globalAlpha = a0 * .85; drawWeb(g, L.x + L.w / 2, L.y + L.h / 2, 30); }
  g.restore();
}

/** Badges beside the active character. b: { fresh, lift, tummy, sticky, pop: { key: 0..1 } } */
export function badges(g, b, t) {
  const L = LAYOUT.badges; let y = L.y;
  const one = (key, draw, n) => {
    const pu = b.pop && b.pop[key] != null ? b.pop[key] : 1, k = eOutBack(clamp(pu), 2.4);
    g.save(); g.translate(L.x, y); g.scale(k, k);
    g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fillStyle = PAPER; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
    draw(g); if (n != null) { g.beginPath(); g.arc(16, 13, 11, 0, 7); g.fillStyle = '#FFE7A6'; g.fill(); g.lineWidth = 2; g.stroke(); digit(g, n, 16, 14, 17); }
    g.restore(); y += L.gap;
  };
  if (b.fresh) one('fresh', gg => drawSparkle(gg, 0, 0, 13 + Math.sin(t * .01) * 1.5));
  if (b.lift) one('lift', gg => drawDumbbell(gg, 0, 0, 13), b.lift);
  if (b.tummy) one('tummy', gg => drawFood(gg, b.tummy, 0, 0, 13), b.tummy);
  if (b.sticky) one('sticky', gg => drawWeb(gg, 0, 0, 14));
}

/** Hold-R2 Run ring. r: { progress 0..1 } */
export function runRing(g, r) {
  const L = LAYOUT.run;
  g.save(); g.beginPath(); g.arc(L.x, L.y, L.r, 0, 7); g.fillStyle = 'rgba(251,248,240,.9)'; g.fill(); g.strokeStyle = PEN; g.lineWidth = 2; g.stroke();
  if (r.progress > 0) { g.beginPath(); g.arc(L.x, L.y, L.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(r.progress)); g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; g.stroke(); }
  g.font = `800 11px ${FONT}`; g.fillStyle = '#6b655b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R2', L.x, L.y + 1);
  g.restore();
  word(g, 'RUN', L.x - L.r - 6, L.y, 13, 'right', '#6b655b');
}
