// Field scene: input -> field simulation -> stage view, with sounds, small effects, pause and autosave.
//
// createFieldScene({ assets, data, input, audio, storage, settings, onBattle[, query] }) -> Scene
//   scene.update(dt, inputFrame), scene.render(ctx, timeMs)
//   scene.field           the live FieldState (src/field/field.js)
//   scene.stage           the parsed Stage
//   scene.resumeFromBattle({ outcome, creatureUid, hearts })   hearts: { id: n } or [{ id, hearts }]
//
// A 'battle' event calls onBattle({ creatureUid, kind, sneak, party: [{ id, hearts }] (marching order) })
// and the field stops stepping until resumeFromBattle is called.
// Pause: padLost or Options; the page dims (a controller picture if the pad went away) until any press or tap.
// Autosave: candy, rest, battle end, and every 30 s of play.
// Dev query parameters: x, y (lead tile position), form (folded|open), party (1|3), lead (id),
// bat (patrol|asleep|ignore), zoom, fresh (1 = ignore the save). Any of them starts without the save.
import { W, H, INK, PEN, PAPER, FONT, wx, wy, clamp, eOutCubic, rng } from '../render/core.js';
import { createStageView, renderStage } from '../render/stageview.js';
import { createCamera, updateCamera, toScreen } from '../render/camera.js';
import { drawFieldHud } from '../render/hud.js';
import { memberSize } from '../render/actors.js';
import { burst, ring } from '../render/fx.js';
import { parseStage } from '../field/stage.js';
import { createField, stepField, applyBattleResult } from '../field/field.js';
import { loadSave, writeSave, toSave } from '../save.js';

const AUTOSAVE_EVERY = 30;   // seconds
const EXIT_BUBBLE = 1.5;     // seconds
const REST_CUE = 1.4;
const CANDY_FX = .7;
const STEP_EVERY = .3;       // seconds between footstep taps
const DEV_KEYS = ['x', 'y', 'form', 'party', 'lead', 'bat', 'fresh'];
const ALL = ['monster', 'fish', 'icecream'];

const anyPress = f => !!f && (Object.values(f.pressed || {}).some(Boolean) || (f.taps && f.taps.length > 0));

