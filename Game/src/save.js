// Save and load, tolerant of bad data. Pure apart from the storage object passed in
// (localStorage in the game, a fake in tests). Nothing here ever throws.
//
// Save (v2): { v: 2, stageId,                         the live stage (equals world.stageId)
//   world: World,                                     src/field/world.js, with the live stage's memory, party,
//                                                     candy count, rest point and lollipop already written back
//   lead: { x, y, faceX, facing, form },              the lead's position on the live stage
//   settings[, pendingBattle: { creatureUid, kind }] }
// pendingBattle is present only while a battle is running: on load the game restarts that battle at round 1
// with the hearts saved here (the hearts the team had going in).
//
// Loading: const s = loadSave(storage); then enterStage(s.world, stageOf(s.stageId), data, { at: s.lead }).
// enterStage moves the team to the stage start if the saved spot cannot be stood on (a save taken mid-bridge).
// A v1 save (key 'elliot-game-save-v1') is never read: the game starts fresh. loadSave returns null for
// anything odd: wrong version, a stage or character the data does not have, a character twice, broken memory.

import defaultData from './data/slice.gen.js';
import { leaveStage } from './field/world.js';

export const SAVE_KEY = 'elliot-game-save-v2';
export const SAVE_VERSION = 2;

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPair = (p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]);
const isPairs = (l) => l === undefined || (Array.isArray(l) && l.every(isPair));
const isStrings = (l) => l === undefined || (Array.isArray(l) && l.every((u) => typeof u === 'string'));

const isPending = (p) => isObj(p) && typeof p.creatureUid === 'string' && typeof p.kind === 'string';

export function toSave(world, fieldState, settings, pendingBattle = null) {
  const w = JSON.parse(JSON.stringify(world));   // a snapshot: the live World is not changed
  leaveStage(w, fieldState);
  w.stageId = fieldState.stageId;
  const lead = fieldState.party[0];
  return {
    v: SAVE_VERSION,
    stageId: fieldState.stageId,
    world: w,
    lead: { x: lead.x, y: lead.y, faceX: lead.faceX, facing: lead.facing, form: lead.form },
    settings: settings ?? {},
    ...(isPending(pendingBattle) ? { pendingBattle: { creatureUid: pendingBattle.creatureUid, kind: pendingBattle.kind } } : {}),
  };
}

function isMemory(m) {
  return isObj(m) && isPairs(m.candyTaken) && isPairs(m.boulders) && isPairs(m.stones) && isPairs(m.gatesOpen)
    && isPairs(m.postsTaken) && isStrings(m.joined) && isStrings(m.asleep);
}

function isWorld(w, data) {
  const stageIds = new Set((data.stages ?? []).map((s) => s.id));
  const charIds = new Set((data.characters ?? []).map((c) => c.id));
  if (!isObj(w) || !stageIds.has(w.stageId)) return false;
  if (!Array.isArray(w.party) || w.party.length === 0) return false;
  const seen = new Set();
  for (const m of w.party) {
    if (!isObj(m) || !charIds.has(m.id) || seen.has(m.id) || !isNum(m.hearts)) return false;
    seen.add(m.id);
  }
  if (!isNum(w.candyCount) || w.candyCount < 0) return false;
  if (typeof w.lollipop !== 'boolean') return false;
  const r = w.restAt;
  if (!isObj(r) || !stageIds.has(r.stageId) || !Number.isInteger(r.i) || !Number.isInteger(r.j)) return false;
  if (!isObj(w.stages)) return false;
  for (const [id, mem] of Object.entries(w.stages)) if (!stageIds.has(id) || !isMemory(mem)) return false;
  return true;
}

// True when `s` has the shape toSave produces, at the current version, and fits the game data.
export function isValidSave(s, data = defaultData) {
  if (!isObj(s) || s.v !== SAVE_VERSION) return false;
  if (!isWorld(s.world, data) || s.stageId !== s.world.stageId) return false;
  if (!isObj(s.lead) || !isNum(s.lead.x) || !isNum(s.lead.y)) return false;
  if (!isObj(s.settings)) return false;
  return true;
}

export function loadSave(storage, data = defaultData) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(SAVE_KEY);
    if (typeof raw !== 'string') return null;
    const s = JSON.parse(raw);
    if (!isValidSave(s, data)) return null;
    if ('pendingBattle' in s && !isPending(s.pendingBattle)) delete s.pendingBattle;   // a bad one is dropped, the rest kept
    return s;
  } catch {
    return null;
  }
}

// Returns true if written, false if storage is missing, blocked or full.
export function writeSave(storage, object) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(SAVE_KEY, JSON.stringify(object));
    return true;
  } catch {
    return false;
  }
}
