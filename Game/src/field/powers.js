// Field powers and pickups: the buttons (Fold, Swap, Use), the power target, the wind-ups of Eat, Bridge,
// Push and Reach, the do-over pumpkin, and what the lead's position does to the world (candy, rest blanket,
// exits). Pure and deterministic; no DOM. field.js owns movement, followers, creatures and contact, and
// calls in here; puzzles.js holds what each power does to the ground.
//
// Who has what: Eat (monster) and Push (icecream) on a boulder; Bridge (fish) on water; Reach (icecream)
// on a candy post or a bell; anyone uses the do-over pumpkin ('reset').
//
// Target (FieldState.target), recomputed every step:
//   null, or { i, j, kind, power, by, ready[, nudgeAt] }
//     kind: 'boulder' | 'water' | 'post' | 'bell' | 'doover'; power: 'eat' | 'bridge' | 'push' | 'reach' | 'reset'
//   - which thing: the one on the tile straight ahead of the lead's tile (4-way `facing`), else the nearest
//     thing within 2 tiles (Chebyshev, by tile), else (water) the nearest bridgeable line from the lead's tile.
//     Only things someone in the party can use count (a taken candy post counts for nobody). Water counts
//     when the fish is in the party: ahead (open water on the tile ahead, even if it falls short), or one
//     of the 4 lines from the lead's tile that would make a bridge.
//   - by / power: the lead if it has a power for that kind; else the first party member (marching order)
//     whose use would work from here (a push that is not blocked), else the first who has a power at all.
//     The do-over pumpkin is always the lead's.
//   - ready: `by` is the lead AND the thing is in reach. In reach (boulder, post, bell, pumpkin): straight
//     ahead; the lead's tile edge-adjacent to its tile; or its tile centre within REACH tiles of the lead.
//     Water: straight ahead, or the only bridgeable line from the lead's tile (Cross turns to it).
//     A blocked push and a bridge that falls short are still ready: the press plays them out.
//   - nudgeAt: state.time of the latest 'nope' for this tile; kept while the target stays on it.
//
// Use (Cross) on a ready target: the lead turns to face it (larger of |dx|, |dy| to its tile centre, a tie
// goes vertical; water: the line's direction); the do-over pumpkin resets at once (puzzles.resetPuzzle);
// every other power becomes state.action, unfolding a folded lead first ({ t: 'fold', form: 'open' }, the
// 0.5 s hinge). After the hinge, action.u runs 0 -> 1 over the power's time, then the power lands once and
// the lead is left open:
//   eat     { kind: 'eat', i, j, u }                        0 s    -> { t: 'eat', i, j }
//   push    { kind: 'push', from, to, u, blocked }          0.4 s  -> { t: 'push', to } (+ 'stone', 'gate')
//           blocked: 0.5 s of strain, nothing moves         -> { t: 'nope' }
//   reach   { kind: 'reach', i, j, what: 'candy' | 'bell', u }  0.4 s -> { t: 'reach', kind, i, j } (+ 'gate')
//   bridge  { kind: 'bridge', from, dir, len, u, short }    1.0 s: the fish stretches for the first 35%, then
//           the team runs over the live bridge to the landing tile -> { t: 'bridge', len }
//           short: 0.8 s, nothing moves                     -> { t: 'short' }
// While an action is in progress the lead is busy: movement, facing and every button are dropped (not
// queued), and field.js skips pickups, tiles, exits and contact until it lands.
// Target not ready: { t: 'nope' } and target.nudgeAt = state.time. No target: nothing.

import {
  bridgeLine, bridgeLanding, pushResult, isOpenWater, landPush, landReach, resetPuzzle, updatePlates,
} from './puzzles.js';

export const FOLD_TIME = 0.5;     // seconds for the field hinge
const CANDY_REACH = 0.5;
const TARGET_RANGE = 2;           // tiles
const REACH = 1.3;                // tiles, straight-line from the lead to the thing's tile centre
const STRETCH = 0.35;             // share of a bridge's u spent stretching before the team runs
const EPS = 1e-9;

