// Stage bake (split out of stageview.js): where the scenery goes, the ink props, and the ground sheet.
// Everything here runs once per stage at load. Task 7 "visual depth pass": each item has a named
// constant below so any one can be dialled back on its own.
import { R, PAPER, PEN, TILE_W, wx, wy, mk, rng, clamp, lerp, wob, ell, tone, streaks } from './core.js';
import { makeProp, drawParts, bakeProp } from './props.js';
import { candyArt } from './sprites.js';
import { prepareWater, drawWater, drawRibbons } from './water.js';

// 1. Cluster the scenery: a few patches along the back and front edges, calm ground between them.
const CLUSTER = true;                 // false = the old even scatter
const PATCHES_BACK = [.27, .55, .86]; // patch centres as fractions of the stage width
const PATCHES_FRONT = [.14, .42, .7];
const CLEAR_PATH = 1.5;               // rows kept clear either side of the path
const CLEAR_PLAY = 1;                 // tiles kept clear around anything playable
// 2. Quiet the scenery: pale orange saturation and pencil line strength down by about a quarter.
const QUIET = { sat: 1, line: 1 };   // was .75 / .75: the owner found that too faded (14 Nov)
// 3. Fade with distance: back rows smaller, paler, cooler; front rows larger, warmer. Ground to match.
const DEPTH = { on: true, kBack: .8, kFront: 1.1, cool: '#E4EAEC', coolBack: .06, warm: '#EDB383', warmFront: .12 };
const GROUND_GRADIENT = { haze: 'rgba(224,228,226,.06)', hazeTo: 235, warm: 'rgba(240,190,120,.34)', warmFrom: 215 };
// 4. Paper-on-paper shadows: smudge under scenery and hedges (props.js), cut-paper edge on the hedge row.
const SHADOWS = true;
const CUT_EDGE = { shadow: .085, light: 'rgba(255,255,255,.75)' };
// 6. Marker streaks inside ink fills (hedges, boulder, blanket here; the path below).
const STREAKS = true;
const PATH_STREAK = { col: '#E6D3A8', alpha: .32 };
// 7. More paper: stronger grain, fold creases across the page, pencil grass-hatching patches.
const GRAIN = { specks: 1300, dark: .05 };
const CREASES = 3;
const CREASE = { dark: .022, light: .11 };   // a hairline pair only: no shaded band, no tone step
const HATCH_PATCHES = 7;
// Ink sizes that keep the alcove readable: hedges fit their tile column, the boulder sits between them.
const BOULDER_SCALE = .74;

// 8. Each stage's own mix (Task 4). S1 keeps the patch fractions above. A patch: one big prop (or none) at
// `at` (the nearest free tile is used), then its small things huddled round it. Wide kinds need the tiles
// either side free. In water: reeds (standing) and lily pads (flat), at the listed water tiles.
// S2 a pond, S3 a market, S4 and S6 sparse (puzzles), S5 emptier and eerier (bare trees, jack-o'-lanterns).
const DRESS = {
  S2: { patches: [{ at: [31, 0], big: 'hay', small: ['pumpkin', 'leaves', 'pumpkin'] }, { at: [5, 3], big: null, small: ['pumpkin', 'leaves', 'pumpkin'] }],
    reeds: [[8, 0], [22, 0], [8, 3], [22, 4]], lilies: [[10, 1], [12, 4], [19, 1], [20, 3], [17, 0], [10, 4]], tufts: 3, hatch: 6 },
  S3: { patches: [{ at: [19, 0], big: 'stall', small: ['crate', 'pumpkin', 'crate'] }, { at: [28, 1], big: 'crate', small: ['crate', 'pumpkin'] },
    { at: [5, 8], big: 'cart', small: ['crate', 'pumpkin'] }, { at: [28, 8], big: 'hay', small: ['pumpkin', 'leaves'] }], tufts: 3, hatch: 6 },
  S4: { patches: [{ at: [7, 0], big: null, small: ['pumpkin', 'leaves'] }, { at: [21, 0], big: 'hay', small: ['pumpkin'] }, { at: [7, 8], big: null, small: ['leaves', 'pumpkin'] }], tufts: 2, hatch: 4 },
  S5: { patches: [{ at: [9, 0], big: 'baretree', small: ['jack', 'stalks'] }, { at: [20, 1], big: 'baretree', small: ['stalks'] }, { at: [17, 8], big: null, small: ['jack', 'leaves'] }], tufts: 1, hatch: 4 },
  S6: { patches: [{ at: [9, 0], big: 'hay', small: ['pumpkin', 'pumpkin'] }, { at: [7, 8], big: null, small: ['pumpkin', 'leaves'] }, { at: [27, 8], big: null, small: ['pumpkin'] }], tufts: 2, hatch: 4 },
};
const WIDE = new Set(['cart', 'scarecrow', 'stall']);
const STALKS = { mix: '#B9A27E', amt: .45 };   // dead corn in S5: the corn prop, browned

