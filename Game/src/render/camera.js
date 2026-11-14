// Follow camera (A2 numbers): target = lead + velocity x 0.32 s look-ahead (clamped to +-90 px)
// + 40 px forward bias; exponential follow, stiffness k = 9/s; zoom follows at 0.8 k.
// cam.cx, cam.cy are the world px at the screen centre; cam.z the zoom. Scrolls along x only,
// never past the stage ends. At zoom 1, cy = 195 so world px y equals screen y.
import { W, H, TILE_W, clamp } from './core.js';

const ZMIN = .85, ZMAX = 1.45;

export function createCamera(stage) {
  const cam = { cx: W / 2, cy: H / 2, z: 1, stageW: stage.width * TILE_W, dir: 1 };
  cam.cx = clampX(cam, cam.cx, 1);
  return cam;
}

/** Centre y for zoom z: the bottom edge stays on the screen bottom, so a push-in crops the horizon band. */
export const centreY = z => H - H / 2 / z;

function clampX(cam, x, z) {
  const half = W / 2 / z;
  if (cam.stageW <= half * 2) return cam.stageW / 2;
  return clamp(x, half, cam.stageW - half);
}

/** lead: {x, y, vx} in tile units (vx tiles/s). opts: {zoom, k, focusX (tile units, pulled halfway),
 *  cy (world px centre y override, e.g. 176 for the hero unfold), snap}. */
export function updateCamera(cam, lead, dt, { zoom = 1, k = 9, focusX = null, cy = null, snap = false } = {}) {
  const tz = clamp(zoom, ZMIN, ZMAX);
  if (lead.vx > .05) cam.dir = 1; else if (lead.vx < -.05) cam.dir = -1;
  let tx = lead.x * TILE_W + clamp(lead.vx * TILE_W * .32, -90, 90) + 40 * cam.dir;
  if (focusX != null) tx = (tx + focusX * TILE_W) / 2;
  if (snap) { cam.z = tz; cam.cx = clampX(cam, tx, tz); cam.cy = cy ?? centreY(tz); return cam; }
  cam.z += (tz - cam.z) * (1 - Math.exp(-k * .8 * dt));
  const a = 1 - Math.exp(-k * dt);
  cam.cx = clampX(cam, cam.cx + (tx - cam.cx) * a, cam.z);
  cam.cy = cy == null ? centreY(cam.z) : cam.cy + (cy - cam.cy) * a;
  return cam;
}

/** World px -> screen px. */
export const toScreen = (cam, x, y) => [(x - cam.cx) * cam.z + W / 2, (y - cam.cy) * cam.z + H / 2];
