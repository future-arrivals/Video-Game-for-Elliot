// Puzzles on the real stage data. Every solution is replayed as inputs through stepField (test/drive.js),
// which also checks after every frame that nobody in the team stands where the team cannot stand.
// The "cannot be solved by ..." claims use a small search over legal power uses (searchSolves below).
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { parseStage } from '../src/field/stage.js';
import { canStand } from '../src/field/field.js';
import { createWorld, enterStage, leaveStage, doOver } from '../src/field/world.js';
import { bridgeLine, pushResult, landPush, updatePlates, openGates } from '../src/field/puzzles.js';
import { driver, flood, only, assertStanding } from './drive.js';

const ST = Object.fromEntries(data.stages.map((s) => [s.id, parseStage(s)]));
const clone = (x) => JSON.parse(JSON.stringify(x));
const ALL = ['icecream', 'fish', 'monster'];

// A fresh World with this party, entering `id` from its left neighbour (or its start).
function enter(id, party, opts) {
  const world = createWorld(data, { party });
  const stage = ST[id];
  const left = stage.exits.find((e) => e.at[0] === 0);
  const f = enterStage(world, stage, data, opts ?? { from: left ? left.to : null });
  return { world, stage, f, d: driver(f, stage) };
}
const again = (f, stage) => driver(f, stage);

const S4_EXITS = ['23,2', '23,3', '23,4'];
const S6_DOOR = ['27,3', '28,3'];

// ---------------------------------------------------------------- search over legal power uses

// Breadth-first over abstract states { boulders, stones, gates open, where the team is }, from FieldState
// `start`, with this party. One move: walk anywhere reachable, then use one power from a reachable tile:
// Eat or Push a boulder edge-adjacent or diagonal (forgiving reach: a diagonal push goes along either
// axis), Reach a bell (adjacent or diagonal), or Bridge from a tile in one of 4 directions. Swapping is
// free, so any member's power is usable. Uses the real rules (canStand, bridgeLine, pushResult, landPush).
function searchSolves(start, stage, party, goal, maxUses = 8) {
  const f = clone(start);
  f.party = party.map((id) => ({ ...f.party[0], id }));
  const has = (id) => party.includes(id);
  const set = (s) => {
    f.boulders = s.b.map(([i, j]) => ({ i, j }));
    f.stones = s.s.map(([i, j]) => ({ i, j }));
    f.gates.forEach((g, k) => { g.open = s.g[k]; });
    f.action = null;
  };
  const snap = (at) => ({
    b: f.boulders.map((b) => [b.i, b.j]).sort(), s: f.stones.map((b) => [b.i, b.j]).sort(),
    g: f.gates.map((g) => g.open), at,
  });
  const lead = start.party[0];
  const first = snap([Math.floor(lead.x), Math.floor(lead.y)]);
  const seen = new Set();
  let layer = [first];
  for (let uses = 0; uses <= maxUses && layer.length; uses++) {
    const next = [];
    for (const s of layer) {
      set(s);
      const R = flood(f, stage, s.at);
      const key = JSON.stringify([s.b, s.s, s.g, [...R].sort()[0]]);
      if (seen.has(key)) continue;
      seen.add(key);
      if (goal(R)) return true;
      if (uses === maxUses) continue;
      for (const k of R) {
        const [ti, tj] = k.split(',').map(Number);
        const try_ = (fn) => { set(s); f.party.forEach((m) => { m.x = ti + 0.5; m.y = tj + 0.5; }); const at = fn(); if (at) next.push(snap(at)); };
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          if (has('fish')) {
            try_(() => {
              const line = bridgeLine(f, stage, ti, tj, [di, dj]);
              return line?.ok ? [ti + di * (line.len + 1), tj + dj * (line.len + 1)] : null;
            });
          }
        }
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const bi = ti + di, bj = tj + dj;
          const boulder = () => f.boulders.find((b) => b.i === bi && b.j === bj);
          if (has('monster')) {
            try_(() => {
              if (!boulder()) return null;
              f.boulders = f.boulders.filter((b) => b !== boulder());
              updatePlates(f, []);
              return [ti, tj];
            });
          }
          if (has('icecream')) {
            const dirs = di && dj ? [[di, 0], [0, dj]] : [[di, dj]];
            for (const dir of dirs) {
              try_(() => {
                if (!boulder()) return null;
                const r = pushResult(f, stage, bi, bj, dir);
                if (r.blocked) return null;
                landPush(f, stage, { from: [bi, bj], to: r.to }, []);
                return [ti, tj];
              });
            }
            try_(() => {
              if (!f.posts.some((p) => p.kind === 'bell' && p.i === bi && p.j === bj)) return null;
              openGates(f, []);
              return [ti, tj];
            });
          }
        }
      }
    }
    layer = next;
  }
  return false;
}
const reaches = (tiles) => (R) => tiles.some((t) => R.has(t));

