// Headless screenshot of a page in the installed Google Chrome.
// node tools/shot.mjs --out .shots/a.png [--page Game/index.html] [--query "x=12&form=open"]
//                     [--wait 600] [--eval "js"] [--size 844x390] [--dpr 2]
// Starts its own static server rooted at the project folder. Prints page errors and the --eval
// result; exits non-zero if the page logged errors.
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve, launch } from './chrome.mjs';

const args = process.argv.slice(2);
const opt = { out: '.shots/shot.png', page: 'Game/index.html', query: '', wait: '600', eval: '', size: '844x390', dpr: '2' };
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
const [w, h] = opt.size.split('x').map(Number);

const { server, port } = await serve();
const browser = await launch();
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: Number(opt.dpr) });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const url = `http://127.0.0.1:${port}/${opt.page}${opt.query ? '?' + opt.query : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__game && window.__game.ready', { timeout: 20000 }).catch(() => errors.push('timeout: window.__game.ready never set'));
  await new Promise(r => setTimeout(r, Number(opt.wait)));
  if (opt.eval) {
    const res = await page.evaluate(`(async () => { return (${opt.eval}); })()`).catch(e => { errors.push('eval: ' + e.message); });
    if (res !== undefined) console.log('eval:', typeof res === 'string' ? res : JSON.stringify(res));
    await new Promise(r => setTimeout(r, 120));
  }
  const out = resolve(process.cwd(), opt.out);
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log('saved', out);
} finally {
  await browser.close();
  server.close();
}
for (const e of errors) console.error(e);
process.exit(errors.length ? 1 : 0);
