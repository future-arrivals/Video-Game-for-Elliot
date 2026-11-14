// Sprite baking: everything is pre-scaled into offscreen canvases at load (ported from a2_engine.js).
// A sprite is { c: canvas, w, h } where w,h are its display size in logical px; c is w*BS x h*BS.
import { R, mk } from './core.js';

/** Bakes an image (or canvas) pre-scaled to display height h. Optional srcRect [sx, sy, sw, sh] in image px. */
export function bakeSprite(im, h, srcRect) {
  const [sx, sy, sw, sh] = srcRect || [0, 0, im.width, im.height];
  const w = h * sw / sh; const c = mk(w * R.BS, h * R.BS);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  // two-step downscale for big reductions (keeps marker lines smooth without filters)
  if (sh > c.height * 2.5) {
    const m = mk(c.width * 2, c.height * 2), mg = m.getContext('2d'); mg.imageSmoothingQuality = 'high';
    mg.drawImage(im, sx, sy, sw, sh, 0, 0, m.width, m.height); g.drawImage(m, 0, 0, c.width, c.height);
  } else g.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { c, w, h };
}

/** Opaque bounds of an image as fractions {l, t, r, b} (measured once at load on a small copy). */
export function alphaBounds(im) {
  const S = 256, k = S / Math.max(im.width, im.height);
  const c = mk(im.width * k, im.height * k), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let l = c.width, t = c.height, r = 0, b = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) {
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  return { l: l / c.width, t: t / c.height, r: (r + 1) / c.width, b: (b + 1) / c.height };
}

/** Cream paper cut-out behind a sprite (for dark scenes): silhouette stamped in 16 directions. */
export function haloOf(s, r, col) {
  const c = mk(s.c.width + r * 2 * R.BS, s.c.height + r * 2 * R.BS), g = c.getContext('2d');
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.drawImage(s.c, r * R.BS + Math.cos(a) * r * R.BS, r * R.BS + Math.sin(a) * r * R.BS); }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return { c, w: s.w + 2 * r, h: s.h + 2 * r };
}
/** Copy of a sprite washed with a colour (source-atop), e.g. the darker "back of the paper". */
export function tinted(s, col) {
  const c = mk(s.c.width, s.c.height), g = c.getContext('2d');
  g.drawImage(s.c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return { c, w: s.w, h: s.h };
}
/** Fake depth of field: draw small, scale up (no filters). drawFn draws in w x h units. */
export function blurred(drawFn, w, h, k = 6) {
  const sm = mk(w / k, h / k), g = sm.getContext('2d'); g.scale(1 / k, 1 / k); drawFn(g);
  const c = mk(w * R.DPR, h * R.DPR), g2 = c.getContext('2d'); g2.imageSmoothingQuality = 'high'; g2.drawImage(sm, 0, 0, c.width, c.height);
  return { c, w, h };
}
/** Elliptical radial gradient sprite (contact shadow, glow, light pool). */
export function radial(w, h, stops) {
  const c = mk(w * R.DPR, h * R.DPR), g = c.getContext('2d'); g.scale(R.DPR * w / h, R.DPR);
  const gr = g.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, h, h); return { c, w, h };
}
/** Draws a sprite anchored at its bottom centre. */
export function blit(ctx, s, cx, by, sx = 1, sy = 1, rot = 0, alpha = 1) {
  ctx.save(); ctx.translate(cx, by); if (rot) ctx.rotate(rot); ctx.scale(sx, sy); if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(s.c, -s.w / 2, -s.h, s.w, s.h); ctx.restore();
}

/** Colours in a line drawing at load: flood-fills the pale paper areas reached from each seed
 *  [fx, fy, '#rrggbb'] (fractions of the image size). Returns a canvas the same size as the image. */
export function colourIn(im, seeds) {
  const c = mk(im.width, im.height), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0); const W = c.width, H = c.height;
  const id = g.getImageData(0, 0, W, H), d = id.data, seen = new Uint8Array(W * H);
  const pale = i => d[i * 4 + 3] > 200 && d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] > 600;
  for (const [fx, fy, col] of seeds) {
    const r = parseInt(col.slice(1, 3), 16), gr = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
    const st = [Math.floor(fy * H) * W + Math.floor(fx * W)];
    while (st.length) {
      const i = st.pop(); if (seen[i] || !pale(i)) continue; seen[i] = 1;
      d[i * 4] = r; d[i * 4 + 1] = gr; d[i * 4 + 2] = b;
      const x = i % W; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < W * (H - 1)) st.push(i + W);
    }
  }
  g.putImageData(id, 0, 0); return c;
}
/** Line art with a paper body: every transparent pixel the outside cannot reach (flooding in from the
 *  image border through transparent pixels) is painted `col` underneath the lines. Small gaps in the
 *  lines (up to about 2*gap px on a 512 px working copy) are bridged so a body with a nick still fills.
 *  Done once at load. Returns a canvas the same size as the image. */
export function paperFilled(im, col = '#FBF8F0', gap = 3) {
  const S = 512, k = Math.min(1, S / Math.max(im.width, im.height));
  const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
  const sm = mk(w, h), sg = sm.getContext('2d', { willReadFrequently: true });
  sg.drawImage(im, 0, 0, w, h);
  const d = sg.getImageData(0, 0, w, h).data, N = w * h;
  const wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) wall[i] = d[i * 4 + 3] > 90 ? 1 : 0;
  const fat = dilate(wall, w, h, gap);                       // closes small gaps in the lines
  // flood the outside from the border through non-wall pixels
  const out = new Uint8Array(N), st = new Int32Array(N); let sp = 0;
  const seed = i => { if (!fat[i] && !out[i]) { out[i] = 1; st[sp++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) {
    const i = st[--sp], x = i % w;
    if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (i >= w) seed(i - w); if (i < N - w) seed(i + w);
  }
  const outside = dilate(out, w, h, gap);                    // give back what the fat lines took
  const fill = mk(w, h), fg = fill.getContext('2d'), fd = fg.createImageData(w, h);
  const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
  for (let i = 0; i < N; i++) if (!outside[i]) { fd.data[i * 4] = r; fd.data[i * 4 + 1] = g; fd.data[i * 4 + 2] = b; fd.data[i * 4 + 3] = 255; }
  fg.putImageData(fd, 0, 0);
  const c = mk(im.width, im.height), cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high';
  cg.drawImage(fill, 0, 0, im.width, im.height);
  cg.drawImage(im, 0, 0);
  return c;
}
// Square dilation of a 0/1 mask by r px (separable running max).
function dilate(m, w, h, r) {
  if (r <= 0) return m;
  const a = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let cnt = 0; const row = y * w;
    for (let x = 0; x < Math.min(w, r); x++) cnt += m[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) cnt += m[row + x + r];
      if (x - r - 1 >= 0) cnt -= m[row + x - r - 1];
      a[row + x] = cnt > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = 0; y < Math.min(h, r); y++) cnt += a[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) cnt += a[(y + r) * w + x];
      if (y - r - 1 >= 0) cnt -= a[(y - r - 1) * w + x];
      o[y * w + x] = cnt > 0 ? 1 : 0;
    }
  }
  return o;
}

/** His wrapped-candy drawing, coloured in (pink wrapper, red middle). Cached on assets. */
export function candyArt(assets) {
  return assets.cache.candyArt || (assets.cache.candyArt = colourIn(assets.img.candy, [[.16, .42, '#E99DBB'], [.78, .55, '#E99DBB'], [.44, .55, '#D03C30']]));
}
