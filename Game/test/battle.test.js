import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/slice.gen.js';
import { typeBonus, finalDamage } from '../src/battle/rules.js';
import { createBattle, legalActions, preview, resolve, cards } from '../src/battle/battle.js';

// ---- helpers ---------------------------------------------------------------

const BOSS = {
  id: 'bigghost', type: 'spooky', hearts: 11,
  strip: [
    { word: 'Curl', form: 'folded', attack: 0 },
    { word: 'Swoop', form: 'open', attack: 2 },
    { word: 'Howl', form: 'open', attack: 5 },
    { word: 'Nap', form: 'open', attack: 0 },
  ],
};

const deepFreeze = (o) => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};

// Play an action by name: a move word ('Claw'), 'Open' / 'Fold', 'Run',
// or 'Team:<id>'. Asserts the action is legal and that resolve never mutates.
function play(state, name) {
  let action;
  if (name === 'Open' || name === 'Fold') action = { t: 'fold' };
  else if (name === 'Run') action = { t: 'run' };
  else if (name.startsWith('Team:')) {
    action = { t: 'switch', to: state.party.findIndex((m) => m.id === name.slice(5)) };
  } else {
    const card = cards(state).moves.find((m) => m.word === name);
    assert.ok(card, `no move card ${name}`);
    action = { t: 'move', slot: card.slot };
  }
  const before = JSON.stringify(state);
  deepFreeze(state);
  const out = resolve(state, action);
  assert.equal(JSON.stringify(state), before, 'resolve mutated its input');
  assert.notDeepEqual(out.events, [{ t: 'illegal' }], `${name} was illegal`);
  return out;
}

function runLine(state, names) {
  const enemy = [state.enemy.hearts];
  const all = [];
  for (const n of names) {
    const out = play(state, n);
    state = out.state;
    all.push(out.events);
    enemy.push(state.enemy.hearts);
  }
  return { state, enemy, events: all };
}

const activeOf = (s) => s.party[s.active];
const has = (acts, t) => acts.some((a) => a.t === t);

// ---- rules -----------------------------------------------------------------

test('type circle and damage formula', () => {
  assert.equal(typeBonus('sweet', 'spooky'), 1);
  assert.equal(typeBonus('spooky', 'chompy'), 1);
  assert.equal(typeBonus('chompy', 'sweet'), 1);
  assert.equal(typeBonus('spooky', 'sweet'), -1);
  assert.equal(typeBonus('chompy', 'chompy'), 0);
  assert.equal(finalDamage({ base: 3, lift: true, fresh: true, attackerType: 'sweet', defenderType: 'spooky', targetFolded: false }), 7);
  assert.equal(finalDamage({ base: 1, attackerType: 'sweet', defenderType: 'chompy', targetFolded: true }), 0);
});

// ---- the spec's worked fights ----------------------------------------------

test('monster vs bat', () => {
  const s0 = createBattle({ data, party: [{ id: 'monster', hearts: 9 }], lead: 0, enemy: 'bat' });
  assert.equal(activeOf(s0).form, 'folded');
  const { state, enemy, events } = runLine(s0, ['Claw', 'Claw', 'Claw']);
  assert.deepEqual(enemy, [5, 3, 1, 0]);
  assert.equal(activeOf(state).hearts, 9);
  assert.equal(state.phase, 'won');
  assert.ok(events[2].some((e) => e.t === 'won'));
  assert.ok(!events[2].some((e) => e.t === 'enemyCard'), 'Bite never resolves');
});

test('fish vs spider', () => {
  const s0 = createBattle({
    data, party: [{ id: 'fish', hearts: 8 }, { id: 'monster', hearts: 9 }, { id: 'icecream', hearts: 10 }],
    lead: 0, enemy: 'spider',
  });
  const r1 = play(s0, 'Open').state;
  assert.ok(has(legalActions(r1), 'fold') && has(legalActions(r1), 'switch'));
  const r2 = play(r1, 'Slap');
  assert.equal(r2.state.enemy.hearts, 3);
  assert.equal(r2.events.find((e) => e.t === 'damage' && e.target === 'enemy').amount, 3);
  // During the Web round nothing is locked.
  assert.ok(has(legalActions(r2.state), 'fold') && has(legalActions(r2.state), 'switch'));
  const r3 = play(r2.state, 'Slap');
  assert.equal(r3.events.find((e) => e.t === 'damage' && e.target === 'enemy').amount, 2);
  assert.ok(r3.events.some((e) => e.t === 'sticky' && e.on === true));
  // Next turn only: Fold and Team are locked.
  const locked = legalActions(r3.state);
  assert.ok(!has(locked, 'fold') && !has(locked, 'switch'));
  assert.ok(has(locked, 'move'));
  const r4 = play(r3.state, 'Slap');
  assert.equal(r4.events.find((e) => e.t === 'damage' && e.target === 'enemy').amount, 1);
  assert.equal(r4.state.enemy.hearts, 0);
  assert.equal(r4.state.phase, 'won');
  assert.equal(activeOf(r4.state).hearts, 5);
  // Alternative round 4 that does not win: the lock is gone on the turn after.
  const alt = play(r3.state, 'Love').state;
  const free = legalActions(alt);
  assert.ok(has(free, 'fold') && has(free, 'switch'));
});

