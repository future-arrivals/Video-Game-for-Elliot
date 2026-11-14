// Field simulation (M1): movement, followers, fold, swap, the bat's patrol, contact,
// candy, rest blanket, exits. Pure and deterministic; no DOM, no randomness.
//
// createField({ stage, data, party, save }) -> FieldState (shape pinned in the M1 plan)
// stepField(state, stage, input, dt) -> events     mutates `state`
// applyBattleResult(state, stage, { outcome, creatureUid, hearts, candyDrop })   candyDrop: candy a won battle adds
//
// Private bookkeeping lives under state._sim (JSON-safe):
//   trail:     [[x, y], ...] newest first; trail[0] is always the lead's position, later
//              points are breadcrumbs at least TRAIL_STEP apart. Followers stand on it.
//   lastTile:  [i, j] the tile the lead stood on after the previous sub-step (entry detection).
//   touching:  [uid] creatures overlapping the lead's contact box last sub-step (contact is
//              edge-triggered, so a battle fires once per touch).
//   blocked:   true if the lead was pushing into a wall last frame (for the one-shot 'bump').
//   creatures: { [uid]: { spawn, speed, dist, ignore } } spawn = index into stage.spawns,
//              speed = patrol tiles/s, dist = distance travelled along the patrol loop,
//              ignore = seconds of 'ignore' left.

import { isValidSave } from '../save.js';

const RADIUS = 0.35;          // lead footprint, tiles
export const FOLLOW_GAP = 1.75; // trail distance between party members (the monster's art is ~2.4 tiles wide)
const FOLD_TIME = 0.5;        // seconds for the field hinge
const IGNORE_TIME = 3;        // seconds a creature ignores the team after Run
const CONTACT_X = 0.35;
const CONTACT_Y = 0.5;
const CANDY_REACH = 0.5;
const MAX_SUBSTEP = 1 / 30;   // seconds; large dt is simulated in pieces
const MOVE_STEP = 0.05;       // tiles; collision sub-step
const TRAIL_STEP = 0.1;       // tiles between breadcrumbs
const EPS = 1e-9;

// ---------------------------------------------------------------- creation

export function createField({ stage, data, party, save = null }) {
  const chars = Object.fromEntries((data.characters ?? []).map((c) => [c.id, c]));
  const creatureData = Object.fromEntries((data.creatures ?? []).map((c) => [c.id, c]));

  const useSave =
    save && isValidSave(save) && save.stageId === stage.id && save.party.every((m) => chars[m.id]);

  const members = (useSave ? save.party : party).map((p) => {
    const max = chars[p.id]?.hearts ?? 1;
    const hearts = typeof p.hearts === 'number' && Number.isFinite(p.hearts) ? clamp(p.hearts, 0, max) : max;
    return {
      id: p.id, x: 0, y: 0, faceX: 1, facing: 'right',
      form: 'folded', foldAnim: 1, moving: false, hearts, maxHearts: max,
    };
  });
  if (useSave) members[0].form = save.party[0].form === 'open' ? 'open' : 'folded';

  const candyTaken = useSave ? save.candyTaken : [];
  const candy = stage.candy.map(([i, j]) => ({ i, j, taken: candyTaken.some((p) => p[0] === i && p[1] === j) }));
  const boulders = (useSave ? save.boulders : stage.boulders).map(([i, j]) => ({ i, j }));

  const firstRest = stage.rest[0] ?? stage.start;
  const restAt = useSave
    ? { stageId: save.restAt.stageId, i: save.restAt.i, j: save.restAt.j }
    : { stageId: stage.id, i: firstRest[0], j: firstRest[1] };

  const state = {
    stageId: stage.id,
    time: 0,
    party: members,
    creatures: [],
    candy,
    boulders,
    candyCount: useSave ? save.candyCount : 0,
    restAt,
    _sim: { trail: [], lastTile: [0, 0], touching: [], blocked: false, creatures: {} },
  };

  // lead position
  const lead = members[0];
  let x = stage.start[0] + 0.5;
  let y = stage.start[1] + 0.5;
  if (useSave) {
    const sx = save.lead.x, sy = save.lead.y;
    if (sx >= 0 && sx < stage.width && sy >= 0 && sy < stage.depth && !collides(stage, state.boulders, sx, sy)) {
      x = sx; y = sy;
    }
    if (save.lead.faceX === -1 || save.lead.faceX === 1) lead.faceX = save.lead.faceX;
    if (['left', 'right', 'back', 'front'].includes(save.lead.facing)) lead.facing = save.lead.facing;
  }
  placeTeam(state, stage, x, y);

  // creatures
  const asleep = useSave ? save.asleep : [];
  stage.spawns.forEach((sp, idx) => {
    const uid = `${stage.id}-${sp.kind}-${idx}`;
    const c = { uid, kind: sp.kind, x: sp.at[0] + 0.5, y: sp.at[1] + 0.5, faceX: 1, facing: 'right', mode: 'patrol' };
    state.creatures.push(c);
    state._sim.creatures[uid] = { spawn: idx, speed: creatureData[sp.kind]?.field?.patrol_speed ?? 0, dist: 0, ignore: 0 };
    resetCreature(state, stage, c, asleep.includes(uid) ? 'asleep' : 'patrol');
  });

  return state;
}

