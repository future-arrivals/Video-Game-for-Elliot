// Battle screen drawing (slice-design section 4). Pure: draws a view-model built by the battle scene,
// never changes state and holds no rule logic. Pieces live in render/battle/*.
//
// View-model (all optional parts may be null):
// { backdrop (canvas from bakeBackdrop), overlays ({ light, leaf } from bakeOverlays), shake: [dx, dy],
//   enemy: { kind, dx, dy, curl, flop, flash, pulse }, enemyBar: { max, shown, lost },
//   player: { member: { id, form, foldAnim, faceX, moving }, scale, dx, dy, ko, flash, pulse, squash, alpha },
//   playerBar: { max, shown, lost, heal }, hasPortraits,
//   strip: { strip, pointer, from, u, dizzy }, bubble: { word, number, arrow, dizzy, changed, pop, webIcon },
//   cards: { cross, circle, triangle, square } (see ui.card), portraits: [ui.portrait args], badges: ui.badges args,
//   types: [type ids], typeMark: { [type]: true }, run: { progress } | null, fx: [effects], tear: 0..1, uiAlpha }
import { W, H } from './core.js';
import { LAYOUT } from './battle/layout.js';
import { heartsTag, strip, bubble, card, typeWheel, portrait, badges, runRing } from './battle/ui.js';
import { drawEnemy, drawPlayer, drawEffects, pageTear } from './battle/scenery.js';

export { LAYOUT, hitTest } from './battle/layout.js';
export { bakeBackdrop, bakeOverlays, playerScale } from './battle/scenery.js';

const GAP = 22;
/** Screen spot of heart i in a bar: 'player' | 'enemy' | 'l1' | 'r1'. Returns [x, y, size]. */
export function heartSpot(which, i, { hasPortraits = true, max = 9 } = {}) {
  if (which === 'enemy') return [LAYOUT.enemyHearts.x + 22 + i * GAP, LAYOUT.enemyHearts.y + 23, 20];
  if (which === 'player') return [(hasPortraits ? LAYOUT.playerHearts.x : 12) + 22 + i * GAP, LAYOUT.playerHearts.y + 23, 20];
  const L = LAYOUT[which], gap = Math.min(8.5, (L.w - 12) / max);
  return [L.x + 6 + gap / 2 + (L.w - 12 - gap * max) / 2 + i * gap, L.y + L.h - 14, 7.5];
}
/** Where effects aim on each actor (screen px). */
export function actorSpot(which, part = 'body') {
  if (which === 'enemy') return part === 'top' ? [LAYOUT.enemy.x, LAYOUT.enemy.y - LAYOUT.enemy.h - 10] : [LAYOUT.enemy.x - 6, LAYOUT.enemy.y - LAYOUT.enemy.h * .6];
  return part === 'top' ? [LAYOUT.player.x, LAYOUT.player.y - 190] : part === 'mouth' ? [LAYOUT.player.x + 30, LAYOUT.player.y - 120] : [LAYOUT.player.x + 40, LAYOUT.player.y - 110];
}

export function drawBattle(ctx, assets, vm, t) {
  ctx.save();
  const [sx, sy] = vm.shake || [0, 0];
  ctx.save(); ctx.translate(sx, sy);
  if (vm.backdrop) ctx.drawImage(vm.backdrop, -12, -8, W + 24, H + 16); else { ctx.fillStyle = '#FBF8F0'; ctx.fillRect(0, 0, W, H); }
  if (vm.enemy) drawEnemy(ctx, assets, vm.enemy, t);
  if (vm.player) drawPlayer(ctx, assets, vm.player, t);
  const O = vm.overlays;
  if (O && O.leaf) { ctx.save(); ctx.translate(-34, H + 30); ctx.rotate(.5); ctx.drawImage(O.leaf.c, -O.leaf.w * .8, -O.leaf.h * 1.6, O.leaf.w * 1.6, O.leaf.h * 1.6); ctx.restore(); }
  if (O && O.light) ctx.drawImage(O.light, -12, -8, W + 24, H + 16);
  ctx.restore();

  // UI (does not shake)
  if (vm.uiAlpha != null) ctx.globalAlpha = vm.uiAlpha;
  if (vm.types) typeWheel(ctx, vm.types, vm.typeMark || {});
  if (vm.enemyBar) heartsTag(ctx, LAYOUT.enemyHearts.x, LAYOUT.enemyHearts.y, vm.enemyBar, t, 95);
  if (vm.bubble) bubble(ctx, vm.bubble, t);
  if (vm.strip) strip(ctx, vm.strip, t);                  // after the hearts tag so the pointer stays on top
  if (vm.playerBar) heartsTag(ctx, vm.hasPortraits ? LAYOUT.playerHearts.x : 12, LAYOUT.playerHearts.y, vm.playerBar, t, 94);
  for (const p of vm.portraits || []) portrait(ctx, p, t);
  if (vm.badges) badges(ctx, vm.badges, t);
  if (vm.cards) for (const b of ['triangle', 'square', 'circle', 'cross']) if (vm.cards[b]) card(ctx, b, vm.cards[b], t);
  if (vm.run) runRing(ctx, vm.run);
  ctx.globalAlpha = 1;
  if (vm.fx) drawEffects(ctx, vm.fx, t);
  if (vm.tear) pageTear(ctx, vm.tear);
  ctx.restore();
}
