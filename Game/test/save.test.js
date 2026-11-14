import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { createField, stepField, applyBattleResult } from '../src/field/field.js';
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

test('save key and version', () => {
  assert.equal(SAVE_KEY, 'elliot-game-save-v1');
  assert.equal(typeof SAVE_VERSION, 'number');
});

test('a save round-trips', () => {
  const stage = parseStage(data.stages[0]);
  const state = createField({ stage, data, party: [{ id: 'monster' }, { id: 'fish' }, { id: 'icecream' }] });
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
  const save = toSave(state, settings);
  assert.equal(save.v, SAVE_VERSION);
  assert.equal(save.stageId, 'S1');
  assert.deepEqual(save.settings, settings);

  const storage = fakeStorage();
  assert.equal(writeSave(storage, save), true);
  const loaded = loadSave(storage);
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(save)));

  const restored = createField({ stage, data, party: [{ id: 'monster' }], save: loaded });
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
  assert.deepEqual(toSave(restored, settings), save);
  // restored state works
  const ev = stepField(restored, stage, inp({ moveX: 1 }), 0.1);
  assert.ok(Array.isArray(ev));
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

test('writeSave does not throw when storage is blocked or full', () => {
  assert.equal(writeSave({ setItem() { throw new Error('QuotaExceededError'); } }, { v: 1 }), false);
  assert.equal(writeSave(null, { v: 1 }), false);
});

test('createField ignores a save for a different stage or with unknown characters', () => {
  const stage = parseStage(data.stages[0]);
  const fresh = createField({ stage, data, party: [{ id: 'monster' }] });
  const bad = { ...toSave(fresh, {}), party: [{ id: 'nobody', hearts: 3, form: 'open' }] };
  const s = createField({ stage, data, party: [{ id: 'monster' }], save: bad });
  assert.deepEqual(s.party.map((m) => m.id), ['monster']);
  assert.equal(s.party[0].hearts, 9);
});

test('pendingBattle: toSave records it, loadSave keeps it, a missing or bad one is tolerated', () => {
  const stage = parseStage(data.stages[0]);
  const state = createField({ stage, data, party: [{ id: 'monster' }, { id: 'fish' }] });
  state.party[0].hearts = 6;
  const plain = toSave(state, {});
  assert.equal('pendingBattle' in plain, false, 'no battle: no field at all');
  const pb = { creatureUid: state.creatures[0].uid, kind: 'bat' };
  const save = toSave(state, {}, pb);
  assert.deepEqual(save.pendingBattle, pb);
  const storage = fakeStorage();
  writeSave(storage, save);
  const loaded = loadSave(storage);
  assert.deepEqual(loaded.pendingBattle, pb);
  assert.equal(loaded.party[0].hearts, 6, 'the going-in hearts come back with it');
  // a field built from it is the same as from the plain save
  const restored = createField({ stage, data, party: [{ id: 'monster' }], save: loaded });
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
  assert.equal('pendingBattle' in toSave(state, {}, { kind: 'bat' }), false);
});

test('an eaten boulder survives a save round trip, and the target is not saved', () => {
  const stage = parseStage(data.stages[0]);
  const state = createField({ stage, data, party: [{ id: 'monster' }] });
  state.party[0].x = 20.5; state.party[0].y = 2.5; state.party[0].form = 'open';
  stepField(state, stage, inp(), 0);
  for (let k = 0; k < 6; k++) stepField(state, stage, inp({ moveY: -1 }), 1 / 60);
  stepField(state, stage, inp({ pressed: { cross: true } }), 1 / 60);
  assert.deepEqual(state.boulders, []);
  const save = toSave(state, {});
  assert.deepEqual(save.boulders, []);
  assert.equal('target' in save, false);
  const storage = fakeStorage();
  writeSave(storage, save);
  const restored = createField({ stage, data, party: [{ id: 'monster' }], save: loadSave(storage) });
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
  assert.equal(createField({ stage, data, party: [{ id: 'monster' }], save: loadSave(storage) }).target, null);
});
