// Big Ghost boss battle rules (slice-design section 7): the four worked examples replayed round by round, plus the phase-1 rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { createBattle, legalActions, preview, resolve, cards } from '../src/battle/battle.js';

const boss = (party, lead = 0) => createBattle({ data, party: party.map((id) => ({ id })), lead, enemy: 'bigghost' });

function act(state, name) {
  if (name === 'Open' || name === 'Fold') return { t: 'fold' };
  if (name === 'Run') return { t: 'run' };
  if (name.startsWith('Team:')) return { t: 'switch', to: state.party.findIndex((m) => m.id === name.slice(5)) };
  const card = cards(state).moves.find((m) => m.word === name);
  assert.ok(card, `no move card ${name}`);
  return { t: 'move', slot: card.slot };
}
function play(state, name) {
  const out = resolve(state, act(state, name));
  assert.notDeepEqual(out.events, [{ t: 'illegal' }], `${name} was illegal`);
  return out;
}

// rows: [card word, action, active member id, its hearts, boss: 'nLG' (Little Ghosts left) or Big Ghost's hearts]
function replay(party, rows) {
  let s = boss(party);
  rows.forEach(([word, action, id, hearts, b], i) => {
    const r = `round ${i + 1}`;
    assert.equal(s.enemy.strip[s.pointer].word, word, `${r}: card`);
    s = play(s, action).state;
    const m = s.party[s.active];
    assert.equal(m.id, id, `${r}: active`);
    assert.equal(m.hearts, hearts, `${r}: ${id} hearts`);
    if (typeof b === 'string') { assert.equal(s.boss.phase, 1, `${r}: phase`); assert.equal(s.boss.littles, Number(b[0]), `${r}: Little Ghosts`); }
    else { assert.equal(s.boss.phase, 2, `${r}: phase`); assert.equal(s.enemy.hearts, b, `${r}: Big Ghost hearts`); }
  });
  return s;
}

test('Solo Ice Cream wins with 6 of 10', () => {
  const s = replay(['icecream'], [
    ['Blow', 'Bonk', 'icecream', 10, '2LG'],
    ['Blow', 'Bonk', 'icecream', 10, '1LG'],
    ['Call', 'Bonk', 'icecream', 10, 11],
    ['Curl', 'Open', 'icecream', 10, 11],
    ['Swoop', 'Drop', 'icecream', 9, 6],
    ['Howl', 'Smash', 'icecream', 6, 1],
    ['Nap', 'Bonk', 'icecream', 6, 0],
  ]);
  assert.equal(s.phase, 'won');
});

test('Solo Fish wins with 3 of 8', () => {
  const s = replay(['fish'], [
    ['Blow', 'Splash', 'fish', 8, '2LG'],
    ['Blow', 'Splash', 'fish', 8, '1LG'],
    ['Call', 'Splash', 'fish', 8, 11],
    ['Curl', 'Open', 'fish', 8, 11],
    ['Swoop', 'Slap', 'fish', 6, 7],
    ['Howl', 'Love', 'fish', 3, 7],
    ['Nap', 'Slap', 'fish', 3, 4],
    ['Curl', 'Slap', 'fish', 3, 2],
    ['Swoop', 'Slap', 'fish', 3, 0],
  ]);
  assert.equal(s.phase, 'won');
});

test('Solo Monster wins with 4 of 9 (Gulp the Howl, Burp it back)', () => {
  let s = replay(['monster'], [
    ['Blow', 'Claw', 'monster', 8, '2LG'],
    ['Blow', 'Claw', 'monster', 7, '1LG'],
    ['Call', 'Claw', 'monster', 7, 11],
    ['Curl', 'Open', 'monster', 7, 11],
    ['Swoop', 'Chomp', 'monster', 4, 8],
  ]);
  assert.equal(cards(s).moves.find((m) => m.word === 'Gulp').number, 6, 'Gulp bubble shows 6');
  s = play(s, 'Gulp').state;
  assert.equal(s.party[0].tummy, 6); assert.equal(s.party[0].hearts, 4); assert.equal(s.enemy.hearts, 8);
  s = play(s, 'Burp').state; assert.equal(s.enemy.hearts, 3); assert.equal(s.party[0].hearts, 4);
  s = play(s, 'Chomp').state; assert.equal(s.enemy.hearts, 2); assert.equal(s.party[0].hearts, 4);
  s = play(s, 'Chomp').state; assert.equal(s.enemy.hearts, 0); assert.equal(s.party[0].hearts, 4);
  assert.equal(s.phase, 'won');
});

