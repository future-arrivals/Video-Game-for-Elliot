// Drawing party members and creatures, including the paper fold hinge.
// Reads member/creature state only. Sprites are baked once by prepareActors().
//
// Fold hinge (manifest hinge lines, Art/Characters/manifests): the open drawing is three paper panels
// in one frame: `top`, `under` (the inside, revealed between the hinge lines) and `bottom`.
// Folded = bottom panel shifted up by `shift` units onto the top panel. Opening slides the panels apart
// (the bottom stays on the ground, so the top rises) with a 5% stretch overshoot at the end.
// Characters without usable hinge data use the A2 flip: squash to an edge, the other form springs out.
import { INK, FONT, clamp, eOutCubic, eInOutCubic } from './core.js';
import { bakeSprite, alphaBounds, tinted, radial } from './sprites.js';

export const FOLDED_H = 78;                  // folded height on screen (logical px)

// viewBoxes [x, y, w, h] and hinge numbers copied from the manifests (SVG user units).
const CHARS = {
  monster: { folded: 'monster_folded', open: 'monster_unfolded', vbF: [57, -1, 422, 287], vbO: [-9, -1, 513, 642],
    hinge: { top: 'monster_top', under: 'monster_inside', bottom: 'monster_bottom', topLine: 151.8, bottomLine: 506, shift: -354.2 } },
  fish: { folded: 'fish_folded', open: 'fish_unfolded', vbF: [55, 2, 422, 377], vbO: [0, 0, 564, 1007],
    hinge: { top: 'fish_head', under: 'fish_mid', bottom: 'fish_tail', topLine: 162.155, bottomLine: 790.075, shift: -627.9 } },
  // ice cream: the folded form is a separate drawing on the outside of the flap -> A2 flip
  icecream: { folded: 'icecream_folded', open: 'icecream_unfolded', vbF: [0, 0, 361, 431], vbO: [0, 0, 531, 838] },
};
const CREATURES = { bat: { key: 'bat', h: 46, fly: 16 }, spider: { key: 'spider', h: 40, fly: 0 }, ghost: { key: 'ghost', h: 56, fly: 10 } };

/** Bakes every actor sprite once. Stores into assets.cache.actors. */
export function prepareActors(assets) {
  if (assets.cache.actors) return assets.cache.actors;
  const out = { chars: {}, creatures: {} };
  for (const [id, d] of Object.entries(CHARS)) {
    const k = FOLDED_H / d.vbF[3];                                   // display px per SVG unit, both forms
    const imF = assets.img[d.folded], imO = assets.img[d.open];
    const bO = alphaBounds(imO), bF = alphaBounds(imF);
    const openFootU = d.vbO[1] + bO.b * d.vbO[3];
    const ax = d.hinge ? d.vbF[0] + d.vbF[2] / 2 : null;              // shared frame: anchor on the folded centre
    const footF = d.hinge ? (openFootU + d.hinge.shift - d.vbF[1]) * k : bF.b * FOLDED_H;
    const sF = bakeSprite(imF, d.vbF[3] * k), sO = bakeSprite(imO, d.vbO[3] * k);
    const rec = {
      k, d, openFootU,
      folded: { s: sF, ax: d.hinge ? (ax - d.vbF[0]) * k : sF.w / 2, foot: footF, dark: tinted(sF, 'rgba(90,60,40,.35)') },
      open: { s: sO, ax: d.hinge ? (ax - d.vbO[0]) * k : sO.w / 2, foot: bO.b * sO.h, dark: tinted(sO, 'rgba(90,60,40,.35)') },
      axU: ax,
    };
    if (d.hinge) rec.parts = Object.fromEntries(['top', 'under', 'bottom'].map(p => [p, bakeSprite(assets.img[d.hinge[p]], sO.h)]));
    out.chars[id] = rec;
  }
  for (const [id, d] of Object.entries(CREATURES)) {
    const im = assets.img[d.key]; const s = bakeSprite(im, d.h); const b = alphaBounds(im);
    out.creatures[id] = { s, ax: s.w / 2, foot: b.b * s.h, d };
  }
  out.shadow = radial(60, 18, [[0, 'rgba(70,50,30,.38)'], [.6, 'rgba(70,50,30,.16)'], [1, 'rgba(70,50,30,0)']]);
  return (assets.cache.actors = out);
}

/** Approximate on-screen box {w, h} of a member right now (for depth fading). */
export function memberSize(assets, member) {
  const r = prepareActors(assets).chars[member.id]; if (!r) return { w: 60, h: FOLDED_H };
  const v = (member.form === 'open') === (member.foldAnim >= .5) ? r.open : r.folded;
  return { w: v.s.w * .8, h: v.s.h };
}

function drawRec(ctx, v, s = v.s) { ctx.drawImage(s.c, -v.ax, -v.foot, s.w, s.h); }

// openness curve: 0 folded .. 1 open; stretch is the extra vertical scale (5% overshoot when opening)
function openness(form, u) {
  if (form === 'open') {
    const o = u < .75 ? 1.05 * eOutCubic(u / .75) : 1.05 - .05 * eInOutCubic((u - .75) / .25);
    return { o: Math.min(1, o), sy: Math.max(1, o) };
  }
  const o = 1 - eInOutCubic(u);
  return { o, sy: u > .85 ? 1 - .06 * Math.sin((u - .85) / .15 * Math.PI) : 1 };
}

