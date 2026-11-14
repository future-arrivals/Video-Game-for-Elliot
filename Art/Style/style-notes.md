# Pumpkin Patch: style notes

Mockups: `style-directions.html` (one self-contained file), plus screenshots `mockup-<A|B|C>-<overworld|battle>.png` (844x390 at 2x) and `style-directions-page.png`.

The characters will be clean SVG redraws of Elliot's drawings: hand-wobbly `#1a1a1a` outlines with round joins, flat marker fills, no gradients, built in parts for folding. The mockups still use rough photo crops as stand-ins. The ice cream (A) and the fish (C) are quick vector redraws, and the monster (B) is posterised, to show how flat vector characters sit in each world. The small doodles (bat, spider, ghost, candy) are thin pen lines in the photos, so the mockups thicken them. Their redraws need the same thick outline as the main characters and a paper-white body fill, or they will disappear on a TV.

## Rules for all three directions

- **Marker palette sampled from the drawings.** k-means over the crops, then lifted about 10 to 15% because the photos are under-exposed. Script: `tools/sample_palette.py`.

  | Name | Hex | Sampled | Where it comes from |
  |---|---|---|---|
  | Ink | `#1A1A1A` | | |
  | Paper | `#FBF8F0` | | |
  | Pumpkin orange | `#E8921C` | `#dd8f16` | |
  | Marigold | `#EEB23E` | `#e0a539` | |
  | Tomato red | `#D03C30` | `#c33b31` | |
  | Brick | `#C9633A` | `#c0653a` | |
  | Beaver brown | `#C25933` | | |
  | Dark brown | `#5E2C17` | `#562916` | |
  | Highlighter yellow | `#D6DA55` | `#bdc645` / `#cfce69` | |
  | Fish pink | `#E99DBB` | `#e69dba` | |
  | Vine green | `#2A7A3A` | `#227233` | |
  | Leaf green | `#82A836` | `#79a12f` | |
  | Juice olive | `#5A7410` | `#4f6903` | |
  | Teal | `#0E6E74` | `#04646c` | ice cream |
  | Light teal | `#46997E` | | |
  | Navy | `#163A86` | | straw |
  | Sky | `#8CC8DC` | | |

- **One look, one behaviour.** These rules hold in every direction:
  - A dashed outline always means "a power fits here". It carries the icon of the power that fits.
  - A soft round glow or halo always means "pick me up".
  - Stars under a move always count its hits, from 1 to 3.
  - The fold-sheet icon always means HIDE (folded, protected). It always sits on the ✕ button in the same left slot.
  - The big unfold move is always on △ in the right slot.
- **Battle layout.** The enemy is top right, with its next move in a bubble or flag beside it. The player is bottom left. Each move card has an icon, one word and a PlayStation shape badge. The shapes are drawn as SVG, not font glyphs, so they show on every device.
- **No flashing.** Motion is slow eases of 300 to 500 ms. Glows are static images: no pulsing, no screen shake, no white flash on a hit. A hit is shown as a small nudge plus a heart emptying.
- **Text.** Use very few words, all capitals, and never more than one word per button.
  - Font: embed **Andika** Bold (SIL Open Font License, designed for children learning to read). Subset it to A–Z, 0–9 and a few signs as base64 WOFF2, about 15 to 25 KB.
  - Fallback stack: `"Avenir Next Rounded", "Arial Rounded MT Bold", Verdana, sans-serif` (Avenir Next Rounded is on iOS).
  - Do not depend on Marker Felt or Comic Sans: Android doesn't have them.
  - Option: Elliot hand-letters the five or six move words and numbers in marker. They get redrawn the same way as the characters. That works best in A.
- **Production (all directions).** Draw the world as SVG at load, rasterise it once into offscreen canvases (512 px map chunks plus one sprite per prop), then only `drawImage` each frame. The SVGs are generated in code with a wobble helper, like `tools/build_style_directions.py` (`wob()`, `ell()`, `heart_pts()`): seeded jitter along each edge, smoothed with Catmull-Rom curves. That produces the same hand-wobbly line language as the character redraws, with no hand-made tile art. The phone cost is mostly the size of the rasterised chunks, about 6 to 12 MB of RAM for a few screens of map.

---