// Puts the lead at (x, y), restarts the trail behind it and lines the followers up on it.
function placeTeam(state, stage, x, y) {
  const lead = state.party[0];
  lead.x = x;
  lead.y = y;
  const sim = state._sim;
  const behind = FOLLOW_GAP * (state.party.length - 1);
  const tx = clamp(x - lead.faceX * behind, 0.5, stage.width - 0.5);
  sim.trail = Math.abs(tx - x) > EPS ? [[x, y], [tx, y]] : [[x, y]];
  sim.lastTile = [Math.floor(x), Math.floor(y)];
  sim.touching = [];
  sim.blocked = false;
  for (let k = 1; k < state.party.length; k++) {
    const [fx, fy] = pointOnTrail(sim.trail, FOLLOW_GAP * k);
    const m = state.party[k];
    m.x = fx; m.y = fy; m.faceX = lead.faceX; m.facing = lead.facing; m.moving = false;
  }
}

// ---------------------------------------------------------------- step

export function stepField(state, stage, input, dt) {
  const events = [];
  const sim = state._sim;
  const pressed = (input && input.pressed) || {};
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
    updateFollowers(state, false);
    events.push({ t: 'swap', lead: lead.id });
  }

  // input vector, length clamped to 1
  let mx = Number(input?.moveX) || 0;
  let my = Number(input?.moveY) || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const speed = input?.dash ? 5.5 : 4;

  const lead = state.party[0];
  if (Math.abs(mx) > EPS) lead.faceX = mx > 0 ? 1 : -1;
  if (len > EPS) {
    lead.facing = Math.abs(mx) >= Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my < 0 ? 'back' : 'front');
  }

  let remaining = Math.max(0, Number(dt) || 0);
  let moved = 0;
  let blocked = false;
  do {
    const h = Math.min(remaining, MAX_SUBSTEP);
    remaining -= h;
    const r = moveLead(state, stage, mx * speed * h, my * speed * h);
    moved += r.moved;
    blocked = blocked || r.blocked;
    updateTrail(state);
    updateFollowers(state, r.moved > EPS);
    for (const c of state.creatures) stepCreature(state, stage, c, h);
    checkCandy(state, events);
    checkTile(state, stage, events);
    if (checkContact(state, events)) break;
  } while (remaining > EPS);

  lead.moving = moved > EPS;
  for (let k = 1; k < state.party.length; k++) state.party[k].moving = lead.moving;
  if (blocked && !sim.blocked) events.push({ t: 'bump' });
  sim.blocked = blocked;

  for (const m of state.party) {
    if (m.foldAnim < 1) {
      m.foldAnim += Math.max(0, Number(dt) || 0) / FOLD_TIME;
      if (m.foldAnim >= 1 - 1e-9) m.foldAnim = 1;
    }
  }
  state.time += Math.max(0, Number(dt) || 0);
  return events;
}

// ---------------------------------------------------------------- movement

function circleHitsTile(x, y, i, j) {
  const cx = clamp(x, i, i + 1);
  const cy = clamp(y, j, j + 1);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < RADIUS * RADIUS - 1e-12;
}

