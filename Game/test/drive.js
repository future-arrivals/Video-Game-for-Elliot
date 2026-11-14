// Test helper (not a test file): drives a FieldState only through stepField inputs, the way a player
// would, and checks after every frame that no party member stands on a tile the team cannot stand on.
import assert from 'node:assert/strict';
import { stepField, canStand } from '../src/field/field.js';

export const DT = 1 / 60;
const DIRS = { left: [-1, 0], right: [1, 0], back: [0, -1], front: [0, 1] };

export const inp = (o = {}) => ({ moveX: 0, moveY: 0, dash: false, pressed: {}, ...o });

// Every party member's tile can be stood on (a live bridge counts while it is live).
export function assertStanding(state, stage, why = '') {
  for (const m of state.party) {
    assert.ok(canStand(state, stage, Math.floor(m.x), Math.floor(m.y)),
      `${m.id} at (${m.x.toFixed(2)}, ${m.y.toFixed(2)}) cannot stand there ${why}`);
  }
}

// Tiles reachable by walking from (i, j): Set of "i,j".
export function flood(state, stage, [i0, j0]) {
  const seen = new Set([`${i0},${j0}`]);
  const q = [[i0, j0]];
  while (q.length) {
    const [i, j] = q.shift();
    for (const [di, dj] of Object.values(DIRS)) {
      const k = `${i + di},${j + dj}`;
      if (seen.has(k) || !canStand(state, stage, i + di, j + dj)) continue;
      seen.add(k);
      q.push([i + di, j + dj]);
    }
  }
  return seen;
}

function path(state, stage, [i0, j0], [i1, j1]) {
  const prev = new Map([[`${i0},${j0}`, null]]);
  const q = [[i0, j0]];
  while (q.length) {
    const [i, j] = q.shift();
    if (i === i1 && j === j1) break;
    for (const [di, dj] of Object.values(DIRS)) {
      const k = `${i + di},${j + dj}`;
      if (prev.has(k) || !canStand(state, stage, i + di, j + dj)) continue;
      prev.set(k, [i, j]);
      q.push([i + di, j + dj]);
    }
  }
  if (!prev.has(`${i1},${j1}`)) return null;
  const out = [];
  for (let p = [i1, j1]; p; p = prev.get(`${p[0]},${p[1]}`)) out.unshift(p);
  return out;
}

export function driver(state, stage) {
  const d = {
    state, stage, events: [],
    lead: () => state.party[0],
    tile: () => [Math.floor(state.party[0].x), Math.floor(state.party[0].y)],
    step(input = inp(), dt = DT) {
      const ev = stepField(state, stage, input, dt);
      d.events.push(...ev);
      assertStanding(state, stage, `after t=${state.time.toFixed(3)}`);
      return ev;
    },
    wait(seconds, input = inp()) {
      const ev = [];
      for (let k = 0; k < Math.round(seconds / DT); k++) ev.push(...d.step(input));
      return ev;
    },
    // Steers to the centre of (x, y) in tile units, straight.
    steer(x, y) {
      const ev = [];
      for (let n = 0; n < 2000; n++) {
        const l = state.party[0];
        const dx = x - l.x, dy = y - l.y, dist = Math.hypot(dx, dy);
        if (dist < 1e-4) return ev;
        const k = Math.min(1, dist / (4 * DT)) / dist;
        ev.push(...d.step(inp({ moveX: dx * k, moveY: dy * k })));
      }
      throw new Error(`could not steer to (${x}, ${y}); lead at (${state.party[0].x}, ${state.party[0].y})`);
    },
    // Walks tile centre to tile centre along a shortest standable path to tile (i, j).
    walkTo(i, j) {
      const p = path(state, stage, d.tile(), [i, j]);
      if (!p) throw new Error(`no walking path from (${d.tile()}) to (${i},${j})`);
      const ev = [];
      for (const [a, b] of p) ev.push(...d.steer(a + 0.5, b + 0.5));
      return ev;
    },
    canWalkTo(i, j) { return !!path(state, stage, d.tile(), [i, j]); },
    // Turns to face a direction with a tiny push (moves the lead well under a thousandth of a tile).
    face(dir) {
      const [x, y] = DIRS[dir];
      return d.step(inp({ moveX: x * 1e-3, moveY: y * 1e-3 }));
    },
    // Cross, then waits until any power in progress has landed.
    cross(dt = DT) {
      const ev = d.step(inp({ pressed: { cross: true } }), dt);
      for (let n = 0; state.action && n < 400; n++) ev.push(...d.step());
      assert.equal(state.action, null, 'the power landed');
      return ev;
    },
    swap() { return d.step(inp({ pressed: { r1: true } })); },
    swapTo(id) {
      for (let n = 0; n < state.party.length && state.party[0].id !== id; n++) d.swap();
      assert.equal(state.party[0].id, id);
    },
  };
  return d;
}

export const only = (ev, t) => ev.filter((e) => e.t === t);