test('ice cream vs ghost', () => {
  const s0 = createBattle({ data, party: [{ id: 'icecream', hearts: 10 }], lead: 0, enemy: 'ghost' });
  const { state, enemy, events } = runLine(s0, ['Bonk', 'Open', 'Drop']);
  assert.equal(events[0].find((e) => e.t === 'damage' && e.target === 'enemy').amount, 2);
  assert.equal(events[2].find((e) => e.t === 'damage' && e.target === 'enemy').amount, 5);
  assert.deepEqual(enemy, [6, 4, 4, 0]);
  assert.equal(state.phase, 'won');
  assert.equal(activeOf(state).hearts, 10);
});

test('ice cream vs bat', () => {
  const s0 = createBattle({ data, party: [{ id: 'icecream', hearts: 10 }], lead: 0, enemy: 'bat' });
  assert.equal(cards(s0).moves.find((m) => m.word === 'Bonk').number, 0);
  const { state, events } = runLine(s0, ['Lift', 'Open', 'Drop']);
  assert.equal(events[2].find((e) => e.t === 'damage' && e.target === 'enemy').amount, 5);
  assert.equal(state.phase, 'won');
  assert.equal(activeOf(state).hearts, 7);
});

test('boss strip, monster', () => {
  let s = createBattle({ data, party: [{ id: 'monster', hearts: 7 }], lead: 0, enemy: BOSS, canRun: false });
  const enemy = [s.enemy.hearts];
  for (const n of ['Open', 'Chomp']) { s = play(s, n).state; enemy.push(s.enemy.hearts); }
  // Howl is showing against the open Monster.
  assert.equal(cards(s).intent.word, 'Howl');
  assert.equal(cards(s).intent.number, 6);
  assert.equal(cards(s).moves.find((m) => m.word === 'Gulp').number, 6);
  const g = play(s, 'Gulp');
  assert.ok(g.events.some((e) => e.t === 'gulp' && e.stored === 6));
  s = g.state; enemy.push(s.enemy.hearts);
  assert.equal(activeOf(s).tummy, 6);
  assert.equal(cards(s).badges.tummy, 6);
  assert.equal(cards(s).moves.find((m) => m.word === 'Burp').number, 5);
  for (const n of ['Burp', 'Chomp', 'Chomp']) { s = play(s, n).state; enemy.push(s.enemy.hearts); }
  assert.deepEqual(enemy, [11, 11, 8, 8, 3, 2, 0]);
  assert.equal(s.phase, 'won');
  assert.equal(activeOf(s).hearts, 4);
});

test('boss strip, ice cream', () => {
  const s0 = createBattle({ data, party: [{ id: 'icecream', hearts: 10 }], lead: 0, enemy: BOSS, canRun: false });
  let s = play(s0, 'Open').state;
  s = play(s, 'Drop').state;
  assert.equal(s.enemy.hearts, 6);
  s = play(s, 'Smash').state;
  assert.equal(s.enemy.hearts, 1);
  assert.equal(activeOf(s).form, 'folded');
  s = play(s, 'Bonk').state;
  assert.equal(s.enemy.hearts, 0);
  assert.equal(s.phase, 'won');
  assert.equal(activeOf(s).hearts, 6);
});

test('boss strip, fish', () => {
  const s0 = createBattle({ data, party: [{ id: 'fish', hearts: 8 }], lead: 0, enemy: BOSS, canRun: false });
  const { state, enemy } = runLine(s0, ['Open', 'Slap', 'Love', 'Slap', 'Slap', 'Slap']);
  assert.deepEqual(enemy, [11, 11, 7, 7, 4, 2, 0]);
  assert.equal(state.phase, 'won');
  assert.equal(activeOf(state).hearts, 3);
});