function drawHinge(ctx, r, form, u) {
  const { o, sy } = openness(form, u); const h = r.d.hinge, vb = r.d.vbO, P = r.parts;
  const off = h.shift * (1 - o);
  ctx.scale(1 / (2 - sy), sy);                                       // slight thinning while stretched
  ctx.scale(r.k, r.k); ctx.translate(-r.axU, -(r.openFootU + off));
  const gap = h.bottomLine + off - h.topLine;
  if (gap > .5) {
    ctx.save(); ctx.beginPath(); ctx.rect(vb[0] - 50, h.topLine, vb[2] + 100, gap); ctx.clip();
    ctx.drawImage(P.under.c, vb[0], vb[1], vb[2], vb[3]); ctx.restore();
    // the crease shadow where the inside meets the top panel
    ctx.fillStyle = 'rgba(90,60,40,.18)'; ctx.fillRect(vb[0] + vb[2] * .25, h.topLine, vb[2] * .5, Math.min(gap, 10));
  }
  ctx.drawImage(P.bottom.c, vb[0], vb[1] + off, vb[2], vb[3]);
  ctx.drawImage(P.top.c, vb[0], vb[1], vb[2], vb[3]);
}

function drawFlip(ctx, r, form, u) {
  const from = form === 'open' ? r.folded : r.open, to = form === 'open' ? r.open : r.folded;
  if (u < .2) { const q = eOutCubic(u / .2); ctx.scale(1 + .14 * q, 1 - .2 * q); drawRec(ctx, from); }
  else if (u < .4) { const q = (u - .2) / .2; ctx.scale(1.14, .8 * (1 - q) + .02); drawRec(ctx, from, from.dark); }
  else {
    const v = (u - .4) / .6; let sy;
    if (v < .35) sy = .05 + 1.13 * eOutCubic(v / .35);
    else { const d = (v - .35) * 1000; sy = 1 + .18 * Math.exp(-d * .009) * Math.cos(d * .03); }
    ctx.scale(clamp(1 - (sy - 1) * .55, .9, 1.25), sy); drawRec(ctx, to);
  }
}

/** Draws a party member with feet at (sx, sy) in the current transform.
 *  opts: { alpha = 1, shadow = true, lead = false (draws the back/front facing marker) } */
export function drawMember(ctx, assets, member, sx, sy, timeMs, opts = {}) {
  const A = prepareActors(assets); const r = A.chars[member.id]; if (!r) return;
  const settled = member.foldAnim >= 1, u = clamp(member.foldAnim);
  const v = member.form === 'open' ? r.open : r.folded;
  const ph = member.id.length * 1.7, w = .00692;
  const lift = member.moving && settled ? Math.abs(Math.sin(timeMs * w + ph)) * 4 : 0;
  const tilt = member.moving && settled ? Math.sin(timeMs * w + ph) * .05 : 0;
  if (opts.shadow !== false) { const sw = r.folded.s.w * .75; ctx.drawImage(A.shadow.c, sx - sw / 2, sy - 7, sw, 14); }
  if (opts.lead && (member.facing === 'back' || member.facing === 'front')) drawFacingMarker(ctx, sx, sy, member.facing);
  ctx.save(); if (opts.alpha != null && opts.alpha < 1) ctx.globalAlpha *= opts.alpha;
  ctx.translate(sx, sy - lift); if (tilt) ctx.rotate(tilt); ctx.scale(member.faceX < 0 ? -1 : 1, 1);
  if (settled) drawRec(ctx, v);
  else if (r.parts) drawHinge(ctx, r, member.form, u);
  else drawFlip(ctx, r, member.form, u);
  ctx.restore();
}

function drawFacingMarker(ctx, x, y, facing) {
  const d = facing === 'back' ? -1 : 1, cy = y + (d > 0 ? 12 : -2);
  ctx.save(); ctx.fillStyle = '#FFF1A8'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - 8, cy - 3 * d); ctx.lineTo(x + 8, cy - 3 * d); ctx.lineTo(x, cy + 6 * d); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.restore();
}

/** Draws a creature with feet (its ground spot) at (sx, sy). Asleep: lies tilted with a small Z. */
export function drawCreature(ctx, assets, creature, sx, sy, timeMs) {
  const A = prepareActors(assets); const r = A.creatures[creature.kind]; if (!r) return;
  const seed = (creature.uid ? String(creature.uid).length * 3.1 : 0) + sx * .01;
  const asleep = creature.mode === 'asleep';
  const lift = asleep ? 0 : r.d.fly + Math.sin(timeMs * .006 + seed) * (r.d.fly ? 5 : 0);
  const sw = r.s.w * (asleep ? .8 : r.d.fly ? .5 : .7);
  ctx.globalAlpha = r.d.fly && !asleep ? .7 : 1;
  ctx.drawImage(A.shadow.c, sx - sw / 2, sy - 6, sw, 12); ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(sx, sy - lift);
  if (asleep) { ctx.rotate(.5 * (creature.faceX < 0 ? -1 : 1)); ctx.scale(1, .92); }
  else if (r.d.fly) ctx.scale(1, 1 + Math.sin(timeMs * .03 + seed) * .07);          // wing flap
  ctx.scale(creature.faceX < 0 ? -1 : 1, 1);
  drawRec(ctx, r); ctx.restore();
  if (asleep) {
    ctx.save(); ctx.fillStyle = INK; ctx.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const u = ((timeMs / 1600) + i * .5) % 1;
      ctx.globalAlpha = Math.sin(u * Math.PI); ctx.font = `800 ${10 + u * 8}px ${FONT}`;
      ctx.fillText('Z', sx + r.s.w * .3 + u * 12, sy - r.s.h * .7 - u * 24);
    }
    ctx.restore();
  }
}
