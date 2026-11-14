// Creatures that see and chase (M2 Task 3): sight box, standees, spotted, chase, give up,
// return, stage edges, sneak attacks. Rules: Design/slice-design.md section 2 and data.field.sight/chase.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { createField, stepField } from '../src/field/field.js';
import { stepCreature } from '../src/field/creatures.js';

const H = 1 / 30;
const STAGE = Object.fromEntries(data.stages.map((s) => [s.id, s]));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const inp = (moveX = 0, moveY = 0) => ({ moveX, moveY, dash: false, pressed: {} });

// ---------------------------------------------------------------- state building (one place)
// Builds a field on `stageData` with the lead at `at` in `form`. Nothing is stepped: the
// creatures stand where createField put them (on their spawn, facing along their patrol).
function make(stageData, { at = null, form = 'folded', party = ['monster'] } = {}) {
  const stage = parseStage(stageData);
  const state = createField({ stage, data, party: party.map((id) => ({ id })) });
  const lead = state.party[0];
  lead.form = form;
  lead.foldAnim = 1;
  if (at) {
    lead.x = at[0];
    lead.y = at[1];
    state._sim.trail = [[lead.x, lead.y]];
    state._sim.lastTile = [Math.floor(lead.x), Math.floor(lead.y)];
  }
  return { stage, state };
}

// S5 with a spider walking ghost 1's row, so the same hedge clump (14-15, 2-3) stands in the way.
const S5_SPIDER = { ...STAGE.S5, spawns: [{ creature: 'spider', at: [6, 3], patrol: [[1, 3], [30, 3]] }] };

const creature = (state, kind, n = 0) => state.creatures.filter((c) => c.kind === kind)[n];

// Puts c at distance d along its patrol loop (h = 0 step: moves it there, faces it, looks once).
function placeOnPatrol(state, stage, c, d, events = []) {
  state._sim.creatures[c.uid].dist = d;
  stepCreature(state, stage, c, 0, events);
  return events;
}

// Steps one creature alone for `seconds` (the lead stays put unless `each` moves it).
function tick(state, stage, c, seconds, each = null) {
  const events = [];
  const n = Math.round(seconds / H);
  for (let k = 0; k < n; k++) {
    if (each) each(k);
    stepCreature(state, stage, c, H, events);
  }
  return events;
}

// Does creature `kind` see a lead standing at (x, y) in `form`, after placing it at `d` on its loop?
function seesAt(stageData, kind, d, x, y, form, n = 0, boulders = null) {
  const { state, stage } = make(stageData, { at: [x, y], form });
  if (boulders) state.boulders.push(...boulders);
  const c = creature(state, kind, n);
  placeOnPatrol(state, stage, c, d);
  return c.sees;
}

// ---------------------------------------------------------------- sight box

