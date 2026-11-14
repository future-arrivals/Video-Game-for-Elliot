// Whole-stage pictures: one PNG per stage, end to end, stitched from camera positions 844 px apart.
// node tools/stages.mjs [--stages S1,S2] [--query "party=3"] [--out .shots/m2] [--scale 1.5]
// Each stage opens the game with ?stage=Sn (the team at the stage start; party as --query says, default the
// monster alone so the waiting friends show), then draws only the stage (no HUD) with the stage view at
// zoom 1 for each camera position. Parallax layers (far and mid sheets, foreground) jump at the seams;
// that is expected. Prints page errors; exits non-zero if there were any.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serve, launch } from './chrome.mjs';

const args = process.argv.slice(2);
const opt = { stages: 'S1,S2,S3,S4,S5,S6', query: '', out: '.shots/m2', scale: '1.5', wait: '1500' };
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];

const { server, port } = await serve();
const browser = await launch();
const errors = [];
try {
  await mkdir(resolve(process.cwd(), opt.out), { recursive: true });
  for (const id of opt.stages.split(',')) {
    const page = await browser.newPage();
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: Number(opt.scale) });
    page.on('pageerror', e => errors.push(`${id} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${id} console: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/Game/index.html?stage=${id}&fresh=1${opt.query ? '&' + opt.query : ''}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__game && window.__game.ready', { timeout: 20000 }).catch(() => errors.push(`${id}: game never ready`));
    await new Promise(r => setTimeout(r, Number(opt.wait)));
    const url = await page.evaluate(async (scale) => {
      const g = window.__game; g.freeze = true;
      const { renderStage } = await import('/Game/src/render/stageview.js');
      const sc = g.fieldScene, view = sc.view, W = 844, H = 390, stageW = view.stageW;
      const out = document.createElement('canvas'); out.width = Math.round(stageW * scale); out.height = Math.round(H * scale);
      const o = out.getContext('2d');
      const tmp = document.createElement('canvas'); tmp.width = Math.round(W * scale); tmp.height = Math.round(H * scale);
      const t = tmp.getContext('2d');
      for (let x = 0; x < stageW; x += W) {
        const left = Math.min(x, Math.max(0, stageW - W));
        t.setTransform(scale, 0, 0, scale, 0, 0); t.clearRect(0, 0, W, H);
        renderStage(t, view, sc.field, { cx: left + W / 2, cy: H / 2, z: 1 }, 1000);
        o.drawImage(tmp, Math.round(left * scale), 0);
        if (left !== x) break;
      }
      return out.toDataURL('image/png');
    }, Number(opt.scale)).catch(e => { errors.push(`${id} eval: ${e.message}`); return null; });
    if (url) {
      const file = resolve(process.cwd(), opt.out, `stage-${id}.png`);
      await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log('saved', file);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
for (const e of errors) console.error(e);
process.exit(errors.length ? 1 : 0);