// ---------------------------------------------------------------- Puzzle 1 (S4)

test('Puzzle 1: with no power used the right exit cannot be reached (flood fill over canStand)', () => {
  const { f, stage, d } = enter('S4', ALL);
  const R = flood(f, stage, d.tile());
  assert.ok(R.size > 100);
  for (const e of S4_EXITS) assert.equal(R.has(e), false, e);
  assert.equal(R.has('18,3'), false);
});

function solve1a(d) {
  d.walkTo(13, 4); d.face('left');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [11, 4] }]);
  d.walkTo(11, 3); d.face('front');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [11, 5] }]);
  d.walkTo(11, 4);
  const ev = d.cross();
  assert.deepEqual(ev.filter((e) => e.t === 'push' || e.t === 'gate'), [{ t: 'push', to: [11, 6] }, { t: 'gate', i: 16, j: 3 }]);
  assert.deepEqual(d.state.plates, [{ i: 11, j: 6, down: true }]);
  d.walkTo(16, 3); d.walkTo(17, 3);
  return d.walkTo(23, 3);
}

test('Puzzle 1a: Ice Cream alone pushes the loose boulder onto the plate; the gate opens; out by the right exit', () => {
  const { d, f } = enter('S4', ['icecream']);
  assert.deepEqual(only(solve1a(d), 'exit').slice(0, 1), [{ t: 'exit', to: 'S5' }]);
  assert.deepEqual(f.gates, [{ i: 16, j: 3, open: true }]);
});

function solve1b(d, row) {
  d.walkTo(14, row); d.face('right');
  const ev = d.cross();
  assert.deepEqual(only(ev, 'bridge'), [{ t: 'bridge', len: 3 }]);
  assert.deepEqual(d.tile(), [18, row]);
  return d.walkTo(23, 3);
}

for (const row of [6, 7, 8]) {
  test(`Puzzle 1b: the fish alone bridges the stream from (14,${row}) to (18,${row}) and leaves by the right exit`, () => {
    const { d } = enter('S4', ['fish']);
    assert.deepEqual(only(solve1b(d, row), 'exit').slice(0, 1), [{ t: 'exit', to: 'S5' }]);
  });
}

function solve1c(d, { from = [15, 1] } = {}) {
  d.walkTo(...from); d.face('right');
  for (const i of [from[0] + 1, 16, 17].filter((v, k, a) => a.indexOf(v) === k && v > from[0])) {
    assert.deepEqual(only(d.cross(), 'eat'), [{ t: 'eat', i, j: 1 }]);
    d.walkTo(i, 1);
  }
  d.walkTo(18, 1);
  return d.walkTo(23, 3);
}

test('Puzzle 1c: the monster alone eats the two-boulder plug and walks out', () => {
  const { d } = enter('S4', ['monster']);
  assert.deepEqual(only(solve1c(d), 'exit').slice(0, 1), [{ t: 'exit', to: 'S5' }]);
});

test('Puzzle 1: search says each character alone can solve it; Ice Cream cannot push the plug (two in a row)', () => {
  for (const id of ALL) {
    const { f, stage } = enter('S4', [id]);
    assert.equal(searchSolves(f, stage, [id], reaches(S4_EXITS)), true, id);
  }
  const { d, f } = enter('S4', ['icecream']);
  d.walkTo(15, 1); d.face('right');
  const ev = d.cross();
  assert.deepEqual(only(ev, 'nope'), [{ t: 'nope' }]);
  assert.equal(only(ev, 'push').length, 0);
  assert.ok(f.boulders.some((b) => b.i === 16 && b.j === 1) && f.boulders.some((b) => b.i === 17 && b.j === 1));
});

