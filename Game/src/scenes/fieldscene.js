// Field scene: input -> field simulation -> stage view, with sounds, small effects, pause, stage travel
// and autosave.
//
// createFieldScene({ assets, data, input, audio, storage, settings, onBattle[, query] }) -> Scene
//   scene.update(dt, inputFrame), scene.render(ctx, timeMs)
//   scene.field           the live FieldState (src/field/field.js)
//   scene.stage           the parsed Stage on screen (changes with stage travel)
//   scene.travelling      true during the 0.4 s page slide between stages
//   scene.cues            the kinds of the effects playing now (for scripted checks)
//   scene.resumeFromBattle({ outcome, creatureUid, hearts, candyDrop })   hearts: { id: n } or [{ id, hearts }]
//   scene.pendingBattle    { creatureUid, kind } when the save says the game was closed mid-battle (else null)
//   scene.startPendingBattle(p)   restarts that battle (as if the creature had just been met); false if it can't
//
// A 'battle' event calls onBattle({ creatureUid, kind, sneak, party: [{ id, hearts }] (marching order) })
// and the field stops stepping until resumeFromBattle is called. The save written at that moment carries
// pendingBattle, so closing the game mid-battle restarts it at round 1 with the going-in hearts.
// The scene's inputMode is 'field'.
// Pause: padLost or Options; the page dims (a controller picture if the pad went away) until any press or tap.
// Stage travel: an 'exit' event to a stage in the data leaves the stage (leaveStage), enters the next one at
// the matching entrance (enterStage, from + row), autosaves, then slides the new page in over TRAVEL_TIME
// (input ignored). An exit to nowhere, or walking up to the S6 door, shows the "more soon" bubble.
// Events: eat (chomp, crumbs), nope/short (boing), bridge start (stretch), push start (push), stone (splash),
// reach bell (bell), reach candy (the candy flies to the HUD counter, then the candy sound), gate (gate),
// join (join, heart burst), spotted (spotted, a "!" over the creature), doOver (a puff at the do-over pumpkin
// and where the team lands).
// Candy won in a battle: the candy sound and sparkle play over the lead on the first step back in the field.
// Autosave: candy, rest, eat, stone, reach, join, arrival in a stage, battle end, and every 30 s of play.
// World: scene.world (src/field/world.js) holds what outlives the stage; the save is v2 (src/save.js).
// A fresh game is the monster alone in S1.
// Dev query parameters: x, y (lead tile position), form (folded|open), party (1|3; default 1, the monster
// alone), lead (id; without party=, it implies party=3), bat (patrol|asleep|ignore), zoom, fresh (1 = ignore
// the save), stage (S1..S7: start in that stage; x, y are tiles within it). Any of them starts without the save.
import { W, H, INK, wx, wy, clamp, eInOutCubic } from '../render/core.js';
import { createStageView, renderStage, noteEaten } from '../render/stageview.js';
import { createCamera, updateCamera, toScreen } from '../render/camera.js';
import { drawFieldHud } from '../render/hud.js';
import { memberSize } from '../render/actors.js';
import { burst, ring } from '../render/fx.js';
import { OBJ } from '../render/stageobjs.js';
import { candyCounterAt } from '../render/hud.js';
import { EXIT_BUBBLE, drawRisingHearts, drawMoreSoonBubble, drawPaused, drawBang, drawCandyFly } from '../render/fieldcues.js';
import { parseStage } from '../field/stage.js';
import { stepField, applyBattleResult } from '../field/field.js';
import { createWorld, enterStage, leaveStage } from '../field/world.js';
import { loadSave, writeSave, toSave } from '../save.js';

