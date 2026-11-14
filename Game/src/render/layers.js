// Screen and parallax layers baked once (A2 layer table): sky wash, far sheet (hills, trees, giant
// pumpkin), mid sheet (hedge row), light overlay, pre-blurred foreground. Ported from a2_engine.js bakeLayers.
// A parallax layer is { c, X0, Y0, f }: content drawn in "zoom 1 screen" coordinates.
import { W, H, R, PAPER, mk, rng, wob, ell } from './core.js';
import { blurred } from './sprites.js';

// Field depth pass (Task 7). Opt-in through the `opts` arguments / new functions; battle calls are unchanged.
const HILL2 = true;              // item 5: a second, farther hill line on the far sheet
const FAR_HAZE = .1;             // item 3: cool pale wash over the far sheet (0 = off)
const MID_HAZE = .05;            // item 3: a lighter wash over the mid hedge row
const HAZE = '#E3EBEE';          // the cool haze colour
const CORNER_FRAME = true;       // item 5: dark-ish pre-blurred clumps fixed in the bottom corners
const EERIE = { wash: 'rgba(120,128,200,.10)', vignette: 'rgba(50,40,80,.30)' };   // S5: cooler, a little darker at the edges

export function bakeSky() {
  const c = mk(W * R.DPR, H * R.DPR), g = c.getContext('2d'); g.scale(R.DPR, R.DPR);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#F5E6C8'); gr.addColorStop(.35, '#F8EFDD'); gr.addColorStop(1, PAPER);
  g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
}

/** Far sheet, parallax .25. stageW in world px; the giant pumpkin sits at far-sheet x `px`, scaled by `ps`. */
/** opts (field only): { depth: true } adds the far hill line and the cool haze. */
export function bakeFar(stageW, ps, px, seed = 9, opts = {}) {
  const f = .25, X0 = -520, X1 = stageW * f + 520, Y0 = -70, Y1 = 110;
  const c = mk((X1 - X0) * R.DPR, (Y1 - Y0) * R.DPR), g = c.getContext('2d'); g.scale(R.DPR, R.DPR); g.translate(-X0, -Y0);
  if (opts.depth && HILL2) {                       // farther hills: higher, paler, cooler, thinner line
    const r2 = rng(seed + 77), h2 = [[X0, Y1]];
    for (let x = X0; x <= X1 + 1; x += 210) h2.push([x, 34 + Math.sin(x * .004 + 2.4) * 14 + r2() * 10]);
    h2.push([X1, Y1]); const hp = wob(h2, true, 2, 37, 50);
    g.fillStyle = '#ECE8DA'; g.fill(hp.p); g.strokeStyle = '#cfcbbd'; g.lineWidth = 1.2; g.stroke(hp.p);
  }
  const r = rng(seed), hill = [[X0, Y1]];
  for (let x = X0; x <= X1 + 1; x += 160) hill.push([x, 52 + Math.sin(x * .006 + 1) * 12 + r() * 8]);
  hill.push([X1, Y1]);
  const h1 = wob(hill, true, 2, 31, 40);
  g.fillStyle = '#EFE2C8'; g.fill(h1.p); g.strokeStyle = '#c8b99e'; g.lineWidth = 1.6; g.stroke(h1.p);
  for (let i = 0; i < (X1 - X0) / 70; i++) {
    const x = X0 + r() * (X1 - X0), y = 58 + r() * 22; if (Math.abs(x - px) < 90 * ps + 20) continue;
    const t = wob(ell(x, y - 12, 9, 11, 10), true, .6, i); g.fillStyle = '#E3E3C4'; g.fill(t.p); g.stroke(t.p);
    g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x, y + 6); g.stroke();
  }
  // giant pumpkin landmark: pale but warm, door-mouth glowing. Base drawing ~146 px tall at scale 1.
  const gx = px, gy = 96; g.save(); g.translate(gx, gy); g.scale(ps, ps); g.translate(-gx, -gy);
  const body = wob(ell(gx, gy - 58, 96, 62, 22, .05, 5), true, 2, 32);
  g.fillStyle = '#F4C28A'; g.fill(body.p); g.strokeStyle = '#a7835d'; g.lineWidth = 2.2 / Math.sqrt(ps); g.stroke(body.p);
  for (const d of [-50, -22, 22, 50]) g.stroke(wob([[gx + d * .6, gy - 118], [gx + d, gy - 58], [gx + d * .6, gy + 2]], false, .8, d + 40).p);
  const stem = wob([[gx - 8, gy - 118], [gx - 4, gy - 140], [gx + 8, gy - 146], [gx + 8, gy - 118]], true, .6, 33); g.fillStyle = '#C9B38A'; g.fill(stem.p); g.stroke(stem.p);
  const mouth = wob([[gx - 44, gy - 40], [gx - 30, gy - 30], [gx - 16, gy - 42], [gx, gy - 30], [gx + 16, gy - 42], [gx + 30, gy - 30], [gx + 44, gy - 40], [gx + 36, gy - 10], [gx - 36, gy - 10]], true, .6, 34);
  g.fillStyle = '#FFE7A6'; g.fill(mouth.p); g.stroke(mouth.p);
  for (const d of [-1, 1]) { const e = wob([[gx + d * 34, gy - 82], [gx + d * 18, gy - 64], [gx + d * 46, gy - 64]], true, .4, 35 + d); g.fillStyle = '#FFE7A6'; g.fill(e.p); g.stroke(e.p); }
  g.restore();
  if (opts.depth && FAR_HAZE) haze(g, X0, Y0, X1, Y1, FAR_HAZE);
  return { c, X0, Y0, f };
}
function haze(g, X0, Y0, X1, Y1, a) {
  g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = HAZE; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0); g.restore();
}