// Dead end: the loose boulder pushed up column 12 against the back fence (12,0).
function deadEndFence(d) {
  d.walkTo(12, 5); d.face('back');
  for (const j of [3, 2, 1, 0]) { assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [12, j] }]); d.walkTo(12, j + 1); }
  assert.deepEqual(only(d.cross(), 'nope'), [{ t: 'nope' }], 'the fence stops it');
}
// Dead end: the loose boulder pushed east to (15,4), then down into the stream at (15,6): a stone.
function deadEndStream(d) {
  d.walkTo(11, 4); d.face('right');
  for (const i of [13, 14, 15]) { assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [i, 4] }]); d.walkTo(i - 1, 4); }
  d.walkTo(15, 3); d.face('front');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [15, 5] }]);
  d.walkTo(15, 4);
  const ev = d.cross();
  assert.deepEqual(ev.filter((e) => e.t === 'push' || e.t === 'stone'), [{ t: 'push', to: [15, 6] }, { t: 'stone', i: 15, j: 6 }]);
}
// Dead end: the loose boulder pushed up to (12,1), then east to (15,1) in front of the plug.
function deadEndPlug(d) {
  d.walkTo(12, 5); d.face('back');
  for (const j of [3, 2, 1]) { d.cross(); d.walkTo(12, j + 1); }
  d.walkTo(11, 1); d.face('right');
  for (const i of [13, 14, 15]) { assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [i, 1] }]); d.walkTo(i - 1, 1); }
  assert.deepEqual(only(d.cross(), 'nope'), [{ t: 'nope' }], 'three in a row: blocked');
}

for (const [name, deadEnd, how] of [
  ['against the back fence', deadEndFence, 'pumpkin'],
  ['into the stream', deadEndStream, 'menu'],
  ['into (15,1) in front of the plug', deadEndPlug, 'reload'],
]) {
  test(`Puzzle 1 dead end, the loose boulder ${name}: 1b and 1c still work; after a do-over (${how}) 1a works`, () => {
    const { world, stage, f, d } = enter('S4', ALL);
    deadEnd(d);
    if (name.startsWith('against')) {
      assert.equal(searchSolves(f, stage, ['icecream'], reaches(S4_EXITS)), false, 'Ice Cream alone is stuck');
    }
    // the fish (from row 7; from row 6 too unless a stone sits there) and the monster still get out
    for (const row of [6, 7, 8]) {
      if (f.stones.some((s) => s.i === 15 && s.j === row)) continue;
      const b = again(clone(f), stage); b.swapTo('fish');
      assert.deepEqual(only(solve1b(b, row), 'exit').slice(0, 1), [{ t: 'exit', to: 'S5' }], `1b row ${row}`);
    }
    const c = again(clone(f), stage); c.swapTo('monster');
    const plugged = f.boulders.some((b) => b.i === 15 && b.j === 1);
    assert.deepEqual(only(solve1c(c, { from: plugged ? [14, 1] : [15, 1] }), 'exit').slice(0, 1), [{ t: 'exit', to: 'S5' }], '1c');
    if (f.stones.length) {
      // from the new stone the fish bridges the two water tiles left
      const s = again(clone(f), stage); s.swapTo('fish');
      s.walkTo(15, 6); s.face('right');
      assert.deepEqual(only(s.cross(), 'bridge'), [{ t: 'bridge', len: 2 }]);
      assert.deepEqual(s.tile(), [18, 6]);
    }
    // the do-over
    let g = f, gd = d;
    if (how === 'pumpkin') {
      d.walkTo(3, 1); d.face('left');
      assert.equal(f.target.kind, 'doover');
      assert.deepEqual(only(d.cross(), 'doOver'), [{ t: 'doOver' }]);
    } else if (how === 'menu') {
      g = doOver(world, stage, data, f);
      gd = again(g, stage);
    } else {
      leaveStage(world, f);                           // the game is closed and loaded again
      const back = enterStage(world, stage, data, { at: { x: f.party[0].x, y: f.party[0].y } });
      assert.deepEqual(back.boulders, f.boulders, 'the dead end survives a reload');
      g = doOver(world, stage, data);                 // pause-menu do-over with no live state
      gd = again(g, stage);
    }
    assert.deepEqual(g.boulders, [{ i: 16, j: 1 }, { i: 17, j: 1 }, { i: 12, j: 4 }]);
    assert.deepEqual(g.stones, []);
    assert.deepEqual(gd.tile(), [1, 6], 'the team is at the left entrance');
    assertStanding(g, stage);
    gd.swapTo('icecream');
    assert.deepEqual(only(solve1a(gd), 'exit').slice(0, 1), [{ t: 'exit', to: 'S5' }]);
  });
}

