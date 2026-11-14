// Puzzle and story objects on a stage (Task 4): plates, gates, tall posts, stones, the lollipop, waiting
// friends, the do-over pumpkin, the giant pumpkin and its door. All in ink and full colour: you can use them.
// Baked once per stage (every state of each: plate up/down, gate closed/open, post full/empty, bell still/rung);
// per frame the stage view only picks a sprite and blits it. Nothing here moves except the bobs (Task 5
// animates the changes).
import { R, INK, wx, wy, mk, wob, heartPts } from './core.js';
import { makeProp, bakeProp, drawProp, drawPropAt } from './props.js';
import { candyArt } from './sprites.js';
import { prepareActors, drawMember } from './actors.js';

const INKLOOK = { shadow: true, streaks: true };
export const OBJ = {
  plateY: .55, gateY: .85, postY: .82, stoneY: .55, lolliY: .7, dooverY: .8,
  candyW: 34, candyLift: 112,                         // the candy on a tall post, centred this far above its feet
  lolliW: 40, lolliBob: 3,
  friendBob: 2.2, friendBobHz: .55, friendFace: -1,   // waiting friends face the way the team comes in (left)
  heart: { size: 15, lift: 16, pulse: .12, col: '#E4574A' },
  rainbow: ['#E4574A', '#F39A3B', '#F6D24A', '#7FC25B', '#5DA9DA', '#9C7BD8'],
};

const key = (i, j) => i + ',' + j;
const seedOf = (i, j, n = 0) => i * 131 + j * 17 + n;
// grow: extra px of room above the drawn parts, for what extra() draws (the candy on a post)
const ink = (kind, x, y, s, seed, extra, grow = 0) => { const p = makeProp(kind, x, y, s, seed, true, INKLOOK); p.bb[1] -= grow; return bakeProp(p, extra); };

/** Bakes every object sprite for the stage into view.obj. */
export function bakeObjects(view, stage, assets) {
  const O = view.obj = { plates: new Map(), gates: new Map(), posts: new Map(), stones: [], lolli: null, heart: bakeHeart() };
  for (const [i, j] of stage.plates) {
    const x = wx(i + .5), y = wy(j + OBJ.plateY), s = seedOf(i, j);
    O.plates.set(key(i, j), { up: bakeProp(makeProp('plate', x, y, 1, s, true)), down: bakeProp(makeProp('platedown', x, y, 1, s, true)) });
  }
  for (const [i, j] of stage.gates) {
    const x = wx(i + .5), y = wy(j + OBJ.gateY), s = seedOf(i, j);
    O.gates.set(key(i, j), { closed: ink('gate', x, y, 1, s), open: ink('gateopen', x, y, 1, s) });
  }
  const candy = candyArt(assets);
  for (const p of stage.posts) {
    const [i, j] = p.at, x = wx(i + .5), y = wy(j + OBJ.postY), s = seedOf(i, j);
    if (p.kind === 'bell') O.posts.set(key(i, j), { full: ink('bellpost', x, y, 1, s), empty: ink('bellrung', x, y, 1, s) });
    else O.posts.set(key(i, j), {
      full: ink('candypost', x, y, 1, s, g => {
        const cy = y - OBJ.candyLift, w = OBJ.candyW, h = w * candy.height / candy.width;
        g.fillStyle = '#FFF1A8'; g.strokeStyle = '#E8C94A'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, cy, 17, 0, 7); g.fill(); g.stroke();
        g.drawImage(candy, x - w / 2, cy - h / 2, w, h);
      }, 34),
      empty: ink('candypost', x, y, 1, s),
    });
  }
  // stones: three looks baked at the origin, drawn on whichever water tile holds one
  for (let n = 0; n < 3; n++) O.stones.push(bakeProp(makeProp('stone', 0, 0, 1, 900 + n * 37, true)));
  if (stage.lollipop) {
    const [i, j] = stage.lollipop, x = wx(i + .5), y = wy(j + OBJ.lolliY), im = rainbowLollipop(assets);
    O.lolli = bakeProp(makeProp('glow', x, y, 1, seedOf(i, j), true), g => {
      const w = OBJ.lolliW, h = w * im.height / im.width; g.drawImage(im, x - w / 2, y - 22 - h / 2, w, h);
    });
  }
  // static: the do-over pumpkin(s), the giant pumpkin, its door and the mat in front of it
  for (const [i, j] of stage.doOver) view.props.push(ink('doover', wx(i + .5), wy(j + OBJ.dooverY), 1, seedOf(i, j)));
  if (stage.pumpkin.length) {
    const is = stage.pumpkin.map(p => p[0]), js = stage.pumpkin.map(p => p[1]);
    const x0 = Math.min(...is), x1 = Math.max(...is) + 1, feet = wy(Math.max(...js) + 1) - 2;
    const gp = makeProp('giant', wx((x0 + x1) / 2), feet, (x1 - x0) * 48 + 24, 4711, true, { shadow: true });   // its height: propkinds GIANT_RY
    view.props.push(bakeProp(gp));
    if (stage.door.length) {
      const ds = stage.door.map(p => p[0]), dx = wx((Math.min(...ds) + Math.max(...ds) + 1) / 2), dj = stage.door[0][1];
      const door = ink('door', dx, feet, 1, 4712); door.y = wy(dj + .05); view.props.push(door);   // sorts in front of the pumpkin
      view.flat.push(bakeProp(makeProp('mat', dx, wy(dj + .55), (Math.max(...ds) - Math.min(...ds) + 1) * 48 - 20, 4713, true)));
    }
  }
}

