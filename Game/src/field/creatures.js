// Creatures on the field: patrol, sight, chase, give up, return. Pure and deterministic; no DOM,
// no randomness. Imports nothing from field.js (it keeps its own EPS and clamp).
// Rules: Design/slice-design.md section 2 "Creatures in the stage view" and data.field.sight / chase.
//
// Creature { uid, kind, x, y, faceX, facing, mode, sees, sight }   (shape pinned in the M2 plan)
//   mode:  'patrol' walks its loop and looks; 'chase' runs at the lead; 'return' walks back to the
//          nearest point of its patrol line (through anything) without looking for the lead;
//          'asleep' stands at its spawn; 'ignore' (after Run) patrols or walks home without looking.
//   sees:  the lead is inside its sight box with nothing in between, right now.
//   sight: { x0, y0, x1, y1 } its sight box in tile units, clipped to the stage (drawn as the hatch band).
//
// Per-creature bookkeeping in state._sim.creatures[uid] (JSON-safe), set up by field.js as
// { spawn, speed, dist, ignore } and extended here with:
//   seen:  [x, y] | null  where it last saw the lead (a chase runs at this point)
//   lost:  seconds in 'chase' without seeing the lead
//   off:   true while it is away from its patrol line (after a chase, until it is back)
//   home:  { x, y, dist } | null  the point of its patrol line it is walking back to
//
// stepCreature(state, stage, c, h, events) is called by field.js once per creature per sub-step
// (h <= 1/30 s) after the lead has moved; field.js decides contact afterwards.

const EPS = 1e-9;

// data.field.sight
const REACH_X = { open: 5, folded: 2 };      // tiles ahead when facing left or right
const REACH_DEPTH = { open: 3, folded: 2 };  // rows ahead when facing back or front
// data.field.chase and data.creatures[].field.chase_speed
const CHASE_SPEED = { bat: 3.5 };
const DEFAULT_CHASE_SPEED = 3;
const GIVE_UP_TIME = 3;                      // seconds out of sight
const GIVE_UP_DIST = 6;                      // tiles from its patrol line
// Who moves over hedges ('#'): the ghost floats (design: "Ghost chases cross hedges"); the bat flies.
const OVER_HEDGES = { ghost: true, bat: true };
// Who sees through hedges: ghosts only (design).
const SEES_THROUGH_HEDGES = { ghost: true };
const LOS_STEP = 0.1;                        // tiles between line-of-sight samples

// ---------------------------------------------------------------- blockers (one place to update)

// Standees that change during play: a closed gate or a friend waiting to join.
function liveStandee(state, i, j) {
  const at = (list) => Array.isArray(list) && list.some((p) => p.i === i && p.j === j);
  return at(state.friends) || (state.gates ?? []).some((g) => g.i === i && g.j === j && !g.open);
}

// Does tile (i, j) stop creature c's line of sight? Standees: hedges, boulders, posts, 'Q', the do-over
// pumpkin (stage.isSolid), closed gates and waiting friends. Ghosts see through hedges only. Water does not.
function blocksSight(state, stage, c, i, j) {
  if (!stage.isSolid(i, j, state.boulders) && !liveStandee(state, i, j)) return false;
  if (SEES_THROUGH_HEDGES[c.kind] && stage.tileAt(i, j) === '#' && !hasBoulder(state, i, j)) return false;
  return true;
}

// Can creature c not walk into tile (i, j) while chasing? Walkers: what the team cannot stand on (solid
// tiles, closed gates, waiting friends, water without a stone). Bat and ghost: the same except hedges and
// water. (A 'return' ignores this on purpose: it can never get stuck.)
function blocksMove(state, stage, c, i, j) {
  const wet = !OVER_HEDGES[c.kind] && stage.tileAt(i, j) === '~'
    && !(state.stones ?? []).some((s) => s.i === i && s.j === j);
  if (!stage.isSolid(i, j, state.boulders) && !liveStandee(state, i, j) && !wet) return false;
  if (OVER_HEDGES[c.kind] && stage.tileAt(i, j) === '#' && !hasBoulder(state, i, j) && inGrid(stage, i, j)) return false;
  return true;
}

function hasBoulder(state, i, j) {
  return (state.boulders ?? []).some((b) => b.i === i && b.j === j);
}

function inGrid(stage, i, j) {
  return i >= 0 && j >= 0 && i < stage.width && j < stage.depth;
}

// ---------------------------------------------------------------- the patrol loop

function patrolPoints(stage, c, sim) {
  const sp = stage.spawns[sim.creatures[c.uid].spawn];
  return (sp?.patrol ?? []).map(([i, j]) => [i + 0.5, j + 0.5]);
}

function loopLength(pts) {
  let L = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

// Point and heading at distance d along the closed patrol loop.
function pointOnLoop(pts, d) {
  const L = loopLength(pts);
  d = ((d % L) + L) % L;
  let acc = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg > 0 && acc + seg > d) {
      const f = (d - acc) / seg;
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dy: b[1] - a[1] };
    }
    acc += seg;
  }
  const a = pts[0], b = pts[1 % pts.length];
  return { x: a[0], y: a[1], dx: b[0] - a[0], dy: b[1] - a[1] };
}

