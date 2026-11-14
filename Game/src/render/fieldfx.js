// Things that move in the field, drawn from fieldState.action (read-only): the fish stretching into a bridge,
// a boulder sliding (or shuddering when the push is blocked), and Scoops' arm reaching up to a post.
// World px, called from stageview.js inside the playfield transform. Full colour and black ink.
//   boulderAt(view, fs, b)          -> { p, dx, dy } the boulder sprite for b and its shift (sliding, moved)
//   drawBridge(ctx, fs, t)          under the actors: the pink band across the water
//   drawReach(ctx, fs)              over the actors: the arm from the lead to the post top
//   hidesLead(fs)                   true while the fish is the bridge (the stage view skips drawing it)
import { INK, wx, wy, clamp, eOutCubic, eInOutCubic } from './core.js';
import { OBJ } from './stageobjs.js';

const STRETCH = .35;                 // share of a bridge's u spent stretching (powers.js STRETCH)
const BRIDGE = { fill: '#F08AA8', belly: '#F9C3D3', w: 22, ink: 4, groundY: .62, over: .35, sag: 3 };
const SHORT = { reach: 1.6, grow: .5, droop: 10 };   // a short bridge: stretches this many tiles, then flops back
const FACE = { eye: 3.6, eyeDx: 4, smile: 5 };
const FIN = { len: 13, spread: 11 };
const PUSH = { shudderPx: 3, shudderHz: 34, leanPx: 5 };
const REACH = { fill: '#F7E3B0', w: 10, ink: 3, scoop: '#F49AC1', scoopR: 10, from: 58, out: .55, hold: .8 };

/** The boulder sprite for live boulder b and how far to shift it from where it was baked (world px). */
export function boulderAt(view, fs, b) {
  let p = view.boulderSprites.get(b.i + ',' + b.j), dx = 0, dy = 0;
  if (!p) {                                       // moved by a push: borrow a sprite baked elsewhere
    const k = view.stage.boulders[0]; if (!k) return null;
    p = view.boulderSprites.get(k[0] + ',' + k[1]);
    dx = wx(b.i - k[0]); dy = wy(b.j) - wy(k[1]);
  }
  const a = fs.action;
  if (a && a.kind === 'push' && a.from[0] === b.i && a.from[1] === b.j) {
    const di = Math.sign(a.to[0] - a.from[0]), dj = Math.sign(a.to[1] - a.from[1]);
    if (a.blocked) {
      const s = Math.sin(a.u * PUSH.shudderHz) * PUSH.shudderPx * (1 - a.u);
      dx += s + di * PUSH.leanPx * Math.sin(a.u * Math.PI); dy += dj * PUSH.leanPx * .6 * Math.sin(a.u * Math.PI);
    } else {
      const e = eInOutCubic(clamp(a.u));
      dx += wx(a.to[0] - a.from[0]) * e; dy += (wy(a.to[1]) - wy(a.from[1])) * e;
    }
  }
  return p ? { p, dx, dy } : null;
}

export const hidesLead = fs => !!(fs.action && fs.action.kind === 'bridge' && fs.party[0] && fs.party[0].id === 'fish' && fs.party[0].foldAnim >= 1);

/** The fish as a bridge: a pink band in its ink, tail at the bank it left, face at the far end. */
export function drawBridge(ctx, fs, t) {
  const a = fs.action;
  if (!a || a.kind !== 'bridge' || fs.party[0].foldAnim < 1) return;
  const [di, dj] = a.dir;
  let ext, droop = 0;                                  // ext: tiles from the start tile centre
  if (a.short) {
    const g = a.u < SHORT.grow ? eOutCubic(a.u / SHORT.grow) : 1 - eInOutCubic((a.u - SHORT.grow) / (1 - SHORT.grow));
    ext = .5 + SHORT.reach * g; droop = a.u > SHORT.grow * .8 ? SHORT.droop * Math.sin(clamp((a.u - SHORT.grow * .8) / .4) * Math.PI) : 0;
  } else ext = .5 + (a.len + BRIDGE.over) * eOutCubic(clamp(a.u / STRETCH));
  const ci = a.from[0] + .5, cj = a.from[1] + BRIDGE.groundY;
  const x0 = wx(ci + di * .2), y0 = wy(cj + dj * .2), x1 = wx(ci + di * ext), y1 = wy(cj + dj * ext) + droop;
  const len = Math.hypot(x1 - x0, y1 - y0); if (len < 2) return;
  const ang = Math.atan2(y1 - y0, x1 - x0), wig = Math.sin(t * .012) * BRIDGE.sag;
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const hw = BRIDGE.w / 2;
  const body = () => { ctx.beginPath(); ctx.moveTo(0, -hw * .7); ctx.quadraticCurveTo(len / 2, -hw + wig, len, -hw); ctx.arc(len, 0, hw, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(len / 2, hw + wig, 0, hw * .7); ctx.closePath(); };
  // tail fin at the start
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-FIN.len, -FIN.spread); ctx.lineTo(-FIN.len * .6, 0); ctx.lineTo(-FIN.len, FIN.spread); ctx.closePath();
  ctx.fillStyle = BRIDGE.fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = BRIDGE.ink * .75; ctx.stroke();
  body(); ctx.fillStyle = BRIDGE.fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = BRIDGE.ink; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8, hw * .35); ctx.quadraticCurveTo(len / 2, hw * .5 + wig, len - 4, hw * .35);
  ctx.strokeStyle = BRIDGE.belly; ctx.lineWidth = hw * .5; ctx.stroke();
  // the face at the far end, looking up off the page (unrotated so it is never upside down)
  ctx.translate(len, 0); ctx.rotate(-ang); ctx.fillStyle = INK;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * FACE.eyeDx, -3, FACE.eye, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, 1, FACE.smile, .2, Math.PI - .2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

/** Scoops reaching: an ink-edged arm from the lead up to the post top, a scoop at the tip. */
export function drawReach(ctx, fs) {
  const a = fs.action, l = fs.party[0];
  if (!a || a.kind !== 'reach' || !l || l.foldAnim < 1) return;
  const g = a.u < REACH.out ? eOutCubic(a.u / REACH.out) : a.u < REACH.hold ? 1 : 1 - (a.u - REACH.hold) / (1 - REACH.hold) * .3;
  const sx = wx(l.x), sy = wy(l.y) - REACH.from;
  const tx = wx(a.i + .5), ty = wy(a.j + OBJ.postY) - OBJ.candyLift;
  const ex = sx + (tx - sx) * g, ey = sy + (ty - sy) * g, mx = (sx + ex) / 2 - 10, my = Math.min(sy, ey) - 18;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const arm = () => { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); };
  arm(); ctx.strokeStyle = INK; ctx.lineWidth = REACH.w + REACH.ink * 2; ctx.stroke();
  arm(); ctx.strokeStyle = REACH.fill; ctx.lineWidth = REACH.w; ctx.stroke();
  ctx.beginPath(); ctx.arc(ex, ey, REACH.scoopR, 0, 7); ctx.fillStyle = REACH.scoop; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = REACH.ink; ctx.stroke();
  ctx.restore();
}
