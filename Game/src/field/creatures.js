// Creatures on the field: the patrol loop each one walks, facing, and resetting to its spawn.
// Sight and chase will be added here next. Pure and deterministic; no DOM, no randomness.
// Imports nothing from field.js (it keeps its own EPS and clamp).
//
// Per-creature bookkeeping lives in state._sim.creatures[uid] (see the header of field.js).

const EPS = 1e-9;

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

// Distance along the loop of the point nearest to (x, y).
function distOnLoop(pts, x, y) {
  let best = Infinity, bestD = 0, acc = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const seg2 = vx * vx + vy * vy;
    const f = seg2 > 0 ? clamp(((x - a[0]) * vx + (y - a[1]) * vy) / seg2, 0, 1) : 0;
    const px = a[0] + vx * f, py = a[1] + vy * f;
    const dd = Math.hypot(x - px, y - py);
    if (dd < best - 1e-12) { best = dd; bestD = acc + f * Math.sqrt(seg2); }
    acc += Math.sqrt(seg2);
  }
  return bestD;
}

function face(c, dx, dy) {
  if (Math.abs(dx) > EPS) c.faceX = dx > 0 ? 1 : -1;
  if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) {
    c.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'back' : 'front');
  }
}

// Back to its spawn in `mode`, facing along its patrol.
export function resetCreature(state, stage, c, mode) {
  const sim = state._sim;
  const cs = sim.creatures[c.uid];
  const sp = stage.spawns[cs.spawn];
  c.x = sp.at[0] + 0.5;
  c.y = sp.at[1] + 0.5;
  c.mode = mode;
  cs.ignore = 0;
  const pts = patrolPoints(stage, c, sim);
  if (pts.length >= 2 && loopLength(pts) > 0) {
    cs.dist = distOnLoop(pts, c.x, c.y);
    const p = pointOnLoop(pts, cs.dist);
    face(c, p.dx, p.dy);
  } else {
    cs.dist = 0;
  }
}

export function stepCreature(state, stage, c, h) {
  const sim = state._sim;
  const cs = sim.creatures[c.uid];
  if (c.mode === 'asleep') return;
  if (c.mode === 'ignore') {
    cs.ignore -= h;
    if (cs.ignore <= EPS) { cs.ignore = 0; c.mode = 'patrol'; }
  }
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

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
