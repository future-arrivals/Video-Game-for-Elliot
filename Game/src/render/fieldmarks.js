// Field marks (Task 7 additions): the highlighter ring under the lead, the swap pop, the dashed power
// outline with its badge, and the crumbs an eaten boulder leaves. Highlighter yellow = "matters now".
// Baked once; per frame only blits plus a few short paths (the outline, the badge, the ring drawing in).
import { R, INK, PAPER, PEN, wx, wy, mk, rng, clamp, wob, ell, eOutCubic } from './core.js';
import { prepareActors } from './actors.js';
import { drawPsShape } from '../input/touch.js';

const LEAD_RING = { on: true, w: 86, h: 26, fill: 'rgba(255,232,120,.72)', line: '#E2BF3A', lw: 4 };  // ~1.8 tiles: a highlighter puddle
const SWAP_POP = { on: true, secs: .35, scale: .12 };     // new lead pops 1.0 -> 1.12 -> 1.0, ring draws in
const POWER_OUTLINE = { on: true, pad: 10, padTop: 5, dash: [9, 7], lw: 3.6, under: 'rgba(255,253,244,.92)', march: 18, ghost: .4 };  // ghost: see-through pass over actors in front  // march: px/s when ready
const BADGE = { on: true, h: 36, bob: 2.5, hop: 11, hopSecs: .4, lift: 72, dx: 58, cross: '#4F84CF', ready: '#FFF1A8' };  // lift/dx: above-right of the target, clear of the candy and the tallest lead
const CRUMBS = { on: true, n: 7 };
const BOULDER_SCALE_GUESS = .74;                           // matches stagebake BOULDER_SCALE (outline size)

/** Bakes the ring sprite and the crumbs; returns the marks state kept on the view. */
export function bakeMarks(stage) {
  const ring = wob(ell(0, 0, LEAD_RING.w / 2, LEAD_RING.h / 2, 20, .04, 5), true, 1.1, 71, 10);
  const pad = 4, c = mk((LEAD_RING.w + pad * 2) * R.BS, (LEAD_RING.h + pad * 2) * R.BS), g = c.getContext('2d');
  g.scale(R.BS, R.BS); g.translate(LEAD_RING.w / 2 + pad, LEAD_RING.h / 2 + pad);
  g.fillStyle = LEAD_RING.fill; g.fill(ring.p); g.strokeStyle = LEAD_RING.line; g.lineWidth = LEAD_RING.lw; g.lineJoin = 'round'; g.stroke(ring.p);
  const crumbs = new Map();
  if (CRUMBS.on) for (const [i, j] of stage.boulders) crumbs.set(i + ',' + j, bakeCrumbs(wx(i + .5), wy(j + .78), i * 13 + j));
  return { ring, ringSprite: { c, w: LEAD_RING.w + pad * 2, h: LEAD_RING.h + pad * 2 }, crumbs, leadId: null, leadSince: -1e9, lastTime: 0 };
}

function bakeCrumbs(x, y, seed) {             // a few pale pencil pebbles where the boulder was
  const r = rng(seed), w = 70, h = 30, c = mk(w * R.BS, h * R.BS), g = c.getContext('2d');
  g.scale(R.BS, R.BS); g.translate(w / 2, h / 2); g.lineJoin = 'round';
  for (let n = 0; n < CRUMBS.n; n++) {
    const px = (r() - .5) * 46, py = (r() - .5) * 12, rr = 2 + r() * 3.5;
    const p = wob(ell(px, py, rr * 1.3, rr, 7, .3, seed + n), true, .3, seed + n, 4);
    g.fillStyle = n % 3 ? '#DCD5C6' : '#CFC6B4'; g.fill(p.p); g.strokeStyle = PEN; g.lineWidth = 1.2; g.stroke(p.p);
  }
  return { c, x: x - w / 2, y: y - h / 2, w, h };
}

/** Called once per frame before drawing: notices a lead change (view-local, compared between frames).
 *  Returns the pop scale for the lead and the ring draw-in progress (1 = fully drawn). */
export function leadState(M, fs) {
  const id = fs.party[0] && fs.party[0].id, now = fs.time ?? 0;
  if (now < M.lastTime) M.leadSince = -1e9;                     // time went back (new stage / reload)
  if (M.leadId !== null && id !== M.leadId) M.leadSince = M.lastTime;   // changed since the previous frame
  M.leadId = id; M.lastTime = now;
  const u = (now - M.leadSince) / SWAP_POP.secs;
  if (!SWAP_POP.on || u >= 1 || u < 0) return { pop: 1, draw: 1 };
  return { pop: 1 + SWAP_POP.scale * Math.sin(Math.PI * u), draw: eOutCubic(u) };
}

/** The highlighter ring under the lead's feet (drawn just before the lead, so under its contact shadow). */
export function drawLeadRing(ctx, M, x, y, draw) {
  if (!LEAD_RING.on) return;
  const s = M.ringSprite;
  if (draw >= 1) { ctx.drawImage(s.c, x - s.w / 2, y - s.h / 2, s.w, s.h); return; }
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = draw; ctx.fillStyle = LEAD_RING.fill; ctx.fill(M.ring.p); ctx.globalAlpha = 1;
  ctx.strokeStyle = LEAD_RING.line; ctx.lineWidth = LEAD_RING.lw; ctx.lineCap = 'round';
  ctx.setLineDash([M.ring.len, M.ring.len]); ctx.lineDashOffset = M.ring.len * (1 - draw); ctx.stroke(M.ring.p);
  ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.restore();
}

