// Touch (and mouse) controls on the canvas, in logical px (844 x 390). slice-design section 9.
//
// Field mode:  a floating stick where the left half is first touched (past 90% = dash);
//              USE (Cross) bottom right with FOLD (Square) to its left; L1 / R1 tap zones in the
//              top corners (the HUD draws the portraits there). Every touch-down is also a tap.
// Battle mode: no stick and no buttons. A press released before 0.5 s is a tap (reported on
//              release, at the press point); one held 0.5 s without sliding is a long-press
//              (reported once, while still held). `holding` lists presses in progress so the
//              battle screen can draw a filling ring.

export const W = 844, H = 390;
export const LAYOUT = {
  use: { x: 768, y: 296, r: 54 },
  fold: { x: 652, y: 326, r: 38 },
  l1: { x: 0, y: 0, w: 96, h: 84 },
  r1: { x: W - 96, y: 0, w: 96, h: 84 },
  stick: { r: 58, home: { x: 130, y: 292 }, maxX: W / 2 },
};
export const STICK_DEADZONE = 0.15;
export const LONG_PRESS = 0.5;
const SLIDE = 16; // px a press may wander and still be a tap / long-press

const inCircle = (c, x, y, slop = 6) => Math.hypot(x - c.x, y - c.y) <= c.r + slop;
const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

// Which field control a touch-down at (x, y) lands on: 'l1' | 'r1' | 'cross' | 'square' | 'stick' | null.
export function fieldHit(x, y) {
  if (inRect(LAYOUT.l1, x, y)) return 'l1';
  if (inRect(LAYOUT.r1, x, y)) return 'r1';
  if (inCircle(LAYOUT.use, x, y)) return 'cross';
  if (inCircle(LAYOUT.fold, x, y)) return 'square';
  if (x < LAYOUT.stick.maxX) return 'stick';
  return null;
}

// Stick vector from origin to finger: { moveX, moveY, dash }, deadzone rescaled like the pad.
export function stickVector(ox, oy, x, y, r = LAYOUT.stick.r) {
  const dx = (x - ox) / r, dy = (y - oy) / r;
  const raw = Math.min(1, Math.hypot(dx, dy));
  if (raw <= STICK_DEADZONE) return { moveX: 0, moveY: 0, dash: false, raw };
  const m = Math.hypot(dx, dy);
  const out = (raw - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  return { moveX: (dx / m) * out, moveY: (dy / m) * out, dash: raw > 0.9, raw };
}

export function createTouch(canvas, toLogical) {
  let mode = 'field';
  let stick = null; // { id, ox, oy, x, y }
  const presses = new Map(); // battle: id -> { x, y, t, moved, fired }
  let pressed = new Set(), taps = [], longPress = [], activity = false;
  const lit = new Map(); // field button -> seconds left to draw it "pressed"

  const logical = e => toLogical(e.clientX, e.clientY);

  const onDown = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    const [x, y] = logical(e);
    activity = true;
    if (mode === 'battle') {
      presses.set(e.pointerId, { x, y, t: 0, moved: false, fired: false });
      return;
    }
    taps.push({ x, y });
    const hit = fieldHit(x, y);
    if (hit === 'stick') {
      if (!stick) stick = { id: e.pointerId, ox: x, oy: y, x, y };
    } else if (hit) {
      pressed.add(hit);
      lit.set(hit, 0.15);
    }
  };
  const onMove = e => {
    const [x, y] = logical(e);
    if (stick && e.pointerId === stick.id) { stick.x = x; stick.y = y; }
    const p = presses.get(e.pointerId);
    if (p && Math.hypot(x - p.x, y - p.y) > SLIDE) p.moved = true;
  };
  const onUp = e => {
    if (stick && e.pointerId === stick.id) stick = null;
    const p = presses.get(e.pointerId);
    if (p) {
      presses.delete(e.pointerId);
      if (e.type === 'pointerup' && !p.fired && !p.moved) taps.push({ x: p.x, y: p.y });
    }
  };
  const noMenu = e => e.preventDefault();

  if (canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', noMenu);
  }

  return {
    setMode(m) {
      if (m === mode) return;
      mode = m; stick = null; presses.clear();
    },
    poll(dt) {
      for (const p of presses.values()) {
        p.t += dt;
        if (!p.fired && !p.moved && p.t >= LONG_PRESS) { p.fired = true; longPress.push({ x: p.x, y: p.y }); }
      }
      for (const [k, t] of lit) { if (t - dt <= 0) lit.delete(k); else lit.set(k, t - dt); }
      const v = stick ? stickVector(stick.ox, stick.oy, stick.x, stick.y) : { moveX: 0, moveY: 0, dash: false };
      const holding = [...presses.values()].filter(p => !p.fired && !p.moved)
        .map(p => ({ x: p.x, y: p.y, t: p.t, progress: Math.min(1, p.t / LONG_PRESS) }));
      const part = {
        down: new Set(), pressed, moveX: v.moveX + 0, moveY: v.moveY + 0, dash: v.dash, taps, longPress, holding,
        active: activity || pressed.size > 0 || taps.length > 0 || longPress.length > 0 || v.moveX !== 0 || v.moveY !== 0,
      };
      pressed = new Set(); taps = []; longPress = []; activity = false;
      return part;
    },
    draw(ctx, m = mode) {
      if (m !== 'field') return; // battle cards are drawn by the battle screen
      drawField(ctx, stick, lit);
    },
    dispose() {
      if (!canvas) return;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('contextmenu', noMenu);
    },
  };
}

