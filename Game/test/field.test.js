import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { createField, stepField, applyBattleResult, FOLLOW_GAP } from '../src/field/field.js';

const S1 = data.stages[0];
const DT = 1 / 60;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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

test('parseStage on S1', () => {
  const st = parseStage(S1);
  assert.equal(st.id, 'S1');
  assert.equal(st.width, 28);
  assert.equal(st.depth, 9);
  assert.deepEqual(st.start, [1, 5]);
  assert.deepEqual(st.rest, [[1, 7]]);
  assert.deepEqual(st.candy, [[3, 1], [20, 0]]);
  assert.deepEqual(st.boulders, [[20, 1]]);
  assert.deepEqual(st.hedges, [[19, 0], [21, 0], [19, 1], [21, 1]]);
  assert.deepEqual(st.exits, [
    { at: [27, 4], to: 'S2' },
    { at: [27, 5], to: 'S2' },
    { at: [27, 6], to: 'S2' },
  ]);
  assert.deepEqual(st.spawns, [{ kind: 'bat', at: [6, 2], patrol: [[4, 2], [16, 2], [16, 6], [4, 6]] }]);
  assert.equal(st.tileAt(19, 0), '#');
  assert.equal(st.tileAt(-1, 3), '#');
  assert.equal(st.tileAt(3, 9), '#');
  assert.equal(st.isSolid(19, 0), true);
  assert.equal(st.isSolid(20, 1), true);
  assert.equal(st.isSolid(20, 1, []), false, 'a boulder that is gone is not solid');
  assert.equal(st.isSolid(5, 5), false);
  assert.equal(st.isSolid(28, 5), true);
});