/** Every tile something playable stands on (scenery and grass hatching keep clear of these). */
export function playTiles(stage) {
  const extra = []; for (let j = 0; j < stage.depth; j++) for (let i = 0; i < stage.width; i++) if ('kvmf'.includes(stage.tileAt(i, j))) extra.push([i, j]);
  return [...stage.candy, ...stage.rest, ...stage.boulders, ...stage.hedges, stage.start, ...stage.spawns.map(s => s.at), ...stage.exits.map(e => e.at),
    ...(stage.plates || []), ...(stage.gates || []), ...(stage.posts || []).map(p => p.at), ...(stage.joins || []).map(f => f.at), ...(stage.doOver || []),
    ...(stage.lollipop ? [stage.lollipop] : []), ...(stage.door || []), ...(stage.pumpkin || []), ...extra];
}

const PATH_TILES = ':';
// 'v' (the M4 pumpkin lane) carries the path across it on a path row
const isPathTile = (stage, i, j) => { const t = stage.tileAt(i, j); return t === ':' || ('S<>v'.includes(t) && t !== '#' && (stage.tileAt(i - 1, j) === ':' || stage.tileAt(i + 1, j) === ':')); };
const pathRows = stage => { const s = new Set(); for (let j = 0; j < stage.depth; j++) for (let i = 0; i < stage.width; i++) if (stage.tileAt(i, j) === PATH_TILES) s.add(j); return [...s]; };

/** Pencil look for a scenery prop whose feet are at tile depth y (0 back .. 8 front). */
export function rowLook(y, extra = {}) {
  const t = clamp(y / 8);
  const look = { sat: QUIET.sat, line: QUIET.line, shadow: SHADOWS, ...extra };
  if (DEPTH.on) {
    look.k = lerp(DEPTH.kBack, DEPTH.kFront, t);
    if (t < .5) { look.mix = DEPTH.cool; look.amt = DEPTH.coolBack * (1 - t * 2); }
    else { look.mix = DEPTH.warm; look.amt = DEPTH.warmFront * (t * 2 - 1); }
  }
  return look;
}