## A. Paper Page (chip: orange `#E8921C`)

**Idea.** The whole world is drawn on the same paper with the same marker as the characters. Things you can use (water, boulders, candy, creatures, switches) get thick `#1a1a1a` ink and full marker colour. Scenery gets thin grey "pencil" lines and pale colours.

**Palette**
- Page `#FBF8F0`: warm off-white, so it doesn't glare on a TV.
- Fold creases `#E6DFCF` with highlight `#FFFEFA`.
- Pencil line `#A39C8E`.
- Pale scenery tints, about 35% of the marker colours: pumpkin `#F8D9B4`, path `#F2E2BD`, grass ticks `#B7CF9B`, battle ground `#E5EFCF`.
- Interactive objects use the full marker palette, e.g. water `#8CC8DC` with `#3F86A6` ripples and a 4.5 px ink edge.
- Pickup glow `#FFF4B8` with ring `#E8C94A`.

**Outline and fill.**
- Interactive: 4 to 4.5 px `#1a1a1a`, round joins, flat fill. This is exactly the redraw spec.
- Scenery: 2 px pencil line with a pale fill.
- Shadows: a flat `#E3DCCB` ellipse, like a grey marker smudge.

**How the characters sit.** No extra treatment. They share the page's ink, line weight and colours, so they look as if they were drawn there.

**Tiles and props.** Everything is procedural. The page is one flat colour plus two crease lines. The rest is generated from a few shape functions (pumpkin, tuft, path strip, river, boulder) with seeded wobble. There's no tile seam problem because nothing repeats exactly.

**UI.** Hearts and cards are drawn in the same wobbly ink directly on the page; there are no panels. The selected card turns highlighter yellow.

**Fold and unfold.** The folded part hinges on its crease line:
1. Flap scales Y from 1 to 0 over about 200 ms. The back of the flap shows as plain paper with a slightly darker tint.
2. The inside part then scales 0 to 1 over about 200 ms, with ease-out.
3. A short pencil crease line stays for a moment.

Folding back reverses it. Because the parts are separate SVG groups in the redraws, this is just per-part transforms.

**Phone cost.** Lowest. No filters, no blur, no transparency stacking. Background chunks are fully opaque.

**Production work.** Lowest. One shape library plus a placement list per map. Inside the pumpkin (the ghost house), the same page "turns the lights off" (see recommendation).

**Weak spots.** It's the least atmospheric, and Halloween comes only from content (pumpkins, bats). A large white screen in a dark room is bright, so keep the page off-white and consider a "dusk" tint `#F3EBDD` for evening areas.

---

## B. Pop-Up Paper (chip: green `#6F8F3E`)

**Idea.** A construction-paper pop-up book. Scenery is flat paper glued down. Anything you can use stands up off the page, with a white die-cut edge and a cast shadow. The theme is folding paper, which matches the fold/unfold mechanic.

**Palette (matte construction-paper colours)**
- Sky `#9FC3B5`, hills `#6F8F3E`, field `#D9A24E` / `#E7B85B`, path kraft `#F0D39A`.
- Flat pumpkins `#D9772A` with ridges `#B85F1D`.
- Stream `#4F8FB0` with ripples `#9CC9DE`.
- Boulder card `#9A958A`, branch `#6B3A1C`, stage `#C99A5E`, curtain `#B8402F`.
- Shadow colour `#3A2410` at 35 to 40%.
- Battle backdrop `#2F3F5C`.

**Outline and fill.**
- Scenery has no ink outline: just flat paper with slightly ragged cut edges and a soft shadow under each layer.
- Interactive things get ink outline, a white cut border and a bigger shadow.
- A tiny fibre speckle texture adds paper feel and can be baked in.

**How the characters sit.** Each vector character gets a white die-cut border: an SVG stroke of the silhouette, about 10 to 12 px white, under the art. It also gets a baked drop shadow and a small paper stand tab. This reads well, but it adds a layer to the characters that isn't in Elliot's drawings.

**Tiles and props.** Procedural layer shapes, in the same wobble helper with a lower amplitude. A small set of SVG props: pumpkin, boulder, plank, branch, lollipop token. Shadows are baked when chunks are rasterised.

