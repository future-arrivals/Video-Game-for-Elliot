// The World: everything that outlives a stage. Plain JSON-safe data; pure functions; no DOM, no randomness.
// A FieldState (field.js) is the live simulation of the one stage on screen: enterStage builds it from the
// World, leaveStage writes it back.
//
// World { stageId,                                  the stage on screen
//         party: [{ id, hearts }],                  lead first; only characters who have joined
//         candyCount, lollipop: bool, restAt: { stageId, i, j },
//         bossBeaten: true once Big Ghost is beaten (absent before),
//         stages: { [stageId]: StageMemory } }      only stages visited
// StageMemory { candyTaken: [[i, j]], boulders: [[i, j]],   where each boulder is now
//               stones: [[i, j]], gatesOpen: [[i, j]], postsTaken: [[i, j]], joined: [id], asleep: [uid] }
//
// createWorld(data, { party = ['monster'] } = {}) -> World
// enterStage(world, stage, data, { from = null, row = null, at = null } = {}) -> FieldState
//   from: the stage the team comes from (null: the stage start); row: the row it left by, so it arrives on the
//   nearest matching exit row (stage.entrance(from, row)); at: { x, y[, faceX, facing, form] } for a save or
//   a dev start, used only if the team can stand there (else the stage start). Marks the stage visited.
// leaveStage(world, fieldState) -> void   writes the StageMemory, party (order and hearts), candy count,
//   rest point and lollipop back
// restWorld(world, data?) -> void         full hearts; every stage's asleep list cleared
//
// doOver(world, stage, data, state = null) -> FieldState   the pause-menu do-over (the do-over pumpkin does
//   the same from inside stepField). Boulders back where the map has them, every stone gone, the team at the
//   stage's left entrance; candy taken, posts, open gates, joined friends and hearts are kept. With the live
//   FieldState it resets that state in place and returns it; without one it builds a fresh FieldState from
//   the World. Either way the World's memory of the stage is updated. (Rules: puzzles.js resetPuzzle.)

import defaultData from '../data/slice.gen.js';
import { parseStage } from './stage.js';
import { createField } from './field.js';
import { resetPuzzle } from './puzzles.js';
import { computeTarget } from './powers.js';

const pairs = (list) => list.map((p) => [p.i, p.j]);

export function createWorld(data, { party = ['monster'] } = {}) {
  const chars = Object.fromEntries((data.characters ?? []).map((c) => [c.id, c]));
  const ids = [];
  for (const id of party) if (chars[id] && !ids.includes(id)) ids.push(id);
  if (!ids.length && chars.monster) ids.push('monster');
  const first = parseStage(data.stages[0]);
  const r = first.rest[0] ?? first.start;
  return {
    stageId: first.id,
    party: ids.map((id) => ({ id, hearts: chars[id].hearts })),
    candyCount: 0,
    lollipop: false,
    restAt: { stageId: first.id, i: r[0], j: r[1] },
    stages: {},
  };
}

export function enterStage(world, stage, data, { from = null, row = null, at = null } = {}) {
  world.stageId = stage.id;
  const memory = world.stages[stage.id] ?? null;
  const state = createField({
    stage, data, party: world.party, memory,
    candyCount: world.candyCount, restAt: world.restAt, lollipop: world.lollipop,
    at, from, row, bossBeaten: !!world.bossBeaten,
  });
  if (!memory) world.stages[stage.id] = memoryOf(state);
  return state;
}

export function leaveStage(world, state) {
  world.stages[state.stageId] = memoryOf(state);
  world.party = state.party.map((m) => ({ id: m.id, hearts: m.hearts }));
  world.candyCount = state.candyCount;
  world.restAt = { stageId: state.restAt.stageId, i: state.restAt.i, j: state.restAt.j };
  if (state.lollipop && state.lollipop.taken) world.lollipop = true;
  if (state.bossBeaten) world.bossBeaten = true;
}

export function restWorld(world, data = defaultData) {
  const max = Object.fromEntries((data.characters ?? []).map((c) => [c.id, c.hearts]));
  for (const m of world.party) if (typeof max[m.id] === 'number') m.hearts = max[m.id];
  for (const mem of Object.values(world.stages)) mem.asleep = [];
}

export function doOver(world, stage, data, state = null) {
  const f = state ?? enterStage(world, stage, data);
  resetPuzzle(f, stage);
  f.target = computeTarget(f, stage);
  leaveStage(world, f);
  world.stageId = stage.id;
  return f;
}

function memoryOf(state) {
  const inParty = (id) => state.party.some((m) => m.id === id);
  const waiting = (id) => (state.friends ?? []).some((f) => f.id === id);
  return {
    candyTaken: pairs(state.candy.filter((c) => c.taken)),
    boulders: pairs(state.boulders),
    stones: pairs(state.stones ?? []),
    gatesOpen: pairs((state.gates ?? []).filter((g) => g.open)),
    postsTaken: pairs((state.posts ?? []).filter((p) => p.taken)),
    joined: (state._sim?.joinIds ?? []).filter((id) => inParty(id) && !waiting(id)),
    asleep: state.creatures.filter((c) => c.mode === 'asleep').map((c) => c.uid),
  };
}
