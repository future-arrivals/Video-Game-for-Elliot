// Field HUD: paper hearts tag with the lead's portrait, follower portraits, candy tag, pumpkin goal marker.
// Baked into one screen-width strip and re-baked only when what it shows changes.
import { W, R, INK, PAPER, FONT, mk, wob, ell, heartPts, paperTag } from './core.js';
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

// Touch: the L1 / R1 tap zones (input/touch.js LAYOUT, 96 x 84 in the top corners) stay clear of the
// tags; the previous and next teammate's portraits sit inside those zones instead (tap = make lead).
const ZONE_W = 96, ZONE_H = 84;

function bake(assets, fs, touch) {
  const A = prepareActors(assets);
  const c = mk(W * R.DPR, STRIP_H * R.DPR), g = c.getContext('2d'); g.scale(R.DPR, R.DPR);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const lead = fs.party[0];
  const x0 = touch ? ZONE_W + 8 : 14;                    // left edge of the tags
  if (lead) {
    const n = lead.maxHearts, gap = n > 8 ? 21 : 26, s = n > 8 ? 17 : 20, w = 62 + n * gap;
    paperTag(g, x0, 12, w, 44, 61);
    portrait(g, A, lead.id, x0 + 26, 34, 34, false);
    hearts(g, n, lead.hearts, x0 + 62, 34, s, gap);
    fs.party.slice(1).forEach((m, i) => {
      const x = x0 + i * 78; paperTag(g, x, 62, 70, 28, 64 + i);
      portrait(g, A, m.id, x + 18, 76, 22, m.hearts <= 0);
      hearts(g, 1, m.hearts > 0 ? 1 : 0, x + 40, 76, 13, 0);
      g.fillStyle = INK; g.font = `800 15px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(String(m.hearts), x + 50, 77);
    });
    if (touch && fs.party.length > 1) {                    // L1 = previous (last in line), R1 = next
      const prev = fs.party[fs.party.length - 1], next = fs.party[1];
      portrait(g, A, prev.id, ZONE_W / 2, 34, 36, prev.hearts <= 0);
      portrait(g, A, next.id, W - ZONE_W / 2, 34, 36, next.hearts <= 0);
    }
  }
  // the right-hand tags end before the R1 zone when touch is in use
  const rx = touch ? W - ZONE_W - 8 - 122 - 10 - 58 : 640;
  // pumpkin goal marker
  paperTag(g, rx, 12, 58, 44, 62);
  const px = rx + 22;
  const pb = wob(ell(px, 36, 13, 10, 12, .08, 3), true, .5, 3); g.fillStyle = '#F4A04A'; g.fill(pb.p); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke(pb.p);
  g.beginPath(); g.moveTo(px, 26); g.lineTo(px + 2, 21); g.stroke();
  g.fillStyle = INK; g.beginPath(); g.moveTo(px + 18, 29); g.lineTo(px + 28, 35); g.lineTo(px + 18, 41); g.closePath(); g.fill();
  // candy tag
  const cx = rx + 68;
  paperTag(g, cx, 12, 122, 44, 63);
  const im = candyArt(assets), cw = 52, ch = cw * im.height / im.width; g.drawImage(im, cx + 10, 34 - ch / 2, cw, ch);
  g.fillStyle = INK; g.font = `800 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(String(fs.candyCount), cx + 92, 44);
  return c;
}

/** Draws the field HUD (screen space). inputFrame is optional; when its source is touch the tags make
 *  room for the L1 / R1 zones (the touch controls themselves are drawn by input.drawTouch). */
export function drawFieldHud(ctx, assets, fs, inputFrame) {
  const touch = !!(inputFrame && inputFrame.source === 'touch');
  const key = (touch ? 'T' : 'P') + fs.candyCount + '|' + fs.party.map(m => m.id + m.hearts + '/' + m.maxHearts).join(',');
  const cache = assets.cache.hud || (assets.cache.hud = {});
  if (cache.key !== key) { cache.c = bake(assets, fs, touch); cache.key = key; }
  ctx.drawImage(cache.c, 0, 0, W, STRIP_H);
}
