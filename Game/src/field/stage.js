// Parses a stage from the design data into a queryable Stage. Pure; no DOM.
//
// Stage { id, name, width, depth, rows, tileAt(i, j), isSolid(i, j, boulders?),
//         start, rest, candy, boulders, hedges, exits: [{ at, to }], spawns: [{ kind, at, patrol }] }
//
// isSolid(i, j) treats every 'O' as solid. The field passes its live boulder list as a
// third argument ([{ i, j }] as in FieldState.boulders) so an eaten or pushed boulder
// stops (or starts) blocking: isSolid(i, j, state.boulders).

const SPAWN_CHARS = { b: 'bat', s: 'spider', g: 'ghost' };

export function parseStage(stageData) {
  const rows = stageData.rows.slice();
  const depth = stageData.depth ?? rows.length;
  const width = stageData.width ?? Math.max(...rows.map((r) => r.length));

  const tileAt = (i, j) => {
    if (!Number.isInteger(i) || !Number.isInteger(j)) {
      i = Math.floor(i);
      j = Math.floor(j);
    }
    if (i < 0 || j < 0 || i >= width || j >= depth) return '#';
    const ch = rows[j]?.[i];
    return ch === undefined ? '#' : ch;
  };

  const isSolid = (i, j, boulders) => {
    const ch = tileAt(i, j);
    if (ch === '#') return true;
    if (ch === 'O') {
      if (!boulders) return true;
      return boulders.some((b) => b.i === i && b.j === j);
    }
    if (boulders && boulders.some((b) => b.i === i && b.j === j)) return true; // a pushed boulder
    return false;
  };

  const find = (chars) => {
    const out = [];
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) if (chars.includes(rows[j]?.[i])) out.push([i, j]);
    }
    return out;
  };

  const start = find('S')[0] ?? [0, Math.floor(depth / 2)];
  const rest = stageData.rest ? stageData.rest.map((p) => [p[0], p[1]]) : find('R');
  const candy = stageData.candy ? stageData.candy.map((p) => [p[0], p[1]]) : find('c');

  let exits;
  if (stageData.exits) {
    exits = stageData.exits.map((e) => ({ at: [e.at[0], e.at[1]], to: e.to }));
  } else {
    const conn = stageData.connections ?? {};
    exits = find('<>').map(([i, j]) => ({ at: [i, j], to: rows[j][i] === '<' ? conn.left ?? null : conn.right ?? null }));
  }

  let spawns;
  if (stageData.spawns) {
    spawns = stageData.spawns.map((s) => ({
      kind: s.kind ?? s.creature,
      at: [s.at[0], s.at[1]],
      patrol: (s.patrol ?? []).map((p) => [p[0], p[1]]),
    }));
  } else {
    spawns = find(Object.keys(SPAWN_CHARS).join('')).map(([i, j]) => ({ kind: SPAWN_CHARS[rows[j][i]], at: [i, j], patrol: [] }));
  }

  return {
    id: stageData.id,
    name: stageData.name ?? stageData.id,
    width,
    depth,
    rows,
    tileAt,
    isSolid,
    start,
    rest,
    candy,
    boulders: find('O'),
    hedges: find('#'),
    exits,
    spawns,
  };
}
