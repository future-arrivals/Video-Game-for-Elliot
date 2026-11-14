// Battle state machine (slice-design section 4). Pure functions; state is plain JSON-safe data, never mutated.
// BattleState: { phase: 'choose'|'chooseNext'|'won'|'lost'|'ran', round (1-based), pointer (index into enemy.strip),
//   dizzy (true until the enemy's first card has been skipped), canRun, sticky (Fold/Open and Team locked for THIS turn),
//   active (index into party), party: [{ id, type, hearts, maxHearts, form: 'folded'|'open', lift (0 or the badge's +N),
//   fresh (bool), tummy (0 = empty, else the stored number), moves: [the character's move defs copied from data] }],
//   enemy: { id, type, hearts, maxHearts, strip: [{ word, form, attack, effect? }] } }.
// Benched members are always folded with no Lift/Fresh/tummy. A member with 0 hearts is Sleepy.
// Events (in play order): playerMove {who,id,word,slot}; damage {target:'enemy'|'player', who?, amount (the final digit),
//   lost (hearts actually removed), heartsAfter}; heal {who,amount (actually gained),heartsAfter}; form {who:'player'|'enemy',
//   id, form, free?}; fresh {on}; lift {on,amount?}; gulp {stored} (stored 0 = nothing eaten); burp {amount};
//   enemyCard {index,word,number,dizzy?}; sticky {on}; switch {from,to,fromId,toId,free}; ko {who}; pointer {index};
//   won; lost; ran; illegal. `who` on player events is the member id.
// Boss (slice-design section 7): createBattle with enemy = data.boss.id builds Big Ghost from data.boss. The state then has
//   boss: { phase: 1|2, littles (Little Ghosts left), maxLittles, littleType, next: { hearts, strip } (phase 2, null once
//   started) }; running is never allowed. In phase 1 a damaging move hits the front Little Ghost (never folded): any final
//   damage of 1+ knocks it away and the rest is lost; Big Ghost's hearts cannot be hit. Boss events: little {amount, gone,
//   left} (instead of an enemy damage event), littleBack {left} (Call), bossPhase {phase: 2} (the moment the last Little
//   Ghost goes: that round's card is skipped and the strip becomes phase 2's, starting at its first card).
// Choices where the spec is open: Gulp stores nothing if the intent digit is 0 (no attack, Dizzy, or reduced to 0);
//   Lift is disabled while a Lift badge is already held ("one at a time"); Lift, Gulp and Burp cards have kind 'badge';
//   a Dizzy enemy's first card still sets its form for the player's action, only its action is skipped; Sticky does
//   not block Run or the free pick after a knockout; Fresh and Lift are spent by any damaging move, even one that does 0.
import { finalDamage } from './rules.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const FOLD_WORDS = { folded: 'Open', open: 'Fold' };

// ---- creation ----------------------------------------------------------------

export function createBattle({ data, party, lead, enemy, dizzy = false, canRun = true }) {
  const members = party.map(({ id, hearts }) => {
    const def = data.characters.find((c) => c.id === id);
    if (!def) throw new Error(`unknown character ${id}`);
    const h = hearts == null ? def.hearts : Math.max(0, Math.min(def.hearts, hearts));
    return {
      id, type: def.type, hearts: h, maxHearts: def.hearts, form: 'folded', lift: 0, fresh: false, tummy: 0,
      moves: def.moves.map(({ id: mid, word, icon, form, effect }) => clone({ id: mid, word, icon, form, effect })),
    };
  });
  let edef = enemy, boss = null;
  if (typeof enemy === 'string' && data.boss && enemy === data.boss.id) {
    const [p1, p2] = data.boss.phases;
    boss = { phase: 1, littles: p1.shields.count, maxLittles: p1.shields.count, littleType: p1.shields.type,
      next: { hearts: p2.hearts, strip: p2.strip.map(stripCard) } };
    edef = { id: data.boss.id, type: data.boss.type, hearts: p2.hearts, strip: p1.strip };
    canRun = false;
  } else if (typeof enemy === 'string') {
    edef = data.creatures.find((c) => c.id === enemy);
    if (!edef) throw new Error(`unknown creature ${enemy}`);
  }
  const state = {
    phase: 'choose', round: 1, pointer: 0, dizzy: !!dizzy, canRun: !!canRun, sticky: false,
    active: lead,
    party: members,
    enemy: {
      id: edef.id, type: edef.type, hearts: edef.hearts, maxHearts: edef.hearts,
      strip: edef.strip.map(stripCard),
    },
  };
  if (boss) state.boss = boss;
  if (members[lead].hearts <= 0) state.phase = members.some((m) => m.hearts > 0) ? 'chooseNext' : 'lost';
  return state;
}