// ---- drawing: pale pencil circles with dark labels ----

const PENCIL = '#A39C8E';
const PAPER = 'rgba(251, 248, 240, 0.7)'; // #FBF8F0 at 70%
const INK = '#3B362E';
const FONT = 'Andika, "Avenir Next Rounded", "Arial Rounded MT Bold", Verdana, sans-serif';

// A slightly wobbly pencil circle: two passes with small fixed offsets, like a hand-drawn ring.
function pencilCircle(ctx, x, y, r, fill = true) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = PAPER; ctx.fill(); }
  ctx.strokeStyle = PENCIL;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha *= 0.45;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2 + 0.3;
    const rr = r + 1.4 * Math.sin(a * 3 + 1) + 0.8 * Math.sin(a * 5);
    const px = x + 0.8 + Math.cos(a) * rr, py = y - 0.6 + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.globalAlpha /= 0.45;
}

function pencilRect(ctx, r) {
  const pad = 6, rad = 14;
  const x = r.x + pad, y = r.y + pad, w = r.w - pad * 2, h = r.h - pad * 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, rad) : ctx.rect(x, y, w, h);
  ctx.fillStyle = 'rgba(251, 248, 240, 0.35)';
  ctx.fill();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = PENCIL; ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

// PlayStation face-button shapes as paths. s = half size.
export function drawPsShape(ctx, shape, x, y, s, color = INK, lw = 3) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape === 'cross') {
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
  } else if (shape === 'circle') {
    ctx.arc(x, y, s, 0, Math.PI * 2);
  } else if (shape === 'square') {
    ctx.rect(x - s * 0.9, y - s * 0.9, s * 1.8, s * 1.8);
  } else if (shape === 'triangle') {
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 1.05, y + s * 0.75); ctx.lineTo(x - s * 1.05, y + s * 0.75); ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, size) {
  ctx.fillStyle = INK;
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawField(ctx, stick, lit) {
  const L = LAYOUT;
  ctx.save();
  // stick: a ghost at its home spot, or the live base and knob where the finger landed
  const s = L.stick;
  if (stick) {
    pencilCircle(ctx, stick.ox, stick.oy, s.r);
    const v = stickVector(stick.ox, stick.oy, stick.x, stick.y);
    const ang = Math.atan2(stick.y - stick.oy, stick.x - stick.ox);
    const k = Math.min(1, v.raw) * s.r;
    pencilCircle(ctx, stick.ox + Math.cos(ang) * k, stick.oy + Math.sin(ang) * k, 26);
    if (v.dash) { ctx.globalAlpha = 0.5; pencilCircle(ctx, stick.ox, stick.oy, s.r + 6, false); ctx.globalAlpha = 1; }
  } else {
    ctx.globalAlpha = 0.6;
    pencilCircle(ctx, s.home.x, s.home.y, s.r);
    pencilCircle(ctx, s.home.x, s.home.y, 26);
    ctx.globalAlpha = 1;
  }
  // USE (Cross) and FOLD (Square)
  for (const [key, c, shape, text] of [['cross', L.use, 'cross', 'USE'], ['square', L.fold, 'square', 'FOLD']]) {
    const down = lit.has(key);
    pencilCircle(ctx, c.x, c.y + (down ? 2 : 0), down ? c.r - 3 : c.r);
    const iy = c.y - c.r * 0.22 + (down ? 2 : 0);
    drawPsShape(ctx, shape, c.x, iy, c.r * 0.22, INK, c.r > 45 ? 3.5 : 3);
    label(ctx, text, c.x, c.y + c.r * 0.42 + (down ? 2 : 0), c.r > 45 ? 17 : 13);
  }
  // L1 / R1 corner zones (portraits are drawn by the HUD on top of these)
  for (const [key, r] of [['l1', L.l1], ['r1', L.r1]]) {
    ctx.globalAlpha = lit.has(key) ? 1 : 0.8;
    pencilRect(ctx, r);
    label(ctx, key.toUpperCase(), r.x + r.w / 2, r.y + r.h - 18, 12);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
