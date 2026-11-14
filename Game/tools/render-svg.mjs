// Re-renders character SVGs to Art/Characters/png/<name>.png (transparent, 1024 px on the long side).
// Usage: node tools/render-svg.mjs fish_folded fish_unfolded
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_DIR, launch } from './chrome.mjs';
const LONG = 1024;
const browser = await launch();
try {
  const page = await browser.newPage();
  for (const name of process.argv.slice(2)) {
    const src = await readFile(join(PROJECT_DIR, 'Art/Characters/svg', name + '.svg'), 'utf8');
    const vb = src.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
    const k = LONG / Math.max(vb[2], vb[3]);
    const w = Math.round(vb[2] * k), h = Math.round(vb[3] * k);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${src}</body></html>`);
    await page.evaluate((w, h) => { const s = document.querySelector('svg'); s.setAttribute('width', w); s.setAttribute('height', h); s.style.display = 'block'; }, w, h);
    await page.screenshot({ path: join(PROJECT_DIR, 'Art/Characters/png', name + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    console.log('wrote', name, w + 'x' + h);
  }
} finally { await browser.close(); }
