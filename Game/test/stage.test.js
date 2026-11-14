import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage, stageId } from '../src/field/stage.js';

const get = (id) => parseStage(data.stages.find((s) => s.id === id));
const has = (list, i, j) => list.some((p) => p[0] === i && p[1] === j);

test('every stage S1 to S7 parses with the pinned fields', () => {
  for (const sd of data.stages) {
    const st = parseStage(sd);
    for (const k of ['water', 'plates', 'gates', 'posts', 'joins', 'doOver', 'door', 'pumpkin']) assert.ok(Array.isArray(st[k]), `${sd.id}.${k}`);
    assert.ok('lollipop' in st, `${sd.id}.lollipop`);
    assert.equal(typeof st.entrance, 'function');
    assert.equal(st.depth, 9);
    for (const e of st.exits) assert.match(e.to, /^S[1-7]$/, `${sd.id} exit to ${e.to}`);
    const [i, j] = st.entrance(null);
    assert.ok(i >= 0 && i < st.width && j >= 0 && j < st.depth, `${sd.id} entrance(null) inside`);
  }
  assert.equal(data.stages.length, 7);
});

test('exit targets are normalised to stage ids', () => {
  assert.equal(stageId('S5 (only past the divider)'), 'S5');
  assert.equal(stageId('S6 door via E (0,4)'), 'S6');
  assert.equal(stageId('S2'), 'S2');
  assert.equal(stageId('nowhere'), null);
  assert.equal(stageId(undefined), null);
  assert.deepEqual(get('S4').exits.filter((e) => e.at[0] === 23).map((e) => e.to), ['S5', 'S5', 'S5']);
  assert.deepEqual(get('S7').exits, [{ at: [0, 4], to: 'S6' }]);
  assert.equal(get('S6').doorTo, 'S7');
  assert.equal(get('S6').exits.some((e) => e.to === 'S7'), false, 'the door is not an exit in M2');
});

test('S4 legend: 1 plate, 1 gate, 3 boulders, 9 water, the do-over pumpkin', () => {
  const st = get('S4');
  assert.deepEqual(st.plates, [[11, 6]]);
  assert.deepEqual(st.gates, [[16, 3]]);
  assert.equal(st.boulders.length, 3);
  assert.ok(has(st.boulders, 16, 1) && has(st.boulders, 17, 1) && has(st.boulders, 12, 4));
  assert.equal(st.water.length, 9);
  for (let j = 6; j <= 8; j++) for (let i = 15; i <= 17; i++) assert.ok(has(st.water, i, j), `water ${i},${j}`);
  assert.deepEqual(st.doOver, [[2, 1]]);
  assert.deepEqual(st.candy, [[4, 7]]);
  assert.deepEqual(st.posts, []);
  assert.equal(st.lollipop, null);
});

test('S6 legend: 1 bell post, 1 gate, the door at (27,3) and (28,3), the pumpkin standee', () => {
  const st = get('S6');
  assert.deepEqual(st.posts, [{ at: [14, 7], kind: 'bell' }]);
  assert.deepEqual(st.gates, [[23, 6]]);
  assert.deepEqual(st.door, [[27, 3], [28, 3]]);
  assert.equal(st.pumpkin.length, 18);
  assert.ok(has(st.pumpkin, 25, 0) && has(st.pumpkin, 30, 2));
  assert.deepEqual(st.doOver, [[5, 1]]);
  assert.deepEqual(st.boulders, [[23, 1], [10, 7]]);
  assert.equal(st.water.length, 3 * 4 + 4 + 3);
  assert.deepEqual(st.rest, [[1, 7]]);
  assert.deepEqual(st.candy, [[15, 8], [30, 7]]);
  // solid standees; the door and the sticker machine (M4) are walkable ground
  assert.equal(st.isSolid(25, 0), true, 'pumpkin');
  assert.equal(st.isSolid(14, 7), true, 'bell post');
  assert.equal(st.isSolid(5, 1), true, 'do-over pumpkin');
  assert.equal(st.isSolid(27, 3), false, 'door');
  assert.equal(st.isSolid(2, 7), false, 'sticker machine');
  assert.equal(st.isSolid(19, 0), false, 'water is not solid');
});

test('S2 and S3: joins, the lollipop, the candy post; M4 characters are ground', () => {
  const s2 = get('S2');
  assert.deepEqual(s2.joins, [{ at: [12, 6], id: 'fish' }]);
  assert.deepEqual(s2.lollipop, [0, 0]);
  assert.deepEqual(s2.boulders, [[1, 0], [2, 0]]);
  assert.deepEqual(s2.candy, [[15, 2], [27, 2]]);
  assert.equal(s2.isSolid(27, 0), false, 'a dash star spot is ground');
  assert.equal(s2.isSolid(30, 6), false, 'the dash flag is ground');
  assert.equal(s2.isSolid(0, 0), false, 'the lollipop tile is ground');
  const s3 = get('S3');
  assert.deepEqual(s3.joins, [{ at: [6, 3], id: 'icecream' }]);
  assert.deepEqual(s3.posts, [{ at: [14, 1], kind: 'candy' }]);
  assert.deepEqual(s3.candy, [[10, 0]], 'the post candy is a post, not a floor candy');
  assert.equal(s3.isSolid(24, 0), false, 'chute');
  assert.equal(s3.isSolid(24, 5), false, 'lane');
  assert.equal(s3.isSolid(14, 1), true, 'post');
});

test('exits pair up: S1 right on row 5 arrives at S2 left on the nearest row, and back', () => {
  const s1 = get('S1'), s2 = get('S2');
  assert.deepEqual(s1.entrance(null), [1, 5], 'the start');
  assert.deepEqual(s2.entrance('S1', 5), [1, 6], 'S2 left exits are rows 6-8: nearest to row 5 is 6, one tile in');
  assert.deepEqual(s2.entrance('S1', 8), [1, 8]);
  assert.deepEqual(s1.entrance('S2', 7), [26, 6], 'S1 right exits are rows 4-6');
  assert.deepEqual(s1.entrance('S2', 5), [26, 5]);
  assert.deepEqual(s1.entrance('S2'), [26, 5], 'no row: the middle exit');
  assert.deepEqual(s2.entrance('S3', 7), [34, 7]);
  // S4's right exit leads to S5; S5's left exit comes back to S4
  assert.deepEqual(get('S5').entrance('S4', 3), [1, 3]);
  assert.deepEqual(get('S4').entrance('S5', 3), [22, 3]);
  // through the door both ways (parsed only: no travel in M2)
  assert.deepEqual(get('S6').entrance('S7'), [27, 4], 'in front of the door');
  assert.deepEqual(get('S7').entrance('S6'), [1, 4]);
  // a stage with no 'S' starts at its left entrance
  assert.deepEqual(s2.entrance(null), [1, 7]);
  assert.deepEqual(get('S4').entrance(null), [1, 6]);
  // an unknown neighbour falls back to the start
  assert.deepEqual(s1.entrance('S9', 2), [1, 5]);
});