function stripCard(c) { return clone({ word: c.word, form: c.form, attack: c.attack || 0, ...(c.effect ? { effect: c.effect } : {}) }); }

// ---- small readers -------------------------------------------------------------

const currentCard = (s) => s.enemy.strip[s.pointer];
const shielded = (s) => !!(s.boss && s.boss.phase === 1 && s.boss.littles > 0);   // a Little Ghost takes the hit
const enemyFolded = (s) => !shielded(s) && currentCard(s).form === 'folded';
const targetType = (s) => (shielded(s) ? s.boss.littleType : s.enemy.type);
const cardCallsBack = (card) => /comes? back/i.test(card.effect || '');
const cardMakesSticky = (card) => /sticky/i.test(card.effect || '');
const formMoves = (m) => m.moves.filter((mv) => mv.form === m.form);

// What this round's card would do to member `m` in form `form` (the intent digit).
function intentAgainst(s, m, form) {
  const card = currentCard(s);
  if (s.dizzy || !(card.attack > 0)) return 0;
  return finalDamage({ base: card.attack, attackerType: s.enemy.type, defenderType: m.type, targetFolded: form === 'folded' });
}

function damageBase(m, mv) {
  const d = mv.effect && mv.effect.damage;
  if (typeof d === 'number') return d;
  if (d === 'tummy') return m.tummy;
  return null;                                         // not a damaging move
}

function moveKind(mv) {
  const e = mv.effect || {};
  if (typeof e.damage === 'number') return 'damage';
  if (e.heal_self != null || e.heal_team != null) return 'heal';
  return 'badge';                                       // Lift, Gulp, Burp
}

function moveEnabled(m, mv) {
  const e = mv.effect || {};
  if (e.gulp) return m.tummy === 0;
  if (e.damage === 'tummy') return m.tummy > 0;
  if (e.lift_badge != null) return !m.lift;
  return true;
}

function moveNumber(s, m, mv) {
  const e = mv.effect || {};
  if (e.damage === 'tummy' && m.tummy === 0) return 0;
  const base = damageBase(m, mv);
  if (base != null) {
    return finalDamage({ base, lift: m.lift, fresh: m.fresh, attackerType: m.type, defenderType: targetType(s), targetFolded: enemyFolded(s) });
  }
  if (e.heal_self != null) return e.heal_self;
  if (e.heal_team != null) return e.heal_team;
  if (e.lift_badge != null) return e.lift_badge;
  if (e.gulp) return intentAgainst(s, m, m.form);
  return 0;
}

// ---- legal actions -------------------------------------------------------------

export function legalActions(s) {
  const out = [];
  const others = s.party.map((m, i) => i).filter((i) => i !== s.active && s.party[i].hearts > 0);
  if (s.phase === 'chooseNext') return others.map((to) => ({ t: 'switch', to }));
  if (s.phase !== 'choose') return out;
  const m = s.party[s.active];
  formMoves(m).forEach((mv, slot) => { if (moveEnabled(m, mv)) out.push({ t: 'move', slot }); });
  if (!s.sticky) {
    out.push({ t: 'fold' });
    for (const to of others) out.push({ t: 'switch', to });
  }
  if (s.canRun) out.push({ t: 'run' });
  return out;
}

const isLegal = (s, a) => !!a && legalActions(s).some((x) => x.t === a.t && x.slot === a.slot && x.to === a.to);

// ---- resolving -----------------------------------------------------------------

function heal(m, amount, ev) {
  if (m.hearts <= 0) return;                            // never wakes a Sleepy one
  const after = Math.min(m.maxHearts, m.hearts + amount);
  ev.push({ t: 'heal', who: m.id, amount: after - m.hearts, heartsAfter: after });
  m.hearts = after;
}

function doSwitch(st, to, ev, free) {
  const out = st.party[st.active];
  out.form = 'folded'; out.lift = 0; out.fresh = false; out.tummy = 0;
  const inc = st.party[to];
  inc.form = 'folded';
  ev.push({ t: 'switch', from: st.active, to, fromId: out.id, toId: inc.id, free });
  st.active = to;
}