const POWERS = {
  boulder: [['monster', 'eat'], ['icecream', 'push']],
  water: [['fish', 'bridge']],
  post: [['icecream', 'reach']],
  bell: [['icecream', 'reach']],
};
const AHEAD = { left: [-1, 0], right: [1, 0], back: [0, -1], front: [0, 1] };

function duration(a) {
  if (a.kind === 'push') return a.blocked ? 0.5 : 0.4;
  if (a.kind === 'reach') return 0.4;
  if (a.kind === 'bridge') return a.short ? 0.8 : 1.0;
  return 0;
}

// ---------------------------------------------------------------- buttons

export function isBusy(state) {
  return !!state.action;
}

// Cross, Square, L1/R1 for this step (call before movement). Returns true if the party rotated or the
// team was moved (do-over): field.js then lines the followers up.
export function handleButtons(state, stage, pressed, events) {
  if (isBusy(state)) return false;
  if (pressed.cross) {
    const r = use(state, stage, events);
    if (r === 'reset') return true;
    if (r) return false;   // a power has the lead now
  }

  const lead0 = state.party[0];
  if (pressed.square) {
    lead0.form = lead0.form === 'open' ? 'folded' : 'open';
    lead0.foldAnim = 1 - lead0.foldAnim;
    events.push({ t: 'fold', form: lead0.form });
  }
  if (state.party.length > 1 && (pressed.r1 || pressed.l1) && !(pressed.r1 && pressed.l1)) {
    const old = state.party[0];
    if (pressed.r1) state.party.push(state.party.shift());
    else state.party.unshift(state.party.pop());
    const lead = state.party[0];
    lead.x = old.x; lead.y = old.y; lead.faceX = old.faceX; lead.facing = old.facing;
    lead.moving = old.moving;
    lead.form = 'folded';
    lead.foldAnim = 1;
    if (old.form === 'open') {
      old.form = 'folded';
      old.foldAnim = 1 - old.foldAnim;
    }
    events.push({ t: 'swap', lead: lead.id });
    return true;
  }
  return false;
}

// Cross. Returns 'reset' after a do-over, true when a power started (or landed), false otherwise.
function use(state, stage, events) {
  const t = computeTarget(state, stage);
  state.target = t;
  if (!t) return false;
  if (!t.ready) {
    t.nudgeAt = state.time;
    events.push({ t: 'nope' });
    return false;
  }
  if (t.power === 'reset') {
    resetPuzzle(state, stage, events);
    state.target = computeTarget(state, stage);
    return 'reset';
  }
  const lead = state.party[0];
  const li = Math.floor(lead.x), lj = Math.floor(lead.y);
  if (t.kind === 'water') {
    face(lead, t.i - li, t.j - lj);
  } else {
    const dx = t.i + 0.5 - lead.x, dy = t.j + 0.5 - lead.y;
    if (Math.abs(dx) > Math.abs(dy)) face(lead, dx < 0 ? -1 : 1, 0);
    else face(lead, 0, dy < 0 ? -1 : 1);
  }
  const dir = AHEAD[lead.facing];
  let a;
  if (t.power === 'eat') {
    a = { kind: 'eat', i: t.i, j: t.j, u: 0 };
  } else if (t.power === 'push') {
    const r = pushResult(state, stage, t.i, t.j, dir);
    a = { kind: 'push', from: [t.i, t.j], to: r.to, u: 0, blocked: r.blocked };
  } else if (t.power === 'reach') {
    a = { kind: 'reach', i: t.i, j: t.j, what: t.kind === 'bell' ? 'bell' : 'candy', u: 0 };
  } else {
    const line = bridgeLine(state, stage, li, lj, dir);
    a = { kind: 'bridge', from: [li, lj], dir: dir.slice(), len: line.len, u: 0, short: !line.ok };
    state._sim.actionFrom = [lead.x, lead.y];
  }
  state.action = a;
  if (lead.form !== 'open') {
    lead.form = 'open';
    lead.foldAnim = 1 - lead.foldAnim;
    events.push({ t: 'fold', form: 'open' });
  }
  if (lead.foldAnim >= 1 && duration(a) === 0) land(state, stage, events);
  return true;
}

