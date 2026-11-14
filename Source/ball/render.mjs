// render.mjs jobs.json -- rasterise SVGs with the installed Chrome via puppeteer-core (read from Game/node_modules).
// jobs.json: [{"svg": "/abs/file.svg", "out": "/abs/file.png", "w": 1024, "h": 600, "bg": "none" | "#ffffff"}]
// Set PROJECT_DIR if this file is not in <project>/Source/ball/; CHROME_PATH to override Chrome.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const PROJECT = process.env.PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const req = createRequire(join(PROJECT, 'Game', 'package.json'));
const puppeteer = (await import(pathToFileURL(req.resolve('puppeteer-core')).href)).default;
const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  for (const j of jobs) {
    const src = await readFile(j.svg, 'utf8');
    await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 1 });
    const bg = j.bg && j.bg !== 'none' ? j.bg : 'transparent';
    await page.setContent(`<html><body style="margin:0;background:${bg}">${src}</body></html>`);
    await page.evaluate((w, h) => { const s = document.querySelector('svg'); s.setAttribute('width', w); s.setAttribute('height', h); s.style.display = 'block'; }, j.w, j.h);
    await page.screenshot({ path: j.out, omitBackground: bg === 'transparent', clip: { x: 0, y: 0, width: j.w, height: j.h } });
  }
} finally { await browser.close(); }