test('sight along x: 5 ahead open, 2 folded, own row plus and minus 1, nothing behind', () => {
  // the S1 bat at its spawn (6.5, 2.5): loop starts at (4.5, 2.5), so d = 2, heading right
  const S1 = STAGE.S1;
  assert.equal(seesAt(S1, 'bat', 2, 11.4, 2.5, 'open'), true, '4.9 ahead, open');
  assert.equal(seesAt(S1, 'bat', 2, 11.6, 2.5, 'open'), false, '5.1 ahead, open');
  assert.equal(seesAt(S1, 'bat', 2, 8.4, 2.5, 'folded'), true, '1.9 ahead, folded');
  assert.equal(seesAt(S1, 'bat', 2, 8.6, 2.5, 'folded'), false, 'folded shrinks the reach to 2');
  assert.equal(seesAt(S1, 'bat', 2, 9.5, 1.1, 'open'), true, 'row above');
  assert.equal(seesAt(S1, 'bat', 2, 9.5, 3.9, 'open'), true, 'row below');
  assert.equal(seesAt(S1, 'bat', 2, 9.5, 0.9, 'open'), false, 'two rows up is outside the band');
  assert.equal(seesAt(S1, 'bat', 2, 9.5, 4.5, 'open'), false, 'two rows down is outside the band');
  assert.equal(seesAt(S1, 'bat', 2, 6.2, 2.5, 'open'), false, 'just behind');
  assert.equal(seesAt(S1, 'bat', 2, 3.5, 2.5, 'open'), false, 'behind');

  const { state, stage } = make(S1, { at: [1.5, 5.5], form: 'open' });
  const bat = creature(state, 'bat');
  placeOnPatrol(state, stage, bat, 2);
  assert.equal(bat.facing, 'right');
  assert.deepEqual(bat.sight, { x0: 6.5, y0: 1, x1: 11.5, y1: 4 });
  state.party[0].form = 'folded';
  stepCreature(state, stage, bat, 0, []);
  assert.deepEqual(bat.sight, { x0: 6.5, y0: 1, x1: 8.5, y1: 4 });
  // heading left on the bottom leg (d = 12 + 4 + 6: (10.5, 6.5)): the box flips
  placeOnPatrol(state, stage, bat, 22);
  assert.equal(bat.facing, 'left');
  assert.deepEqual(bat.sight, { x0: 8.5, y0: 5, x1: 10.5, y1: 8 });
});

test('sight in depth: 3 rows ahead open, 2 folded, own column plus and minus 1; ghost 2 faces front and back', () => {
  // S5 ghost 2: loop (24.5, 0.5) -> (24.5, 8.5) -> back; d = 1 is its spawn (24.5, 1.5) heading front
  const S5 = STAGE.S5;
  assert.equal(seesAt(S5, 'ghost', 1, 24.5, 4.4, 'open', 1), true, '2.9 rows ahead, open');
  assert.equal(seesAt(S5, 'ghost', 1, 24.5, 4.6, 'open', 1), false, '3.1 rows ahead, open');
  assert.equal(seesAt(S5, 'ghost', 1, 24.5, 3.4, 'folded', 1), true, '1.9 rows ahead, folded');
  assert.equal(seesAt(S5, 'ghost', 1, 24.5, 3.6, 'folded', 1), false, '2.1 rows ahead, folded');
  assert.equal(seesAt(S5, 'ghost', 1, 23.5, 3.5, 'open', 1), true, 'column to the left');
  assert.equal(seesAt(S5, 'ghost', 1, 25.9, 3.5, 'open', 1), true, 'column to the right');
  assert.equal(seesAt(S5, 'ghost', 1, 22.9, 3.5, 'open', 1), false, 'two columns left');
  assert.equal(seesAt(S5, 'ghost', 1, 26.1, 3.5, 'open', 1), false, 'two columns right');
  assert.equal(seesAt(S5, 'ghost', 1, 24.5, 0.8, 'open', 1), false, 'behind it');
  // d = 10: (24.5, 6.5) on the way back
  assert.equal(seesAt(S5, 'ghost', 10, 24.5, 3.6, 'open', 1), true, 'facing back, 2.9 rows ahead');
  assert.equal(seesAt(S5, 'ghost', 10, 24.5, 3.4, 'open', 1), false, 'facing back, 3.1 rows ahead');
  assert.equal(seesAt(S5, 'ghost', 10, 24.5, 7.5, 'open', 1), false, 'facing back, lead in front of it is behind its back');

  const { state, stage } = make(S5, { at: [1.5, 8.5] });
  const g2 = creature(state, 'ghost', 1);
  assert.equal(g2.facing, 'front');
  const facings = new Set();
  tick(state, stage, g2, 16 / 1.5, () => facings.add(g2.facing));
  assert.deepEqual([...facings].sort(), ['back', 'front']);
  placeOnPatrol(state, stage, g2, 1);
  assert.deepEqual(g2.sight, { x0: 23, y0: 1.5, x1: 26, y1: 3.5 }, 'folded: 2 rows ahead');
});