**UI.** Paper tabs with folded corners, cut-paper hearts, and a flag on a stick for the enemy's next move.

**Fold and unfold.**
1. A hinge flip like A's, but the flap's back is a different paper colour.
2. Its shadow stretches as it lifts.
3. It ends with a slight 5% overshoot and settle, like paper springing open.

**Phone cost.** Medium. Real-time shadows would be expensive, so bake them all, including a pre-shadowed sprite per actor. If baked, the runtime is like A plus a few more alpha sprites.

**Production work.** Medium to high. Layered depth needs care per map. Interactive standees and flat scenery must never be confused, so every prop needs a decision.

**Weak spots.** The most colour on screen at once. The stand-up/flat rule is subtler than A's ink/pencil rule from a couch. The white borders also make the characters look like stickers rather than drawings that live in the world.

---

## C. Lantern Night (chip: purple `#5D4FA8`)

**Idea.** A calm blue Halloween night. The world is dim and soft. Only what matters is lit: characters, candy, lanterns and the places where a power fits.

**Palette**
- Sky gradient `#191B38` to `#2A2D57`, ground `#2C3160`, path `#3A4078`.
- Scenery line `#5D6299`.
- Unlit pumpkins `#5A3B45`.
- River `#1D4660` with an `#8CC8DC` edge.
- Lantern `#FFD27A`, warm glow `#FFF3C4`, cool glow `#BFE8FF`, moon `#F4ECC8`.
- UI panels `#141631` with `#5D6299` border.
- Hearts `#FF6B5A` with cream `#FFFBE9` outline.

**Outline and fill.**
- Scenery: dim lilac 2 px lines, low contrast.
- Interactive things are bright and full colour, with a soft static halo.
- Black ink disappears on the dark ground, so every lit thing gets a cream rim of about 3 px.

**How the characters sit.** The vector characters keep their black outlines and gain the cream rim plus a warm halo behind them. Their white paper fills glow nicely on the dark background (see the fish). Line-only doodles must have a white body fill in the redraw.

**Tiles and props.** Procedural like A, in a dim palette. Glows are 2 or 3 pre-rendered radial sprites, reused. The rim is baked into each sprite once at load: dilate the alpha, then fill it cream.

**UI.** Rounded dark pills and cards with cream text. The selected card has a warm static under-glow.

**Fold and unfold.** A hinge flip like A's. The halo widens and brightens over 400 ms as the character opens, then settles. It's a slow ramp, not a flash or a pulse.

**Phone cost.** Medium-low. Alpha-blended glow sprites are the main fill cost; keep about 8 per screen at most. Don't use canvas `shadowBlur` or CSS filters at runtime.

**Production work.** Medium. It's the same procedural approach as A, plus the light and rim pass. Matching light to gameplay ("lit = matters") needs discipline on every map.

**Weak spots.**
- The dark mood can tip into scary for some kids; keep faces friendly and the moon present.
- If too many things glow, the "lit means important" rule breaks.
- Elliot's characters are drawn on white paper, so they look less "at home" here: they always carry a rim.

---

## Recommendation: A (Paper Page), with C's night treatment for the ghost house

How well each direction matches flat vector characters while still feeling like a child's marker drawing, and whether the world can be made in the same SVG language:

- **A: excellent.** The world uses literally the same language as the redraws: wobbly `#1a1a1a` outline, flat marker fills, paper white. It can come from one SVG shape library. Characters need no extra rim, border or glow, so they look like they belong rather than sitting on top. It's also the clearest for an autistic six-year-old: one rule (black marker = you can use it, pencil = background) is visible from the couch and never changes. It's the cheapest on the phone and the least production work.
- **B: good.** The paper language is shared, but characters need an added die-cut border and shadow that Elliot didn't draw. It has the richest fold-theme fit, but the most production and visual busyness.
- **C: fair to good.** Very readable on a TV and atmospheric. But black outlines need a cream rim to survive the dark, so characters never quite sit in the world. Glow management adds rules to keep consistent.

**Hybrid.** Use A everywhere outdoors. When the party goes inside the pumpkin (the ghost house boss), the page "turns the lights off": the same paper and pencil scenery, redrawn in C's dim blues, with lit things glowing. That gives the boss area a clear, special change of mood without changing the visual rules. Dashed outline, halo, stars and button positions stay identical.