test('boss strip, team', () => {
  const s0 = createBattle({
    data, party: [{ id: 'monster', hearts: 7 }, { id: 'icecream', hearts: 10 }],
    lead: 0, enemy: BOSS, canRun: false,
  });
  let s = s0;
  const enemy = [s.enemy.hearts];
  for (const n of ['Team:icecream', 'Open', 'Smash', 'Lift', 'Open']) { s = play(s, n).state; enemy.push(s.enemy.hearts); }
  assert.equal(cards(s).moves.find((m) => m.word === 'Drop').number, 7);
  s = play(s, 'Drop').state; enemy.push(s.enemy.hearts);
  assert.deepEqual(enemy, [11, 11, 11, 5, 5, 5, 0]);
  assert.equal(s.phase, 'won');
  assert.equal(s.party.find((m) => m.id === 'icecream').hearts, 6);
  assert.equal(s.party.find((m) => m.id === 'monster').hearts, 7);
});

// ---- properties and edge cases ---------------------------------------------

test('preview matches resolve', () => {
  const states = [];
  const party3 = [{ id: 'monster', hearts: 7 }, { id: 'fish', hearts: 5 }, { id: 'icecream', hearts: 10 }];
  let s = createBattle({ data, party: party3, lead: 0, enemy: BOSS, canRun: false });
  for (const n of ['Open', 'Chomp', 'Gulp', 'Team:icecream', 'Lift', 'Open']) { states.push(s); s = play(s, n).state; }
  states.push(s);
  let t = createBattle({ data, party: party3, lead: 1, enemy: 'spider' });
  for (const n of ['Open', 'Slap', 'Love']) { states.push(t); t = play(t, n).state; }
  states.push(t);
  states.push(createBattle({ data, party: [{ id: 'fish', hearts: 2 }, { id: 'monster', hearts: 9 }], lead: 0, enemy: 'bat' }));
  let checked = 0;
  for (const st of states) {
    for (const a of legalActions(st)) {
      const p = preview(st, a);
      const { state: after } = resolve(st, a);
      assert.equal(p.legal, true);
      assert.equal(st.enemy.hearts - p.enemyHeartsLost, after.enemy.hearts, JSON.stringify(a));
      const who = a.t === 'switch' ? a.to : st.active;
      assert.equal(st.party[who].hearts + p.selfHeal - p.selfHeartsLost, after.party[who].hearts, JSON.stringify(a));
      checked++;
    }
  }
  assert.ok(checked > 20);
  // states[2]: open Monster on Howl. Lifting Fold changes the intent digit 6 -> 5; lifting Ice Cream shows 3.
  assert.equal(cards(states[2]).intent.number, 6);
  assert.equal(preview(states[2], { t: 'fold' }).intentNumber, 5);
  assert.equal(preview(states[2], { t: 'switch', to: 2 }).intentNumber, 3);
  assert.equal(preview(states[2], { t: 'move', slot: 1 }).selfHeartsLost, 0, 'Gulp eats the Howl');
  assert.equal(preview(states[0], { t: 'run' }).legal, false);
});

test('illegal actions change nothing', () => {
  const illegal = (state, action) => {
    const out = resolve(state, action);
    assert.deepEqual(out.state, state);
    assert.deepEqual(out.events, [{ t: 'illegal' }]);
    assert.equal(preview(state, action).legal, false);
  };
  // Burp with an empty tummy (slot 2 of the open Monster).
  let m = createBattle({ data, party: [{ id: 'monster', hearts: 9 }], lead: 0, enemy: BOSS, canRun: false });
  m = play(m, 'Open').state;
  illegal(m, { t: 'move', slot: 2 });
  // Gulp with a full tummy.
  m = play(m, 'Chomp').state;
  m = play(m, 'Gulp').state;
  illegal(m, { t: 'move', slot: 1 });
  // Run when canRun is false.
  illegal(m, { t: 'run' });
  // Fold (and switch) while Sticky.
  let f = createBattle({ data, party: [{ id: 'fish', hearts: 8 }, { id: 'monster', hearts: 9 }], lead: 0, enemy: 'spider' });
  f = runLine(f, ['Open', 'Slap', 'Slap']).state;
  illegal(f, { t: 'fold' });
  illegal(f, { t: 'switch', to: 1 });
  // Nonsense.
  illegal(f, { t: 'move', slot: 2 });
  illegal(f, { t: 'switch', to: 0 });
  illegal(f, { t: 'dance' });
});

