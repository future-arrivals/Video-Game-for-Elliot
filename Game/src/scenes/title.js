// Start screen: shown at load only when a save exists (see main.js). Pictures only, no words.
//
// createTitleScene({ assets, save, input?, canvas, toLogical, audio, onContinue, onStartOver }) -> Scene
//   scene.update(dt, inputFrame), scene.render(ctx, timeMs), scene.dispose(); inputMode is 'battle' (no touch stick).
//   scene.holdAmount   0..1, how full the Start over ring is (for scripted checks)
// Keep going (big play arrow, Cross): Cross, key K / Space, or a tap on the button -> onContinue().
// Start over (blank sheet with a sparkle, Triangle): hold Triangle (key I, pad Triangle, or a finger on the
//   button) for HOLD_SECS; a ring fills while held and drains when released -> onStartOver().
import { W, H, INK, PAPER, wob, clamp } from '../render/core.js';
import { drawMember } from '../render/actors.js';
import { drawPsShape } from '../input/touch.js';
import { PS_COLOURS } from '../render/battle/layout.js';

export const HOLD_SECS = 1.5;                 // Triangle held this long wipes the save
const DRAIN_RATE = 3;                         // ring empties this many times faster than it fills
const PARTY_FEET_Y = 262, PARTY_SPACING = 96, PARTY_SCALE = 1.7;
const KEEP = { x: 590, y: 84, w: 220, h: 232, fill: '#5DBB63', seed: 71 };
const FRESH = { x: 40, y: 158, w: 168, h: 168, fill: '#F5B642', seed: 72 };
const BTN = { stroke: 4, shadowDy: 5, shadow: 'rgba(80,55,25,.25)', pressScale: .96 };
const GLYPH = { r: 24, inset: 26, lw: 4 };    // white disc with the controller shape, near the button's lower corner
const ARROW = { w: 92, h: 104, fill: '#FFFFFF', lw: 6, pulse: .03, pulseSecs: 2.6 };
const SHEET = { w: 62, h: 78, fold: 16, discR: 56, discFill: '#FFF3D0' };
const RING = { r: 62, lw: 11, track: 'rgba(26,26,26,.15)', fill: '#D03C30' };
const SPARKLE = { x: 22, y: -26, r: 15, fill: '#F6D24A' };
const BG_DOTS = { n: 26, seed: 5, col: 'rgba(157,148,133,.35)' };
const PAD_TRIANGLE = 3;                       // standard gamepad mapping

const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function createTitleScene({ assets, save, canvas = null, toLogical = null, audio = null, onContinue, onStartOver }) {
  const party = ((save && save.world && save.world.party) || [{ id: 'monster' }]).map((m, i) => ({
    id: m.id, form: i === 0 && save && save.lead && save.lead.form === 'open' ? 'open' : 'folded', foldAnim: 1, moving: false, faceX: 1, facing: 'front',
  }));
  const play = n => { try { audio && audio.play(n); } catch { /* never mind */ } };
  let hold = 0, done = false, kbI = false, ptr = null;   // ptr: { id, which: 'keep' | 'fresh' }
  let keepDown = false;

  const keyDown = e => { if (e.code === 'KeyI') kbI = true; };
  const keyUp = e => { if (e.code === 'KeyI') kbI = false; };
  const pt = e => (toLogical ? toLogical(e.clientX, e.clientY) : [e.clientX, e.clientY]);
  const down = e => {
    const [x, y] = pt(e);
    if (inRect(KEEP, x, y)) { ptr = { id: e.pointerId, which: 'keep' }; keepDown = true; }
    else if (inRect(FRESH, x, y)) ptr = { id: e.pointerId, which: 'fresh' };
  };
  const up = e => {
    if (!ptr || ptr.id !== e.pointerId) return;
    const [x, y] = pt(e), was = ptr; ptr = null; keepDown = false;
    if (was.which === 'keep' && e.type === 'pointerup' && inRect(KEEP, x, y)) go('keep');
  };
  const moveP = e => { if (ptr && ptr.id === e.pointerId) { const [x, y] = pt(e); if (!inRect(ptr.which === 'keep' ? KEEP : FRESH, x, y)) { ptr = null; keepDown = false; } } };
  if (typeof window !== 'undefined') { window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); }
  if (canvas) { canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointermove', moveP); }

  function dispose() {
    if (typeof window !== 'undefined') { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); }
    if (canvas) { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('pointermove', moveP); }
  }
  function go(which) {
    if (done) return; done = true; dispose();
    if (which === 'keep') { play('select'); onContinue && onContinue(); }
    else { hold = 1; play('heal'); onStartOver && onStartOver(); }
  }
  function padTriangle() {
    try { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(g => g && g.buttons && g.buttons[PAD_TRIANGLE] && g.buttons[PAD_TRIANGLE].pressed); } catch { return false; }
  }

  const scene = {
    inputMode: 'battle',
    get holdAmount() { return clamp(hold / HOLD_SECS); },
    dispose,
    update(dt, frame) {
      if (done) return;
      if (frame && frame.pressed && frame.pressed.cross) { go('keep'); return; }
      const holding = kbI || padTriangle() || (ptr && ptr.which === 'fresh');
      hold = holding ? hold + dt : Math.max(0, hold - dt * DRAIN_RATE);
      if (hold >= HOLD_SECS) go('fresh');
    },
    render(ctx, timeMs) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
      drawDots(ctx);
      const n = party.length, x0 = W / 2 - (n - 1) * PARTY_SPACING / 2;
      party.forEach((m, i) => {
        ctx.save(); ctx.translate(x0 + i * PARTY_SPACING, PARTY_FEET_Y); ctx.scale(PARTY_SCALE, PARTY_SCALE);
        drawMember(ctx, assets, m, 0, 0, timeMs, { shadow: true });
        ctx.restore();
      });
      const pulse = 1 + Math.sin(timeMs / 1000 / ARROW.pulseSecs * Math.PI * 2) * ARROW.pulse;
      button(ctx, KEEP, keepDown ? BTN.pressScale : pulse, () => drawPlayArrow(ctx, KEEP.x + KEEP.w / 2, KEEP.y + KEEP.h / 2 - 12));
      glyph(ctx, 'cross', KEEP.x + KEEP.w - GLYPH.inset, KEEP.y + KEEP.h - GLYPH.inset);
      const fdown = ptr && ptr.which === 'fresh' || kbI;
      button(ctx, FRESH, fdown ? BTN.pressScale : 1, () => drawFresh(ctx, FRESH.x + FRESH.w / 2, FRESH.y + FRESH.h / 2 - 6, this.holdAmount));
      glyph(ctx, 'triangle', FRESH.x + FRESH.w - GLYPH.inset + 8, FRESH.y + FRESH.h - GLYPH.inset + 8);
      ctx.restore();
    },
  };
  return scene;
}