**Before deciding.** View it on the actual TV: A's brightness in a dim room, and C's contrast. Ask Elliot which letter he points at; it's his world.

---

# Direction A2: Paper Page, cinematic (chosen)

Files: `style-A2.html` contains the live 15-second canvas scene, the overworld, the battle and the boss intro. Screenshots:
- `A2-overworld.png`, `A2-battle.png`, `A2-boss-intro.png`
- `A2-anim-t*.png`: stills of the animation at 1.5, 3.8, 7.4, 7.84, 8.2, 9.4 and 11.5 s
- `A2-anim-live-capture.png`: the scene captured while running in real time

Engine source: `tools/a2_engine.js`. Build with `tools/build_a2.py`. Check with `tools/check_a2_anim.js` (puppeteer) and `tools/shot_a2.sh`.

**This section supersedes the earlier "no flashing / slow eases" rule for A.** The game now runs at normal Nintendo energy: snappy camera, hit flashes, hit-stop, shake, speed lines and bursts. Only ordinary good practice remains:
- No sustained full-screen strobing: one white flash per impact, at most 0.7 opacity and 120 ms, never repeating faster than about 3 per second.
- UI stays readable on a TV.
- The visual language never changes: black marker and full colour = you can use it, pale pencil = scenery, dashed outline = a power fits, glow disc = pickup.

Characters used: the clean redraws from `assets/png` (fish_folded, fish_unfolded, juicebox, beaver, orangeowl, firecat). Still rough photo crops: the bat (far layer) and the small ghosts (boss intro). The big boss ghost is a stand-in drawn in Elliot's style; the pumpkin, ice cream, monster and flowerpot redraws were not in `assets` yet.

## Layer stack (back to front)

| # | Layer | Parallax | Contents | How it's made |
|---|---|---|---|---|
| 0 | Sky wash | 0 (fixed to screen) | warm paper gradient `#F5E6C8` to `#FBF8F0` | baked once, screen size |
| 1 | Far sheet | 0.25 | pencil hills `#EFE2C8` / `#C8B99E`, little trees, **giant pumpkin landmark** (`#F4C28A`, glowing mouth `#FFE7A6`), bats crossing | baked once, about 2300x170 |
| 2 | Mid sheet | 0.55 | hedge row `#DDE7C6` / `#A9B693` | baked once |
| 3 | Playfield sheet | 1.0 | paper + grain, path `#F2E2BD`, river `#8CC8DC` with ink edge; a soft contact shadow where it sits on the lower sheets | baked in 600-wide chunks |
| 4 | Props + actors | 1.0, sorted by y | pencil scenery, ink interactables, characters with contact shadows, swaying tufts | each prop baked to its own sprite; drawn live only while it draws in |
| 5 | Effects | 1.0 | speed lines, paper-scrap bursts, rings, splash, pop words | live strokes, deterministic |
| 6 | Foreground | 1.4 | big out-of-focus grass clump, pumpkin leaf, fence post at the bottom edge | pre-blurred: drawn at 1/7 size, then scaled up; no filters |
| 7 | Light | 0 | warm wash, 3 soft light shafts, vignette; a dusk version blended in by distance | 2 baked full-screen overlays |
| 8 | Ambient | 0 | dust motes in the light, drifting leaves | ~26 tiny shapes per frame |
| 9 | UI | 0 | paper hearts tag, candy tag, letterbox, flash, page turn | HUD baked; the rest live |

The parallax zoom is damped by the same factor as the parallax: a layer's zoom is `1 + (z - 1) * f`. Far layers barely zoom when the camera pushes in, which sells the depth.

## Lighting recipe

- **Afternoon** (default):
  - Warm diagonal wash `rgba(255,196,110,.20)` falling to 0, from top-left to bottom-right.
  - Three light shafts, `rgba(255,240,200,.13)` fading out down the screen.
  - Radial vignette `rgba(80,50,20,.26)` from 32% to 66% of the screen width.
  - Paper grain is baked into the sheets, not the overlay, so it moves with the paper.