const AUTOSAVE_EVERY = 30;   // seconds
const REST_CUE = 1.4;
const CANDY_FX = .7;
const CRUMB_FX = .6;
const SPLASH_FX = .6;
const JOIN_FX = 1.4;
const BANG_FX = .9;
const FLY_FX = .6;
const GATE_FX = .6;
const DOOVER_FX = .7;
const DOOVER_COLS = ['#F39A3B', '#F6D24A', '#FFFFFF'];
const TRAVEL_TIME = .4;      // seconds of page slide between stages
const SEAM = { col: INK, w: 3 };
const SPLASH_COLS = ['#5DA9DA', '#9FD3F0', '#FFFFFF'];
const STEP_EVERY = .3;       // seconds between footstep taps
const DEV_KEYS = ['x', 'y', 'form', 'party', 'lead', 'bat', 'fresh', 'stage'];
const ALL = ['monster', 'fish', 'icecream'];

const anyPress = f => !!f && (Object.values(f.pressed || {}).some(Boolean) || (f.taps && f.taps.length > 0));

export function createFieldScene({ assets, data, input = null, audio = null, storage = null, settings = {}, onBattle = null,
  query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams() }) {
  const dev = DEV_KEYS.some(k => query.has(k));
  const saved = dev ? null : loadSave(storage, data);
  let { world, stage, field } = makeField(data, query, saved);
  const pendingBattle = saved && saved.pendingBattle && field.creatures.some(c => c.uid === saved.pendingBattle.creatureUid && c.kind === saved.pendingBattle.kind)
    ? { ...saved.pendingBattle } : null;
  const views = new Map();
  const viewFor = s => { if (!views.has(s.id)) views.set(s.id, createStageView(s, assets)); return views.get(s.id); };
  let view = viewFor(stage);
  let cam = createCamera(stage);
  const zoomQ = query.has('zoom') ? Number(query.get('zoom')) || 1 : 1;
  const zoom = () => settings.steadyCam ? 1 : zoomQ;
  const play = n => { try { audio && audio.play(n); } catch { /* never mind */ } };

  let clock = 0;                 // seconds of unpaused scene time (drives the effects)
  let saveTimer = 0, stepTimer = 0;
  let waiting = null;            // the battle we are waiting on: { creatureUid }
  let paused = null;             // { pad: bool, at: clock }
  let travel = null;             // { t, dir, old: { view, field, cam } } during the page slide
  let lastFrame = null, lastLeadX = field.party[0].x, lastAction = null, atDoor = false;
  const fx = [];                 // { kind, t0, x, y } world px (fly: screen px)
  let candyCue = 0;              // candy won in a battle: its sound and sparkle wait until the field is back on screen

  const save = () => writeSave(storage, toSave(world, field, settings));
  const snapCam = () => { const l = field.party[0]; updateCamera(cam, { x: l.x, y: l.y, vx: 0 }, 0, { zoom: zoom(), snap: true }); lastLeadX = l.x; };
  snapCam();
  const bubble = () => { for (let i = fx.length - 1; i >= 0; i--) if (fx[i].kind === 'exit') fx.splice(i, 1); fx.push({ kind: 'exit', t0: clock }); };

  function update(dt, frame) {
    lastFrame = frame || lastFrame;
    if (travel) { travel.t += dt; if (travel.t >= TRAVEL_TIME) travel = null; return; }   // input ignored
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
    const a = field.action;
    if (a && a !== lastAction && lead.foldAnim >= 1) {          // a wind-up starts moving
      if (a.kind === 'bridge') play('stretch');
      else if (a.kind === 'push' && !a.blocked) play('push');
      lastAction = a;
    }
    if (candyCue) { candyCue = 0; play('candy'); fx.push({ kind: 'candy', t0: clock, x: wx(lead.x), y: wy(lead.y) - 60 }); }
    for (const e of events) {
      if (e.t === 'candy') { play('candy'); fx.push({ kind: 'candy', t0: clock, x: wx(e.i + .5), y: wy(e.j + .7) - 22 }); save(); }
      else if (e.t === 'rest') { play('heal'); const r = field.restAt; fx.push({ kind: 'rest', t0: clock, x: wx(r.i + .5), y: wy(r.j + .5) }); save(); }
      else if (e.t === 'eat') { play('hit'); noteEaten(view, e.i, e.j); fx.push({ kind: 'crumbs', t0: clock, x: wx(e.i + .5), y: wy(e.j + .5) - 20 }); save(); }
      else if (e.t === 'nope' || e.t === 'short') play('boing');
      else if (e.t === 'fold') play(e.form === 'open' ? 'open' : 'fold');
      else if (e.t === 'swap') play('select');
      else if (e.t === 'stone') { play('splash'); fx.push({ kind: 'splash', t0: clock, x: wx(e.i + .5), y: wy(e.j + .5) }); save(); }
      else if (e.t === 'push' || e.t === 'bridge') save();
      else if (e.t === 'reach') {
        if (e.kind === 'bell') play('bell');
        else { const [x, y] = toScreen(cam, wx(e.i + .5), wy(e.j + OBJ.postY) - OBJ.candyLift); fx.push({ kind: 'fly', t0: clock, x, y }); }
        save();
      }
      else if (e.t === 'gate') { play('gate'); fx.push({ kind: 'gate', t0: clock, x: wx(e.i + .5), y: wy(e.j + .5) - 30 }); }
      else if (e.t === 'join') { play('join'); const m = field.party.find(p => p.id === e.id) || lead; fx.push({ kind: 'join', t0: clock, x: wx(m.x), y: wy(m.y) - 40 }); save(); }
      else if (e.t === 'doOver') {               // a puff at the pumpkin and one where the team lands
        play('open');
        const [pi, pj] = (stage.doOver && stage.doOver[0]) || [lead.x, lead.y];
        fx.push({ kind: 'doover', t0: clock, x: wx(pi + .5), y: wy(pj + .5) - 20 }, { kind: 'doover', t0: clock, x: wx(lead.x), y: wy(lead.y) - 30 });
        snapCam(); save();
      }
      else if (e.t === 'spotted') { play('spotted'); fx.push({ kind: 'bang', t0: clock, uid: e.uid }); }
      else if (e.t === 'exit') {
        const next = data.stages.find(s => s.id === e.to);
        if (next) { beginTravel(next); return; }
        bubble();
      }
      else if (e.t === 'battle') { beginBattle(e.creatureUid, e.kind, !!e.sneak); break; }
      // 'bump': nothing loud
    }
    const li = Math.floor(lead.x), lj = Math.floor(lead.y);
    const door = (stage.door || []).some(([i, j]) => i === li && (j === lj || j === lj - 1));   // the S6 door: nope
    if (door && !atDoor) { play('boing'); bubble(); }
    atDoor = door;
    if (lead.moving) { stepTimer -= dt; if (stepTimer <= 0) { play('step'); stepTimer = STEP_EVERY; } } else stepTimer = 0;
    const vx = dt > 0 ? (field.party[0].x - lastLeadX) / dt : 0; lastLeadX = field.party[0].x;
    updateCamera(cam, { x: field.party[0].x, y: field.party[0].y, vx }, dt, { zoom: zoom() });
    saveTimer += dt; if (saveTimer >= AUTOSAVE_EVERY) { saveTimer = 0; save(); }
    for (let i = fx.length - 1; i >= 0; i--) if (clock - fx[i].t0 > 3) fx.splice(i, 1);
  }

  // Leave this stage, enter the next at the matching entrance, autosave, and slide the new page in.
  function beginTravel(nextData) {
    const from = stage.id, lead = field.party[0];
    const dir = lead.x < stage.width / 2 ? -1 : 1, row = Math.floor(lead.y);
    leaveStage(world, field);
    const old = { view, field, cam };
    stage = parseStage(nextData);
    field = enterStage(world, stage, data, { from, row });
    view = viewFor(stage); cam = createCamera(stage); snapCam();
    fx.length = 0; lastAction = null; atDoor = false; stepTimer = 0;
    save();
    travel = { t: 0, dir, old };
  }

  function beginBattle(creatureUid, kind, sneak) {
    waiting = { creatureUid };
    writeSave(storage, toSave(world, field, settings, { creatureUid, kind }));
    const party = field.party.map(m => ({ id: m.id, hearts: m.hearts }));
    if (onBattle) onBattle({ creatureUid, kind, sneak, party });
  }
  function startPendingBattle(p = pendingBattle) {
    const c = p && field.creatures.find(k => k.uid === p.creatureUid && k.kind === p.kind);
    if (!c || waiting) return false;
    beginBattle(c.uid, c.kind, false);
    return true;
  }

  function resumeFromBattle({ outcome, creatureUid, hearts, candyDrop = 0 } = {}) {
    let h = hearts;
    if (Array.isArray(h)) h = Object.fromEntries(h.filter(m => m && typeof m.id === 'string').map(m => [m.id, m.hearts]));
    const candyBefore = field.candyCount;
    applyBattleResult(field, stage, { outcome, creatureUid: creatureUid ?? waiting?.creatureUid, hearts: h, candyDrop });
    candyCue = Math.max(0, field.candyCount - candyBefore);
    waiting = null;
    if (outcome === 'lost') snapCam();
    save();
  }

  function render(ctx, timeMs) {
    if (travel) {
      const u = eInOutCubic(clamp(travel.t / TRAVEL_TIME)), d = travel.dir, o = travel.old;
      const page = (dx, draw) => { ctx.save(); ctx.translate(dx, 0); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); draw(); ctx.restore(); };
      page(-d * W * u, () => renderStage(ctx, o.view, o.field, o.cam, timeMs));
      page(d * W * (1 - u), () => renderStage(ctx, view, field, cam, timeMs));
      const sx = d > 0 ? W * (1 - u) : W * u;
      ctx.save(); ctx.strokeStyle = SEAM.col; ctx.lineWidth = SEAM.w; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); ctx.restore();
    } else {
      renderStage(ctx, view, field, cam, timeMs);
      drawFx(ctx);
      if (input && input.drawTouch && !paused) input.drawTouch(ctx, 'field');
    }
    drawFieldHud(ctx, assets, field, lastFrame, { leadBox: travel ? null : leadScreenBox(), timeMs });
    if (!travel) drawFly(ctx);
    if (paused) drawPaused(ctx, paused.pad, timeMs);
  }

  function leadScreenBox() {                     // the lead's sprite on screen, for fading the HUD tags it covers
    const l = field.party[0], sz = memberSize(assets, l), x = wx(l.x), y = wy(l.y);
    const [x0, y0] = toScreen(cam, x - sz.w / 2, y - sz.h), [x1, y1] = toScreen(cam, x + sz.w / 2, y);
    return [x0, y0, x1, y1];
  }

  function drawFx(ctx) {
    const sc = (x, y) => toScreen(cam, x, y);
    for (const f of fx) {
      const age = clock - f.t0;
      if (f.kind === 'candy' && age < CANDY_FX) {
        const [x, y] = sc(f.x, f.y), u = age / CANDY_FX;
        ring(ctx, x, y + 22, u, 40, '#E99DBB');
        burst(ctx, x, y, u, 7 + Math.round(f.x), 9, ['#E99DBB', '#D03C30', '#FFF1A8'], 60, 30);
      } else if (f.kind === 'crumbs' && age < CRUMB_FX) {
        const [x, y] = sc(f.x, f.y);
        burst(ctx, x, y, age / CRUMB_FX, 31 + Math.round(f.x), 10, ['#A39C8E', '#C9BFAE', '#7D7466'], 70, 60);
      } else if (f.kind === 'splash' && age < SPLASH_FX) {
        const [x, y] = sc(f.x, f.y), u = age / SPLASH_FX;
        ring(ctx, x, y, u, 44, '#5DA9DA');
        burst(ctx, x, y - 6, u, 53 + Math.round(f.x), 12, SPLASH_COLS, 90, 160);
      } else if (f.kind === 'gate' && age < GATE_FX) {
        const [x, y] = sc(f.x, f.y);
        burst(ctx, x, y, age / GATE_FX, 71 + Math.round(f.x), 8, ['#D03C30', '#FFFFFF', '#7FC25B'], 70, 40);
      } else if (f.kind === 'doover' && age < DOOVER_FX) {
        const [x, y] = sc(f.x, f.y), u = age / DOOVER_FX;
        ring(ctx, x, y + 20, u, 60, '#F39A3B');
        burst(ctx, x, y, u, 91 + Math.round(f.x), 12, DOOVER_COLS, 90, 30);
      } else if (f.kind === 'join' && age < JOIN_FX) {
        const [x, y] = sc(f.x, f.y), u = age / JOIN_FX;
        ring(ctx, x, y + 30, Math.min(.99, u * 1.6), 56, '#E4574A');
        drawRisingHearts(ctx, x, y, u);
      } else if (f.kind === 'bang' && age < BANG_FX) {
        const c = field.creatures.find(k => k.uid === f.uid); if (!c) continue;
        const [x, y] = sc(wx(c.x), wy(c.y));
        drawBang(ctx, x, y, age);
      } else if (f.kind === 'exit' && age < EXIT_BUBBLE) {
        const l = field.party[0], sz = memberSize(assets, l);
        const [x, y] = sc(wx(l.x), wy(l.y) - sz.h - 6);
        drawMoreSoonBubble(ctx, x, y, age);
      }
    }
  }
  function drawFly(ctx) {                        // over the HUD: candy from a post into the counter, then a pop
    const cc = candyCounterAt(!!(lastFrame && lastFrame.source === 'touch'));   // where the HUD drew it this frame
    for (const f of fx) {
      if (f.kind !== 'fly') continue;
      const age = clock - f.t0;
      if (age < FLY_FX) drawCandyFly(ctx, assets, f.x, f.y, age / FLY_FX, cc);
      else if (age < FLY_FX + CANDY_FX) {
        if (!f.landed) { f.landed = true; play('candy'); }
        const u = (age - FLY_FX) / CANDY_FX;
        ring(ctx, cc.x, cc.y, u, 34, '#E99DBB');
        burst(ctx, cc.x, cc.y, u, 9, 8, ['#E99DBB', '#D03C30', '#FFF1A8'], 50, 20);
      }
    }
  }

  return {
    update, render, resumeFromBattle, startPendingBattle, pendingBattle, inputMode: 'field',
    get field() { return field; }, get world() { return world; }, get stage() { return stage; },
    get view() { return view; }, get cam() { return cam; },
    get paused() { return !!paused; }, get waiting() { return !!waiting; }, get travelling() { return !!travel; },
    get cues() { return fx.map(f => f.kind); },      // the effects on screen now, for scripted checks
    save,
  };
}