// ---------------------------------------------------------------- Puzzle 2 (S6)

function solve2a(d) {
  d.walkTo(9, 7); d.face('right');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [11, 7] }]);
  d.walkTo(10, 7);
  const ev = d.cross();
  assert.deepEqual(ev.filter((e) => e.t === 'push' || e.t === 'stone'), [{ t: 'push', to: [12, 7] }, { t: 'stone', i: 12, j: 7 }]);
  d.walkTo(12, 7); d.walkTo(13, 7); d.face('right');
  assert.deepEqual(d.cross().filter((e) => e.t === 'reach' || e.t === 'gate'),
    [{ t: 'reach', kind: 'bell', i: 14, j: 7 }, { t: 'gate', i: 23, j: 6 }]);
}

test('Puzzle 2: with no power used the door cannot be reached', () => {
  const { f, stage, d } = enter('S6', ALL);
  const R = flood(f, stage, d.tile());
  for (const t of S6_DOOR) assert.equal(R.has(t), false);
});

test('Puzzle 2a: Ice Cream alone makes a stone, rings the bell and walks in to the door', () => {
  const { d, f } = enter('S6', ['icecream']);
  solve2a(d);
  d.walkTo(23, 6); d.walkTo(27, 3);
  assert.deepEqual(d.tile(), [27, 3]);
  assert.deepEqual(f.stones, [{ i: 12, j: 7 }]);
});

for (const [from, dir] of [[[11, 7], 'right'], [[14, 4], 'front']]) {
  test(`Puzzle 2b: the fish bridges the ditch from (${from}) facing ${dir}, Ice Cream rings the bell, the fish bridges out, in to the door`, () => {
    const { d } = enter('S6', ['fish', 'icecream']);
    d.walkTo(...from); d.face(dir);
    assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 1 }]);
    d.swapTo('icecream');
    d.walkTo(14, 6);
    assert.deepEqual(only(d.cross(), 'gate'), [{ t: 'gate', i: 23, j: 6 }], 'Cross turns to the bell and rings it');
    d.swapTo('fish');
    d.walkTo(13, 6); d.face('left');
    assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 1 }]);
    d.walkTo(23, 6); d.walkTo(28, 3);
    assert.deepEqual(d.tile(), [28, 3]);
  });
}

test('Puzzle 2b: every bridge spot over the ditch works; deeper lines fall short', () => {
  for (const [from, dir, to] of [[[11, 6], 'right', [13, 6]], [[11, 8], 'right', [13, 8]], [[13, 4], 'front', [13, 6]], [[15, 4], 'front', [15, 6]]]) {
    const { d } = enter('S6', ['fish']);
    d.walkTo(...from); d.face(dir);
    assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 1 }]);
    assert.deepEqual(d.tile(), to);
  }
  const { d } = enter('S6', ['fish']);
  d.walkTo(12, 4); d.face('front');
  assert.deepEqual(only(d.cross(), 'short'), [{ t: 'short' }]);
  assert.deepEqual(d.tile(), [12, 4]);
});

function bridgeToLanding(d) {
  d.walkTo(18, 1); d.face('right');
  assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 3 }]);
  assert.deepEqual(d.tile(), [22, 1]);
}

test('Puzzle 2c: the fish bridges the moat to the landing, the monster eats the plug, in to the door', () => {
  const { d } = enter('S6', ['fish', 'monster']);
  bridgeToLanding(d);
  d.swapTo('monster');
  assert.deepEqual(only(d.cross(), 'eat'), [{ t: 'eat', i: 23, j: 1 }]);
  d.walkTo(27, 3);
  assert.deepEqual(d.tile(), [27, 3]);
});