// ---------------------------------------------------------------- scenery
export function placeScenery(view, stage, seed, ribbonTiles = []) {
  const r = rng(seed), key = (i, j) => i + ',' + j, taken = new Set();
  const near = new Set();
  for (const [i, j] of playTiles(stage)) for (let di = -CLEAR_PLAY; di <= CLEAR_PLAY; di++) for (let dj = -CLEAR_PLAY; dj <= CLEAR_PLAY; dj++) near.add(key(i + di, j + dj));
  for (const [i, j] of ribbonTiles) near.add(key(i, j));
  // a creature's patrol rectangle stays clear too: it moves there
  for (const s of stage.spawns) if (s.patrol && s.patrol.length) {
    const is = s.patrol.map(p => p[0]), js = s.patrol.map(p => p[1]);
    for (let i = Math.min(...is); i <= Math.max(...is); i++) for (let j = Math.min(...js); j <= Math.max(...js); j++) near.add(key(i, j));
  }
  const prows = pathRows(stage);
  const offPath = j => prows.every(p => Math.abs(j - p) > CLEAR_PATH);
  const free = (i, j) => stage.tileAt(i, j) === '.' && !near.has(key(i, j)) && !taken.has(key(i, j)) && (!CLUSTER || offPath(j));
  const add = (k, tx, ty, s = 1, tint) => { const p = makeProp(k, wx(tx), wy(ty), s, (r() * 1e6) | 0, false, rowLook(ty, tint)); bakeProp(p); (k === 'lily' ? view.flat : view.props).push(p); return p; };
  const tuft = (tx, ty) => view.tufts.push({ x: wx(tx), y: wy(ty), s: (.7 + r() * .5) * (DEPTH.on ? lerp(DEPTH.kBack, DEPTH.kFront, clamp(ty / 8)) : 1), ph: r() * 6 });

  if (!CLUSTER) { scatter(stage, r, free, add, tuft, taken, key); return signpost(view, stage, free, add, taken, key); }
  if (DRESS[stage.id]) { dress(DRESS[stage.id], stage, r, free, add, tuft, taken, key); return signpost(view, stage, free, add, taken, key); }

  const patch = (fc, back, n) => {
    // find a free centre near the wanted spot, searching outward
    let ci = Math.round(fc * (stage.width - 1)), cj = back ? (r() < .5 ? 0 : 1) : (r() < .5 ? 7 : 8), ok = false;
    for (let d = 0; d < 6 && !ok; d++) for (const s of [1, -1]) { const i = ci + d * s; if (free(i, cj) && free(i, back ? 1 - cj : 15 - cj)) { ci = i; ok = true; break; } }
    if (!ok) return;
    // one big prop (tall ones only at the back), then a few small things huddled round it
    const big = back ? ['scarecrow', 'corn', 'hay'][n % 3] : ['hay', 'crate', 'cart'][n % 3];
    const wide = big === 'cart' || big === 'scarecrow';
    if (!wide || (free(ci - 1, cj) && free(ci + 1, cj))) { add(big, ci + .5, cj + .75); taken.add(key(ci, cj)); if (wide) { taken.add(key(ci - 1, cj)); taken.add(key(ci + 1, cj)); } }
    const small = 2 + Math.floor(r() * 2);
    for (let m = 0, tries = 0; m < small && tries < 20; tries++) {
      const i = ci + Math.round((r() - .5) * 4), j = clamp(cj + Math.round((r() - .5) * 2), back ? 0 : 7, back ? 1 : 8);
      if (!free(i, j)) continue;
      taken.add(key(i, j)); m++;
      if (r() < .7) { const tx = i + .25 + r() * .5, ty = j + .6 + r() * .25; add('pumpkin', tx, ty, .55 + r() * .4); if (r() < .4) add('pumpkin', tx + .45, ty + .2, .45 + r() * .2); }
      else add('leaves', i + .5, j + .6);
    }
    for (let m = 0; m < 3; m++) { const tx = ci + (r() - .5) * 4, ty = clamp(cj + .3 + r() * .6, 0, 8.9); if (stage.tileAt(Math.floor(tx), Math.floor(ty)) === '.') tuft(tx, ty); }
  };
  PATCHES_BACK.forEach((f, n) => patch(f, true, n));
  PATCHES_FRONT.forEach((f, n) => patch(f, false, n));
  signpost(view, stage, free, add, taken, key);
}

