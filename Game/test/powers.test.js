// Field powers: Eat (moved here unchanged from field.test.js, except that the target now carries
// `kind: 'boulder'`), Bridge, Push, Reach, the target and badge, and what happens mid-wind-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { createField, stepField, canStand } from '../src/field/field.js';
import { createWorld, enterStage, leaveStage } from '../src/field/world.js';

const S1 = data.stages[0];
const DT = 1 / 60;

function inp({ moveX = 0, moveY = 0, dash = false, pressed = {} } = {}) {
  return { moveX, moveY, dash, pressed };
}

// Steps the field for `seconds` with fixed dt, collecting every event.
function run(state, stage, input, seconds, dt = DT) {
  const events = [];
  const n = Math.round(seconds / dt);
  for (let k = 0; k < n; k++) events.push(...stepField(state, stage, input, dt));
  return events;
}

function setup(ids = ['monster']) {
  const stage = parseStage(S1);
  const party = ids.map((id) => ({ id }));
  const state = createField({ stage, data, party });
  return { stage, state };
}

function setupAt(x, y, ids) {
  const s = setup(ids);
  s.state.party[0].x = x;
  s.state.party[0].y = y;
  stepField(s.state, s.stage, inp(), 0); // settle: records the current tile without firing entry events
  return s;
}

// ---------------------------------------------------------------- Eat (Task 9)

// Stands the lead on (20,2) and walks it into the boulder so it faces back.
function atBoulder(ids = ['monster'], { form } = {}) {
  const s = setupAt(20.5, 2.5, ids);
  if (form === 'open') { s.state.party[0].form = 'open'; s.state.party[0].foldAnim = 1; }
  run(s.state, s.stage, inp({ moveY: -1 }), 0.1);
  return s;
}