- **Dusk:**
  - Purple-to-orange wash `rgba(150,80,160,.20)` to `rgba(240,120,60,.16)`.
  - Stronger vignette `rgba(40,20,50,.42)`.
  - Its opacity rises from 0 to 0.85 over the 1500 world units before the giant pumpkin.
  - Dust motes keep drifting.
- **Inside the pumpkin (night):**
  - Background is dark paper `#2A2238` with grain at 50%.
  - Ribs in dim orange pencil `#7A4A34`; floor `#382C4C`.
  - Lantern pools are baked radial sprites `rgba(255,205,120,.55)` fading to 0.
  - Ghost glow is `rgba(190,230,255,.45)`.
  - **Keeping black outlines readable on dark:**
    - Every character and creature gets a cream paper cut-out halo (`#F3E9D2`, 6 px; ghosts `#E9F4FF`). It is baked once by stamping the sprite's silhouette in 16 directions.
    - Characters stand in lit ground pools.
    - Black outlines are never placed directly on dark paper.

## Camera rules (numbers as built in the demo)

**Follow**
- Target = lead position + velocity × 0.32 s look-ahead, clamped to ±90 px, plus 40 px forward bias.
- Exponential follow with stiffness k = 9/s, so about 63% of the gap closes in 0.11 s. It's snappy, not floaty.
- Zoom follows at 0.8 × k.

**Zoom levels**

| Situation | Zoom | Camera y | Stiffness |
|---|---|---|---|
| Normal play | 1.0 | 205 | 9/s |
| Vista pull-back (landmark in view, open field) | 0.86 | 190 (shows more far sheet) | 5/s, slower so it reads as a breath |
| Power spot or creature within about 250 px | 1.14, centre pulled halfway toward the spot | 205 | 7/s |
| Hero moment: first beat | 1.4 | 205 | 14/s |
| Hero moment: unfold | 1.18 | 176 | 10/s |
| Bridge landing | 1.22 | 205 | 10/s |
| End of slice | 0.92 | 196 | 9/s |

Allowed range: 0.85 to 1.45. Below that, the paper grain and the 4 px ink look thin on a TV.

**Shake** (decaying, amplitude × (1 − u)², sinusoids at about 14 and 18 Hz):
- Unfold impact: 10 px for 380 ms.
- Bridge landing: 5 px for 260 ms.
- Anticipation jitter: 1.2 px.
- Battle: 3 px for a 1-hit move, 6 px for 2 hits, 10 px for 3 hits.

**Letterbox:** 46 px bars (12% of 390 each). They snap in over 180 ms with ease-out-cubic and leave over 220 ms with ease-in-out.

**Hit-stop:** freeze world time for 80 ms on big impacts (the unfold peak, 3-hit moves) and 40 ms on ordinary hits. The flash and particles keep running on real time.

## Unfold sequence (as built, ms from the start of the trigger)

| Time (ms) | Beat |
|---|---|
| 0 | **Letterbox in** (180 ms), camera to 1.4 with stiffness 14 |
| 200 | **Anticipation**, 400 ms: squash to sy 0.8 / sx 1.14 (ease-out-cubic), jitter, dashed fold crease draws across the body, small dust puff |
| 600 | **Snap**, 60 ms: folded sprite flips edge-on (scale Y down to 0.02) using a darkened copy, like the back of the paper |
| 660 | **Open**, 90 ms: unfolded sprite shoots from 0.05 to 1.18 height (ease-out-cubic), starting slightly fat (sx 1.25 to 0.95) |
| 750 | **Impact**: 80 ms hit-stop on the overshoot pose. White flash 0.7 to 0 over 120 ms. Shake 10 px. 22 radial marker speed lines (420 ms). 24 pink and white paper scraps with gravity (700 ms). Ink ring (380 ms). The sprite carries a white highlight fading over 220 ms. |
| 830 | **Settle**: damped spring, sy = 1 + 0.18·e^(−0.009t)·cos(0.03t), sx in opposition; hand-lettered **LONG!** pops in with ease-out-back (s = 3) over 200 ms |
| 1450 | **Hold** ends; the word shrinks away by 1650 |
| 1850 | **Use**, 350 ms: fish tips over into the bridge (ease-in-back, s = 1.4) |
| 2200 | **Land**: shake 5 px, river-blue ring, water splash burst (600 ms), damped squash |
| 2650 | **Letterbox out** (220 ms), camera returns; the party crosses at once |

