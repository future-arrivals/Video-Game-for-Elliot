// Stand-alone battle harness for Game/dev/battle.html. Runs one battle with the real input layer in battle mode.
// Query: enemy (bat | spider | ghost), lead (monster | fish | icecream), party (1 | 3), hearts (lead's starting
// hearts), quick=1 (Quick play), flash=0 (reduce flash), dizzy=1 (sneak attack), stage (backdrop stage id, default S1; 'none' = plain page),
// still=1 (no real-time steps before the first tick(): the page shows the battle's first frame, as the page turn reveals it).
// window.__game = { ready, state(), press(name), hold(name, on), tap(x, y, long), tick(seconds), scene, result }
//   press(name): queues a one-frame press (cross, circle, triangle, square, l1, r1); one queued press per frame.
//   hold('r2', true|false): holds R2 in the synthetic frames (for Run). tap(x, y[, long]): a tap in logical px.
//   tick(seconds): switches to manual time and advances the scene synchronously in 1/60 s steps, then draws.
// Keyboard: K Cross, L Circle, I Triangle, J Square, Q L1, E R1, Shift R2. Enter restarts after the battle ends.
import data from '../data/slice.gen.js';
import { W, H, setBakeScale } from '../render/core.js';
import { loadAssets } from '../assets.js';
import { createInput } from '../input/input.js';
import { createAudio } from '../audio.js';
import { createBattle } from '../battle/battle.js';
import { createBattleScene } from '../scenes/battlescene.js';

export async function startHarness(canvas) {
  const q = new URLSearchParams(location.search);
  const enemy = q.get('enemy') || 'bat', lead = q.get('lead') || 'monster', size = Number(q.get('party') || 3);
  const ids = [lead, ...['monster', 'fish', 'icecream'].filter(i => i !== lead)].slice(0, size === 1 ? 1 : 3);
  const party = ids.map((id, i) => ({ id, hearts: i === 0 && q.has('hearts') ? Number(q.get('hearts')) : undefined }));
  const stageId = q.get('stage') || 'S1';
  const stage = stageId === 'none' ? null : data.stages.find(s => s.id === stageId) || data.stages[0];

  const ctx = canvas.getContext('2d');
  const fit = { S: 1 };
  function resize() {
    const vw = innerWidth, vh = innerHeight, dpr = Math.min(2, devicePixelRatio || 1), s = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * s), ch = Math.floor(H * s);
    Object.assign(canvas.style, { width: cw + 'px', height: ch + 'px', left: Math.floor((vw - cw) / 2) + 'px', top: Math.floor((vh - ch) / 2) + 'px' });
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); fit.S = canvas.width / W;
  }
  resize(); addEventListener('resize', resize);
  setBakeScale(Math.max(1.5, canvas.width / W));
  const toLogical = (cx, cy) => { const r = canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H]; };

  const game = { ready: false, result: null };
  window.__game = game;
  const assets = await loadAssets();
  const input = createInput(canvas, { toLogical }); input.setMode('battle');
  const audio = createAudio();
  addEventListener('keydown', () => audio.unlock()); addEventListener('pointerdown', () => audio.unlock());

  let scene;
  function start() {
    const battle = createBattle({ data, party, lead: 0, enemy, dizzy: q.get('dizzy') === '1' });
    game.result = null;
    scene = createBattleScene({ assets, data, battle, audio, backdrop: stage ? { stage } : null,
      settings: { quickPlay: q.get('quick') === '1', reduceFlash: q.get('flash') === '0' },
      onDone: r => { game.result = r; console.log('battle done', JSON.stringify(r)); } });
    game.scene = scene;
  }
  start();

  const queue = [], holds = { r2: false }, held = { l2: 0, r2: 0 };
  let manual = q.get('still') === '1';
  const blank = () => ({ moveX: 0, moveY: 0, dash: false, pressed: {}, held: { l2: 0, r2: 0 }, taps: [], longPress: [], holding: [], source: 'keyboard', gamepadConnected: false });
  function synth(frame, dt) {
    if (queue.length) {
      const n = queue.shift();
      if (typeof n === 'string') frame.pressed = { ...frame.pressed, [n]: true };
      else frame[n.long ? 'longPress' : 'taps'] = [...(frame[n.long ? 'longPress' : 'taps'] || []), { x: n.x, y: n.y }];
    }
    held.r2 = holds.r2 ? held.r2 + dt : 0;
    if (held.r2) frame.held = { ...frame.held, r2: Math.max(frame.held.r2 || 0, held.r2) };
    return frame;
  }
  function step(dt, frame) {
    if (game.result && frame.pressed && frame.pressed.options) { start(); return; }
    scene.update(dt, frame);
  }
  function draw() { ctx.setTransform(fit.S, 0, 0, fit.S, 0, 0); scene.render(ctx, performance.now()); }

  game.state = () => scene.state;
  game.press = name => { queue.push(name); return queue.length; };
  game.hold = (name, on) => { holds[name] = !!on; };
  game.tap = (x, y, long = false) => { queue.push({ x, y, long }); return queue.length; };
  game.tick = (seconds = 1 / 60) => {
    manual = true;
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) { const f = synth(blank(), 1 / 60); step(1 / 60, f); }
    draw();
    return { phase: scene.state.phase, playing: scene.playing, lifted: scene.lifted, result: game.result };
  };

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    const frame = input.poll(dt);
    if (!manual) step(dt, synth(frame, dt));
    draw();
    requestAnimationFrame(loop);
  }
  draw(); game.ready = true;
  requestAnimationFrame(loop);
  return game;
}
