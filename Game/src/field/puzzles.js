// Puzzles: the rules that change the ground. Water lines for Bridge, where a pushed boulder goes, stepping
// stones, plates, gates, bells, post candy, join tiles, the lollipop, the follower trail after the ground
// changes, and the do-over. Pure and deterministic; no DOM. powers.js decides WHEN (buttons, target,
// wind-ups) and calls in here for WHAT happens; field.js calls checkPuzzleTiles each sub-step.
// Rules: Design/slice-design.md section 3 with the decisions in the M2 plan.
//
// Imports from field.js (canStand, placeTeam, standableNear) and field.js imports this module: the cycle is
// safe because neither module uses the other's exports at load time, only inside functions.
//
// - Open water: a '~' tile without a stone. A stone ('~' with a stone) is ground for everything.
// - Bridge line from tile (i, j) in direction d: the open-water tiles ahead in a straight line. 1 to 3 of
//   them followed by a tile the team can stand on (canStand) is a bridge; anything else (4+ water, the
//   stage edge, a hedge, a boulder, a closed gate...) falls short. bridgeLine() -> null | { len, ok }.
// - Live bridge: while a bridge that does not fall short is in progress (state.action), its water tiles
//   are standable (canStand asks onBridge).
// - Push from a boulder in direction d: the boulder slides 1 tile onto ground ('.', ':', 'S', and the
//   M3/M4 plain-ground characters), a plate, open water (it becomes a permanent stone), or a stone. Anything
//   else blocks: hedge, stage edge, post, gate (open or not), door, exit, rest blanket, another boulder,
//   an untaken candy or lollipop, a waiting friend, a party member or a creature standing on that tile.
// - Plates: down while a boulder sits on one (the team's weight does not count). Any plate down, or a rung
//   bell, opens every gate in the stage. A gate never closes again. { t: 'gate', i, j } per gate opened.
// - Posts: Reach on a candy post takes the candy (+1 candyCount, post.taken). Reach on a bell rings it
//   (post.taken marks it rung; it can be rung again, which only replays the event).
// - Join: the lead touching a waiting friend's tile (footprint within JOIN_TOUCH of the tile) adds that
//   friend to the back of the party at full hearts, folded; { t: 'join', id }.
// - Lollipop: the lead's centre on the lollipop tile takes it; { t: 'lollipop' }. world.leaveStage copies it.
// - Followers after the ground changes (a bridge ends, a boulder moves, the team is placed): trimTrail cuts
//   the follower trail at the first point on a tile the team cannot stand on, so followers bunch up at the
//   cut (after a crossing: on the far bank right behind the lead) instead of standing on water.
// - Do-over (resetPuzzle): boulders back where the map has them, every stone gone, plates recomputed, any
//   wind-up dropped, the team at the stage's left entrance, { t: 'doOver' }. Candy, posts, open gates,
//   joined friends and the lollipop stay. world.js doOver() is the pause-menu entry point.

import { canStand, placeTeam, standableNear } from './field.js';

const JOIN_TOUCH = 0.4;        // tiles from the lead's centre to the friend's tile (footprint 0.35 + slack)
const PUSH_GROUND = '.:SP~kvf*mXL';
const TRAIL_SAMPLE = 0.1;      // tiles between checks along a trail segment

const has = (list, i, j) => Array.isArray(list) && list.some((p) => p.i === i && p.j === j);
const inGrid = (stage, i, j) => i >= 0 && j >= 0 && i < stage.width && j < stage.depth;

export function isOpenWater(state, stage, i, j) {
  return inGrid(stage, i, j) && stage.tileAt(i, j) === '~' && !has(state.stones, i, j);
}

// ---------------------------------------------------------------- bridge

export function bridgeLine(state, stage, i0, j0, [di, dj]) {
  let n = 0;
  while (n < 4 && isOpenWater(state, stage, i0 + di * (n + 1), j0 + dj * (n + 1))) n++;
  if (n === 0) return null;
  const ok = n <= 3 && canStand(state, stage, i0 + di * (n + 1), j0 + dj * (n + 1));
  return { len: Math.min(n, 3), ok };
}

// Is (i, j) a water tile of the bridge in progress?
export function onBridge(state, i, j) {
  const a = state.action;
  if (!a || a.kind !== 'bridge' || a.short) return false;
  for (let k = 1; k <= a.len; k++) {
    if (a.from[0] + a.dir[0] * k === i && a.from[1] + a.dir[1] * k === j) return true;
  }
  return false;
}

export function bridgeLanding(a) {
  return [a.from[0] + a.dir[0] * (a.len + 1), a.from[1] + a.dir[1] * (a.len + 1)];
}

// ---------------------------------------------------------------- push

