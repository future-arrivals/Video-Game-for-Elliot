// More prop kinds for M2 (Task 4), called from props.js makeProp. Each builder pushes parts onto P:
// part(g, fill, stroke, lw, dash), with g a wobbly path from core.wob. Feet at world px (x, y).
// Ink kinds (black marker, full colour: you can use or touch these): gate, gateopen, candypost, bellpost,
// bellrung, plate, platedown, stone, doover, giant, door, mat. Pencil kinds (scenery): reeds, lily,
// stall, baretree, jack. The colours are named here so any one can be changed on its own.
import { INK, wob, ell, rng } from './core.js';

const GATE_H = 84, GATE_HW = 29;   // gate post height; half the gap between its posts (a hedge is about 45 px wide)
export const GIANT_RY = .66;   // giant pumpkin half-height / half-width: tall enough to hide the far-sheet one behind it
export const C = {
  caneRed: '#E0403A', caneWhite: '#FFF8EE',             // gate, ribbon, plate swirl
  postPink: '#EE6FA8', cup: '#F6C443',                   // candy post
  wood: '#C98F55', bell: '#F6C443', bow: '#E0403A',      // bell post
  stone: '#B9B2A3', stoneTop: '#D8D2C5',
  pumpkin: '#F39A3B', stem: '#5E8C3A', giant: '#F28C28', giantRib: '#D9721C', window: '#FFE7A6',
  door: '#8A5A33', doorPlank: '#6E4526', knob: '#F6C443', mat: '#D9443A',
  reed: '#9DB57A', cattail: '#C49A6C', lily: '#BFDDA0', lilyLine: '#8FB27A', lilyFlower: '#F4B6CC',
  stallBox: '#EAD3B0', awnPink: '#F4B6CC', awnWhite: '#FBF1E6', jar: ['#E99DBB', '#F6D27A', '#A8D4E8'],
  bark: '#CDBBA0', jack: '#F6D2A6', jackEye: '#8C7A62',
};

// A candy-cane stroke along pts: ink edge, white tube, red stripes (round-capped dashes).
function cane(P, part, pts, seed, w = 9, red = C.caneRed) {
  const g = wob(pts, false, .35, seed, 8);
  P.push(part(g, null, INK, w + 5), part(g, null, C.caneWhite, w), part(g, null, red, w, [1, w + 6]));
}
const hookL = (x, y, h) => [[x, y], [x, y - h + 10], [x + 1, y - h + 2], [x + 6, y - h - 2], [x + 12, y - h + 1], [x + 13, y - h + 7]];
const hookR = (x, y, h) => hookL(-x, y, h).map(([a, b]) => [-a, b]);
function bow(P, part, x, y, seed) {
  P.push(part(wob([[x, y], [x - 12, y - 7], [x - 12, y + 7]], true, .4, seed, 6), C.bow, INK, 2.4));
  P.push(part(wob([[x, y], [x + 12, y - 7], [x + 12, y + 7]], true, .4, seed + 1, 6), C.bow, INK, 2.4));
  P.push(part(wob(ell(x, y, 3.5, 3.5, 8), true, .2, seed + 2), C.bow, INK, 2.4));
}
// swirl wedges on an ellipse (peppermint): alternate red wedges
function swirl(P, part, x, y, rx, ry, seed) {
  P.push(part(wob(ell(x, y, rx, ry, 18), true, .5, seed), C.caneWhite, null, 0));
  for (let k = 0; k < 6; k += 2) {
    const pts = [[x, y]]; for (let m = 0; m <= 4; m++) { const a = (k + m / 4) / 6 * Math.PI * 2 + .3; pts.push([x + Math.cos(a) * rx * .95, y + Math.sin(a) * ry * .95]); }
    P.push(part(wob(pts, true, .2, seed + k, 6), C.caneRed, null, 0));
  }
  P.push(part(wob(ell(x, y, rx, ry, 18), true, .5, seed), null, INK, 3));
}
const rot = (pts, cx, cy, a) => pts.map(([px, py]) => [cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a), cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a)]);

