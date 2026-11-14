// Parses a stage from the design data into a queryable Stage. Pure; no DOM.
//
// Stage { id, name, width, depth, rows, tileAt(i, j), isSolid(i, j, boulders?),
//         start, rest, candy, boulders, hedges, exits: [{ at, to }], spawns: [{ kind, at, patrol }],
//         water, plates, gates, posts: [{ at, kind: 'candy' | 'bell' }], joins: [{ at, id }],
//         doOver, lollipop: [i, j] | null, door, pumpkin, doorTo: stageId | null,
//         entrance(fromStageId, row?) -> [i, j] }
//
// Every list of tiles is [[i, j]] in reading order (row by row, left to right).
// Legend: '#' hedge, 'Q' giant pumpkin, '^' / 'B' candy / bell post and 'r' do-over pumpkin are static
// standees (isSolid). 'O' is a boulder (see below). '~' water, 'P' plate, 'G' gate, 'D' door, 'H' lollipop,
// 'F' / 'I' join tiles, 'c' candy, 'R' rest, 'S' start, '<' '>' 'E' exits, 'b' 's' 'g' spawns. Everything
// else ('.', ':', and the M3/M4 characters k v f * m X L) is plain ground.
// isSolid knows only the map. Water, gates, stones, waiting friends and live boulders change during play:
// field.js canStand(state, stage, i, j) is the one question movement and powers ask.
//
// isSolid(i, j) treats every 'O' as solid. The field passes its live boulder list as a
// third argument ([{ i, j }] as in FieldState.boulders) so an eaten or pushed boulder
// stops (or starts) blocking: isSolid(i, j, state.boulders).
//
// Exit targets in the data are sometimes annotated ("S5 (only past the divider)"); `to` is always a plain
// stage id. S6's door is not an exit: its target is `doorTo` ('S7'), and nothing travels through it in M2.
//
// entrance(fromStageId, row): where the team arrives. With fromStageId null (or a stage that does not
// connect here): the start, which is the 'S' tile, or else the left entrance. Otherwise the tile just
// inside this stage's exit back to fromStageId, on the exit row nearest `row` (the middle exit when no row
// is given; ties go to the lower row number). Arriving from the door's stage: the tile in front of the door.

const SPAWN_CHARS = { b: 'bat', s: 'spider', g: 'ghost' };
const STATIC_SOLID = '#Q^Br';
const JOIN_CHARS = { F: 'fish', I: 'icecream' };

// "S5 (only past the divider)" -> 'S5'; anything without a stage id -> null.
export function stageId(to) {
  if (typeof to !== 'string') return null;
  const m = /S\d+/.exec(to);
  return m ? m[0] : null;
}

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
    if (STATIC_SOLID.includes(ch)) return true;
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

  const posts = [...find('^B')].map(([i, j]) => ({ at: [i, j], kind: rows[j][i] === 'B' ? 'bell' : 'candy' }));
  const isPost = (p) => posts.some((q) => q.at[0] === p[0] && q.at[1] === p[1]);

  const rest = stageData.rest ? stageData.rest.map((p) => [p[0], p[1]]) : find('R');
  // a candy on a tall post is the post's (taken by Reach), not a floor candy
  const candy = (stageData.candy ? stageData.candy.map((p) => [p[0], p[1]]) : find('c')).filter((p) => !isPost(p));

  let exits;
  if (stageData.exits) {
    exits = stageData.exits.map((e) => ({ at: [e.at[0], e.at[1]], to: stageId(e.to) }));
  } else {
    const conn = stageData.connections ?? {};
    exits = find('<>').map(([i, j]) => ({ at: [i, j], to: stageId(rows[j][i] === '<' ? conn.left : conn.right) }));
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

  const door = find('D');
  const doorTo = door.length ? stageId(stageData.connections?.door) : null;

  // The tile one step into the stage from an exit, if the map lets you stand there; else the exit tile.
  const inward = ([i, j]) => {
    const di = i === 0 ? 1 : i === width - 1 ? -1 : 0;
    const k = i + di;
    return di && !isSolid(k, j) && !'~GP'.includes(tileAt(k, j)) ? [k, j] : [i, j];
  };
  const pick = (list, row) => {
    const sorted = list.slice().sort((a, b) => a.at[1] - b.at[1]);
    if (!Number.isFinite(row)) return sorted[Math.floor((sorted.length - 1) / 2)];
    let best = sorted[0];
    for (const e of sorted) if (Math.abs(e.at[1] - row) < Math.abs(best.at[1] - row)) best = e;
    return best;
  };

  const sTile = find('S')[0];
  const leftExits = exits.filter((e) => e.at[0] === 0);
  const start = sTile
    ?? (leftExits.length ? inward(pick(leftExits, null).at) : null)
    ?? (exits.length ? inward(pick(exits, null).at) : null)
    ?? [0, Math.floor(depth / 2)];

  const entrance = (fromStageId = null, row = null) => {
    if (fromStageId != null) {
      const back = exits.filter((e) => e.to === fromStageId);
      if (back.length) return inward(pick(back, row).at).slice();
      if (fromStageId === doorTo && door.length) {
        const [i, j] = door[0];
        if (!isSolid(i, j + 1)) return [i, j + 1];
        return [i, j];
      }
    }
    return start.slice();
  };

  const lollipop = find('H')[0] ?? null;

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
    water: find('~'),
    plates: find('P'),
    gates: find('G'),
    posts,
    joins: find('FI').map(([i, j]) => ({ at: [i, j], id: JOIN_CHARS[rows[j][i]] })),
    doOver: find('r'),
    lollipop,
    door,
    pumpkin: find('Q'),
    doorTo,
    entrance,
  };
}