export function createFieldScene({ assets, data, input = null, audio = null, storage = null, settings = {}, onBattle = null,
  query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams() }) {
  const stage = parseStage(data.stages[0]);
  const dev = DEV_KEYS.some(k => query.has(k));
  const field = makeField(stage, data, query, dev ? null : loadSave(storage), settings);
  const view = createStageView(stage, assets);
  const cam = createCamera(stage);
  const zoomQ = query.has('zoom') ? Number(query.get('zoom')) || 1 : 1;
  const zoom = () => settings.steadyCam ? 1 : zoomQ;
  const play = n => { try { audio && audio.play(n); } catch { /* never mind */ } };

  let clock = 0;                 // seconds of unpaused scene time (drives the effects)
  let saveTimer = 0, stepTimer = 0;
  let waiting = null;            // the battle we are waiting on: { creatureUid }
  let paused = null;             // { pad: bool, at: clock }
  let lastFrame = null, lastLeadX = field.party[0].x;
  const fx = [];                 // { kind, t0, x, y } world px

  const save = () => writeSave(storage, toSave(field, settings));
  const snapCam = () => { const l = field.party[0]; updateCamera(cam, { x: l.x, y: l.y, vx: 0 }, 0, { zoom: zoom(), snap: true }); lastLeadX = l.x; };
  snapCam();

  function update(dt, frame) {
    lastFrame = frame || lastFrame;
    if (paused) {
      if (paused.armed && anyPress(frame)) paused = null;
      else { paused.armed = true; return; }   // the press that paused does not also unpause
      return;
    }
    if (frame && (frame.padLost || frame.pressed?.options)) { paused = { pad: !!frame.padLost, armed: false }; return; }
    if (waiting) return;
    clock += dt;
    const events = stepField(field, stage, frame, dt);
    const lead = field.party[0];
    for (const e of events) {
      if (e.t === 'candy') { play('candy'); fx.push({ kind: 'candy', t0: clock, x: wx(e.i + .5), y: wy(e.j + .7) - 22 }); save(); }
      else if (e.t === 'rest') { play('heal'); const r = field.restAt; fx.push({ kind: 'rest', t0: clock, x: wx(r.i + .5), y: wy(r.j + .5) }); save(); }
      else if (e.t === 'fold') play(e.form === 'open' ? 'open' : 'fold');
      else if (e.t === 'swap') play('select');
      else if (e.t === 'exit') { for (let i = fx.length - 1; i >= 0; i--) if (fx[i].kind === 'exit') fx.splice(i, 1); fx.push({ kind: 'exit', t0: clock }); }
      else if (e.t === 'battle') {
        waiting = { creatureUid: e.creatureUid };
        const party = field.party.map(m => ({ id: m.id, hearts: m.hearts }));
        if (onBattle) onBattle({ creatureUid: e.creatureUid, kind: e.kind, sneak: !!e.sneak, party });
        break;
      }
      // 'bump': nothing loud
    }
    if (lead.moving) { stepTimer -= dt; if (stepTimer <= 0) { play('step'); stepTimer = STEP_EVERY; } } else stepTimer = 0;
    const vx = dt > 0 ? (field.party[0].x - lastLeadX) / dt : 0; lastLeadX = field.party[0].x;
    updateCamera(cam, { x: field.party[0].x, y: field.party[0].y, vx }, dt, { zoom: zoom() });
    saveTimer += dt; if (saveTimer >= AUTOSAVE_EVERY) { saveTimer = 0; save(); }
    for (let i = fx.length - 1; i >= 0; i--) if (clock - fx[i].t0 > 3) fx.splice(i, 1);
  }

  function resumeFromBattle({ outcome, creatureUid, hearts } = {}) {
    let h = hearts;
    if (Array.isArray(h)) h = Object.fromEntries(h.filter(m => m && typeof m.id === 'string').map(m => [m.id, m.hearts]));
    applyBattleResult(field, stage, { outcome, creatureUid: creatureUid ?? waiting?.creatureUid, hearts: h });
    waiting = null;
    if (outcome === 'lost') snapCam();
    save();
  }

  function render(ctx, timeMs) {
    renderStage(ctx, view, field, cam, timeMs);
    drawFx(ctx);
    if (input && input.drawTouch && !paused) input.drawTouch(ctx, 'field');
    drawFieldHud(ctx, assets, field, lastFrame);
    if (paused) drawPaused(ctx, paused.pad, timeMs);
  }

  function drawFx(ctx) {
    const sc = (x, y) => toScreen(cam, x, y);
    for (const f of fx) {
      const age = clock - f.t0;
      if (f.kind === 'candy' && age < CANDY_FX) {
        const [x, y] = sc(f.x, f.y), u = age / CANDY_FX;
        ring(ctx, x, y + 22, u, 40, '#E99DBB');
        burst(ctx, x, y, u, 7 + Math.round(f.x), 9, ['#E99DBB', '#D03C30', '#FFF1A8'], 60, 30);
      } else if (f.kind === 'rest' && age < REST_CUE) {
        const [x, y] = sc(f.x, f.y), u = age / REST_CUE;
        ring(ctx, x, y, Math.min(.99, u * 1.4), 46, '#D03C30');
        drawRisingHearts(ctx, x, y, u);
      } else if (f.kind === 'exit' && age < EXIT_BUBBLE) {
        const l = field.party[0], sz = memberSize(assets, l);
        const [x, y] = sc(wx(l.x), wy(l.y) - sz.h - 6);
        drawMoreSoonBubble(ctx, x, y, age);
      }
    }
  }

  return {
    update, render, resumeFromBattle,
    get field() { return field; }, stage, view, cam,
    get paused() { return !!paused; }, get waiting() { return !!waiting; },
    save,
  };
}

// FieldState from the save, or fresh; dev parameters adjust a fresh one through a save-shaped object
// so createField does all the placing and checking.
function makeField(stage, data, q, saved, settings) {
  let ids = q.get('party') === '1' ? ['monster'] : ALL.slice();
  const lead = q.get('lead');
  if (lead && ids.includes(lead)) { while (ids[0] !== lead) ids.push(ids.shift()); }
  const party = ids.map(id => ({ id, hearts: data.characters.find(c => c.id === id)?.hearts }));
  let f = createField({ stage, data, party, save: saved });
  if (q.has('x') || q.has('y') || q.get('form') === 'open' || q.get('bat') === 'asleep') {
    const s = toSave(f, settings);
    if (q.has('x')) s.lead.x = Number(q.get('x'));
    if (q.has('y')) s.lead.y = Number(q.get('y'));
    if (q.get('form') === 'open') s.party[0].form = 'open';
    if (q.get('bat') === 'asleep') s.asleep = f.creatures.map(c => c.uid);
    f = createField({ stage, data, party, save: s });
  }
  if (q.get('bat') === 'ignore') for (const c of f.creatures) { c.mode = 'ignore'; f._sim.creatures[c.uid].ignore = 1e9; }
  return f;
}

// ---------------------------------------------------------------- drawing helpers (screen space)

function drawRisingHearts(ctx, x, y, u) {
  const r = rng(11);
  ctx.save(); ctx.lineJoin = 'round';
  for (let i = 0; i < 5; i++) {
    const d = i * .1, v = clamp((u - d) / (1 - d)); if (v <= 0 || v >= 1) continue;
    const hx = x + (r() - .5) * 70 + Math.sin(v * 6 + i) * 6, hy = y - 10 - eOutCubic(v) * 70, s = 7 + r() * 4;
    ctx.globalAlpha = 1 - v * v;
    ctx.beginPath(); ctx.moveTo(hx, hy + s * .9);
    ctx.bezierCurveTo(hx - s * 1.6, hy - s * .2, hx - s * .6, hy - s * 1.3, hx, hy - s * .4);
    ctx.bezierCurveTo(hx + s * .6, hy - s * 1.3, hx + s * 1.6, hy - s * .2, hx, hy + s * .9);
    ctx.fillStyle = '#D03C30'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
  }
  ctx.restore();
}