test('Team: Monster leads, switches to Ice Cream, wins (IC 6, Monster 7, Fish 8)', () => {
  const s = replay(['monster', 'icecream', 'fish'], [
    ['Blow', 'Claw', 'monster', 8, '2LG'],
    ['Blow', 'Claw', 'monster', 7, '1LG'],
    ['Call', 'Claw', 'monster', 7, 11],
    ['Curl', 'Team:icecream', 'icecream', 10, 11],
    ['Swoop', 'Open', 'icecream', 9, 11],
    ['Howl', 'Smash', 'icecream', 6, 5],
    ['Nap', 'Lift', 'icecream', 6, 5],          // Smash left Ice Cream folded, so Lift is on the cards
    ['Curl', 'Open', 'icecream', 6, 5],
    ['Swoop', 'Drop', 'icecream', 6, 0],
  ]);
  assert.equal(s.phase, 'won');
  assert.deepEqual(s.party.map((m) => m.hearts), [7, 6, 8]);
});

test('phase 1: extra damage on a Little Ghost is lost, Big Ghost cannot be hit', () => {
  let s = boss(['icecream']);
  s = play(s, 'Open').state;                      // Fresh ready (Blow: 1 - 1 type = 0)
  const { state, events } = play(s, 'Drop');      // 3 + 1 Fresh + 1 type = 5 on a 1-heart Little Ghost
  const hit = events.find((e) => e.t === 'little');
  assert.deepEqual([hit.amount, hit.gone, hit.left], [5, true, 2]);
  assert.equal(state.boss.littles, 2);
  assert.equal(state.enemy.hearts, 11);
  assert.ok(!events.some((e) => e.t === 'damage' && e.target === 'enemy'));
  assert.equal(preview(s, act(s, 'Drop')).enemyHeartsLost, 0);
  assert.equal(preview(s, act(s, 'Drop')).littlesLost, 1);
});

test('phase 1: Little Ghosts never fold, so a folded-move number is not reduced', () => {
  const s = boss(['fish']);
  assert.equal(cards(s).moves.find((m) => m.word === 'Splash').number, 1);
  assert.deepEqual(cards(s).boss, { phase: 1, littles: 3, maxLittles: 3 });
});

test('Call brings one Little Ghost back when fewer than 3 are left', () => {
  let s = boss(['icecream']);
  s = play(s, 'Bonk').state;                      // 2 left
  s = play(s, 'Lift').state;                      // 2 left
  assert.equal(s.enemy.strip[s.pointer].word, 'Call');
  const { state, events } = play(s, 'Open');
  assert.equal(state.boss.littles, 3);
  assert.deepEqual(events.find((e) => e.t === 'littleBack'), { t: 'littleBack', left: 3 });
  // with all 3 left, Call does nothing
  let f = boss(['fish']);
  f = play(f, 'Hug').state; f = play(f, 'Hug').state;
  const r = play(f, 'Hug');
  assert.equal(r.state.boss.littles, 3);
  assert.ok(!r.events.some((e) => e.t === 'littleBack'));
});

test('running is refused in the boss fight', () => {
  const s = boss(['monster', 'fish', 'icecream']);
  assert.equal(s.canRun, false);
  assert.ok(!legalActions(s).some((a) => a.t === 'run'));
  assert.deepEqual(resolve(s, { t: 'run' }).events, [{ t: 'illegal' }]);
  assert.equal(cards(s).canRun, false);
});

test('the boss card is skipped on the phase change; phase 2 starts at Curl', () => {
  let s = boss(['monster']);
  s = play(s, 'Claw').state; s = play(s, 'Claw').state;        // 1 left, next card Call
  const { state, events } = play(s, 'Claw');
  assert.ok(!events.some((e) => e.t === 'enemyCard'), 'no card played');
  assert.ok(!events.some((e) => e.t === 'littleBack'));
  const kinds = events.map((e) => e.t);
  assert.ok(kinds.indexOf('little') < kinds.indexOf('bossPhase'));
  assert.deepEqual(events.find((e) => e.t === 'bossPhase'), { t: 'bossPhase', phase: 2 });
  assert.equal(state.boss.phase, 2);
  assert.equal(state.enemy.hearts, 11);
  assert.deepEqual(state.enemy.strip.map((c) => c.word), ['Curl', 'Swoop', 'Howl', 'Nap']);
  assert.equal(state.pointer, 0);
  assert.equal(state.round, 4);
  assert.equal(state.phase, 'choose');
  // also when the last one goes on a Blow card: Lift, Bonk, Bonk (Call brings one back), Bonk, Bonk
  let t = boss(['icecream']);
  for (const n of ['Lift', 'Bonk', 'Bonk']) t = play(t, n).state;
  assert.deepEqual([t.boss.phase, t.boss.littles], [1, 2]);
  t = play(t, 'Bonk').state;
  const last = play(t, 'Bonk');
  assert.equal(t.enemy.strip[t.pointer].word, 'Blow');
  assert.equal(last.state.boss.phase, 2);
  assert.ok(!last.events.some((e) => e.t === 'enemyCard' || (e.t === 'damage' && e.target === 'player')));
});
