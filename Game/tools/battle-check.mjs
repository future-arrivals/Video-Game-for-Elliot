// Scripted checks of the battle screen through Game/dev/battle.html (window.__game: press, hold, tick, state).
// node tools/battle-check.mjs   -> prints one line per check, exits non-zero if any fails.
import { serve, launch } from './chrome.mjs';

const CHECKS = [
  ['Claw x3 against the bat wins with the monster on 9 hearts', 'enemy=bat&lead=monster&party=3', async g => {
    g.tick(1);
    for (let i = 0; i < 3; i++) { g.press('cross'); g.tick(.05); g.press('cross'); g.tick(4); }
    const s = g.state(), mon = s.party.find(m => m.id === 'monster');
    g.tick(2.5);
    const r = g.scene && window.__game.result;
    return { ok: s.phase === 'won' && mon.hearts === 9 && r && r.outcome === 'won' && r.hearts.monster === 9,
      got: `phase ${s.phase}, monster ${mon.hearts}, onDone ${JSON.stringify(r)}` };
  }],
  ['Triangle while folded (an empty slot) changes nothing', 'enemy=bat&lead=monster&party=3', async g => {
    g.tick(1);
    const before = JSON.stringify(g.state());
    g.press('triangle'); const r = g.tick(.5);
    return { ok: JSON.stringify(g.state()) === before && !r.playing && r.lifted === null, got: JSON.stringify(r) };
  }],
  ['A press during playback is ignored, not queued', 'enemy=bat&lead=monster&party=3', async g => {
    g.tick(1); g.press('cross'); g.tick(.05); g.press('cross'); g.tick(.2);
    g.press('cross'); g.tick(.05); g.press('cross'); g.tick(4);
    const s = g.state();
    return { ok: s.round === 2 && s.enemy.hearts === 3, got: `round ${s.round}, bat ${s.enemy.hearts}` };
  }],
  ['First press lifts and previews; Quick play plays on one press', 'enemy=bat&lead=monster&party=3&quick=1', async g => {
    g.tick(1); g.press('cross'); g.tick(4);
    const s = g.state();
    return { ok: s.round === 2 && s.enemy.hearts === 3, got: `round ${s.round}, bat ${s.enemy.hearts}` };
  }],
  ['Lifting Fold previews the intent digit and own heart loss', 'enemy=bat&lead=monster&party=3', async g => {
    g.tick(1); g.press('square'); const r = g.tick(.1);
    const p = r.lifted && r.lifted.preview;
    return { ok: !!p && p.intentNumber === 1 && p.selfHeartsLost === 1 && g.state().round === 1, got: JSON.stringify(r.lifted) };
  }],
  ['Losing the last character ends lost and calls onDone', 'enemy=bat&lead=monster&party=1&hearts=1', async g => {
    g.tick(1); g.press('square'); g.tick(.05); g.press('square'); g.tick(4);
    const ph = g.state().phase; g.tick(3);
    const r = window.__game.result;
    return { ok: ph === 'lost' && r && r.outcome === 'lost' && r.hearts.monster === 0, got: `phase ${ph}, onDone ${JSON.stringify(r)}` };
  }],
  ['Holding R2 for 1 s runs', 'enemy=bat&lead=monster&party=3', async g => {
    g.tick(1); g.hold('r2', true); g.tick(.5);
    const mid = g.state().phase; g.tick(.6); g.hold('r2', false);
    const ph = g.state().phase; g.tick(1.5);
    const r = window.__game.result;
    return { ok: mid === 'choose' && ph === 'ran' && r && r.outcome === 'ran', got: `at 0.5 s ${mid}, after ${ph}, onDone ${JSON.stringify(r)}` };
  }],
  ['Knocked out: only teammates answer, then the pick comes in', 'enemy=bat&lead=monster&party=3&hearts=1', async g => {
    g.tick(1); g.press('square'); g.tick(.05); g.press('square'); g.tick(4);
    const ph = g.state().phase;
    const before = JSON.stringify(g.state());
    g.press('cross'); g.tick(.2);
    const same = JSON.stringify(g.state()) === before;
    g.press('r1'); g.tick(.05); g.press('r1'); g.tick(2);
    const s = g.state();
    return { ok: ph === 'chooseNext' && same && s.phase === 'choose' && s.party[s.active].id === 'fish', got: `${ph}, cross ignored ${same}, now ${s.phase} ${s.party[s.active].id}` };
  }],
  ['Gulp stores the Flap and shows the tummy', 'enemy=bat&lead=monster&party=3', async g => {
    g.tick(1); g.press('square'); g.tick(.05); g.press('square'); g.tick(4);
    g.press('circle'); g.tick(.05); g.press('circle'); g.tick(4);
    const m = g.state().party[0];
    return { ok: m.form === 'open' && m.tummy === 1 && m.hearts === 8, got: `form ${m.form}, tummy ${m.tummy}, hearts ${m.hearts}` };
  }],
  ['Spider Web makes Fold illegal next turn (wiggle only)', 'enemy=spider&lead=monster&party=3', async g => {
    g.tick(1);
    for (let i = 0; i < 3; i++) { g.press('triangle'); g.tick(.05); g.press('circle'); g.tick(.05); g.press('circle'); g.tick(4); }
    const s1 = g.state(); const before = JSON.stringify(s1);
    g.press('square'); g.tick(.3); g.press('square'); g.tick(.3);
    return { ok: s1.sticky === true && JSON.stringify(g.state()) === before, got: `sticky ${s1.sticky}, round ${s1.round}` };
  }],
  ['Tapping a card twice plays it like its button', 'enemy=bat&lead=monster&party=3', async g => {
    g.tick(1); g.tap(664, 352); const r = g.tick(.1); g.tap(664, 352); g.tick(4);
    const s = g.state();
    return { ok: r.lifted && r.lifted.button === 'cross' && s.round === 2 && s.enemy.hearts === 3, got: `lifted ${r.lifted && r.lifted.button}, round ${s.round}, bat ${s.enemy.hearts}` };
  }],
  ['Tapping the small R1 tag lifts the switch; a tap on the empty Triangle slot does nothing', 'enemy=bat&lead=monster&party=3', async g => {
    const { LAYOUT, CARD_W, CARD_H } = await import('/Game/src/render/battle/layout.js');
    g.tick(1);
    const t = LAYOUT.cards.triangle; g.tap(t.x + CARD_W / 2, t.y + CARD_H / 2); const e = g.tick(.1);
    const r = LAYOUT.r1; g.tap(r.x + r.w / 2, r.y + r.h / 2); const s = g.tick(.1);
    return { ok: e.lifted === null && s.lifted && s.lifted.button === 'r1' && s.lifted.action.t === 'switch',
      got: `triangle tap lifted ${JSON.stringify(e.lifted)}, R1 tap lifted ${s.lifted && s.lifted.button}` };
  }],
  ['Lead knocked out (chooseNext): a tap where the Cross card was changes nothing', 'enemy=bat&lead=monster&party=3&hearts=1', async g => {
    const { LAYOUT, CARD_W, CARD_H } = await import('/Game/src/render/battle/layout.js');
    g.tick(1); g.press('square'); g.tick(.05); g.press('square'); g.tick(4);
    const s0 = g.state(); const before = JSON.stringify(s0);
    const c = LAYOUT.cards.cross; g.tap(c.x + CARD_W / 2, c.y + CARD_H / 2); const r = g.tick(.3);
    g.tap(c.x + CARD_W / 2, c.y + CARD_H / 2); const r2 = g.tick(.3);
    return { ok: s0.phase === 'chooseNext' && JSON.stringify(g.state()) === before && r.lifted === null && r2.lifted === null && !r2.playing,
      got: `phase ${s0.phase}, lifted ${JSON.stringify(r2.lifted)}, state ${JSON.stringify(g.state()) === before ? 'unchanged' : 'changed'}` };
  }],
  ['Boss: no Run (R2 hold does nothing), Claw x3 clears the Little Ghosts, phase 2 on 11 hearts', 'enemy=bigghost&lead=monster&party=3', async g => {
    g.tick(1); g.hold('r2', true); g.tick(1.3); g.hold('r2', false);
    const ph0 = g.state().phase;
    for (let i = 0; i < 3; i++) { g.press('cross'); g.tick(.05); g.press('cross'); g.tick(5); }
    const s = g.state(), mon = s.party[0];
    return { ok: ph0 === 'choose' && !s.canRun && s.boss.phase === 2 && s.boss.littles === 0 && s.enemy.hearts === 11 && s.pointer === 0 && mon.hearts === 7 && s.phase === 'choose',
      got: `after R2 ${ph0}, boss phase ${s.boss.phase}, littles ${s.boss.littles}, hearts ${s.enemy.hearts}, card ${s.enemy.strip[s.pointer].word}, monster ${mon.hearts}` };
  }],
  ['Layout: the card diamond clears the enemy and its disc; tap targets at least 64 px', 'enemy=bat', async g => {
    const { LAYOUT, CARD_W, CARD_H, CARD_PAD } = await import('/Game/src/render/battle/layout.js');
    const D = LAYOUT.disc, E = LAYOUT.enemy, cards = Object.values(LAYOUT.cards);
    const top = Math.min(...cards.map(c => c.y)) - 9;          // a lifted card rises 9 px
    const discBottom = D.y + D.ry + 6, enemyBottom = E.y;       // disc plus its shadow; the enemy stands on the disc
    const small = [];
    if (CARD_W + 2 * CARD_PAD < 64 || CARD_H + 2 * CARD_PAD < 64) small.push(`card ${CARD_W + 2 * CARD_PAD}x${CARD_H + 2 * CARD_PAD}`);
    for (const k of ['l1Hit', 'r1Hit']) if (LAYOUT[k].w < 64 || LAYOUT[k].h < 64) small.push(k);
    if (LAYOUT.run.hit * 2 < 64) small.push('run');
    return { ok: top > discBottom && top > enemyBottom && !small.length, got: `cards from y ${top}, disc to ${discBottom}, too small: ${small.join(', ') || 'none'}` };
  }],
];

const { server, port } = await serve();
const browser = await launch();
let failed = 0;
try {
  for (const [name, query, fn] of CHECKS) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/Game/dev/battle.html?${query}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__game && window.__game.ready', { timeout: 20000 });
    let res;
    try { res = await page.evaluate(`(${fn.toString()})(window.__game)`); } catch (e) { res = { ok: false, got: 'threw: ' + e.message }; }
    if (errors.length) res = { ok: false, got: res.got + ' | page errors: ' + errors.join('; ') };
    if (!res.ok) failed++;
    console.log(`${res.ok ? 'PASS' : 'FAIL'}  ${name}  (${res.got})`);
    await page.close();
  }
} finally {
  await browser.close(); server.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
