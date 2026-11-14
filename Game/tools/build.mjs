// Single-file build: bundles src/main.js with esbuild (IIFE, minified), embeds the PNGs the game uses as
// data URIs (downscaled with python3 + PIL to at most twice their largest on-screen height), and writes
// Game/dist/elliot-game.html.   node tools/build.mjs
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME_DIR } from './chrome.mjs';
import { ASSET_LIST, RIG_LIST } from '../src/assets.js';

const tmp = mkdtempSync(join(tmpdir(), 'elliot-build-'));
try {
  // 1. downscale the assets
  const jobs = Object.entries(ASSET_LIST).map(([k, a]) => [join(GAME_DIR, a.path), join(tmp, k + '.png'), a.maxH * 2, !!a.palette]);
  const py = `
import json, sys
from PIL import Image
for src, dst, h, pal in json.loads(sys.argv[1]):
    im = Image.open(src)
    if pal and im.mode == 'P' and im.height <= h:
        im.save(dst, optimize=True)   # rig atlases: already a 256-colour palette PNG, keep it
        continue
    im = im.convert('RGBA')
    if im.height > h:
        im = im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
    im.save(dst, optimize=True)
`;
  execFileSync('python3', ['-I', '-c', py, JSON.stringify(jobs)], { stdio: 'inherit' });
  const assets = Object.fromEntries(Object.keys(ASSET_LIST).map(k => [k, 'data:image/png;base64,' + readFileSync(join(tmp, k + '.png')).toString('base64')]));
  // rig layouts (tools/rigparts.mjs), embedded next to their atlases
  const rigs = Object.fromEntries(Object.entries(RIG_LIST).map(([id, p]) => [id, JSON.parse(readFileSync(join(GAME_DIR, p), 'utf8'))]));

  // 2. bundle the code
  const out = await build({
    stdin: { contents: "import { startGame } from './main.js'; startGame({ canvas: document.getElementById('game') });", resolveDir: join(GAME_DIR, 'src'), loader: 'js' },
    bundle: true, format: 'iife', minify: true, write: false, target: ['es2020'], legalComments: 'none',
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

  // 3. one HTML file
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="data:,"><title>Elliot's Paper Game</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#EFE6D2;touch-action:none}canvas{position:absolute;display:block;background:#FBF8F0}</style>
</head><body><canvas id="game"></canvas>
<script>window.__ASSETS__=${JSON.stringify(assets)};window.__RIGS__=${JSON.stringify(rigs)};</script>
<script>${js}</script>
</body></html>
`;
  mkdirSync(join(GAME_DIR, 'dist'), { recursive: true });
  const file = join(GAME_DIR, 'dist/elliot-game.html');
  writeFileSync(file, html);
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`wrote ${file}: ${kb(statSync(file).size)} (code ${kb(js.length)}, images ${kb(Object.values(assets).reduce((a, s) => a + s.length, 0))})`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
