// Scripted playthrough of the joined game (field -> page turn -> battle -> page turn -> field).
// node tools/play.mjs [--page Game/index.html | --page Game/dist/elliot-game.html]
// Every run starts from a clean save (the save key is cleared before boot). The script drives window.__game
// only through press / move / hold / tick and reads state() / battle() / mode(). The real-time loop is frozen
// (__game.freeze) so every step is simulated and the result does not depend on the machine's speed.
// Prints one PASS/FAIL line per check; exits non-zero on any failure.
import { serve, launch } from './chrome.mjs';

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
} finally {
  await browser.close(); server.close();
}
const failed = results.filter(ok => !ok).length;
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