// The point of the loop nearest to (x, y): { x, y, dist (along the loop), gap (straight-line distance) }.
function nearestOnLoop(pts, x, y) {
  let best = { x: pts[0][0], y: pts[0][1], dist: 0, gap: Infinity };
  let acc = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const seg2 = vx * vx + vy * vy;
    const f = seg2 > 0 ? clamp(((x - a[0]) * vx + (y - a[1]) * vy) / seg2, 0, 1) : 0;
    const px = a[0] + vx * f, py = a[1] + vy * f;
    const gap = Math.hypot(x - px, y - py);
    if (gap < best.gap - 1e-12) best = { x: px, y: py, dist: acc + f * Math.sqrt(seg2), gap };
    acc += Math.sqrt(seg2);
  }
  return best;
}

// Its patrol line, or its spawn point if it has no patrol.
function homeLine(stage, c, sim) {
  const pts = patrolPoints(stage, c, sim);
  if (pts.length >= 1) return pts;
  const sp = stage.spawns[sim.creatures[c.uid].spawn];
  return [[sp.at[0] + 0.5, sp.at[1] + 0.5]];
}

function face(c, dx, dy) {
  if (Math.abs(dx) > EPS) c.faceX = dx > 0 ? 1 : -1;
  if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) {
    c.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'back' : 'front');
  }
}

// ---------------------------------------------------------------- sight

// The sight box for the creature's facing and the lead's form, clipped to the stage.
function sightBox(stage, c, lead) {
  const form = lead?.form === 'open' ? 'open' : 'folded';
  const i = Math.floor(c.x), j = Math.floor(c.y);
  let x0, y0, x1, y1;
  if (c.facing === 'left' || c.facing === 'right') {
    const r = REACH_X[form];
    [x0, x1] = c.facing === 'right' ? [c.x, c.x + r] : [c.x - r, c.x];
    [y0, y1] = [j - 1, j + 2];
  } else {
    const r = REACH_DEPTH[form];
    [y0, y1] = c.facing === 'front' ? [c.y, c.y + r] : [c.y - r, c.y];
    [x0, x1] = [i - 1, i + 2];
  }
  return {
    x0: clamp(x0, 0, stage.width), y0: clamp(y0, 0, stage.depth),
    x1: clamp(x1, 0, stage.width), y1: clamp(y1, 0, stage.depth),
  };
}

// Is the lead in the box (the band by whole rows / columns, the reach by distance) and in plain view?
function canSee(state, stage, c) {
  const lead = state.party?.[0];
  if (!lead) return false;
  const b = c.sight;
  const li = Math.floor(lead.x), lj = Math.floor(lead.y);
  const i = Math.floor(c.x), j = Math.floor(c.y);
  if (c.facing === 'left' || c.facing === 'right') {
    if (Math.abs(lj - j) > 1 || lead.x < b.x0 - EPS || lead.x > b.x1 + EPS) return false;
  } else {
    if (Math.abs(li - i) > 1 || lead.y < b.y0 - EPS || lead.y > b.y1 + EPS) return false;
  }
  return lineClear(state, stage, c, c.x, c.y, lead.x, lead.y);
}

// No sight blocker on the straight line between the two points (their own tiles excepted).
function lineClear(state, stage, c, ax, ay, bx, by) {
  const ai = Math.floor(ax), aj = Math.floor(ay), bi = Math.floor(bx), bj = Math.floor(by);
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / LOS_STEP));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const i = Math.floor(ax + (bx - ax) * t), j = Math.floor(ay + (by - ay) * t);
    if ((i === ai && j === aj) || (i === bi && j === bj)) continue;
    if (blocksSight(state, stage, c, i, j)) return false;
  }
  return true;
}

function look(state, stage, c) {
  c.sight = sightBox(stage, c, state.party?.[0]);
  c.sees = canSee(state, stage, c);
}

// ---------------------------------------------------------------- moving

function clampToStage(stage, c) {
  c.x = clamp(c.x, 0.5, stage.width - 0.5);
  c.y = clamp(c.y, 0.5, stage.depth - 0.5);
}

// Moves c up to `step` toward (tx, ty). `walls`: a walker does not enter a tile blocksMove refuses
// (it slides along it on the other axis). Returns true when it has arrived.
function moveToward(state, stage, c, tx, ty, step, walls) {
  const dx = tx - c.x, dy = ty - c.y;
  const d = Math.hypot(dx, dy);
  face(c, dx, dy);
  if (d <= step + EPS) {
    if (!walls || canEnter(state, stage, c, tx, ty)) { c.x = tx; c.y = ty; clampToStage(stage, c); return true; }
  }
  const s = Math.min(step, d);
  if (s <= EPS) return d <= EPS;
  const nx = c.x + (dx / d) * s, ny = c.y + (dy / d) * s;
  if (!walls || canEnter(state, stage, c, nx, ny)) { c.x = nx; c.y = ny; }
  else if (canEnter(state, stage, c, nx, c.y)) c.x = nx;
  else if (canEnter(state, stage, c, c.x, ny)) c.y = ny;
  clampToStage(stage, c);
  return false;
}