function face(m, di, dj) {
  if (di) { m.facing = di < 0 ? 'left' : 'right'; m.faceX = di < 0 ? -1 : 1; }
  else m.facing = dj < 0 ? 'back' : 'front';
}

// Advances every hinge by dt (no landing). field.js uses it for the rest of a frame cut short by a battle.
export function advanceHinges(state, dt) {
  for (const m of state.party) {
    if (m.foldAnim < 1) {
      m.foldAnim += dt / FOLD_TIME;
      if (m.foldAnim >= 1 - 1e-9) m.foldAnim = 1;
    }
  }
}

// One sub-step of hinges and the action in progress. Moves the lead over a bridge and lands the action
// when u reaches 1. Returns true when the ground changed under the team (field.js then trims the trail).
export function advancePowers(state, stage, h, events) {
  advanceHinges(state, h);
  const a = state.action;
  if (!a) return false;
  const lead = state.party[0];
  if (lead.foldAnim < 1) return false;
  const T = duration(a);
  a.u = T > 0 ? Math.min(1, a.u + h / T) : 1;
  if (a.u >= 1 - EPS) a.u = 1;
  if (a.kind === 'bridge' && !a.short) {
    const [x0, y0] = state._sim.actionFrom ?? [lead.x, lead.y];
    const [ti, tj] = bridgeLanding(a);
    const p = Math.max(0, Math.min(1, (a.u - STRETCH) / (1 - STRETCH)));
    lead.x = x0 + (ti + 0.5 - x0) * p;
    lead.y = y0 + (tj + 0.5 - y0) * p;
  }
  return a.u >= 1 ? land(state, stage, events) : false;
}

function land(state, stage, events) {
  const a = state.action;
  state.action = null;
  delete state._sim.actionFrom;
  const lead = state.party[0];
  lead.form = 'open';
  if (a.kind === 'eat') {
    state.boulders = state.boulders.filter((b) => !(b.i === a.i && b.j === a.j));
    events.push({ t: 'eat', i: a.i, j: a.j });
    updatePlates(state, events);
    return false;
  }
  if (a.kind === 'push') {
    if (a.blocked) { events.push({ t: 'nope' }); return false; }
    return landPush(state, stage, a, events);
  }
  if (a.kind === 'reach') {
    landReach(state, a, events);
    return false;
  }
  if (a.short) { events.push({ t: 'short' }); return false; }
  const [ti, tj] = bridgeLanding(a);
  lead.x = ti + 0.5; lead.y = tj + 0.5;
  events.push({ t: 'bridge', len: a.len });
  return true;
}

// Drops a power in progress (the team was moved away, e.g. a lost battle).
export function cancelPowers(state) {
  state.action = null;
  delete state._sim.actionFrom;
}

// ---------------------------------------------------------------- target

// The things on the stage someone in the party could use: [{ i, j, kind }].
function things(state, stage) {
  const ids = state.party.map((m) => m.id);
  const can = (kind) => POWERS[kind].some(([id]) => ids.includes(id));
  const out = [];
  if (can('boulder')) for (const b of state.boulders) out.push({ i: b.i, j: b.j, kind: 'boulder' });
  for (const p of state.posts ?? []) {
    if (p.kind === 'bell' && can('bell')) out.push({ i: p.i, j: p.j, kind: 'bell' });
    else if (p.kind !== 'bell' && !p.taken && can('post')) out.push({ i: p.i, j: p.j, kind: 'post' });
  }
  for (const [i, j] of stage.doOver ?? []) out.push({ i, j, kind: 'doover' });
  return out;
}

