// Save and load, tolerant of bad data. Pure apart from the storage object passed in
// (localStorage in the game, a fake in tests). Nothing here ever throws.
//
// Save (v1): { v, stageId, party: [{ id, hearts, form }] (lead first),
//   lead: { x, y, faceX, facing }, candyTaken: [[i, j]], boulders: [[i, j]],
//   asleep: [creatureUid], restAt: { stageId, i, j }, candyCount, settings }

export const SAVE_KEY = 'elliot-game-save-v1';
export const SAVE_VERSION = 1;

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPair = (p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]);

export function toSave(fieldState, settings) {
  const lead = fieldState.party[0];
  return {
    v: SAVE_VERSION,
    stageId: fieldState.stageId,
    party: fieldState.party.map((m) => ({ id: m.id, hearts: m.hearts, form: m.form })),
    lead: { x: lead.x, y: lead.y, faceX: lead.faceX, facing: lead.facing },
    candyTaken: fieldState.candy.filter((c) => c.taken).map((c) => [c.i, c.j]),
    boulders: fieldState.boulders.map((b) => [b.i, b.j]),
    asleep: fieldState.creatures.filter((c) => c.mode === 'asleep').map((c) => c.uid),
    restAt: { stageId: fieldState.restAt.stageId, i: fieldState.restAt.i, j: fieldState.restAt.j },
    candyCount: fieldState.candyCount,
    settings: settings ?? {},
  };
}

// True when `s` has the shape toSave produces, at the current version.
export function isValidSave(s) {
  if (!isObj(s) || s.v !== SAVE_VERSION) return false;
  if (typeof s.stageId !== 'string') return false;
  if (!Array.isArray(s.party) || s.party.length === 0) return false;
  for (const m of s.party) {
    if (!isObj(m) || typeof m.id !== 'string' || !isNum(m.hearts)) return false;
    if (m.form !== 'folded' && m.form !== 'open') return false;
  }
  if (!isObj(s.lead) || !isNum(s.lead.x) || !isNum(s.lead.y)) return false;
  if (!Array.isArray(s.candyTaken) || !s.candyTaken.every(isPair)) return false;
  if (!Array.isArray(s.boulders) || !s.boulders.every(isPair)) return false;
  if (!Array.isArray(s.asleep) || !s.asleep.every((u) => typeof u === 'string')) return false;
  if (!isObj(s.restAt) || typeof s.restAt.stageId !== 'string' || !Number.isInteger(s.restAt.i) || !Number.isInteger(s.restAt.j)) return false;
  if (!isNum(s.candyCount) || s.candyCount < 0) return false;
  if (!isObj(s.settings)) return false;
  return true;
}

export function loadSave(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(SAVE_KEY);
    if (typeof raw !== 'string') return null;
    const s = JSON.parse(raw);
    return isValidSave(s) ? s : null;
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