export function drawCrumbs(ctx, M, key) {
  const s = M.crumbs.get(key); if (s) ctx.drawImage(s.c, s.x, s.y, s.w, s.h);
}

/** Outline geometry for the target tile: around the boulder if one is there, else around the tile. */
function targetShape(view, fs, t) {
  const x = wx(t.i + .5), feet = wy(t.j + .8);
  const hasBoulder = (fs.boulders || []).some(b => b.i === t.i && b.j === t.j) && view.boulderSprites.has(t.i + ',' + t.j);
  const k = BOULDER_SCALE_GUESS, P = POWER_OUTLINE.pad;
  // the top edge stays low (padTop) so the candy behind a boulder still shows above the outline
  const pt = POWER_OUTLINE.padTop, ry = 26 * k + (P + pt) / 2;
  return hasBoulder ? { cx: x, cy: feet - 24 * k + (P - pt) / 2, rx: 34 * k + P, ry } : { cx: x, cy: wy(t.j + .5), rx: 24 + P * .5, ry: 15 + P * .5 };
}

/** The A2 dashed "a power fits" outline. Drawn in the depth sort just in front of the target's row, then
 *  again faintly (ghost = true) after everything so it still shows through a character standing in front. */
export function drawTargetOutline(ctx, view, fs, t, ghost = false) {
  if (!POWER_OUTLINE.on || (ghost && !POWER_OUTLINE.ghost)) return;
  const s = targetShape(view, fs, t), key = t.i * 7 + t.j;
  const o = view.outlines || (view.outlines = new Map());
  let p = o.get(key); if (!p) { p = wob(ell(s.cx, s.cy, s.rx, s.ry, 18, .05, key), true, 1, key, 10); o.set(key, p); }
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (ghost) ctx.globalAlpha = POWER_OUTLINE.ghost;
  else { ctx.strokeStyle = POWER_OUTLINE.under; ctx.lineWidth = POWER_OUTLINE.lw + 4; ctx.stroke(p.p); }
  ctx.setLineDash(POWER_OUTLINE.dash); ctx.lineDashOffset = t.ready ? -(fs.time || 0) * POWER_OUTLINE.march : 0;
  ctx.strokeStyle = INK; ctx.lineWidth = POWER_OUTLINE.lw; ctx.stroke(p.p);
  ctx.restore();
}

/** The badge: an opaque paper pill above and to the right of the target (high enough that a lead standing in
 *  front never covers it, right of anything just behind the target) with a tail down to the outline.
 *  Not ready: pencil outline, the portrait of `t.by` in full colour, still. Ready: ink outline, highlighter
 *  fill, portrait plus the Cross shape, bobbing. A nudge makes it hop. Drawn after everything. */
export function drawTargetBadge(ctx, view, fs, t) {
  if (!BADGE.on) return;
  const A = prepareActors(view.assets), rec = A.chars[t.by]; if (!rec) return;
  const s = targetShape(view, fs, t), now = fs.time || 0, ready = !!t.ready;
  const nudge = t.nudgeAt != null ? (now - t.nudgeAt) / BADGE.hopSecs : -1;
  let dy = ready ? Math.sin(now * 4.2) * BADGE.bob : 0;
  if (nudge >= 0 && nudge < 1) dy -= BADGE.hop * Math.sin(Math.PI * nudge) * (1 + .3 * Math.sin(Math.PI * nudge * 2));
  const h = BADGE.h, rr = h / 2, v = rec.folded, ph = h - 7, pw = v.s.w * ph / v.s.h;
  const w = ready ? pw + h + 10 : Math.max(h, pw + 12);
  const x0 = s.cx + BADGE.dx - (ready ? h * .55 : w / 2), y0 = s.cy - BADGE.lift - rr + dy, by = y0 + rr;
  const line = ready ? INK : PEN, fill = ready ? BADGE.ready : PAPER;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // tail from the pill's lower left down to the outline's upper right
  const tx = x0 + Math.min(18, w * .3);
  ctx.fillStyle = fill; ctx.strokeStyle = line; ctx.lineWidth = ready ? 2.8 : 2.2;
  ctx.beginPath(); ctx.moveTo(tx - 6, y0 + h - 3); ctx.lineTo(s.cx + s.rx * .55, s.cy - s.ry * .7); ctx.lineTo(tx + 7, y0 + h - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(x0, y0, w, h, rr); ctx.fill(); ctx.stroke();
  ctx.drawImage(v.s.c, x0 + (ready ? 6 : (w - pw) / 2), by - ph / 2, pw, ph);
  if (ready) {
    const cx = x0 + w - rr;
    ctx.beginPath(); ctx.arc(cx, by, rr * .7, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    drawPsShape(ctx, 'cross', cx, by, rr * .32, BADGE.cross, 3.2);
  }
  ctx.restore();
}

/** Dev only: ?target=20,1&ready=1|0 [&nudge=1] [&eaten=1] (read inside the render code, never the rules). */
export function readDevMarks() {
  if (typeof location === 'undefined') return {};
  const q = new URLSearchParams(location.search), out = {};
  if (q.has('target')) {
    const [i, j] = q.get('target').split(',').map(Number);
    if (Number.isFinite(i) && Number.isFinite(j)) out.target = { i, j, power: 'eat', by: q.get('by') || 'monster', ready: q.get('ready') === '1', nudgeAt: q.has('nudge') ? Number(q.get('nudge')) : undefined };
  }
  if (q.get('eaten') === '1') out.eaten = true;
  return out;
}
