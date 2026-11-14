// Rasterizes the animated parts of a character into one packed atlas per character, for the canvas rig
// runtime (src/render/rig.js). Reads the recipe Game/src/render/rigs/<id>.build.mjs, opens that character's
// demo page (Art/Demos/*_animation_demo.html) in headless Chrome with requestAnimationFrame stubbed out, so the
// demo's own script tags/wraps its parts (ids, brows, food group...) but never poses them, then:
//   1. every part (an element the recipe names) gets its pivot, using the same rules as the demo;
//   2. the drawing under the root is cut into layers: a layer is a run of consecutive drawn elements that belong
//      to the same innermost part, so draw order is exactly the SVG's;
//   3. each layer is rendered on its own (the whole <svg> cloned with every other drawn element removed, so
//      <defs>, inherited stroke caps etc. still apply), cropped to its pixels and shelf-packed into atlas.png.
// Output: Game/assets/rigs/<id>/atlas.png + rig.json (format: see the top of src/render/rig.js).
//   node tools/rigparts.mjs            (every rigs/*.build.mjs)
//   node tools/rigparts.mjs monster    (one character)
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAME_DIR, serve, launch } from './chrome.mjs';

const RIGS_SRC = join(GAME_DIR, 'src/render/rigs');
let ids = process.argv.slice(2);
if (!ids.length) ids = (await readdir(RIGS_SRC)).filter(f => f.endsWith('.build.mjs')).map(f => f.replace('.build.mjs', ''));

