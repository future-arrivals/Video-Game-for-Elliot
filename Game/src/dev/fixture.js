// Dev fixture: a Stage and FieldState for S1 shaped exactly like the plan's shared shapes, so the
// drawing code can be built before src/field/stage.js (Task 3) exists. Not used by the real game.
import data from '../data/slice.gen.js';

/** Minimal stand-in for parseStage(stageData) -> Stage. */
export function fixtureStage(sd = data.stages[0]) {
  const rows = sd.rows, depth = rows.length, width = Math.max(...rows.map(r => r.length));
  const tileAt = (i, j) => (j < 0 || j >= depth || i < 0 || i >= width) ? '#' : (rows[j][i] || '.');
  const find = ch => { const o = []; rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === ch) o.push([i, j]); })); return o; };
  const boulders = find('O');
  return {
    id: sd.id, name: sd.name, width, depth, rows, tileAt,
    isSolid: (i, j) => { const t = tileAt(i, j); return t === '#' || t === 'O'; },
    start: find('S')[0], rest: find('R'), candy: find('c'), boulders, hedges: find('#'),
    exits: sd.exits.map(e => ({ at: e.at, to: e.to })),
    spawns: sd.spawns.map(s => ({ kind: s.creature, at: s.at, patrol: s.patrol })),
  };
}

/** FieldState for S1: monster leading, fish and ice cream following, one bat, two candies, the boulder. */
export function fixtureField(stage, { x, y, form = 'folded', fold = 1, party = 3, batMode = 'patrol', lead = 'monster' } = {}) {
  const [si, sj] = stage.start;
  const lx = x ?? si + .5, ly = y ?? sj + .5;
  const chars = Object.fromEntries(data.characters.map(c => [c.id, c]));
  const mem = (id, i) => ({ id, x: Math.max(.6 + (party - 1 - i) * .4, lx - i * 1.25), y: ly - (lx - i * 1.25 < .6 ? i * .45 : 0), faceX: 1, facing: 'right', form: i === 0 ? form : 'folded',
    foldAnim: i === 0 ? fold : 1, moving: false, hearts: chars[id] ? chars[id].hearts : 8, maxHearts: chars[id] ? chars[id].hearts : 8 });
  const all = ['monster', 'fish', 'icecream'], ids = [lead, ...all.filter(i => i !== lead)].slice(0, party);
  const sp = stage.spawns[0];
  return {
    stageId: stage.id, time: 0,
    party: ids.map(mem),
    creatures: sp ? [{ uid: 'c1', kind: sp.kind, x: sp.at[0] + .5, y: sp.at[1] + .5, faceX: 1, facing: 'right', mode: batMode }] : [],
    candy: stage.candy.map(([i, j]) => ({ i, j, taken: false })),
    boulders: stage.boulders.map(([i, j]) => ({ i, j })),
    candyCount: 0,
    restAt: { stageId: stage.id, i: stage.rest[0][0], j: stage.rest[0][1] },
  };
}
