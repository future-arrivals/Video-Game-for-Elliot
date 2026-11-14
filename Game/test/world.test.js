import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { createWorld, enterStage, leaveStage, restWorld } from '../src/field/world.js';
import { stepField, applyBattleResult, canStand } from '../src/field/field.js';

const stages = Object.fromEntries(data.stages.map((s) => [s.id, parseStage(s)]));
const inp = (o = {}) => ({ moveX: 0, moveY: 0, dash: false, pressed: {}, ...o });
const run = (state, stage, input, seconds) => {
  const ev = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) ev.push(...stepField(state, stage, input, 1 / 60));
  return ev;
};

test('createWorld: a fresh game is the monster alone at full hearts, in S1, nothing visited', () => {
  const w = createWorld(data);
  assert.equal(w.stageId, 'S1');
  assert.deepEqual(w.party, [{ id: 'monster', hearts: 9 }]);
  assert.equal(w.candyCount, 0);
  assert.equal(w.lollipop, false);
  assert.deepEqual(w.restAt, { stageId: 'S1', i: 1, j: 7 });
  assert.deepEqual(w.stages, {});
  assert.deepEqual(JSON.parse(JSON.stringify(w)), w);
  const w3 = createWorld(data, { party: ['monster', 'fish', 'icecream'] });
  assert.deepEqual(w3.party.map((m) => [m.id, m.hearts]), [['monster', 9], ['fish', 8], ['icecream', 10]]);
  assert.deepEqual(createWorld(data, { party: ['nobody', 'fish'] }).party.map((m) => m.id), ['fish'], 'unknown ids are dropped');
});

test('enterStage builds a FieldState with the M2 fields; S1 from nowhere starts at S', () => {
  const w = createWorld(data);
  const f = enterStage(w, stages.S1, data);
  assert.equal(f.stageId, 'S1');
  assert.deepEqual([f.party[0].x, f.party[0].y], [1.5, 5.5]);
  assert.deepEqual(f.party.map((m) => m.id), ['monster']);
  assert.deepEqual(f.stones, []);
  assert.deepEqual(f.gates, []);
  assert.deepEqual(f.plates, []);
  assert.deepEqual(f.posts, []);
  assert.deepEqual(f.friends, []);
  assert.equal(f.lollipop, null);
  assert.equal(f.action, null);
  assert.ok(w.stages.S1, 'entering marks the stage visited');
  assert.deepEqual(JSON.parse(JSON.stringify(f)), f);
});

test('S4 and S6 FieldStates carry gates, plates, posts; S2 a waiting fish and the lollipop', () => {
  const w = createWorld(data);
  const s4 = enterStage(w, stages.S4, data, { from: 'S3', row: 6 });
  assert.deepEqual(s4.gates, [{ i: 16, j: 3, open: false }]);
  assert.deepEqual(s4.plates, [{ i: 11, j: 6, down: false }]);
  assert.deepEqual([s4.party[0].x, s4.party[0].y], [1.5, 6.5]);
  assert.equal(s4.party[0].faceX, 1, 'arriving from the left faces right');
  const s6 = enterStage(w, stages.S6, data, { from: 'S5', row: 4 });
  assert.deepEqual(s6.posts, [{ i: 14, j: 7, kind: 'bell', taken: false }]);
  const s2 = enterStage(w, stages.S2, data, { from: 'S3', row: 7 });
  assert.deepEqual(s2.friends, [{ id: 'fish', i: 12, j: 6 }]);
  assert.deepEqual(s2.lollipop, { i: 0, j: 0, taken: false });
  assert.equal(s2.party[0].faceX, -1, 'arriving from the right faces left');
  assert.deepEqual([s2.party[0].x, s2.party[0].y], [34.5, 7.5]);
  // a fish already in the party is not waiting
  const w3 = createWorld(data, { party: ['monster', 'fish', 'icecream'] });
  assert.deepEqual(enterStage(w3, stages.S2, data, { from: 'S1', row: 5 }).friends, []);
  assert.deepEqual(enterStage(w3, stages.S3, data, { from: 'S2', row: 6 }).friends, []);
});

