// Before-and-after sheet: puts pairs of screenshots side by side, with labels, in one PNG.
// node tools/sheet.mjs --out .shots/sheets/field.png \
//   --title "Start" --before .shots/before/field-start.png --after .shots/field/start.png \
//   --title "Alcove" --before ... --after ...
// Repeat --title / --before / --after for each row. Paths are relative to the folder you run it from.
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { launch } from './chrome.mjs';

const args = process.argv.slice(2);
let out = '.shots/sheet.png', cur = {};
const rows = [];
for (let i = 0; i < args.length; i += 2) {
  const k = args[i].slice(2), v = args[i + 1];
  if (k === 'out') { out = v; continue; }
  cur[k] = v;
  if (cur.before && cur.after) { rows.push(cur); cur = {}; }
}
if (!rows.length) { console.error('no --before/--after pairs given'); process.exit(1); }

const uri = async p => 'data:image/png;base64,' + (await readFile(resolve(process.cwd(), p))).toString('base64');
const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
let body = '';
for (const r of rows) {
  body += `<section><h2>${esc(r.title)}</h2><div class="pair">
    <figure><figcaption>BEFORE</figcaption><img src="${await uri(r.before)}"></figure>
    <figure><figcaption class="after">AFTER</figcaption><img src="${await uri(r.after)}"></figure></div></section>`;
}
const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 20px 24px 8px; background: #2b2a28; font: 600 15px/1.2 "Avenir Next", Verdana, sans-serif; color: #f4efe4; width: 1712px; }
  h2 { margin: 0 0 8px; font-size: 20px; letter-spacing: .04em; }
  section { margin-bottom: 22px; }
  .pair { display: flex; gap: 24px; }
  figure { margin: 0; }
  figcaption { font-size: 13px; letter-spacing: .12em; color: #b9b2a3; margin-bottom: 5px; }
  figcaption.after { color: #ffe27a; }
  img { display: block; width: 844px; height: 390px; border-radius: 4px; }
</style>${body}`;

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1760, height: 600, deviceScaleFactor: 1.5 });
  await page.setContent(html, { waitUntil: 'load' });
  const path = resolve(process.cwd(), out);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  console.log('saved', path);
} finally {
  await browser.close();
}
