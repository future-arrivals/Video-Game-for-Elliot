// Stage view: bakes one stage's layers once, then draws any FieldState live (read-only).
// Ink (black marker, full colour) = matters to play: hedges, boulders, candy, rest blanket, creatures,
// characters. Pale pencil = scenery: back fence, pumpkins, tufts, cart, scarecrow...
import { W, H, R, PAPER, PEN, TILE_W, wx, wy, mk, rng, clamp, wob } from './core.js';
import { makeProp, drawParts, bakeProp, drawProp } from './props.js';
import { blit, candyArt } from './sprites.js';
import { prepareActors, drawMember, drawCreature, memberSize } from './actors.js';
import { bakeSky, bakeFar, bakeMid, bakeLight, bakeForeground } from './layers.js';

const PUMPKIN_SCALE = { S1: .4, S2: .55, S3: .7, S4: .8, S5: .9, S6: 1.3 };
const CHUNK_W = 600, CHUNK_Y0 = 0, CHUNK_Y1 = 430;
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

/** Bakes sky, far sheet, mid sheet, ground chunks and props for a Stage. */
export function createStageView(stage, assets) {
  const stageW = stage.width * TILE_W, seed = hash(stage.id);
  const actors = prepareActors(assets);
  const view = { stage, stageW, assets, actors, sky: bakeSky(), light: bakeLight(false),
    far: bakeFar(stageW, PUMPKIN_SCALE[stage.id] ?? .4, stageW * .25 - 60),
    mid: bakeMid(stageW), fg: bakeForeground(stageW, seed + 1), props: [], flat: [], tufts: [], chunks: [] };
  placeScenery(view, stage, seed);
  placeInk(view, stage, seed, assets);
  bakeGround(view, stage, seed);
  return view;
}

// ---------------------------------------------------------------- placement
function placeScenery(view, stage, seed) {
  const r = rng(seed), taken = new Set(), key = (i, j) => i + ',' + j;
  const keep = new Set();              // tiles that must stay clear: specials and their neighbours' pickups
  for (const list of [stage.candy, stage.rest, stage.boulders, stage.hedges, [stage.start], stage.spawns.map(s => s.at), stage.exits.map(e => e.at)])
    for (const [i, j] of list) keep.add(key(i, j));
  for (const [i, j] of [...stage.candy, ...stage.rest, stage.start]) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) keep.add(key(i + di, j + dj));
  const free = (i, j) => stage.tileAt(i, j) === '.' && !keep.has(key(i, j)) && !taken.has(key(i, j));
  const add = (k, x, y, s, ink) => { const p = makeProp(k, x, y, s, (r() * 1e6) | 0, ink); view.props.push(bakeProp(p)); return p; };
  // a few big pencil props in the back and front rows
  const big = ['scarecrow', 'cart', 'hay', 'corn', 'crate', 'hay', 'corn'];
  const nBig = Math.max(3, Math.round(stage.width / 6));
  for (let n = 0, tries = 0; n < nBig && tries < 200; tries++) {
    const kind = big[n % big.length], tall = kind === 'scarecrow' || kind === 'corn';   // tall ones only at the back
    const i = 1 + Math.floor(r() * (stage.width - 2)), j = tall ? Math.floor(r() * 2) : [0, 1, 7, 8][Math.floor(r() * 4)];
    const wide = kind === 'cart' || kind === 'scarecrow';
    if (!free(i, j) || (wide && (!free(i - 1, j) || !free(i + 1, j)))) continue;
    if ([...taken].some(t => { const [a, b] = t.split(',').map(Number); return Math.abs(a - i) < 4 && Math.abs(b - j) < 2; })) continue;
    add(kind, wx(i + .5), wy(j + .75), 1);
    taken.add(key(i, j)); if (wide) { taken.add(key(i - 1, j)); taken.add(key(i + 1, j)); }
    n++;
  }
  // signpost toward the next stage, beside the right exit
  const ex = stage.exits.find(e => e.at[0] === stage.width - 1);
  if (ex) for (let j = ex.at[1] - 2; j >= 0; j--) if (free(stage.width - 2, j)) { add('sign', wx(stage.width - 1.6), wy(j + .8), 1); taken.add(key(stage.width - 2, j)); break; }
  // pumpkins, leaf patches, vines and tufts on the remaining ground
  for (let j = 0; j < stage.depth; j++) for (let i = 0; i < stage.width; i++) {
    if (!free(i, j)) continue;
    const edge = j <= 1 || j >= 7, u = r();
    if (u < (edge ? .16 : .05)) { add('pumpkin', wx(i + .2 + r() * .6), wy(j + .55 + r() * .3), .55 + r() * .45); if (r() < .3) add('pumpkin', wx(i + r()), wy(j + .9), .5 + r() * .3); }
    else if (u < (edge ? .22 : .08)) add('leaves', wx(i + .5), wy(j + .6), 1);
    else if (u < (edge ? .245 : .095)) add('vine', wx(i), wy(j + .6), 60 + r() * 50);
    if (r() < .3) view.tufts.push({ x: wx(i + r()), y: wy(j + .3 + r() * .6), s: .7 + r() * .6, ph: r() * 6 });
  }
}