test('createField: shared shape and JSON-safe', () => {
  const { state } = setup(['monster', 'fish', 'icecream']);
  assert.equal(state.stageId, 'S1');
  assert.equal(state.time, 0);
  assert.equal(state.candyCount, 0);
  assert.deepEqual(state.restAt, { stageId: 'S1', i: 1, j: 7 });
  assert.deepEqual(state.candy, [{ i: 3, j: 1, taken: false }, { i: 20, j: 0, taken: false }]);
  assert.deepEqual(state.boulders, [{ i: 20, j: 1 }]);
  const lead = state.party[0];
  assert.equal(lead.id, 'monster');
  assert.equal(lead.x, 1.5);
  assert.equal(lead.y, 5.5);
  assert.equal(lead.form, 'folded');
  assert.equal(lead.foldAnim, 1);
  assert.equal(lead.hearts, 9);
  assert.equal(lead.maxHearts, 9);
  for (const m of state.party) {
    for (const k of ['id', 'x', 'y', 'faceX', 'facing', 'form', 'foldAnim', 'moving', 'hearts', 'maxHearts']) assert.ok(k in m, k);
  }
  assert.equal(state.creatures.length, 1);
  const bat = state.creatures[0];
  assert.equal(bat.kind, 'bat');
  assert.equal(bat.x, 6.5);
  assert.equal(bat.y, 2.5);
  assert.equal(bat.mode, 'patrol');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('the lead walks 4 tiles in 1 s on open ground, 5.5 dashing, diagonal not faster', () => {
  let { state, stage } = setup();
  run(state, stage, inp({ moveX: 1 }), 1);
  assert.ok(near(state.party[0].x, 5.5, 1e-6), `x=${state.party[0].x}`);
  assert.ok(near(state.party[0].y, 5.5));
  assert.equal(state.party[0].faceX, 1);
  assert.equal(state.party[0].facing, 'right');
  assert.equal(state.party[0].moving, true);

  ({ state, stage } = setup());
  run(state, stage, inp({ moveX: 1, dash: true }), 1);
  assert.ok(near(state.party[0].x, 7.0, 1e-6), `x=${state.party[0].x}`);

  ({ state, stage } = setupAt(8.5, 3.5));
  run(state, stage, inp({ moveX: 1, moveY: 1 }), 0.5);
  const d = 2 / Math.SQRT2;
  assert.ok(near(state.party[0].x, 8.5 + d, 1e-6));
  assert.ok(near(state.party[0].y, 3.5 + d, 1e-6));

  // facing: stronger axis; faceX keeps its sign when moving straight in depth
  run(state, stage, inp({ moveX: -0.4, moveY: -1 }), 0.1);
  assert.equal(state.party[0].facing, 'back');
  assert.equal(state.party[0].faceX, -1);
  run(state, stage, inp({ moveY: 1 }), 0.1);
  assert.equal(state.party[0].facing, 'front');
  assert.equal(state.party[0].faceX, -1);
  run(state, stage, inp(), 0.1);
  assert.equal(state.party[0].moving, false);
  assert.equal(state.party[0].facing, 'front');
});

test('the hedge at (19,0) stops the lead and it slides along it', () => {
  let { state, stage } = setupAt(17.5, 0.5);
  const ev = run(state, stage, inp({ moveX: 1 }), 1);
  assert.ok(near(state.party[0].x, 19 - 0.35, 0.01), `x=${state.party[0].x}`);
  assert.ok(state.party[0].x <= 19 - 0.35 + 1e-9);
  assert.equal(ev.filter((e) => e.t === 'bump').length, 1);

  // pushing diagonally into the hedge face slides along it in depth
  ({ state, stage } = setupAt(18.3, 1.8));
  run(state, stage, inp({ moveX: 1, moveY: -1 }), 1);
  assert.ok(near(state.party[0].x, 18.65, 0.01), `x=${state.party[0].x}`);
  assert.ok(near(state.party[0].y, 0.35, 0.01), `y=${state.party[0].y}`);
});

test('dt = 2 s against a wall does not pass through', () => {
  let { state, stage } = setupAt(18.0, 0.5);
  stepField(state, stage, inp({ moveX: 1, dash: true }), 2);
  assert.ok(state.party[0].x <= 18.65 + 1e-9, `x=${state.party[0].x}`);

  ({ state, stage } = setupAt(20.5, 3.5));
  stepField(state, stage, inp({ moveY: -1, dash: true }), 2);
  assert.ok(state.party[0].y >= 2.35 - 1e-9, `y=${state.party[0].y}`);
  assert.ok(near(state.party[0].y, 2.35, 0.01));

  ({ state, stage } = setupAt(22.5, 0.5));
  stepField(state, stage, inp({ moveX: -1, dash: true }), 2);
  assert.ok(state.party[0].x >= 22.35 - 1e-9, `x=${state.party[0].x}`);
});

test('a one-tile-wide corridor is walkable (radius 0.35, not an oversized box)', () => {
  const rows = [
    '##########',
    '#S.......#',
    '####.#####',
    '####.#####',
    '####.#####',
    '##########',
    '..........',
    '..........',
    '..........',
  ];
  const stage = parseStage({ id: 'T', width: 10, depth: 9, rows });
  const state = createField({ stage, data, party: [{ id: 'monster' }] });
  state.party[0].x = 4.5;
  state.party[0].y = 1.5;
  stepField(state, stage, inp(), 0);
  run(state, stage, inp({ moveY: 1 }), 1);
  assert.ok(near(state.party[0].y, 4.65, 0.01), `y=${state.party[0].y}`);
  // entering it slightly off-centre still works (slides in)
  state.party[0].x = 4.3;
  state.party[0].y = 1.5;
  run(state, stage, inp({ moveY: 1 }), 1);
  assert.ok(state.party[0].y > 3, `y=${state.party[0].y}`);
});

test('the lead cannot leave the depth range or the stage ends', () => {
  let { state, stage } = setupAt(5.5, 3.5);
  run(state, stage, inp({ moveY: -1, dash: true }), 3);
  assert.ok(state.party[0].y >= 0 && near(state.party[0].y, 0.35, 0.01), `y=${state.party[0].y}`);
  run(state, stage, inp({ moveY: 1, dash: true }), 4);
  assert.ok(state.party[0].y < 9 && near(state.party[0].y, 8.65, 0.01), `y=${state.party[0].y}`);
  stepField(state, stage, inp({ moveY: 1, dash: true }), 2);
  assert.ok(state.party[0].y < 9);
  run(state, stage, inp({ moveX: -1, dash: true }), 3);
  assert.ok(state.party[0].x >= 0 && near(state.party[0].x, 0.35, 0.01), `x=${state.party[0].x}`);
});

test('candy at (3,1) is taken once', () => {
  const { state, stage } = setupAt(3.5, 3.5);
  let ev = run(state, stage, inp({ moveY: -1 }), 0.3); // y 2.3: 0.8 from the candy
  assert.equal(ev.filter((e) => e.t === 'candy').length, 0);
  ev = run(state, stage, inp({ moveY: -1 }), 0.2); // y 1.5: on it
  assert.deepEqual(ev.filter((e) => e.t === 'candy'), [{ t: 'candy', i: 3, j: 1 }]);
  assert.equal(state.candyCount, 1);
  assert.equal(state.candy[0].taken, true);
  ev = run(state, stage, inp({ moveY: 1 }), 0.5);
  ev.push(...run(state, stage, inp({ moveY: -1 }), 1));
  assert.equal(ev.filter((e) => e.t === 'candy').length, 0);
  assert.equal(state.candyCount, 1);
});

test('the candy at (20,0) cannot be reached (boulder and hedges block it)', () => {
  const tries = [
    [20.5, 3.5, 0, -1], [20.2, 2.6, 0, -1], [20.8, 2.6, 0, -1],
    [17.5, 0.5, 1, 0], [23.5, 0.5, -1, 0], [18.5, 2.6, 1, -1], [22.5, 2.6, -1, -1],
  ];
  for (const [x, y, mx, my] of tries) {
    const { state, stage } = setupAt(x, y);
    const ev = run(state, stage, inp({ moveX: mx, moveY: my, dash: true }), 3);
    stepField(state, stage, inp({ moveX: mx, moveY: my, dash: true }), 2);
    assert.equal(ev.filter((e) => e.t === 'candy').length, 0, `from ${x},${y}`);
    assert.equal(state.candy[1].taken, false);
  }
});

test('two followers trail in order and stay behind', () => {
  const { state, stage } = setup(['monster', 'fish', 'icecream']);
  run(state, stage, inp({ moveX: 1 }), 3);
  const [lead, f1, f2] = state.party;
  assert.ok(near(lead.x, 13.5, 1e-6));
  assert.ok(near(f1.x, lead.x - FOLLOW_GAP, 0.06), `f1.x=${f1.x}`);
  assert.ok(near(f2.x, lead.x - 2 * FOLLOW_GAP, 0.06), `f2.x=${f2.x}`);
  assert.ok(near(f1.y, 5.5, 1e-6) && near(f2.y, 5.5, 1e-6));
  assert.equal(f1.moving, true);
  assert.equal(f1.faceX, 1);
  // a turn: followers go round the same corner, not cut across
  run(state, stage, inp({ moveY: -1 }), 0.5); // lead goes up 2 rows
  assert.ok(near(state.party[1].x, 13.5, 0.06) && state.party[1].y < 5.5, 'f1 turned the corner');
  assert.ok(state.party[2].x < 13.5 && near(state.party[2].y, 5.5, 0.06), 'f2 not yet at the corner');
  // they stop when the lead stops
  const before = state.party.map((m) => [m.x, m.y]);
  run(state, stage, inp(), 1);
  assert.deepEqual(state.party.map((m) => [m.x, m.y]), before);
  assert.equal(state.party[1].moving, false);
  for (const m of state.party.slice(1)) assert.equal(m.form, 'folded');
});

test('fold toggles and animates for 0.5 s, and the lead may keep moving', () => {
  const { state, stage } = setup();
  let ev = stepField(state, stage, inp({ moveX: 1, pressed: { square: true } }), DT);
  assert.deepEqual(ev.filter((e) => e.t === 'fold'), [{ t: 'fold', form: 'open' }]);
  assert.equal(state.party[0].form, 'open');
  assert.ok(near(state.party[0].foldAnim, DT / 0.5, 1e-9));
  assert.ok(state.party[0].x > 1.5);
  run(state, stage, inp({ moveX: 1 }), 0.25 - DT);
  assert.ok(near(state.party[0].foldAnim, 0.5, 1e-6), `${state.party[0].foldAnim}`);
  run(state, stage, inp({ moveX: 1 }), 0.25);
  assert.equal(state.party[0].foldAnim, 1);
  run(state, stage, inp(), 0.5);
  assert.equal(state.party[0].foldAnim, 1);
  ev = stepField(state, stage, inp({ pressed: { square: true } }), 0);
  assert.deepEqual(ev, [{ t: 'fold', form: 'folded' }]);
  assert.equal(state.party[0].form, 'folded');
  assert.equal(state.party[0].foldAnim, 0);
});

test('swap rotates the party and keeps position', () => {
  const { state, stage } = setup(['monster', 'fish', 'icecream']);
  run(state, stage, inp({ moveX: 1, moveY: 0.5 }), 1);
  stepField(state, stage, inp({ pressed: { square: true } }), 0.6); // monster opens
  assert.equal(state.party[0].form, 'open');
  const { x, y, faceX, facing } = state.party[0];
  let ev = stepField(state, stage, inp({ pressed: { r1: true } }), 0);
  assert.deepEqual(ev, [{ t: 'swap', lead: 'fish' }]);
  assert.deepEqual(state.party.map((m) => m.id), ['fish', 'icecream', 'monster']);
  const lead = state.party[0];
  assert.deepEqual([lead.x, lead.y, lead.faceX, lead.facing], [x, y, faceX, facing]);
  assert.equal(lead.form, 'folded');
  assert.equal(state.party[2].form, 'folded', 'old lead folds as a follower');
  ev = stepField(state, stage, inp({ pressed: { l1: true } }), 0);
  assert.deepEqual(ev, [{ t: 'swap', lead: 'monster' }]);
  assert.deepEqual(state.party.map((m) => m.id), ['monster', 'fish', 'icecream']);
  assert.deepEqual([state.party[0].x, state.party[0].y], [x, y]);
  ev = stepField(state, stage, inp({ pressed: { l1: true } }), 0);
  assert.deepEqual(state.party.map((m) => m.id), ['icecream', 'monster', 'fish']);

  // a party of one does not swap
  const solo = setup();
  assert.deepEqual(stepField(solo.state, solo.stage, inp({ pressed: { r1: true } }), 0), []);
});

test('the bat completes its loop back to its start point and visits all four corners', () => {
  const { state, stage } = setup();
  const bat = state.creatures[0];
  const corners = [[16.5, 2.5], [16.5, 6.5], [4.5, 6.5], [4.5, 2.5]];
  let next = 0;
  const facings = new Set();
  const n = Math.round(16 / DT); // loop is 32 tiles at 2 tiles/s
  for (let k = 0; k < n; k++) {
    const ev = stepField(state, stage, inp(), DT);
    assert.equal(ev.length, 0);
    facings.add(bat.facing);
    if (next < 4 && Math.hypot(bat.x - corners[next][0], bat.y - corners[next][1]) < 0.02) next++;
    if (k === 10) { assert.equal(bat.facing, 'right'); assert.equal(bat.faceX, 1); }
  }
  assert.equal(next, 4, 'visited all four corners in clockwise order');
  assert.ok(Math.hypot(bat.x - 6.5, bat.y - 2.5) < 0.01, `bat at ${bat.x},${bat.y}`);
  assert.deepEqual([...facings].sort(), ['back', 'front', 'left', 'right']);
});

test('contact emits exactly one battle', () => {
  const { state, stage } = setupAt(9.5, 2.5);
  const ev = run(state, stage, inp(), 3); // the bat walks right through the standing lead
  const battles = ev.filter((e) => e.t === 'battle');
  assert.deepEqual(battles, [{ t: 'battle', creatureUid: state.creatures[0].uid, kind: 'bat', sneak: false }]);

  // a long frame does not let the lead pass through the bat
  const s2 = setupAt(12.5, 2.5);
  const ev2 = stepField(s2.state, s2.stage, inp({ moveX: -1, dash: true }), 2);
  assert.equal(ev2.filter((e) => e.t === 'battle').length, 1);
  assert.ok(s2.state.party[0].x > s2.state.creatures[0].x - 0.36, 'stopped at the bat, not past it');

  // contact needs matching depth (±0.5 rows)
  const s3 = setupAt(9.5, 3.2);
  assert.equal(run(s3.state, s3.stage, inp(), 3).filter((e) => e.t === 'battle').length, 0);
});

test('battle outcome: won puts the creature to sleep at its spawn and carries hearts', () => {
  const { state, stage } = setupAt(9.5, 2.5);
  const ev = run(state, stage, inp(), 3);
  const uid = ev.find((e) => e.t === 'battle').creatureUid;
  applyBattleResult(state, stage, { outcome: 'won', creatureUid: uid, hearts: { monster: 6 } });
  const bat = state.creatures[0];
  assert.equal(bat.mode, 'asleep');
  assert.deepEqual([bat.x, bat.y], [6.5, 2.5]);
  assert.equal(state.party[0].hearts, 6);
  const ev2 = run(state, stage, inp(), 5);
  assert.deepEqual([bat.x, bat.y], [6.5, 2.5]);
  // walking onto a sleeping bat does nothing
  state.party[0].x = 6.5;
  ev2.push(...run(state, stage, inp(), 1));
  assert.equal(ev2.filter((e) => e.t === 'battle').length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('battle outcome: a won battle adds its dropped candy; ran and lost add none', () => {
  for (const [outcome, want] of [['won', 1], ['ran', 0], ['lost', 0]]) {
    const { state, stage } = setupAt(9.5, 2.5);
    const uid = run(state, stage, inp(), 3).find((e) => e.t === 'battle').creatureUid;
    const before = state.candyCount;
    applyBattleResult(state, stage, { outcome, creatureUid: uid, hearts: { monster: 5 }, candyDrop: 1 });
    assert.equal(state.candyCount - before, want, outcome);
  }
  const { state, stage } = setupAt(9.5, 2.5);
  const uid = run(state, stage, inp(), 3).find((e) => e.t === 'battle').creatureUid;
  applyBattleResult(state, stage, { outcome: 'won', creatureUid: uid, hearts: { monster: 5 } });
  assert.equal(state.candyCount, 0, 'no candyDrop given: nothing added');
});

test('battle outcome: ran ignores the lead for 3 s, then patrols; no immediate re-trigger', () => {
  const { state, stage } = setupAt(9.5, 2.5);
  const ev = run(state, stage, inp(), 3);
  const uid = ev.find((e) => e.t === 'battle').creatureUid;
  applyBattleResult(state, stage, { outcome: 'ran', creatureUid: uid, hearts: { monster: 8 } });
  const bat = state.creatures[0];
  assert.equal(bat.mode, 'ignore');
  assert.equal(state.party[0].hearts, 8);
  // the lead chases the bat during ignore: no battle
  const evI = [];
  for (let k = 0; k < Math.round(2.9 / DT); k++) {
    state.party[0].x = bat.x;
    state.party[0].y = bat.y;
    evI.push(...stepField(state, stage, inp(), DT));
  }
  assert.equal(evI.filter((e) => e.t === 'battle').length, 0);
  assert.equal(bat.mode, 'ignore');
  // still overlapping when ignore ends: no re-trigger
  for (let k = 0; k < Math.round(0.5 / DT); k++) {
    state.party[0].x = bat.x;
    state.party[0].y = bat.y;
    evI.push(...stepField(state, stage, inp(), DT));
  }
  assert.equal(bat.mode, 'patrol');
  assert.equal(evI.filter((e) => e.t === 'battle').length, 0);
  // once apart, touching it again starts a battle
  state.party[0].y = 8.5;
  stepField(state, stage, inp(), DT);
  state.party[0].x = bat.x;
  state.party[0].y = bat.y;
  assert.equal(stepField(state, stage, inp(), DT).filter((e) => e.t === 'battle').length, 1);
});

test('battle outcome: lost sends the team to the rest blanket with full hearts and resets creatures', () => {
  const { state, stage } = setup(['monster', 'fish']);
  state.party[0].x = 9.5; state.party[0].y = 2.5;
  stepField(state, stage, inp(), 0);
  const ev = run(state, stage, inp(), 3);
  const uid = ev.find((e) => e.t === 'battle').creatureUid;
  applyBattleResult(state, stage, { outcome: 'lost', creatureUid: uid, hearts: { monster: 0, fish: 0 } });
  const [lead, f] = state.party;
  assert.deepEqual([lead.x, lead.y], [1.5, 7.5]);
  assert.equal(lead.hearts, 9);
  assert.equal(f.hearts, 8);
  assert.equal(lead.form, 'folded');
  const bat = state.creatures[0];
  assert.equal(bat.mode, 'patrol');
  assert.deepEqual([bat.x, bat.y], [6.5, 2.5]);
  // standing on the blanket after respawn does not loop rest events
  const ev2 = run(state, stage, inp(), 1);
  assert.equal(ev2.filter((e) => e.t === 'rest').length, 0);
  assert.equal(ev2.filter((e) => e.t === 'battle').length, 0);
});

test('the rest blanket heals and wakes on entry only', () => {
  const { state, stage } = setup(['monster', 'fish']);
  const uid = state.creatures[0].uid;
  applyBattleResult(state, stage, { outcome: 'won', creatureUid: uid, hearts: { monster: 2, fish: 3 } });
  assert.equal(state.creatures[0].mode, 'asleep');
  state.restAt = { stageId: 'S1', i: 99, j: 99 };
  const ev = run(state, stage, inp({ moveY: 1 }), 0.5); // (1,5) -> (1,7)
  assert.deepEqual(ev.filter((e) => e.t === 'rest'), [{ t: 'rest' }]);
  assert.equal(state.party[0].hearts, 9);
  assert.equal(state.party[1].hearts, 8);
  assert.equal(state.creatures[0].mode, 'patrol');
  assert.deepEqual(state.restAt, { stageId: 'S1', i: 1, j: 7 });
  // staying and shuffling within the tile: nothing more
  state.party[0].hearts = 5;
  const ev2 = run(state, stage, inp({ moveX: 0.3 }), 0.3);
  ev2.push(...run(state, stage, inp(), 1));
  assert.equal(ev2.filter((e) => e.t === 'rest').length, 0);
  assert.equal(state.party[0].hearts, 5);
  // leave and come back: rests again
  ev2.push(...run(state, stage, inp({ moveY: -1 }), 0.3));
  ev2.push(...run(state, stage, inp({ moveY: 1 }), 0.3));
  assert.equal(ev2.filter((e) => e.t === 'rest').length, 1);
  assert.equal(state.party[0].hearts, 9);
});

test('an exit fires once per entry and the lead stops at the edge', () => {
  const { state, stage } = setupAt(25.5, 5.5);
  const ev = run(state, stage, inp({ moveX: 1 }), 2);
  assert.deepEqual(ev.filter((e) => e.t === 'exit'), [{ t: 'exit', to: 'S2' }]);
  assert.ok(near(state.party[0].x, 27.65, 0.01));
  const ev2 = run(state, stage, inp({ moveX: -1 }), 0.5);
  ev2.push(...run(state, stage, inp({ moveX: 1 }), 0.5));
  assert.equal(ev2.filter((e) => e.t === 'exit').length, 1);
});

test('time advances and state stays JSON-safe', () => {
  const { state, stage } = setup(['monster', 'fish', 'icecream']);
  run(state, stage, inp({ moveX: 1, moveY: -0.3 }), 2);
  assert.ok(near(state.time, 2, 1e-9));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

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
  assert.deepEqual(state.target, { i: 20, j: 1, power: 'eat', by: 'monster', ready: true });
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
  assert.deepEqual(state.target, { i: 20, j: 1, power: 'eat', by: 'monster', ready: true });
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
  assert.deepEqual(state.target, { i: 20, j: 1, power: 'eat', by: 'monster', ready: true });
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
  assert.deepEqual(state.target, { i: 20, j: 1, power: 'eat', by: 'monster', ready: true });
});
