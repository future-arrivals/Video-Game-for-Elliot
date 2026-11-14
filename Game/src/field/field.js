// Field simulation (M1): movement, followers, contact, after-battle. Creatures (the bat's patrol)
// live in creatures.js.
// Buttons (fold, swap, Use/Eat), the power target, candy, rest blanket and exits live in
// powers.js. Pure and deterministic; no DOM, no randomness.
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
//   eat:       { i, j } while an Eat waits for the lead's hinge to settle (see powers.js).

import { isValidSave } from '../save.js';
import { handleButtons, isBusy, advanceHinges, cancelPowers, computeTarget, checkCandy, checkTile } from './powers.js';
import { resetCreature, stepCreature } from './creatures.js';

const RADIUS = 0.35;          // lead footprint, tiles
export const FOLLOW_GAP = 1.75; // trail distance between party members (the monster's art is ~2.4 tiles wide)
const IGNORE_TIME = 3;        // seconds a creature ignores the team after Run
const CONTACT_X = 0.35;
const CONTACT_Y = 0.5;
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
    target: null,
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
  state.target = computeTarget(state, stage);

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
  const busy = isBusy(state);         // mid-eat: buttons and movement are dropped until the eat lands
  if (handleButtons(state, stage, pressed, events)) updateFollowers(state, false);
  const still = busy || isBusy(state);

  // input vector, length clamped to 1
  let mx = still ? 0 : Number(input?.moveX) || 0;
  let my = still ? 0 : Number(input?.moveY) || 0;
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
    for (const c of state.creatures) stepCreature(state, stage, c, h, events);
    checkCandy(state, events);
    checkTile(state, stage, events, (i, j) => rest(state, stage, i, j));
    if (checkContact(state, events)) break;
  } while (remaining > EPS);

  lead.moving = moved > EPS;
  for (let k = 1; k < state.party.length; k++) state.party[k].moving = lead.moving;
  if (blocked && !sim.blocked) events.push({ t: 'bump' });
  sim.blocked = blocked;

  advanceHinges(state, Math.max(0, Number(dt) || 0), events);
  state.time += Math.max(0, Number(dt) || 0);
  state.target = computeTarget(state, stage);
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

// ---------------------------------------------------------------- rest, contact

function rest(state, stage, i, j) {
  for (const m of state.party) m.hearts = m.maxHearts;
  for (const c of state.creatures) if (c.mode === 'asleep') resetCreature(state, stage, c, 'patrol');
  state.restAt = { stageId: stage.id, i, j };
}

// Does the lead count as touching this creature? Positions are feet points in tile units
// (one tile is 48 px across and 30 px deep on screen). `lead` is a Member, `c` a Creature.
// TODO(human): decide the contact rule. The default below is the design doc's box (0.35 tiles
// either side, half a row in depth), which is much narrower than the art: the monster is drawn
// about 2.4 tiles wide and the bat about 1.5.
export function touches(lead, c) {
  return Math.abs(lead.x - c.x) <= CONTACT_X && Math.abs(lead.y - c.y) <= CONTACT_Y;
}

// Edge-triggered: a battle starts when the lead begins touching a patrolling creature.
function checkContact(state, events) {
  const sim = state._sim;
  const lead = state.party[0];
  const touching = [];
  let hit = null;
  for (const c of state.creatures) {
    if (c.mode === 'asleep') continue;
    if (touches(lead, c)) {
      touching.push(c.uid);
      if (!hit && (c.mode === 'patrol' || c.mode === 'chase' || c.mode === 'return') && !sim.touching.includes(c.uid)) hit = c;
    }
  }
  sim.touching = touching;
  // A sneak attack: the creature was on patrol and had not seen the lead (creatures.js sets `sees`; undefined = M1 behaviour).
  if (hit) events.push({ t: 'battle', creatureUid: hit.uid, kind: hit.kind, sneak: hit.mode === 'patrol' && hit.sees === false });
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
    cancelPowers(state);
    placeTeam(state, stage, i + 0.5, j + 0.5); // sets lastTile to the blanket: no rest loop
    for (const k of state.creatures) resetCreature(state, stage, k, 'patrol');
    state.target = computeTarget(state, stage);
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