test('eat: the open monster facing back from (20,2) eats the boulder at (20,1); the candy at (20,0) is then reachable', () => {
  const { state, stage } = atBoulder(['monster'], { form: 'open' });
  assert.equal(state.party[0].facing, 'back');
  assert.deepEqual(state.target, { i: 20, j: 1, kind: 'boulder', power: 'eat', by: 'monster', ready: true });
  const ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(ev.filter((e) => e.t === 'eat'), [{ t: 'eat', i: 20, j: 1 }]);
  assert.deepEqual(state.boulders, []);
  assert.equal(stage.isSolid(20, 1, state.boulders), false);
  assert.equal(state.target, null, 'nothing left to eat');
  assert.equal(state.party[0].form, 'open');
  const before = state.candyCount;
  const ev2 = run(state, stage, inp({ moveY: -1 }), 1);
  assert.deepEqual(ev2.filter((e) => e.t === 'candy'), [{ t: 'candy', i: 20, j: 0 }]);
  assert.equal(state.candyCount, before + 1);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('eat: Cross with the fish leading next to the boulder changes nothing and emits nope', () => {
  const { state, stage } = atBoulder(['fish', 'icecream', 'monster']);
  assert.equal(state.party[0].id, 'fish');
  assert.equal(state.target.ready, false);
  assert.equal(state.target.by, 'monster');
  assert.equal('nudgeAt' in state.target, false);
  const party = JSON.stringify(state.party);
  const t0 = state.time;
  const ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(ev, [{ t: 'nope' }]);
  assert.deepEqual(state.boulders, [{ i: 20, j: 1 }]);
  assert.equal(JSON.stringify(state.party), party);
  assert.equal(state.target.ready, false);
  assert.equal(state.target.nudgeAt, t0);
  // it survives recomputation while the target stays on (20,1), and a later nope moves it on
  run(state, stage, inp(), 0.5);
  assert.equal(state.target.nudgeAt, t0);
  const t1 = state.time;
  stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.equal(state.target.nudgeAt, t1);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  // Cross with no target at all: nothing
  const far = setupAt(5.5, 7.5, ['fish', 'monster']);
  assert.equal(far.state.target, null);
  assert.deepEqual(stepField(far.state, far.stage, inp({ pressed: { cross: true } }), DT), []);
});

test('eat: a folded monster unfolds first; the eat lands after the 0.5 s hinge and leaves it open', () => {
  const { state, stage } = atBoulder();
  assert.equal(state.party[0].form, 'folded');
  assert.equal(state.target.ready, true);
  let ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(ev, [{ t: 'fold', form: 'open' }], 'the press unfolds; no eat yet');
  assert.equal(state.party[0].form, 'open');
  assert.deepEqual(state.boulders, [{ i: 20, j: 1 }]);
  ev = run(state, stage, inp(), 0.5 - 2 * DT);
  assert.equal(ev.filter((e) => e.t === 'eat').length, 0, 'not before the hinge settles');
  assert.equal(state.boulders.length, 1);
  ev = run(state, stage, inp(), 2 * DT);
  assert.deepEqual(ev, [{ t: 'eat', i: 20, j: 1 }]);
  assert.deepEqual(state.boulders, []);
  assert.equal(state.party[0].form, 'open');
  assert.equal(state.party[0].foldAnim, 1);
});

test('eat: right next to the boulder is ready whatever the facing (Cross turns to it); two tiles away is not ready; three away and the start are null', () => {
  const { state, stage } = atBoulder(['monster'], { form: 'open' });
  run(state, stage, inp({ moveY: 1 }), 0.02); // turn to face front, still on (20,2)
  assert.equal(state.party[0].facing, 'front');
  assert.equal(Math.floor(state.party[0].y), 2);
  assert.deepEqual(state.target, { i: 20, j: 1, kind: 'boulder', power: 'eat', by: 'monster', ready: true });
  const ev = stepField(state, stage, inp({ pressed: { cross: true } }), 0);
  assert.deepEqual(ev.filter((e) => e.t === 'eat'), [{ t: 'eat', i: 20, j: 1 }]);
  assert.equal(ev.filter((e) => e.t === 'nope').length, 0);
  assert.equal(state.party[0].facing, 'back', 'Cross turned the lead to face the boulder');
  assert.deepEqual(state.boulders, []);
  // two tiles away: still shown, not ready
  const two = setupAt(20.5, 3.5);
  assert.equal(two.state.target.ready, false);
  assert.equal(two.state.target.i, 20);
  // three away, and at the start: nothing
  assert.equal(setupAt(20.5, 4.5).state.target, null);
  assert.equal(setup().state.target, null);
});

test('eat: input waits during the hinge; a second Cross does not eat twice; a 2 s frame still ends in one eat', () => {
  let { state, stage } = atBoulder(['monster', 'fish']);
  const x = state.party[0].x, y = state.party[0].y;
  const ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  ev.push(...stepField(state, stage, inp({ moveX: 1, pressed: { cross: true } }), DT));
  ev.push(...stepField(state, stage, inp({ moveX: -1, pressed: { square: true } }), DT));
  ev.push(...stepField(state, stage, inp({ moveY: 1, pressed: { r1: true } }), DT));
  assert.deepEqual(ev, [{ t: 'fold', form: 'open' }], 'presses during the hinge are dropped, not queued');
  assert.deepEqual([state.party[0].x, state.party[0].y], [x, y], 'no movement during the hinge');
  assert.equal(state.party[0].id, 'monster');
  assert.equal(state.party[0].facing, 'back');
  ev.push(...run(state, stage, inp({ pressed: { cross: true } }), 1));
  assert.deepEqual(ev.filter((e) => e.t === 'eat'), [{ t: 'eat', i: 20, j: 1 }]);
  assert.equal(ev.filter((e) => e.t === 'nope').length, 0, 'held Cross after the eat finds no target');
  // after the eat the lead moves again
  run(state, stage, inp({ moveY: -1 }), 0.2);
  assert.ok(state.party[0].y < y - 0.5);

  ({ state, stage } = atBoulder());
  stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  const long = stepField(state, stage, inp({ moveX: 1, pressed: { cross: true } }), 2);
  assert.deepEqual(long, [{ t: 'eat', i: 20, j: 1 }]);
  assert.deepEqual(state.boulders, []);
  assert.equal(state.party[0].form, 'open');
  assert.equal(state.party[0].foldAnim, 1);
  assert.deepEqual(stepField(state, stage, inp(), 2), []);
});

test('eat: standing beside the boulder column at (19.9, 2.4) is ready by reach; Cross eats and faces back', () => {
  const { state, stage } = setupAt(19.9, 2.4, ['monster']);
  state.party[0].form = 'open'; state.party[0].foldAnim = 1;
  stepField(state, stage, inp(), 0);
  assert.equal(Math.floor(state.party[0].x), 19);
  assert.deepEqual(state.target, { i: 20, j: 1, kind: 'boulder', power: 'eat', by: 'monster', ready: true });
  const ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(ev.filter((e) => e.t === 'eat'), [{ t: 'eat', i: 20, j: 1 }]);
  assert.deepEqual(state.boulders, []);
  assert.equal(state.party[0].facing, 'back');
});

test('eat: diagonal at (19.5, 2.5), 1.41 tiles from the centre, is not ready; Cross gives nope', () => {
  const { state, stage } = setupAt(19.5, 2.5, ['monster']);
  assert.equal(state.target.i, 20);
  assert.equal(state.target.ready, false);
  assert.deepEqual(stepField(state, stage, inp({ pressed: { cross: true } }), DT).map((e) => e.t), ['nope']);
  assert.equal(state.boulders.length, 1);
});

test('eat: edge-adjacent tile is ready whatever the facing, even far from the centre: (20.5, 2.9) facing right', () => {
  const { state, stage } = setupAt(20.5, 2.9, ['monster']);
  state.party[0].facing = 'right';
  stepField(state, stage, inp(), 0);
  assert.deepEqual(state.target, { i: 20, j: 1, kind: 'boulder', power: 'eat', by: 'monster', ready: true });
});

// ---------------------------------------------------------------- Bridge, Push, Reach (M2)

const ST = Object.fromEntries(data.stages.map((s) => [s.id, parseStage(s)]));
const only = (ev, t) => ev.filter((e) => e.t === t);
const tileOf = (m) => [Math.floor(m.x), Math.floor(m.y)];
function at(id, party, x, y, facing) {
  const world = createWorld(data, { party });
  const stage = ST[id];
  const state = enterStage(world, stage, data, { at: { x, y } });
  if (facing) {
    state.party[0].facing = facing;
    if (facing === 'left' || facing === 'right') state.party[0].faceX = facing === 'left' ? -1 : 1;
  }
  stepField(state, stage, inp(), 0);
  return { world, stage, state };
}
// every member stands somewhere the team can stand
function standing(state, stage) {
  return state.party.every((m) => canStand(state, stage, Math.floor(m.x), Math.floor(m.y)));
}

test('bridge: a folded fish unfolds, stretches, the team runs over the live bridge in 1 s, and the fish is left open', () => {
  const { state, stage } = at('S2', ['fish', 'monster'], 15.5, 6.5, 'back');
  assert.deepEqual(state.target, { i: 15, j: 5, kind: 'water', power: 'bridge', by: 'fish', ready: true });
  let ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(ev, [{ t: 'fold', form: 'open' }]);
  assert.deepEqual(state.action, { kind: 'bridge', from: [15, 6], dir: [0, -1], len: 3, u: 0, short: false });
  assert.equal(canStand(state, stage, 15, 4), true, 'the bridge is live from the press');
  ev = run(state, stage, inp(), 0.5 - 2 * DT);
  assert.equal(state.action.u, 0, 'u waits for the hinge');
  ev = run(state, stage, inp(), 0.5);
  assert.ok(state.action.u > 0.4 && state.action.u < 0.6, `u ${state.action.u}`);
  assert.ok(state.party[0].y < 6 && state.party[0].y > 2, 'the lead is out over the water');
  assert.ok(standing(state, stage));
  ev = run(state, stage, inp(), 0.6);
  assert.deepEqual(only(ev, 'bridge'), [{ t: 'bridge', len: 3 }]);
  assert.equal(state.action, null);
  assert.deepEqual([state.party[0].x, state.party[0].y], [15.5, 2.5]);
  assert.equal(state.party[0].form, 'open');
  assert.equal(canStand(state, stage, 15, 4), false, 'the bridge is gone');
  assert.deepEqual(tileOf(state.party[1]), [15, 2], 'the follower gathered on the island');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('bridge: too long a gap stretches for 0.8 s, emits short, and changes nothing', () => {
  const { state, stage } = at('S2', ['fish'], 14.5, 6.5, 'back');
  state.party[0].form = 'open';
  const before = JSON.stringify({ p: state.party.map((m) => [m.x, m.y]), c: state.candy, s: state.stones });
  stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(state.action, { kind: 'bridge', from: [14, 6], dir: [0, -1], len: 3, u: state.action.u, short: true });
  assert.equal(canStand(state, stage, 14, 5), false, 'a short bridge is never standable');
  let ev = run(state, stage, inp(), 0.7);
  assert.equal(only(ev, 'short').length, 0);
  ev = run(state, stage, inp(), 0.2);
  assert.deepEqual(ev, [{ t: 'short' }]);
  assert.equal(JSON.stringify({ p: state.party.map((m) => [m.x, m.y]), c: state.candy, s: state.stones }), before);
});

test('bridge: with the wrong facing, Cross turns to the only bridgeable line; another lead gets the fish badge and nope', () => {
  const { state, stage } = at('S2', ['fish'], 15.5, 6.5, 'right');
  assert.deepEqual(state.target, { i: 15, j: 5, kind: 'water', power: 'bridge', by: 'fish', ready: true });
  const ev = run(state, stage, inp({ pressed: { cross: true } }), DT).concat(run(state, stage, inp(), 2));
  assert.equal(state.party[0].facing, 'back');
  assert.deepEqual(only(ev, 'bridge'), [{ t: 'bridge', len: 3 }]);

  const m = at('S2', ['monster', 'fish'], 15.5, 6.5, 'back');
  assert.deepEqual(m.state.target, { i: 15, j: 5, kind: 'water', power: 'bridge', by: 'fish', ready: false });
  assert.deepEqual(stepField(m.state, m.stage, inp({ pressed: { cross: true } }), DT), [{ t: 'nope' }]);
  assert.equal(m.state.action, null);
  // no fish in the party: water is nobody's target
  assert.equal(at('S2', ['monster'], 15.5, 6.5, 'back').state.target, null);
});

test('push: the boulder slides one tile after the hinge and 0.4 s; onto water it becomes a stone', () => {
  const { state, stage } = at('S6', ['icecream'], 9.5, 7.5, 'right');
  assert.deepEqual(state.target, { i: 10, j: 7, kind: 'boulder', power: 'push', by: 'icecream', ready: true });
  stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(state.action, { kind: 'push', from: [10, 7], to: [11, 7], u: 0, blocked: false });
  let ev = run(state, stage, inp(), 0.5 + 0.3);
  assert.equal(only(ev, 'push').length, 0, 'not before 0.4 s after the hinge');
  assert.ok(state.boulders.some((b) => b.i === 10 && b.j === 7), 'never half-way: still at the start');
  ev = run(state, stage, inp(), 0.15);
  assert.deepEqual(ev, [{ t: 'push', to: [11, 7] }]);
  assert.deepEqual(state.boulders.find((b) => b.j === 7), { i: 11, j: 7 });
  assert.equal(state.party[0].form, 'open');
  assert.equal(state.party[0].x, 9.5, 'the lead stays where it stood');
  // walk up and push it into the ditch: a stone, standable, and the boulder is gone
  run(state, stage, inp({ moveX: 1 }), 0.25);
  ev = run(state, stage, inp({ pressed: { cross: true } }), DT).concat(run(state, stage, inp(), 0.5));
  assert.deepEqual(ev, [{ t: 'push', to: [12, 7] }, { t: 'stone', i: 12, j: 7 }]);
  assert.deepEqual(state.stones, [{ i: 12, j: 7 }]);
  assert.equal(state.boulders.some((b) => b.j === 7), false);
  assert.equal(canStand(state, stage, 12, 7), true);
});

test('push: blocked by a candy (S1 alcove), another boulder or the stage edge: the strain plays 0.5 s, then nope; nothing moves', () => {
  const { state, stage } = at('S1', ['icecream', 'monster'], 20.5, 2.5, 'back');
  assert.deepEqual(state.target, { i: 20, j: 1, kind: 'boulder', power: 'push', by: 'icecream', ready: true },
    'the lead\'s own power is shown even when it would be blocked');
  stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(state.action, { kind: 'push', from: [20, 1], to: [20, 0], u: 0, blocked: true });
  const ev = run(state, stage, inp(), 1.1);
  assert.deepEqual(ev, [{ t: 'nope' }]);
  assert.deepEqual(state.boulders, [{ i: 20, j: 1 }]);
  assert.equal(state.candy.find((c) => c.i === 20).taken, false);
});

test('badge: a lead without the power shows the first member whose power would work', () => {
  // S4, the fish leads at (13,4) facing the loose boulder: Ice Cream's push to (11,4) works, so Ice Cream
  const a = at('S4', ['fish', 'icecream', 'monster'], 13.5, 4.5, 'left');
  assert.deepEqual(a.state.target, { i: 12, j: 4, kind: 'boulder', power: 'push', by: 'icecream', ready: false });
  // S1 alcove: Ice Cream's push would hit the candy, so the monster (eat)
  const b = at('S1', ['fish', 'icecream', 'monster'], 20.5, 2.5, 'back');
  assert.deepEqual(b.state.target, { i: 20, j: 1, kind: 'boulder', power: 'eat', by: 'monster', ready: false });
  // posts and bells are Ice Cream's
  const c = at('S6', ['monster', 'icecream'], 13.5, 7.5, 'right');
  assert.deepEqual(c.state.target, { i: 14, j: 7, kind: 'bell', power: 'reach', by: 'icecream', ready: false });
});

test('reach: 0.4 s after the hinge it rings the bell and opens every gate once; a rung bell is no longer a target', () => {
  const { state, stage } = at('S6', ['icecream'], 13.5, 7.5, 'right');
  stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  assert.deepEqual(state.action, { kind: 'reach', i: 14, j: 7, what: 'bell', u: 0 });
  let ev = run(state, stage, inp(), 0.8);
  assert.equal(only(ev, 'reach').length, 0);
  ev = run(state, stage, inp(), 0.15);
  assert.deepEqual(ev, [{ t: 'reach', kind: 'bell', i: 14, j: 7 }, { t: 'gate', i: 23, j: 6 }]);
  assert.equal(canStand(state, stage, 23, 6), true);
  ev = run(state, stage, inp({ pressed: { cross: true } }), DT).concat(run(state, stage, inp(), 0.5));
  assert.equal(only(ev, 'reach').length, 0, 'a second press rings nothing');
  assert.notEqual(state.target?.kind, 'bell', 'no outline or badge on a rung bell');
});

// ---------------------------------------------------------------- review focus 2: mid wind-up

test('mid-bridge: swap, fold, Cross and movement are dropped; the bridge lands exactly once', () => {
  const { state, stage } = at('S4', ['fish', 'icecream', 'monster'], 14.5, 7.5, 'right');
  const ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  for (let k = 0; k < 120; k++) {
    const p = [{ r1: true }, { l1: true }, { square: true }, { cross: true }][k % 4];
    ev.push(...stepField(state, stage, inp({ moveX: -1, moveY: 1, pressed: p }), DT));
    assert.ok(standing(state, stage), `frame ${k}`);
  }
  assert.deepEqual(ev.filter((e) => e.t !== 'nope' && e.t !== 'fold' && e.t !== 'swap').slice(0, 1), [{ t: 'bridge', len: 3 }]);
  assert.equal(only(ev, 'bridge').length, 1);
  assert.equal(ev.findIndex((e) => e.t === 'swap') > ev.findIndex((e) => e.t === 'bridge'), true, 'no swap before the landing');
});

test('a 2 s frame: bridge, push and reach each land exactly once and the team stands on solid ground', () => {
  const b = at('S4', ['fish', 'monster'], 14.5, 6.5, 'right');
  let ev = stepField(b.state, b.stage, inp({ pressed: { cross: true } }), 2);
  assert.deepEqual(ev, [{ t: 'fold', form: 'open' }, { t: 'bridge', len: 3 }]);
  assert.deepEqual(tileOf(b.state.party[0]), [18, 6]);
  assert.ok(standing(b.state, b.stage));
  assert.deepEqual(stepField(b.state, b.stage, inp(), 2), []);

  const p = at('S4', ['icecream'], 13.5, 4.5, 'left');
  ev = stepField(p.state, p.stage, inp({ moveX: 1, pressed: { cross: true } }), 2);
  assert.deepEqual(ev, [{ t: 'fold', form: 'open' }, { t: 'push', to: [11, 4] }]);
  assert.ok(standing(p.state, p.stage));

  const r = at('S6', ['icecream'], 13.5, 7.5, 'right');
  ev = stepField(r.state, r.stage, inp({ pressed: { cross: true } }), 2);
  assert.deepEqual(ev, [{ t: 'fold', form: 'open' }, { t: 'reach', kind: 'bell', i: 14, j: 7 }, { t: 'gate', i: 23, j: 6 }]);
});

test('a creature arriving mid-push: the push lands first, then exactly one battle', () => {
  const { state, stage } = at('S1', ['icecream'], 8.5, 4.5, 'right');
  state.boulders.push({ i: 9, j: 4 });
  stepField(state, stage, inp(), 0);
  const bat = state.creatures[0];
  const ev = stepField(state, stage, inp({ pressed: { cross: true } }), DT);
  for (let k = 0; k < 90 && !ev.some((e) => e.t === 'battle'); k++) {
    if (k >= 20) { bat.x = state.party[0].x; bat.y = state.party[0].y; bat.mode = 'chase'; }
    ev.push(...stepField(state, stage, inp(), DT));
  }
  const kinds = ev.map((e) => e.t).filter((t) => t === 'push' || t === 'battle');
  assert.deepEqual(kinds, ['push', 'battle']);
  assert.deepEqual(state.boulders.find((b) => b.j === 4), { i: 10, j: 4 });
});

test('the game closed mid-bridge or mid-push: the World is never half-way and the reload stands on solid ground', () => {
  const b = at('S4', ['fish', 'icecream'], 14.5, 8.5, 'right');
  run(b.state, b.stage, inp({ pressed: { cross: true } }), DT);
  run(b.state, b.stage, inp(), 1.0);
  assert.equal(b.state.action.kind, 'bridge');
  const lead = { x: b.state.party[0].x, y: b.state.party[0].y };
  assert.equal(b.stage.tileAt(Math.floor(lead.x), Math.floor(lead.y)), '~', 'out over the water');
  leaveStage(b.world, b.state);
  const re = enterStage(b.world, b.stage, data, { at: lead });
  assert.equal(re.action, null);
  assert.ok(standing(re, b.stage));

  const p = at('S4', ['icecream'], 13.5, 4.5, 'left');
  run(p.state, p.stage, inp({ pressed: { cross: true } }), DT);
  run(p.state, p.stage, inp(), 0.7);
  assert.equal(p.state.action.kind, 'push');
  leaveStage(p.world, p.state);
  assert.deepEqual(p.world.stages.S4.boulders, [[16, 1], [17, 1], [12, 4]], 'the boulder has not moved yet');
  const rp = enterStage(p.world, p.stage, data, { at: { x: 13.5, y: 4.5 } });
  assert.equal(rp.action, null);
});