test('a hedge between hides the lead from a spider but not from a ghost; a boulder hides it from both', () => {
  // ghost 1 / the spider at (12.5, 3.5) heading right (d = 11); the clump is (14-15, 2-3)
  assert.equal(seesAt(STAGE.S5, 'ghost', 11, 16.5, 3.5, 'open'), true, 'ghosts see through hedges');
  assert.equal(seesAt(S5_SPIDER, 'spider', 11, 16.5, 3.5, 'open'), false, 'the hedge hides the lead');
  assert.equal(seesAt(S5_SPIDER, 'spider', 11, 13.8, 3.5, 'open'), true, 'in front of the clump it sees');
  // a boulder at (9, 3) between the creature at (6.5, 3.5) (d = 5) and the lead at (10.5, 3.5)
  assert.equal(seesAt(STAGE.S5, 'ghost', 5, 10.5, 3.5, 'open', 0, [{ i: 9, j: 3 }]), false, 'a ghost does not see through a boulder');
  assert.equal(seesAt(S5_SPIDER, 'spider', 5, 10.5, 3.5, 'open', 0, [{ i: 9, j: 3 }]), false);
  assert.equal(seesAt(STAGE.S5, 'ghost', 5, 10.5, 3.5, 'open'), true, 'without the boulder it does');
});

// ---------------------------------------------------------------- spotted and chase

test('spotted: one event, mode chase, then 3 tiles/s toward the lead (the bat 3.5)', () => {
  for (const [stageData, kind, d, at, speed] of [
    [STAGE.S2, 'spider', 2, [8.5, 7.5], 3],   // S2 spider at (4.5, 8.5) heading right
    [STAGE.S1, 'bat', 2, [10.5, 2.5], 3.5],   // S1 bat at (6.5, 2.5) heading right
  ]) {
    const { state, stage } = make(stageData, { at, form: 'open' });
    const c = creature(state, kind);
    const ev = placeOnPatrol(state, stage, c, d);
    assert.deepEqual(ev, [{ t: 'spotted', uid: c.uid }], kind);
    assert.equal(c.mode, 'chase');
    assert.equal(c.sees, true);
    const x0 = c.x, y0 = c.y;
    const ev2 = tick(state, stage, c, 0.5);
    assert.deepEqual(ev2, [], `${kind}: spotted only once`);
    assert.ok(near(Math.hypot(c.x - x0, c.y - y0), speed * 0.5, 1e-6), `${kind} moved ${Math.hypot(c.x - x0, c.y - y0)}`);
    // straight at the lead
    const ux = (at[0] - x0) / Math.hypot(at[0] - x0, at[1] - y0);
    assert.ok(near((c.x - x0) / (speed * 0.5), ux, 1e-6));
    assert.equal(c.facing, 'right');
    // it stops on the lead, it does not run past
    tick(state, stage, c, 3);
    assert.ok(near(c.x, at[0], 1e-9) && near(c.y, at[1], 1e-9), `${kind} at ${c.x},${c.y}`);
    assert.equal(c.mode, 'chase');
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  }
});

test('give up by time: 3 s without seeing the lead, then return and patrol', () => {
  const { state, stage } = make(STAGE.S2, { at: [8.5, 8.5], form: 'open' });
  const sp = creature(state, 'spider');
  placeOnPatrol(state, stage, sp, 2); // (4.5, 8.5) heading right: 4 ahead, spotted
  assert.equal(sp.mode, 'chase');
  state.party[0].form = 'folded';
  // the lead keeps 3 tiles ahead: folded, the spider's reach is 2
  let lostAt = null;
  const ev = [];
  for (let k = 0; k < Math.round(4 / H) && sp.mode === 'chase'; k++) {
    state.party[0].x = sp.x + 3;
    stepCreature(state, stage, sp, H, ev);
    if (!sp.sees && lostAt === null) lostAt = k;
    if (sp.mode !== 'chase') {
      assert.ok(Math.abs((k - lostAt + 1) * H - 3) <= H + 1e-9, `gave up after ${(k - lostAt + 1) * H} s out of sight`);
    }
  }
  assert.deepEqual(ev, [{ t: 'gaveUp', uid: sp.uid }]);
  assert.equal(sp.mode, 'return');
  // it is on its patrol line (row 8), so it is home at once and patrols from there
  state.party[0].x = 30.5; state.party[0].y = 0.5;
  tick(state, stage, sp, H);
  assert.equal(sp.mode, 'patrol');
  const x = sp.x;
  tick(state, stage, sp, 1);
  assert.ok(near(sp.y, 8.5, 1e-9));
  assert.ok(near(Math.abs(sp.x - x), 1.5, 1e-6), 'patrols on at 1.5 tiles/s from where it stopped');
});