test('Puzzle 2d as written does NOT get in: the plug pushed to (24,1) blocks the only way on; the team bridges back', () => {
  const { d, f, stage } = enter('S6', ['fish', 'icecream']);
  bridgeToLanding(d);
  d.swapTo('icecream');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [24, 1] }]);
  d.walkTo(23, 1);
  assert.equal(d.canWalkTo(27, 3), false, '(23,1) is boxed by hedges at (23,0), (23,2) and the boulder at (24,1)');
  assert.deepEqual(only(d.cross(), 'nope'), [{ t: 'nope' }], 'pushing it on into the pumpkin is blocked');
  // with the monster along, it eats the boulder and walks in
  const m = again(clone(f), stage);
  m.state.party.push({ ...clone(f.party[1]), id: 'monster', maxHearts: 9, hearts: 9 });
  m.swapTo('monster');
  assert.deepEqual(only(m.cross(), 'eat'), [{ t: 'eat', i: 24, j: 1 }]);
  m.walkTo(27, 3);
  // without it: the fish bridges back west and 2b still works
  d.swapTo('fish');
  d.walkTo(22, 1); d.face('left');
  assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 3 }]);
  assert.deepEqual(d.tile(), [18, 1]);
  assert.equal(searchSolves(f, stage, ['fish', 'icecream'], reaches(S6_DOOR)), true);
});

test('Puzzle 2: search says Ice Cream alone, Fish+Monster, Fish+Ice Cream and Monster+Ice Cream solve it; Fish alone and Monster alone do not', () => {
  const cases = [[['icecream'], true], [['fish', 'monster'], true], [['fish', 'icecream'], true], [['monster', 'icecream'], true],
    [['fish'], false], [['monster'], false]];
  for (const [party, want] of cases) {
    const { f, stage } = enter('S6', party);
    assert.equal(searchSolves(f, stage, party, reaches(S6_DOOR)), want, party.join('+'));
  }
});

test('Puzzle 2: the moat cannot be bridged from the front (4 deep) or onto hedge', () => {
  for (const [from, dir] of [[[20, 4], 'back'], [[19, 4], 'back'], [[18, 0], 'right'], [[18, 2], 'right'], [[18, 3], 'right']]) {
    const { d, f } = enter('S6', ['fish']);
    d.walkTo(...from); d.face(dir);
    const ev = d.cross();
    assert.deepEqual(only(ev, 'short'), [{ t: 'short' }], `${from} ${dir}`);
    assert.deepEqual(d.tile(), from);
    assert.equal(f.party[0].form, 'open');
  }
});

test('Puzzle 2 odd case: Ice Cream pushes the plug back into the moat from inside the yard; the fish bridges back from the stone', () => {
  const { d, f } = enter('S6', ['icecream', 'fish']);
  solve2a(d);
  d.walkTo(24, 1); d.face('left');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [22, 1] }]);
  d.walkTo(23, 1);
  assert.deepEqual(d.cross().filter((e) => e.t === 'stone'), [{ t: 'stone', i: 21, j: 1 }]);
  d.walkTo(22, 1); d.walkTo(21, 1);
  d.swapTo('fish'); d.face('left');
  assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 2 }]);
  assert.deepEqual(d.tile(), [18, 1]);
  assert.deepEqual(f.stones, [{ i: 12, j: 7 }, { i: 21, j: 1 }]);
});

// ---------------------------------------------------------------- the secret, lessons, joins

test('Secret: the monster eats two boulders along the back fence of S2 and takes the lollipop; the World keeps it', () => {
  const { d, f, world } = enter('S2', ['monster'], { at: { x: 3.5, y: 2.5 } });
  d.walkTo(3, 0); d.face('left');
  assert.deepEqual(only(d.cross(), 'eat'), [{ t: 'eat', i: 2, j: 0 }]);
  d.walkTo(2, 0);
  assert.deepEqual(only(d.cross(), 'eat'), [{ t: 'eat', i: 1, j: 0 }]);
  assert.deepEqual(only(d.walkTo(0, 0), 'lollipop'), [{ t: 'lollipop' }]);
  assert.equal(only(d.walkTo(1, 0), 'lollipop').length, 0, 'once');
  assert.equal(f.lollipop.taken, true);
  leaveStage(world, f);
  assert.equal(world.lollipop, true);
});

test('Secret: only a party with the monster can reach (0,0) in S2 (search over every party)', () => {
  const parties = [['monster'], ['fish'], ['icecream'], ['monster', 'fish'], ['monster', 'icecream'], ['fish', 'icecream'], ALL];
  for (const party of parties) {
    const { f, stage } = enter('S2', party, { at: { x: 3.5, y: 2.5 } });
    assert.equal(searchSolves(f, stage, party, reaches(['0,0'])), party.includes('monster'), party.join('+'));
  }
});

