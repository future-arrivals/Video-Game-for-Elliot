// Boot, canvas scaling, loop, scene switch.
// The canvas letterboxes to 844:390 (centred on a paper-coloured page) on load and every resize; the
// backing store is capped at device pixel ratio 2. Portrait: a "turn your phone" picture instead.
// Loop: requestAnimationFrame, dt clamped to 50 ms. window.__game exposes scene/setScene/frame for checks.
import { W, H, INK, PEN, PAPER, setBakeScale } from './render/core.js';
import { loadAssets } from './assets.js';
import { createDevScene } from './dev/devscene.js';

export async function startGame({ canvas }) {
  const ctx = canvas.getContext('2d');
  const fit = { S: 1, ox: 0, oy: 0, portrait: false };
  function resize() {
    const vw = innerWidth, vh = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    fit.portrait = vh > vw * 1.05;
    let cw, ch;
    if (fit.portrait) { cw = vw; ch = vh; } else { const s = Math.min(vw / W, vh / H); cw = Math.floor(W * s); ch = Math.floor(H * s); }
    Object.assign(canvas.style, { width: cw + 'px', height: ch + 'px', left: Math.floor((vw - cw) / 2) + 'px', top: Math.floor((vh - ch) / 2) + 'px' });
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    fit.S = fit.portrait ? canvas.width / vw : canvas.width / W;
  }
  resize(); addEventListener('resize', resize);
  setBakeScale(Math.max(1.5, canvas.width / W));

  const game = { scene: null, ready: false, frames: 0 };
  window.__game = game;
  const assets = await loadAssets();
  game.assets = assets;
  game.setScene = s => { game.scene = s; };
  game.setScene(createDevScene(assets));

  function draw(timeMs) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fit.portrait) { drawTurnPhone(ctx, canvas.width, canvas.height, timeMs); return; }
    ctx.setTransform(fit.S, 0, 0, fit.S, 0, 0);
    game.scene.render(ctx, timeMs);
  }
  /** Steps and draws one frame synchronously; returns the draw cost in ms. */
  game.frame = (dt = 1 / 60, timeMs = performance.now()) => {
    game.scene.update(Math.min(dt, .05), null);
    const t0 = performance.now(); draw(timeMs); game.frames++;
    return performance.now() - t0;
  };
  /** Timing run: n frames, returns draw-call cost stats in ms (and with a GPU/raster flush each frame). */
  game.timeFrames = (n = 300, flush = false) => {
    const ts = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now(); game.frame(1 / 60, 1000 + i * 16.7);
      if (flush) ctx.getImageData(0, 0, 1, 1);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b); const q = p => +ts[Math.min(n - 1, Math.floor(p * n))].toFixed(2);
    return { frames: n, mean: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(2), median: q(.5), p95: q(.95), max: q(1) };
  };

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    game.scene.update(dt, null); draw(now); game.frames++;
    requestAnimationFrame(tick);
  }
  draw(last); game.ready = true;
  requestAnimationFrame(tick);
  return game;
}

function drawTurnPhone(ctx, w, h, t) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  const s = Math.min(w, h) / 300; ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const a = -Math.PI / 2 * (0.5 - 0.5 * Math.cos(Math.min(1, (t % 2400) / 1200) * Math.PI));
  ctx.save(); ctx.rotate(a);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(-40, -70, 80, 140, 14); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 56, 5, 0, 7); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = PEN; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 105, -Math.PI * .85, -Math.PI * .45); ctx.stroke();
  ctx.fillStyle = PEN; ctx.beginPath(); const ex = Math.cos(-Math.PI * .45) * 105, ey = Math.sin(-Math.PI * .45) * 105;
  ctx.moveTo(ex + 12, ey - 6); ctx.lineTo(ex - 6, ey - 14); ctx.lineTo(ex - 2, ey + 10); ctx.closePath(); ctx.fill();
  ctx.restore();
}