function doMove(st, slot, ev) {
  const m = st.party[st.active];
  const mv = formMoves(m)[slot];
  const e = mv.effect || {};
  ev.push({ t: 'playerMove', who: m.id, id: mv.id, word: mv.word, slot });
  const base = damageBase(m, mv);
  if (base != null) {
    const amount = moveNumber(st, m, mv);
    if (e.damage === 'tummy') { ev.push({ t: 'burp', amount }); m.tummy = 0; }
    if (shielded(st)) {                                  // phase 1: the front Little Ghost; extra damage is lost
      const gone = amount >= 1;
      if (gone) st.boss.littles -= 1;
      ev.push({ t: 'little', amount, gone, left: st.boss.littles });
    } else {
    const after = Math.max(0, st.enemy.hearts - amount);
    ev.push({ t: 'damage', target: 'enemy', amount, lost: st.enemy.hearts - after, heartsAfter: after });
    st.enemy.hearts = after;
    }
    if (m.lift) { m.lift = 0; ev.push({ t: 'lift', on: false }); }
    if (m.fresh) { m.fresh = false; ev.push({ t: 'fresh', on: false }); }
    if (e.then && /fold/i.test(e.then)) {
      m.form = 'folded';
      ev.push({ t: 'form', who: 'player', id: m.id, form: 'folded', free: true });
    }
    return false;
  }
  if (e.heal_self != null) heal(m, e.heal_self, ev);
  if (e.heal_team != null) for (const tm of st.party) heal(tm, e.heal_team, ev);
  if (e.lift_badge != null) { m.lift = e.lift_badge; ev.push({ t: 'lift', on: true, amount: e.lift_badge }); }
  return !!e.gulp;                                      // true: the Monster is gulping this round's card
}

// The player's half of a round. Returns { gulping }.
function applyPlayer(st, a, ev) {
  if (a.t === 'switch') { doSwitch(st, a.to, ev, false); return { gulping: false }; }
  if (a.t === 'fold') {
    const m = st.party[st.active];
    if (m.form === 'folded') {
      m.form = 'open'; m.fresh = true;
      ev.push({ t: 'form', who: 'player', id: m.id, form: 'open' }, { t: 'fresh', on: true });
    } else {
      m.form = 'folded';
      ev.push({ t: 'form', who: 'player', id: m.id, form: 'folded' });
      if (m.fresh) { m.fresh = false; ev.push({ t: 'fresh', on: false }); }
    }
    return { gulping: false };
  }
  return { gulping: doMove(st, a.slot, ev) };
}

export function resolve(state, action) {
  if (!isLegal(state, action)) return { state, events: [{ t: 'illegal' }] };
  const st = clone(state);
  const ev = [];

  if (st.phase === 'chooseNext') {                      // free pick after a knockout; the enemy does not act
    doSwitch(st, action.to, ev, true);
    st.phase = 'choose';
    return { state: st, events: ev };
  }
  if (action.t === 'run') {
    st.phase = 'ran';
    return { state: st, events: [{ t: 'ran' }] };
  }

  const wasSticky = st.sticky;
  const littlesBefore = st.boss ? st.boss.littles : 0;
  const { gulping } = applyPlayer(st, action, ev);
  if (wasSticky) { st.sticky = false; ev.push({ t: 'sticky', on: false }); }

  if (st.boss && st.boss.phase === 1 && littlesBefore > 0 && st.boss.littles === 0) {   // phase change: the card is skipped
    if (gulping) ev.push({ t: 'gulp', stored: 0 });
    st.boss.phase = 2;
    st.enemy.strip = st.boss.next.strip; st.enemy.hearts = st.enemy.maxHearts = st.boss.next.hearts;
    st.boss.next = null; st.dizzy = false;
    ev.push({ t: 'bossPhase', phase: 2 });
    st.pointer = 0; st.round += 1;
    ev.push({ t: 'pointer', index: 0 });
    return { state: st, events: ev };
  }

  if (st.enemy.hearts <= 0) {                           // the card does not happen
    st.phase = 'won';
    ev.push({ t: 'won' });
    return { state: st, events: ev };
  }

  // The enemy's card.
  const card = currentCard(st);
  const m = st.party[st.active];
  const number = intentAgainst(st, m, m.form);
  if (st.dizzy) {
    ev.push({ t: 'enemyCard', index: st.pointer, word: card.word, number: 0, dizzy: true });
    if (gulping) ev.push({ t: 'gulp', stored: 0 });       // nothing to eat, but the Gulp still happened
    st.dizzy = false;
  } else {
    ev.push({ t: 'enemyCard', index: st.pointer, word: card.word, number });
    if (gulping) {
      if (card.attack > 0 && number > 0) m.tummy = number;
      ev.push({ t: 'gulp', stored: m.tummy });
    } else if (card.attack > 0) {
      const after = Math.max(0, m.hearts - number);
      ev.push({ t: 'damage', target: 'player', who: m.id, amount: number, lost: m.hearts - after, heartsAfter: after });
      m.hearts = after;
    }
    if (cardMakesSticky(card)) { st.sticky = true; ev.push({ t: 'sticky', on: true }); }
    if (st.boss && st.boss.phase === 1 && cardCallsBack(card) && st.boss.littles < st.boss.maxLittles) {
      st.boss.littles += 1;
      ev.push({ t: 'littleBack', left: st.boss.littles });
    }
  }

  if (m.hearts <= 0) {
    ev.push({ t: 'ko', who: m.id });
    if (!st.party.some((p) => p.hearts > 0)) {
      st.phase = 'lost';
      ev.push({ t: 'lost' });
      return { state: st, events: ev };
    }
    st.phase = 'chooseNext';
  }
  st.pointer = (st.pointer + 1) % st.enemy.strip.length;
  st.round += 1;
  ev.push({ t: 'pointer', index: st.pointer });
  return { state: st, events: ev };
}