// The World and the live FieldState: from the save, or fresh (S1). Dev parameters adjust a fresh one;
// enterStage does all the placing and checking (a dev position that cannot be stood on goes to the start).
function makeField(data, q, saved) {
  if (saved) {
    const world = saved.world;
    const stage = parseStage(data.stages.find(s => s.id === world.stageId));
    return { world, stage, field: enterStage(world, stage, data, { at: saved.lead }) };
  }
  const ids = q.get('party') === '3' || (q.has('lead') && !q.has('party')) ? ALL.slice() : ['monster'];
  const lead = q.get('lead');
  if (lead && ids.includes(lead)) { while (ids[0] !== lead) ids.push(ids.shift()); }
  const world = createWorld(data, { party: ids });
  const stage = parseStage(data.stages.find(s => s.id === q.get('stage')) ?? data.stages[0]);
  let at = null;
  if (q.has('x') || q.has('y') || q.get('form') === 'open') {
    at = {
      x: q.has('x') ? Number(q.get('x')) : stage.start[0] + .5,
      y: q.has('y') ? Number(q.get('y')) : stage.start[1] + .5,
      ...(q.get('form') === 'open' ? { form: 'open' } : {}),
    };
  }
  let f = enterStage(world, stage, data, { at });
  if (q.get('bat') === 'asleep') {
    for (const c of f.creatures) c.mode = 'asleep';
    leaveStage(world, f);
    f = enterStage(world, stage, data, { at });
  }
  if (q.get('bat') === 'ignore') for (const c of f.creatures) { c.mode = 'ignore'; f._sim.creatures[c.uid].ignore = 1e9; }
  return { world, stage, field: f };
}