export const KINDS = {
  // Candy-cane gate, closed: two hooked posts, two striped bars, a red bow (the ribbon's colour). Wider than a
  // hedge (GATE_HW) so its posts show either side of the hedge standing in front of it in a divider.
  gate(P, part, x, y, s, seed) {
    const h = GATE_H, a = GATE_HW;
    cane(P, part, [[x - a, y - 26], [x + a, y - 26]], seed + 3, 7);
    cane(P, part, [[x - a, y - 54], [x + a, y - 54]], seed + 4, 7);
    cane(P, part, hookL(x - a, y, h), seed, 9); cane(P, part, hookR(x + a, y, h), seed + 1, 9);
    bow(P, part, x, y - 54, seed + 9);
  },
  // Open: each leaf (two bars and an end cane) swung out toward the viewer and to the side; the bow gone.
  gateopen(P, part, x, y, s, seed) {
    const h = GATE_H, a = GATE_HW, o = 20, dn = 14;
    for (const d of [-1, 1]) {
      const px = x + a * d, ex = px + o * d;
      cane(P, part, [[ex, y - 54 + dn - 4], [ex, y - 18 + dn]], seed + 7 + d, 7);
      cane(P, part, [[px, y - 26], [ex, y - 26 + dn]], seed + 3 + d, 7);
      cane(P, part, [[px, y - 54], [ex, y - 54 + dn]], seed + 5 + d, 7);
    }
    cane(P, part, hookL(x - a, y, h), seed, 9); cane(P, part, hookR(x + a, y, h), seed + 1, 9);
  },
  // Tall striped post with a cup on top (the candy is drawn in by the bake's extra()).
  candypost(P, part, x, y, s, seed) {
    cane(P, part, [[x, y], [x, y - 92]], seed, 9, C.postPink);
    P.push(part(wob([[x - 15, y - 96], [x + 15, y - 96], [x + 9, y - 86], [x - 9, y - 86]], true, .4, seed + 1, 6), C.cup, INK, 3));
  },
  bellpost(P, part, x, y, s, seed) { bellPost(P, part, x, y, seed, 0); },
  bellrung(P, part, x, y, s, seed) { bellPost(P, part, x, y, seed, .45); },
  // Peppermint plate, raised (up) or pressed into its dent (down).
  plate(P, part, x, y, s, seed) {
    P.push(part(wob(ell(x, y + 4, 19, 8, 18), true, .5, seed + 5), '#B8322C', INK, 3));
    swirl(P, part, x, y, 19, 8, seed);
  },
  platedown(P, part, x, y, s, seed) {
    P.push(part(wob(ell(x, y + 2, 23, 10, 18), true, .6, seed + 5), '#D3C3A2', '#9d9485', 1.6));
    swirl(P, part, x, y + 3, 17, 7, seed);
  },
  // Stepping stone in the water: a white ripple ring, the flat stone top.
  stone(P, part, x, y, s, seed) {
    P.push(part(wob(ell(x, y + 2, 29, 11, 16), true, .6, seed + 1), null, 'rgba(255,255,255,.85)', 2, [10, 7]));
    P.push(part(wob(ell(x, y, 22, 9.5, 14, .12, seed), true, .8, seed), C.stone, INK, 3.4));
    P.push(part(wob(ell(x - 5, y - 2.5, 10, 3.6, 10), true, .3, seed + 2), C.stoneTop, null, 0));
  },
  // Do-over pumpkin: full orange, ink, a white curly "go back" arrow on its face.
  doover(P, part, x, y, s, seed) {
    const cy = y - 21;
    P.push(part(wob(ell(x, cy, 28, 20, 16, .06, seed), true, 1, seed), C.pumpkin, INK, 4));
    for (const d of [-1, 1]) P.push(part(wob([[x + 9 * d, cy - 19], [x + 15 * d, cy], [x + 9 * d, cy + 19]], false, .5, seed + d), null, INK, 2.6));
    P.push(part(wob([[x - 2, cy - 19], [x - 1, cy - 30], [x + 6, cy - 33], [x + 4, cy - 20]], true, .3, seed + 4, 5), C.stem, INK, 2.6));
    const arc = []; for (let k = 0; k <= 10; k++) { const a = -2.3 + k / 10 * 4.2; arc.push([x + Math.cos(a) * 10, cy + 1 + Math.sin(a) * 9]); }
    const g = wob(arc, false, .2, seed + 6, 4);
    P.push(part(g, null, INK, 8), part(g, null, '#FFFFFF', 4.2));
    const [ex, ey] = arc[0];
    P.push(part(wob([[ex - 7, ey - 2], [ex + 4, ey - 6], [ex + 1, ey + 5]], true, .2, seed + 7, 4), '#FFFFFF', INK, 2.2));
  },
  // The giant pumpkin standee (the pumpkin house): width w px, feet at y. Its door is a separate prop.
  giant(P, part, x, y, w, seed) {
    const rx = w / 2, ry = rx * GIANT_RY, cy = y - ry;
    P.push(part(wob(ell(x, cy, rx, ry, 30, .03, seed), true, 2, seed), C.giant, INK, 5));
    for (const d of [-.62, -.25, .25, .62]) P.push(part(wob([[x + d * rx * .55, cy - ry * .97], [x + d * rx * 1.02, cy], [x + d * rx * .55, cy + ry * .97]], false, 1, seed + d * 10), null, INK, 3));
    P.push(part(wob([[x - 10, cy - ry + 4], [x - 14, cy - ry - 26], [x + 2, cy - ry - 34], [x + 12, cy - ry - 22], [x + 10, cy - ry + 4]], true, .6, seed + 3, 6), C.stem, INK, 4));
    P.push(part(wob([[x + 10, cy - ry - 20], [x + 40, cy - ry - 30], [x + 70, cy - ry - 8], [x + 40, cy - ry - 2]], true, .8, seed + 4, 8), '#7FB24E', INK, 3.4));
    for (const d of [-1, 1]) {   // two round windows, warm light
      P.push(part(wob(ell(x + d * rx * .42, cy - ry * .2, 17, 15, 14), true, .4, seed + 5 + d), C.window, INK, 3.4));
      P.push(part(wob([[x + d * rx * .42, cy - ry * .2 - 15], [x + d * rx * .42, cy - ry * .2 + 15]], false, .2, seed + 7 + d), null, INK, 2.4));
    }
  },
  door(P, part, x, y, s, seed) {
    const w = 34, h = 70, top = [];
    for (let k = 0; k <= 8; k++) { const a = Math.PI + k / 8 * Math.PI; top.push([x + Math.cos(a) * w, y - h + w + Math.sin(a) * w * .8]); }
    const outline = [[x - w, y], ...top, [x + w, y]];
    P.push(part(wob(outline, true, .8, seed, 8), C.door, INK, 4));
    for (const d of [-12, 12]) P.push(part(wob([[x + d, y - 2], [x + d, y - h + w * .4]], false, .4, seed + d), null, C.doorPlank, 2.4));
    P.push(part(wob(ell(x + 20, y - 30, 4.5, 4.5, 8), true, .2, seed + 3), C.knob, INK, 2));
  },
  mat(P, part, x, y, w, seed) {
    P.push(part(wob([[x - w / 2, y - 9], [x + w / 2, y - 10], [x + w / 2 + 6, y + 9], [x - w / 2 - 6, y + 10]], true, .7, seed, 10), C.mat, INK, 3));
  },
  // ---- pencil scenery
  reeds(P, part, x, y, s, seed, L) {
    const r = rng(seed);
    for (let k = 0; k < 5; k++) {
      const bx = x + (k - 2) * 7 + (r() - .5) * 4, h = (34 + r() * 22) * s, lean = (k - 2) * 2.5;
      P.push(part(wob([[bx, y], [bx + lean, y - h]], false, .5, seed + k), null, C.reed, 2.2));
      if (k % 2 === 0) P.push(part(wob(ell(bx + lean, y - h - 2, 3.2, 7, 8), true, .2, seed + 10 + k), C.cattail, L, 1.4));
      else P.push(part(wob([[bx, y - 4], [bx + lean * 3 + 8, y - h * .7], [bx + lean * 2 + 5, y - h * .45]], false, .4, seed + 20 + k), null, C.reed, 1.8));
    }
  },
  lily(P, part, x, y, s, seed) {
    const pts = []; for (let k = 0; k <= 12; k++) { const a = .35 + k / 12 * (Math.PI * 2 - .7); pts.push([x + Math.cos(a) * 15 * s, y + Math.sin(a) * 5.5 * s]); }
    pts.push([x, y]);
    P.push(part(wob(pts, true, .3, seed, 6), C.lily, C.lilyLine, 1.4));
    if (seed % 3 === 0) P.push(part(wob(ell(x - 4 * s, y - 3, 4, 3, 8), true, .2, seed + 1), C.lilyFlower, C.lilyLine, 1.2));
  },
  stall(P, part, x, y, s, seed, L) {   // a little candy stand: counter, poles, a scalloped striped awning, jars
    P.push(part(wob([[x - 52, y - 40], [x - 52, y - 92]], false, .4, seed), null, L, 3), part(wob([[x + 52, y - 40], [x + 52, y - 92]], false, .4, seed + 1), null, L, 3));
    P.push(part(wob([[x - 56, y], [x - 56, y - 40], [x + 56, y - 40], [x + 56, y]], true, .8, seed + 2, 10), C.stallBox, L, 2));
    P.push(part(wob([[x - 56, y - 26], [x + 56, y - 26]], false, .5, seed + 3), null, L, 1.5));
    for (let k = 0; k < 6; k++) {
      const a = x - 62 + k * 124 / 6, b = a + 124 / 6;
      P.push(part(wob([[a, y - 104], [b, y - 104], [b, y - 84], [(a + b) / 2, y - 78], [a, y - 84]], true, .4, seed + 10 + k, 6), k % 2 ? C.awnWhite : C.awnPink, L, 1.6));
    }
    C.jar.forEach((col, k) => P.push(part(wob(ell(x - 28 + k * 28, y - 50, 9, 10, 10), true, .3, seed + 30 + k), col, L, 1.6)));
  },
  baretree(P, part, x, y, s, seed, L) {   // a crooked bare tree: trunk, then forking twigs
    const r = rng(seed), h = 136 * s;
    P.push(part(wob([[x - 9, y], [x - 5, y - h * .5], [x - 1, y - h * .56], [x + 4, y - h * .5], [x + 9, y]], true, .6, seed, 8), C.bark, L, 2.4));
    const twig = (x0, y0, a, len, d) => {
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      P.push(part(wob([[x0, y0], [(x0 + x1) / 2 + (r() - .5) * 4, (y0 + y1) / 2], [x1, y1]], false, .4, seed + d * 13 + (r() * 99 | 0)), null, L, Math.max(1.3, 3.4 - d * .7)));
      if (d < 3) { twig(x1, y1, a - .45 - r() * .3, len * .66, d + 1); twig(x1, y1, a + .4 + r() * .3, len * .62, d + 1); }
    };
    twig(x, y - h * .5, -Math.PI / 2 - .3, h * .32, 0); twig(x, y - h * .5, -Math.PI / 2 + .35, h * .26, 1);
  },
  jack(P, part, x, y, s, seed, L, lw) {   // a little pencil jack-o'-lantern
    const cy = y - 20 * s;
    P.push(part(wob(ell(x, cy, 28 * s, 20 * s, 14, .1, seed), true, 1, seed), C.jack, L, lw));
    P.push(part(wob([[x, cy - 19 * s], [x + 3 * s, cy - 28 * s]], false, .3, seed + 3), null, '#a9987a', 3));
    for (const d of [-1, 1]) P.push(part(wob([[x + d * 13 * s, cy - 8 * s], [x + d * 5 * s, cy - 6 * s], [x + d * 9 * s, cy - 14 * s]], true, .2, seed + d, 4), C.jackEye, null, 0));
    P.push(part(wob([[x - 14 * s, cy + 4 * s], [x - 5 * s, cy + 10 * s], [x, cy + 6 * s], [x + 5 * s, cy + 10 * s], [x + 14 * s, cy + 4 * s], [x, cy + 13 * s]], true, .2, seed + 5, 4), C.jackEye, null, 0));
  },
};

