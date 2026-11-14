// Scripted playthrough of the joined game (field -> page turn -> battle -> page turn -> field).
// node tools/play.mjs [--page Game/index.html | --page Game/dist/elliot-game.html] [--only F] [--shots Game/.shots/m2/join]
// Run F is the S1 -> S2 -> S3 route from a fresh game; run I the S4 -> S6 route (tools/play-late.mjs); with
// --shots they also save review screenshots there.
// Every run starts from a clean save (the save key is cleared before boot). The script drives window.__game
// only through press / move / hold / tick and reads state() / battle() / mode(). The real-time loop is frozen
// (__game.freeze) so every step is simulated and the result does not depend on the machine's speed.
// Prints one PASS/FAIL line per check; exits non-zero on any failure.
import { mkdir } from 'node:fs/promises';
import { serve, launch } from './chrome.mjs';
import { runLate } from './play-late.mjs';

const args = process.argv.slice(2);
const opt = { page: 'Game/index.html' };
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];

const SAVE_KEY = 'elliot-game-save-v2';
const results = [];
const check = (name, ok, got) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${got})`); };

// ---- in-page helpers (stringified into the page) ------------------------------------------------
const HELPERS = `
  window.__play = {
    g: window.__game,
    // ticks until mode() is m (or the time runs out); returns the simulated seconds it took, or -1
    until(m, seconds = 10) { const g = this.g; for (let t = 0; t < seconds; t += 1 / 60) { if (g.mode() === m) return t; g.tick(1 / 60); } return g.mode() === m ? seconds : -1; },
    // steers the lead toward the first patrolling creature until a battle starts; returns seconds or -1
    meet(seconds = 40) {
      const g = this.g;
      for (let t = 0; t < seconds; t += .1) {
        if (g.mode() !== 'field') return t;
        const s = g.state(), l = s.party[0], c = s.creatures.find(k => k.mode === 'patrol');
        if (!c) { g.tick(.1); continue; }
        let dx = c.x - l.x, dy = c.y - l.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        g.move(dx, dy, .1); g.tick(.1);
      }
      return g.mode() !== 'field' ? seconds : -1;
    },
    // lift, then play, then let the round play out (4 s); lastPhase keeps the battle's phase as last seen
    play(button) {
      const g = this.g; g.press(button); g.tick(.05); g.press(button);
      for (let t = 0; t < 4; t += 1 / 60) { g.tick(1 / 60); const b = g.battle(); if (b) this.lastPhase = b.phase; }
    },
    // steers the lead to (x, y) in tile units, a short move at a time; returns true when within 0.06
    walkTo(x, y, seconds = 15) {
      const g = this.g;
      for (let t = 0; t < seconds; t += 1 / 30) {
        const l = g.state().party[0]; let dx = x - l.x, dy = y - l.y; const d = Math.hypot(dx, dy);
        if (d < .06) return true;
        const k = Math.min(1, d / (4 / 30)) / d; g.move(dx * k, dy * k, 1 / 30); g.tick(1 / 30);
      }
      return false;
    },
    lead() { const l = this.g.state().party[0]; return { id: l.id, x: l.x, y: l.y, i: Math.floor(l.x), j: Math.floor(l.y), hearts: l.hearts, max: l.maxHearts }; },
    stage() { return this.g.fieldScene.stage.id; },
    party() { return this.g.state().party.map(m => m.id).join(','); },
    // walkTo that stops when the field is not on screen (a battle or a stage slide) instead of steering on
    go(x, y, seconds = 15) {
      const g = this.g;
      for (let t = 0; t < seconds; t += 1 / 30) {
        if (g.mode() !== 'field') return 'mode';
        const l = g.state().party[0]; let dx = x - l.x, dy = y - l.y; const d = Math.hypot(dx, dy);
        if (d < .06) return 'ok';
        const k = Math.min(1, d / (4 / 30)) / d; g.move(dx * k, dy * k, 1 / 30); g.tick(1 / 30);
      }
      return 'stuck';
    },
    // holds a direction until the stage changes, then lets the slide finish; returns the slide's seconds or -1
    exit(dx, dy, seconds = 6) {
      const g = this.g, from = this.stage();
      for (let t = 0; t < seconds; t += 1 / 30) { if (this.stage() !== from) break; if (g.mode() === 'field') g.move(dx, dy, 1 / 30); g.tick(1 / 30); }
      if (this.stage() === from) return -1;
      let s = 0; while (g.mode() === 'transition' && s < 2) { g.tick(1 / 60); s += 1 / 60; }
      return s;
    },
    // ticks until the action in progress lands (or a time limit)
    settle(seconds = 3) { const g = this.g; for (let t = 0; t < seconds && g.state().action; t += 1 / 60) g.tick(1 / 60); g.tick(.1); return !g.state().action; },
    // face a direction without moving far (a tap of the stick)
    face(dx, dy) { this.g.move(dx, dy, 1 / 60); this.g.tick(1 / 60); return this.g.state().party[0].facing; },
    bat() { const c = this.g.state().creatures.find(k => k.kind === 'bat'); return c && { mode: c.mode, x: c.x, y: c.y }; },
  };
  true`;

const { server, port } = await serve();
const browser = await launch();
const base = `http://127.0.0.1:${port}/${opt.page}`;
console.log(`play.mjs against ${opt.page}`);