// A stage's own mix (DRESS): patches at chosen tiles, then the pond's reeds and lily pads.
function dress(D, stage, r, free, add, tuft, taken, key) {
  for (const pt of D.patches) {
    let [ci, cj] = pt.at, ok = false;
    const fits = (i, j) => free(i, j) && (!WIDE.has(pt.big) || (free(i - 1, j) && free(i + 1, j)));
    for (let d = 0; d < 6 && !ok; d++) for (const sg of [1, -1]) for (const dj of [0, sg, -sg]) { const i = ci + d * sg, j = cj + dj; if (j >= 0 && j < stage.depth && fits(i, j)) { ci = i; cj = j; ok = true; break; } if (ok) break; }
    if (!ok) continue;
    if (pt.big) { add(pt.big, ci + .5, cj + .75); taken.add(key(ci, cj)); if (WIDE.has(pt.big)) { taken.add(key(ci - 1, cj)); taken.add(key(ci + 1, cj)); } }
    let m = 0;
    for (let tries = 0; m < pt.small.length && tries < 30; tries++) {
      const i = ci + Math.round((r() - .5) * 4), j = clamp(cj + Math.round((r() - .5) * 2), 0, stage.depth - 1);
      if (!free(i, j)) continue;
      taken.add(key(i, j));
      const kind = pt.small[m++], tx = i + .25 + r() * .5, ty = j + .6 + r() * .25;
      if (kind === 'pumpkin') { add('pumpkin', tx, ty, .55 + r() * .4); if (r() < .4) add('pumpkin', tx + .45, ty + .2, .45 + r() * .2); }
      else if (kind === 'jack') add('jack', tx, ty, .6 + r() * .25);
      else if (kind === 'stalks') add('corn', i + .5, j + .75, .85, STALKS);
      else if (kind === 'crate') add('crate', tx, ty, 1);
      else add(kind, i + .5, j + .6);
    }
    for (let k = 0; k < (D.tufts ?? 3); k++) { const tx = ci + (r() - .5) * 4, ty = clamp(cj + .3 + r() * .6, 0, 8.9); if (stage.tileAt(Math.floor(tx), Math.floor(ty)) === '.') tuft(tx, ty); }
  }
  for (const [i, j] of D.reeds || []) if (stage.tileAt(i, j) === '~') add('reeds', i + .5, j + .8, .9 + r() * .25);
  for (const [i, j] of D.lilies || []) if (stage.tileAt(i, j) === '~') add('lily', i + .3 + r() * .4, j + .4 + r() * .3, .8 + r() * .4);
}

function signpost(view, stage, free, add, taken, key) {   // toward the next stage, beside the right exit
  const ex = stage.exits.find(e => e.at[0] === stage.width - 1);
  if (ex) for (let j = ex.at[1] - 2; j >= 0; j--) if (stage.tileAt(stage.width - 2, j) === '.') { add('sign', stage.width - 1.6, j + .8); taken.add(key(stage.width - 2, j)); break; }
}

function scatter(stage, r, free, add, tuft, taken, key) {   // the pre-Task-7 even scatter (CLUSTER = false)
  for (let j = 0; j < stage.depth; j++) for (let i = 0; i < stage.width; i++) {
    if (!free(i, j)) continue;
    const edge = j <= 1 || j >= 7, u = r();
    if (u < (edge ? .16 : .05)) add('pumpkin', i + .2 + r() * .6, j + .55 + r() * .3, .55 + r() * .45);
    else if (u < (edge ? .22 : .08)) add('leaves', i + .5, j + .6);
    if (r() < .3) tuft(i + r(), j + .3 + r() * .6);
    taken.add(key(i, j));
  }
}

