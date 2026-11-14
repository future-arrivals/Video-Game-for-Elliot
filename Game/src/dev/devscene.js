// Throwaway dev scene (Task 4 replaces it): arrow keys / WASD move the fixture's lead so the camera,
// depth sorting and fading can be seen. J (Square) folds/unfolds the lead. Followers trail the lead.
// Query parameters: x, y (lead tile position), form (folded|open), fold (foldAnim, held fixed),
// party (1|3), bat (patrol|asleep|ignore), zoom, moving (1 = walk bob on).
import { fixtureStage, fixtureField } from './fixture.js';
import { createStageView, renderStage } from '../render/stageview.js';
import { createCamera, updateCamera } from '../render/camera.js';
import { drawFieldHud } from '../render/hud.js';

export function createDevScene(assets, query = new URLSearchParams(location.search)) {
  const num = (k, d) => query.has(k) ? Number(query.get(k)) : d;
  const stage = fixtureStage();
  const fs = fixtureField(stage, { x: query.has('x') ? num('x') : undefined, y: query.has('y') ? num('y') : undefined,
    form: query.get('form') || 'folded', fold: num('fold', 1), party: num('party', 3), batMode: query.get('bat') || 'patrol', lead: query.get('lead') || 'monster' });
  const view = createStageView(stage, assets);
  const cam = createCamera(stage);
  const zoom = num('zoom', 1), forceMoving = query.get('moving') === '1';
  const keys = new Set();
  addEventListener('keydown', e => {
    keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === 'j') { const m = fs.party[0]; m.form = m.form === 'open' ? 'folded' : 'open'; m.foldAnim = 1 - m.foldAnim; }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  const trail = [];                       // lead positions, newest first, for followers
  let vx = 0;
  const lead = fs.party[0];
  for (let i = 0; i < 200; i++) trail.push({ x: lead.x - i * .05, y: lead.y });
  updateCamera(cam, { x: lead.x, y: lead.y, vx: 0 }, 0, { zoom, snap: true });

  function update(dt) {
    fs.time += dt;
    const k = id => keys.has(id);
    const mx = (k('arrowright') || k('d') ? 1 : 0) - (k('arrowleft') || k('a') ? 1 : 0);
    const my = (k('arrowdown') || k('s') ? 1 : 0) - (k('arrowup') || k('w') ? 1 : 0);
    const sp = k('shift') ? 5.5 : 4;
    const nx = lead.x + mx * sp * dt, ny = lead.y + my * sp * dt;
    const r = .3, ok = (x, y) => !stage.isSolid(Math.floor(x - r), Math.floor(y)) && !stage.isSolid(Math.floor(x + r), Math.floor(y)) && y > .3 && y < stage.depth - .3 && x > .3 && x < stage.width - .3;
    const ox = lead.x, oy = lead.y;
    if (ok(nx, lead.y)) lead.x = nx;
    if (ok(lead.x, ny)) lead.y = ny;
    vx = (lead.x - ox) / Math.max(dt, 1e-6);
    lead.moving = forceMoving || lead.x !== ox || lead.y !== oy;
    if (mx) lead.faceX = mx;
    if (mx || my) lead.facing = Math.abs(my) > Math.abs(mx) ? (my < 0 ? 'back' : 'front') : (mx < 0 ? 'left' : 'right');
    if (lead.foldAnim < 1 && !query.has('fold')) lead.foldAnim = Math.min(1, lead.foldAnim + dt / .5);
    if (lead.moving && (lead.x !== ox || lead.y !== oy)) {
      trail.unshift({ x: lead.x, y: lead.y }); if (trail.length > 400) trail.pop();
    }
    // followers: walk the trail at 1.25 tiles spacing
    for (let n = 1; n < fs.party.length; n++) {
      const m = fs.party[n]; let dist = 0, p = trail[0];
      for (let i = 1; i < trail.length; i++) { dist += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y); p = trail[i]; if (dist >= n * 1.25) break; }
      m.moving = lead.moving; if (Math.abs(p.x - m.x) > .01) m.faceX = p.x > m.x ? 1 : -1; m.x = p.x; m.y = p.y;
    }
    // bat walks its patrol loop
    for (const c of fs.creatures) if (c.mode === 'patrol') {
      const sp0 = stage.spawns[0], loop = sp0.patrol.map(([i, j]) => [i + .5, j + .5]);
      let per = 0; const segs = loop.map((a, i) => { const b = loop[(i + 1) % loop.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); per += L; return { a, b, L }; });
      let d = (fs.time * 2) % per;
      for (const s of segs) { if (d <= s.L) { const u = d / s.L; const nx2 = s.a[0] + (s.b[0] - s.a[0]) * u; if (Math.abs(nx2 - c.x) > 1e-4) c.faceX = nx2 > c.x ? 1 : -1; c.x = nx2; c.y = s.a[1] + (s.b[1] - s.a[1]) * u; break; } d -= s.L; }
    }
    updateCamera(cam, { x: lead.x, y: lead.y, vx }, dt, { zoom });
  }
  function render(ctx, timeMs) {
    renderStage(ctx, view, fs, cam, timeMs);
    drawFieldHud(ctx, assets, fs, null);
  }
  return { update, render, fs, cam, view, stage };
}