async function boot(page, query = '', { clear = true } = {}) {
  if (clear) {                                          // clean save: clear the key, then boot again
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate(k => { try { localStorage.removeItem(k); } catch { /* blocked */ } }, SAVE_KEY);
  }
  await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'load' });
  await page.waitForFunction('window.__game && window.__game.ready', { timeout: 20000 });
  await page.evaluate(HELPERS);
  await page.evaluate('window.__game.freeze = true');
}
const ev = (page, js) => page.evaluate(js);

async function run(name, fn) {
  if (opt.only && !opt.only.split(',').includes(name)) return;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  try { await fn(page); } catch (e) { check(`${name}: ran without throwing`, false, e.message); }
  check(`${name}: no page errors`, errors.length === 0, errors.join('; ') || 'none');
  await page.close();
}

try {
  // ---- Run A: meet the bat, Claw x3, win -----------------------------------------------------
  await run('A', async page => {
    await boot(page);
    const before = await ev(page, '__game.state().candyCount');
    const met = await ev(page, '__play.meet()');
    const turn = await ev(page, `__game.mode()`);
    const t = await ev(page, `__play.until('battle', 2)`);
    check('A: walking to the bat starts a battle (via the page turn)', met >= 0 && turn === 'transition' && t >= 0, `met after ${met.toFixed(1)} s, then ${turn}, battle after ${t.toFixed(2)} s more`);
    const b0 = await ev(page, '(() => { const b = __game.battle(); return { enemy: b.enemy.id, round: b.round, hearts: b.party.map(m => m.id + m.hearts).join(" ") }; })()');
    check('A: the battle is against the bat at round 1', b0.enemy === 'bat' && b0.round === 1, JSON.stringify(b0));
    await ev(page, '__game.tick(1)');
    for (let i = 0; i < 3; i++) await ev(page, `__play.play('cross')`);
    const ph = await ev(page, '__play.lastPhase');
    check('A: Claw x3 wins', ph === 'won', `phase ${ph}`);
    const back = await ev(page, `__play.until('field', 6)`);
    const a = await ev(page, '({ bat: __play.bat(), lead: __play.lead(), candy: __game.state().candyCount, battle: __game.battle() })');
    check('A: back in the field', back >= 0 && a.battle === null, `after ${back.toFixed(2)} s, battle() ${JSON.stringify(a.battle)}`);
    check('A: the bat is asleep', a.bat.mode === 'asleep', a.bat.mode);
    check('A: the monster has 9 hearts', a.lead.id === 'monster' && a.lead.hearts === 9, `${a.lead.id} ${a.lead.hearts}`);
    check('A: the candy count went up by one', a.candy === before + 1, `${before} -> ${a.candy}`);
    const saved = await ev(page, `JSON.parse(localStorage.getItem('${SAVE_KEY}'))`);
    check('A: the save has no pending battle after the win', saved && !('pendingBattle' in saved) && saved.world.candyCount === a.candy, saved ? `pendingBattle ${JSON.stringify(saved.pendingBattle)}, candy ${saved.world.candyCount}` : 'no save');
  });

  // ---- Run B: party of one, lose on purpose ----------------------------------------------------
  await run('B', async page => {
    await boot(page, 'party=1');
    await ev(page, '__play.meet()');
    const t = await ev(page, `__play.until('battle', 2)`);
    check('B: the battle starts', t >= 0, `mode ${await ev(page, '__game.mode()')}`);
    await ev(page, '__game.tick(1)');
    let rounds = 0;
    for (; rounds < 40; rounds++) {                      // Open, Fold, Open, ...: the open monster takes the Bite
      const ph = await ev(page, '__game.battle().phase');
      if (ph !== 'choose') break;
      await ev(page, `__play.play('square')`);
    }
    const ph = await ev(page, '__play.lastPhase');
    check('B: Fold / Open every round loses', ph === 'lost', `phase ${ph} after ${rounds} rounds`);
    const back = await ev(page, `__play.until('field', 6)`);
    const b = await ev(page, '({ bat: __play.bat(), lead: __play.lead() })');
    check('B: back in the field', back >= 0, `after ${back.toFixed(2)} s`);
    check('B: the lead stands on the rest blanket (1,7)', b.lead.i === 1 && b.lead.j === 7, `tile (${b.lead.i},${b.lead.j})`);
    check('B: hearts are full', b.lead.hearts === b.lead.max, `${b.lead.hearts}/${b.lead.max}`);
    check('B: the bat is back on patrol', b.bat.mode === 'patrol', b.bat.mode);
  });

  // ---- Run C: reload mid-battle ------------------------------------------------------------------
  await run('C', async page => {
    await boot(page, 'fresh=1');
    await ev(page, '__play.walkTo(16.5, 4.5)');   // in the bat's sight, so it is a normal battle, not a sneak attack
    await ev(page, `__play.until('battle', 2)`);
    const goingIn = await ev(page, '__game.battle().party.map(m => m.id + ":" + m.hearts).join(" ")');
    await ev(page, '__game.tick(1)');
    await ev(page, `__play.play('square')`);             // open and take the Flap: the battle is now at round 2
    const mid = await ev(page, '(() => { const b = __game.battle(); return { round: b.round, hearts: b.party.map(m => m.id + ":" + m.hearts).join(" ") }; })()');
    const pending = await ev(page, `JSON.parse(localStorage.getItem('${SAVE_KEY}')).pendingBattle`);
    check('C: the save records the running battle', pending && pending.kind === 'bat' && typeof pending.creatureUid === 'string', JSON.stringify(pending));
    await boot(page, '', { clear: false });             // "close and reopen": a plain boot from the save
    const m0 = await ev(page, '__game.mode()');
    const t = await ev(page, `__play.until('battle', 2)`);
    const b = await ev(page, '(() => { const b = __game.battle(); return b && { enemy: b.enemy.id, round: b.round, hearts: b.party.map(m => m.id + ":" + m.hearts).join(" ") }; })()');
    check('C: after the reload the game comes back in the battle (page turn first)', m0 === 'transition' && t >= 0 && b && b.enemy === 'bat', `first mode ${m0}, battle ${JSON.stringify(b)}`);
    check('C: it restarts at round 1 with the going-in hearts', b && b.round === 1 && b.hearts === goingIn && mid.round === 2 && mid.hearts !== goingIn,
      `before reload: round ${mid.round}, ${mid.hearts}; after: round ${b && b.round}, ${b && b.hearts}; going in: ${goingIn}`);
  });

  // ---- Run D: hold R2 to run ------------------------------------------------------------------------
  await run('D', async page => {
    await boot(page);
    await ev(page, '__play.meet()');
    await ev(page, `__play.until('battle', 2)`);
    await ev(page, '__game.tick(1)');
    await ev(page, `__game.hold('r2', true)`);
    await ev(page, '__game.tick(1.2)');
    await ev(page, `__game.hold('r2', false)`);
    const ph = await ev(page, '__game.battle() && __game.battle().phase');
    const back = await ev(page, `__play.until('field', 4)`);
    const b1 = await ev(page, '__play.bat()');
    check('D: holding R2 for a second runs back to the field', ph === 'ran' && back >= 0, `phase ${ph}, field after ${back.toFixed(2)} s`);
    check('D: the bat ignores the team', b1.mode === 'ignore', b1.mode);
    await ev(page, '__game.tick(3.1)');
    const b2 = await ev(page, '({ bat: __play.bat(), mode: __game.mode() })');
    check('D: the bat patrols again after 3 s', b2.bat.mode === 'patrol' && b2.mode === 'field', `${b2.bat.mode}, mode ${b2.mode}`);
  });

  // ---- Run E: Eat the boulder at (20,1) and take the candy behind it ------------------------------
  await run('E', async page => {
    await boot(page, 'bat=asleep');                     // the bat sleeps at (6,2): the walk along row 5 cannot meet it
    const before = await ev(page, '__game.state().candyCount');
    const got = await ev(page, '__play.walkTo(20.5, 5.5) && __play.walkTo(20.5, 2.5)');
    const a = await ev(page, '__play.lead()');
    check('E: the monster walks to (20,2)', got && a.id === 'monster' && a.i === 20 && a.j === 2 && (await ev(page, '__game.mode()')) === 'field', `tile (${a.i},${a.j}), lead ${a.id}`);
    await ev(page, '__game.move(0, -1, .1); __game.tick(.1)');   // face back: nudges into the boulder
    const t0 = await ev(page, '({ target: __game.state().target, facing: __game.state().party[0].facing, form: __game.state().party[0].form })');
    check('E: facing back, the boulder is a ready Eat target', t0.facing === 'back' && t0.target && t0.target.i === 20 && t0.target.j === 1 && t0.target.ready === true && t0.form === 'folded', JSON.stringify(t0));
    await ev(page, `__game.press('cross'); __game.tick(1 / 60)`);
    const mid = await ev(page, '__game.state().boulders.length');
    await ev(page, '__game.tick(.6)');
    const e = await ev(page, '({ boulders: __game.state().boulders, form: __game.state().party[0].form, target: __game.state().target })');
    check('E: one Cross unfolds, then eats after the hinge', mid === 1 && e.boulders.length === 0 && e.form === 'open' && e.target === null, `boulders during the hinge ${mid}, after ${e.boulders.length}, form ${e.form}, target ${JSON.stringify(e.target)}`);
    await ev(page, '__game.move(0, -1, 1); __game.tick(1)');
    const after = await ev(page, '({ candy: __game.state().candyCount, lead: __play.lead() })');
    check('E: walking up takes the candy at (20,0)', after.candy === before + 1 && after.lead.j === 0, `${before} -> ${after.candy}, lead at (${after.lead.i},${after.lead.j})`);
    const saved = await ev(page, `JSON.parse(localStorage.getItem('${SAVE_KEY}'))`);
    check('E: the autosave has the boulder gone and the candy taken', saved && saved.world.stages.S1.boulders.length === 0 && saved.world.stages.S1.candyTaken.some(p => p[0] === 20 && p[1] === 0), saved ? `boulders ${JSON.stringify(saved.world.stages.S1.boulders)}, candyTaken ${JSON.stringify(saved.world.stages.S1.candyTaken)}` : 'no save');
  });

  // ---- Run F: the real route from a fresh game, S1 -> S2 (Heartfin joins, Bridge) -> S3 (Scoops joins,
  // Push, Reach) -> S3's right exit, with a save and reload in the middle. Inputs only.
  await run('F', async page => {
    const shot = async name => { if (!opt.shots) return; await mkdir(opt.shots, { recursive: true }); await page.screenshot({ path: `${opt.shots}/${name}.png` }); };
    const st = () => ev(page, '({ stage: __play.stage(), party: __play.party(), candy: __game.state().candyCount, lead: __play.lead(), mode: __game.mode() })');
    await boot(page);
    let s = await st();
    check('F: a fresh game is the monster alone in S1', s.stage === 'S1' && s.party === 'monster' && s.candy === 0, JSON.stringify(s));
    // S1: walk the path along the bottom rows, clear of the bat's loop, then out by the right exit
    const w1 = await ev(page, `[__play.go(1.5, 8.5), __play.go(25.5, 8.5), __play.go(25.5, 5.5)].join()`);
    const t1 = await ev(page, '__play.exit(1, 0)');
    s = await st();
    check('F: S1 path to the right exit slides to S2 at its left entrance', w1 === 'ok,ok,ok' && t1 > .3 && t1 < .5 && s.stage === 'S2' && s.lead.i === 1 && s.mode === 'field', `walk ${w1}, slide ${t1.toFixed(2)} s, ${JSON.stringify(s)}`);
    const saved1 = await ev(page, `JSON.parse(localStorage.getItem('${SAVE_KEY}'))`);
    check('F: arriving in S2 autosaves', saved1 && saved1.world.stageId === 'S2', saved1 ? saved1.world.stageId : 'no save');
    await ev(page, '__game.tick(.3)'); await shot('1-arrive-s2');
    // S2: touch Heartfin on the bank at (12,6)
    const w2 = await ev(page, `[__play.go(10.5, 6.5), __play.go(11.6, 6.5, 2)].join()`);
    await ev(page, `__game.move(1, 0, .3); __game.tick(.3)`); await shot('2-join-heartfin');
    s = await st();
    check('F: touching Heartfin makes it join', s.party === 'monster,fish' && s.stage === 'S2', `walk ${w2}, ${JSON.stringify(s)}`);
    // Bridge: from (15,6) facing back, Heartfin reaches the island candy at (15,2)
    await ev(page, `__play.go(15.5, 6.5)`);
    await ev(page, `__game.press('r1'); __game.tick(.1)`);
    const f = await ev(page, `__play.face(0, -1)`);
    const tg = await ev(page, '__game.state().target');
    await ev(page, `__game.press('cross'); __game.tick(.5 + .2)`);
    const a1 = await ev(page, '__game.state().action'); await shot('3-bridge-stretch');
    await ev(page, '__game.tick(.45)'); await shot('4-bridge-crossing');
    await ev(page, '__play.settle()');
    s = await st();
    check('F: Heartfin bridges to the island and the candy is taken', f === 'back' && tg && tg.power === 'bridge' && a1 && a1.kind === 'bridge' && !a1.short && s.lead.id === 'fish' && s.lead.i === 15 && s.lead.j === 2 && s.candy === 1,
      `facing ${f}, target ${JSON.stringify(tg)}, action ${JSON.stringify(a1)}, ${JSON.stringify(s)}`);
    // and back to the bank
    await ev(page, `__play.face(0, 1); __game.press('cross'); __game.tick(.1)`);
    await ev(page, '__play.settle()');
    s = await st();
    check('F: bridging back lands on the bank at (15,6)', s.lead.i === 15 && s.lead.j === 6, JSON.stringify(s));
    // S2 right exit, along row 6 (the spider walks row 8)
    const w3 = await ev(page, `[__play.go(33.5, 6.5)].join()`);
    const t3 = await ev(page, '__play.exit(1, 0)');
    s = await st();
    check('F: S2 right exit slides to S3', w3 === 'ok' && t3 > .3 && s.stage === 'S3' && s.lead.i === 1 && s.party === 'fish,monster', `walk ${w3}, slide ${t3}, ${JSON.stringify(s)}`);
    await ev(page, '__game.tick(.3)'); await shot('5-arrive-s3');
    // S3: touch Scoops at (6,3)
    const w4 = await ev(page, `[__play.go(6.5, 5.5), __play.go(6.5, 4.4, 2)].join()`);
    await ev(page, `__game.move(0, -1, .3); __game.tick(.3)`);
    s = await st();
    check('F: touching Scoops makes it join', s.party === 'fish,monster,icecream', `walk ${w4}, ${JSON.stringify(s)}`);
    // Push: Scoops leads, pushes the boulder east from (9,2)
    await ev(page, `__game.press('l1'); __game.tick(.1)`);
    await ev(page, `__play.go(8.5, 2.5); __play.go(9.5, 2.5)`);
    await ev(page, `__play.face(1, 0)`);
    const tg2 = await ev(page, '__game.state().target');
    await ev(page, `__game.press('cross'); __game.tick(.5 + .2)`);
    const a2 = await ev(page, '__game.state().action'); await shot('6-push-slide');
    await ev(page, '__play.settle()');
    const b = await ev(page, '__game.state().boulders');
    check('F: Scoops pushes the boulder from (10,2) to (11,2)', tg2 && tg2.power === 'push' && a2 && a2.kind === 'push' && !a2.blocked && b.length === 1 && b[0].i === 11 && b[0].j === 2,
      `target ${JSON.stringify(tg2)}, action ${JSON.stringify(a2)}, boulders ${JSON.stringify(b)}`);
    const w5 = await ev(page, `[__play.go(10.5, 2.5), __play.go(10.5, .5)].join()`);
    s = await st();
    check('F: the alcove candy at (10,0) is taken', s.candy === 2 && s.lead.i === 10 && s.lead.j === 0, `walk ${w5}, ${JSON.stringify(s)}`);
    // Reach: the candy post at (14,1)
    await ev(page, `__play.go(10.5, 3.5); __play.go(13.5, 3.5); __play.go(13.5, 1.5)`);
    await ev(page, `__play.face(1, 0)`);
    const tg3 = await ev(page, '__game.state().target');
    await ev(page, `__game.press('cross'); __game.tick(.1)`);
    for (let k = 0; k < 40 && !(await ev(page, '(__game.state().action || {}).u > .45')); k++) await ev(page, '__game.tick(1 / 60)');
    const a3 = await ev(page, '__game.state().action'); await shot('7-reach-stretch');
    await ev(page, '__play.settle()');
    s = await st();
    const post = await ev(page, '__game.state().posts[0]');
    check('F: Scoops reaches the post candy', tg3 && tg3.power === 'reach' && a3 && a3.kind === 'reach' && post.taken && s.candy === 3, `target ${JSON.stringify(tg3)}, action ${JSON.stringify(a3)}, post ${JSON.stringify(post)}, ${JSON.stringify(s)}`);
    // Save, close and reopen: the World comes back
    await ev(page, '__game.fieldScene.save()');
    const before = await ev(page, `(() => { const w = JSON.parse(localStorage.getItem('${SAVE_KEY}')).world; return JSON.stringify(w.stages) + "|" + w.candyCount + "|" + w.party.map(m => m.id).join(); })()`);
    await boot(page, '', { clear: false });
    s = await st();
    const after = await ev(page, 'JSON.stringify(__game.fieldScene.world.stages) + "|" + __game.fieldScene.world.candyCount + "|" + __game.fieldScene.world.party.map(m => m.id).join()');
    const w = await ev(page, '(() => { const m = __game.fieldScene.world.stages; return { s1: !!m.S1, s2candy: m.S2.candyTaken, s3: m.S3 }; })()');
    check('F: after a reload the World is restored (stage, party, candy, S2 candy taken, S3 boulder moved, post taken)',
      s.stage === 'S3' && s.party === 'icecream,fish,monster' && s.candy === 3 && s.lead.i === 13 && s.lead.j === 1 && w.s1 && w.s2candy.some(p => p[0] === 15 && p[1] === 2)
      && w.s3.boulders.length === 1 && w.s3.boulders[0][0] === 11 && w.s3.postsTaken.length === 1 && w.s3.joined.includes('icecream'),
      `${JSON.stringify(s)}, ${JSON.stringify(w)}`);
    check('F: the reloaded World matches the saved one', before === after, before === after ? 'same' : `${before}\n   vs ${after}`);
    // Back to S2 and return: S2 remembers its candy and Heartfin stays joined
    const t6 = await ev(page, `__play.go(13.5, 2.5); __play.go(1.5, 2.5); __play.go(1.5, 5.5); __play.exit(-1, 0)`);
    s = await st();
    const s2 = await ev(page, '({ island: __game.state().candy.find(c => c.i === 15 && c.j === 2), friends: __game.state().friends.length })');
    check('F: walking back left arrives in S2 at its right entrance, island candy still taken, no fish waiting', t6 > .3 && s.stage === 'S2' && s.lead.i === 34 && s2.island && s2.island.taken && s2.friends === 0 && s.candy === 3, `${JSON.stringify(s)}, ${JSON.stringify(s2)}`);
    const t7 = await ev(page, '__play.exit(1, 0)');
    s = await st();
    const b3 = await ev(page, '__game.state().boulders');
    check('F: and back into S3 with the boulder still at (11,2)', t7 > .3 && s.stage === 'S3' && b3.length === 1 && b3[0].i === 11, `${JSON.stringify(s)}, ${JSON.stringify(b3)}`);
    // S3's right exit, along the top rows (the spider walks row 7)
    const w8 = await ev(page, `[__play.go(1.5, 4.5), __play.go(12.5, 4.5), __play.go(12.5, 2.5), __play.go(29.5, 2.5), __play.go(29.5, 5.5)].join()`);
    const t8 = await ev(page, '__play.exit(1, 0)');
    s = await st();
    check('F: S3 right exit is reached (the team slides on to S4)', t8 > .3 && s.stage === 'S4' && s.party === 'icecream,fish,monster' && s.candy === 3, `walk ${w8}, slide ${t8}, ${JSON.stringify(s)}`);
    const battles = await ev(page, '__game.state().creatures.length');
    void battles;
  });

  // ---- Run G: the S6 door leads into the ghost house (S7)
  await run('G', async page => {
    await boot(page, 'stage=S6&x=27.5&y=4.5&party=3');
    await ev(page, '__game.move(0, -1, .5); __game.tick(.5); __game.move(0, 0, 0); __game.tick(1)');
    const g = await ev(page, '({ stage: __play.stage(), mode: __game.mode(), lead: __play.lead() })');
    check('G: walking up to the S6 door arrives in the ghost house', g.stage === 'S7' && g.mode === 'field', JSON.stringify(g));
  });

  // ---- Run H: a short bridge flops back (nothing moves); the S2 spider spotting the lead shows a "!"
  await run('H', async page => {
    await boot(page, 'stage=S2&lead=fish&x=14.5&y=6.5');
    await ev(page, `__play.face(0, -1); __game.press('cross'); __game.tick(.1)`);
    const a = await ev(page, '__game.state().action');
    await ev(page, '__play.settle()');
    const l = await ev(page, '__play.lead()');
    check('H: from (14,6) the bridge falls short and the fish stays on the bank', a && a.kind === 'bridge' && a.short && l.i === 14 && l.j === 6, `${JSON.stringify(a)}, lead (${l.i},${l.j})`);
    let cues = [];
    for (let k = 0; k < 60 && !cues.includes('bang') && (await ev(page, '__game.mode()')) === 'field'; k++) {
      await ev(page, '(() => { const s = __game.state(), l = s.party[0], c = s.creatures[0]; __game.move(Math.sign(c.x - l.x) * .6, Math.sign(c.y - l.y) * .6, .1); __game.tick(.1); })()');
      cues = await ev(page, '__game.fieldScene.cues');
    }
    check('H: walking toward the spider: it spots the lead and a "!" shows', cues.includes('bang'), JSON.stringify(cues));
  });

  // ---- Run I: S3's right exit -> S4 (Puzzle 1) -> S5 -> S6 (Puzzle 2) -> the pumpkin door (tools/play-late.mjs)
  await runLate({ run, boot, ev, check, opt });
} finally {
  await browser.close(); server.close();
}
const failed = results.filter(ok => !ok).length;
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