test('a boulder eaten in S1 is still gone after S1 -> S2 -> S1; candy taken stays taken; a beaten creature sleeps until restWorld', () => {
  const w = createWorld(data);
  let f = enterStage(w, stages.S1, data);
  // eat the boulder at (20,1) from (20,2)
  f.party[0].x = 20.5; f.party[0].y = 2.5; f.party[0].form = 'open'; f.party[0].facing = 'back';
  stepField(f, stages.S1, inp(), 0);
  stepField(f, stages.S1, inp({ pressed: { cross: true } }), 1 / 60);
  assert.deepEqual(f.boulders, []);
  run(f, stages.S1, inp({ moveY: -1 }), 1);
  assert.equal(f.candy[1].taken, true);
  assert.equal(f.candyCount, 1);
  // beat the bat; lose some hearts
  applyBattleResult(f, stages.S1, { outcome: 'won', creatureUid: f.creatures[0].uid, hearts: { monster: 5 } });
  assert.equal(f.creatures[0].mode, 'asleep');

  leaveStage(w, f);
  assert.deepEqual(w.stages.S1.boulders, []);
  assert.deepEqual(w.stages.S1.candyTaken, [[20, 0]]);
  assert.deepEqual(w.stages.S1.asleep, [f.creatures[0].uid]);
  assert.deepEqual(w.party, [{ id: 'monster', hearts: 5 }]);
  assert.equal(w.candyCount, 1);

  f = enterStage(w, stages.S2, data, { from: 'S1', row: 5 });
  assert.equal(w.stageId, 'S2');
  assert.equal(f.candyCount, 1);
  assert.equal(f.party[0].hearts, 5);
  leaveStage(w, f);

  f = enterStage(w, stages.S1, data, { from: 'S2', row: 6 });
  assert.equal(w.stageId, 'S1');
  assert.deepEqual(f.boulders, []);
  assert.deepEqual(f.candy.map((c) => c.taken), [false, true]);
  assert.equal(f.creatures[0].mode, 'asleep');
  assert.deepEqual([f.party[0].x, f.party[0].y], [26.5, 6.5]);
  assert.equal(f.party[0].hearts, 5);
  leaveStage(w, f);

  restWorld(w);
  assert.deepEqual(w.party, [{ id: 'monster', hearts: 9 }]);
  for (const m of Object.values(w.stages)) assert.deepEqual(m.asleep, []);
  f = enterStage(w, stages.S1, data, { from: 'S2', row: 6 });
  assert.equal(f.creatures[0].mode, 'patrol');
  assert.deepEqual(f.boulders, [], 'rest wakes creatures but does not bring boulders back');
  assert.deepEqual(JSON.parse(JSON.stringify(w)), w);
});

test('leaveStage writes stones, open gates, posts taken, joins and party order back', () => {
  const w = createWorld(data, { party: ['monster'] });
  let f = enterStage(w, stages.S4, data, { from: 'S3', row: 6 });
  f.stones.push({ i: 15, j: 6 });
  f.gates[0].open = true;
  f.boulders = f.boulders.filter((b) => !(b.i === 12 && b.j === 4));   // as if pushed into the stream
  leaveStage(w, f);
  assert.deepEqual(w.stages.S4.stones, [[15, 6]]);
  assert.deepEqual(w.stages.S4.gatesOpen, [[16, 3]]);
  assert.deepEqual(w.stages.S4.boulders, [[16, 1], [17, 1]]);
  f = enterStage(w, stages.S4, data, { from: 'S5', row: 3 });
  assert.deepEqual(f.stones, [{ i: 15, j: 6 }]);
  assert.deepEqual(f.gates, [{ i: 16, j: 3, open: true }]);
  assert.equal(f.boulders.length, 2);
  leaveStage(w, f);

  // a join (as the next task will do it): the fish goes to the back of the party, its tile is no longer waiting
  f = enterStage(w, stages.S2, data, { from: 'S1', row: 5 });
  f.friends = [];
  f.party.push({ ...f.party[0], id: 'fish', hearts: 8, maxHearts: 8 });
  f.lollipop.taken = true;
  leaveStage(w, f);
  assert.deepEqual(w.party.map((m) => m.id), ['monster', 'fish']);
  assert.deepEqual(w.stages.S2.joined, ['fish']);
  assert.equal(w.lollipop, true);
  f = enterStage(w, stages.S2, data, { from: 'S1', row: 5 });
  assert.deepEqual(f.friends, []);
  assert.deepEqual(f.lollipop, { i: 0, j: 0, taken: true });
  assert.deepEqual(f.party.map((m) => m.id), ['monster', 'fish']);

  // posts
  f = enterStage(w, stages.S3, data, { from: 'S2', row: 6 });
  f.posts[0].taken = true;
  leaveStage(w, f);
  assert.deepEqual(w.stages.S3.postsTaken, [[14, 1]]);
  assert.equal(enterStage(w, stages.S3, data, { from: 'S2', row: 6 }).posts[0].taken, true);
});

