// Stage view: bakes one stage's layers once, then draws any FieldState live (read-only).
// Ink (black marker, full colour) = matters to play: hedges, boulders, candy, rest blanket, creatures,
// characters. Pale pencil = scenery: back fence, pumpkins, tufts, cart, scarecrow...
import { W, H, R, TILE_W, wx, wy, rng } from './core.js';
import { drawProp } from './props.js';
import { blit } from './sprites.js';
import { prepareActors, drawMember, drawCreature, memberSize } from './actors.js';
import { bakeSky, bakeFar, bakeMid, bakeLight, bakeForeground, bakeCornerFrame } from './layers.js';
import { placeScenery, placeInk, bakeGround, CHUNK_W, CHUNK_Y0, CHUNK_Y1 } from './stagebake.js';
import { prepareRibbons } from './water.js';
import { bakeObjects, drawFlatObjects, pushObjectItems, drawFriend, pushBossItems, drawBoss, drawLittle } from './stageobjs.js';
import { boulderAt, drawBridge, drawReach, hidesLead } from './fieldfx.js';
import { bakeMarks, leadState, drawLeadRing, drawCrumbs, drawTargetOutline, drawTargetBadge, readDevMarks } from './fieldmarks.js';

const PUMPKIN_SCALE = { S1: .4, S2: .55, S3: .7, S4: .8, S5: .9, S6: 1.15 };   // S6: as big as still hides fully behind the pumpkin-house standee
const PUMPKIN_PX = stageW => stageW * .25 - 60;   // far-sheet x of the landmark (on screen near the stage's right end)
// A stage with the giant pumpkin standee (S6): the far landmark is placed so that, with the camera at the
// stage's right end, it sits exactly behind the standee; walking right, the near pumpkin slides over the far one.
const pumpkinPx = (stage, stageW) => {
  if (!stage.pumpkin || !stage.pumpkin.length) return PUMPKIN_PX(stageW);
  const is = stage.pumpkin.map(p => p[0]), cx = wx((Math.min(...is) + Math.max(...is) + 1) / 2);
  return cx - .75 * (stageW - W / 2);
};
// S7 (the ghost house at night): a dark blue-purple wash over the sky, far and mid sheets and the ground, laid
// BEFORE the team, the boss, the blanket and the exit are drawn, so those stay in full ink and colour.
const NIGHT = { S7: { wash: 'rgba(28,20,96,.64)' } };
const EERIE = { S5: true, S7: true };                        // S5 Ghost Field: a cooler light overlay (layers.js bakeLight)
const DRIFT_LEAF = { fill: 'rgba(232,206,170,.55)', line: 'rgba(170,150,120,.45)', lw: 1 };  // drifting leaves are scenery: pale pencil, no ink
const TUFT = { col: '#9fbf7f', lw: 2 };   // item 2: tufts quieter (were #9fbf7f, 2 px)
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

/** Bakes sky, far sheet, mid sheet, ground chunks and props for a Stage. */
export function createStageView(stage, assets) {
  const stageW = stage.width * TILE_W, seed = hash(stage.id);
  const actors = prepareActors(assets);
  const view = { stage, stageW, assets, actors, sky: bakeSky(), light: bakeLight(false, { eerie: !!EERIE[stage.id] }),
    far: bakeFar(stageW, PUMPKIN_SCALE[stage.id] ?? .4, pumpkinPx(stage, stageW), 9, { depth: true }),
    mid: bakeMid(stageW, { depth: true }), fg: bakeForeground(stageW, seed + 1), frame: bakeCornerFrame(),
    props: [], flat: [], tufts: [], chunks: [] };
  view.ribbons = prepareRibbons(stage, seed);
  placeScenery(view, stage, seed, view.ribbons.flatMap(rb => rb.tiles));
  placeInk(view, stage, seed, assets);
  bakeObjects(view, stage, assets);
  bakeGround(view, stage, seed);
  view.marks = bakeMarks(stage);
  const dev = readDevMarks();                       // dev query: target=20,1&ready=1 / eaten=1
  view.devTarget = dev.target || null; view.devEaten = !!dev.eaten;
  return view;
}

/** The scene tells the view where a boulder was just eaten (the 'eat' event): crumbs go there. */
export function noteEaten(view, i, j) { eatenTiles(view, null).add(i + ',' + j); }

// Tiles where a boulder was eaten. Noted from 'eat' events; for a FieldState the view has not drawn before
// (a new stage visit or a reload) the start tiles with no boulder count as eaten only when every one of
// them is explained by eating (boulders at the start - live boulders - stones >= missing), so a pushed
// boulder never leaves crumbs; when it is unclear, no crumbs.
function eatenTiles(view, fs) {
  if (!view.eaten) view.eaten = new Set();
  if (!fs || view.eatenFor === fs) return view.eaten;
  view.eatenFor = fs;
  const st = view.stage.boulders, live = fs.boulders || [];
  const missing = st.filter(([i, j]) => !live.some(b => b.i === i && b.j === j));
  if (view.devEaten) for (const [i, j] of st) view.eaten.add(i + ',' + j);
  else if (st.length - live.length - (fs.stones || []).length >= missing.length) for (const [i, j] of missing) view.eaten.add(i + ',' + j);
  return view.eaten;
}

