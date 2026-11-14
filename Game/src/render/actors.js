// Drawing party members and creatures, including the paper fold hinge.
// Reads member/creature state only. Sprites are baked once by prepareActors().
//
// Fold hinge (manifest hinge lines, Art/Characters/manifests): the open drawing is three paper panels
// in one frame: `top`, `under` (the inside, revealed between the hinge lines) and `bottom`.
// Folded = bottom panel shifted up by `shift` units onto the top panel. Opening slides the panels apart
// (the bottom stays on the ground, so the top rises) with a 5% stretch overshoot at the end.
// Characters without usable hinge data use the A2 flip: squash to an edge, the other form springs out.
import { INK, PAPER, FONT, mk, clamp, eOutCubic, eInOutCubic } from './core.js';
import { bakeSprite, alphaBounds, tinted, radial, paperFilled } from './sprites.js';
import { loadRig, rigPose, drawRig, drawRigFx } from './rig.js';

// Animated rigs for the walking view (see rig.js). on: false draws the bitmaps exactly as before.
// battleFx: while a clip override (opts.clip, the battle's hurt and happy) plays, also draw its stars and word pop.
// A character with no rig always uses the bitmaps. SPLIT: Scoops has two separate drawings (rigs `icecream` open and
// `icecream_folded`); they are used only when the member is settled, and a fold or unfold in progress falls back to the
// bitmap hinge flip, which hides the change of picture. FLIP: the rig art faces the opposite way to
// the bitmap, so true mirrors it when the bitmap is not mirrored.
export const RIG = { on: true, battleFx: true, clips: { monster: { still: 'idle', move: 'hop' }, fish: { still: 'idle', move: 'walk' }, icecream: { still: 'idle', move: 'walk' } }, flip: { monster: false, fish: false, icecream: false },
  split: { icecream: { open: 'icecream', folded: 'icecream_folded' } },
  // Creatures in the walking view (spider only): clip while still / while moving (patrol, chase, return); imgUnits: the
  // bitmap's full height in the rig's drawing units (spider.png is 615 px at 3.722 px per unit), so the rig is drawn at
  // the same size as the bitmap. Asleep, `still` and the battle's own creature keep the bitmap.
  creatures: { spider: { still: 'idle', move: 'walk', imgUnits: 615 / 3.722 } } };
const rigPoses = new Map();                  // one reusable pose per rig

export const FOLDED_H = 78;                  // folded height on screen (logical px)
// Task 7 additions (field only; both are drawMember options that default to off).
export const FOLLOWER_SCALE = .85;           // followers step back: drawn at 85% about their feet
const FOLLOWER_PALE = { monster: .1, fish: .15, icecream: .15 }; // paper wash baked over a paler copy (pink and red need more)
const paleWash = id => `rgba(251,248,240,${FOLLOWER_PALE[id] ?? .4})`;

