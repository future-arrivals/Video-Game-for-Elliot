import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeadzone, mapPad, pickPad, createPadTracker, BUTTON_INDEX,
} from '../src/input/gamepad.js';
import { edges, updateHolds, mergeFrames, emptyPart } from '../src/input/input.js';
import { KEY_MAP, keyboardPart } from '../src/input/keyboard.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// A fake standard-mapping pad: pressed is a list of button indices.
function pad({ index = 0, id = 'pad', mapping = 'standard', pressed = [], axes = [0, 0, 0, 0] } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  return { index, id, mapping, connected: true, buttons, axes };
}

test('deadzone: stick at 0.2 gives 0', () => {
  assert.deepEqual(applyDeadzone(0.2, 0), [0, 0]);
  assert.deepEqual(applyDeadzone(0.14, 0.14), [0, 0]); // radial: magnitude 0.198
});

test('deadzone: stick at 1.0 gives 1.0, rescaled from 0 just past the deadzone', () => {
  const [x, y] = applyDeadzone(1, 0);
  close(x, 1); close(y, 0);
  const [x2] = applyDeadzone(0.26, 0);
  assert.ok(x2 > 0 && x2 < 0.02, `just past the deadzone should be near 0, got ${x2}`);
  const [x3, y3] = applyDeadzone(0, -0.625);
  close(x3, 0); close(y3, -0.5);
  const [dx, dy] = applyDeadzone(1, 1); // corner of a square stick gate is clamped to length 1
  close(Math.hypot(dx, dy), 1);
});

test('mapPad: button indices from slice-design section 9', () => {
  assert.deepEqual(BUTTON_INDEX, {
    cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, create: 8, options: 9,
  });
  const m = mapPad(pad({ pressed: [0, 2, 5, 7, 9] }));
  assert.deepEqual([...m.down].sort(), ['cross', 'options', 'r1', 'r2', 'square']);
  // analog triggers count past half travel even if `pressed` is false
  const p = pad();
  p.buttons[6] = { pressed: false, value: 0.7 };
  assert.ok(mapPad(p).down.has('l2'));
});

test('mapPad: D-pad is 8-way movement and wins over the stick', () => {
  const up = mapPad(pad({ pressed: [12] }));
  assert.deepEqual([up.moveX, up.moveY], [0, -1]);
  const downRight = mapPad(pad({ pressed: [13, 15] }));
  close(downRight.moveX, Math.SQRT1_2); close(downRight.moveY, Math.SQRT1_2);
  const left = mapPad(pad({ pressed: [14], axes: [0.9, 0, 0, 0] }));
  assert.deepEqual([left.moveX, left.moveY], [-1, 0]);
  const stick = mapPad(pad({ axes: [0.2, 0.1, 0, 0] }));
  assert.deepEqual([stick.moveX, stick.moveY], [0, 0]);
});

test('edges: pressed is true for exactly one frame on a held button', () => {
  const frames = [[], ['cross'], ['cross'], ['cross'], [], ['cross']];
  const out = [];
  let prev = new Set();
  for (const f of frames) {
    const cur = new Set(f);
    out.push(edges(prev, cur).has('cross'));
    prev = cur;
  }
  assert.deepEqual(out, [false, true, false, false, false, true]);
});

test('tracker: a held pad button is pressed on one frame only', () => {
  const t = createPadTracker();
  const seen = [];
  for (let i = 0; i < 4; i++) seen.push(t.step([pad({ pressed: [2] })], 1 / 60).pressed.has('square'));
  assert.deepEqual(seen, [true, false, false, false]);
});

test('holds: L2/R2 timers count up while held and reset on release', () => {
  let h = { l2: 0, r2: 0 };
  h = updateHolds(h, new Set(['r2']), 0.25);
  h = updateHolds(h, new Set(['r2', 'l2']), 0.25);
  close(h.r2, 0.5); close(h.l2, 0.25);
  h = updateHolds(h, new Set(['l2']), 0.1);
  assert.equal(h.r2, 0); close(h.l2, 0.35);
});

test('pickPad: a pad at index 2 with index 0 null is found; standard mapping preferred', () => {
  const p2 = pad({ index: 2 });
  assert.equal(pickPad([null, null, p2, null]), p2);
  const odd = pad({ index: 0, mapping: '' });
  const std = pad({ index: 1 });
  assert.equal(pickPad([odd, std]), std);
  assert.equal(pickPad([odd, null]), odd);
  assert.equal(pickPad([null, { ...std, connected: false }]), null);
  assert.equal(pickPad(null), null);
  assert.equal(pickPad([]), null);
});

