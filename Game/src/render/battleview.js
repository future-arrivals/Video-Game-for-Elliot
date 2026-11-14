// Battle screen drawing (slice-design section 4). Pure: draws a view-model built by the battle scene,
// never changes state and holds no rule logic. Pieces live in render/battle/*.
//
// View-model (all optional parts may be null):
// { backdrop (canvas from bakeBackdrop), overlays ({ light, leaf } from bakeOverlays), shake: [dx, dy],
//   enemy: { kind, dx, dy, curl, win (ms since the win or null), flash, pulse }, enemyBar: { max, shown, lost },
//   player: { member: { id, form, foldAnim, faceX, moving }, pace, scale, dx, dy, ko, flash, pulse, squash, alpha },
//   playerBar: { max, shown, lost, heal },
//   strip: { strip, pointer, from, u, dizzy }, bubble: { word, number, arrow, dizzy, changed, pop, webIcon },
//   cards: { cross, circle, triangle, square } (see ui.card), portraits: [ui.portrait args], badges: ui.badges args,
//   types: [type ids] (the wheel; null while no type bonus or penalty is in play), typeMark: { [type]: true },
//   run: { progress } | null, fx: [effects], tear: 0..1, uiAlpha }
import { W, H } from './core.js';
import { LAYOUT } from './battle/layout.js';
import { playerHearts, heartSpotOf, strip, bubble, card, typeWheel, portrait, badges, runRing } from './battle/ui.js';
import { drawEnemy, drawPlayer, drawEffects, pageTear } from './battle/scenery.js';

export { LAYOUT, hitTest } from './battle/layout.js';
export { bakeBackdrop, bakeOverlays, playerScale } from './battle/scenery.js';

/** Screen spot of heart i in a bar: 'player' | 'enemy' | 'l1' | 'r1'. Returns [x, y, size]. */
export function heartSpot(which, i, { max = 9 } = {}) { return heartSpotOf(which, i, max); }
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
  if (O && O.leaf) { ctx.save(); ctx.globalAlpha = .75; ctx.translate(-34, H + 30); ctx.rotate(.5); ctx.drawImage(O.leaf.c, -O.leaf.w * .8, -O.leaf.h * 1.6, O.leaf.w * 1.6, O.leaf.h * 1.6); ctx.restore(); }
  if (O && O.light) ctx.drawImage(O.light, -12, -8, W + 24, H + 16);
  ctx.restore();

  // UI (does not shake). Drawn quiet to loud: pencil panels first, the lifted card last.
  if (vm.uiAlpha != null) ctx.globalAlpha = vm.uiAlpha;
  if (vm.types) typeWheel(ctx, vm.types, vm.typeMark || {});
  if (vm.bubble) bubble(ctx, vm.bubble, vm.enemyBar, t);
  if (vm.strip) strip(ctx, vm.strip, t);
  if (vm.playerBar) playerHearts(ctx, vm.playerBar, t);
  if (vm.badges) badges(ctx, vm.badges, t);
  for (const p of vm.portraits || []) portrait(ctx, p, t);
  if (vm.run) runRing(ctx, vm.run);
  if (vm.cards) {
    const order = ['triangle', 'square', 'circle', 'cross'].filter(b => vm.cards[b]);
    for (const b of order) if (!vm.cards[b].lifted) card(ctx, b, vm.cards[b], t);
    for (const b of order) if (vm.cards[b].lifted) card(ctx, b, vm.cards[b], t);
  }
  ctx.globalAlpha = 1;
  if (vm.fx) drawEffects(ctx, vm.fx, t);
  if (vm.tear) pageTear(ctx, vm.tear);
  ctx.restore();
}
