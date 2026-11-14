// Run I (and run J at the end of this file) for play.mjs: the second half of the route, S3's right exit -> S4 (Puzzle 1) -> S5 (ghosts) -> S6
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
    await shot('10-team-at-pumpkin-door');
    const t3 = await ev(page, '__play.exit(0, -1)');
    s = await st();
    check('I: through the open gate to the pumpkin door: it opens into S7 (the ghost house)', w === 'ok,ok' && t3 > .3 && s.stage === 'S7' && s.mode === 'field' && s.lead.i === 1 && s.lead.j === 4,
      `walk ${w}, slide ${t3}, ${JSON.stringify(s)}`);
  });

  // Run J: the pumpkin door -> S7 (the ghost house) -> back out -> in again -> into Big Ghost. Starts from
  // `stage=S6&party=3` beside the door. Asserts only what the field controls: the stage, the autosave, the
  // boss's 'battle' event (seen as the scene waiting and the save's pendingBattle), never the fight itself.
  await run('J', async page => {
    const dir = opt.shots ? opt.shots.replace(/\/$/, '') : null;
    const shot = async name => { if (!dir) return; await mkdir(dir, { recursive: true }); await page.screenshot({ path: `${dir}/${name}.png` }); };
    const st = () => ev(page, '({ stage: __play.stage(), party: __play.party(), lead: __play.lead(), mode: __game.mode(), boss: __game.state().boss })');
    const saved = () => ev(page, `(() => { const s = JSON.parse(localStorage.getItem('${SAVE_KEY}')); return s && { stageId: s.stageId, pending: s.pendingBattle || null }; })()`);
    await boot(page, 'stage=S6&party=3&x=27.5&y=5.5'); await ev(page, LATE);
    let s = await st();
    check('J: start in S6 near the pumpkin door with all three', s.stage === 'S6' && s.party === 'monster,fish,icecream' && s.lead.i === 27 && s.lead.j === 5, JSON.stringify(s));

    // ---- in through the door
    await ev(page, '__play.walk(27, 4)');
    let t = await ev(page, '__play.exit(0, -1)');
    s = await st(); let sv = await saved();
    check('J: walking up to the door slides into S7 at its entrance, no "more soon" bubble', t > .3 && s.stage === 'S7' && s.mode === 'field' && s.lead.i === 1 && s.lead.j === 4 && !(await ev(page, '__game.fieldScene.cues')).includes('exit'), `slide ${t}, ${JSON.stringify(s)}`);
    check('J: arriving in S7 autosaves it, and Big Ghost stands there', sv && sv.stageId === 'S7' && s.boss && s.boss.i0 === 13 && s.boss.j0 === 3, `${JSON.stringify(sv)}, boss ${JSON.stringify(s.boss)}`);
    await ev(page, '__game.tick(.3)'); await shot('m3-arrive-s7');

    // ---- back out by the left exit, then in again
    t = await ev(page, '__play.exit(-1, 0)');
    s = await st();
    check('J: S7\'s left exit leads back to the tile in front of the S6 door', t > .3 && s.stage === 'S6' && s.lead.i === 27 && s.lead.j === 4, `slide ${t}, ${JSON.stringify(s)}`);
    t = await ev(page, '__play.exit(0, -1)');
    s = await st();
    check('J: and in again', t > .3 && s.stage === 'S7' && s.lead.i === 1 && s.lead.j === 4, `slide ${t}, ${JSON.stringify(s)}`);

    // ---- walk into Big Ghost along row 4
    await ev(page, '__game.tick(.3)');
    const w = await ev(page, '__play.walk(11, 4)');
    await shot('m3-team-next-to-big-ghost-far');
    let ok = false, n = 0;
    for (; n < 120 && !ok; n++) { await ev(page, '__game.move(1, 0, 1 / 30); __game.tick(1 / 30)'); ok = await ev(page, '__game.fieldScene.waiting || __game.mode() !== "field"'); if (n === 6) await shot('m3-team-next-to-big-ghost'); }
    sv = await saved(); s = await st();
    check('J: walking into Big Ghost starts a battle for it (the field waits; the save says bigghost)', w === 'ok' && ok && sv && sv.pending && sv.pending.creatureUid === 'boss' && sv.pending.kind === 'bigghost',
      `walk ${w}, after ${n} steps, mode ${s.mode}, ${JSON.stringify(sv)}`);
  });

  // The boss fight itself, both ways, from `stage=S7` on row 4 next to Big Ghost. Every move is a button press
  // chosen from the battle's own cards (the same cards the battle scene draws), then the round plays out.
  const BOSS = `
    (async () => {
      const B = await import(new URL('src/battle/battle.js', location.href).href);
      const P = window.__play, g = P.g;
      Object.assign(P, {
        // the button that plays a card word now: Cross / Circle / Triangle by slot, Square for Open / Fold
        button(word) {
          const b = g.battle();
          if (word === 'Open' || word === 'Fold') return 'square';
          const slot = B.cards(b).moves.findIndex(m => m.word === word);
          return slot < 0 ? null : ['cross', 'circle', 'triangle'][slot];
        },
        // press (lift, then play) and read the state the round ends in, then let it play out until the next choice
        round(button) {
          g.press(button); g.tick(.05); g.press(button); g.tick(1 / 60);
          const b = g.battle(); if (!b) return null;
          const a = b.party[b.active];
          const snap = { id: a.id, hearts: a.hearts, phase: b.boss.phase, littles: b.boss.littles, boss: b.enemy.hearts, state: b.phase };
          for (let t = 0; t < 6; t += 1 / 60) { g.tick(1 / 60); const c = g.battle(); if (c) this.lastPhase = c.phase; if (c && (c.phase === 'won' || c.phase === 'lost')) break; }   // the round's playback (a finished battle is left for the caller to run out)
          return snap;
        },
      });
      return true;
    })()`;
  // boots S7 beside Big Ghost, walks into it and waits for the battle page; returns what it saw
  const intoBoss = async (page, lead) => {
    await boot(page, `stage=S7&party=3&lead=${lead}&x=11.5&y=4.5`); await ev(page, LATE); await ev(page, BOSS);
    const info = await ev(page, '({ stage: __play.stage(), party: __play.party(), lead: __play.lead(), boss: __game.state().boss, candy: __game.state().candyCount, rest: __game.fieldScene.stage.rest[0] })');
    let n = 0;
    for (; n < 120 && (await ev(page, '__game.mode()')) === 'field' && !(await ev(page, '__game.fieldScene.waiting')); n++) await ev(page, '__game.move(1, 0, 1 / 30); __game.tick(1 / 30)');
    const t = await ev(page, `__play.until('battle', 3)`);
    await ev(page, '__game.tick(1)');
    const b = await ev(page, '(() => { const b = __game.battle(); return b && { enemy: b.enemy.id, canRun: b.canRun, round: b.round, active: b.party[b.active].id, phase: b.phase }; })()');
    return { info, t, b };
  };

  // Run K: beat Big Ghost with Scoops (Ice Cream), the worked "Solo Ice Cream" line from test/boss.test.js.
  await run('K', async page => {
    const { info, t, b } = await intoBoss(page, 'icecream');
    check('K: start in S7 next to Big Ghost with Scoops in front', info.stage === 'S7' && info.party === 'icecream,monster,fish' && info.boss && info.boss.i0 === 13, JSON.stringify(info));
    check('K: walking into Big Ghost starts the battle (via the page turn), against bigghost, Run unavailable', t >= 0 && b && b.enemy === 'bigghost' && b.canRun === false && b.round === 1 && b.active === 'icecream',
      `after ${t.toFixed ? t.toFixed(2) : t} s, ${JSON.stringify(b)}`);
    // [card word, action, hearts of Scoops, Big Ghost: 'nLG' or its hearts]
    const rows = [['Bonk', 10, '2LG'], ['Bonk', 10, '1LG'], ['Bonk', 10, 11], ['Open', 10, 11], ['Drop', 9, 6], ['Smash', 6, 1], ['Bonk', 6, 0]];
    for (let i = 0; i < rows.length; i++) {
      const [word, hearts, bg] = rows[i];
      const btn = await ev(page, `__play.button('${word}')`);
      const snap = btn ? await ev(page, `__play.round('${btn}')`) : null;
      const okBoss = snap && (typeof bg === 'string' ? snap.phase === 1 && snap.littles === Number(bg[0]) : snap.phase === 2 && snap.boss === bg);
      check(`K: round ${i + 1}: ${word} (${btn}): Scoops ${hearts} hearts, Big Ghost ${bg}`, !!snap && snap.id === 'icecream' && snap.hearts === hearts && okBoss, JSON.stringify(snap));
    }
    const ph = await ev(page, '__play.lastPhase');
    check('K: the battle phase ends as won', ph === 'won', `phase ${ph}`);
    const back = await ev(page, `__play.until('field', 8)`);
    let a = await ev(page, '({ stage: __play.stage(), mode: __game.mode(), battle: __game.battle(), ending: __game.fieldScene.ending, lead: __play.lead() })');
    check('K: back in the field in S7 and the ending moment is playing', back >= 0 && a.stage === 'S7' && a.mode === 'field' && a.battle === null && a.ending === true, `after ${back.toFixed ? back.toFixed(2) : back} s, ${JSON.stringify(a)}`);
    await ev(page, '__game.move(-1, 0, .5); __game.tick(.5)');
    const during = await ev(page, '__play.lead()');
    check('K: input is ignored while the ending plays', during.x === a.lead.x && during.y === a.lead.y, `before (${a.lead.x},${a.lead.y}), after (${during.x},${during.y})`);
    const endAt = await ev(page, '(() => { for (let t = 0; t < 10; t += 1 / 30) { if (!__game.fieldScene.ending) return t; __game.tick(1 / 30); } return -1; })()');
    await ev(page, '__game.move(-1, 0, .5); __game.tick(.5)');
    const after = await ev(page, '__play.lead()');
    check('K: the ending finishes and input returns', endAt >= 1.5 && endAt <= 3 && after.x < during.x - .2, `ended after ${endAt.toFixed ? endAt.toFixed(1) : endAt} s more, x ${during.x} -> ${after.x}`);
    const c = await ev(page, '({ candy: __game.state().candyCount, boss: __game.state().boss, beaten: __game.state().bossBeaten })');
    check('K: candy went up by exactly 10', c.candy === info.candy + 10, `${info.candy} -> ${c.candy}`);
    check('K: Big Ghost is gone (boss null, bossBeaten)', c.boss === null && c.beaten === true, JSON.stringify(c));
    const tiles = [];
    for (let i = info.boss.i0; i <= info.boss.i1; i++) for (let j = info.boss.j0; j <= info.boss.j1; j++) tiles.push([i, j]);
    const stand = await ev(page, `${JSON.stringify(tiles)}.map(([i, j]) => __game.canStand(i, j))`);
    const w = await ev(page, `__play.walk(${info.boss.i0}, ${info.boss.j0})`);
    const at = await ev(page, '__play.lead()');
    check('K: its tiles can be walked on', stand.every(Boolean) && w === 'ok' && at.i === info.boss.i0 && at.j === info.boss.j0 && (await ev(page, '__game.mode()')) === 'field', `canStand ${stand.join()}, walk ${w}, lead (${at.i},${at.j})`);
    await ev(page, '__game.fieldScene.save()');
    await boot(page, '', { clear: false });
    a = await ev(page, '({ stage: __play.stage(), mode: __game.mode(), boss: __game.state().boss, beaten: __game.state().bossBeaten, candy: __game.state().candyCount, pending: (JSON.parse(localStorage.getItem("' + SAVE_KEY + '")) || {}).pendingBattle || null })');
    check('K: after a save and reload Big Ghost is still gone and bossBeaten is true', a.stage === 'S7' && a.mode === 'field' && a.boss === null && a.beaten === true && a.candy === info.candy + 10 && !a.pending, JSON.stringify(a));
  });

  // Run L: lose to Big Ghost with Heartfin (Fish): Splash x3 to get past the Little Ghosts, then Open / Fold every round (Square, which never hurts Big Ghost), no switching except the free pick
  // after each knockout, until the whole team is out.
  await run('L', async page => {
    const { info, t, b } = await intoBoss(page, 'fish');
    check('L: start in S7 next to Big Ghost with Heartfin in front', info.stage === 'S7' && info.party === 'fish,icecream,monster' && info.boss && info.boss.i0 === 13, JSON.stringify(info));
    check('L: the boss battle starts, Run unavailable', t >= 0 && b && b.enemy === 'bigghost' && b.canRun === false && b.active === 'fish', `${JSON.stringify(b)}`);
    let rounds = 0, picks = 0, last = null;
    for (; rounds < 80; rounds++) {
      const ph = await ev(page, '(() => { const b = __game.battle(); return b ? b.phase : null; })()');
      last = ph; if (ph === null || ph === 'lost' || ph === 'won') break;
      if (ph === 'chooseNext') {                           // the free pick: whichever neighbour is still awake
        picks++;
        for (const btn of ['l1', 'r1']) { await ev(page, `__play.round('${btn}')`); if ((await ev(page, '(() => { const b = __game.battle(); return !b || b.phase !== "chooseNext"; })()'))) break; }
      } else await ev(page, `__play.round('${rounds < 3 ? 'cross' : 'square'}')`);   // Splash x3 clears the Little Ghosts, then Open / Fold
    }
    for (let k = 0; k < 20 && (await ev(page, '__game.battle()')); k++) await ev(page, '__game.tick(.5)');
    const ph = await ev(page, '__play.lastPhase');
    check('L: Splash x3 then Open / Fold loses, with 2 free picks after knockouts', ph === 'lost' && picks === 2, `phase ${ph}, ${rounds} rounds, ${picks} picks`);
    const back = await ev(page, `__play.until('field', 8)`);
    const a = await ev(page, '({ stage: __play.stage(), mode: __game.mode(), lead: __play.lead(), hearts: __game.state().party.map(m => m.hearts === m.maxHearts), boss: __game.state().boss, beaten: __game.state().bossBeaten, candy: __game.state().candyCount })');
    check('L: back in the field in S7 on the rest blanket', back >= 0 && a.stage === 'S7' && a.mode === 'field' && a.lead.i === info.rest[0] && a.lead.j === info.rest[1], `after ${back.toFixed ? back.toFixed(2) : back} s, lead (${a.lead.i},${a.lead.j}), rest ${JSON.stringify(info.rest)}`);
    check('L: the whole team has full hearts', a.hearts.length === 3 && a.hearts.every(Boolean), a.hearts.join());
    check('L: Big Ghost is still there and the candy is unchanged', a.boss && a.boss.i0 === 13 && !a.beaten && a.candy === info.candy, JSON.stringify({ boss: a.boss, beaten: a.beaten, candy: a.candy }));
  });
}
