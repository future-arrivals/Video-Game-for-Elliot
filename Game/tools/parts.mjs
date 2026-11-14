// Rasterizes the hinge part layers of the unfolded character SVGs into Game/assets/parts/*.png,
// so the fold can be animated as real paper panels (manifest hinge lines) without loading SVG at runtime.
// Each layer is the full unfolded viewBox with only some `part-*` groups visible, rendered at the same
// pixel size as the matching Art/Characters/png/<x>_unfolded.png. Re-run after the SVGs change:
//   node tools/parts.mjs
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_DIR, GAME_DIR, launch } from './chrome.mjs';

const JOBS = [
  { svg: 'monster_unfolded', layers: { monster_inside: ['part-inside'], monster_bottom: ['part-bottom'], monster_top: ['part-top'] } },
  { svg: 'fish_unfolded', layers: {
    fish_mid: ['part-fin-left', 'part-fin-right', 'part-seg-1', 'part-seg-2', 'part-seg-3', 'part-seg-4', 'part-seg-5'],
    fish_head: ['part-head'], fish_tail: ['part-tail'] } },
];
const LONG = 1024;
const outDir = join(GAME_DIR, 'assets/parts');
await mkdir(outDir, { recursive: true });
const browser = await launch();
try {
  const page = await browser.newPage();
  for (const job of JOBS) {
    const src = await readFile(join(PROJECT_DIR, 'Art/Characters/svg', job.svg + '.svg'), 'utf8');
    const vb = src.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
    const k = LONG / Math.max(vb[2], vb[3]);
    const w = Math.round(vb[2] * k), h = Math.round(vb[3] * k);
    for (const [name, keep] of Object.entries(job.layers)) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.setContent(`<html><body style="margin:0;background:transparent">${src}</body></html>`);
      await page.evaluate((keep, w, h) => {
        const svg = document.querySelector('svg'); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.style.display = 'block';
        for (const g of svg.querySelectorAll('g[id^="part-"]')) {
          if (g.parentElement.closest('g[id^="part-"]')) continue;          // only top-level panels
          if (!keep.includes(g.id)) g.style.display = 'none';
        }
      }, keep, w, h);
      await page.screenshot({ path: join(outDir, name + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
      console.log('wrote', name, w + 'x' + h);
    }
  }
} finally { await browser.close(); }
