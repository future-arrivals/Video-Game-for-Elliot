// Boot, canvas scaling, loop, scene switch.
// The canvas letterboxes to 844:390 (centred on a paper-coloured page) on load and every resize; the
// backing store is capped at device pixel ratio 2. Portrait: a "turn your phone" picture instead.
// Loop: requestAnimationFrame, dt clamped to 50 ms. Each step polls one InputFrame and hands it to the scene.
// Scenes: the field, a battle, and the page turn between them (input is polled but ignored during a turn).
// A field 'battle' event: the field freezes, the battle sting plays, a 60 ms flash, then the field page turns
// away (right to left) revealing the battle; its onDone applies the result to the field and turns back (left
// to right). On boot, a battle the save says was running is started again the same way.
// window.__game, for scripted checks:
//   scene, setScene(s), frame(dt), timeFrames(n),
//   state()              the FieldState (in every mode; the field is frozen during a battle)
//   battle()             the BattleState during a battle (also while its pages turn), else null
//   mode()               'field' | 'battle' | 'transition' (a battle page turn, or the field's stage slide)
//   press(name)          queue a one-frame button press ('cross', 'square', 'r1', 'options', ...; 'padLost' fakes a pad loss)
//   move(x, y, seconds)  hold a movement vector for that long (simulated seconds)
//   hold(name, on)       hold or release a trigger ('r2' = dash in the field, Run in a battle; 'l2')
//   tick(seconds)        advance the simulation synchronously in 1/60 s steps, then draw once
//   freeze = true        the real-time loop keeps drawing but stops stepping (for still screenshots)
// These are merged into the same InputFrame the devices produce.
import { W, H, INK, PEN, PAPER, setBakeScale, clamp } from './render/core.js';
import { pageReveal, flash } from './render/fx.js';
import { loadAssets } from './assets.js';
import data from './data/slice.gen.js';
import { createInput } from './input/input.js';
import { createAudio } from './audio.js';
import { loadSave } from './save.js';
import { createFieldScene } from './scenes/fieldscene.js';
import { createBattleScene } from './scenes/battlescene.js';
import { createBattle } from './battle/battle.js';

const FLASH_MS = 60, SWEEP_MS = 440;          // page turn: style notes, about 0.5 s in all

