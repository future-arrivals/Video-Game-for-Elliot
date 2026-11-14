import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { stepField, applyBattleResult, canStand } from '../src/field/field.js';
import { createWorld, enterStage, leaveStage } from '../src/field/world.js';
import { toSave, loadSave, writeSave, SAVE_KEY, SAVE_VERSION } from '../src/save.js';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    map: m,
  };
}
const inp = (o = {}) => ({ moveX: 0, moveY: 0, dash: false, pressed: {}, ...o });
const stageOf = (id) => parseStage(data.stages.find((s) => s.id === id));
const ALL = ['monster', 'fish', 'icecream'];

test('save key and version', () => {
  assert.equal(SAVE_KEY, 'elliot-game-save-v2');
  assert.equal(typeof SAVE_VERSION, 'number');
  assert.equal(SAVE_VERSION, 2);
});

test('a save round-trips', () => {
  const stage = parseStage(data.stages[0]);
  const world = createWorld(data, { party: ALL });
  const state = enterStage(world, stage, data);
  // take the (3,1) candy, beat the bat, swap, open, walk somewhere
  state.party[0].x = 3.5; state.party[0].y = 2.5;
  stepField(state, stage, inp(), 0);
  for (let k = 0; k < 30; k++) stepField(state, stage, inp({ moveY: -1 }), 1 / 60);
  assert.equal(state.candyCount, 1);
  applyBattleResult(state, stage, { outcome: 'won', creatureUid: state.creatures[0].uid, hearts: { monster: 4 } });
  stepField(state, stage, inp({ pressed: { r1: true } }), 0);
  stepField(state, stage, inp({ pressed: { square: true } }), 1);
  for (let k = 0; k < 60; k++) stepField(state, stage, inp({ moveX: 1, moveY: 0.2 }), 1 / 60);
  state.restAt = { stageId: 'S1', i: 1, j: 7 };

  const settings = { steadyCamera: true, volume: 0.5 };
  const save = toSave(world, state, settings);
  assert.equal(save.v, SAVE_VERSION);
  assert.equal(save.stageId, 'S1');
  assert.deepEqual(save.settings, settings);

  const storage = fakeStorage();
  assert.equal(writeSave(storage, save), true);
  const loaded = loadSave(storage);
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(save)));

  const restored = enterStage(loaded.world, stage, data, { at: loaded.lead });
  assert.deepEqual(restored.party.map((m) => [m.id, m.hearts, m.form]), state.party.map((m) => [m.id, m.hearts, m.form]));
  assert.equal(restored.party[0].id, 'fish');
  assert.equal(restored.party[0].form, 'open');
  assert.equal(restored.party[0].foldAnim, 1);
  assert.equal(restored.party[2].hearts, 4);
  assert.ok(Math.abs(restored.party[0].x - state.party[0].x) < 1e-9);
  assert.ok(Math.abs(restored.party[0].y - state.party[0].y) < 1e-9);
  assert.equal(restored.party[0].faceX, state.party[0].faceX);
  assert.equal(restored.candyCount, 1);
  assert.deepEqual(restored.candy, state.candy);
  assert.deepEqual(restored.boulders, state.boulders);
  assert.deepEqual(restored.restAt, state.restAt);
  assert.equal(restored.creatures[0].mode, 'asleep');
  assert.deepEqual([restored.creatures[0].x, restored.creatures[0].y], [6.5, 2.5]);
  // saving the restored state gives the same save
  assert.deepEqual(toSave(loaded.world, restored, settings), save);
  // restored state works
  const ev = stepField(restored, stage, inp({ moveX: 1 }), 0.1);
  assert.ok(Array.isArray(ev));
});

test('toSave does not change the live World', () => {
  const stage = parseStage(data.stages[0]);
  const world = createWorld(data);
  const state = enterStage(world, stage, data);
  const before = JSON.stringify(world);
  state.candy[0].taken = true; state.candyCount = 1;
  const save = toSave(world, state, {});
  assert.equal(JSON.stringify(world), before);
  assert.deepEqual(save.world.stages.S1.candyTaken, [[3, 1]]);
  assert.equal(save.world.candyCount, 1);
});

