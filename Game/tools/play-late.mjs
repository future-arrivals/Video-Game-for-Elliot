// Run I for play.mjs: the second half of the route, S3's right exit -> S4 (Puzzle 1) -> S5 (ghosts) -> S6
// (Puzzle 2) -> the pumpkin door, with all three friends. Inputs only (press / move / tick); the route
// finder reads __game.canStand, never sets state. Starts from `stage=S3&party=3` at S3's right exit (run F
// already proves the way there from a fresh game). With --shots DIR it saves review screenshots to DIR/late.
// Beats: S4 dead end (the loose boulder pushed into the stream: a stone), save and reload, the do-over
// pumpkin, then solution 1a (plate opens the gate); S5 past both ghosts (or a won battle if one catches the
// team); S6 solution 2b (the fish bridges the ditch, Scoops rings the bell, the gate opens), in to the door.
import { mkdir } from 'node:fs/promises';

const SAVE_KEY = 'elliot-game-save-v2';

// In-page helpers on top of play.mjs's __play: a shortest standable path (over __game.canStand), walking it
// tile centre to tile centre, turning without moving, using a power and waiting for it to land.
const LATE = `
  Object.assign(window.__play, {
    path(i1, j1) {
      const g = this.g, l = g.state().party[0], s = [Math.floor(l.x), Math.floor(l.y)], k = (i, j) => i + ',' + j;
      const prev = new Map([[k(...s), null]]), q = [s];
      while (q.length) {
        const [i, j] = q.shift(); if (i === i1 && j === j1) break;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = [i + di, j + dj]; if (prev.has(k(...n)) || !g.canStand(...n)) continue;
          prev.set(k(...n), [i, j]); q.push(n);
        }
      }
      if (!prev.has(k(i1, j1))) return null;
      const out = []; for (let p = [i1, j1]; p; p = prev.get(k(...p))) out.unshift(p);
      return out;
    },
    walk(i, j) {
      const p = this.path(i, j); if (!p) return 'no path to ' + i + ',' + j;
      for (const [a, b] of p) { const r = this.go(a + .5, b + .5); if (r !== 'ok') return r + ' at ' + a + ',' + b; }
      return 'ok';
    },
    turn(dx, dy) { this.g.move(dx * 1e-3, dy * 1e-3, 1 / 60); this.g.tick(1 / 60); return this.g.state().party[0].facing; },
    leadTo(id) { for (let n = 0; n < 3 && this.g.state().party[0].id !== id; n++) { this.g.press('r1'); this.g.tick(1 / 60); } return this.g.state().party[0].id; },
    use() { this.g.press('cross'); this.g.tick(1 / 60); return this.settle(); },
    tiles(list) { return (list || []).map(b => b.i + ',' + b.j).sort().join(' '); },
    // ticks (standing still) until fn(state) is true; returns the seconds waited, or -1
    waitFor(fn, seconds = 20) { for (let t = 0; t < seconds; t += 1 / 30) { if (fn(this.g.state())) return t; this.g.tick(1 / 30); } return -1; },
  });
  true`;

