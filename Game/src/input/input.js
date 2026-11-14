// One InputFrame per frame from every device (gamepad, keyboard, touch/mouse), merged.
//
// InputFrame (pinned in the M1 plan) plus three extra fields:
//   { moveX, moveY, dash, pressed: { cross, circle, triangle, square, l1, r1, create, options },
//     held: { l2, r2 }, taps: [{x, y}], source, gamepadConnected,
//     padLost,      // true for one frame when a pad that had been used disconnects (scene pauses)
//     longPress,    // [{x, y}] battle-mode touch held 0.5 s (reported once, while still down)
//     holding }     // [{x, y, t, progress}] battle-mode touches in progress, for a filling ring
//
// The merge and its helpers are pure (plain data in, plain data out) and tested in Node.
// A "device part" is { down: Set, pressed: Set, moveX, moveY, dash, taps, longPress, holding, active }.

import { createGamepad, edges } from './gamepad.js';
import { createKeyboard } from './keyboard.js';
import { createTouch } from './touch.js';

export { edges };

export const PRESS_NAMES = ['cross', 'circle', 'triangle', 'square', 'l1', 'r1', 'create', 'options'];
const ORDER = ['gamepad', 'keyboard', 'touch'];

export function emptyPart() {
  return { down: new Set(), pressed: new Set(), moveX: 0, moveY: 0, dash: false, taps: [], longPress: [], holding: [], active: false };
}

// Seconds each trigger has been held. `down` is the set of names held this frame.
export function updateHolds(holds, down, dt) {
  return {
    l2: down.has('l2') ? (holds?.l2 ?? 0) + dt : 0,
    r2: down.has('r2') ? (holds?.r2 ?? 0) + dt : 0,
  };
}

// Source: unchanged when nothing produced input; otherwise a device that produced input and is
// not the current source takes over (so the newest device wins); else the current one stays.
export function nextSource(prevSource, activeDevices) {
  if (!activeDevices.length) return prevSource;
  return activeDevices.find(d => d !== prevSource) ?? prevSource;
}

// parts: { gamepad, keyboard, touch }; prev: { source, holds }.
export function mergeFrames(parts, prev, dt, { gamepadConnected = false, padLost = false } = {}) {
  const list = ORDER.map(name => [name, parts[name] ?? emptyPart()]);
  const pressedSet = new Set(), down = new Set();
  let moveX = 0, moveY = 0, best = 0, dash = false;
  const taps = [], longPress = [], holding = [];
  for (const [, p] of list) {
    for (const n of p.pressed ?? []) pressedSet.add(n);
    for (const n of p.down ?? []) down.add(n);
    const m = Math.hypot(p.moveX || 0, p.moveY || 0);
    if (m > best) { best = m; moveX = p.moveX; moveY = p.moveY; }
    if (p.dash) dash = true;
    if (p.taps) taps.push(...p.taps);
    if (p.longPress) longPress.push(...p.longPress);
    if (p.holding) holding.push(...p.holding);
  }
  const holds = updateHolds(prev?.holds, down, dt);
  const pressed = {};
  for (const n of PRESS_NAMES) pressed[n] = pressedSet.has(n);
  const source = nextSource(prev?.source ?? 'keyboard', list.filter(([, p]) => p.active).map(([n]) => n));
  const frame = {
    moveX, moveY, dash: dash || holds.r2 > 0, pressed, held: holds, taps, source,
    gamepadConnected, padLost, longPress, holding,
  };
  return { frame, next: { source, holds } };
}

function defaultSource() {
  try {
    const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches;
    if (coarse && (globalThis.navigator?.maxTouchPoints ?? 0) > 0) return 'touch';
  } catch { /* ignore */ }
  return 'keyboard';
}

export function createInput(canvas, { toLogical } = {}) {
  const toL = toLogical ?? ((x, y) => [x, y]);
  const gamepad = createGamepad();
  const keyboard = createKeyboard();
  const touch = createTouch(canvas, toL);
  let mode = 'field';
  let state = { source: defaultSource(), holds: { l2: 0, r2: 0 } };

  return {
    get gamepadConnected() { return gamepad.connected; },
    get source() { return state.source; },
    poll(dt) {
      const gp = gamepad.poll(dt);
      const kb = keyboard.poll(dt);
      const tc = touch.poll(dt);
      const r = mergeFrames({ gamepad: gp, keyboard: kb, touch: tc }, state, dt,
        { gamepadConnected: gp.connected, padLost: gp.padLost });
      state = r.next;
      return r.frame;
    },
    drawTouch(ctx, m = mode) {
      if (state.source !== 'touch') return;
      touch.draw(ctx, m);
    },
    setMode(m) { mode = m === 'battle' ? 'battle' : 'field'; touch.setMode(mode); },
    dispose() { keyboard.dispose(); touch.dispose(); },
  };
}