Total is about 2.9 s, and the player has control back by 2.9 s. On later uses of the same power, skip the letterbox and the word: run anticipation (150 ms) → snap/open → impact with 40 ms hit-stop → settle. That's about 0.8 s.

## Battle transition and staging

**Transition (about 450 ms, page turn):**
1. The overworld freezes with a 60 ms flash.
2. A paper sheet sweeps across from the right with its curled ink edge and a fold shadow (ease-in-out-cubic, 380 ms). The demo uses the same page turn to restart its loop.
3. The battle page is revealed underneath, and the actors slide in from off-screen (200 ms, ease-out-back).
4. Leaving the battle is the same turn in reverse.

**Staging:**
- Low camera and a horizon at about 165.
- The backdrop is the place the fight started: the far sheet at 1.25× with the giant pumpkin looming, the hedge row, and pencil props near the horizon.
- The ground is a perspective path.
- Enemy on a raised paper disc at the top right, about 130 px tall.
- Player large in the near foreground at the bottom left, about 220 px.
- A blurred foreground leaf in one corner.

**Move effects are marker strokes:**
- A thick coloured stroke with an ink edge draws along its path over 150 to 250 ms, then its tail retracts.
- Ink-outlined drops, debris, or sparks come out of it.
- A star-shaped hit spark lands on the target.
- Speed lines, plus hit-stop and shake scaled to the hit count.

The enemy's next move sits in a bubble or flag. Cards keep the cross / circle / triangle slots fixed.

## Ambient elements

All of these are deterministic functions of time, so they're cheap and can be scrubbed.
- **Grass tufts:** sway ±0.16 rad at about 0.5 Hz, phase-offset by x.
- **Drifting leaves:** 4, screen-space, about 70 px/s across and 30 px/s down, rocking ±1.2 rad.
- **Dust motes:** 22, twinkling at 0.5 Hz.
- **Bat:** crosses the far sheet every 6 s.
- **River ripples:** scroll at 60 px/s.
- **Candy and lollipops:** bob ±3 px. Collecting one is distance-based: it scales to 1.7×, rises 50 px, fades, and gives off a 10-scrap burst.
- **Owl:** wanders in a Lissajous loop and flips to face its direction.
- **Party:** walk bob of 4 px at about 2.2 Hz, ±0.05 rad tilt.

**Ink drawing in:** scenery inside the reveal front (lead + 420 px, so just off the right of the screen) draws its pencil outline with an animated dash offset over the first 70% of a 160 px band. The pale fill washes in over the last 65%. Ink interactables use a shorter 90 px band, so they snap in as marker. A prop is drawn live only while it's revealing; after that it's a cached sprite. In the real game, keep a "revealed" bit per prop and save it, so explored ground stays drawn.

## Performance

**Measured** in headless Chrome, software rendering, 2× pixel ratio, with the full page live:
- About 53 fps over 6 s.
- Render call cost: median 0.5 ms, mean 3.2 ms, 95th percentile 17 ms.
- The 95th-percentile spikes are frames with several props drawing in at once, plus first-use texture uploads.
- No console errors.

A synthetic sweep of 240 frames across the loop measured a 1.6 ms 95th percentile. This is a desktop CPU without a GPU; a mid-range phone with GPU canvas should be similar or better on blits but slower on live strokes. Plan for ≤ 6 ms per frame.

**Cost by element, on a phone:**
- **Cheap** (drawImage blits):
  - sky, 2 parallax sheets, 1 to 2 ground chunks, ~30 visible prop sprites, actors, foreground
  - light overlay; dusk only when > 0
  - HUD
- **Moderate** (live vector work):
  - grass tufts (~40 × 3 short curves)
  - props currently drawing in (cap at 6 at once: queue the rest)
  - particle bursts (≤ 30 quads each, 2 at most at once)
  - speed lines
- **Fill rate:** up to 4 full-screen layers at 2× (sky, light, dusk, flash). On weak phones, cap the backing store at 1.5× pixel ratio, or merge sky into the far sheet.
- **Memory:**
  - ground chunks at bake scale 2.5: 5 × (1500 × 975) ≈ 29 MB
  - parallax sheets ≈ 6 MB
  - prop sprites ≈ 8 MB
  - Use bake scale 2.0 and 600-unit chunks; free chunks more than two screens away.