/** Mid sheet, parallax .55: the pale hedge row behind the back fence. */
export function bakeMid(stageW, opts = {}) {
  const f = .55, X0 = -520, X1 = stageW * f + 520, Y0 = 40, Y1 = 110;
  const c = mk((X1 - X0) * R.DPR, (Y1 - Y0) * R.DPR), g = c.getContext('2d'); g.scale(R.DPR, R.DPR); g.translate(-X0, -Y0);
  const pts = [[X0, Y1]]; for (let x = X0; x <= X1 + 1; x += 34) pts.push([x, 80 - Math.abs(Math.sin(x * .05)) * 14]); pts.push([X1, Y1]);
  const hd = wob(pts, true, 1.5, 41, 12); g.fillStyle = '#DDE7C6'; g.fill(hd.p); g.strokeStyle = '#a9b693'; g.lineWidth = 1.8; g.stroke(hd.p);
  if (opts.depth && MID_HAZE) haze(g, X0, Y0, X1, Y1, MID_HAZE);
  return { c, X0, Y0, f };
}

/** Afternoon light: warm diagonal wash, 3 light shafts, vignette (screen size). */
/** opts (field only): { eerie: true } swaps the warm wash and vignette for cooler ones (S5 Ghost Field). */
export function bakeLight(dusk = false, opts = {}) {
  const c = mk(W * R.DPR, H * R.DPR), g = c.getContext('2d'); g.scale(R.DPR, R.DPR);
  const ee = !dusk && opts.eerie;
  let gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, dusk ? 'rgba(150,80,160,.20)' : ee ? EERIE.wash : 'rgba(255,196,110,.20)'); gr.addColorStop(1, dusk ? 'rgba(240,120,60,.16)' : 'rgba(255,196,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (const [a, w] of [[60, 70], [210, 40], [330, 90]]) { const sg = g.createLinearGradient(a, 0, a + 160, H); sg.addColorStop(0, `rgba(255,240,200,${dusk ? .05 : .13})`); sg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = sg; g.beginPath(); g.moveTo(a, 0); g.lineTo(a + w, 0); g.lineTo(a + w + 260, H); g.lineTo(a + 260, H); g.fill(); }
  gr = g.createRadialGradient(W / 2, H / 2, W * .32, W / 2, H / 2, W * .66); gr.addColorStop(0, 'rgba(70,45,20,0)'); gr.addColorStop(1, dusk ? 'rgba(40,20,50,.42)' : ee ? EERIE.vignette : 'rgba(80,50,20,.26)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return c;
}

/** Pre-blurred foreground pieces and their placements along the stage (parallax 1.4). Kept low: the
 *  foreground band is the bottom ~34 px; only tips reach up into row 8. */
export function bakeForeground(stageW, seed = 11) {
  const leaf = blurred(g => { g.fillStyle = '#5f8a3c'; g.strokeStyle = '#2f4a1c'; g.lineWidth = 6; const l = wob([[10, 230], [40, 120], [120, 40], [200, 70], [240, 150], [200, 230]], true, 4, 51, 20); g.fill(l.p); g.stroke(l.p); g.beginPath(); g.moveTo(30, 230); g.quadraticCurveTo(110, 140, 190, 90); g.stroke(); }, 250, 240, 7);
  leaf.w = 110; leaf.h = 106;
  const grass = blurred(g => { g.translate(30, 0); g.strokeStyle = '#6d9446'; g.lineWidth = 10; g.lineCap = 'round'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(40 + i * 18, 200); g.quadraticCurveTo(30 + i * 20, 90, 20 + i * 24 + (i % 2) * 30, 10 + (i % 3) * 20); g.stroke(); } }, 280, 200, 7);   // 30 units of padding each side so the blur is never clipped
  grass.w = 140; grass.h = 100;
  const post = blurred(g => { g.fillStyle = '#b89a6c'; g.strokeStyle = '#4a3a24'; g.lineWidth = 6; const p = wob([[30, 260], [26, 30], [60, 4], [94, 30], [90, 260]], true, 2, 52, 20); g.fill(p.p); g.stroke(p.p); }, 120, 260, 7);
  post.w = 50; post.h = 110;
  const r = rng(seed), items = [];
  for (let x = -150; x < stageW * 1.4 + 900; x += 300 + r() * 260) { const k = r(); items.push({ s: k < .5 ? grass : k < .8 ? leaf : post, x, flip: r() < .5, dy: 52 + r() * 30 }); }
  return items;
}