test('canStand: hedge no, water no, water with a stone yes, closed gate no, open gate yes, waiting friend no', () => {
  const w = createWorld(data);
  const s4 = enterStage(w, stages.S4, data, { from: 'S3', row: 6 });
  const st = stages.S4;
  assert.equal(canStand(s4, st, 5, 5), true, 'ground');
  assert.equal(canStand(s4, st, 16, 0), false, 'hedge');
  assert.equal(canStand(s4, st, 15, 6), false, 'water');
  assert.equal(canStand(s4, st, 16, 3), false, 'closed gate');
  assert.equal(canStand(s4, st, 12, 4), false, 'boulder');
  assert.equal(canStand(s4, st, 2, 1), false, 'do-over pumpkin');
  assert.equal(canStand(s4, st, 11, 6), true, 'plate');
  assert.equal(canStand(s4, st, -1, 5), false, 'outside');
  assert.equal(canStand(s4, st, 5, 9), false, 'outside');
  s4.stones.push({ i: 15, j: 6 });
  assert.equal(canStand(s4, st, 15, 6), true, 'water with a stone');
  s4.gates[0].open = true;
  assert.equal(canStand(s4, st, 16, 3), true, 'open gate');
  s4.boulders = s4.boulders.filter((b) => b.i !== 12);
  assert.equal(canStand(s4, st, 12, 4), true, 'a boulder that is gone');

  const s2 = enterStage(w, stages.S2, data, { from: 'S1', row: 5 });
  assert.equal(canStand(s2, stages.S2, 12, 6), false, 'waiting fish');
  s2.friends = [];
  assert.equal(canStand(s2, stages.S2, 12, 6), true, 'after the fish joined');
  const s6 = enterStage(w, stages.S6, data, { from: 'S5', row: 4 });
  assert.equal(canStand(s6, stages.S6, 14, 7), false, 'bell post');
  assert.equal(canStand(s6, stages.S6, 26, 1), false, 'pumpkin');
  assert.equal(canStand(s6, stages.S6, 27, 3), true, 'door');
});

test('movement goes through canStand: water, a closed gate and a waiting friend all stop the lead', () => {
  const w = createWorld(data);
  // S4: walk right along row 6 into the stream at x 15
  const s4 = enterStage(w, stages.S4, data, { at: { x: 13.5, y: 6.5 } });
  run(s4, stages.S4, inp({ moveX: 1 }), 2);
  assert.ok(s4.party[0].x <= 15 - 0.35 + 1e-6, `stopped by water, x=${s4.party[0].x}`);
  // walk right along row 3 into the closed gate at (16,3)
  const g = enterStage(w, stages.S4, data, { at: { x: 14.5, y: 3.5 } });
  run(g, stages.S4, inp({ moveX: 1 }), 2);
  assert.ok(g.party[0].x <= 16 - 0.35 + 1e-6, `stopped by the gate, x=${g.party[0].x}`);
  g.gates[0].open = true;
  run(g, stages.S4, inp({ moveX: 1 }), 1);
  assert.ok(g.party[0].x > 17, `through the open gate, x=${g.party[0].x}`);
  // S2: walk along row 6 into the waiting fish at (12,6)
  const s2 = enterStage(w, stages.S2, data, { at: { x: 10.5, y: 6.5 } });
  run(s2, stages.S2, inp({ moveX: 1 }), 2);
  assert.ok(s2.party[0].x <= 12 - 0.35 + 1e-6, `stopped by the fish, x=${s2.party[0].x}`);
  // a stone makes water walkable
  const st = enterStage(w, stages.S4, data, { at: { x: 14.5, y: 6.5 } });
  st.stones.push({ i: 15, j: 6 });
  run(st, stages.S4, inp({ moveX: 1 }), 0.5);
  assert.ok(st.party[0].x > 15.2 && st.party[0].x <= 16 - 0.35 + 1e-6, `onto the stone, x=${st.party[0].x}`);
});

test('enterStage with `at` on a tile that cannot be stood on goes to the entrance', () => {
  const w = createWorld(data);
  const f = enterStage(w, stages.S4, data, { at: { x: 16.5, y: 7.5 } });   // in the stream
  assert.deepEqual([f.party[0].x, f.party[0].y], [1.5, 6.5]);
  const g = enterStage(w, stages.S1, data, { at: { x: 19.5, y: 0.5 } });  // in a hedge
  assert.deepEqual([g.party[0].x, g.party[0].y], [1.5, 5.5]);
  const h = enterStage(w, stages.S1, data, { at: { x: NaN, y: 3 } });
  assert.deepEqual([h.party[0].x, h.party[0].y], [1.5, 5.5]);
  const k = enterStage(w, stages.S1, data, { at: { x: 8.25, y: 3.75, faceX: -1, facing: 'back', form: 'open' } });
  assert.deepEqual([k.party[0].x, k.party[0].y, k.party[0].faceX, k.party[0].facing, k.party[0].form], [8.25, 3.75, -1, 'back', 'open']);
});

test('an exit event carries a plain stage id', () => {
  const w = createWorld(data);
  const f = enterStage(w, stages.S4, data, { at: { x: 21.5, y: 3.5 } });
  const ev = run(f, stages.S4, inp({ moveX: 1 }), 1);
  assert.deepEqual(ev.filter((e) => e.t === 'exit'), [{ t: 'exit', to: 'S5' }]);
});
