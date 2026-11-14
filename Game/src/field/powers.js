// Field powers and pickups: the buttons (Fold, Swap, Use), the power target, Eat, and what the
// lead's position does to the world (candy, rest blanket, exits). Pure and deterministic; no DOM.
// field.js owns movement, followers, creatures and contact, and calls in here.
//
// Target (FieldState.target), recomputed every step:
//   null, or { i, j, power: 'eat', by: 'monster', ready[, nudgeAt] }
//   - which boulder: the one on the tile straight ahead of the lead's tile (4-way `facing`), else the
//     nearest boulder within 2 tiles (Chebyshev, by tile).
//   - ready: the lead is the monster AND the boulder is in reach, whatever the facing. In reach is any of:
//     straight ahead; the lead's tile is edge-adjacent to the boulder's tile; or the boulder tile's
//     centre is within EAT_REACH tiles of the lead's position. (It stays true during the hinge.)
//   - nudgeAt: state.time of the latest 'nope' for this tile; kept while the target stays on it.
//   - no target at all when nobody in the party has the power.
//
// Use (Cross):
//   ready target: the lead first turns to face the boulder (larger of |dx|, |dy| to its tile centre;
//   a tie goes vertical); then, if the lead is not settled open, it unfolds (emits { t: 'fold', form: 'open' },
//   the 0.5 s hinge); the eat lands on the step the hinge settles: the boulder leaves
//   state.boulders, the lead stays open, { t: 'eat', i, j }. An already open lead eats at once.
//   While an eat is pending (state._sim.eat) the lead is busy: movement, facing and every button
//   are ignored (dropped, not queued), so a press cannot be cancelled into a half state.
//   target not ready: { t: 'nope' } and target.nudgeAt = state.time. No target: nothing.

export const FOLD_TIME = 0.5;     // seconds for the field hinge
const CANDY_REACH = 0.5;
const TARGET_RANGE = 2;           // tiles
const EAT_REACH = 1.3;            // tiles, straight-line from the lead to the boulder tile's centre

const POWERS = { boulder: { power: 'eat', by: 'monster' } };
const AHEAD = { left: [-1, 0], right: [1, 0], back: [0, -1], front: [0, 1] };

// ---------------------------------------------------------------- buttons

export function isBusy(state) {
  return !!state._sim.eat;
}

// Cross, Square, L1/R1 for this step (call before movement). Returns true if the party rotated.
export function handleButtons(state, stage, pressed, events) {
  if (isBusy(state)) return false;
  if (pressed.cross && use(state, stage, events)) return false;   // the eat has the lead now

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

// Cross. Returns true when an eat started (or landed).
function use(state, stage, events) {
  const t = computeTarget(state, stage);
  state.target = t;
  if (!t) return false;
  if (!t.ready) {
    t.nudgeAt = state.time;
    events.push({ t: 'nope' });
    return false;
  }
  const lead = state.party[0];
  const dx = t.i + 0.5 - lead.x, dy = t.j + 0.5 - lead.y;
  if (Math.abs(dx) > Math.abs(dy)) { lead.facing = dx < 0 ? 'left' : 'right'; lead.faceX = dx < 0 ? -1 : 1; }
  else lead.facing = dy < 0 ? 'back' : 'front';
  state._sim.eat = { i: t.i, j: t.j };
  if (lead.form !== 'open') {
    lead.form = 'open';
    lead.foldAnim = 1 - lead.foldAnim;
    events.push({ t: 'fold', form: 'open' });
  }
  if (lead.foldAnim >= 1) landEat(state, events);
  return true;
}

// Advances every hinge by dt, then lands a pending eat once the lead's hinge has settled.
export function advanceHinges(state, dt, events) {
  for (const m of state.party) {
    if (m.foldAnim < 1) {
      m.foldAnim += dt / FOLD_TIME;
      if (m.foldAnim >= 1 - 1e-9) m.foldAnim = 1;
    }
  }
  if (state._sim.eat && state.party[0].foldAnim >= 1) landEat(state, events);
}

function landEat(state, events) {
  const { i, j } = state._sim.eat;
  delete state._sim.eat;
  state.boulders = state.boulders.filter((b) => !(b.i === i && b.j === j));
  state.party[0].form = 'open';
  events.push({ t: 'eat', i, j });
}

// Drops a pending eat (the team was moved away, e.g. a lost battle).
export function cancelPowers(state) {
  delete state._sim.eat;
}

// ---------------------------------------------------------------- target

export function computeTarget(state, stage) {
  const lead = state.party[0];
  const kind = POWERS.boulder;
  if (!state.party.some((m) => m.id === kind.by)) return null;
  const li = Math.floor(lead.x), lj = Math.floor(lead.y);
  const [di, dj] = AHEAD[lead.facing] ?? [0, 0];
  const at = (i, j) => state.boulders.find((b) => b.i === i && b.j === j);

  let b = (di || dj) ? at(li + di, lj + dj) : null;
  let ahead = !!b;
  if (!b) {
    let best = Infinity;
    for (const c of state.boulders) {
      if (Math.max(Math.abs(c.i - li), Math.abs(c.j - lj)) > TARGET_RANGE) continue;
      const d = Math.hypot(c.i + 0.5 - lead.x, c.j + 0.5 - lead.y);
      if (d < best - 1e-12) { best = d; b = c; }
    }
  }
  if (!b) return null;
  const adjacent = Math.abs(b.i - li) + Math.abs(b.j - lj) === 1;
  const near = Math.hypot(b.i + 0.5 - lead.x, b.j + 0.5 - lead.y) <= EAT_REACH;
  const inReach = ahead || adjacent || near;
  const t = { i: b.i, j: b.j, power: kind.power, by: kind.by, ready: inReach && lead.id === kind.by };
  const prev = state.target;
  if (prev && prev.i === t.i && prev.j === t.j && typeof prev.nudgeAt === 'number') t.nudgeAt = prev.nudgeAt;
  return t;
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