// ---------------------------------------------------------------- per frame
function drawLayer(ctx, L, cam) {
  const zf = 1 + (cam.z - 1) * L.f;
  const sx = -cam.cx * L.f * zf + W / 2, sy = (-195 - (cam.cy - 195) * L.f) * zf + H / 2;
  ctx.drawImage(L.c, sx + L.X0 * zf, sy + L.Y0 * zf, L.c.width / R.DPR * zf, L.c.height / R.DPR * zf);
}
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Draws everything in the field except the HUD. cam: {cx, cy, z[, shakeX, shakeY]}. */
export function renderStage(ctx, view, fs, cam, timeMs) {
  const t = timeMs, A = view.actors;
  ctx.save();
  // sky wash: only the band above the ground sheet (at zoom >= .85 the sheet's top edge is below y 135)
  ctx.drawImage(view.sky, 0, 0, view.sky.width, view.sky.height * 140 / H, 0, 0, W, 140);
  ctx.translate(cam.shakeX || 0, cam.shakeY || 0);
  drawLayer(ctx, view.far, cam);
  { // a bat crosses the far sheet every 6 s
    const u = (t / 6000) % 1, zf = 1 + (cam.z - 1) * .25, bs = A.creatures.bat.s;
    const bx = (view.far.X0 + 200 + u * (view.far.c.width / R.DPR - 400) - cam.cx * .25) * zf + W / 2;
    const by = (24 + Math.sin(u * 30) * 6 - 195 - (cam.cy - 195) * .25) * zf + H / 2;
    const fk = 20.7 / bs.h;                                // about 21 px tall, whatever size the sprite is baked at
    blit(ctx, bs, bx, by, fk, fk * (1 + Math.sin(t * .03) * .1), 0, .5);
  }
  drawLayer(ctx, view.mid, cam);
  const night = NIGHT[view.stage.id];
  if (night) { ctx.fillStyle = night.wash; ctx.fillRect(0, 0, W, H); }
  view.t = t;
  // playfield, world px
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.cx, -cam.cy);
  const vx0 = cam.cx - W / 2 / cam.z - 80, vx1 = cam.cx + W / 2 / cam.z + 80;
  for (const ch of view.chunks) if (ch.x0 + CHUNK_W > vx0 && ch.x0 < vx1) ctx.drawImage(ch.c, ch.x0 - 2, CHUNK_Y0, CHUNK_W + 4, CHUNK_Y1 - CHUNK_Y0);
  if (night) { ctx.fillStyle = night.wash; ctx.fillRect(vx0, 80, vx1 - vx0, CHUNK_Y1 - 80); }
  for (const p of view.flat) drawProp(ctx, p);
  drawFlatObjects(ctx, view, fs);
  // eaten boulders leave pencil crumbs; a pushed one does not (dev: eaten=1 pretends every boulder was eaten)
  const boulders = view.devEaten ? [] : fs.boulders;
  for (const k of eatenTiles(view, fs)) { const [i, j] = k.split(',').map(Number); if (!boulders.some(b => b.i === i && b.j === j)) drawCrumbs(ctx, view.marks, i, j); }
  const target = view.devEaten || fs.action ? null : (fs.target || view.devTarget);   // no outline while a power plays out
  const ls = leadState(view.marks, fs);
  // the lead's box, for fading standees in front of it
  const lead = fs.party[0];
  let leadBox = null;
  if (lead) { const sz = memberSize(view.assets, lead), x = wx(lead.x), y = wy(lead.y); leadBox = [x - sz.w / 2, y - sz.h, x + sz.w / 2, y]; }
  const items = [];
  for (const p of view.props) if (p.bb[2] > vx0 && p.bb[0] < vx1) items.push({ y: p.y, p });
  for (const b of boulders) { const q = boulderAt(view, fs, b); if (q) items.push({ y: q.p.y + q.dy, p: q.p, sx: q.dx, sy: q.dy }); }
  fs.candy.forEach((c, n) => { if (!c.taken) { const p = view.candySprites.get(c.i + ',' + c.j); if (p) items.push({ y: p.y, p, bob: Math.sin(t * .004 + n * 1.7) * 3 }); } });
  for (const tf of view.tufts) if (tf.x > vx0 && tf.x < vx1) items.push({ y: tf.y, tf });
  pushObjectItems(view, fs, items, t, vx0, vx1);
  pushBossItems(view, fs, items);
  for (const c of fs.creatures) items.push({ y: wy(c.y), c });
  const hide = hidesLead(fs);                               // the fish is the bridge: drawBridge draws it
  fs.party.forEach((m, n) => { if (!(n === 0 && hide)) items.push({ y: wy(m.y) + (n === 0 ? .01 : 0), m, lead: n === 0 }); });
  if (target) items.push({ y: wy(target.j + .95), target });     // just in front of the target's row (its hedges)
  items.sort((a, b) => a.y - b.y);
  drawBridge(ctx, fs, t);                                   // flat on the water, under everyone crossing
  ctx.lineCap = 'round';
  for (const it of items) {
    if (it.p) {
      const b = it.p.bb, sx = it.sx || 0, sy = it.sy || 0;       // a moved boulder borrows a sprite baked elsewhere: shift its box
      const fade = leadBox && it.p.standee && it.y > leadBox[3] && overlaps([b[0] + sx, b[1] + sy, b[2] + sx, b[3] + sy], leadBox);
      if (it.sx || it.sy) { ctx.save(); ctx.translate(it.sx, it.sy); drawProp(ctx, it.p, it.bob || 0, fade ? .5 : 1); ctx.restore(); }
      else drawProp(ctx, it.p, it.bob || 0, fade ? .5 : 1);
    } else if (it.tf) {
      const tf = it.tf, sw = Math.sin(t * .0032 + tf.ph + tf.x * .01) * .16;
      ctx.strokeStyle = TUFT.col; ctx.lineWidth = TUFT.lw;
      for (let b = -1; b <= 1; b++) { const ang = sw + b * .45; ctx.beginPath(); ctx.moveTo(tf.x + b * 3, tf.y); ctx.quadraticCurveTo(tf.x + b * 3 + Math.sin(ang) * 5 * tf.s, tf.y - 6 * tf.s, tf.x + b * 3 + Math.sin(ang) * 10 * tf.s, tf.y - 12 * tf.s * Math.cos(ang)); ctx.stroke(); }
    } else if (it.boss) drawBoss(ctx, view, fs, t);
    else if (it.little !== undefined) drawLittle(ctx, view, fs, it.little, t);
    else if (it.c) drawCreature(ctx, view.assets, it.c, wx(it.c.x), wy(it.c.y), t);
    else if (it.target) drawTargetOutline(ctx, view, fs, it.target);
    else if (it.friend) drawFriend(ctx, view, it.friend, t);
    else {
      const x = wx(it.m.x), y = wy(it.m.y);
      if (it.lead) drawLeadRing(ctx, view.marks, x, y, ls.draw);
      drawMember(ctx, view.assets, it.m, x, y, t, it.lead ? { lead: true, pop: ls.pop } : { follower: true });
    }
  }
  drawReach(ctx, fs);
  if (target) { drawTargetOutline(ctx, view, fs, target, true); drawTargetBadge(ctx, view, fs, target); }
  ctx.restore();
  // foreground, pre-blurred, parallax 1.4
  { const f = 1.4, zf = 1 + (cam.z - 1) * f;
    for (const o of view.fg) { const x = (o.x - cam.cx * f) * zf + W / 2; if (x < -200 || x > W + 200) continue;
      ctx.save(); ctx.translate(x, H + o.dy * zf + (cam.cy - 195) * -.4); if (o.flip) ctx.scale(-1, 1); ctx.drawImage(o.s.c, -o.s.w * zf / 2, -o.s.h * zf, o.s.w * zf, o.s.h * zf); ctx.restore(); } }
  // the frame: darker pre-blurred clumps fixed in the bottom corners
  for (const o of view.frame) ctx.drawImage(o.s.c, o.x, o.y - o.s.h, o.s.w, o.s.h);
  ctx.restore();
  // light, dust motes, drifting leaves (screen space)
  ctx.drawImage(view.light, 0, 0, W, H);
  ctx.fillStyle = '#FFF4D0';
  for (let i = 0; i < 22; i++) { const r = rng(100 + i), bx = r() * W, by = r() * H; const x = (bx + t * (.012 + r() * .02) - cam.cx * .3) % (W + 40); const y = by + Math.sin(t * .0012 + i) * 14; ctx.globalAlpha = .25 + .35 * (Math.sin(t * .003 + i * 2) * .5 + .5); ctx.beginPath(); ctx.arc((x + W + 40) % (W + 40) - 20, y, 1.2 + r() * 1.6, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) { const x = ((i * 260 + t * .07) % (W + 120)) - 60, y = ((i * 97 + t * .03) % (H + 60)) - 30 + Math.sin(t * .002 + i) * 18; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .003 + i) * 1.2); ctx.fillStyle = DRIFT_LEAF.fill; ctx.strokeStyle = DRIFT_LEAF.line; ctx.lineWidth = DRIFT_LEAF.lw; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
}