test('a round trip in a later stage keeps every stage\'s memory', () => {
  const world = createWorld(data, { party: ALL });
  const s1 = enterStage(world, stageOf('S1'), data);
  s1.candy[0].taken = true; s1.candyCount = 1;
  leaveStage(world, s1);
  const s4 = enterStage(world, stageOf('S4'), data, { from: 'S3', row: 6 });
  s4.stones.push({ i: 15, j: 7 });
  s4.gates[0].open = true;
  s4.boulders = s4.boulders.filter((b) => b.i !== 12);
  const storage = fakeStorage();
  writeSave(storage, toSave(world, s4, {}));
  const loaded = loadSave(storage);
  assert.equal(loaded.stageId, 'S4');
  const back = enterStage(loaded.world, stageOf('S4'), data, { at: loaded.lead });
  assert.deepEqual(back.stones, [{ i: 15, j: 7 }]);
  assert.deepEqual(back.gates, [{ i: 16, j: 3, open: true }]);
  assert.equal(back.boulders.length, 2);
  assert.deepEqual(loaded.world.stages.S1.candyTaken, [[3, 1]]);
  assert.equal(back.candyCount, 1);
});

test('loadSave returns null for bad or missing data and never throws', () => {
  const K = SAVE_KEY;
  assert.equal(loadSave(fakeStorage()), null, 'nothing saved');
  assert.equal(loadSave(fakeStorage({ [K]: '{not json' })), null, 'garbage');
  assert.equal(loadSave(fakeStorage({ [K]: 'null' })), null, 'null JSON');
  assert.equal(loadSave(fakeStorage({ [K]: '42' })), null, 'a number');
  assert.equal(loadSave(fakeStorage({ [K]: '[]' })), null, 'an array');
  assert.equal(loadSave(fakeStorage({ [K]: JSON.stringify({ v: 0, stageId: 'S1', party: [] }) })), null, 'old version');
  assert.equal(loadSave(fakeStorage({ [K]: JSON.stringify({ v: SAVE_VERSION + 1, stageId: 'S1' }) })), null, 'newer version');
  assert.equal(loadSave(fakeStorage({ [K]: JSON.stringify({ v: SAVE_VERSION }) })), null, 'right version, missing fields');
  assert.equal(loadSave(null), null, 'no storage');
  assert.equal(loadSave(undefined), null);
  assert.equal(loadSave({ getItem() { throw new Error('SecurityError'); } }), null, 'throwing storage');
  assert.equal(loadSave({}), null, 'storage without getItem');
});

test('an old or odd save starts fresh: v1, a missing stage, an unknown character, broken memory', () => {
  const stage = parseStage(data.stages[0]);
  const world = createWorld(data);
  const good = toSave(world, enterStage(world, stage, data), {});
  const load = (obj, key = SAVE_KEY) => loadSave(fakeStorage({ [key]: typeof obj === 'string' ? obj : JSON.stringify(obj) }));
  assert.notEqual(load(good), null, 'the good one loads');
  // a v1 save, under its own key and under the v2 key
  const v1 = {
    v: 1, stageId: 'S1', party: [{ id: 'monster', hearts: 9, form: 'folded' }], lead: { x: 3, y: 4, faceX: 1, facing: 'right' },
    candyTaken: [], boulders: [[20, 1]], asleep: [], restAt: { stageId: 'S1', i: 1, j: 7 }, candyCount: 0, settings: {},
  };
  assert.equal(load(v1, 'elliot-game-save-v1'), null, 'v1 key is not read');
  assert.equal(load(v1), null, 'v1 shape under the v2 key');
  const w = (patch) => ({ ...good, world: { ...good.world, ...patch } });
  assert.equal(load({ ...w({ stageId: 'S99' }), stageId: 'S99' }), null, 'a stage that does not exist');
  assert.equal(load(w({ stageId: 'S2' })), null, 'stage ids disagree');
  assert.equal(load(w({ party: [{ id: 'nobody', hearts: 3 }] })), null, 'a character not in the data');
  assert.equal(load(w({ party: [{ id: 'monster', hearts: 3 }, { id: 'monster', hearts: 3 }] })), null, 'a character twice');
  assert.equal(load(w({ party: [] })), null, 'nobody');
  assert.equal(load(w({ restAt: { stageId: 'S42', i: 1, j: 1 } })), null, 'rest on a stage that does not exist');
  assert.equal(load(w({ stages: { S77: good.world.stages.S1 } })), null, 'memory of a stage that does not exist');
  assert.equal(load(w({ stages: { S1: { ...good.world.stages.S1, boulders: 'no' } } })), null, 'broken memory');
  assert.equal(load(w({ lollipop: 'yes' })), null);
  assert.equal(load({ ...good, lead: { x: 'a', y: 1 } }), null);
  assert.equal(load({ ...good, settings: null }), null);
});