function collides(stage, boulders, x, y) {
  for (let j = Math.floor(y - RADIUS); j <= Math.floor(y + RADIUS); j++) {
    for (let i = Math.floor(x - RADIUS); i <= Math.floor(x + RADIUS); i++) {
      if (stage.isSolid(i, j, boulders) && circleHitsTile(x, y, i, j)) return true;
    }
  }
  return false;
}

// Moves the lead by (dx, dy) in small axis-separated steps so it slides along walls and
// cannot tunnel. Returns { moved, blocked }.
function moveLead(state, stage, dx, dy) {
  const lead = state.party[0];
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MOVE_STEP));
  const sx = dx / n, sy = dy / n;
  const x0 = lead.x, y0 = lead.y;
  let blocked = false;
  for (let k = 0; k < n; k++) {
    if (sx !== 0 && !tryAxis(state, stage, 'x', sx)) blocked = true;
    if (sy !== 0 && !tryAxis(state, stage, 'y', sy)) blocked = true;
  }
  return { moved: Math.hypot(lead.x - x0, lead.y - y0), blocked };
}

// Moves the lead `s` along `axis`. If blocked, moves as far as it can (bisection), then,
// if the tile straight ahead is open, nudges sideways toward its centre line (corner assist,
// so a slightly off-centre approach still slips into a one-tile corridor). The nudge always
// points away from whatever corner blocked it.
function tryAxis(state, stage, axis, s) {
  const lead = state.party[0];
  const at = (t) => (axis === 'x' ? [lead.x + s * t, lead.y] : [lead.x, lead.y + s * t]);
  let [nx, ny] = at(1);
  if (!collides(stage, state.boulders, nx, ny)) {
    lead.x = nx; lead.y = ny;
    return true;
  }
  let lo = 0, hi = 1;
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2;
    const [mx, my] = at(mid);
    if (collides(stage, state.boulders, mx, my)) hi = mid; else lo = mid;
  }
  [nx, ny] = at(lo);
  lead.x = nx; lead.y = ny;
  cornerAssist(state, stage, axis, s);
  return false;
}

function cornerAssist(state, stage, axis, s) {
  const lead = state.party[0];
  const dir = Math.sign(s);
  const mag = Math.abs(s);
  if (axis === 'y') {
    const i = Math.floor(lead.x);
    const j = Math.floor(lead.y + dir * (RADIUS + 0.01));
    if (stage.isSolid(i, j, state.boulders)) return;
    const target = i + 0.5;
    const step = clamp(target - lead.x, -mag, mag);
    if (Math.abs(step) > EPS && !collides(stage, state.boulders, lead.x + step, lead.y)) lead.x += step;
  } else {
    const j = Math.floor(lead.y);
    const i = Math.floor(lead.x + dir * (RADIUS + 0.01));
    if (stage.isSolid(i, j, state.boulders)) return;
    const target = j + 0.5;
    const step = clamp(target - lead.y, -mag, mag);
    if (Math.abs(step) > EPS && !collides(stage, state.boulders, lead.x, lead.y + step)) lead.y += step;
  }
}

// ---------------------------------------------------------------- followers

function updateTrail(state) {
  const lead = state.party[0];
  const t = state._sim.trail;
  t[0] = [lead.x, lead.y];
  if (t.length === 1 || Math.hypot(t[0][0] - t[1][0], t[0][1] - t[1][1]) >= TRAIL_STEP) {
    t.unshift([lead.x, lead.y]);
  }
  // keep just enough trail for the last follower
  const need = FOLLOW_GAP * Math.max(1, state.party.length - 1) + 1;
  let acc = 0;
  for (let k = 1; k < t.length; k++) {
    acc += Math.hypot(t[k][0] - t[k - 1][0], t[k][1] - t[k - 1][1]);
    if (acc > need + 1) { t.length = k + 1; break; }
  }
}