test('give up by distance: more than 6 tiles from its patrol line, even while it sees the lead', () => {
  const { state, stage } = make(STAGE.S2, { at: [5.5, 6.6], form: 'open' });
  const sp = creature(state, 'spider');
  placeOnPatrol(state, stage, sp, 3); // (5.5, 8.5) heading right; the lead 2 rows up is outside the band
  assert.equal(sp.mode, 'patrol');
  state.party[0].x = 7.5; state.party[0].y = 8.5;
  stepCreature(state, stage, sp, 0, []);
  assert.equal(sp.mode, 'chase');
  // now the lead walks up the stage, 2 rows ahead of the spider, which follows it
  const ev = [];
  let t = 0;
  for (let k = 0; k < Math.round(4 / H) && sp.mode === 'chase'; k++) {
    state.party[0].x = sp.x;
    state.party[0].y = Math.max(0.5, sp.y - 2);
    stepCreature(state, stage, sp, H, ev);
    t += H;
  }
  assert.deepEqual(ev, [{ t: 'gaveUp', uid: sp.uid }]);
  assert.ok(t < 3, `gave up after ${t} s, before the 3 s timer`);
  assert.ok(near(8.5 - sp.y, 6, 0.11), `gave up ${8.5 - sp.y} tiles from its line`);
  assert.equal(sp.mode, 'return');
  // back to the nearest point of its line: straight down to row 8, then patrol
  state.party[0].x = 30.5; state.party[0].y = 0.5;
  const ev2 = tick(state, stage, sp, 5);
  assert.equal(sp.mode, 'patrol');
  assert.ok(near(sp.y, 8.5, 1e-9));
  assert.deepEqual(ev2.filter((e) => e.t === 'spotted'), []);
});

test('return goes through a hedge if it must; a ghost that gives up inside a hedge just patrols on', () => {
  // the S5 spider chasing at (14.5, 1.5), above the clump; the lead is out of sight below it
  {
    const { state, stage } = make(S5_SPIDER, { at: [14.5, 8.5], form: 'folded' });
    const sp = creature(state, 'spider');
    placeOnPatrol(state, stage, sp, 2);          // (3.5, 3.5) heading right
    state.party[0].x = 5.0; state.party[0].y = 3.5; // right in front: spotted
    stepCreature(state, stage, sp, 0, []);
    assert.equal(sp.mode, 'chase');
    sp.x = 14.5; sp.y = 1.5;                     // carried off its line by the chase
    state.party[0].x = 14.9; state.party[0].y = 1.5; // last seen here, just above the clump
    stepCreature(state, stage, sp, 0, []);
    assert.equal(sp.sees, true);
    state.party[0].x = 14.5; state.party[0].y = 8.5; // then gone
    const ev = tick(state, stage, sp, 3.2);
    assert.deepEqual(ev, [{ t: 'gaveUp', uid: sp.uid }]);
    let inHedge = false, homeAt = null;
    tick(state, stage, sp, 3, () => {
      if (stage.tileAt(Math.floor(sp.x), Math.floor(sp.y)) === '#') inHedge = true;
      if (!homeAt && sp.mode === 'patrol') homeAt = [sp.x, sp.y];
    });
    assert.equal(sp.mode, 'patrol');
    assert.ok(inHedge, 'it walked back through the clump');
    assert.ok(homeAt && near(homeAt[1], 3.5, 1e-9) && near(homeAt[0], 14.9, 1e-6), `home at ${homeAt}`);
  }
  // ghost 1 chases through the clump and gives up inside it
  {
    const { state, stage } = make(STAGE.S5, { at: [16.5, 3.5], form: 'open' });
    const g = creature(state, 'ghost');
    placeOnPatrol(state, stage, g, 11);  // (12.5, 3.5): sees through the hedge
    assert.equal(g.mode, 'chase');
    tick(state, stage, g, 0.6);          // 1.8 tiles: now at (14.3, 3.5)
    assert.equal(stage.tileAt(Math.floor(g.x), Math.floor(g.y)), '#', 'the ghost floats into the clump');
    state.party[0].x = 14.6;             // last seen inside the clump
    stepCreature(state, stage, g, 0, []);
    state.party[0].x = 1.5; state.party[0].y = 8.5; // gone
    const ev = tick(state, stage, g, 3.1);
    assert.deepEqual(ev, [{ t: 'gaveUp', uid: g.uid }]);
    assert.equal(stage.tileAt(Math.floor(g.x), Math.floor(g.y)), '#', 'it gave up inside the clump');
    tick(state, stage, g, 2);
    assert.equal(g.mode, 'patrol');
    assert.ok(near(g.y, 3.5, 1e-9));
  }
});