export function computeTarget(state, stage) {
  const lead = state.party[0];
  const li = Math.floor(lead.x), lj = Math.floor(lead.y);
  const [di, dj] = AHEAD[lead.facing] ?? [0, 0];
  const list = things(state, stage);
  const fish = state.party.some((m) => m.id === 'fish');
  const dist = (o) => Math.hypot(o.i + 0.5 - lead.x, o.j + 0.5 - lead.y);

  let pick = null;
  let ahead = false;
  let lines = [];
  if (di || dj) {
    pick = list.find((o) => o.i === li + di && o.j === lj + dj) ?? null;
    if (!pick && fish && isOpenWater(state, stage, li + di, lj + dj)) pick = { i: li + di, j: lj + dj, kind: 'water' };
    ahead = !!pick;
  }
  if (!pick) {
    let best = Infinity;
    for (const o of list) {
      if (Math.max(Math.abs(o.i - li), Math.abs(o.j - lj)) > TARGET_RANGE) continue;
      const d = dist(o);
      if (d < best - 1e-12) { best = d; pick = o; }
    }
    if (fish) {
      for (const [x, y] of Object.values(AHEAD)) {
        if (bridgeLine(state, stage, li, lj, [x, y])?.ok) lines.push({ i: li + x, j: lj + y, kind: 'water' });
      }
      for (const o of lines) {
        const d = dist(o);
        if (d < best - 1e-12) { best = d; pick = o; }
      }
    }
  }
  if (!pick) return null;

  const t = { i: pick.i, j: pick.j, kind: pick.kind };
  const inReach = ahead || Math.abs(pick.i - li) + Math.abs(pick.j - lj) === 1 || dist(pick) <= REACH + 1e-12;
  if (pick.kind === 'doover') {
    Object.assign(t, { power: 'reset', by: lead.id, ready: inReach });
  } else {
    const opts = POWERS[pick.kind];
    const own = opts.find(([id]) => id === lead.id);
    if (own) {
      const ready = pick.kind === 'water' ? ahead || lines.length === 1 : inReach;
      Object.assign(t, { power: own[1], by: lead.id, ready });
    } else {
      const [by, power] = helper(state, stage, pick, opts);
      Object.assign(t, { power, by, ready: false });
    }
  }
  const prev = state.target;
  if (prev && prev.i === t.i && prev.j === t.j && prev.kind === t.kind && typeof prev.nudgeAt === 'number') {
    t.nudgeAt = prev.nudgeAt;
  }
  return t;
}

// The party member the badge shows when the lead cannot use `pick`: [id, power].
function helper(state, stage, pick, opts) {
  const lead = state.party[0];
  const able = state.party.map((m) => opts.find(([id]) => id === m.id)).filter(Boolean);
  const works = ([, power]) => {
    if (power !== 'push') return true;
    const dx = pick.i + 0.5 - lead.x, dy = pick.j + 0.5 - lead.y;
    const dir = Math.abs(dx) > Math.abs(dy) ? [dx < 0 ? -1 : 1, 0] : [0, dy < 0 ? -1 : 1];
    return !pushResult(state, stage, pick.i, pick.j, dir).blocked;
  };
  return able.find(works) ?? able[0];
}

// ---------------------------------------------------------------- pickups and tiles

export function checkCandy(state, events) {
  const lead = state.party[0];
  for (const cd of state.candy) {
    if (cd.taken) continue;
    if (Math.hypot(lead.x - (cd.i + 0.5), lead.y - (cd.j + 0.5)) <= CANDY_REACH) {
      cd.taken = true;
      state.candyCount += 1;
      events.push({ t: 'candy', i: cd.i, j: cd.j });
    }
  }
}

// Entry into a new tile: rest blanket or exit. `rest(i, j)` heals and wakes (field.js owns creatures).
export function checkTile(state, stage, events, rest) {
  const sim = state._sim;
  const lead = state.party[0];
  const i = Math.floor(lead.x), j = Math.floor(lead.y);
  if (sim.lastTile[0] === i && sim.lastTile[1] === j) return;
  sim.lastTile = [i, j];
  if (stage.rest.some((p) => p[0] === i && p[1] === j)) {
    rest(i, j);
    events.push({ t: 'rest' });
  }
  const exit = stage.exits.find((e) => e.at[0] === i && e.at[1] === j);
  if (exit) events.push({ t: 'exit', to: exit.to });
}