test('S2 bridge lesson: from (15,6) facing back the fish reaches the island candy; from (14,6) it falls short', () => {
  const { d, f } = enter('S2', ['fish', 'monster'], { at: { x: 15.5, y: 6.5 } });
  d.face('back');
  assert.deepEqual(f.target, { i: 15, j: 5, kind: 'water', power: 'bridge', by: 'fish', ready: true });
  const ev = d.cross();
  assert.deepEqual(ev.filter((e) => e.t === 'bridge' || e.t === 'candy'), [{ t: 'bridge', len: 3 }, { t: 'candy', i: 15, j: 2 }],
    'the candy waits for the landing');
  assert.deepEqual(d.tile(), [15, 2]);
  d.face('front');
  assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 3 }], 'and back');
  assert.deepEqual(d.tile(), [15, 6]);

  const s = enter('S2', ['fish'], { at: { x: 14.5, y: 6.5 } });
  s.d.face('back');
  const before = clone(s.f);
  const ev2 = s.d.cross();
  assert.deepEqual(ev2.filter((e) => e.t !== 'fold'), [{ t: 'short' }]);
  assert.deepEqual(s.f.party[0].x, before.party[0].x);
  assert.deepEqual(s.f.party[0].y, before.party[0].y);
  assert.deepEqual(s.f.candy, before.candy);
});

test('S3: Ice Cream pushes the boulder east from (9,2) and takes the alcove candy; Reach takes the post candy at (14,1)', () => {
  const { d, f } = enter('S3', ['icecream']);
  d.walkTo(9, 2); d.face('right');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [11, 2] }]);
  assert.deepEqual(only(d.walkTo(10, 0), 'candy'), [{ t: 'candy', i: 10, j: 0 }]);
  const n = f.candyCount;
  d.walkTo(14, 2);
  assert.deepEqual(f.target, { i: 14, j: 1, kind: 'post', power: 'reach', by: 'icecream', ready: true });
  assert.deepEqual(only(d.cross(), 'reach'), [{ t: 'reach', kind: 'candy', i: 14, j: 1 }]);
  assert.equal(f.candyCount, n + 1);
  assert.equal(f.posts[0].taken, true);
  assert.equal(f.target, null, 'a taken post is nobody\'s target');
});

test('join tiles: walking into the waiting fish (S2) and ice cream (S3) adds each to the back at full hearts, once', () => {
  const { d, f, world, stage } = enter('S2', ['monster']);
  f.party[0].hearts = 4;
  assert.deepEqual(f.friends, [{ id: 'fish', i: 12, j: 6 }]);
  const ev = d.walkTo(11, 6);
  ev.push(...d.wait(0.5, { moveX: 1, moveY: 0, dash: false, pressed: {} }));
  assert.deepEqual(only(ev, 'join'), [{ t: 'join', id: 'fish' }]);
  assert.deepEqual(f.party.map((m) => [m.id, m.hearts, m.form]), [['monster', 4, 'folded'], ['fish', 8, 'folded']]);
  assert.deepEqual(f.friends, []);
  assert.deepEqual(JSON.parse(JSON.stringify(f)), f);
  leaveStage(world, f);
  assert.deepEqual(world.party.map((m) => m.id), ['monster', 'fish']);
  const back = enterStage(world, stage, data, { from: 'S1' });
  assert.deepEqual(back.friends, []);
  const s3 = enterStage(world, ST.S3, data, { from: 'S2' });
  const d3 = driver(s3, ST.S3);
  d3.walkTo(6, 4); d3.face('back');
  assert.deepEqual(only(d3.wait(0.5, { moveX: 0, moveY: -1, dash: false, pressed: {} }), 'join'), [{ t: 'join', id: 'icecream' }]);
  assert.deepEqual(s3.party.map((m) => [m.id, m.hearts]), [['monster', 4], ['fish', 8], ['icecream', 10]]);
});

// ---------------------------------------------------------------- review focus 1 and 3

