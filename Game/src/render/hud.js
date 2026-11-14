// Field HUD: paper hearts tag with the lead's portrait, follower portraits, candy tag, pumpkin goal marker.
// Baked into one screen-width strip and re-baked only when what it shows changes.
import { W, H, R, INK, PAPER, PEN, FONT, mk, wob, ell, heartPts, paperTag } from './core.js';
import { prepareActors } from './actors.js';
import { candyArt } from './sprites.js';

const STRIP_H = 96;

function hearts(g, n, full, x, y, s, gap) {
  for (let i = 0; i < n; i++) {
    const h = wob(heartPts(x + i * gap, y, s), true, .5, 80 + i, 6);
    g.fillStyle = i < full ? '#D03C30' : PAPER; g.fill(h.p); g.strokeStyle = INK; g.lineWidth = s > 14 ? 2.6 : 2; g.stroke(h.p);
  }
}
function portrait(g, A, id, cx, cy, h, dim) {
  const r = A.chars[id]; if (!r) return; const v = r.folded, k = h / v.s.h;
  g.save(); g.globalAlpha = dim ? .55 : 1; g.drawImage(v.s.c, cx - v.s.w * k / 2, cy - h / 2, v.s.w * k, h); g.restore();
}

function bake(assets, fs) {
  const A = prepareActors(assets);
  const c = mk(W * R.DPR, STRIP_H * R.DPR), g = c.getContext('2d'); g.scale(R.DPR, R.DPR);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const lead = fs.party[0];
  if (lead) {
    const n = lead.maxHearts, gap = n > 8 ? 21 : 26, s = n > 8 ? 17 : 20, w = 62 + n * gap;
    paperTag(g, 14, 12, w, 44, 61);
    portrait(g, A, lead.id, 40, 34, 34, false);
    hearts(g, n, lead.hearts, 76, 34, s, gap);
    fs.party.slice(1).forEach((m, i) => {
      const x = 14 + i * 78; paperTag(g, x, 62, 70, 28, 64 + i);
      portrait(g, A, m.id, x + 18, 76, 22, m.hearts <= 0);
      hearts(g, 1, m.hearts > 0 ? 1 : 0, x + 40, 76, 13, 0);
      g.fillStyle = INK; g.font = `800 15px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(String(m.hearts), x + 50, 77);
    });
  }
  // pumpkin goal marker
  paperTag(g, 640, 12, 58, 44, 62);
  const pb = wob(ell(662, 36, 13, 10, 12, .08, 3), true, .5, 3); g.fillStyle = '#F4A04A'; g.fill(pb.p); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke(pb.p);
  g.beginPath(); g.moveTo(662, 26); g.lineTo(664, 21); g.stroke();
  g.fillStyle = INK; g.beginPath(); g.moveTo(680, 29); g.lineTo(690, 35); g.lineTo(680, 41); g.closePath(); g.fill();
  // candy tag
  paperTag(g, 708, 12, 122, 44, 63);
  const im = candyArt(assets), cw = 52, ch = cw * im.height / im.width; g.drawImage(im, 718, 34 - ch / 2, cw, ch);
  g.fillStyle = INK; g.font = `800 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(String(fs.candyCount), 800, 44);
  return c;
}

/** Draws the field HUD (screen space). inputFrame is optional; touch shows pencil stick and buttons. */
export function drawFieldHud(ctx, assets, fs, inputFrame) {
  const key = fs.candyCount + '|' + fs.party.map(m => m.id + m.hearts + '/' + m.maxHearts).join(',');
  const cache = assets.cache.hud || (assets.cache.hud = {});
  if (cache.key !== key) { cache.c = bake(assets, fs); cache.key = key; }
  ctx.drawImage(cache.c, 0, 0, W, STRIP_H);
  if (inputFrame && inputFrame.source === 'touch') {
    ctx.save(); ctx.strokeStyle = PEN; ctx.lineWidth = 2.5; ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.arc(92, H - 84, 52, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(92 + 40 * (inputFrame.moveX || 0), H - 84 + 40 * (inputFrame.moveY || 0), 22, 0, 7); ctx.stroke();
    for (const [x, y] of [[W - 70, H - 70], [W - 140, H - 110]]) { ctx.beginPath(); ctx.arc(x, y, 30, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
}
