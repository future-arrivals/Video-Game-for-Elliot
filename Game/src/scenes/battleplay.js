// Battle playback: turns resolve()'s events into a timed list of beats. Each beat is
// { dur (world ms), start(), update(ms) } and only changes the scene's display model (`P.show`) and
// effects list; the BattleState itself is already final. About 2 to 3 s for an ordinary round.
//
// P (from battlescene.js): { show, settings, rt(), wt(), fx(effect), sfx(name), hitStop(ms), shake(px),
//   spot(which, part), heart(bar, i), barOf(memberId) -> 'player' | 'l1' | 'r1' | null, enemyKind,
//   syncCards() (cards show the new state), syncIntent() (the intent bubble shows the new round's card),
//   hingeMs (how long the battle fold hinge takes) }

const MOVE_COL = { claw: '#E58A3A', chomp: '#E58A3A', burp: '#A8C878', splash: '#8CC8DC', slap: '#E99DBB',
  bonk: '#E2B878', drop: '#E99DBB', smash: '#F6B0C8' };
const ENEMY_COL = { bat: '#7E6A93', spider: '#6B5A48', ghost: '#CFE3F1', bigghost: '#B9CFE6' };
const HEART_STEP = 110;                                   // ms between hearts tearing off / filling in

const shakeFor = lost => (lost >= 3 ? 10 : lost === 2 ? 6 : lost === 1 ? 3 : 0);

