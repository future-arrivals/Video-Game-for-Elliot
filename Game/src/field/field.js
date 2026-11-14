// Field simulation (M1): movement, followers, contact, after-battle. Creatures (the bat's patrol)
// live in creatures.js.
// Buttons (fold, swap, Use/Eat), the power target, candy, rest blanket and exits live in
// powers.js. Pure and deterministic; no DOM, no randomness.
//
// createField({ stage, data, party, memory, candyCount, restAt, lollipop, at, from, row }) -> FieldState
//   (shape pinned in the M1 and M2 plans; world.js enterStage() calls it with the World's pieces)
// canStand(state, stage, i, j) -> bool   the one walkability query (movement here, powers in powers.js)
// stepField(state, stage, input, dt) -> events     mutates `state`
// The boss (S7): state.boss = { i0, j0, i1, j1 } while Big Ghost stands there (solid; null once beaten, and
// state.bossBeaten is true). Touching it (footprint within BOSS_CONTACT tiles of its tiles, once per touch)
// emits { t: 'battle', creatureUid: 'boss', kind: 'bigghost', boss: true, sneak: false }. It is not a creature.
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
//   actionFrom: [x, y] the lead's position when a bridge started (powers.js moves the lead from there).
//   joinIds:   [id] the join tiles this stage has ('fish', 'icecream'); world.js leaveStage reads it.
//   maxHearts: { [id]: hearts } every character's full hearts (a friend joins at full hearts).
// The power in progress is state.action (powers.js); while it runs the lead is busy and pickups, tiles,
// exits and contact wait until it lands (a creature touching mid-power starts its battle after the landing).
// After the ground changes under the team (a bridge ends, a boulder moves, the team is placed) the follower
// trail is trimmed at the first tile the team cannot stand on (puzzles.js trimTrail), so followers bunch up
// behind the lead instead of standing on water.

import {
  handleButtons, isBusy, advanceHinges, advancePowers, cancelPowers, computeTarget, checkCandy, checkTile,
} from './powers.js';
import { onBridge, trimTrail, checkPuzzleTiles } from './puzzles.js';
import { resetCreature, stepCreature } from './creatures.js';

const RADIUS = 0.35;          // lead footprint, tiles
export const FOLLOW_GAP = 1.75; // trail distance between party members (the monster's art is ~2.4 tiles wide)
const IGNORE_TIME = 3;        // seconds a creature ignores the team after Run
const CONTACT_X = 0.35;
const CONTACT_Y = 0.5;
const BOSS_CONTACT = 0.4;     // tiles: the lead's footprint this close to Big Ghost's tiles starts the boss battle
export const BOSS_CANDY = 10; // candy a beaten boss adds
const MAX_SUBSTEP = 1 / 30;   // seconds; large dt is simulated in pieces
const MOVE_STEP = 0.05;       // tiles; collision sub-step
const TRAIL_STEP = 0.1;       // tiles between breadcrumbs
const EPS = 1e-9;

// ---------------------------------------------------------------- creation

