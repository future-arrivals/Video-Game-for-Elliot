// Battle scene: input -> battle rules -> timed playback -> battle view. slice-design section 4.
//   createBattleScene({ assets, data, battle, settings, audio, backdrop, onDone }) -> { update(dt, inputFrame), render(ctx, timeMs) }
// `battle` is a BattleState from createBattle. settings: { quickPlay, reduceFlash }. backdrop: { stage } or null.
// onDone({ outcome: 'won' | 'lost' | 'ran', hearts: { [id]: n }[, candyDrop: n (won only)] }) is called once, after the end sequence.
// The scene's inputMode is 'battle' (main.js switches the input layer with it).
//
// Input: the first press of a button lifts its card and previews it (preview()); the same press again plays it
// (quickPlay: one press plays). Cross / Circle / Triangle = move slots 0 / 1 / 2, Square = Fold/Open, L1 / R1 =
// previous / next teammate, hold R2 1 s = Run. Taps on a card or portrait act as its button; a long-press on the
// Run ring runs. An illegal press wiggles the card with a boing and changes nothing. While events play back,
// input is ignored and not queued.
// Clocks: `rt` real ms (flash, particles, shake) and `wt` world ms (motion, beats), which stops during hit-stop.
import { cards, preview, resolve } from '../battle/battle.js';
import { typeBonus } from '../battle/rules.js';
import { prepareActors, hingeCurve } from '../render/actors.js';
import { shake as shakeAt } from '../render/fx.js';
import { clamp, eOutBack, eOutCubic } from '../render/core.js';
import { drawBattle, bakeBackdrop, bakeOverlays, playerScale, heartSpot, actorSpot, hitTest, LAYOUT } from '../render/battleview.js';
import { CARD_W, CARD_H, SLOT_OF } from '../render/battle/layout.js';
import { buildBeats } from './battleplay.js';

const INTRO = 300, FOLD_MS = 800;
const WIN_MS = 2300, WIN_SKIP = 1000, LOSE_MS = 2000, RUN_MS = 750;   // a press may cut the win short after WIN_SKIP

