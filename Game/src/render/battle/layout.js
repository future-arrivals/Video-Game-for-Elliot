// Battle screen layout in logical px (844 x 390). Shared by the drawing and by tap hit-testing.
// The four cards sit in a diamond like the controller's face buttons: triangle top, square left,
// circle right, cross bottom. Teammate portraits fill the top corners (L1 left, R1 right).

export const CARD_W = 108, CARD_H = 58;
const CX = 664, TOP = 234;                                   // diamond centre column and top edge

export const LAYOUT = {
  enemy: { x: 654, y: 214, h: 120 },                         // feet (centre of the paper disc)
  disc: { x: 654, y: 214, rx: 98, ry: 18 },
  player: { x: 178, y: 384, h: 228 },                        // feet; h = target open height
  playerHearts: { x: 100, y: 8 },                            // x moves to 12 when there are no portraits
  enemyHearts: { x: 404, y: 62 },
  bubble: { x: 404, y: 106, w: 144, h: 74, tipX: 590, tipY: 150 },
  strip: { cx: 488, y: 6, cw: 76, ch: 46, gap: 8 },
  wheel: { x: 670, y: 34, r: 27 },
  l1: { x: 6, y: 6, w: 88, h: 78 },
  r1: { x: 750, y: 6, w: 88, h: 78 },
  badges: { x: 304, y: 206, gap: 46 },
  run: { x: 812, y: 364, r: 15 },
  cards: {
    triangle: { x: CX - CARD_W / 2, y: TOP },
    square: { x: CX - CARD_W * 1.5 - 8, y: TOP + 44 },
    circle: { x: CX + CARD_W / 2 + 8, y: TOP + 44 },
    cross: { x: CX - CARD_W / 2, y: TOP + 88 },
  },
};

export const BUTTONS = ['cross', 'circle', 'triangle', 'square'];
export const SLOT_OF = { cross: 0, circle: 1, triangle: 2 };
export const PS_COLOURS = { cross: '#4F84CF', circle: '#DE4F45', triangle: '#2A9E80', square: '#C86FA8' };

const inRect = (r, x, y, w = r.w, h = r.h, pad = 0) => x >= r.x - pad && x < r.x + w + pad && y >= r.y - pad && y < r.y + h + pad;

/** Which button a tap at (x, y) stands for: 'cross' | 'circle' | 'triangle' | 'square' | 'l1' | 'r1' | 'run' | null.
 *  showL1 / showR1: whether those portraits are on screen. */
export function hitTest(x, y, { showL1 = true, showR1 = true, showRun = true } = {}) {
  for (const b of BUTTONS) if (inRect(LAYOUT.cards[b], x, y, CARD_W, CARD_H, 2)) return b;
  if (showL1 && inRect(LAYOUT.l1, x, y)) return 'l1';
  if (showR1 && inRect(LAYOUT.r1, x, y)) return 'r1';
  if (showRun && Math.hypot(x - LAYOUT.run.x, y - LAYOUT.run.y) < LAYOUT.run.r + 14) return 'run';
  return null;
}