// Builds the FieldState for one stage. world.js enterStage() is the normal way in; it passes the World's
// pieces. Tests may call it with just { stage, data, party }.
//   party:   [{ id, hearts }] lead first (hearts missing = full)
//   memory:  the stage's StageMemory (world.js), or null on a first visit
//   at:      { x, y[, faceX, facing, form] } a saved or dev position; used only if the team can stand there
//   from, row: otherwise the team arrives at stage.entrance(from, row)
export function createField({ stage, data, party, memory = null, candyCount = 0, restAt = null, lollipop = false,
  at = null, from = null, row = null, bossBeaten = false }) {
  const chars = Object.fromEntries((data.characters ?? []).map((c) => [c.id, c]));
  const creatureData = Object.fromEntries((data.creatures ?? []).map((c) => [c.id, c]));
  const mem = memory ?? {};
  const has = (list, i, j) => Array.isArray(list) && list.some((p) => p[0] === i && p[1] === j);

  const members = party.map((p) => {
    const max = chars[p.id]?.hearts ?? 1;
    const hearts = typeof p.hearts === 'number' && Number.isFinite(p.hearts) ? clamp(p.hearts, 0, max) : max;
    return {
      id: p.id, x: 0, y: 0, faceX: 1, facing: 'right',
      form: 'folded', foldAnim: 1, moving: false, hearts, maxHearts: max,
    };
  });
  const ids = members.map((m) => m.id);

  const candy = stage.candy.map(([i, j]) => ({ i, j, taken: has(mem.candyTaken, i, j) }));
  const boulders = (Array.isArray(mem.boulders) ? mem.boulders : stage.boulders).map(([i, j]) => ({ i, j }));
  const firstRest = stage.rest[0] ?? stage.start;
  const r = restAt && typeof restAt.stageId === 'string' ? restAt : { stageId: stage.id, i: firstRest[0], j: firstRest[1] };

  const state = {
    stageId: stage.id,
    time: 0,
    party: members,
    creatures: [],
    candy,
    boulders,
    candyCount: Number.isFinite(candyCount) && candyCount > 0 ? candyCount : 0,
    restAt: { stageId: r.stageId, i: r.i, j: r.j },
    stones: (Array.isArray(mem.stones) ? mem.stones : []).map(([i, j]) => ({ i, j })),
    gates: stage.gates.map(([i, j]) => ({ i, j, open: has(mem.gatesOpen, i, j) })),
    plates: stage.plates.map(([i, j]) => ({ i, j, down: boulders.some((b) => b.i === i && b.j === j) })),
    posts: stage.posts.map((p) => ({ i: p.at[0], j: p.at[1], kind: p.kind, taken: has(mem.postsTaken, p.at[0], p.at[1]) })),
    friends: stage.joins
      .filter((f) => !ids.includes(f.id) && !(Array.isArray(mem.joined) && mem.joined.includes(f.id)))
      .map((f) => ({ id: f.id, i: f.at[0], j: f.at[1] })),
    lollipop: stage.lollipop ? { i: stage.lollipop[0], j: stage.lollipop[1], taken: !!lollipop } : null,
    action: null,
    target: null,
    boss: stage.boss && !bossBeaten ? { ...stage.boss } : null,
    bossBeaten: !!bossBeaten,
    _sim: { trail: [], lastTile: [0, 0], touching: [], bossTouch: false, blocked: false, creatures: {}, joinIds: stage.joins.map((f) => f.id),
      maxHearts: Object.fromEntries(Object.values(chars).map((c) => [c.id, c.hearts ?? 1])) },
  };

  // lead position: `at` if the team can stand there, else the entrance (or the nearest standable tile)
  const lead = members[0];
  let x, y;
  const ax = Number(at?.x), ay = Number(at?.y);
  if (at && Number.isFinite(ax) && Number.isFinite(ay) && ax >= 0 && ax < stage.width && ay >= 0 && ay < stage.depth
      && !collides(state, stage, ax, ay)) {
    x = ax; y = ay;
    if (at.faceX === -1 || at.faceX === 1) lead.faceX = at.faceX;
    if (['left', 'right', 'back', 'front'].includes(at.facing)) lead.facing = at.facing;
    if (at.form === 'open') lead.form = 'open';
  } else {
    const [i, j] = standableNear(state, stage, at ? stage.entrance(null) : stage.entrance(from, row));
    x = i + 0.5; y = j + 0.5;
    if (!at && from != null && i >= stage.width / 2) { lead.faceX = -1; lead.facing = 'left'; }
  }
  placeTeam(state, stage, x, y);

  // creatures
  const asleep = Array.isArray(mem.asleep) ? mem.asleep : [];
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

// Can the team stand on tile (i, j) right now? Not: outside the stage, a hedge, the giant pumpkin, a post,
// the do-over pumpkin, a boulder (live list), a closed gate, a friend waiting to join, or water without a
// stone or a live bridge (the water tiles of a bridge in progress). Movement and powers both ask this.
export function canStand(state, stage, i, j) {
  i = Math.floor(i); j = Math.floor(j);
  if (i < 0 || j < 0 || i >= stage.width || j >= stage.depth) return false;
  if (stage.isSolid(i, j, state.boulders)) return false;
  const at = (list) => Array.isArray(list) && list.some((p) => p.i === i && p.j === j);
  if (at(state.friends)) return false;
  const b = state.boss;
  if (b && i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1) return false;
  const gate = state.gates?.find((g) => g.i === i && g.j === j);
  if (gate && !gate.open) return false;
  if (stage.tileAt(i, j) === '~') return at(state.stones) || onBridge(state, i, j);
  return true;
}

// The tile itself if the team can stand there, else the nearest tile that can (rings outward).
export function standableNear(state, stage, [i0, j0]) {
  for (let r = 0; r < stage.width + stage.depth; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (canStand(state, stage, i0 + di, j0 + dj)) return [i0 + di, j0 + dj];
      }
    }
  }
  return [i0, j0];
}