// A walker may stay in (or leave) the tile it is in; it may not step into a new blocked tile.
function canEnter(state, stage, c, x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  if (i === Math.floor(c.x) && j === Math.floor(c.y)) return true;
  return !blocksMove(state, stage, c, i, j);
}

function chaseSpeed(c) {
  return CHASE_SPEED[c.kind] ?? DEFAULT_CHASE_SPEED;
}

// Walks home (through anything). On arrival it takes up its patrol from that point.
function goHome(state, stage, c, h) {
  const sim = state._sim;
  const cs = sim.creatures[c.uid];
  if (!cs.home) {
    const near = nearestOnLoop(homeLine(stage, c, sim), c.x, c.y);
    cs.home = { x: near.x, y: near.y, dist: near.dist };
  }
  const speed = cs.speed > 0 ? cs.speed : chaseSpeed(c);
  if (moveToward(state, stage, c, cs.home.x, cs.home.y, speed * h, false)) {
    cs.dist = cs.home.dist;
    cs.home = null;
    cs.off = false;
    const pts = patrolPoints(stage, c, sim);
    if (pts.length >= 2 && loopLength(pts) > 0) {
      const p = pointOnLoop(pts, cs.dist);
      face(c, p.dx, p.dy);
    }
    return true;
  }
  return false;
}

function patrol(state, stage, c, h) {
  const sim = state._sim;
  const cs = sim.creatures[c.uid];
  const pts = patrolPoints(stage, c, sim);
  if (pts.length < 2 || cs.speed <= 0) return;
  const L = loopLength(pts);
  if (L <= 0) return;
  cs.dist = (cs.dist + cs.speed * h) % L;
  const p = pointOnLoop(pts, cs.dist);
  c.x = p.x;
  c.y = p.y;
  face(c, p.dx, p.dy);
}

function startReturn(state, stage, c, events) {
  const cs = state._sim.creatures[c.uid];
  c.mode = 'return';
  cs.lost = 0;
  cs.seen = null;
  cs.home = null;
  events.push({ t: 'gaveUp', uid: c.uid });
}

// ---------------------------------------------------------------- public

// Back to its spawn in `mode`, facing along its patrol.
export function resetCreature(state, stage, c, mode) {
  const sim = state._sim;
  const cs = sim.creatures[c.uid];
  const sp = stage.spawns[cs.spawn];
  c.x = sp.at[0] + 0.5;
  c.y = sp.at[1] + 0.5;
  c.mode = mode;
  cs.ignore = 0;
  cs.seen = null;
  cs.lost = 0;
  cs.off = false;
  cs.home = null;
  const pts = patrolPoints(stage, c, sim);
  if (pts.length >= 2 && loopLength(pts) > 0) {
    cs.dist = nearestOnLoop(pts, c.x, c.y).dist;
    const p = pointOnLoop(pts, cs.dist);
    face(c, p.dx, p.dy);
  } else {
    cs.dist = 0;
  }
  look(state, stage, c);
  if (mode === 'asleep') c.sees = false;
}

export function stepCreature(state, stage, c, h, events = []) {
  const sim = state._sim;
  const cs = sim.creatures[c.uid];
  if (cs.lost === undefined) { cs.seen = null; cs.lost = 0; cs.off = false; cs.home = null; }

  if (c.mode === 'asleep') {
    c.sees = false;
    c.sight = sightBox(stage, c, state.party?.[0]);
    return;
  }

  if (c.mode === 'ignore') {
    cs.ignore -= h;
    if (cs.off) goHome(state, stage, c, h); else patrol(state, stage, c, h);
    look(state, stage, c);
    if (cs.ignore <= EPS) { cs.ignore = 0; c.mode = cs.off ? 'return' : 'patrol'; }
    return;
  }

  if (c.mode === 'return') {
    if (goHome(state, stage, c, h)) c.mode = 'patrol';
    look(state, stage, c);
    return;
  }

  if (c.mode === 'chase') {
    const lead = state.party[0];
    // run at the lead while it is in view, else at the point where it was last seen
    const [tx, ty] = c.sees ? [lead.x, lead.y] : cs.seen ?? [c.x, c.y];
    moveToward(state, stage, c, tx, ty, chaseSpeed(c) * h, true);
    look(state, stage, c);
    if (c.sees) {
      cs.seen = [lead.x, lead.y];
      cs.lost = 0;
    } else {
      cs.lost += h;
    }
    const gap = nearestOnLoop(homeLine(stage, c, sim), c.x, c.y).gap;
    if (cs.lost >= GIVE_UP_TIME - EPS || gap > GIVE_UP_DIST + EPS) startReturn(state, stage, c, events);
    return;
  }

  // patrol
  patrol(state, stage, c, h);
  look(state, stage, c);
  if (c.sees) {
    c.mode = 'chase';
    cs.seen = [state.party[0].x, state.party[0].y];
    cs.lost = 0;
    cs.off = true;
    cs.home = null;
    events.push({ t: 'spotted', uid: c.uid });
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
