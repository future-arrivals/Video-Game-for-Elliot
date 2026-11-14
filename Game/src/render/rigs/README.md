# Porting a character from its demo page to a canvas rig

One character per task. You will write two files and run two commands. You do not need to read `rig.js`
beyond its top comment. Munch (`monster.build.mjs`, `monster.js`) is the worked example: keep it open.

Never edit anything under `Art/`. The demo pages are read-only references.

## 0. Read the demo

Open `Art/Demos/<name>_animation_demo.html`. The parts you need are all in its `<script>`:

| Demo section | What it gives you |
|---|---|
| `stage constants` (`const SX=480,GY=540,BASE=..,CX=..,CGY=..`) | `stagePx` = BASE (some call it `K`, `KB`), `feet` = `[CX, CGY]` |
| `tag the parts` | which elements are parts, their names, their pivots |
| `accumulate per-part pose` (`add`) | nothing to copy: the runtime's `c.add` is the same |
| `modes` (`M.idle = {...}` ...) | the clips: copy them |
| `render(T)` | the per-frame code: copy it into `pose(c)` |
| `window.__<name> = { seek(mode, t, f) }` | how to pause the demo at a time for comparison |

## 1. Build recipe: `rigs/<id>.build.mjs`

Copy `monster.build.mjs` and change:

- `id`: the game id (the key used in `assets.js`, e.g. `fish`).
- `demo`: the demo page path.
- `root`: the CSS selector of the `<g>` that the demo transforms as a whole (Munch: `#rig`; look for the
  element whose `transform` the render function sets with `translate(SX ...) scale(K)`). It must have no
  transform of its own in the HTML.
- `scale`: atlas px per character unit. Aim for the full drawing to be about 500 px tall:
  `scale = 500 / (drawing height in units)`. Munch: 642 units tall, scale 0.8.