function bellPost(P, part, x, y, seed, tilt) {
  const g = wob([[x, y], [x, y - 96]], false, .35, seed, 8), arm = wob([[x - 2, y - 92], [x + 24, y - 94]], false, .3, seed + 1, 6);
  P.push(part(g, null, INK, 13), part(g, null, C.wood, 8), part(arm, null, INK, 10), part(arm, null, C.wood, 5.5));
  const hx = x + 22, hy = y - 92;
  P.push(part(wob([[hx, hy], [hx, hy + 8]], false, .1, seed + 2), null, INK, 2.2));
  const bellPts = rot([[hx - 5, hy + 8], [hx + 5, hy + 8], [hx + 9, hy + 18], [hx + 13, hy + 30], [hx - 13, hy + 30], [hx - 9, hy + 18]], hx, hy, tilt);
  P.push(part(wob(bellPts, true, .5, seed + 3, 6), C.bell, INK, 3));
  const [kx, ky] = rot([[hx, hy + 33]], hx, hy, tilt)[0];
  P.push(part(wob(ell(kx, ky, 3.6, 3.6, 8), true, .2, seed + 4), C.bell, INK, 2.2));
  bow(P, part, x, y - 62, seed + 5);
  if (tilt) for (const k of [0, 1]) P.push(part(wob([[hx + 18 + k * 7, hy + 10], [hx + 22 + k * 7, hy + 20], [hx + 18 + k * 7, hy + 30]], false, .3, seed + 8 + k), null, INK, 2.2));
}
