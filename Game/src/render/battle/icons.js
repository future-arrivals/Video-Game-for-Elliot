// Small marker pictures for the battle screen: move icons, enemy card icons, type icons, badges, food.
// Each draws centred at (cx, cy) inside a box about 2*s across. Plain paths, round joins, ink outline.
// Keys are move ids (claw, snack, ...) or the lower-case enemy card word (flap, bite, ...).
import { INK, PAPER, heartPts } from '../core.js';

const RED = '#D03C30', PINK = '#E99DBB', BLUE = '#8CC8DC', YEL = '#F3D36A', CREAM = '#F6E7C8', GREEN = '#7DBE6A';

function poly(g, pts, fill, lw = 3, close = true) {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
}
function circ(g, x, y, r, fill, lw = 3) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
function heart(g, x, y, s, fill, lw = 2.5) { poly(g, heartPts(x, y, s), fill, lw); }
function line(g, pts, lw = 3, col = INK) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); }

function teeth(g) {
  poly(g, [[-15, -9], [15, -9], [15, 9], [-15, 9]], '#fff');
  line(g, [[-15, 0], [-10, -6], [-5, 0], [0, -6], [5, 0], [10, -6], [15, 0]], 2.4);
  line(g, [[-15, 0], [-10, 6], [-5, 0], [0, 6], [5, 0], [10, 6], [15, 0]], 2.4);
}
function ghost(g, fill = '#fff') {
  poly(g, [[-11, 14], [-12, -2], [-8, -12], [0, -15], [8, -12], [12, -2], [11, 14], [6, 10], [2, 14], [-2, 10], [-6, 14]], fill);
  g.fillStyle = INK; g.beginPath(); g.arc(-4, -4, 2.2, 0, 7); g.arc(4, -4, 2.2, 0, 7); g.fill();
  g.beginPath(); g.ellipse(0, 4, 2.5, 3, 0, 0, 7); g.fill();
}
function drop(g, fill = BLUE) { poly(g, [[0, -15], [8, -3], [10, 5], [6, 12], [0, 14], [-6, 12], [-10, 5], [-8, -3]], fill); }
function scoop(g, x, y, r, fill) { circ(g, x, y, r, fill, 2.6); }

const ICONS = {
  claw(g) { for (const d of [-8, 0, 8]) line(g, [[d - 4, 12], [d + 2, 2], [d + 2, -8], [d - 2, -14]], 4); },
  snack(g) { pizza(g); },
  chomp(g) { teeth(g); },
  bite(g) { teeth(g); },
  gulp(g) { poly(g, [[-15, -2], [-8, -12], [8, -12], [15, -2], [8, 13], [-8, 13]], '#5a2a2a'); poly(g, [[-7, 6], [0, 2], [7, 6], [0, 11]], RED, 2); },
  burp(g) {
    poly(g, [[-14, 6], [-15, -2], [-9, -8], [-3, -13], [5, -11], [11, -6], [15, 1], [11, 9], [0, 11], [-9, 11]], '#D8E8B8');
    circ(g, -4, 0, 3, RED, 2); circ(g, 5, -2, 2.6, YEL, 2); circ(g, 1, 6, 2.2, '#C98A4A', 2);
  },
  splash(g) { drop(g); },
  hug(g) { heart(g, 0, 0, 30, PINK); },
  slap(g) { poly(g, [[-2, 14], [-4, 2], [-14, -12], [-4, -8], [0, -2], [4, -8], [14, -12], [4, 2], [2, 14]], PINK); },
  love(g) { heart(g, -8, 4, 16, PINK, 2); heart(g, 8, 4, 16, PINK, 2); heart(g, 0, -7, 16, RED, 2); },
  bonk(g) { poly(g, [[-11, -10], [11, -10], [0, 15]], '#E2B878'); line(g, [[-6, -3], [4, 6]], 1.8); line(g, [[6, -3], [-4, 6]], 1.8); },
  lift(g) { dumbbell(g); },
  drop(g) { scoop(g, 0, 4, 10, PINK); line(g, [[-6, -14], [-6, -8]], 2.4); line(g, [[0, -16], [0, -10]], 2.4); line(g, [[6, -14], [6, -8]], 2.4); },
  smash(g) { scoop(g, -6, 9, 6, PINK); scoop(g, 3, 1, 6, '#F6E3B0'); scoop(g, 8, -7, 6, '#B5DDB0'); scoop(g, 14, -14, 5, PINK); },
  open(g) { poly(g, [[-15, -8], [-2, -12], [-2, 12], [-15, 8]], PINK); poly(g, [[2, -12], [15, -8], [15, 8], [2, 12]], PINK); },
  fold(g) { poly(g, [[-13, -12], [9, -12], [14, -6], [14, 12], [-13, 12]], YEL); g.setLineDash([3, 3]); line(g, [[-13, 0], [14, 0]], 2); g.setLineDash([]); },
  flap(g) { poly(g, [[-15, -4], [-6, -10], [0, -4], [6, -10], [15, -4], [11, 2], [6, 0], [3, 6], [0, 2], [-3, 6], [-6, 0], [-11, 2]], '#6C5A7A'); },
  curl(g) { g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 4, r = 1 + i * .32; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke(); },
  poke(g) { poly(g, [[-14, 12], [-6, -2], [10, -14], [2, 2], [-8, 14]], '#5a4a3a'); },
  web(g) { web(g, 14); },
  spook(g) { ghost(g); },
  float(g) { g.save(); g.scale(.8, .8); g.translate(0, 4); ghost(g, '#EAF3FA'); g.restore(); line(g, [[-14, -6], [-14, -15]], 2.4); line(g, [[-17, -12], [-14, -15], [-11, -12]], 2.4); line(g, [[14, -6], [14, -15]], 2.4); line(g, [[11, -12], [14, -15], [17, -12]], 2.4); },
};