test('review 1: S6, the boulder sunk into the wrong ditch (12,5) leaves Ice Cream stuck; reload, the pumpkin do-over, then 2a', () => {
  const { d, f, world, stage } = enter('S6', ['icecream']);
  d.walkTo(10, 8); d.face('back');
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [10, 6] }]);
  d.walkTo(10, 7);
  assert.deepEqual(only(d.cross(), 'push'), [{ t: 'push', to: [10, 5] }]);
  d.walkTo(9, 5); d.face('right');
  d.cross(); d.walkTo(10, 5);
  assert.deepEqual(only(d.cross(), 'stone'), [{ t: 'stone', i: 12, j: 5 }]);
  assert.equal(searchSolves(f, stage, ['icecream'], reaches(S6_DOOR)), false, 'Ice Cream alone is stuck');
  d.walkTo(12, 5);   // standing on the stone in the wrong ditch
  leaveStage(world, f);
  const g = enterStage(world, stage, data, { at: { x: f.party[0].x, y: f.party[0].y } });
  assert.deepEqual(g.stones, [{ i: 12, j: 5 }]);
  assert.deepEqual([Math.floor(g.party[0].x), Math.floor(g.party[0].y)], [12, 5], 'reloaded on the stone');
  const gd = driver(g, stage);
  gd.walkTo(4, 1); gd.face('right');
  assert.deepEqual(g.target, { i: 5, j: 1, kind: 'doover', power: 'reset', by: 'icecream', ready: true });
  assert.deepEqual(only(gd.cross(), 'doOver'), [{ t: 'doOver' }]);
  assert.deepEqual(g.stones, []);
  assert.deepEqual(g.boulders, [{ i: 23, j: 1 }, { i: 10, j: 7 }]);
  assert.deepEqual(gd.tile(), [1, 4]);
  solve2a(gd);
  gd.walkTo(23, 6); gd.walkTo(27, 3);
});

test('review 3: on a stone when the do-over fires, the team goes to the left entrance; the stone is gone, candy and open gates stay', () => {
  const { d, f, world, stage } = enter('S6', ['icecream', 'fish', 'monster']);
  solve2a(d);
  d.walkTo(15, 8);                          // takes the candy in the enclosure
  d.walkTo(12, 7);                          // on the stone
  const candy = f.candyCount;
  const g = doOver(world, stage, data, f);
  assert.equal(g, f, 'the live state is reset in place');
  assert.deepEqual(f.stones, []);
  assert.equal(f.gates[0].open, true);
  assert.equal(f.candyCount, candy);
  assert.equal(f.candy.find((c) => c.i === 15 && c.j === 8).taken, true);
  assertStanding(f, stage);
  assert.deepEqual(d.tile(), [1, 4]);
  assert.deepEqual(world.stages.S6.stones, [], 'the World has the reset too');
  d.walkTo(23, 6); d.walkTo(27, 3);
});

test('review 3: in the open gate\'s tile when the do-over fires, and on reload there', () => {
  const { d, f, world, stage } = enter('S4', ['icecream', 'fish']);
  solve1a(d);
  d.walkTo(16, 3);
  leaveStage(world, f);
  const r = enterStage(world, stage, data, { at: { x: 16.5, y: 3.5 } });
  assert.deepEqual([r.party[0].x, r.party[0].y], [16.5, 3.5], 'an open gate tile can be stood on after a reload');
  assertStanding(r, stage);
  const g = doOver(world, stage, data, r);
  assert.equal(g.gates[0].open, true, 'the gate stays open');
  assert.deepEqual(g.plates, [{ i: 11, j: 6, down: false }]);
  assertStanding(g, stage);
  assert.ok(canStand(g, stage, 16, 3));
});

test('review 3: on the far bank with the monster leading, nobody stands on water; swapping back lets the fish bridge home', () => {
  const { d, f, stage } = enter('S6', ['fish', 'icecream', 'monster']);
  bridgeToLanding(d);
  for (const m of f.party) assert.deepEqual([Math.floor(m.x), Math.floor(m.y)], [22, 1], `${m.id} gathered on the landing`);
  d.swapTo('monster');
  assertStanding(f, stage);
  d.walkTo(22, 1); d.face('left');
  assert.deepEqual(f.target.by, 'fish');
  assert.equal(f.target.ready, false);
  d.swapTo('fish'); d.face('left');
  assert.deepEqual(only(d.cross(), 'bridge'), [{ t: 'bridge', len: 3 }]);
  for (const m of f.party) assert.ok(Math.floor(m.x) <= 18, `${m.id} back on the near bank`);
  d.walkTo(10, 4);
  assertStanding(f, stage);
});