test('tracker: a pad disappearing sets padLost once', () => {
  const t = createPadTracker();
  const dt = 1 / 60;
  assert.equal(t.step([null, null, pad({ index: 2 })], dt).connected, true);
  t.step([null, null, pad({ index: 2, pressed: [0] })], dt); // now in use
  const lost = t.step([null, null, null], dt);
  assert.equal(lost.padLost, true);
  assert.equal(lost.connected, false);
  assert.equal(t.step([null, null, null], dt).padLost, false);
  assert.equal(t.step([], dt).padLost, false);
});

test('tracker: a pad that connects and leaves without ever being used does not set padLost', () => {
  const t = createPadTracker();
  t.step([pad()], 1 / 60);
  assert.equal(t.step([null], 1 / 60).padLost, false);
});

test('keyboard map matches the plan', () => {
  const want = {
    KeyK: 'cross', Space: 'cross', KeyL: 'circle', KeyI: 'triangle', KeyJ: 'square',
    KeyQ: 'l1', KeyE: 'r1', Digit1: 'l2', ShiftLeft: 'r2', ShiftRight: 'r2', KeyB: 'create', Enter: 'options',
  };
  for (const [code, name] of Object.entries(want)) assert.equal(KEY_MAP[code], name, code);
  const p = keyboardPart(new Set(['KeyD', 'ArrowUp']), new Set());
  close(p.moveX, Math.SQRT1_2); close(p.moveY, -Math.SQRT1_2);
  assert.equal(keyboardPart(new Set(['ShiftLeft']), new Set()).dash, true);
  // a key tapped and released between two polls still counts as pressed
  assert.ok(keyboardPart(new Set(), new Set(['KeyK'])).pressed.has('cross'));
});

test('merge: keyboard and gamepad pressed at once both register', () => {
  const kb = { ...emptyPart(), pressed: new Set(['cross']), down: new Set(['cross']), active: true };
  const gp = { ...emptyPart(), pressed: new Set(['square']), down: new Set(['square']), active: true };
  const { frame } = mergeFrames({ gamepad: gp, keyboard: kb, touch: emptyPart() }, { source: 'keyboard', holds: { l2: 0, r2: 0 } }, 1 / 60);
  assert.equal(frame.pressed.cross, true);
  assert.equal(frame.pressed.square, true);
  assert.equal(frame.pressed.circle, false);
  assert.deepEqual(Object.keys(frame.pressed).sort(),
    ['circle', 'create', 'cross', 'l1', 'options', 'r1', 'square', 'triangle']);
});

test('merge: source follows the last device that produced input', () => {
  let state = { source: 'touch', holds: { l2: 0, r2: 0 } };
  const idle = emptyPart();
  const step = (parts) => { const r = mergeFrames({ gamepad: idle, keyboard: idle, touch: idle, ...parts }, state, 1 / 60); state = r.next; return r.frame; };
  assert.equal(step({}).source, 'touch'); // nothing happened: unchanged
  assert.equal(step({ keyboard: { ...idle, moveX: 1, active: true } }).source, 'keyboard');
  assert.equal(step({ gamepad: { ...idle, pressed: new Set(['cross']), down: new Set(['cross']), active: true } }).source, 'gamepad');
  assert.equal(step({}).source, 'gamepad');
  // when the current source keeps going and another device also moves, the newcomer takes over
  assert.equal(step({ gamepad: { ...idle, moveX: 1, active: true }, touch: { ...idle, taps: [{ x: 1, y: 2 }], active: true } }).source, 'touch');
});

test('merge: movement, dash, holds, taps and gamepadConnected', () => {
  const idle = emptyPart();
  let state = { source: 'keyboard', holds: { l2: 0, r2: 0 } };
  const gp = { ...idle, moveX: 0.3, moveY: 0, down: new Set(['r2']), active: true };
  const kb = { ...idle, moveX: -1, moveY: 0, active: true };
  const touch = { ...idle, taps: [{ x: 10, y: 20 }], longPress: [{ x: 5, y: 6 }], active: true };
  let r = mergeFrames({ gamepad: gp, keyboard: kb, touch }, state, 0.5, { gamepadConnected: true });
  assert.equal(r.frame.moveX, -1); // the strongest push wins
  assert.equal(r.frame.dash, true); // R2 held
  assert.equal(r.frame.held.r2, 0.5);
  assert.deepEqual(r.frame.taps, [{ x: 10, y: 20 }]);
  assert.deepEqual(r.frame.longPress, [{ x: 5, y: 6 }]);
  assert.equal(r.frame.gamepadConnected, true);
  assert.equal(r.frame.padLost, false);
  r = mergeFrames({ gamepad: idle, keyboard: idle, touch: idle }, r.next, 0.1, { padLost: true });
  assert.equal(r.frame.padLost, true);
  assert.equal(r.frame.held.r2, 0);
  assert.equal(r.frame.dash, false);
});