- Parts. Two ways, mix freely:
  - `ids: true` makes every element with an `id` under the root a part, named by its id. The tool runs the
    demo's own script first (with the animation loop switched off), so ids the script adds (Munch's
    `brow-left`, the `foods` group) exist. Use this when the demo's `P[...]`/`reg(...)` names are element ids.
  - `parts: { name: { sel: 'css selector', pivot } }` for parts the demo builds from element lists instead of
    ids (scoops' `mkSub(regU, 'e5L', [ch(s,1), ch(s,2)])`): write a selector matching those elements, for
    example `'#u-scoop-5 > :nth-child(2), #u-scoop-5 > :nth-child(3)'` (`ch(s,i)` is `:nth-child(i+1)`).
    All matched elements share the part's pose. If the demo wraps elements in a new `<g id=...>` itself
    (heartfin's `wrap1(el, 'eyeL')`), `ids: true` already finds it.
- Pivots. Copy the demo's rule exactly:
  - a fixed table (Munch's `FIX`) goes in `pivots: { name: [x, y] }`;
  - rules go in `pivotRules: [[regex, rule], ...]`, first match wins. Rules: `'center'` (bounding-box centre,
    the demo's `bb.x+bb.width/2`), `'start'` (first `<path>`'s `M x y`), `'pt0'` (`getPointAtLength(0)`),
    `'near:281'` (the end of the first path nearest x = 281, the demos' `nearEnd(el, 281)` / `mkLimb`);
  - a part's own `pivot` in `parts` wins over both. Unmatched parts get `'center'`.

Run from `Game/`:

```
node tools/rigparts.mjs <id>
```

It prints the part count, layer count and atlas size, and notes for anything odd ("drawn element outside
every part" means some drawing is under the root but in no part: give its container an entry in `parts`, or
it will be missing). Look at `Game/assets/rigs/<id>/atlas.png` with the Read tool: every piece should be there,
none cut off.

Then add the atlas and JSON to `src/assets.js` next to Munch's:

```js
rig_<id>: { path: 'assets/rigs/<id>/atlas.png', maxH: 1024, palette: true },   // in ASSET_LIST
export const RIG_LIST = { monster: '...', <id>: 'assets/rigs/<id>/rig.json' };
```

## 2. Clip code: `rigs/<id>.js`

Copy `monster.js` as the skeleton, delete Munch's clips, and port the demo's. Then register it in `rig.js`:
`import <id> from './rigs/<id>.js'` and add it to `DEFS`.

Rules (these keep it faithful; do not "improve" the maths):

1. Copy the helpers you need from `./kit.js` (they are the demos' `clamp, sm, eob, keys, rng, breath, ...`
   unchanged). If a demo has a helper that kit lacks (heartfin's `lub`, scoops' `spring`), paste it into your
   file as is.
2. Copy every number. Same timings, same keyframes, same seeds.
3. `M.<clip>` objects: keep `state(t, form)` and `extra(...)` bodies; add `label`, `dur`, `loop` (`true` for
   idle/walk/hop cycles; `false` for one-shots: unfold, attack, hurt, happy) and `forms` when a clip only works
   in one form (`[0]` folded only, `[1]` open only). The demo's global `form` becomes the `form` argument.
4. The demo's `render(T)` becomes `pose(c)`. Replace, line by line:

| Demo | Port |
|---|---|
| `t` (clip time), `T` (global time) | `c.t`, `c.T` |
| `form` (or `formSel`, `formS`) | `c.form` |
| `cur === 'chomp'` | `c.clip === 'chomp'` |
| `add(id, {...})`, `A(id, {...})` | `c.add(id, {...})` (`const A = c.add` is fine) |
| `setT(id, 'translate(..) rotate(..) ...')` | `c.local(id).translate(..).rotate(deg, cx, cy).scale(sx, sy).skewX(deg)` in the same order |
| `rig.setAttribute('transform', 'translate(SX GY) scale(K) <rest>')` | `c.root().<rest>` (drop the `translate(SX GY) scale(K)` part) |
| `el.setAttribute('opacity', a)` | `c.alpha(id, a)` |
| `visibility hidden` | `c.hide(id)` |
| `P[id].piv` | `c.pivot(id)` |
| `api.S(cx, cy)` | `S(cx, cy)` returning `[(cx-CX+b.x)*K, (cy-CGY-b.y)*K]` (relative to the feet) |
| an absolute stage number (`y = 100`, `x = 830`) | `100 - GY`, `830 - SX` |
| `fxAdd(o)` | `c.fx.push(o)` |
| `wordPop(...)` | `wordPop(c, ...)` |
| shadow ellipse attributes | `c.shadow = { x: b.x*K, y: 3, rx, ry, a }` (stage px, relative to the feet) |
| glow circle | `c.glow = { x, y, r, a }` (stage px, relative to the feet) |
| `fm.setAttribute('values', ...)` flash | `c.flash = { a, c: [r, g, b] }` |
| world shake / ground scroll | `c.shake[0] = dx; c.shake[1] = dy; c.scroll = px` |
| zoom | `c.zoom = st.zoom; const K = BASE * (c.useZoom ? st.zoom : 1)` |

5. Export `{ id, name, stagePx: BASE, feet: [CX, CGY], clips, order, pose }` (copy the tail of `monster.js`).
   `order` is the demo's `ORDER`. If the demo's fx use symbols other than star, dot, scrap, spike, add
   `symbols: { heart: 'M...Z' }` with the `<symbol>` outline converted to path data.

## 3. Check it

From `Game/`, for each clip take 4 to 6 frames and compare with the demo at the same time:

```
node tools/shot.mjs --out .shots/rig/<id>-hop-0.45.png --page Game/dev/rig.html --query "rig=<id>" --size 960x600 --dpr 1 --wait 300 --eval "(__game.setForm(0), __game.setClip('hop'), __game.tick(0.45))"
```

The demo side: open the demo page in the same headless Chrome and call
`window.__<name>.seek('hop', 0.45, 0)`, then screenshot `#stage` (the dev page draws the same 960x600 stage,
with zoom on, so the two line up). Seek twice when switching clips: Chrome may keep a stale flash filter
from the previous seek. Look at both with the Read tool. Pick times that show the extremes: anticipation,
peak, landing, the start and end of each one-shot, and each word pop.

Also: `__game.bench(300)` on the dev page reports pose and pose+draw time per frame; `npm test` must pass.

## Tricky parts (expect these)

- Parts made of non-adjacent elements (scoops' `e1L = children 1,2,10,11`): the tool keeps draw order by
  cutting such a part into several layers that share one pose. Nothing to do, but check the atlas.
- Parts that sit under an authored `transform` in the HTML: the tool notes it. The pivot is taken in root
  space; if the demo composes a base matrix (scoops' `s.base`, `fixed` arms with `s.mat`), port that into
  `c.local(id)` explicitly.
- Two separate drawings for the two forms (scoops has `#rigU` and `#rigF`): make two rigs
  (`<id>`, `<id>_folded`) with two build recipes, and choose by form in the game. Characters whose folded
  form is the same drawing with panels moved (Munch, heartfin) need one rig.
- Clip-paths (heartfin's `clipA`/`clipB`) are baked into the layer bitmap at rest. If the demo moves the
  clipped content under a fixed clip, the bitmap cannot do that: split the content into pieces at the clip
  line in the recipe, or accept and note it.
- Group opacity on a part with overlapping children becomes per-layer alpha (overlaps show through while
  fading). Only visible during fades.
