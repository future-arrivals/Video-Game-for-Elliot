// Gamepad reading (standard mapping, DualShock 4 / DualSense). slice-design section 9.
// Pure helpers take plain data so they can be tested in Node; createGamepad() is the only part
// that touches `navigator`. Browsers only list a pad after a button on it has been pressed, so
// nothing shows up until then; we simply poll every frame.

export const DEADZONE = 0.25;

export const BUTTON_INDEX = {
  cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, create: 8, options: 9,
};
const DPAD = { up: 12, down: 13, left: 14, right: 15 };

// Radial deadzone, rescaled so output starts at 0 just past the deadzone and reaches 1 at full tilt.
export function applyDeadzone(x, y, dz = DEADZONE) {
  const mag = Math.hypot(x, y);
  if (!(mag > dz)) return [0, 0];
  const out = Math.min(1, (mag - dz) / (1 - dz));
  return [(x / mag) * out, (y / mag) * out];
}

function isDown(b) {
  if (!b) return false;
  if (typeof b === 'number') return b > 0.5;
  return !!b.pressed || (b.value ?? 0) > 0.5;
}

// Raw pad { buttons, axes } -> { down: Set of names, moveX, moveY }. D-pad (8-way) wins over the stick.
export function mapPad(p) {
  const buttons = p?.buttons ?? [];
  const axes = p?.axes ?? [];
  const down = new Set();
  for (const [name, i] of Object.entries(BUTTON_INDEX)) if (isDown(buttons[i])) down.add(name);
  const dx = (isDown(buttons[DPAD.right]) ? 1 : 0) - (isDown(buttons[DPAD.left]) ? 1 : 0);
  const dy = (isDown(buttons[DPAD.down]) ? 1 : 0) - (isDown(buttons[DPAD.up]) ? 1 : 0);
  let moveX, moveY;
  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    moveX = dx / n; moveY = dy / n;
  } else {
    [moveX, moveY] = applyDeadzone(Number(axes[0]) || 0, Number(axes[1]) || 0);
  }
  return { down, moveX: moveX + 0, moveY: moveY + 0 }; // + 0 turns -0 into 0
}

// First connected pad in the list (which may contain nulls), preferring the standard mapping.
export function pickPad(pads) {
  if (!pads) return null;
  let first = null;
  for (const p of Array.from(pads)) {
    if (!p || p.connected === false) continue;
    if (p.mapping === 'standard') return p;
    if (!first) first = p;
  }
  return first;
}

const padKey = p => `${p.index}|${p.id}`;

// Stateful but DOM-free: feed it the pad list each frame.
// step(pads, dt) -> { connected, padLost, active, pressed: Set, down: Set, moveX, moveY, dash }
export function createPadTracker() {
  let prevDown = new Set();
  let currentKey = null; // pad we read last frame
  let inUseKey = null; // pad that has produced input since it appeared

  return {
    step(pads) {
      const p = pickPad(pads);
      let padLost = false;
      const stillThere = inUseKey && pads && Array.from(pads).some(q => q && q.connected !== false && padKey(q) === inUseKey);
      if (inUseKey && !stillThere) { padLost = true; inUseKey = null; }
      if (!p) {
        prevDown = new Set(); currentKey = null;
        return { connected: false, padLost, active: false, pressed: new Set(), down: new Set(), moveX: 0, moveY: 0, dash: false };
      }
      const key = padKey(p);
      if (key !== currentKey) { prevDown = new Set(); currentKey = key; }
      const m = mapPad(p);
      const pressed = edges(prevDown, m.down);
      prevDown = m.down;
      const active = pressed.size > 0 || m.moveX !== 0 || m.moveY !== 0;
      if (active) inUseKey = key;
      return { connected: true, padLost, active, pressed, down: m.down, moveX: m.moveX, moveY: m.moveY, dash: m.down.has('r2') };
    },
  };
}

// Names in `cur` that were not in `prev`. (Also exported from input.js.)
export function edges(prev, cur) {
  const out = new Set();
  for (const n of cur) if (!prev.has(n)) out.add(n);
  return out;
}

// Browser part. Returns a device part for mergeFrames plus connection info.
export function createGamepad(nav = globalThis.navigator) {
  const tracker = createPadTracker();
  const api = {
    connected: false,
    poll(dt) {
      let pads = [];
      try { pads = nav?.getGamepads ? nav.getGamepads() : []; } catch { pads = []; }
      const r = tracker.step(pads, dt);
      api.connected = r.connected;
      return r;
    },
  };
  return api;
}