// ---- preview and cards --------------------------------------------------------

// Exactly what the hearts will do if `action` is played, including this round's card.
// "self" is the character who will be active when the card lands (the incoming one for a switch).
export function preview(state, action) {
  if (!isLegal(state, action)) {
    const m = state.party[state.active];
    return { legal: false, enemyHeartsLost: 0, selfHeartsLost: 0, selfHeal: 0, intentNumber: state.phase === 'choose' ? intentAgainst(state, m, m.form) : 0 };
  }
  const selfIdx = action.t === 'switch' ? action.to : state.active;
  const selfId = state.party[selfIdx].id;
  const { state: after, events } = resolve(state, action);
  let selfHeartsLost = 0;
  let selfHeal = 0;
  for (const e of events) {
    if (e.t === 'damage' && e.target === 'player' && e.who === selfId) selfHeartsLost += e.lost;
    if (e.t === 'heal' && e.who === selfId) selfHeal += e.amount;
  }
  // The intent digit as it would read after the player's action (before the card lands).
  let intentNumber = 0;
  if (action.t !== 'run') {
    const mid = clone(state);
    if (mid.phase === 'chooseNext') doSwitch(mid, action.to, [], true);
    else applyPlayer(mid, action, []);
    const m = mid.party[mid.active];
    intentNumber = intentAgainst(mid, m, m.form);
  }
  const enemyHeartsLost = after.boss && after.boss.phase !== (state.boss && state.boss.phase) ? 0 : state.enemy.hearts - after.enemy.hearts;
  const littlesLost = state.boss ? events.filter((e) => e.t === 'little' && e.gone).length : 0;
  return { legal: true, enemyHeartsLost, littlesLost, selfHeartsLost, selfHeal, intentNumber };
}

export function cards(s) {
  const m = s.party[s.active];
  const choosing = s.phase === 'choose';
  const card = currentCard(s);
  return {
    moves: formMoves(m).map((mv, slot) => ({
      slot, id: mv.id, word: mv.word, icon: mv.icon,
      number: moveNumber(s, m, mv), kind: moveKind(mv), enabled: choosing && moveEnabled(m, mv),
    })),
    fold: { word: FOLD_WORDS[m.form], enabled: choosing && !s.sticky },
    intent: {
      word: card.word, number: intentAgainst(s, m, m.form), form: card.form, index: s.pointer,
      attack: card.attack, dizzy: s.dizzy, sticky: cardMakesSticky(card),
    },
    strip: clone(s.enemy.strip),
    badges: { fresh: m.fresh, lift: m.lift, tummy: m.tummy, sticky: s.sticky },
    canRun: s.canRun,
    boss: s.boss ? { phase: s.boss.phase, littles: s.boss.littles, maxLittles: s.boss.maxLittles } : null,
  };
}