// viewBoxes [x, y, w, h] and hinge numbers copied from the manifests (SVG user units).
const CHARS = {
  monster: { folded: 'monster_folded', open: 'monster_unfolded', vbF: [57, -1, 422, 287], vbO: [-9, -1, 513, 642],
    hinge: { top: 'monster_top', under: 'monster_inside', bottom: 'monster_bottom', topLine: 151.8, bottomLine: 506, shift: -354.2 } },
  fish: { folded: 'fish_folded', open: 'fish_unfolded', vbF: [55, 2, 422, 377], vbO: [0, 0, 564, 1007],
    hinge: { top: 'fish_head', under: 'fish_mid', bottom: 'fish_tail', topLine: 162.155, bottomLine: 790.075, shift: -627.9 } },
  // ice cream: the folded form is a separate drawing on the outside of the flap -> A2 flip
  icecream: { folded: 'icecream_folded', open: 'icecream_unfolded', vbF: [0, 0, 361, 431], vbO: [0, 0, 531, 838] },
};
// h: field height (logical px); fly: field hover height. Sprites are baked at BATTLE_H (the battle draws them
// about 120 px tall) and drawn scaled down in the field, so the battle enemy stays sharp.
const BATTLE_H = 130;
const CREATURES = { bat: { key: 'bat', h: 60, fly: 20 }, spider: { key: 'spider', h: 52, fly: 0 }, ghost: { key: 'ghost', h: 73, fly: 13 } };

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
      folded: { s: sF, ax: d.hinge ? (ax - d.vbF[0]) * k : sF.w / 2, foot: footF, dark: tinted(sF, 'rgba(90,60,40,.35)'), pale: tinted(sF, paleWash(id)) },
      open: { s: sO, ax: d.hinge ? (ax - d.vbO[0]) * k : sO.w / 2, foot: bO.b * sO.h, dark: tinted(sO, 'rgba(90,60,40,.35)'), pale: tinted(sO, paleWash(id)) },
      axU: ax,
    };
    if (d.hinge) {
      rec.parts = Object.fromEntries(['top', 'under', 'bottom'].map(p => [p, bakeSprite(assets.img[d.hinge[p]], sO.h)]));
      rec.parts.under = creased(rec.parts.under, d);
    }
    out.chars[id] = rec;
  }
  for (const [id, d] of Object.entries(CREATURES)) {
    // his creatures are black line art with no fill: give them a paper body so they read on the scenery
    const im = assets.img[d.key]; const s = bakeSprite(paperFilled(im, PAPER), BATTLE_H); const b = alphaBounds(im);
    out.creatures[id] = { s, ax: s.w / 2, foot: b.b * s.h, d, k: d.h / BATTLE_H };     // k: field draw scale
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

// The crease shadow where the inside meets the top panel, baked into the inside panel itself (source-atop),
// so it only darkens the paper of the panel. (Drawn as a plain rectangle it showed as a pale strip beside
// the body wherever the body is narrower than the rectangle.)
function creased(sp, d) {
  const h = d.hinge, vb = d.vbO, c = mk(sp.c.width, sp.c.height), g = c.getContext('2d'), k = c.height / vb[3];
  g.drawImage(sp.c, 0, 0); g.globalCompositeOperation = 'source-atop';
  const y0 = (h.topLine - vb[1]) * k, y1 = y0 + 12 * k;
  const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(90,60,40,.24)'); gr.addColorStop(1, 'rgba(90,60,40,0)');
  g.fillStyle = gr; g.fillRect(c.width * .2, y0, c.width * .6, y1 - y0);
  return { c, w: sp.w, h: sp.h };
}

// Hinge curves. u 0..1 is the hinge clock (foldAnim). Returns { o: 0 folded .. 1 open, sx, sy } where sx, sy
// scale the drawing about its feet (stretch and squash).
// 'field' (0.5 s): ease-out open with a 5% stretch overshoot at the end; ease-in-out close with a small dip.
// 'battle' (0.8 s): a short anticipation squash, a fast open, an overshoot stretch, then a damped settle;
//   closing mirrors it (a little stretch up, a fast snap shut, a squash that settles).
export function hingeCurve(form, u, pace = 'field') {
  u = clamp(u);
  if (pace === 'battle') {
    const wobble = v => Math.exp(-v * 5.5) * Math.cos(v * Math.PI * 2.6);             // 1 -> damped -> 0
    if (form === 'open') {
      if (u < .14) { const q = Math.sin(u / .14 * Math.PI / 2); return { o: 0, sy: 1 - .12 * q, sx: 1 + .1 * q }; }
      if (u < .4) { const v = (u - .14) / .26, o = 1.12 * (1 - (1 - v) * (1 - v) * (1 - v)); const sy = Math.max(1 - .12 * (1 - v) * (1 - v), o > 1 ? o : 1); return { o: Math.min(1, o), sy, sx: 1 / (2 - sy) }; }
      const sy = 1 + .12 * wobble((u - .4) / .6); return { o: 1, sy, sx: sy >= 1 ? 1 / (2 - sy) : 1 + (1 - sy) * .8 };
    }
    if (u < .12) { const q = Math.sin(u / .12 * Math.PI / 2); return { o: 1, sy: 1 + .05 * q, sx: 1 - .03 * q }; }
    if (u < .36) { const v = (u - .12) / .24; return { o: 1 - v * v, sy: 1 + .05 * (1 - v), sx: 1 / (1.95 - .05 * v) }; }
    const sy = 1 - .12 * wobble((u - .36) / .64); return { o: 0, sy, sx: sy >= 1 ? 1 / (2 - sy) : 1 + (1 - sy) * .8 };
  }
  if (form === 'open') {
    const o = u < .75 ? 1.05 * eOutCubic(u / .75) : 1.05 - .05 * eInOutCubic((u - .75) / .25);
    const sy = Math.max(1, o); return { o: Math.min(1, o), sy, sx: 1 / (2 - sy) };
  }
  const o = 1 - eInOutCubic(u), sy = u > .85 ? 1 - .06 * Math.sin((u - .85) / .15 * Math.PI) : 1;
  return { o, sy, sx: 1 / (2 - sy) };
}

function drawHinge(ctx, r, form, u, pace) {
  const { o, sx, sy } = hingeCurve(form, u, pace); const h = r.d.hinge, vb = r.d.vbO, P = r.parts;
  const off = h.shift * (1 - o);
  ctx.scale(sx, sy);
  ctx.scale(r.k, r.k); ctx.translate(-r.axU, -(r.openFootU + off));
  const gap = h.bottomLine + off - h.topLine;
  if (gap > .5) {
    ctx.save(); ctx.beginPath(); ctx.rect(vb[0] - 50, h.topLine, vb[2] + 100, gap); ctx.clip();
    ctx.drawImage(P.under.c, vb[0], vb[1], vb[2], vb[3]); ctx.restore();
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

/** Draws a party member with feet at (sx, sy) in the current transform. Returns true when an opts.clip override played.
 *  opts: { alpha = 1, shadow = true, lead = false (draws the back/front facing marker),
 *          pace = 'field' | 'battle' (which hinge curve; see hingeCurve),
 *          follower = false (field: smaller and paler, see FOLLOWER_SCALE),
 *          pop = 1 (extra scale about the feet, e.g. the swap pop) } */
export function drawMember(ctx, assets, member, sx, sy, timeMs, opts = {}) {
  const A = prepareActors(assets); const r = A.chars[member.id]; if (!r) return;
  const sp = RIG.split[member.id];
  const rig = !RIG.on ? null : sp ? (member.foldAnim >= 1 ? loadRig(assets, sp[member.form === 'open' ? 'open' : 'folded']) : null) : loadRig(assets, member.id);
  const settled = member.foldAnim >= 1, u = clamp(member.foldAnim);
  const v = member.form === 'open' ? r.open : r.folded;
  const ph = member.id.length * 1.7, w = .00692;
  const lift = member.moving && settled ? Math.abs(Math.sin(timeMs * w + ph)) * 4 : 0;
  const tilt = member.moving && settled ? Math.sin(timeMs * w + ph) * .05 : 0;
  const fol = !!opts.follower, ks = (fol ? FOLLOWER_SCALE : 1) * (opts.pop || 1);
  if (opts.shadow !== false) { const sw = r.folded.s.w * .75 * ks; ctx.drawImage(A.shadow.c, sx - sw / 2, sy - 7 * ks, sw, 14 * ks); }
  if (opts.lead && (member.facing === 'back' || member.facing === 'front')) drawFacingMarker(ctx, sx, sy, member.facing);
  if (rig) return drawMemberRig(ctx, rig, r, member, sx, sy, timeMs, opts, ks, fol);
  ctx.save(); if (opts.alpha != null && opts.alpha < 1) ctx.globalAlpha *= opts.alpha;
  ctx.translate(sx, sy - lift * ks); if (tilt) ctx.rotate(tilt); ctx.scale(member.faceX < 0 ? -ks : ks, ks);
  if (settled) drawRec(ctx, v, fol ? v.pale : v.s);
  else if (r.parts) drawHinge(ctx, r, member.form, u, opts.pace);
  else drawFlip(ctx, r, member.form, u);
  ctx.restore();
}

// The body from the rig. Same feet point and the same px per drawing unit as the bitmaps (r.k), so the folded
// and open heights match. form: the hinge's open amount (0 folded .. 1 open) from the same hingeCurve.
function drawMemberRig(ctx, rig, r, member, sx, sy, timeMs, opts, ks, fol) {
  const o = member.foldAnim >= 1 ? (member.form === 'open' ? 1 : 0) : hingeCurve(member.form, clamp(member.foldAnim), opts.pace).o;
  const cl = RIG.clips[member.id] || {}, t = timeMs / 1000;
  let pose = rigPoses.get(rig); let clip = member.moving ? cl.move : cl.still, ct = t;
  const ov = opts.clip, cd = ov && rig.clips[ov.name], over = !!cd && cd.forms.includes(o >= .5 ? 1 : 0);
  if (over) { clip = ov.name; ct = ov.t; }
  pose = rigPose(rig, clip, ct, { form: clamp(o), T: t }, pose); rigPoses.set(rig, pose);
  let a = opts.alpha != null ? opts.alpha : 1; if (fol) a *= .85;
  const flip = (member.faceX < 0) !== !!RIG.flip[member.id];
  drawRig(ctx, rig, pose, sx, sy, r.k * ks, { flip, alpha: a, shadow: false, glow: false, flash: opts.flash !== false });
  if (over && RIG.battleFx) drawRigFx(ctx, rig, pose, sx, sy, r.k * ks, { flip });
  return over;
}

function drawFacingMarker(ctx, x, y, facing) {
  const d = facing === 'back' ? -1 : 1, cy = y + (d > 0 ? 12 : -2);
  // A small solid ink arrowhead with a paper edge: a pointer, not an outlined triangle (that would read as the Triangle button).
  ctx.save(); ctx.fillStyle = INK; ctx.strokeStyle = '#FBF8F0'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - 6, cy - 2 * d); ctx.lineTo(x + 6, cy - 2 * d); ctx.lineTo(x, cy + 5 * d); ctx.closePath();
  ctx.stroke(); ctx.fill(); ctx.restore();
}

/** Draws a creature with feet (its ground spot) at (sx, sy), at its field size (CREATURES[kind].h; scale the
 *  context to draw it bigger, the sprite is baked for the battle size). Asleep: lies tilted with a small Z.
 *  opts: { still: true } stands it on the ground without hovering, flapping or Zs (the battle's knocked-over pose);
 *        { shadow: false } leaves out its ground shadow. */
export function drawCreature(ctx, assets, creature, sx, sy, timeMs, opts = {}) {
  const A = prepareActors(assets); const r = A.creatures[creature.kind]; if (!r) return;
  const k = r.k, w = r.s.w * k, h = r.s.h * k;
  const seed = (creature.uid ? String(creature.uid).length * 3.1 : 0) + sx * .01;
  const asleep = creature.mode === 'asleep', still = !!opts.still;
  const lift = asleep || still ? 0 : r.d.fly + Math.sin(timeMs * .006 + seed) * (r.d.fly ? 5 : 0);
  const sw = w * (asleep || still ? .8 : r.d.fly ? .5 : .7);
  if (opts.shadow !== false) {
    ctx.globalAlpha = r.d.fly && !asleep && !still ? .7 : 1;
    ctx.drawImage(A.shadow.c, sx - sw / 2, sy - 6, sw, 12); ctx.globalAlpha = 1;
  }
  const rc = RIG.on && !asleep && !still && creature.uid !== 'battle' ? RIG.creatures[creature.kind] : null;
  const rig = rc ? loadRig(assets, creature.kind) : null;
  if (rig) {
    const t = timeMs / 1000 + seed, moving = creature.mode === 'patrol' || creature.mode === 'chase' || creature.mode === 'return';
    let pose = rigPoses.get(rig);          // form: 1 = the spider rig's "grounded" (no thread, body lowered to the ground)
    pose = rigPose(rig, moving ? rc.move : rc.still, t, { T: t, form: 1 }, pose); rigPoses.set(rig, pose);
    drawRig(ctx, rig, pose, sx, sy - (rc.hover ? r.d.fly : 0), r.d.h / rc.imgUnits, { flip: creature.faceX < 0, shadow: false, glow: false });   // hover: the rig floats by the creature's fly height (its own bob replaces the bitmap's)
    return;
  }
  ctx.save(); ctx.translate(sx, sy - lift);
  if (asleep) { ctx.rotate(.5 * (creature.faceX < 0 ? -1 : 1)); ctx.scale(1, .92); }
  else if (r.d.fly && !still) ctx.scale(1, 1 + Math.sin(timeMs * .03 + seed) * .07);          // wing flap
  ctx.scale(creature.faceX < 0 ? -k : k, k);
  drawRec(ctx, r); ctx.restore();
  if (asleep) {
    ctx.save(); ctx.fillStyle = INK; ctx.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const u = ((timeMs / 1600) + i * .5) % 1;
      ctx.globalAlpha = Math.sin(u * Math.PI); ctx.font = `800 ${10 + u * 8}px ${FONT}`;
      ctx.fillText('Z', sx + w * .3 + u * 12, sy - h * .7 - u * 24);
    }
    ctx.restore();
  }
}

/** A creature's field-size box { w, h } (logical px). */
export function creatureSize(assets, kind) {
  const r = prepareActors(assets).creatures[kind]; return r ? { w: r.s.w * r.k, h: r.s.h * r.k } : { w: 50, h: 50 };
}