- **Avoid at runtime:** canvas `filter`, `shadowBlur`, live blur, per-pixel tints. Depth of field, halos and tints are all baked at load.

## Asset list: Pumpkin Patch slice

**Generated in code** (wobble helper; colours from the palette):
- **Ground:**
  - playfield sheet with cut edge and contact shadow
  - paper grain tile 160²
  - path strip
  - river with ink edge and ripples
  - river bank variants: straight, bend, end
  - lower-sheet shadow strip
- **Far sheet:**
  - hill lines
  - pencil trees ×3 variants
  - giant pumpkin landmark (day, dusk, lit-mouth)
  - distant fence
  - bat silhouette track
- **Mid sheet:**
  - hedge row
  - hay row
- **Scenery props** (pencil, pale), each with 2–3 seeded variants:
  - pumpkins S/M/L
  - fence post + rail, fence gap end
  - scarecrow
  - cart with pumpkins
  - hay bale
  - curly vine with leaves
  - signpost (arrow toward the giant pumpkin)
  - grass tuft
  - stepping stones
  - corn stalk clump
  - pumpkin leaf patch
  - wooden crate
  - lantern post (dusk lit)
- **Interactive props** (ink, full colour):
  - boulder: whole, cracked, eaten crumbs
  - heavy block (ice-cream push), with drag marks
  - dashed power spots: bridge, push, eat, ghost-switch, vine-anchor
  - ghost switch, off and on
  - vine anchor hook
  - candy pickups: wrapped candy, lollipop, candy corn
  - gate (opens)
  - river bridge state (the fish)
- **Foreground, pre-blurred:**
  - grass clump
  - big pumpkin leaf
  - fence post
  - corn leaf
  - hanging vine (top edge)
- **Light:**
  - afternoon overlay, dusk overlay
  - contact shadow sprite
  - lantern pool
  - ghost glow
  - cream halo (generated per sprite)
- **Ambient:** leaf sprites ×2, dust mote, ripple stroke.
- **Effects:**
  - speed lines
  - paper scraps (pink, white, by character colour)
  - ink ring
  - water drops
  - hit spark star
  - dust puff
  - marker-stroke move trails (one per move colour)
  - collect sparkle
  - page-turn sheet

**Hand-drawn or redrawn** (SVG redraws, like the characters):
- **Characters:** all party members folded and unfolded, in parts.
- **Creatures:** bat, spider, ghost, owl, fire cat, beaver, juice box.
- **Boss:** big ghost, from the pumpkin's inside panel.
- **Optional hand-lettering from Elliot:** pop words (LONG!, GULP!, STACK!, BOO!, GROW!) and move words (HIDE, SPLASH, LONG, CHOMP, BONK…), plus 0–9.

**UI:**
- paper hearts tag (full, empty)
- candy counter tag
- move cards (normal, selected)
- cross / circle / triangle badges
- next-move bubble
- move icons: hide, splash, open, chomp, stack, swoop, web, boo, hoot, grow
- hit stars
- letterbox
- boss title card
- touch fallback: stick, A, B, as pencil circles

**Inside the pumpkin:**
- dark paper with grain
- rib lines
- floor
- hanging lantern (ink; lit)
- pumpkin-teeth frame, top and bottom
- small ghosts
- spooky wall shapes
- ghost-pass walls (dashed, ghost-only)

## What was tried and dropped

- **Real-time drop shadows and `ctx.filter` blur:** the cost on phones is too high and Safari support is patchy. All shadows and blur are now baked.
- **A big foreground leaf at full size:** it covered the river spot. Foreground sprites are now 60 to 70% of that size and sit lower.
- **A giant pumpkin at full scale on the far sheet:** it was cropped by the top of the screen. It's now 74% and partly behind the hedge, so it reads as distant.
- **A hit-stop frozen at the start of the unfold:** it froze on a near-invisible sliver. Hit-stop now holds the overshoot peak.
- **A 1.42× push-in during the unfold:** it cropped the tall fish and the pop word under the letterbox. The camera now drops to 1.18 and raises its centre once the fish opens.