// ---------------------------------------------------------------- ink: hedges, boulders, blanket, candy
export function placeInk(view, stage, seed, assets) {
  const r = rng(seed + 5), ink = { shadow: SHADOWS, streaks: STREAKS, fit: true };
  // in a puzzle stage (one with a gate: S4, S6) a hedge right in front of a boulder or the gate is trimmed low
  // so the plug and the gate show; S2's secret stays tucked behind its full hedges
  const behind = new Set(stage.gates.length ? [...stage.boulders, ...stage.gates].map(([i, j]) => i + ',' + (j + 1)) : []);
  for (const [i, j] of stage.hedges) view.props.push(bakeProp(makeProp('hedge', wx(i + .5), wy(j + .85), 1, (r() * 1e6) | 0, true, behind.has(i + ',' + j) ? { ...ink, low: true } : ink)));
  view.boulderSprites = new Map();
  for (const [i, j] of stage.boulders) view.boulderSprites.set(i + ',' + j, bakeProp(makeProp('boulder', wx(i + .5), wy(j + .8), BOULDER_SCALE, (r() * 1e6) | 0, true, ink)));
  for (const [i, j] of stage.rest) view.flat.push(bakeProp(makeProp('blanket', wx(i + .5), wy(j + .5), 1, (r() * 1e6) | 0, true, { streaks: STREAKS })));
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

// ---------------------------------------------------------------- ground sheet
export const CHUNK_W = 600, CHUNK_Y0 = 0, CHUNK_Y1 = 430;

export function bakeGround(view, stage, seed) {
  const { stageW } = view, BSg = Math.min(R.BS, 2);
  view.water = prepareWater(stage, seed);
  // grain tile
  const gt = mk(160, 160), gg = gt.getContext('2d'), r = rng(3);
  for (let i = 0; i < GRAIN.specks; i++) { gg.fillStyle = r() < .5 ? `rgba(90,70,40,${GRAIN.dark})` : 'rgba(255,255,255,.35)'; gg.fillRect(r() * 160, r() * 160, 1 + r() * 1.5, 1 + r() * 1.5); }
  gg.strokeStyle = 'rgba(120,100,70,.06)'; for (let i = 0; i < 18; i++) { const x = r() * 160, y = r() * 160; gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + r() * 18 - 9, y + r() * 18 - 9); gg.stroke(); }
  const X0 = -260, X1 = stageW + 260;
  const edge = []; for (let x = X0; x <= X1; x += 40) edge.push([x, 86 + Math.sin(x * .013) * 3]);
  const sheet = wob([...edge, [X1, CHUNK_Y1 + 20], [X0, CHUNK_Y1 + 20]], true, 2, 21, 30);
  const top = wob(edge, false, 2, 21, 30);
  // path strips: runs of path tiles per row; runs touching an end run off the page
  const paths = [];
  for (let j = 0; j < stage.depth; j++) for (let i = 0; i < stage.width; i++) {
    if (!isPathTile(stage, i, j) || isPathTile(stage, i - 1, j)) continue;
    let e = i; while (isPathTile(stage, e + 1, j)) e++;
    const a = i === 0 ? X0 : wx(i) + 6, b = e === stage.width - 1 ? X1 : wx(e + 1) - 6, t = wy(j) - 6, btm = wy(j + 1) + 6;
    const pts = [[a, t]]; for (let x = a + 60; x < b; x += 60) pts.push([x, t + Math.sin(x * .01 + j) * 3]);
    pts.push([b, t + 2], [b + (e === stage.width - 1 ? 0 : 12), (t + btm) / 2], [b, btm]);
    for (let x = b - 60; x > a; x -= 60) pts.push([x, btm + Math.sin(x * .012 + j) * 3]);
    pts.push([a, btm], [a - (i === 0 ? 0 : 12), (t + btm) / 2]);
    paths.push(wob(pts, true, 2, 22 + j, 30));
  }
  // back fence (implicit edge at y = -1): pale pencil posts and rails on the sheet's top edge
  const fence = []; const fr = rng(seed + 9), fl = rowLook(-1.2, { shadow: false });
  for (let x = X0 + 20; x < X1; x += 66) { fence.push(makeProp('post', x, 92, 1, (fr() * 1e6) | 0, false, { ...fl, k: 1 })); fence.push(makeProp('rail', x, 92, x + 66, (fr() * 1e6) | 0, false, { ...fl, k: 1 })); }
  // pencil grass hatching: short slanted strokes in small patches, off the path and away from playables
  const hatches = [], hr = rng(seed + 13), prows = pathRows(stage);
  const avoid = DRESS[stage.id] ? [...playTiles(stage), ...stage.water, ...(view.ribbons || []).flatMap(rb => rb.tiles)] : [...stage.candy, ...stage.hedges, ...stage.rest, ...stage.boulders];
  for (let n = 0, tries = 0; n < (DRESS[stage.id]?.hatch ?? HATCH_PATCHES) && tries < 80; tries++) {
    const i = Math.floor(hr() * stage.width), j = Math.floor(hr() * stage.depth);
    if (stage.tileAt(i, j) !== '.' || prows.some(p => Math.abs(p - j) < 1.5)) continue;
    if (avoid.some(([a, b]) => Math.abs(a - i) <= 1 && Math.abs(b - j) <= 1)) continue;
    hatches.push({ x: wx(i + hr()), y: wy(j + .3 + hr() * .5), n: 5 + Math.floor(hr() * 4), s: hr() * 1e6 | 0, j }); n++;
  }
  // fold creases: a few near-vertical folds across the whole sheet
  const creases = []; const cr = rng(seed + 17);
  for (let k = 0; k < CREASES; k++) { const x = lerp(0, stageW, (k + .3 + cr() * .4) / CREASES); creases.push([x, x + (cr() - .5) * 120]); }

  for (let x0 = X0; x0 < X1; x0 += CHUNK_W) {
    const c = mk((CHUNK_W + 4) * BSg, (CHUNK_Y1 - CHUNK_Y0) * BSg), g = c.getContext('2d');   // 2 px overlap each side: no seams
    g.scale(BSg, BSg); g.translate(-(x0 - 2), -CHUNK_Y0);
    for (let i = 0; i < 6; i++) { g.save(); g.translate(0, -i * 1.5); g.fillStyle = `rgba(90,60,30,${CUT_EDGE.shadow - i * .012})`; g.fill(sheet.p); g.restore(); }
    g.fillStyle = PAPER; g.fill(sheet.p);
    g.save(); g.clip(sheet.p);
    if (DEPTH.on) {                                // hazier at the horizon, warmer toward the camera
      let gr = g.createLinearGradient(0, 86, 0, GROUND_GRADIENT.hazeTo); gr.addColorStop(0, GROUND_GRADIENT.haze); gr.addColorStop(1, 'rgba(226,229,226,0)');
      g.fillStyle = gr; g.fillRect(x0 - 2, 80, CHUNK_W + 4, GROUND_GRADIENT.hazeTo - 80);
      gr = g.createLinearGradient(0, GROUND_GRADIENT.warmFrom, 0, CHUNK_Y1); gr.addColorStop(0, 'rgba(238,196,140,0)'); gr.addColorStop(1, GROUND_GRADIENT.warm);
      g.fillStyle = gr; g.fillRect(x0 - 2, GROUND_GRADIENT.warmFrom, CHUNK_W + 4, CHUNK_Y1 - GROUND_GRADIENT.warmFrom);
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = g.createPattern(gt, 'repeat'); g.fillRect(0, 0, c.width, c.height); g.restore();
    g.restore();
    g.strokeStyle = '#d9cfbb'; g.lineWidth = 1.5; g.stroke(sheet.p);
    if (SHADOWS) { g.save(); g.translate(0, 1.6); g.strokeStyle = CUT_EDGE.light; g.lineWidth = 1.6; g.stroke(top.p); g.restore(); }
    for (const h of hatches) if (h.x > x0 - 60 && h.x < x0 + CHUNK_W + 60) {
      const hr2 = rng(h.s), k = DEPTH.on ? lerp(DEPTH.kBack, DEPTH.kFront, clamp(h.j / 8)) : 1;
      g.strokeStyle = tone(PEN, { mix: PAPER, amt: .35 }); g.lineWidth = 1.1; g.globalAlpha = .55;
      for (let m = 0; m < h.n; m++) { const hx = h.x + (m - h.n / 2) * 4 * k + hr2() * 2, hy = h.y + hr2() * 3; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + 3 * k, hy - (6 + hr2() * 4) * k); g.stroke(); }
      g.globalAlpha = 1;
    }
    drawWater(g, view.water, x0, x0 + CHUNK_W);
    g.fillStyle = '#F2E2BD'; g.strokeStyle = PEN; g.lineWidth = 2;
    for (const p of paths) { g.fill(p.p); if (STREAKS) streaks(g, p.p, [Math.max(p.bb[0], x0 - 10), p.bb[1], Math.min(p.bb[2], x0 + CHUNK_W + 10), p.bb[3]], PATH_STREAK.col, 900 + x0, { ang: 0, spread: .22, len: [16, 44], lw: [3, 5], alpha: PATH_STREAK.alpha }); g.stroke(p.p); }
    if (view.ribbons) drawRibbons(g, view.ribbons, x0, x0 + CHUNK_W);
    g.save(); g.clip(sheet.p);
    for (const [a, b] of creases) if (Math.max(a, b) > x0 - 40 && Math.min(a, b) < x0 + CHUNK_W + 40) {
      g.lineWidth = 1; g.strokeStyle = `rgba(120,95,60,${CREASE.dark})`; g.beginPath(); g.moveTo(a, 80); g.lineTo(b, CHUNK_Y1); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${CREASE.light})`; g.beginPath(); g.moveTo(a - 1.2, 80); g.lineTo(b - 1.2, CHUNK_Y1); g.stroke();
    }
    g.restore();
    for (const p of fence) if (p.bb[2] > x0 - 80 && p.bb[0] < x0 + CHUNK_W + 80) drawParts(g, p.parts, 1);
    view.chunks.push({ x0, c });
  }
}