// Like sprites.blurred, but drawn at full size first and halved step by step (each step averages), then
// enlarged step by step: the blur comes out soft instead of a blocky staircase. Bake time only.
function softBlurred(drawFn, w, h, k) {
  const step = (src, nw, nh) => { const n = mk(nw, nh), ng = n.getContext('2d'); ng.imageSmoothingQuality = 'high'; ng.drawImage(src, 0, 0, n.width, n.height); return n; };
  let c = mk(w, h); drawFn(c.getContext('2d'));
  while (c.width / 2 >= w / k) c = step(c, c.width / 2, c.height / 2);
  const tw = w * R.DPR, th = h * R.DPR;
  while (c.width * 2 < tw) c = step(c, c.width * 2, c.height * 2);
  return { c: step(c, tw, th), w, h };
}

/** Screen-fixed frame for the field: two larger, darker, pre-blurred clumps for the bottom corners.
 *  Returns [] when CORNER_FRAME is off. Each: { s: sprite, x (screen left edge), y (screen bottom) }.
 *  They stay below y ~330 near the edges so the path and the touch buttons' centres stay clear. */
export function bakeCornerFrame() {
  if (!CORNER_FRAME) return [];
  // a wedge of dark grass, tallest at the screen edge, with one leaf lying low in it
  const clump = (flip, seed) => softBlurred(g => {
    const r = rng(seed); g.lineCap = 'round';
    if (flip) { g.translate(300, 0); g.scale(-1, 1); }
    g.fillStyle = '#71865f'; g.strokeStyle = '#56684a'; g.lineWidth = 7;
    const l = wob([[-20, 150], [20, 96], [90, 80], [160, 104], [170, 150]], true, 4, seed, 20); g.fill(l.p); g.stroke(l.p);
    for (let i = 0; i < 16; i++) {
      const bx = -10 + i * 17 + r() * 8, top = 10 + i * i * .45 + r() * 22;
      g.strokeStyle = i < 7 ? '#63774f' : '#7c9068'; g.lineWidth = 12 - i * .4;
      g.beginPath(); g.moveTo(bx, 175); g.quadraticCurveTo(bx + 4, (175 + top) / 2, bx + 12 + r() * 24, top); g.stroke();
    }
  }, 300, 170, 8);
  const L = clump(false, 61), Rt = clump(true, 62);
  L.w = 170; L.h = 84; Rt.w = 170; Rt.h = 84;
  return [{ s: L, x: -30, y: H + 20 }, { s: Rt, x: W - 140, y: H + 20 }];
}
