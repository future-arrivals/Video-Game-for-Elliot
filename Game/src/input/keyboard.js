// Keyboard, for testing without a controller. Map from the M1 plan:
// arrows or WASD move; K Cross, L Circle, I Triangle, J Square; Q L1, E R1; 1 L2, Shift R2;
// B Create, Enter Options; Space also Cross. Uses KeyboardEvent.code so layouts do not matter.

export const KEY_MAP = {
  KeyK: 'cross', Space: 'cross', KeyL: 'circle', KeyI: 'triangle', KeyJ: 'square',
  KeyQ: 'l1', KeyE: 'r1', Digit1: 'l2', ShiftLeft: 'r2', ShiftRight: 'r2',
  KeyB: 'create', Enter: 'options', NumpadEnter: 'options',
};
const MOVE = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};
const NO_SCROLL = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

// held: Set of codes down now; tapped: Set of codes that went down since the last poll
// (so a key pressed and released between two frames still counts).
export function keyboardPart(held, tapped) {
  const down = new Set();
  for (const c of held) if (KEY_MAP[c]) down.add(KEY_MAP[c]);
  const pressed = new Set();
  for (const c of tapped) if (KEY_MAP[c]) pressed.add(KEY_MAP[c]);
  let x = 0, y = 0;
  const seen = new Set();
  for (const c of held) {
    const m = MOVE[c];
    if (!m) continue;
    const k = m.join(); // WASD and arrows on the same side do not add up
    if (seen.has(k)) continue;
    seen.add(k); x += m[0]; y += m[1];
  }
  const n = Math.hypot(x, y);
  const moveX = n ? x / n + 0 : 0, moveY = n ? y / n + 0 : 0;
  return {
    down, pressed, moveX, moveY, dash: down.has('r2'), taps: [], longPress: [],
    active: pressed.size > 0 || moveX !== 0 || moveY !== 0,
  };
}

export function createKeyboard(target = globalThis.window) {
  const held = new Set();
  let tapped = new Set();
  const isGameKey = c => c in KEY_MAP || c in MOVE;
  const onDown = e => {
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey || !isGameKey(e.code)) return;
    if (!e.repeat && !held.has(e.code)) tapped.add(e.code);
    held.add(e.code);
  };
  const onUp = e => { held.delete(e.code); };
  const onBlur = () => held.clear();
  target?.addEventListener?.('keydown', onDown);
  target?.addEventListener?.('keyup', onUp);
  target?.addEventListener?.('blur', onBlur);
  return {
    poll() {
      const part = keyboardPart(held, tapped);
      tapped = new Set();
      return part;
    },
    dispose() {
      target?.removeEventListener?.('keydown', onDown);
      target?.removeEventListener?.('keyup', onUp);
      target?.removeEventListener?.('blur', onBlur);
    },
  };
}