function drawDots(ctx) {
  let a = BG_DOTS.seed;
  const r = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  ctx.fillStyle = BG_DOTS.col;
  for (let i = 0; i < BG_DOTS.n; i++) { ctx.beginPath(); ctx.arc(r() * W, r() * H, 2 + r() * 3, 0, 7); ctx.fill(); }
}

function button(ctx, b, scale, drawPicture) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
  const p = wob([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]], true, 1.4, b.seed, 18);
  ctx.save(); ctx.translate(0, BTN.shadowDy); ctx.fillStyle = BTN.shadow; ctx.fill(p.p); ctx.restore();
  ctx.fillStyle = b.fill; ctx.fill(p.p); ctx.strokeStyle = INK; ctx.lineWidth = BTN.stroke; ctx.stroke(p.p);
  drawPicture();
  ctx.restore();
}

function glyph(ctx, shape, x, y) {
  ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, GLYPH.r, 0, 7); ctx.fill(); ctx.stroke();
  drawPsShape(ctx, shape, x, y + (shape === 'triangle' ? 1 : 0), GLYPH.r * .5, PS_COLOURS[shape], GLYPH.lw);
  ctx.restore();
}

function drawPlayArrow(ctx, cx, cy) {
  const { w, h } = ARROW;
  ctx.save(); ctx.fillStyle = ARROW.fill; ctx.strokeStyle = INK; ctx.lineWidth = ARROW.lw;
  const p = wob([[cx - w / 2, cy - h / 2], [cx + w / 2, cy], [cx - w / 2, cy + h / 2]], true, 1.2, 9, 14);
  ctx.fill(p.p); ctx.stroke(p.p); ctx.restore();
}

function drawFresh(ctx, cx, cy, amount) {
  ctx.save();
  ctx.fillStyle = SHEET.discFill; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, SHEET.discR, 0, 7); ctx.fill(); ctx.stroke();
  // ring: faint full track, then the fill from the top, clockwise
  ctx.lineWidth = RING.lw; ctx.strokeStyle = RING.track; ctx.beginPath(); ctx.arc(cx, cy, RING.r, 0, 7); ctx.stroke();
  if (amount > 0) { ctx.strokeStyle = RING.fill; ctx.beginPath(); ctx.arc(cx, cy, RING.r, -Math.PI / 2, -Math.PI / 2 + amount * Math.PI * 2); ctx.stroke(); }
  // blank sheet with a folded corner
  const x = cx - SHEET.w / 2, y = cy - SHEET.h / 2, f = SHEET.fold;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + SHEET.w - f, y); ctx.lineTo(x + SHEET.w, y + f); ctx.lineTo(x + SHEET.w, y + SHEET.h); ctx.lineTo(x, y + SHEET.h); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + SHEET.w - f, y); ctx.lineTo(x + SHEET.w - f, y + f); ctx.lineTo(x + SHEET.w, y + f); ctx.stroke();
  // sparkle
  const sx = cx + SPARKLE.x, sy = cy + SPARKLE.y, r = SPARKLE.r;
  ctx.fillStyle = SPARKLE.fill; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * .38 : r; ctx[i ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
