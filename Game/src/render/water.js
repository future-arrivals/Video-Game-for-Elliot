// Ground marks baked into the ground sheet (Task 4): water and the gate ribbons.
// Water: marker blue with a paler shallow rim inside, a muddy bank band outside, an ink bank edge, marker
// streaks and pencil ripples: "you cannot walk here". Islands (a non-water tile inside water) come out as
// holes with their own ink bank. Ribbon: a candy-red ribbon along the ground from each plate or bell to the
// gate it opens (in a stage, any plate or bell opens every gate).
import { INK, wx, wy, rng, wob, streaks } from './core.js';
import { C } from './propkinds.js';

export const WATER = {
  fill: '#79BFE3', rim: '#A6D7EF', rimW: 12, streak: '#5DA9DA', bank: 'rgba(176,150,104,.42)', bankW: 11,
  edge: INK, edgeW: 3.2, ripple: '#3D83B6', shine: 'rgba(255,255,255,.9)', ripplesPerTile: .7,
};
export const RIBBON = { red: C.caneRed, stripe: C.caneWhite, w: 5, edgeW: 8.5, knot: 6 };
const RIBBON_COST = { ground: 1, hedge: 3, solid: 6, water: 40, turn: 2 };

/** Outline loops of the water tiles (grid corners in tile units), clockwise; holes come out as their own loops. */
export function waterLoops(stage) {
  const set = new Set(stage.water.map(([i, j]) => i + ',' + j)), isW = (i, j) => set.has(i + ',' + j);
  const out = new Map(), key = p => p[0] + ',' + p[1];
  const add = (a, b) => { const k = key(a); if (!out.has(k)) out.set(k, []); out.get(k).push(b); };
  for (const [i, j] of stage.water) {
    if (!isW(i, j - 1)) add([i, j], [i + 1, j]);
    if (!isW(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!isW(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!isW(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const loops = [];
  for (const [k0, list] of out) while (list.length) {
    const start = k0.split(',').map(Number), loop = [start];
    let cur = list.pop();
    for (let guard = 0; guard < 10000 && key(cur) !== k0; guard++) {
      loop.push(cur); const nx = out.get(key(cur)); if (!nx || !nx.length) break; cur = nx.pop();
    }
    // drop the straight-through corners
    const n = loop.length, keep = loop.filter((p, m) => { const a = loop[(m - 1 + n) % n], b = loop[(m + 1) % n]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0; });
    if (keep.length >= 3) loops.push(keep);
  }
  return loops;
}

/** Bakes the water geometry once per stage: { path (evenodd), loops: [wob], ripples, bb } or null. */
export function prepareWater(stage, seed) {
  if (!stage.water.length) return null;
  const loops = waterLoops(stage).map((l, n) => wob(l.map(([i, j]) => [wx(i), wy(j)]), true, 1.4, seed + n, 14));
  const path = new Path2D(); for (const l of loops) path.addPath(l.p);
  const r = rng(seed + 3), ripples = [];
  for (const [i, j] of stage.water) if (r() < WATER.ripplesPerTile) ripples.push({ x: wx(i + .2 + r() * .6), y: wy(j + .25 + r() * .55), w: 9 + r() * 8, shine: r() < .35, s: (r() * 1e6) | 0 });
  let bb = [1e9, 1e9, -1e9, -1e9];
  for (const l of loops) bb = [Math.min(bb[0], l.bb[0]), Math.min(bb[1], l.bb[1]), Math.max(bb[2], l.bb[2]), Math.max(bb[3], l.bb[3])];
  return { path, loops, ripples, bb };
}

/** Draws the baked water geometry into a ground chunk (world px transform already set). */
export function drawWater(g, wtr, x0, x1) {
  if (!wtr || wtr.bb[2] < x0 - 20 || wtr.bb[0] > x1 + 20) return;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = WATER.bank; g.lineWidth = WATER.bankW; for (const l of wtr.loops) g.stroke(l.p);
  g.fillStyle = WATER.fill; g.fill(wtr.path, 'evenodd');
  g.save(); g.clip(wtr.path, 'evenodd');
  streaks(g, wtr.path, [Math.max(wtr.bb[0], x0 - 20), wtr.bb[1], Math.min(wtr.bb[2], x1 + 20), wtr.bb[3]], WATER.streak, 4242 + (x0 | 0), { ang: 0, spread: .08, len: [22, 64], lw: [4, 7], alpha: .3 });
  g.strokeStyle = WATER.rim; g.lineWidth = WATER.rimW; g.globalAlpha = .8; for (const l of wtr.loops) g.stroke(l.p); g.globalAlpha = 1;
  for (const rp of wtr.ripples) {
    if (rp.x < x0 - 30 || rp.x > x1 + 30) continue;
    const q = rng(rp.s), w = rp.w;
    g.strokeStyle = rp.shine ? WATER.shine : WATER.ripple; g.lineWidth = rp.shine ? 2.2 : 1.4; g.globalAlpha = rp.shine ? 1 : .7;
    g.beginPath(); g.moveTo(rp.x - w, rp.y); g.quadraticCurveTo(rp.x - w / 2, rp.y - 3 - q() * 2, rp.x, rp.y); g.quadraticCurveTo(rp.x + w / 2, rp.y + 3 + q() * 2, rp.x + w, rp.y); g.stroke();
  }
  g.globalAlpha = 1; g.restore();
  g.strokeStyle = WATER.edge; g.lineWidth = WATER.edgeW; for (const l of wtr.loops) g.stroke(l.p);
  g.restore();
}

// ---------------------------------------------------------------- ribbons
/** For each gate, a ribbon from each plate and bell post in the stage: [{ pts (world px), tiles: [[i, j]] }]. */
export function ribbonRoutes(stage) {
  const sources = [...stage.plates, ...stage.posts.filter(p => p.kind === 'bell').map(p => p.at)];
  const out = [];
  for (const gt of stage.gates) for (const src of sources) {
    const tiles = route(stage, src, gt); if (!tiles) continue;
    // corners only, at the tile centres; the ends sit on the plate's middle and the gate's feet
    const corners = tiles.filter((p, m) => m === 0 || m === tiles.length - 1 || (tiles[m - 1][0] - p[0]) * (tiles[m + 1][1] - p[1]) !== (tiles[m - 1][1] - p[1]) * (tiles[m + 1][0] - p[0]));
    const pts = corners.map(([i, j], m) => [wx(i + .5), wy(j + (m === corners.length - 1 ? .82 : .58))]);
    out.push({ pts, tiles });
  }
  return out;
}

// Cheapest 4-way route over the map (ground cheap, hedges and solids dearer, water very dear, turns cost).
function route(stage, [si, sj], [ti, tj]) {
  const W = stage.width, D = stage.depth, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const cost = (i, j) => { const t = stage.tileAt(i, j); return t === '~' ? RIBBON_COST.water : t === '#' ? RIBBON_COST.hedge : '.:<>SRcFI*fkvm'.includes(t) ? RIBBON_COST.ground : RIBBON_COST.solid; };
  const best = new Map(), prev = new Map(), K = (i, j, d) => (j * W + i) * 4 + d;
  const open = dirs.map((_, d) => [0, si, sj, d]); for (const o of open) best.set(K(si, sj, o[3]), 0);
  while (open.length) {
    open.sort((a, b) => b[0] - a[0]); const [c, i, j, d] = open.pop();
    if (c > (best.get(K(i, j, d)) ?? 1e9)) continue;
    if (i === ti && j === tj) { const tiles = []; let k = K(i, j, d); while (k != null) { const cell = Math.floor(k / 4); tiles.unshift([cell % W, Math.floor(cell / W)]); k = prev.get(k); } return tiles; }
    dirs.forEach(([di, dj], nd) => {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= D) return;
      const nc = c + cost(ni, nj) + (nd !== d && !(i === si && j === sj) ? RIBBON_COST.turn : 0), nk = K(ni, nj, nd);
      if (nc < (best.get(nk) ?? 1e9)) { best.set(nk, nc); prev.set(nk, K(i, j, d)); open.push([nc, ni, nj, nd]); }
    });
  }
  return null;
}

/** Bakes each ribbon's wobbly path once. */
export function prepareRibbons(stage, seed) {
  return ribbonRoutes(stage).map((rb, n) => ({ ...rb, g: wob(rb.pts, false, 1.3, seed + 70 + n, 12) }));
}

export function drawRibbons(g, ribbons, x0, x1) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const rb of ribbons) {
    if (rb.g.bb[2] < x0 - 20 || rb.g.bb[0] > x1 + 20) continue;
    g.strokeStyle = INK; g.lineWidth = RIBBON.edgeW; g.stroke(rb.g.p);
    g.strokeStyle = RIBBON.red; g.lineWidth = RIBBON.w; g.stroke(rb.g.p);
    g.strokeStyle = RIBBON.stripe; g.lineWidth = 1.6; g.setLineDash([5, 9]); g.stroke(rb.g.p); g.setLineDash([]);
    const [ex, ey] = rb.pts[rb.pts.length - 1];   // a knot where it ties on at the gate
    g.fillStyle = RIBBON.red; g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.arc(ex, ey, RIBBON.knot, 0, 7); g.fill(); g.stroke();
  }
  g.restore();
}