export function buildBeats(events, P) {
  const S = P.show, beats = [];
  const add = (dur, start, update) => beats.push({ dur, start: start || (() => {}), update: update || (() => {}) });
  const next = i => events[i + 1] || {};

  events.forEach((e, i) => {
    switch (e.t) {
      case 'playerMove': {
        const attack = next(i).t === 'damage' || next(i).t === 'burp';
        add(attack ? 330 : 380, () => {
          const [tx, ty] = P.spot('player', 'top');
          P.fx({ kind: 'word', x: tx + 40, y: ty, text: e.word.toUpperCase() });
          if (attack) {
            S.anim.player.lunge = P.wt();
            P.fx({ kind: 'stroke', from: P.spot('player', 'mouth'), to: P.spot('enemy'), col: MOVE_COL[e.id] || '#E58A3A', t0: P.rt() + 100, dur: 210, bend: 110, seed: i + 3 });
          } else S.anim.player.hop = P.wt();
        });
        break;
      }
      case 'burp':
        add(160, () => { S.badges.tummy = 0; const [x, y] = P.spot('player', 'mouth'); P.fx({ kind: 'burst', x, y, n: 12, cols: ['#D8E8B8', '#FFF4D0'], spd: 70, dur: 500, seed: 9 }); });
        break;
      case 'damage': {
        const tgt = e.target === 'enemy' ? 'enemy' : 'player';
        const bar = tgt === 'enemy' ? 'enemy' : P.barOf(e.who) || 'player';
        let done = 0;
        add(300 + e.lost * HEART_STEP, () => {
          const [x, y] = P.spot(tgt);
          const A = tgt === 'enemy' ? S.anim.enemy : S.anim.player;
          if (e.amount > 0) {
            if (P.settings.reduceFlash) A.pulse = P.rt(); else A.flash = P.rt();
            P.fx({ kind: 'spark', x, y, seed: i * .7 });
            P.hitStop(e.amount >= 4 ? 80 : 40);
            P.sfx(e.amount >= 4 || e.lost >= 3 ? 'bigHit' : 'hit');
          } else { P.fx({ kind: 'ring', x, y: y + 40, r: 70, col: '#9d9485' }); P.sfx('boing'); }
          P.shake(shakeFor(e.lost));
          P.fx({ kind: 'digit', x: x + (tgt === 'enemy' ? 62 : 80), y: y - (tgt === 'enemy' ? 52 : 30), n: e.amount, size: 70, col: '#B8261B' });   // the enemy's in the open sky above-right of it
        }, ms => {
          while (done < e.lost && ms >= 120 + done * HEART_STEP) {
            done++;
            const id = tgt === 'enemy' ? null : e.who;
            const now = (tgt === 'enemy' ? S.enemyHearts : S.hearts[id]) - 1;
            if (tgt === 'enemy') S.enemyHearts = now; else S.hearts[id] = now;
            const [hx, hy, hs] = P.heart(bar, now);
            P.fx({ kind: 'tear', x: hx, y: hy, s: hs });
          }
          if (ms >= 120 + e.lost * HEART_STEP) { if (tgt === 'enemy') S.enemyHearts = e.heartsAfter; else S.hearts[e.who] = e.heartsAfter; }
        });
        break;
      }
      case 'little':                                    // boss phase 1: the front Little Ghost takes the hit
        add(e.gone ? 620 : 420, () => {
          const [x, y] = P.spot('enemy');
          if (e.amount > 0) { P.fx({ kind: 'spark', x, y, seed: i * .7 }); P.hitStop(40); P.sfx('hit'); P.shake(3); }
          else { P.fx({ kind: 'ring', x, y: y + 30, r: 50, col: '#9d9485' }); P.sfx('boing'); }
          P.fx({ kind: 'digit', x: x - 40, y: y + 30, n: e.amount, size: 60, col: '#B8261B' });
          if (e.gone) { S.littles = e.left; S.anim.enemy.gone = P.wt(); }
        });
        break;
      case 'littleBack':
        add(700, () => { S.littles = e.left; S.anim.enemy.back = P.wt(); P.sfx('select'); });
        break;
      case 'bossPhase':                                 // the roar: one scale-up and a shake, no full-screen flash
        add(1100, () => { S.bossPhase = e.phase; S.anim.enemy.roar = P.wt(); S.anim.enemy.pulse = P.rt(); P.shake(10); P.sfx('bigHit'); });
        break;
      case 'heal': {
        const bar = P.barOf(e.who);
        let from = 0;
        add(bar === 'player' ? 260 + e.amount * HEART_STEP : 200, () => {
          from = S.hearts[e.who];
          if (!bar) return;
          P.sfx('heal');
          const [hx, hy] = bar === 'player' ? P.spot('player') : P.heart(bar, 2);
          P.fx({ kind: 'burst', x: hx, y: hy, n: 10, cols: ['#7DBE6A', '#FFF4D0', '#E99DBB'], spd: 60, dur: 600, seed: 21 + i });
          if (bar === 'player') P.fx({ kind: 'digit', x: hx + 80, y: hy - 40, n: e.amount, sign: '+', size: 60, col: '#3E8A3A' });
        }, ms => {
          const n = Math.min(e.amount, Math.floor((ms - 100) / HEART_STEP) + 1);
          S.hearts[e.who] = Math.max(S.hearts[e.who], from + Math.max(0, n));
          if (n >= e.amount) S.hearts[e.who] = e.heartsAfter;
        });
        break;
      }
      case 'form': {
        let synced = false;                             // the cards switch to the new form's moves when the hinge lands
        add(850, () => {
          S.forms[e.id] = { form: e.form, t0: P.wt() };
          P.sfx(e.form === 'open' ? 'open' : 'fold');
          const [x, y] = P.spot('player');
          P.fx({ kind: 'burst', x, y: y - 20, n: 14, cols: ['#FFE27A', '#E99DBB', '#8CC8DC'], spd: 110, dur: 700, seed: 31 + i, t0: P.rt() + 250 });
        }, ms => { if (!synced && ms >= P.hingeMs) { synced = true; P.syncCards(); } });
        break;
      }
      case 'fresh':
        add(e.on ? 260 : 120, () => { S.badges.fresh = e.on; if (e.on) S.pops.fresh = P.wt(); });
        break;
      case 'lift':
        add(e.on ? 450 : 120, () => {
          S.badges.lift = e.on ? e.amount : 0;
          if (e.on) { S.pops.lift = P.wt(); S.anim.player.squash = P.wt(); }
        });
        break;
      case 'gulp':
        add(e.stored ? 750 : 300, () => {
          if (e.stored) {
            P.fx({ kind: 'gulp', from: P.spot('enemy'), to: P.spot('player', 'mouth') });
            S.anim.player.squash = P.wt() + 380; P.sfx('candy');
          } else { const [x, y] = P.spot('player', 'mouth'); P.fx({ kind: 'burst', x, y, n: 6, cols: ['#FFF4D0'], spd: 40, dur: 400, seed: 5 }); }
        }, ms => { if (e.stored && ms >= 420 && !S.badges.tummy) { S.badges.tummy = e.stored; S.pops.tummy = P.wt(); } });
        break;
      case 'enemyCard': {
        const nx = next(i);
        const attack = !e.dizzy && (nx.t === 'damage' || (nx.t === 'gulp' && nx.stored > 0));
        add(e.dizzy ? 650 : attack ? 330 : 480, () => {
          S.dizzy = false; S.intentNum = e.dizzy ? null : e.number;
          const [tx, ty] = P.spot('enemy', 'top');
          P.fx({ kind: 'word', x: tx - 20, y: ty, text: e.word.toUpperCase() });
          if (e.dizzy) { const [x, y] = P.spot('enemy'); P.fx({ kind: 'burst', x, y: y - 40, n: 8, cols: ['#FFE27A'], spd: 50, dur: 600, seed: 41 }); return; }
          if (attack) {
            S.anim.enemy.lunge = P.wt();
            if (nx.t !== 'gulp') P.fx({ kind: 'stroke', from: P.spot('enemy'), to: P.spot('player'), col: ENEMY_COL[P.enemyKind] || '#7E6A93', t0: P.rt() + 100, dur: 210, bend: -60, seed: i + 7 });
          } else if (events.some(x => x.t === 'sticky' && x.on)) {
            P.fx({ kind: 'stroke', from: P.spot('enemy'), to: P.spot('player'), col: '#F4F1E8', w: 6, t0: P.rt() + 80, dur: 260, bend: 40, seed: i + 7 });
          } else S.anim.enemy.hop = P.wt();
        });
        break;
      }
      case 'sticky':
        add(e.on ? 700 : 260, () => {
          S.sticky = e.on; S.badges.sticky = e.on;
          if (e.on) { S.pops.sticky = P.wt(); P.sfx('select'); P.fx({ kind: 'web', spots: [P.spot('player'), P.spot('card', 'square'), P.spot('l1'), P.spot('r1')].filter(Boolean).map(([x, y]) => [x, y, 40]) }); }
          else { const [x, y] = P.spot('card', 'square'); P.fx({ kind: 'burst', x, y, n: 10, cols: ['#FFFFFF', '#E4DED0'], spd: 60, dur: 500, seed: 51 }); }
        });
        break;
      case 'switch':
        add(620, () => { S.anim.player.exit = P.wt(); P.sfx('select'); }, ms => {
          if (ms >= 260 && S.active !== e.to) {
            S.forms[e.fromId] = { form: 'folded', t0: -1e9 };
            S.forms[e.toId] = { form: 'folded', t0: -1e9 };
            S.active = e.to; S.badges = { fresh: false, lift: 0, tummy: 0, sticky: S.sticky };
            S.anim.player = { enter: P.wt() };
          }
        });
        break;
      case 'ko':
        add(850, () => { S.anim.player.ko = P.wt(); P.sfx('fold'); S.sleepy[e.who] = true; });
        break;
      case 'pointer':
        add(320, () => { S.pointerFrom = S.pointer; S.pointer = e.index; S.pointerT0 = P.wt(); S.bubbleT0 = P.wt(); S.intentNum = undefined; P.syncCards(); P.syncIntent(); });
        break;
      case 'won': case 'lost': case 'ran':
        add(0, () => { S.end = { kind: e.t, t0: P.wt(), rt0: P.rt() }; });
        break;
      default: break;                                   // 'illegal' never reaches playback
    }
  });
  return beats;
}