function placeInk(view, stage, seed, assets) {
  const r = rng(seed + 5);
  for (const [i, j] of stage.hedges) view.props.push(bakeProp(makeProp('hedge', wx(i + .5), wy(j + .85), 1, (r() * 1e6) | 0, true)));
  view.boulderSprites = new Map();
  for (const [i, j] of stage.boulders) view.boulderSprites.set(i + ',' + j, bakeProp(makeProp('boulder', wx(i + .5), wy(j + .8), .78, (r() * 1e6) | 0, true)));
  for (const [i, j] of stage.rest) view.flat.push(bakeProp(makeProp('blanket', wx(i + .5), wy(j + .5), 1, (r() * 1e6) | 0, true)));
  // candy: glow disc + his candy drawing, baked together; the stage view bobs it 3 px
  const im = candyArt(assets);
  view.candySprites = new Map();
  for (const [i, j] of stage.candy) {
    const x = wx(i + .5), y = wy(j + .7);
    view.candySprites.set(i + ',' + j, bakeProp(makeProp('glow', x, y, 1, i * 31 + j, true), g => {
      const w = 38, h = w * im.height / im.width; g.drawImage(im, x - w / 2, y - 22 - h / 2, w, h);
    }));
  }
}

function bakeGround(view, stage, seed) {
  const { stageW } = view, BSg = Math.min(R.BS, 2);
  // grain tile
  const gt = mk(160, 160), gg = gt.getContext('2d'), r = rng(3);
  for (let i = 0; i < 900; i++) { gg.fillStyle = r() < .5 ? 'rgba(90,70,40,.07)' : 'rgba(255,255,255,.35)'; gg.fillRect(r() * 160, r() * 160, 1 + r() * 1.5, 1 + r() * 1.5); }
  gg.strokeStyle = 'rgba(120,100,70,.05)'; for (let i = 0; i < 14; i++) { const x = r() * 160, y = r() * 160; gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + r() * 18 - 9, y + r() * 18 - 9); gg.stroke(); }
  const X0 = -260, X1 = stageW + 260;
  const edge = []; for (let x = X0; x <= X1; x += 40) edge.push([x, 86 + Math.sin(x * .013) * 3]);
  const sheet = wob([...edge, [X1, CHUNK_Y1 + 20], [X0, CHUNK_Y1 + 20]], true, 2, 21, 30);
  // path strips: runs of path tiles per row; runs touching an end run off the page
  const paths = [];
  const isPath = (i, j) => { const t = stage.tileAt(i, j); return t === ':' || ('S<>'.includes(t) && t !== '#' && (stage.tileAt(i - 1, j) === ':' || stage.tileAt(i + 1, j) === ':')); };
  for (let j = 0; j < stage.depth; j++) for (let i = 0; i < stage.width; i++) {
    if (!isPath(i, j) || isPath(i - 1, j)) continue;
    let e = i; while (isPath(e + 1, j)) e++;
    const a = i === 0 ? X0 : wx(i) + 6, b = e === stage.width - 1 ? X1 : wx(e + 1) - 6, t = wy(j) - 6, btm = wy(j + 1) + 6;
    const pts = [[a, t]]; for (let x = a + 60; x < b; x += 60) pts.push([x, t + Math.sin(x * .01 + j) * 3]);
    pts.push([b, t + 2], [b + (e === stage.width - 1 ? 0 : 12), (t + btm) / 2], [b, btm]);
    for (let x = b - 60; x > a; x -= 60) pts.push([x, btm + Math.sin(x * .012 + j) * 3]);
    pts.push([a, btm], [a - (i === 0 ? 0 : 12), (t + btm) / 2]);
    paths.push(wob(pts, true, 2, 22 + j, 30));
  }
  // back fence (implicit edge at y = -1): pale pencil posts and rails on the sheet's top edge
  const fence = []; const fr = rng(seed + 9);
  for (let x = X0 + 20; x < X1; x += 66) { fence.push(makeProp('post', x, 92, 1, (fr() * 1e6) | 0)); fence.push(makeProp('rail', x, 92, x + 66, (fr() * 1e6) | 0)); }
  for (let x0 = X0; x0 < X1; x0 += CHUNK_W) {
    const c = mk((CHUNK_W + 4) * BSg, (CHUNK_Y1 - CHUNK_Y0) * BSg), g = c.getContext('2d');   // 2 px overlap each side: no seams
    g.scale(BSg, BSg); g.translate(-(x0 - 2), -CHUNK_Y0);
    for (let i = 0; i < 6; i++) { g.save(); g.translate(0, -i * 1.5); g.fillStyle = `rgba(90,60,30,${.05 - i * .007})`; g.fill(sheet.p); g.restore(); }
    g.fillStyle = PAPER; g.fill(sheet.p);
    g.save(); g.clip(sheet.p); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = g.createPattern(gt, 'repeat'); g.fillRect(0, 0, c.width, c.height); g.restore();
    g.strokeStyle = '#d9cfbb'; g.lineWidth = 1.5; g.stroke(sheet.p);
    g.fillStyle = '#F2E2BD'; g.strokeStyle = PEN; g.lineWidth = 2; for (const p of paths) { g.fill(p.p); g.stroke(p.p); }
    for (const p of fence) if (p.bb[2] > x0 - 80 && p.bb[0] < x0 + CHUNK_W + 80) drawParts(g, p.parts, 1);
    view.chunks.push({ x0, c });
  }
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
  // playfield, world px
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.cx, -cam.cy);
  const vx0 = cam.cx - W / 2 / cam.z - 80, vx1 = cam.cx + W / 2 / cam.z + 80;
  for (const ch of view.chunks) if (ch.x0 + CHUNK_W > vx0 && ch.x0 < vx1) ctx.drawImage(ch.c, ch.x0 - 2, CHUNK_Y0, CHUNK_W + 4, CHUNK_Y1 - CHUNK_Y0);
  for (const p of view.flat) drawProp(ctx, p);
  // the lead's box, for fading standees in front of it
  const lead = fs.party[0];
  let leadBox = null;
  if (lead) { const sz = memberSize(view.assets, lead), x = wx(lead.x), y = wy(lead.y); leadBox = [x - sz.w / 2, y - sz.h, x + sz.w / 2, y]; }
  const items = [];
  for (const p of view.props) if (p.bb[2] > vx0 && p.bb[0] < vx1) items.push({ y: p.y, p });
  for (const b of fs.boulders) { const p = view.boulderSprites.get(b.i + ',' + b.j); if (p) items.push({ y: p.y, p }); }
  fs.candy.forEach((c, n) => { if (!c.taken) { const p = view.candySprites.get(c.i + ',' + c.j); if (p) items.push({ y: p.y, p, bob: Math.sin(t * .004 + n * 1.7) * 3 }); } });
  for (const tf of view.tufts) if (tf.x > vx0 && tf.x < vx1) items.push({ y: tf.y, tf });
  for (const c of fs.creatures) items.push({ y: wy(c.y), c });
  fs.party.forEach((m, n) => items.push({ y: wy(m.y) + (n === 0 ? .01 : 0), m, lead: n === 0 }));
  items.sort((a, b) => a.y - b.y);
  ctx.lineCap = 'round';
  for (const it of items) {
    if (it.p) {
      const fade = leadBox && it.p.standee && it.y > leadBox[3] && overlaps(it.p.bb, leadBox);
      drawProp(ctx, it.p, it.bob || 0, fade ? .5 : 1);
    } else if (it.tf) {
      const tf = it.tf, sw = Math.sin(t * .0032 + tf.ph + tf.x * .01) * .16;
      ctx.strokeStyle = '#9fbf7f'; ctx.lineWidth = 2;
      for (let b = -1; b <= 1; b++) { const ang = sw + b * .45; ctx.beginPath(); ctx.moveTo(tf.x + b * 3, tf.y); ctx.quadraticCurveTo(tf.x + b * 3 + Math.sin(ang) * 5 * tf.s, tf.y - 6 * tf.s, tf.x + b * 3 + Math.sin(ang) * 10 * tf.s, tf.y - 12 * tf.s * Math.cos(ang)); ctx.stroke(); }
    } else if (it.c) drawCreature(ctx, view.assets, it.c, wx(it.c.x), wy(it.c.y), t);
    else drawMember(ctx, view.assets, it.m, wx(it.m.x), wy(it.m.y), t, { lead: it.lead });
  }
  ctx.restore();
  // foreground, pre-blurred, parallax 1.4
  { const f = 1.4, zf = 1 + (cam.z - 1) * f;
    for (const o of view.fg) { const x = (o.x - cam.cx * f) * zf + W / 2; if (x < -200 || x > W + 200) continue;
      ctx.save(); ctx.translate(x, H + o.dy * zf + (cam.cy - 195) * -.4); if (o.flip) ctx.scale(-1, 1); ctx.drawImage(o.s.c, -o.s.w * zf / 2, -o.s.h * zf, o.s.w * zf, o.s.h * zf); ctx.restore(); } }
  ctx.restore();
  // light, dust motes, drifting leaves (screen space)
  ctx.drawImage(view.light, 0, 0, W, H);
  ctx.fillStyle = '#FFF4D0';
  for (let i = 0; i < 22; i++) { const r = rng(100 + i), bx = r() * W, by = r() * H; const x = (bx + t * (.012 + r() * .02) - cam.cx * .3) % (W + 40); const y = by + Math.sin(t * .0012 + i) * 14; ctx.globalAlpha = .25 + .35 * (Math.sin(t * .003 + i * 2) * .5 + .5); ctx.beginPath(); ctx.arc((x + W + 40) % (W + 40) - 20, y, 1.2 + r() * 1.6, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) { const x = ((i * 260 + t * .07) % (W + 120)) - 60, y = ((i * 97 + t * .03) % (H + 60)) - 30 + Math.sin(t * .002 + i) * 18; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .003 + i) * 1.2); ctx.fillStyle = i % 2 ? '#E8A04A' : '#C9772E'; ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
}