export function createBattleScene({ assets, data, battle, settings = {}, audio = null, backdrop = null, onDone = () => {} }) {
  const sfx = name => { try { audio && audio.play(name); } catch { /* sound is optional */ } };
  const stage = backdrop && backdrop.stage;
  const art = { backdrop: bakeBackdrop(stage || null), overlays: stage ? bakeOverlays(stage) : null };
  const A = prepareActors(assets);
  const types = data.type_chart.types.map(t => t.id);
  const dropOf = kind => (data.creatures.find(c => c.id === kind) || {}).drop ? 1 : 0;   // one candy per win when it drops one

  let st = battle, disp = battle, dispI = battle;       // disp / dispI: the states whose cards / intent bubble are on screen
  let rt = 0, wt = 0, freezeUntil = 0, started = false, doneCalled = false;
  let beats = [], beatI = 0, beatT = 0, playing = false;
  let lifted = null;                                    // { b, action, p, heals }
  let runHold = 0, runFired = false;
  const wiggles = {}, shakes = [], fx = [];

  const S = {                                           // display model (lags the state during playback)
    hearts: Object.fromEntries(st.party.map(m => [m.id, m.hearts])), enemyHearts: st.enemy.hearts,
    active: st.active, forms: Object.fromEntries(st.party.map(m => [m.id, { form: m.form, t0: -1e9 }])),
    badges: badgesOf(st), sticky: st.sticky, dizzy: st.dizzy, pointer: st.pointer, pointerFrom: null, pointerT0: -1e9, bubbleT0: 0,
    sleepy: Object.fromEntries(st.party.map(m => [m.id, m.hearts <= 0])), pops: {}, end: null, curl: 0,
    anim: { player: {}, enemy: {} },
  };
  if (S.sleepy[st.party[st.active].id]) S.anim.player.ko = -1e9;

  function badgesOf(s) { const m = s.party[s.active]; return { fresh: m.fresh, lift: m.lift, tummy: m.tummy, sticky: s.sticky }; }
  function mates(s, active) {                           // party indices for L1 (previous) and R1 (next)
    const n = s.party.length; if (n < 2) return { l1: null, r1: null };
    if (n === 2) return { l1: 1 - active, r1: 1 - active };
    return { l1: (active + n - 1) % n, r1: (active + 1) % n };
  }

  // ---- helpers handed to the playback beats -------------------------------------------------
  const P = {
    show: S, settings,
    rt: () => rt, wt: () => wt, sfx, enemyKind: st.enemy.id,
    fx: f => fx.push({ t0: rt, ...f }),
    hitStop: ms => { freezeUntil = Math.max(freezeUntil, rt + ms); },
    shake: amp => { if (amp > 0) shakes.push({ t0: rt, amp }); },
    spot: (which, part) => {
      if (which === 'card') { const c = LAYOUT.cards[part]; return [c.x + CARD_W / 2, c.y + CARD_H / 2]; }
      if (which === 'l1' || which === 'r1') { const m = mates(st, S.active)[which]; if (m == null) return null; const L = LAYOUT[which]; return [L.x + L.w / 2, L.y + L.h / 2]; }
      return actorSpot(which, part);
    },
    heart: (bar, i) => heartSpot(bar, i, { max: bar === 'enemy' ? st.enemy.maxHearts : maxOfBar(bar) }),
    barOf: id => {
      const idx = st.party.findIndex(m => m.id === id);
      if (idx === S.active) return 'player';
      const mt = mates(st, S.active); return mt.r1 === idx ? 'r1' : mt.l1 === idx ? 'l1' : null;
    },
    syncCards: () => { disp = st; },
    syncIntent: () => { dispI = st; },
    hingeMs: FOLD_MS,
  };
  function maxOfBar(bar) {
    if (bar === 'player') return st.party[S.active].maxHearts;
    const idx = mates(st, S.active)[bar]; return idx == null ? 9 : st.party[idx].maxHearts;
  }

  // ---- input ---------------------------------------------------------------------------------
  function actionFor(b) {
    if (b === 'run') return st.canRun ? { t: 'run' } : null;
    if (b === 'l1' || b === 'r1') { const to = mates(st, st.active)[b]; return to == null ? null : { t: 'switch', to }; }
    if (st.phase !== 'choose') return null;
    if (b === 'square') return { t: 'fold' };
    const slot = SLOT_OF[b]; return cards(st).moves[slot] ? { t: 'move', slot } : null;
  }
  function reject(b) { wiggles[b] = rt; sfx('boing'); }
  function press(b) {
    const action = actionFor(b);
    if (!action) return reject(b);
    const p = preview(st, action);
    if (!p.legal) return reject(b);
    if (settings.quickPlay || b === 'run' || (lifted && lifted.b === b)) return play(action);
    const heals = {};                                    // per-member heals (Love heals the bench too)
    for (const e of resolve(st, action).events) if (e.t === 'heal') heals[e.who] = (heals[e.who] || 0) + e.amount;
    lifted = { b, action, p, heals };
    sfx('select');
  }
  function play(action) {
    lifted = null; runHold = 0;
    const r = resolve(st, action);
    if (r.events.length === 1 && r.events[0].t === 'illegal') return;
    st = r.state; P.enemyKind = st.enemy.id;
    beats = buildBeats(r.events, P); beatI = 0; beatT = 0; playing = true;
    if (beats.length) beats[0].start();
  }
  function handleInput(f) {
    if (!f) return;
    let b = ['cross', 'circle', 'triangle', 'square', 'l1', 'r1'].find(k => f.pressed && f.pressed[k]);
    const mt = mates(st, st.active), moves = cards(st).moves;
    const pickingNext = st.phase === 'chooseNext';       // cards and Run are not drawn then, so taps there do nothing
    const showCards = Object.fromEntries([...Object.entries(SLOT_OF).map(([k, slot]) => [k, !pickingNext && !!moves[slot]]), ['square', !pickingNext]]);
    const vis = { showL1: mt.l1 != null, showR1: mt.r1 != null, showRun: st.canRun && !pickingNext, showCards };
    if (!b) for (const tp of f.taps || []) { const h = hitTest(tp.x, tp.y, vis); if (h && h !== 'run') { b = h; break; } }
    if (!b) for (const tp of f.longPress || []) if (hitTest(tp.x, tp.y, vis) === 'run') { b = 'run'; break; }
    if (b) return press(b);
    if (st.canRun && st.phase === 'choose') {
      runHold = clamp((f.held && f.held.r2) || 0);
      if (runHold >= 1 && !runFired) { runFired = true; press('run'); }
      if (runHold === 0) runFired = false;
    }
  }

  // ---- update --------------------------------------------------------------------------------
  function update(dt, frame) {
    const ms = Math.min(dt, .05) * 1000;
    if (!started) { started = true; sfx('sting'); }
    rt += ms;
    const frozen = rt < freezeUntil;
    if (!frozen) wt += ms;
    const target = (st.enemy.strip[S.pointer] || {}).form === 'folded' ? 1 : 0;
    S.curl += (target - S.curl) * Math.min(1, ms / 120);
    if (playing) {
      if (!frozen) {
        beatT += ms;
        while (playing) {
          const bt = beats[beatI];
          if (!bt) { finishPlayback(); break; }
          bt.update(beatT);
          if (beatT < bt.dur) break;
          beatT -= bt.dur; beatI++;
          if (beats[beatI]) beats[beatI].start();
        }
      }
    } else if (S.end) endUpdate(frame);
    else if (wt > INTRO) handleInput(frame);
    for (let i = fx.length - 1; i >= 0; i--) if (rt - fx[i].t0 > 3000) fx.splice(i, 1);
    for (let i = shakes.length - 1; i >= 0; i--) if (rt - shakes[i].t0 > 400) shakes.splice(i, 1);
  }
  function finishPlayback() {
    playing = false; disp = st; dispI = st; S.intentNum = undefined;
    S.enemyHearts = st.enemy.hearts; S.active = st.active; S.sticky = st.sticky; S.dizzy = st.dizzy; S.pointer = st.pointer;
    for (const m of st.party) { S.hearts[m.id] = m.hearts; S.sleepy[m.id] = m.hearts <= 0; if (S.forms[m.id].form !== m.form) S.forms[m.id] = { form: m.form, t0: -1e9 }; }
    if (!S.end) S.badges = badgesOf(st);
    if (S.end) startEnd();
  }
  function startEnd() {
    const k = S.end.kind;
    if (k === 'won') {
      sfx('fanfare');
      for (let n = 0; n < 4; n++) fx.push({ kind: 'burst', t0: rt + n * 220, x: 200 + n * 150, y: 60 + (n % 2) * 40, n: 22, spd: 160, grav: 260, dur: 1300,
        cols: ['#E99DBB', '#FFE27A', '#8CC8DC', '#7DBE6A', '#F4A04A', '#FFFFFF'], seed: 61 + n });
    } else if (k === 'lost') sfx('lose');
    else sfx('step');
  }
  function endUpdate(frame) {
    const el = wt - S.end.t0, k = S.end.kind;
    const limit = k === 'won' ? WIN_MS : k === 'lost' ? LOSE_MS : RUN_MS;
    const skip = k === 'won' && el > WIN_SKIP && frame && ((frame.pressed && Object.values(frame.pressed).some(Boolean)) || (frame.taps && frame.taps.length));
    if ((el >= limit || skip) && !doneCalled) {
      doneCalled = true;
      const hearts = Object.fromEntries(st.party.map(m => [m.id, m.hearts]));
      onDone(k === 'won' ? { outcome: k, hearts, candyDrop: dropOf(st.enemy.id) } : { outcome: k, hearts });
    }
  }

  // ---- view-model ----------------------------------------------------------------------------
  const since = t0 => (t0 == null ? Infinity : wt - t0);
  function lunge(t0, dir) {                             // back 100 ms, forward 100 ms, home 160 ms
    const m = since(t0); if (m < 0 || m > 360) return 0;
    if (m < 100) return -12 * eOutCubic(m / 100) * dir;
    if (m < 200) return (-12 + 72 * eOutCubic((m - 100) / 100)) * dir;
    return 60 * (1 - eOutCubic((m - 200) / 160)) * dir;
  }
  const hop = t0 => { const m = since(t0); return m >= 0 && m < 320 ? -Math.sin(m / 320 * Math.PI) * 22 : 0; };
  const flashA = t0 => { const m = rt - (t0 ?? -1e9); return m >= 0 && m < 120 ? .7 * (1 - m / 120) : 0; };
  const pulseU = t0 => { const m = rt - (t0 ?? -1e9); return m >= 0 && m < 420 ? m / 420 : 0; };

  function buildVM() {
    const m = st.party[S.active], id = m.id, fm = S.forms[id];
    const pa = S.anim.player, ea = S.anim.enemy;
    // The intro starts on screen: during the page turn the battle is drawn at wt = 0, so both actors already stand
    // in view, a little way off their marks, and slide the last stretch in once the page has turned.
    const intro = clamp(wt / 340);
    const end = S.end, endMs = end ? wt - end.t0 : 0;
    // player position
    let pdx = -80 * (1 - eOutBack(intro, 1.4)) + lunge(pa.lunge, 1), pdy = hop(pa.hop) + lunge(pa.lunge, -.55);
    if (pa.exit != null && pa.enter == null) pdx -= 340 * eOutCubic(clamp(since(pa.exit) / 250));
    if (pa.enter != null) pdx -= 340 * (1 - eOutBack(clamp(since(pa.enter) / 250), 1.4));
    if (end && end.kind === 'ran') { pdx -= 380 * clamp(endMs / RUN_MS); pdy -= Math.abs(Math.sin(endMs / RUN_MS * Math.PI * 3)) * 26; }
    const sq = since(pa.squash);
    const squash = sq >= 0 && sq < 400 ? Math.sin(sq / 400 * Math.PI) * (sq < 200 ? 1 : .6) : 0;
    const hinge = since(fm.t0);
    const hu = clamp(hinge / FOLD_MS);
    const scale = playerScale(assets, id, hingeCurve(fm.form, hu, 'battle').o);   // the size follows the hinge
    const koU = pa.ko != null ? clamp(since(pa.ko) / 500) : 0;
    // enemy
    let edx = 80 * (1 - eOutBack(intro, 1.4)) + lunge(ea.lunge, -1), edy = hop(ea.hop) + lunge(ea.lunge, .4);

    const choosing = !playing && !end && wt > INTRO;
    const lp = lifted && lifted.p, la = lifted && lifted.action;
    const isSwitch = la && la.t === 'switch';
    const c = cards(disp), dm = disp.party[disp.active];
    const vm = {
      backdrop: art.backdrop, overlays: art.overlays,
      shake: shakes.reduce((a, s) => { const d = shakeAt(rt, s.t0, 300, s.amp, s.t0 % 7); return [a[0] + d[0], a[1] + d[1]]; }, [0, 0]),
      enemy: { kind: st.enemy.id, dx: edx, dy: edy, curl: S.curl, win: end && end.kind === 'won' ? endMs : null, flash: flashA(ea.flash), pulse: pulseU(ea.pulse) },
      enemyBar: { max: st.enemy.maxHearts, shown: S.enemyHearts, lost: lp ? lp.enemyHeartsLost : 0 },
      player: { member: { id, form: fm.form, foldAnim: clamp(hinge / FOLD_MS), faceX: 1, moving: false }, pace: 'battle', scale, dx: pdx, dy: pdy,
        ko: koU, flash: flashA(pa.flash), pulse: pulseU(pa.pulse), squash, alpha: S.sleepy[id] && pa.ko == null ? .5 : 1 },
      playerBar: { max: m.maxHearts, shown: S.hearts[id], lost: lp && !isSwitch ? lp.selfHeartsLost : 0, heal: lp && !isSwitch ? (lifted.heals[id] || 0) : 0 },
      strip: { strip: disp.enemy.strip, pointer: S.pointer, from: S.pointerFrom, u: since(S.pointerT0) / 300, dizzy: S.dizzy },
      badges: S.sleepy[id] ? null : { ...S.badges, pop: Object.fromEntries(Object.entries(S.pops).map(([k, t0]) => [k, since(t0) / 300])) },
      fx, tear: end && end.kind === 'lost' ? clamp(endMs / 1500) : 0,
      uiAlpha: clamp((wt - 100) / 250) * (end ? 1 - clamp((endMs - 200) / 400) : 1),
    };
    // intent bubble
    const it = cards(dispI).intent, defType = isSwitch ? st.party[la.to].type : dispI.party[dispI.active].type;
    const attacks = it.attack > 0 && !it.dizzy;
    const shownNum = S.intentNum !== undefined ? S.intentNum : lp ? lp.intentNumber : it.number;
    vm.bubble = { word: it.word, number: attacks ? shownNum : null, dizzy: S.dizzy && it.dizzy, changed: !!lp && attacks && lp.intentNumber !== it.number,
      arrow: attacks ? typeBonus(st.enemy.type, defType) : 0, pop: since(S.bubbleT0) / 260 };
    // cards
    const pick = b => (b === lifted?.b);
    const wig = b => { const u = (rt - (wiggles[b] ?? -1e9)) / 400; return u >= 0 && u < 1 ? u : 0; };
    vm.cards = {};
    for (const [b, slot] of Object.entries(SLOT_OF)) {
      const mv = c.moves[slot];
      if (!mv) { vm.cards[b] = { empty: true, wiggle: wig(b) }; continue; }
      const dmg = mv.kind === 'damage' || mv.id === 'burp';
      vm.cards[b] = { word: mv.word, icon: mv.id, number: mv.number, kind: mv.kind, enabled: mv.enabled, lifted: pick(b), wiggle: wig(b),
        arrow: dmg ? typeBonus(dm.type, disp.enemy.type) : 0 };
    }
    vm.cards.square = { word: c.fold.word, icon: dm.form === 'folded' ? 'open' : 'fold', number: null, kind: 'fold', enabled: c.fold.enabled,
      lifted: pick('square'), wiggle: wig('square'), webbed: S.sticky };
    // teammate portraits
    const mt = mates(st, S.active);
    vm.portraits = [];
    for (const side of ['l1', 'r1']) {
      const idx = mt[side]; if (idx == null || (side === 'l1' && st.party.length === 2)) continue;
      const tm = st.party[idx], sel = isSwitch && la.to === idx;
      vm.portraits.push({ side, sprite: A.chars[tm.id].folded.s, sleepy: S.sleepy[tm.id], lifted: lifted?.b === side, wiggle: wig(side),
        pulse: choosing && st.phase === 'chooseNext' && !S.sleepy[tm.id], webbed: S.sticky,
        bar: { max: tm.maxHearts, shown: S.hearts[tm.id], lost: sel ? lp.selfHeartsLost : 0, heal: lp && !isSwitch ? (lifted.heals[tm.id] || 0) : 0 } });
    }
    // the type wheel only while the intent or the lifted card has a type bonus or penalty
    const liftedCard = lifted && vm.cards[lifted.b];
    if (vm.bubble.arrow || (liftedCard && liftedCard.arrow)) vm.types = types;
    vm.typeMark = { [st.enemy.type]: true, [defType]: true };
    vm.run = st.canRun && st.phase === 'choose' && !end ? { progress: runHold } : null;
    if (end && end.kind !== 'ran') { vm.cards = null; vm.run = null; }
    // Lead knocked out and waiting for L1 / R1: only the teammate tags are useful, so the cards, Run ring, hearts tag and badges go.
    if (!playing && st.phase === 'chooseNext') { vm.cards = null; vm.run = null; vm.playerBar = null; vm.badges = null; }
    return vm;
  }

  function render(ctx) { drawBattle(ctx, assets, buildVM(), rt); }

  return {
    update, render, inputMode: 'battle',
    get state() { return st; },
    get playing() { return playing; },
    get lifted() { return lifted && { button: lifted.b, action: lifted.action, preview: lifted.p }; },
    get ended() { return !!S.end; },
    get done() { return doneCalled; },
  };
}