test('a walking chaser passes a hedge corner without entering it', () => {
  const rows = [
    '..........',
    '..........',
    '...#......',
    '..........',
    '..........',
  ];
  const T = { id: 'T', width: 10, depth: 5, rows, spawns: [{ creature: 'spider', at: [1, 1], patrol: [[0, 1], [2, 1]] }] };
  const { state, stage } = make(T, { at: [5.5, 2.2], form: 'open' });
  const sp = creature(state, 'spider');
  placeOnPatrol(state, stage, sp, 1); // (1.5, 1.5) heading right
  assert.equal(sp.mode, 'chase');
  let entered = false;
  tick(state, stage, sp, 3, () => { if (stage.isSolid(Math.floor(sp.x), Math.floor(sp.y), state.boulders)) entered = true; });
  assert.equal(entered, false);
  assert.ok(Math.hypot(sp.x - 5.5, sp.y - 2.2) < 1e-6, 'and it still reaches the lead');
  // pushed against the hedge, it slides along it rather than into it
  sp.x = 2.5; sp.y = 2.5;
  state.party[0].x = 5.5; state.party[0].y = 2.5;     // straight through the hedge: hidden, but
  state.party[0].form = 'open';
  const cs = state._sim.creatures[sp.uid];
  assert.equal(cs.seen !== undefined, true, 'the last-seen point is kept in _sim');
  cs.seen = [5.5, 2.4];                               // last seen just past it
  tick(state, stage, sp, 0.5, () => { if (stage.isSolid(Math.floor(sp.x), Math.floor(sp.y), state.boulders)) entered = true; });
  assert.equal(entered, false, 'a walker never enters a solid tile');
  assert.ok(near(sp.x, 3 - 1e-3, 0.01) || sp.x < 3, `stopped at the hedge face, x=${sp.x}`);
});

// ---------------------------------------------------------------- the stage edges