export async function runLate({ run, boot, ev, check, opt }) {
  await run('I', async page => {
    const dir = opt.shots ? opt.shots.replace(/\/$/, '') + '/late' : null;
    const shot = async name => { if (!dir) return; await mkdir(dir, { recursive: true }); await page.screenshot({ path: `${dir}/${name}.png` }); };
    const st = () => ev(page, '({ stage: __play.stage(), party: __play.party(), candy: __game.state().candyCount, lead: __play.lead(), mode: __game.mode() })');
    const S = () => ev(page, '(() => { const s = __game.state(); return { b: __play.tiles(s.boulders), st: __play.tiles(s.stones), gates: s.gates.map(g => g.open), plates: s.plates.map(p => p.down), lead: __play.lead(), target: s.target }; })()');
    const late = async () => { await ev(page, LATE); };
    await boot(page, 'stage=S3&x=29.5&y=5.5&party=3'); await late();
    let s = await st();
    check('I: start at S3\'s right exit with all three', s.stage === 'S3' && s.party === 'monster,fish,icecream' && s.lead.i === 29 && s.lead.j === 5, JSON.stringify(s));

    // ---- S3 -> S4
    const t0 = await ev(page, '__play.exit(1, 0)');
    s = await st();
    check('I: S3 right exit slides to S4 at its left entrance', t0 > .3 && s.stage === 'S4' && s.lead.i === 1 && s.lead.j === 5 && s.mode === 'field', `slide ${t0}, ${JSON.stringify(s)}`);
    await ev(page, '__game.tick(.3)'); await shot('1-arrive-s4');

    // ---- S4 dead end from the tests: the loose boulder pushed east to (15,4), then down into the stream
    let lead = await ev(page, `__play.leadTo('icecream')`);
    let w = await ev(page, `__play.walk(11, 4)`);
    await ev(page, '__play.turn(1, 0)');
    const pushes = [];
    for (const i of [13, 14, 15]) {
      await ev(page, '__play.use()'); pushes.push((await S()).b);
      if (i < 15) await ev(page, `__play.walk(${i - 1}, 4); __play.turn(1, 0)`);
    }
    check('I: Scoops pushes the loose boulder east three times to (15,4)', lead === 'icecream' && w === 'ok' && pushes[2].includes('15,4'), `walk ${w}, boulders after each push: ${pushes.join(' | ')}`);
    w = await ev(page, `[__play.walk(15, 3), __play.turn(0, 1)].join()`);
    await ev(page, '__play.use()');
    await ev(page, `__play.walk(15, 4); __play.turn(0, 1)`);
    let a = await S();
    check('I: then down to (15,5), and the stream is ahead', a.b.includes('15,5') && a.target && a.target.power === 'push', `walk ${w}, ${JSON.stringify(a)}`);
    await ev(page, `__game.press('cross'); __game.tick(1 / 60)`);
    for (let k = 0; k < 60 && !(await ev(page, '(__game.state().action || {}).u > .55')); k++) await ev(page, '__game.tick(1 / 60)');
    await shot('2-boulder-sliding-into-water');
    await ev(page, '__play.settle(); __game.tick(.1)'); await shot('3-boulder-becomes-stone');
    a = await S();
    const cues = await ev(page, '__game.fieldScene.cues');
    check('I: the boulder sinks into the stream at (15,6) and becomes a stone (splash)', a.st === '15,6' && !a.b.includes('15,5') && a.b.split(' ').length === 2 && cues.includes('splash'), `${JSON.stringify(a)}, cues ${cues}`);
    check('I: dead end: the plate is still up and the gate still shut', a.plates[0] === false && a.gates[0] === false, JSON.stringify(a));

    // ---- save, close and reopen in the dead end: the World comes back
    await ev(page, '__game.fieldScene.save()');
    const before = await ev(page, `(() => { const w = JSON.parse(localStorage.getItem('${SAVE_KEY}')).world; return JSON.stringify(w.stages) + "|" + w.candyCount + "|" + w.party.map(m => m.id + m.hearts).join(); })()`);
    await boot(page, '', { clear: false }); await late();
    const after = await ev(page, 'JSON.stringify(__game.fieldScene.world.stages) + "|" + __game.fieldScene.world.candyCount + "|" + __game.fieldScene.world.party.map(m => m.id + m.hearts).join()');
    s = await st(); a = await S();
    check('I: after a reload in S4 the World is restored (stage, party, stone, boulders)', s.stage === 'S4' && s.party === 'icecream,monster,fish' && a.st === '15,6' && a.b === '16,1 17,1' && s.lead.i === 15 && s.lead.j === 4, `${JSON.stringify(s)}, ${JSON.stringify(a)}`);
    check('I: the reloaded World matches the saved one', before === after, before === after ? 'same' : `${before}\n   vs ${after}`);

    // ---- the do-over pumpkin at (2,1)
    w = await ev(page, `__play.walk(3, 1)`);
    await ev(page, '__play.turn(-1, 0)');
    a = await S();
    const tg = a.target;
    await ev(page, `__game.press('cross'); __game.tick(1 / 60)`);
    await ev(page, '__game.tick(.15)'); await shot('4-doover-pumpkin-used');
    a = await S(); s = await st();
    check('I: the do-over pumpkin resets the puzzle: boulders back, stone gone, team at the left entrance', w === 'ok' && tg && tg.kind === 'doover' && a.b === '12,4 16,1 17,1' && a.st === '' && s.lead.i === 1 && s.lead.j === 6,
      `walk ${w}, target ${JSON.stringify(tg)}, ${JSON.stringify(a)}, lead (${s.lead.i},${s.lead.j})`);

    // ---- solution 1a: push the loose boulder left, then down twice onto the plate
    w = await ev(page, `[__play.walk(13, 4), __play.turn(-1, 0)].join()`);
    await ev(page, '__play.use()');
    w += ',' + await ev(page, `[__play.walk(11, 3), __play.turn(0, 1)].join()`);
    await ev(page, '__play.use()');
    w += ',' + await ev(page, `[__play.walk(11, 4), __play.turn(0, 1)].join()`);
    await ev(page, `__game.press('cross'); __game.tick(1 / 60)`);
    await ev(page, '__play.waitFor(s => s.gates[0].open, 3)');
    await ev(page, '__game.tick(.2)'); await shot('5-gate-mid-swing');
    await ev(page, '__play.settle(); __game.tick(.5)');
    a = await S();
    check('I: 1a: the boulder lands on the plate at (11,6), the plate goes down and the gate opens', w === 'ok,left,ok,front,ok,front' && a.b.includes('11,6') && a.plates[0] === true && a.gates[0] === true, `walk ${w}, ${JSON.stringify(a)}`);
    w = await ev(page, `[__play.walk(16, 3), __play.walk(17, 3), __play.walk(19, 3)].join()`);
    await ev(page, '__game.tick(.3)'); await shot('6-p1-solved');
    w = w.replace('ok,ok,ok', 'ok,ok') + ',' + await ev(page, `__play.walk(22, 3)`);
    const t1 = await ev(page, '__play.exit(1, 0)');
    s = await st();
    check('I: through the open gate to S4\'s right exit, on to S5', w === 'ok,ok,ok' && t1 > .3 && s.stage === 'S5' && s.lead.i === 1 && s.lead.j === 3, `walk ${w}, slide ${t1}, ${JSON.stringify(s)}`);
    await shot('7-arrive-s5');

    // ---- S5: fold, drop to row 7 out of ghost 1's band (its row +/-1), then pass behind ghost 2 on row 8
    // while it floats up its column facing back; take the candy at (29,8); leave on row 5.
    const ghosts = () => ev(page, '__game.state().creatures.map(c => c.uid + " " + c.mode + " (" + c.x.toFixed(1) + "," + c.y.toFixed(1) + ") " + c.facing).join("; ")');
    const candy0 = (await st()).candy;
    await ev(page, `__game.press('square'); __game.tick(.6)`);
    w = await ev(page, `[__play.walk(1, 7), __play.walk(20, 7)].join()`);
    const waited = await ev(page, `__play.waitFor(s => { const c = s.creatures.find(k => k.uid === 'S5-ghost-1'); return c.facing === 'back' && c.y < 5 && c.y > 3; })`);
    w += ',' + await ev(page, `[__play.walk(20, 8), __play.walk(29, 8)].join()`);
    s = await st();
    const g1 = await ghosts();
    check('I: S5: sneaking under ghost 1 and behind ghost 2 to the candy at (29,8), no battle', s.mode === 'field' && s.stage === 'S5' && s.lead.i === 29 && s.lead.j === 8 && s.candy === candy0 + 1 && !g1.includes('chase'),
      `walk ${w}, waited ${waited.toFixed?.(1)} s, ${JSON.stringify(s)}, ${g1}`);
    w = await ev(page, `__play.walk(30, 5)`);
    const t2 = await ev(page, '__play.exit(1, 0)');
    s = await st();
    check('I: S5 right exit slides to S6', w === 'ok' && t2 > .3 && s.stage === 'S6' && s.lead.i === 1 && s.lead.j === 5, `walk ${w}, slide ${t2}, ${JSON.stringify(s)}, ${await ghosts()}`);
    await shot('8-arrive-s6');

    // ---- S6, solution 2b: the fish bridges the ditch from (11,7); Scoops rings the bell; the fish bridges back
    lead = await ev(page, `__play.leadTo('fish')`);
    w = await ev(page, `[__play.walk(11, 7), __play.turn(1, 0)].join()`);
    await ev(page, '__play.use()');
    s = await st();
    check('I: 2b: Heartfin bridges the ditch from (11,7) to (13,7)', lead === 'fish' && w === 'ok,right' && s.lead.i === 13 && s.lead.j === 7, `walk ${w}, ${JSON.stringify(s)}`);
    lead = await ev(page, `__play.leadTo('icecream')`);
    w = await ev(page, `__play.walk(14, 6)`);
    await ev(page, `__game.press('cross'); __game.tick(1 / 60)`);
    await ev(page, '__play.waitFor(s => s.gates[0].open, 3)');
    await ev(page, '__play.settle(); __game.tick(.5)');
    a = await S();
    const bell = await ev(page, `__game.state().posts.find(p => p.kind === 'bell')`);
    check('I: 2b: Scoops rings the bell and the gate at (23,6) opens', lead === 'icecream' && w === 'ok' && bell.taken && a.gates[0] === true, `walk ${w}, bell ${JSON.stringify(bell)}, ${JSON.stringify(a)}`);
    await shot('9-p2-solved');
    w = await ev(page, `__play.walk(15, 8)`);
    s = await st();
    check('I: the candy in the bell enclosure at (15,8) is taken', w === 'ok' && s.candy === candy0 + 2, `walk ${w}, ${JSON.stringify(s)}`);
    lead = await ev(page, `__play.leadTo('fish')`);
    w = await ev(page, `[__play.walk(13, 6), __play.turn(-1, 0)].join()`);
    await ev(page, '__play.use()');
    s = await st();
    check('I: Heartfin bridges back west to (11,6)', w === 'ok,left' && s.lead.i === 11 && s.lead.j === 6, `walk ${w}, ${JSON.stringify(s)}`);
    // fold first: the open fish is about 210 px tall and at row 3 would cover the door in the screenshot
    await ev(page, `__game.press('square'); __game.tick(.6)`);
    w = await ev(page, `[__play.walk(23, 6), __play.walk(27, 4)].join()`);
    await ev(page, '__game.move(0, -1, .5); __game.tick(.5)');
    const g = await ev(page, '({ stage: __play.stage(), mode: __game.mode(), cues: __game.fieldScene.cues, lead: __play.lead(), party: __play.party() })');
    await shot('10-team-at-pumpkin-door');
    check('I: through the open gate to the pumpkin door: the team stays in S6 and the "more soon" bubble shows', w === 'ok,ok' && g.stage === 'S6' && g.mode === 'field' && g.cues.includes('exit') && g.lead.i >= 27 && g.lead.i <= 28,
      `walk ${w}, ${JSON.stringify(g)}`);
  });
}