// A pencil thought bubble with a little padlock and "..." : "more soon".
function drawMoreSoonBubble(ctx, x, y, age) {
  const a = clamp(age / .18) * clamp((EXIT_BUBBLE - age) / .25);
  const pop = .85 + .15 * eOutCubic(clamp(age / .25));
  const bx = clamp(x + 30, 80, W - 80), by = clamp(y - 52, 60, H - 60);
  ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // trailing dots down to the lead
  ctx.fillStyle = PAPER; ctx.strokeStyle = PEN; ctx.lineWidth = 2;
  for (const [t, r] of [[.25, 4], [.55, 6.5]]) { ctx.beginPath(); ctx.arc(x + (bx - x) * t, y + (by + 30 - y) * t, r, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.translate(bx, by); ctx.scale(pop, pop);
  // cloud: a ring of bumps
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
    const p = t => [Math.cos(t) * 58, Math.sin(t) * 34];
    const [x0, y0] = p(t0), [x1, y1] = p(t1), tm = (t0 + t1) / 2;
    if (!i) ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(Math.cos(tm) * 74, Math.sin(tm) * 46, x1, y1);
  }
  ctx.closePath(); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = PEN; ctx.lineWidth = 2.4; ctx.stroke();
  // padlock
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(-18, -6, 9, Math.PI, 0); ctx.lineTo(-9, 2); ctx.moveTo(-27, -6); ctx.lineTo(-27, 2); ctx.stroke();
  ctx.fillStyle = '#F4C84A'; ctx.beginPath(); ctx.roundRect(-32, 0, 28, 22, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-18, 9, 3, 0, 7); ctx.fill(); ctx.fillRect(-19.2, 10, 2.4, 6);
  // pencil dots, appearing one by one
  for (let i = 0; i < 3; i++) if (age > .25 + i * .2) { ctx.beginPath(); ctx.arc(12 + i * 13, 12, 3.6, 0, 7); ctx.fill(); }
  ctx.restore();
}

// Dim page; a controller picture when the pad went away, two pencil bars otherwise.
function drawPaused(ctx, pad, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(40,30,20,.45)'; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // paper card
  ctx.fillStyle = 'rgba(80,55,25,.25)'; ctx.beginPath(); ctx.roundRect(-130, -86, 260, 176, 18); ctx.fill();
  ctx.fillStyle = PAPER; ctx.beginPath(); ctx.roundRect(-130, -90, 260, 176, 18); ctx.fill();
  ctx.strokeStyle = '#cfc5b1'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  if (pad) {
    const bob = Math.sin(t * .004) * 3;
    ctx.translate(0, -10 + bob);
    // controller body with two grips
    ctx.fillStyle = '#E9E3D6';
    ctx.beginPath();
    ctx.moveTo(-70, -22); ctx.quadraticCurveTo(-80, -30, -60, -32); ctx.lineTo(60, -32); ctx.quadraticCurveTo(80, -30, 70, -22);
    ctx.quadraticCurveTo(96, 30, 82, 46); ctx.quadraticCurveTo(66, 58, 50, 30); ctx.lineTo(-50, 30);
    ctx.quadraticCurveTo(-66, 58, -82, 46); ctx.quadraticCurveTo(-96, 30, -70, -22); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // d-pad
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-52, -6); ctx.lineTo(-32, -6); ctx.moveTo(-42, -16); ctx.lineTo(-42, 4); ctx.stroke();
    // buttons
    for (const [bx, by] of [[42, -16], [52, -6], [42, 4], [32, -6]]) { ctx.beginPath(); ctx.arc(bx, by, 4, 0, 7); ctx.stroke(); }
    // sticks
    ctx.fillStyle = PAPER; for (const sx of [-20, 20]) { ctx.beginPath(); ctx.arc(sx, 14, 8, 0, 7); ctx.fill(); ctx.stroke(); }
    // a dangling cable with a question-ish wiggle: "where did it go?"
    ctx.strokeStyle = PEN; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -32); ctx.bezierCurveTo(10, -52, -14, -60, 4, -74); ctx.stroke();
  } else {
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.roundRect(-30, -42, 20, 76, 6); ctx.fill();
    ctx.beginPath(); ctx.roundRect(10, -42, 20, 76, 6); ctx.fill();
  }
  ctx.restore();
  ctx.save(); ctx.fillStyle = INK; ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', W / 2, H / 2 + 66); ctx.restore();
}