/** Ground-level objects, drawn before the depth sort: plates and stones. */
export function drawFlatObjects(ctx, view, fs) {
  const O = view.obj;
  for (const p of fs.plates || []) { const s = O.plates.get(key(p.i, p.j)); if (s) drawProp(ctx, p.down ? s.down : s.up); }
  for (const st of fs.stones || []) drawPropAt(ctx, O.stones[(st.i * 7 + st.j) % O.stones.length], wx(st.i + .5), wy(st.j + OBJ.stoneY));
}

/** Adds the standing objects to the depth-sorted list. Props come as { y, p[, bob] }; friends as { y, friend }. */
export function pushObjectItems(view, fs, items, t, vx0, vx1) {
  const O = view.obj, on = p => p.bb[2] > vx0 && p.bb[0] < vx1;
  for (const g of fs.gates || []) { const s = O.gates.get(key(g.i, g.j)); if (s) { const p = g.open ? s.open : s.closed; if (on(p)) items.push({ y: p.y, p }); } }
  for (const q of fs.posts || []) { const s = O.posts.get(key(q.i, q.j)); if (s) { const p = q.taken ? s.empty : s.full; if (on(p)) items.push({ y: p.y, p }); } }
  if (O.lolli && fs.lollipop && !fs.lollipop.taken) items.push({ y: O.lolli.y, p: O.lolli, bob: Math.sin(t * .004 + 2.3) * OBJ.lolliBob });
  for (const f of fs.friends || []) { const x = wx(f.i + .5); if (x > vx0 && x < vx1) items.push({ y: wy(f.j + .5), friend: f }); }
}

/** A friend waiting on its join tile: its folded drawing in full ink, a small bob, a heart that beats above. */
export function drawFriend(ctx, view, f, t) {
  const A = prepareActors(view.assets), rec = A.chars[f.id]; if (!rec) return;
  const x = wx(f.i + .5), y = wy(f.j + .5), ph = f.i * .7;
  const u = Math.sin(t * .001 * Math.PI * 2 * OBJ.friendBobHz + ph), bob = (u * .5 + .5) * OBJ.friendBob * 2;
  const sw = rec.folded.s.w * .75 * (1 - bob * .02); ctx.drawImage(A.shadow.c, x - sw / 2, y - 7, sw, 14);
  drawMember(ctx, view.assets, { id: f.id, form: 'folded', foldAnim: 1, moving: false, faceX: OBJ.friendFace, facing: 'left' }, x, y - bob, t, { shadow: false });
  const H = OBJ.heart, beat = 1 + H.pulse * Math.max(0, Math.sin(t * .006 + ph)) ** 6, hs = view.obj.heart, k = beat;
  const top = y - bob - (rec.folded.foot) - H.lift;
  ctx.drawImage(hs.c, x - hs.w * k / 2, top - hs.h * k / 2, hs.w * k, hs.h * k);
}

function bakeHeart() {
  const S = OBJ.heart.size, pad = 4, w = S * 2 + pad * 2, c = mk(w * R.BS, w * R.BS), g = c.getContext('2d');
  g.scale(R.BS, R.BS); g.translate(w / 2, w / 2 + 1); g.lineJoin = 'round';
  const p = wob(heartPts(0, 0, S * 1.9), true, .4, 77, 6);
  g.fillStyle = OBJ.heart.col; g.fill(p.p); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke(p.p);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.arc(-S * .35, -S * .25, S * .28, 3.4, 4.6); g.stroke();
  // two little sparkles: "come here"
  g.strokeStyle = INK; g.lineWidth = 1.8;
  for (const [sx, sy, r] of [[S * .95, -S * .7, 3.5], [-S * 1.0, -S * .55, 2.6]]) { g.beginPath(); g.moveTo(sx - r, sy); g.lineTo(sx + r, sy); g.moveTo(sx, sy - r); g.lineTo(sx, sy + r); g.stroke(); }
  return { c, w, h: w };
}

// His lollipop drawing with the head coloured in rainbow rings (multiply keeps his black lines black).
function rainbowLollipop(assets) {
  if (assets.cache.rainbowLolli) return assets.cache.rainbowLolli;
  const im = assets.img.lollipop, c = mk(im.width, im.height), g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const cx = im.width * .31, cy = im.height * .32, rr = im.width * .3;
  OBJ.rainbow.forEach((col, n) => { g.globalAlpha = .9; g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, rr, n / 6 * Math.PI * 2, (n + 1) / 6 * Math.PI * 2 + .02); g.closePath(); g.fill(); });
  g.globalAlpha = 1; g.globalCompositeOperation = 'multiply'; g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
  return (assets.cache.rainbowLolli = c);
}
