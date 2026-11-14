// Battle screen layout in logical px (844 x 390). Shared by the drawing and by tap hit-testing.
// Everything sits by its owner: your character bottom left with its hearts and badges beside its feet;
// the enemy upper right on its disc with one bubble (its hearts and its next move) and the small strip
// under that bubble. The four cards sit in a diamond like the controller's face buttons (triangle top,
// square left, circle right, cross bottom) in the bottom-right corner, clear of the enemy's disc.
// Small teammate tags fill the top corners (L1 left, R1 right).

export const CARD_W = 108, CARD_H = 58;
const CX = 666, TOP = 236, GAP = 4;                          // diamond centre column, top edge, gap between cards

export const LAYOUT = {
  enemy: { x: 592, y: 192, h: 120 },                         // feet (centre of the paper disc)
  disc: { x: 592, y: 192, rx: 92, ry: 17 },
  player: { x: 178, y: 384, h: 228 },                        // feet; h = target open height
  playerHearts: { x: 266, y: 344, h: 40 },                   // beside the character's feet
  badges: { x: 290, y: 318, gap: 46 },                       // a row just above the hearts
  bubble: { x: 312, y: 40, w: 172, h: 108, tipX: 500, tipY: 110 },
  strip: { y: 170, gap: 34 },                                // small icons centred under the bubble
  wheel: { x: 262, y: 76, r: 24 },                           // only while a type bonus or penalty is in play
  l1: { x: 8, y: 8, w: 112, h: 34 },                         // drawn tags
  r1: { x: 724, y: 8, w: 112, h: 34 },
  l1Hit: { x: 0, y: 0, w: 124, h: 76 },                      // their touch zones (at least 64 px)
  r1Hit: { x: 720, y: 0, w: 124, h: 76 },
  run: { x: 820, y: 370, r: 9, hit: 32 },
  cards: {
    triangle: { x: CX - CARD_W / 2, y: TOP },
    square: { x: CX - CARD_W * 1.5 - GAP, y: TOP + 44 },
    circle: { x: CX + CARD_W / 2 + GAP, y: TOP + 44 },
    cross: { x: CX - CARD_W / 2, y: TOP + 88 },
  },
};

export const BUTTONS = ['cross', 'circle', 'triangle', 'square'];
export const SLOT_OF = { cross: 0, circle: 1, triangle: 2 };
export const PS_COLOURS = { cross: '#4F84CF', circle: '#DE4F45', triangle: '#2A9E80', square: '#C86FA8' };
export const CARD_PAD = 4;                                   // tap slack around a card: 116 x 66 targets

const inRect = (r, x, y, w = r.w, h = r.h, pad = 0) => x >= r.x - pad && x < r.x + w + pad && y >= r.y - pad && y < r.y + h + pad;

/** Which button a tap at (x, y) stands for: 'cross' | 'circle' | 'triangle' | 'square' | 'l1' | 'r1' | 'run' | null.
 *  showL1 / showR1: whether those tags are on screen. showCards: false for slots that are not drawn ({ triangle: false }). */
export function hitTest(x, y, { showL1 = true, showR1 = true, showRun = true, showCards = {} } = {}) {
  for (const b of BUTTONS) if (showCards[b] !== false && inRect(LAYOUT.cards[b], x, y, CARD_W, CARD_H, CARD_PAD)) return b;
  if (showL1 && inRect(LAYOUT.l1Hit, x, y)) return 'l1';
  if (showR1 && inRect(LAYOUT.r1Hit, x, y)) return 'r1';
  if (showRun && Math.hypot(x - LAYOUT.run.x, y - LAYOUT.run.y) < LAYOUT.run.hit) return 'run';
  return null;
}