function openStorage() {
  try {
    const s = window.localStorage, k = '__elliot_probe';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return null; }                 // private browsing or blocked storage: play without saving
}

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
  const input = createInput(canvas, {
    toLogical: (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return [(cx - r.left) * W / (r.width || 1), (cy - r.top) * H / (r.height || 1)];
    },
  });
  const audio = createAudio();
  const storage = openStorage();
  const query = new URLSearchParams(location.search);
  const settings = { steadyCam: false, ...(loadSave(storage)?.settings || {}) };
  if (query.has('steady')) settings.steadyCam = query.get('steady') !== '0';
  Object.assign(game, { input, audio, storage, settings, data });

  // scripted input, merged into the next frames
  const inject = { presses: [], move: null, holds: { l2: false, r2: false }, held: { l2: 0, r2: 0 } };
  game.press = name => { inject.presses.push(String(name)); };
  game.hold = (name, on) => { if (name in inject.holds) inject.holds[name] = !!on; };
  game.move = (x, y, seconds) => { inject.move = { x: Number(x) || 0, y: Number(y) || 0, left: Number(seconds) || 0 }; };
  function pollFrame(dt) {
    const f = input.poll(dt);
    if (inject.presses.length) {
      const n = inject.presses.shift();
      if (n === 'padLost') f.padLost = true; else f.pressed = { ...f.pressed, [n]: true };
    }
    if (inject.move && inject.move.left > 0) {
      f.moveX = inject.move.x; f.moveY = inject.move.y;
      inject.move.left -= dt; if (inject.move.left <= 1e-9) inject.move = null;
    }
    for (const k of ['l2', 'r2']) {
      inject.held[k] = inject.holds[k] ? inject.held[k] + dt : 0;
      if (inject.held[k]) f.held = { ...f.held, [k]: Math.max((f.held && f.held[k]) || 0, inject.held[k]) };
    }
    if (inject.holds.r2) f.dash = true;
    if (Object.values(f.pressed).some(Boolean) || f.taps.length) audio.unlock();
    return f;
  }
  function step(dt) { game.scene.update(dt, pollFrame(dt)); }

  game.setScene = s => { game.scene = s; if (s && s.inputMode) input.setMode(s.inputMode); else input.setMode('field'); };
  const field = createFieldScene({ assets, data, input, audio, storage, settings, query, onBattle: startBattle });
  let battleScene = null;

  // A field 'battle' event (or a battle restarted from the save).
  function startBattle(info) {
    const battle = createBattle({ data, party: info.party, lead: 0, enemy: info.kind, dizzy: !!info.sneak });
    const scene = createBattleScene({ assets, data, battle, audio, backdrop: { stage: field.stage },
      settings: { quickPlay: !!settings.quickPlay, reduceFlash: !!settings.reduceFlash },
      onDone: r => endBattle(info, scene, r) });
    battleScene = scene;
    scene.update(0, idleFrame());                      // the battle's first step plays its sting: now, as the page turns
    game.setScene(pageTurn(field, scene, 1, () => game.setScene(scene)));
  }
  // The battle's onDone (called from inside its update): apply the result, then turn the page back.
  function endBattle(info, scene, r) {
    field.resumeFromBattle({ outcome: r.outcome, creatureUid: info.creatureUid, hearts: r.hearts, candyDrop: r.candyDrop || 0 });
    game.setScene(pageTurn(scene, field, -1, () => { battleScene = null; game.setScene(field); }));
  }
  // The page-turn scene: `from` stays frozen on screen, `to` is revealed under it. No input reaches either.
  function pageTurn(from, to, dir, onEnd) {
    let ms = 0, frozenAt = null, ended = false;
    const lead = dir > 0 ? FLASH_MS : 0;             // the flash only on the way in
    return {
      transition: true, inputMode: from.inputMode,
      update(dt) {
        ms += dt * 1000;
        if (ms >= lead + SWEEP_MS && !ended) { ended = true; onEnd(); }
      },
      render(ctx, timeMs) {
        if (frozenAt == null) frozenAt = timeMs;
        to.render(ctx, frozenAt);
        pageReveal(ctx, clamp((ms - lead) / SWEEP_MS), dir, g => from.render(g, frozenAt));
        if (ms < lead) flash(ctx, ms * 120 / FLASH_MS);   // one flash, under 0.7 opacity, gone in 60 ms
      },
    };
  }
  function idleFrame() {
    return { moveX: 0, moveY: 0, dash: false, pressed: {}, held: { l2: 0, r2: 0 }, taps: [], longPress: [], holding: [], source: 'keyboard', gamepadConnected: false };
  }

  game.fieldScene = field;
  game.setScene(field);
  game.state = () => field.field;
  game.battle = () => (battleScene ? battleScene.state : null);
  game.mode = () => (game.scene && (game.scene.transition || game.scene.travelling) ? 'transition' : game.scene === field ? 'field' : 'battle');
  if (field.pendingBattle) field.startPendingBattle(field.pendingBattle);   // closed mid-battle: start it again

  function draw(timeMs) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fit.portrait) { drawTurnPhone(ctx, canvas.width, canvas.height, timeMs); return; }
    ctx.setTransform(fit.S, 0, 0, fit.S, 0, 0);
    game.scene.render(ctx, timeMs);
  }
  /** Steps and draws one frame synchronously; returns the draw cost in ms. */
  game.frame = (dt = 1 / 60, timeMs = performance.now()) => {
    step(Math.min(dt, .05));
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

  /** Advances the simulation synchronously in 1/60 s steps (no waiting for real time), then draws. */
  game.tick = (seconds = 1 / 60) => {
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) step(1 / 60);
    draw(performance.now()); game.frames++;
    return game.state();
  };

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!game.freeze) step(dt);
    draw(now); game.frames++;
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
