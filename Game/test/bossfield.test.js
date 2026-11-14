// S7 boss: Big Ghost stands solid at its 2x2 tiles, touching it emits one battle event, the result is applied
// (won: gone for good, remembered in the World and the save, +10 candy; lost: blanket, boss still there).
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { stepField, applyBattleResult, canStand, BOSS_CANDY } from '../src/field/field.js';
import { createWorld, enterStage, leaveStage } from '../src/field/world.js';
import { toSave, loadSave } from '../src/save.js';

const stages = Object.fromEntries(data.stages.map((s) => [s.id, parseStage(s)]));
const S7 = stages.S7;
const inp = (o = {}) => ({ moveX: 0, moveY: 0, dash: false, pressed: {}, ...o });
const run = (state, stage, input, seconds) => {
  const ev = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) ev.push(...stepField(state, stage, input, 1 / 60));
  return ev;
};
const enter = () => { const w = createWorld(data, { party: ['monster', 'fish', 'icecream'] }); return { w, f: enterStage(w, S7, data, { from: 'S6', row: 4 }) }; };
const BATTLE = { t: 'battle', creatureUid: 'boss', kind: 'bigghost', boss: true, sneak: false };

test('S7 parses its boss: tiles (13-14, 3-4), three little-ghost tiles, no creatures', () => {
  assert.deepEqual(S7.boss, { i0: 13, j0: 3, i1: 14, j1: 4 });
  assert.equal(S7.littleGhosts.length, 3);
  const { f } = enter();
  assert.deepEqual(f.boss, { i0: 13, j0: 3, i1: 14, j1: 4 });
  assert.equal(f.creatures.length, 0);
  for (const [i, j] of [[13, 3], [14, 3], [13, 4], [14, 4]]) assert.equal(canStand(f, S7, i, j), false, `${i},${j} solid`);
  assert.equal(canStand(f, S7, 12, 4), true);
});

test('walking into Big Ghost emits exactly one battle event for the boss', () => {
  const { f } = enter();
  f.party[0].x = 8.5; f.party[0].y = 4.5;
  const ev = run(f, S7, inp({ moveX: 1 }), 3);
  assert.deepEqual(ev.filter((e) => e.t === 'battle'), [BATTLE]);
  assert.ok(f.party[0].x < 13, 'stopped outside its tiles');
});

test('a won boss fight: Big Ghost is gone, +10 candy, remembered in the World and the save', () => {
  const { w, f } = enter();
  f.candyCount = 3;
  applyBattleResult(f, S7, { outcome: 'won', creatureUid: 'boss', hearts: { monster: 4 }, candyDrop: 0 });
  assert.equal(f.boss, null);
  assert.equal(f.bossBeaten, true);
  assert.equal(f.candyCount, 3 + BOSS_CANDY);
  assert.equal(f.party[0].hearts, 4);
  assert.equal(canStand(f, S7, 13, 3), true, 'the spot is free');
  leaveStage(w, f);
  assert.equal(w.bossBeaten, true);
  const mem = { v: 1 }; const store = { getItem: () => JSON.stringify(toSave(w, f, {})), setItem() {} };
  const loaded = loadSave(store, data);
  assert.equal(loaded.world.bossBeaten, true);
  const again = enterStage(loaded.world, S7, data, { from: 'S6' });
  assert.equal(again.boss, null, 'still gone after a reload and a re-entry');
  assert.equal(mem.v, 1);
});

test('a lost boss fight: the team wakes at the blanket with full hearts and the boss is still there', () => {
  const { w, f } = enter();
  f.party[0].hearts = 1; f.party[0].x = 12.5; f.party[0].y = 3.5;
  applyBattleResult(f, S7, { outcome: 'lost', creatureUid: 'boss' });
  assert.ok(f.boss);
  assert.equal(f.bossBeaten, false);
  assert.deepEqual([Math.floor(f.party[0].x), Math.floor(f.party[0].y)], [1, 6]);
  assert.ok(f.party.every((m) => m.hearts === m.maxHearts));
  leaveStage(w, f);
  assert.ok(!w.bossBeaten);
});

test('the S6 door leads to S7 and S7 leads back to the tile in front of the door', () => {
  assert.equal(stages.S6.doorTo, 'S7');
  const w = createWorld(data, { party: ['monster', 'fish', 'icecream'] });
  const f = enterStage(w, S7, data, { from: 'S6', row: 3 });
  assert.deepEqual([Math.floor(f.party[0].x), Math.floor(f.party[0].y)], [1, 4]);
  leaveStage(w, f);
  const back = enterStage(w, stages.S6, data, { from: 'S7', row: 4 });
  assert.deepEqual([Math.floor(back.party[0].x), Math.floor(back.party[0].y)], [27, 4]);
});