test('sleepy and lose', () => {
  let s = createBattle({
    data, party: [{ id: 'monster', hearts: 1 }, { id: 'icecream', hearts: 1 }, { id: 'fish', hearts: 0 }],
    lead: 0, enemy: 'bat',
  });
  // Open on Flap: 1 against the open Monster, down to 0.
  let out = play(s, 'Open');
  s = out.state;
  assert.equal(s.party[0].hearts, 0);
  assert.equal(s.phase, 'chooseNext');
  assert.ok(out.events.some((e) => e.t === 'ko'));
  assert.deepEqual(legalActions(s), [{ t: 'switch', to: 1 }]);
  const pointer = s.pointer;
  out = play(s, 'Team:icecream');
  s = out.state;
  assert.equal(s.phase, 'choose');
  assert.equal(s.active, 1);
  assert.equal(activeOf(s).form, 'folded');
  assert.equal(activeOf(s).hearts, 1);
  assert.equal(s.pointer, pointer, 'the free pick does not use a round');
  assert.ok(!out.events.some((e) => e.t === 'enemyCard'));
  // Flap: 1 +1 (Chompy beats Sweet) -1 folded = 1, Ice Cream down to 0, all asleep.
  out = play(s, 'Bonk');
  assert.equal(out.state.phase, 'lost');
  assert.ok(out.events.some((e) => e.t === 'lost'));
  assert.deepEqual(legalActions(out.state), []);

  // Love: heals the Fish and the awake bench, never above max, never wakes the Sleepy.
  let l = createBattle({
    data, party: [{ id: 'fish', hearts: 6 }, { id: 'monster', hearts: 0 }, { id: 'icecream', hearts: 9 }],
    lead: 0, enemy: 'ghost',
  });
  l = play(l, 'Open').state;          // Spook 2 (same type) on the open Fish: 4
  assert.equal(l.party[0].hearts, 4);
  l = play(l, 'Love').state;          // Float: nothing
  assert.equal(l.party[0].hearts, 6);
  assert.equal(l.party[1].hearts, 0);
  assert.equal(l.party[2].hearts, 10);
});

test('run', () => {
  const s = createBattle({ data, party: [{ id: 'monster', hearts: 9 }], lead: 0, enemy: 'bat' });
  const out = play(s, 'Run');
  assert.equal(out.state.phase, 'ran');
  assert.deepEqual(out.events.map((e) => e.t), ['ran']);
  assert.equal(out.state.party[0].hearts, 9);
  assert.equal(cards(s).canRun, true);
});

test('dizzy', () => {
  const s0 = createBattle({ data, party: [{ id: 'monster', hearts: 9 }], lead: 0, enemy: 'bat', dizzy: true });
  assert.equal(cards(s0).intent.number, 0);
  const r1 = play(s0, 'Open');
  assert.equal(r1.state.party[0].hearts, 9, 'first card does nothing');
  assert.ok(r1.events.some((e) => e.t === 'enemyCard' && e.dizzy === true));
  assert.ok(r1.events.some((e) => e.t === 'pointer' && e.index === 1));
  const r2 = play(r1.state, 'Chomp');
  assert.equal(r2.state.party[0].hearts, 8, 'second card hits as normal');
});

test('Gulp against a Dizzy enemy emits gulp with stored 0', () => {
  let s = createBattle({ data, party: [{ id: 'monster', hearts: 9 }], lead: 0, enemy: 'bat', dizzy: true });
  s = { ...s, party: s.party.map((m) => ({ ...m, form: 'open' })) };
  const slot = s.party[0].moves.filter((mv) => mv.form === 'open').findIndex((mv) => mv.id === 'gulp');
  const r = resolve(s, { t: 'move', slot });
  const g = r.events.filter((e) => e.t === 'gulp');
  assert.deepEqual(g, [{ t: 'gulp', stored: 0 }]);
  assert.equal(r.state.party[0].tummy, 0);
  assert.equal(r.state.party[0].hearts, 9);
  assert.equal(r.state.dizzy, false);
  const order = r.events.map((e) => e.t);
  assert.ok(order.indexOf('enemyCard') < order.indexOf('gulp'));
});