function pointOnTrail(trail, d) {
  let acc = 0;
  for (let k = 1; k < trail.length; k++) {
    const [ax, ay] = trail[k - 1], [bx, by] = trail[k];
    const seg = Math.hypot(bx - ax, by - ay);
    if (acc + seg >= d && seg > 0) {
      const f = (d - acc) / seg;
      return [ax + (bx - ax) * f, ay + (by - ay) * f];
    }
    acc += seg;
  }
  const last = trail[trail.length - 1];
  return [last[0], last[1]];
}

function updateFollowers(state, leadMoved) {
  const sim = state._sim;
  for (let k = 1; k < state.party.length; k++) {
    const m = state.party[k];
    const [x, y] = pointOnTrail(sim.trail, FOLLOW_GAP * k);
    const dx = x - m.x, dy = y - m.y;
    if (leadMoved && Math.hypot(dx, dy) > EPS) {
      if (Math.abs(dx) > EPS) m.faceX = dx > 0 ? 1 : -1;
      m.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'back' : 'front');
    }
    m.x = x;
    m.y = y;
    m.form = 'folded';
  }
}

// ---------------------------------------------------------------- creatures

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
function resetCreature(state, stage, c, mode) {
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

function stepCreature(state, stage, c, h) {
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

// ---------------------------------------------------------------- pickups, tiles, contact

function checkCandy(state, events) {
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

function checkTile(state, stage, events) {
  const sim = state._sim;
  const lead = state.party[0];
  const i = Math.floor(lead.x), j = Math.floor(lead.y);
  if (sim.lastTile[0] === i && sim.lastTile[1] === j) return;
  sim.lastTile = [i, j];
  if (stage.rest.some((p) => p[0] === i && p[1] === j)) {
    rest(state, stage, i, j);
    events.push({ t: 'rest' });
  }
  const exit = stage.exits.find((e) => e.at[0] === i && e.at[1] === j);
  if (exit) events.push({ t: 'exit', to: exit.to });
}

function rest(state, stage, i, j) {
  for (const m of state.party) m.hearts = m.maxHearts;
  for (const c of state.creatures) if (c.mode === 'asleep') resetCreature(state, stage, c, 'patrol');
  state.restAt = { stageId: stage.id, i, j };
}

// Edge-triggered: a battle starts when the lead begins touching a patrolling creature.
function checkContact(state, events) {
  const sim = state._sim;
  const lead = state.party[0];
  const touching = [];
  let hit = null;
  for (const c of state.creatures) {
    if (c.mode === 'asleep') continue;
    if (Math.abs(lead.x - c.x) <= CONTACT_X && Math.abs(lead.y - c.y) <= CONTACT_Y) {
      touching.push(c.uid);
      if (!hit && c.mode === 'patrol' && !sim.touching.includes(c.uid)) hit = c;
    }
  }
  sim.touching = touching;
  if (hit) events.push({ t: 'battle', creatureUid: hit.uid, kind: hit.kind, sneak: false });
  return !!hit;
}

// ---------------------------------------------------------------- after a battle

export function applyBattleResult(state, stage, { outcome, creatureUid, hearts, candyDrop = 0 } = {}) {
  const c = state.creatures.find((k) => k.uid === creatureUid);
  if (outcome === 'lost') {
    for (const m of state.party) {
      m.hearts = m.maxHearts;
      m.form = 'folded';
      m.foldAnim = 1;
      m.moving = false;
    }
    const r = state.restAt;
    const [i, j] = r && r.stageId === stage.id ? [r.i, r.j] : stage.rest[0] ?? stage.start;
    placeTeam(state, stage, i + 0.5, j + 0.5); // sets lastTile to the blanket: no rest loop
    for (const k of state.creatures) resetCreature(state, stage, k, 'patrol');
    return;
  }
  if (hearts && typeof hearts === 'object') {
    for (const m of state.party) {
      const n = hearts[m.id];
      if (typeof n === 'number' && Number.isFinite(n)) m.hearts = clamp(Math.round(n), 0, m.maxHearts);
    }
  }
  if (!c) return;
  if (outcome === 'won') {
    resetCreature(state, stage, c, 'asleep');
    if (Number.isInteger(candyDrop) && candyDrop > 0) state.candyCount += candyDrop;
  } else if (outcome === 'ran') {
    c.mode = 'ignore';
    state._sim.creatures[c.uid].ignore = IGNORE_TIME;
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