// Runs inside the demo page. Returns { png: dataURL, rig: {...}, notes: [] }.
async function capture(spec) {
  const notes = [];
  const root = document.querySelector(spec.root);
  if (!root) throw new Error('root not found: ' + spec.root);
  const svg = root.ownerSVGElement;
  const rc = svg.getScreenCTM().inverse().multiply(root.getScreenCTM());   // root user space -> viewBox space
  if (Math.abs(rc.a - 1) + Math.abs(rc.b) + Math.abs(rc.c) + Math.abs(rc.d - 1) + Math.abs(rc.e) + Math.abs(rc.f) > 1e-6)
    throw new Error('root has a transform at rest; rigparts expects the root\'s user space to be the svg viewBox space');
  const rootInv = root.getScreenCTM().inverse();
  const toRoot = el => rootInv.multiply(el.getScreenCTM());
  const DEFS = 'defs,symbol,clipPath,mask,pattern,linearGradient,radialGradient,filter,marker';
  const LEAF = 'path,circle,ellipse,rect,polygon,polyline,line,use,text,image';
  const isLeaf = el => el.matches(LEAF) && !el.closest(DEFS);

  /* ---- parts ---- */
  const partOf = new Map(); const parts = [];
  const addPart = (name, els, piv) => { const p = { name, els, piv }; parts.push(p); for (const e of els) partOf.set(e, p); };
  if (spec.ids) for (const el of root.querySelectorAll('[id]')) if (!el.closest(DEFS)) addPart(el.id, [el]);
  for (const [name, p] of Object.entries(spec.parts || {})) {
    const els = [...root.querySelectorAll(p.sel)]; if (!els.length) throw new Error(`part ${name}: nothing matches ${p.sel}`);
    const old = parts.findIndex(q => q.name === name); if (old >= 0) parts.splice(old, 1);
    addPart(name, els, p.pivot);
  }
  const first = p => p.els[0];
  parts.sort((a, b) => first(a) === first(b) ? 0 : first(a).compareDocumentPosition(first(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const bboxRoot = (els) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const el of els) {
      const b = el.getBBox(), m = toRoot(el);
      for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
        const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
        x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const ident = el => { const m = toRoot(el.parentNode); return Math.abs(m.a - 1) + Math.abs(m.d - 1) + Math.abs(m.b) + Math.abs(m.c) + Math.abs(m.e) + Math.abs(m.f) < 1e-6; };
  for (const p of parts) {
    let rule = p.piv || spec.pivots?.[p.name];
    if (!rule) for (const [re, r] of spec.pivotRules || []) if (new RegExp(re).test(p.name)) { rule = r; break; }
    rule = rule || 'center';
    const bb = bboxRoot(p.els);
    const centre = [bb.x + bb.w / 2, bb.y + bb.h / 2];
    if (Array.isArray(rule)) p.pivot = rule;
    else if (rule === 'center') p.pivot = centre;
    else if (rule === 'start') {          // demo: first <path> under the part, its "M x y"
      const path = p.els[0].matches('path') ? p.els[0] : p.els[0].querySelector('path');
      const m = path && /M\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(path.getAttribute('d'));
      p.pivot = m ? [+m[1], +m[2]] : centre;
    } else if (rule.startsWith('near:')) { // heartfin/scoops: the end of the first path nearest to x
      const x = +rule.slice(5), path = p.els[0].matches('path') ? p.els[0] : p.els[0].querySelector('path');
      const L = path.getTotalLength(), a = path.getPointAtLength(0), z = path.getPointAtLength(L);
      p.pivot = Math.abs(a.x - x) < Math.abs(z.x - x) ? [a.x, a.y] : [z.x, z.y];
    } else if (rule === 'pt0') { const path = p.els[0].matches('path') ? p.els[0] : p.els[0].querySelector('path'); const a = path.getPointAtLength(0); p.pivot = [a.x, a.y]; }
    else throw new Error(`part ${p.name}: unknown pivot rule ${rule}`);
    if (!ident(p.els[0])) notes.push(`part ${p.name} sits under an authored transform; its pivot is taken in root space`);
    // parent: nearest ancestor element that is a part
    let a = p.els[0].parentNode; p.parent = -1;
    while (a && a !== root) { const q = partOf.get(a); if (q) { p.parent = parts.indexOf(q); break; } a = a.parentNode; }
  }

  /* ---- layers: runs of drawn elements with the same innermost part ---- */
  const leaves = [...root.querySelectorAll(LEAF)].filter(isLeaf);
  const layers = []; let cur = null;
  for (const el of leaves) {
    let a = el, p = null; while (a && a !== root) { p = partOf.get(a); if (p) break; a = a.parentNode; }
    if (!p) { notes.push('drawn element outside every part (dropped): ' + el.outerHTML.slice(0, 80)); continue; }
    if (!cur || cur.part !== p) { cur = { part: p, els: [] }; layers.push(cur); }
    cur.els.push(el);
  }
  for (const el of svg.querySelectorAll('[data-rl]')) el.removeAttribute('data-rl');
  layers.forEach((L, i) => L.els.forEach(e => e.setAttribute('data-rl', i)));

  /* ---- rasterize each layer ---- */
  const S = spec.scale;
  const load = src => new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('svg layer failed to load')); im.src = src; });
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    let sw = 0; for (const e of L.els) sw = Math.max(sw, parseFloat(getComputedStyle(e).strokeWidth) || 0);
    const pad = sw + 4, bb = bboxRoot(L.els);
    const vx = Math.floor((bb.x - pad) * S) / S, vy = Math.floor((bb.y - pad) * S) / S;
    const W = Math.ceil((bb.x + bb.w + pad - vx) * S), H = Math.ceil((bb.y + bb.h + pad - vy) * S);
    const cl = svg.cloneNode(true);
    for (const e of [...cl.querySelectorAll(LEAF)]) if (!e.closest(DEFS) && e.getAttribute('data-rl') !== String(i)) e.remove();
    cl.removeAttribute('style'); cl.removeAttribute('class');
    cl.setAttribute('viewBox', `${vx} ${vy} ${W / S} ${H / S}`); cl.setAttribute('width', W); cl.setAttribute('height', H);
    cl.setAttribute('preserveAspectRatio', 'none');
    const xml = new XMLSerializer().serializeToString(cl);
    const im = await load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let l = W, t = H, r = -1, b = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    if (r < 0) { L.empty = true; continue; }
    const cw = r - l + 1, ch = b - t + 1, cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
    cc.getContext('2d').drawImage(c, l, t, cw, ch, 0, 0, cw, ch);
    Object.assign(L, { c: cc, w: cw, h: ch, ox: vx + l / S, oy: vy + t / S });
    if (l === 0 || t === 0 || r === W - 1 || b === H - 1) notes.push(`layer ${i} (${L.part.name}) touches its render edge; raise the pad`);
  }
  const live = layers.filter(L => !L.empty);

  /* ---- shelf-pack ---- */
  const G = 2; // gutter px between rects (keeps bilinear sampling from bleeding neighbours)
  const area = live.reduce((s, L) => s + (L.w + G) * (L.h + G), 0);
  const AW = Math.max(Math.max(...live.map(L => L.w + G)), Math.ceil(Math.sqrt(area * 1.12) / 4) * 4);
  const order = [...live].sort((a, b) => b.h - a.h);
  let x = 0, y = 0, rowH = 0;
  for (const L of order) {
    if (x + L.w + G > AW) { x = 0; y += rowH; rowH = 0; }
    L.ax = x; L.ay = y; x += L.w + G; rowH = Math.max(rowH, L.h + G);
  }
  const AH = y + rowH;
  const atlas = document.createElement('canvas'); atlas.width = AW; atlas.height = AH;
  const ag = atlas.getContext('2d'); for (const L of live) ag.drawImage(L.c, L.ax, L.ay);
  for (const el of svg.querySelectorAll('[data-rl]')) el.removeAttribute('data-rl');

  const r2 = n => Math.round(n * 100) / 100;
  const rig = {
    v: 1, id: spec.id, scale: S, atlas: [AW, AH],
    parts: parts.map(p => [p.name, p.parent, r2(p.pivot[0]), r2(p.pivot[1])]),
    layers: live.map(L => [parts.indexOf(L.part), L.ax, L.ay, L.w, L.h, r2(L.ox), r2(L.oy)]),
  };
  return { png: atlas.toDataURL('image/png'), rig, notes, used: live.reduce((s, L) => s + L.w * L.h, 0) };
}

const { server, port } = await serve();
const browser = await launch();
try {
  for (const id of ids) {
    const spec = (await import(pathToFileURL(join(RIGS_SRC, id + '.build.mjs')).href)).default;
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(`http://127.0.0.1:${port}/${spec.demo}`, { waitUntil: 'load' });
    if (errors.length) throw new Error(`${spec.demo}: ${errors.join('; ')}`);
    const res = await page.evaluate(capture, spec);
    await page.close();
    const out = join(GAME_DIR, 'assets/rigs', id); await mkdir(out, { recursive: true });
    const png = join(out, 'atlas.png');
    await writeFile(png, Buffer.from(res.png.split(',')[1], 'base64'));
    // 256-colour palette with alpha (flat marker colours + their anti-aliasing): ~4x smaller than RGBA and not
    // visibly different. build.mjs keeps it as a palette PNG (ASSET_LIST entry `palette: true`).
    execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGBA")\nim.quantize(256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(sys.argv[1],optimize=True)', png]);
    await writeFile(join(out, 'rig.json'), JSON.stringify(res.rig) + '\n');
    for (const n of res.notes) console.log('  note:', n);
    const [AW, AH] = res.rig.atlas;
    console.log(`${id}: ${res.rig.parts.length} parts, ${res.rig.layers.length} layers, atlas ${AW}x${AH} (${Math.round(100 * res.used / (AW * AH))}% used) -> ${out}`);
  }
} finally { await browser.close(); server.close(); }