function pizza(g) {
  poly(g, [[-13, -11], [13, -11], [0, 15]], '#F5CF6A');
  line(g, [[-13, -11], [13, -11]], 5, '#C98A4A');
  circ(g, -4, -4, 2.6, RED, 1.6); circ(g, 4, -3, 2.6, RED, 1.6); circ(g, 0, 5, 2.4, RED, 1.6);
}
function dumbbell(g) {
  line(g, [[-10, 0], [10, 0]], 4);
  for (const d of [-1, 1]) { poly(g, [[d * 9, -10], [d * 15, -10], [d * 15, 10], [d * 9, 10]], '#7E8CA0', 2.5); }
}
function web(g, r) {
  g.strokeStyle = INK; g.lineWidth = 1.8;
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; line(g, [[0, 0], [Math.cos(a) * r, Math.sin(a) * r]], 1.8); }
  for (const k of [.35, .65, .95]) { const pts = []; for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]); } line(g, pts, 1.6); }
}
function sparkle(g) {
  poly(g, [[0, -15], [4, -4], [15, 0], [4, 4], [0, 15], [-4, 4], [-15, 0], [-4, -4]], '#FFE27A');
  poly(g, [[11, -14], [12.5, -10], [16, -9], [12.5, -8], [11, -4], [9.5, -8], [6, -9], [9.5, -10]], '#fff', 1.6);
}
function sausage(g) { g.save(); g.rotate(-.3); poly(g, [[-14, -4], [-10, -8], [10, -8], [14, -4], [14, 4], [10, 8], [-10, 8], [-14, 4]], '#C0563A'); line(g, [[-6, -3], [6, -3]], 1.6, '#f6c9b0'); g.restore(); }
function fishFood(g) { poly(g, [[-14, 0], [-6, -8], [6, -8], [11, 0], [6, 8], [-6, 8]], '#9CC4E4'); poly(g, [[10, 0], [16, -7], [16, 7]], '#9CC4E4', 2.4); g.fillStyle = INK; g.beginPath(); g.arc(-7, -1, 1.8, 0, 7); g.fill(); }
function candy(g) {
  poly(g, [[-15, -8], [-7, 0], [-15, 8]], PINK, 2.4); poly(g, [[15, -8], [7, 0], [15, 8]], PINK, 2.4);
  circ(g, 0, 0, 8, RED, 2.6);
}

function at(g, cx, cy, s, fn) { g.save(); g.translate(cx, cy); g.scale(s / 16, s / 16); g.lineJoin = 'round'; g.lineCap = 'round'; fn(g); g.restore(); }

/** A move or enemy-card icon. key: move id or lower-case card word. s: half size in px (16 = base). */
export function drawIcon(g, key, cx, cy, s = 16) {
  const fn = ICONS[key] || ((gg) => sparkle(gg));
  at(g, cx, cy, s, fn);
}
/** Type icons: sweet (wrapped candy), spooky (ghost), chompy (teeth). */
export function drawTypeIcon(g, type, cx, cy, s = 16) {
  at(g, cx, cy, s, type === 'sweet' ? candy : type === 'spooky' ? (gg) => ghost(gg) : teeth);
}
export const drawSparkle = (g, cx, cy, s = 16) => at(g, cx, cy, s, sparkle);
export const drawDumbbell = (g, cx, cy, s = 16) => at(g, cx, cy, s, dumbbell);
export const drawWeb = (g, cx, cy, s = 16) => at(g, cx, cy, s, (gg) => web(gg, 15));
/** Tummy food for a stored number: 1-2 sausage, 3-4 fish, 5 or more pizza. */
export function drawFood(g, n, cx, cy, s = 16) { at(g, cx, cy, s, n >= 5 ? pizza : n >= 3 ? fishFood : sausage); }
/** A heart path filled with `fill` (for heal digits, hearts bars use their own cached paths). */
export function drawHeartIcon(g, cx, cy, size, fill = GREEN, lw = 3) { g.save(); g.lineJoin = 'round'; poly(g, heartPts(cx, cy, size), fill, lw); g.restore(); }
export const COLOURS = { RED, PINK, BLUE, YEL, CREAM, GREEN, PAPER };