test('a creature never leaves its stage, chasing or returning', () => {
  // the S2 spider chasing a lead that has gone out through the left exit
  {
    const { state, stage } = make(STAGE.S2, { at: [6.5, 8.5], form: 'open' });
    const sp = creature(state, 'spider');
    placeOnPatrol(state, stage, sp, 31 + 29);   // heading left at (4.5, 8.5)
    assert.equal(sp.facing, 'left');
    state.party[0].x = 2.5; state.party[0].y = 8.5;
    stepCreature(state, stage, sp, 0, []);
    assert.equal(sp.mode, 'chase');
    state.party[0].x = -3; state.party[0].y = 9.5;
    for (let k = 0; k < Math.round(4 / H); k++) {
      stepCreature(state, stage, sp, H, []);
      assert.ok(sp.x >= 0.5 && sp.x <= stage.width - 0.5 && sp.y >= 0.5 && sp.y <= stage.depth - 0.5, `${sp.x},${sp.y}`);
    }
  }
  // S5 ghost 2 (passes over '#', and outside the grid reads as '#') chasing a lead off the back edge
  {
    const { state, stage } = make(STAGE.S5, { at: [24.5, 4.5], form: 'open' });
    const g = creature(state, 'ghost', 1);
    placeOnPatrol(state, stage, g, 1);
    assert.equal(g.mode, 'chase');
    state.party[0].y = -5;
    for (let k = 0; k < Math.round(5 / H); k++) {
      stepCreature(state, stage, g, H, []);
      assert.ok(g.y >= 0.5 && g.x >= 0.5 && g.x <= stage.width - 0.5, `${g.x},${g.y}`);
    }
  }
});

// ---------------------------------------------------------------- contact through stepField

test('touching an unaware creature from behind is a sneak attack', () => {
  // the S1 bat leaves (6.5, 2.5) heading right at 2 tiles/s; the lead walks up behind it at 4
  const { state, stage } = make(STAGE.S1, { at: [3.5, 2.5], form: 'open' });
  const bat = creature(state, 'bat');
  const ev = [];
  let seen = false;
  for (let k = 0; k < 180 && !ev.some((e) => e.t === 'battle'); k++) {
    ev.push(...stepField(state, stage, inp(1, 0), 1 / 60));
    if (bat.sees) seen = true;
  }
  assert.equal(seen, false, 'the lead behind it is never seen');
  assert.deepEqual(ev.filter((e) => e.t === 'spotted'), []);
  assert.deepEqual(ev.filter((e) => e.t === 'battle'), [{ t: 'battle', creatureUid: bat.uid, kind: 'bat', sneak: true }]);
});

test('a chasing creature gives a normal battle; a 2 s frame does not let the chaser pass through the lead', () => {
  // the S2 spider sees the open lead 4 tiles ahead and runs it down, all inside one 2 s frame
  const { state, stage } = make(STAGE.S2, { at: [8.5, 8.5], form: 'open' });
  const sp = creature(state, 'spider');
  const ev = stepField(state, stage, inp(), 2);
  assert.deepEqual(ev.map((e) => e.t), ['spotted', 'battle']);
  assert.deepEqual(ev[1], { t: 'battle', creatureUid: sp.uid, kind: 'spider', sneak: false });
  assert.ok(sp.x <= 8.5 && sp.x >= 8.5 - 0.36, `stopped at the lead, x=${sp.x}`);

  // the same through ordinary frames, with the bat in S1
  const s = make(STAGE.S1, { at: [9.5, 2.5] });
  const ev2 = [];
  for (let k = 0; k < 180; k++) ev2.push(...stepField(s.state, s.stage, inp(), 1 / 60));
  assert.deepEqual(ev2.filter((e) => e.t === 'battle'), [{ t: 'battle', creatureUid: s.state.creatures[0].uid, kind: 'bat', sneak: false }]);
  assert.ok(ev2.findIndex((e) => e.t === 'spotted') < ev2.findIndex((e) => e.t === 'battle'));
});

test('asleep and ignore: no sight, no spotting', () => {
  const { state, stage } = make(STAGE.S1, { at: [9.5, 2.5], form: 'open' });
  const bat = creature(state, 'bat');
  bat.mode = 'asleep';
  assert.deepEqual(tick(state, stage, bat, 1), []);
  assert.deepEqual([bat.x, bat.y, bat.sees], [6.5, 2.5, false]);
  bat.mode = 'ignore';
  state._sim.creatures[bat.uid].ignore = 1;
  const ev = tick(state, stage, bat, 0.5);
  assert.deepEqual(ev, []);
  assert.equal(bat.mode, 'ignore');
});