test('pendingBattle: toSave records it, loadSave keeps it, a missing or bad one is tolerated', () => {
  const stage = parseStage(data.stages[0]);
  const world = createWorld(data, { party: ['monster', 'fish'] });
  const state = enterStage(world, stage, data);
  state.party[0].hearts = 6;
  const plain = toSave(world, state, {});
  assert.equal('pendingBattle' in plain, false, 'no battle: no field at all');
  const pb = { creatureUid: state.creatures[0].uid, kind: 'bat' };
  const save = toSave(world, state, {}, pb);
  assert.deepEqual(save.pendingBattle, pb);
  const storage = fakeStorage();
  writeSave(storage, save);
  const loaded = loadSave(storage);
  assert.deepEqual(loaded.pendingBattle, pb);
  assert.equal(loaded.world.party[0].hearts, 6, 'the going-in hearts come back with it');
  // a field built from it is the same as from the plain save
  const restored = enterStage(loaded.world, stage, data, { at: loaded.lead });
  assert.equal(restored.party[0].hearts, 6);
  // missing: still a valid save
  writeSave(storage, plain);
  assert.notEqual(loadSave(storage), null);
  assert.equal(loadSave(storage).pendingBattle, undefined);
  // malformed: dropped, the save itself kept
  writeSave(storage, { ...plain, pendingBattle: { creatureUid: 7 } });
  const bad = loadSave(storage);
  assert.notEqual(bad, null);
  assert.equal('pendingBattle' in bad, false);
  writeSave(storage, { ...plain, pendingBattle: 'yes' });
  assert.equal('pendingBattle' in loadSave(storage), false);
  // toSave ignores a malformed one
  assert.equal('pendingBattle' in toSave(world, state, {}, { kind: 'bat' }), false);
});

test('an eaten boulder survives a save round trip, and the target is not saved', () => {
  const stage = parseStage(data.stages[0]);
  const world = createWorld(data);
  const state = enterStage(world, stage, data);
  state.party[0].x = 20.5; state.party[0].y = 2.5; state.party[0].form = 'open';
  stepField(state, stage, inp(), 0);
  for (let k = 0; k < 6; k++) stepField(state, stage, inp({ moveY: -1 }), 1 / 60);
  stepField(state, stage, inp({ pressed: { cross: true } }), 1 / 60);
  assert.deepEqual(state.boulders, []);
  const save = toSave(world, state, {});
  assert.deepEqual(save.world.stages.S1.boulders, []);
  assert.equal('target' in save, false);
  assert.equal(JSON.stringify(save).includes('"target"'), false);
  const storage = fakeStorage();
  writeSave(storage, save);
  const loaded = loadSave(storage);
  const restored = enterStage(loaded.world, stage, data, { at: loaded.lead });
  assert.deepEqual(restored.boulders, []);
  assert.equal(stage.isSolid(20, 1, restored.boulders), false);
  assert.equal(restored.target, null);
  // walkable: the restored lead walks up through (20,1) and takes the candy at (20,0)
  for (let k = 0; k < 60; k++) stepField(restored, stage, inp({ moveY: -1 }), 1 / 60);
  assert.ok(restored.party[0].y < 1, `y=${restored.party[0].y}`);
  assert.equal(restored.candy[1].taken, true);
  // a save that happens to carry a stray target is still valid and the target is recomputed
  const stray = { ...save, target: { i: 1, j: 1, power: 'eat', by: 'monster', ready: true } };
  writeSave(storage, stray);
  const l2 = loadSave(storage);
  assert.equal(enterStage(l2.world, stage, data, { at: l2.lead }).target, null);
});

test('a save taken mid-action loads to a standable tile with no action running', () => {
  const stage = stageOf('S4');
  const world = createWorld(data, { party: ALL });
  const state = enterStage(world, stage, data, { from: 'S3', row: 6 });
  // as if half-way over a bridge: the lead is above the stream
  state.party[0].x = 16.5; state.party[0].y = 7.5;
  state.action = { kind: 'bridge', from: [14, 7], dir: [1, 0], len: 3, u: 0.5, short: false };
  const storage = fakeStorage();
  writeSave(storage, toSave(world, state, {}));
  const loaded = loadSave(storage);
  assert.notEqual(loaded, null);
  const back = enterStage(loaded.world, stage, data, { at: loaded.lead });
  const l = back.party[0];
  assert.equal(canStand(back, stage, Math.floor(l.x), Math.floor(l.y)), true);
  assert.deepEqual([l.x, l.y], [1.5, 6.5], 'moved to the stage entrance');
  assert.equal(back.action, null);
  // a saved position on a tile that has since become blocked (a closed gate) also moves
  const s2 = stageOf('S4');
  const st2 = enterStage(world, s2, data, { at: { x: 16.5, y: 3.5 } });
  assert.deepEqual([st2.party[0].x, st2.party[0].y], [1.5, 6.5]);
});