// Puts the lead at (x, y), restarts the trail behind it and lines the followers up on it.
export function placeTeam(state, stage, x, y) {
  const lead = state.party[0];
  lead.x = x;
  lead.y = y;
  const sim = state._sim;
  const behind = FOLLOW_GAP * (state.party.length - 1);
  const tx = clamp(x - lead.faceX * behind, 0.5, stage.width - 0.5);
  sim.trail = Math.abs(tx - x) > EPS ? [[x, y], [tx, y]] : [[x, y]];
  trimTrail(state, stage);
  sim.lastTile = [Math.floor(x), Math.floor(y)];
  sim.touching = [];
  sim.bossTouch = false;
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
  const busy = isBusy(state);         // mid-power: buttons and movement are dropped until it lands
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
    const changed = advancePowers(state, stage, h, events);   // hinges, wind-ups; a bridge moves the lead
    const r = moveLead(state, stage, mx * speed * h, my * speed * h);
    moved += r.moved;
    blocked = blocked || r.blocked;
    updateTrail(state);
    if (changed) trimTrail(state, stage);
    updateFollowers(state, r.moved > EPS);
    for (const c of state.creatures) stepCreature(state, stage, c, h, events);
    if (isBusy(state)) continue;
    checkCandy(state, events);
    checkTile(state, stage, events, (i, j) => rest(state, stage, i, j));
    if (checkPuzzleTiles(state, stage, events)) updateFollowers(state, false);
    if (checkContact(state, events)) break;
  } while (remaining > EPS);
  if (remaining > EPS) advanceHinges(state, remaining);   // a battle cut the frame short

  lead.moving = moved > EPS;
  for (let k = 1; k < state.party.length; k++) state.party[k].moving = lead.moving;
  if (blocked && !sim.blocked) events.push({ t: 'bump' });
  sim.blocked = blocked;

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

function collides(state, stage, x, y) {
  for (let j = Math.floor(y - RADIUS); j <= Math.floor(y + RADIUS); j++) {
    for (let i = Math.floor(x - RADIUS); i <= Math.floor(x + RADIUS); i++) {
      if (!canStand(state, stage, i, j) && circleHitsTile(x, y, i, j)) return true;
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
  if (!collides(state, stage, nx, ny)) {
    lead.x = nx; lead.y = ny;
    return true;
  }
  let lo = 0, hi = 1;
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2;
    const [mx, my] = at(mid);
    if (collides(state, stage, mx, my)) hi = mid; else lo = mid;
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
    if (!canStand(state, stage, i, j)) return;
    const target = i + 0.5;
    const step = clamp(target - lead.x, -mag, mag);
    if (Math.abs(step) > EPS && !collides(state, stage, lead.x + step, lead.y)) lead.x += step;
  } else {
    const j = Math.floor(lead.y);
    const i = Math.floor(lead.x + dir * (RADIUS + 0.01));
    if (!canStand(state, stage, i, j)) return;
    const target = j + 0.5;
    const step = clamp(target - lead.y, -mag, mag);
    if (Math.abs(step) > EPS && !collides(state, stage, lead.x, lead.y + step)) lead.y += step;
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
  // Big Ghost: not a creature (no sight, no chase); a touch of its tiles starts the fight, once per touch
  const b = state.boss;
  if (b) {
    const dx = Math.max(b.i0 - lead.x, 0, lead.x - (b.i1 + 1)), dy = Math.max(b.j0 - lead.y, 0, lead.y - (b.j1 + 1));
    const near = Math.hypot(dx, dy) <= BOSS_CONTACT;
    const fire = near && !sim.bossTouch && !hit;
    sim.bossTouch = near;
    if (fire) { events.push({ t: 'battle', creatureUid: 'boss', kind: 'bigghost', boss: true, sneak: false }); return true; }
  }
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
  if (creatureUid === 'boss') {                 // Big Ghost: a win ends it for good; a loss (above) leaves it standing
    if (outcome === 'won' && state.boss) { state.boss = null; state.bossBeaten = true; state.candyCount += BOSS_CANDY; }
    return;
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