export function pushResult(state, stage, bi, bj, [di, dj]) {
  const to = [bi + di, bj + dj];
  const [i, j] = to;
  const blocked = (() => {
    if (!inGrid(stage, i, j)) return true;
    const ch = stage.tileAt(i, j);
    if (!PUSH_GROUND.includes(ch) && !'cHFI'.includes(ch)) return true;
    if (ch === 'H' && !(state.lollipop && state.lollipop.taken)) return true;
    if (state.candy.some((c) => !c.taken && c.i === i && c.j === j)) return true;
    if (has(state.friends, i, j) || has(state.boulders, i, j)) return true;
    const on = (m) => Math.floor(m.x) === i && Math.floor(m.y) === j;
    return state.party.some(on) || state.creatures.some(on);
  })();
  return { to, blocked };
}

// The push lands: the boulder moves, or sinks into open water as a stone. Returns true (the ground changed).
export function landPush(state, stage, a, events) {
  const b = state.boulders.find((k) => k.i === a.from[0] && k.j === a.from[1]);
  if (!b) return false;
  const [i, j] = a.to;
  events.push({ t: 'push', to: [i, j] });
  if (isOpenWater(state, stage, i, j)) {
    state.boulders = state.boulders.filter((k) => k !== b);
    state.stones.push({ i, j });
    events.push({ t: 'stone', i, j });
  } else {
    b.i = i; b.j = j;
  }
  updatePlates(state, events);
  return true;
}

// ---------------------------------------------------------------- plates, gates, posts

export function updatePlates(state, events) {
  let any = false;
  for (const p of state.plates) {
    p.down = has(state.boulders, p.i, p.j);
    any = any || p.down;
  }
  if (any) openGates(state, events);
}

export function openGates(state, events) {
  for (const g of state.gates) {
    if (g.open) continue;
    g.open = true;
    events.push({ t: 'gate', i: g.i, j: g.j });
  }
}

export function landReach(state, a, events) {
  const p = state.posts.find((k) => k.i === a.i && k.j === a.j);
  if (!p) return;
  if (p.kind === 'bell') {
    p.taken = true;
    events.push({ t: 'reach', kind: 'bell', i: p.i, j: p.j });
    openGates(state, events);
  } else if (!p.taken) {
    p.taken = true;
    state.candyCount += 1;
    events.push({ t: 'reach', kind: 'candy', i: p.i, j: p.j });
  }
}

// ---------------------------------------------------------------- join tiles, lollipop

// Returns true if a friend joined (field.js then lines the followers up).
export function checkPuzzleTiles(state, stage, events) {
  const lead = state.party[0];
  const li = Math.floor(lead.x), lj = Math.floor(lead.y);
  const lp = state.lollipop;
  if (lp && !lp.taken && lp.i === li && lp.j === lj) {
    lp.taken = true;
    events.push({ t: 'lollipop' });
  }
  let joined = false;
  for (const f of state.friends.slice()) {
    const dx = lead.x - clamp(lead.x, f.i, f.i + 1), dy = lead.y - clamp(lead.y, f.j, f.j + 1);
    if (Math.hypot(dx, dy) > JOIN_TOUCH) continue;
    state.friends = state.friends.filter((k) => k !== f);
    if (state.party.some((m) => m.id === f.id)) continue;
    const max = state._sim.maxHearts?.[f.id] ?? 1;
    state.party.push({
      id: f.id, x: lead.x, y: lead.y, faceX: lead.faceX, facing: lead.facing,
      form: 'folded', foldAnim: 1, moving: false, hearts: max, maxHearts: max,
    });
    events.push({ t: 'join', id: f.id });
    joined = true;
  }
  return joined;
}

// ---------------------------------------------------------------- followers after the ground changes

// Cuts the trail (newest first) at the first point on a tile the team cannot stand on. trail[0], the
// lead, always stays. Returns true if it cut.
export function trimTrail(state, stage) {
  const t = state._sim.trail;
  const ok = (x, y) => canStand(state, stage, Math.floor(x), Math.floor(y));
  for (let k = 1; k < t.length; k++) {
    const [ax, ay] = t[k - 1], [bx, by] = t[k];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / TRAIL_SAMPLE));
    for (let s = 1; s <= n; s++) {
      const x = ax + (bx - ax) * (s / n), y = ay + (by - ay) * (s / n);
      if (ok(x, y)) continue;
      const px = ax + (bx - ax) * ((s - 1) / n), py = ay + (by - ay) * ((s - 1) / n);
      t.length = k;
      if (s > 1) t.push([px, py]);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- do-over

// Where a do-over puts the team: just inside the stage's left exit (middle row), or the start.
export function leftEntrance(stage) {
  const left = stage.exits.filter((e) => e.at[0] === 0);
  return left.length ? stage.entrance(left[0].to) : stage.start.slice();
}

export function resetPuzzle(state, stage, events = []) {
  state.action = null;
  delete state._sim.actionFrom;
  state.boulders = stage.boulders.map(([i, j]) => ({ i, j }));
  state.stones = [];
  updatePlates(state, events);
  const [i, j] = standableNear(state, stage, leftEntrance(stage));
  const lead = state.party[0];
  lead.faceX = 1; lead.facing = 'right'; lead.moving = false;
  placeTeam(state, stage, i + 0.5, j + 0.5);
  events.push({ t: 'doOver' });
  return events;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
