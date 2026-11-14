# M1 "Walk and Fight" Implementation Plan

> **For agentic workers:** each task below is given to one fresh agent. Read this whole header, then your own task. Read the spec sections your task names before writing code. Do not run any `git` command: the lead session commits after review.

**Goal:** A playable first build: walk on stage S1 with the team following, fold and unfold, bump the bat, and play one complete turn-based battle, in the A2 "Paper Page" look.

**Architecture:** Game rules are pure, deterministic ES modules with no DOM access (`src/battle`, `src/field`), tested in Node. Drawing code (`src/render`) only reads state and never changes it. `src/main.js` owns the loop and passes input to the rules and state to the drawing. A build script bundles everything into one self-contained HTML file.

**Tech stack:** Plain JavaScript ES modules, Canvas 2D, Gamepad API, Web Audio. No runtime libraries. Dev tools only: Node 22 (`node --test`), esbuild (bundle), puppeteer-core with the installed Google Chrome (screenshots).

**Spec:** `Design/slice-design.md` (rules, numbers, controls), `Design/slice-data.json` (the same as data), `Art/Style/style-notes.md` section "Direction A2" (look, camera numbers, timings), `README.md` (decisions). Where they disagree, README and slice-design win over style-notes and the mockup PNGs. Known stale items: the battle mockup shows hit stars and HIDE on ✕ (the build uses one big digit, and Square folds); slice-design section 10 says characters are cut from scans (they are the redrawn PNGs).

## Global constraints

- Logical screen is **844 x 390**. Everything is drawn in logical px and scaled to the device; backing store capped at device pixel ratio 2.
- One tile is **48 px across x 30 px deep**. Stages are 9 rows deep. Screen bands: horizon top 86 px, ground plane 86 to 356, foreground 356 to 390.
- Field positions are in **tile units** (floats): `x` along the stage, `y` in depth with 0 at the back. A thing "at tile (i,j)" stands at `(i+0.5, j+0.5)`. Screen mapping at zoom 1: `sx = x*48 - camX`, `sy = 86 + y*30`.
- No randomness in rules. Decorative variation uses the seeded `rng(seed)`.
- No runtime libraries, no network requests at runtime, no canvas `filter` or `shadowBlur` per frame (bake at load).
- Names shown on screen are placeholders and come only from `src/data/slice.gen.js` (`placeholder_name`, move `word`). Never hard-code a name in drawing code. No Nintendo names.
- Text on screen: all capitals, one word per button. Font stack: `Andika, "Avenir Next Rounded", "Arial Rounded MT Bold", Verdana, sans-serif` (embedding Andika is parked).
- PlayStation shapes are drawn as paths, never font glyphs.
- Flash rule: one white flash per impact, at most 0.7 opacity and 120 ms.
- `src/battle/*` and `src/field/*` must import nothing from `src/render`, `src/input` or the DOM.
- Run tests with `cd Game && npm test`. Take screenshots with `npm run shot` (Task 2 builds it) and look at them with the Read tool before claiming something renders.
- Scratch output (screenshots, logs) goes in `Game/.shots/` (git-ignored).

## File map

| File | Responsibility | Task |
|---|---|---|
| `Game/src/data/slice.gen.js` | Generated copy of the design JSON (exists) | scaffold |
| `Game/src/battle/rules.js` | Type table, damage formula | 1 |
| `Game/src/battle/battle.js` | Battle state machine: create, legal actions, preview, resolve, cards | 1 |
| `Game/test/battle.test.js` | The spec's worked fights as tests | 1 |
| `Game/src/render/core.js` | Constants, seeded rng, easings, wobble-line helpers (ported from `Source/a2_engine.js`) | 2 |
| `Game/src/render/sprites.js` | Image loading, sprite baking, halo, tint, blur, blit | 2 |
| `Game/src/render/props.js` | Pencil scenery and ink props as baked sprites | 2 |
| `Game/src/render/fx.js` | Bursts, speed lines, ring, shake, page turn, letterbox | 2 |
| `Game/src/render/camera.js` | Follow camera | 2 |
| `Game/src/render/actors.js` | Drawing a party member or creature, including the fold hinge | 2 |
| `Game/src/render/stageview.js` | Bakes a stage's layers and draws a `FieldState` | 2 |
| `Game/src/render/hud.js` | Hearts tag, candy tag, portraits | 2 |
| `Game/src/assets.js` | Asset key list and loader (dev paths or embedded data URIs) | 2 |
| `Game/src/main.js` | Boot, canvas scaling, loop, scene switch | 2, then 4, 6 |
| `Game/index.html` | Dev page | 2 |
| `Game/tools/build.mjs`, `Game/tools/shot.mjs` | Single-file build; headless screenshot | 2 |
| `Game/src/field/stage.js` | Parses a stage's rows into a queryable `Stage` | 3 |
| `Game/src/field/field.js` | Field simulation: movement, followers, fold, swap, creatures, pickups, rest | 3 |
| `Game/src/save.js` | Save and load, tolerant of bad data | 3 |
| `Game/test/field.test.js`, `Game/test/save.test.js` | | 3 |
| `Game/src/input/input.js` (+ `gamepad.js`, `keyboard.js`, `touch.js`) | One `InputFrame` per frame from any device | 4 |
| `Game/src/scenes/fieldscene.js` | Field scene: input to field sim to stage view, autosave | 4 |
| `Game/src/render/battleview.js`, `Game/src/scenes/battlescene.js` | Battle screen and its event playback | 5 |
| `Game/dev/battle.html` | Stand-alone battle harness | 5 |
| `Game/src/audio.js` | Synthesized placeholder sounds | 6 |
| `Game/tools/play.mjs` | Scripted playthrough check | 6 |

## Shared shapes (pinned: several tasks rely on these exact names)

```js
// Stage (src/field/stage.js)  parseStage(stageData) -> Stage
{ id, name, width, depth,            // depth is 9
  rows,                               // the original strings
  tileAt(i, j),                       // char; anything outside the grid returns '#'
  isSolid(i, j),                      // '#', 'O' (while the boulder exists), or outside
  start: [i, j], rest: [[i, j]], candy: [[i, j]], boulders: [[i, j]], hedges: [[i, j]],
  exits: [{ at: [i, j], to }], spawns: [{ kind, at: [i, j], patrol: [[i, j]] }] }

// FieldState: plain JSON-safe data. field.js writes it, stageview.js reads it.
{ stageId, time,                      // seconds on this stage
  party: [Member],                    // party[0] is the lead; the rest follow in order
  creatures: [Creature], candy: [{ i, j, taken }], boulders: [{ i, j }],
  candyCount, restAt: { stageId, i, j } }
Member   { id, x, y, faceX,           // id 'monster' | 'fish' | 'icecream'; faceX is -1 or 1
           facing,                    // 'left' | 'right' | 'back' | 'front'
           form,                      // 'folded' | 'open'  (followers are always 'folded')
           foldAnim,                  // 0..1; 1 = settled in `form`, below 1 = hinge still moving toward `form`
           moving, hearts, maxHearts }
Creature { uid, kind, x, y, faceX, facing, mode }   // mode 'patrol' | 'asleep' | 'ignore'

// InputFrame (src/input/input.js)  input.poll(dt) -> InputFrame
{ moveX, moveY,                       // -1..1 after a 0.25 deadzone; +x right, +y toward the camera
  dash,                               // R2 held, or touch stick past 90%
  pressed: { cross, circle, triangle, square, l1, r1, create, options },  // true only on the down frame
  held: { l2, r2 },                   // seconds held, 0 when up
  taps: [{ x, y }],                   // touch or mouse taps this frame, logical px
  source,                             // 'gamepad' | 'keyboard' | 'touch' (last used)
  gamepadConnected }

// Scene (anything main.js can run)
{ update(dt, inputFrame), render(ctx, timeMs) }
```

Keyboard map (for testing without a controller): arrows or WASD move; `K` Cross, `L` Circle, `I` Triangle, `J` Square (the same diamond as the controller); `Q` L1, `E` R1; `1` L2, `Shift` R2; `B` Create, `Enter` Options. `Space` also presses Cross.

## Review focus

Things the spec does not test for that will bite a real player. Each is assigned a test or check in the task named.

1. **Bad or missing save** (corrupt JSON, an older version, storage blocked in private browsing): the game starts fresh and does not crash. Task 3 tests `loadSave` with garbage, `null`, a wrong version, and a throwing storage.
2. **A long frame** (tab in the background, phone locked): the lead must not pass through a hedge or the bat. Task 3 tests `stepField` with `dt = 2` s against a wall; the loop in Task 2 clamps `dt` to 50 ms.
3. **Button mashing and illegal presses** (Burp on an empty tummy, Fold while Sticky, any press while a hit is animating): nothing changes and nothing is queued. Task 1 tests that `resolve` on an illegal action returns the same state with one `{t:'illegal'}` event; Task 5 ignores input during playback.
4. **Controller comes and goes** (connects after load, disconnects mid-battle, is not at index 0, or reports a non-standard mapping): Task 4 picks the first connected pad each frame, pauses on disconnect, and falls back to touch.
5. **Wrong screen shape** (phone held upright, a browser bar resizing the window, a very wide TV): Task 2 letterboxes to 844:390 on resize and shows a "turn your phone" picture in portrait.

---

### Task 1: Battle rules

**Read:** slice-design sections 4, 5, 6, and the phase 2 tables in section 7. `rules`, `type_chart`, `characters`, `creatures` in the data.

**Files:** create `src/battle/rules.js`, `src/battle/battle.js`, `test/battle.test.js`.

**Produces:**

```js
// rules.js
typeBonus(attackerType, defenderType) -> -1 | 0 | 1
finalDamage({ base, lift, fresh, attackerType, defenderType, targetFolded }) -> number   // never below 0

// battle.js   All functions are pure. State is plain JSON-safe data and is never mutated.
createBattle({ data, party, lead, enemy, dizzy = false, canRun = true }) -> BattleState
//   party: [{ id, hearts }] in order; lead: index; enemy: a creature id from data ('bat'), or a custom
//   definition { id, type, hearts, strip: [{ word, form, attack?, effect? }] } (tests use this for the boss strip)
legalActions(state) -> Action[]
//   Action: { t:'move', slot: 0|1|2 } | { t:'fold' } | { t:'switch', to: index } | { t:'run' }
preview(state, action) -> { legal, enemyHeartsLost, selfHeartsLost, selfHeal, intentNumber }
//   exactly what the hearts will do if this action is played, including this round's enemy card
resolve(state, action) -> { state, events }
cards(state) -> { moves: [{ slot, id, word, icon, number, kind, enabled }],   // kind 'damage' | 'heal' | 'badge'
                  fold: { word, enabled }, intent: { word, number, form, index }, strip: [...],
                  badges: { fresh, lift, tummy, sticky }, canRun }
```

`BattleState` has a `phase`: `'choose'`, `'chooseNext'` (the active character is Sleepy: only free `switch` actions are legal), `'won'`, `'lost'`, `'ran'`. Events are an ordered list the screen will animate, each `{ t, ... }`. Use these `t` values: `playerMove`, `damage` (`target: 'enemy'|'player'`, `amount`, `heartsAfter`), `heal`, `form` (`who`, `form`), `fresh`, `lift`, `gulp` (`stored`), `burp`, `enemyCard` (`index`, `word`), `sticky` (`on`), `switch`, `ko`, `pointer`, `won`, `lost`, `ran`, `illegal`.

Scope: all three characters and the three creatures, Fresh, Lift, Gulp and Burp, Smash's free fold, Love, Sticky, Dizzy, switching, Sleepy, Run. Not in scope: the Bag, the boss's Little Ghost phase.

**Tests to write first** (exact values from the spec; each is one `test()`):

- `monster vs bat`: Claw three times. Bat hearts 5, 3, 1, 0. Monster stays on 9 (Flap 1 against folded is 0). The battle is won in round 3 and Bite never resolves.
- `fish vs spider`: Open, Slap, Slap, Slap. Slap deals 3, 2, 1. Fish ends on 5 of 8. After the Web round, `legalActions` has no `fold` and no `switch` for exactly one turn.
- `ice cream vs ghost`: Bonk (deals 2), Open, Drop (deals 5). Ice Cream ends on 10.
- `ice cream vs bat`: the Bonk card's `number` is 0. Lift, Open, Drop: Drop deals 5 and Ice Cream ends on 7.
- `boss strip, monster` (custom enemy: spooky, 11 hearts, strip Curl folded / Swoop 2 / Howl 5 / Nap; Monster starts on 7): Open, Chomp, Gulp, Burp, Chomp, Chomp. Boss hearts 11, 8, 8, 3, 2, 0. While Howl is showing against the open Monster the intent number is 6, Gulp stores 6, and the Burp card then shows 5. Monster ends on 4.
- `boss strip, ice cream` (starts on 10): Open, Drop, Smash, Bonk. Boss 11, 6, 1, 0. Ice Cream is folded after Smash and ends on 6.
- `boss strip, fish` (starts on 8): Open, Slap, Love, Slap, Slap, Slap. Boss 11, 7, 7, 4, 2, 0. Fish ends on 3.
- `boss strip, team`: Monster leads on 7 with Ice Cream on 10 benched. Switch to Ice Cream, Open, Smash, Lift, Open, Drop. Boss 11, 11, 5, 5, 5, 0. Ice Cream ends on 6; Monster still 7. The Drop card shows 7.
- `preview matches resolve`: for every legal action in a few mid-fight states, the hearts `preview` predicts equal the hearts after `resolve`.
- `illegal actions change nothing` (Review focus 3): Burp with an empty tummy, Gulp with a full one, Fold while Sticky, Run when `canRun` is false. `resolve` returns a state deep-equal to the input and events `[{ t: 'illegal' }]`.
- `sleepy and lose`: a character reduced to 0 gives phase `chooseNext`; the replacement arrives folded for free; when all are at 0 the phase is `lost`. Love does not wake a Sleepy teammate and never heals above max.
- `run`: ends the battle before the enemy's card resolves.
- `dizzy`: the enemy's first card does nothing, then the pointer moves on.

**Done when:** `npm test` passes, and a 10-line note at the top of `battle.js` explains the state fields for the next agent.

---

### Task 2: Drawing foundation

**Read:** style-notes "Direction A2" (all of it), slice-design section 2 "View and camera" and the S1 map, `Source/a2_engine.js` (port from it; do not rewrite what works), `Art/Characters/manifests/manifest_monster.json`. Look at `Art/Style/A2-overworld.png` for the target.

**Files:** create everything marked task 2 in the file map.

**Consumes:** the `Stage`, `FieldState`, `InputFrame` and `Scene` shapes above. Task 3 is writing the real `parseStage` at the same time, so build against a small hand-written fixture in `src/dev/fixture.js` that matches those shapes for stage S1 (monster leading, fish and ice cream following, one bat, two candies, the boulder and hedges).

**Produces:**

```js
// assets.js
loadAssets() -> Promise<Assets>       // dev: loads ../Art/Characters/png/<key>.png; build: reads window.__ASSETS__ data URIs
// stageview.js
createStageView(stage, assets) -> StageView          // bakes sky, far sheet, mid sheet, ground chunks, props
renderStage(ctx, view, fieldState, cam, timeMs)      // draws everything in the field except the HUD
// camera.js
createCamera(stage) -> cam;  updateCamera(cam, { x, y, vx }, dt, { zoom = 1 } = {})   // follow k = 9/s, look-ahead 0.32 s, clamped to stage ends
// actors.js
drawMember(ctx, assets, member, sx, sy, timeMs, opts);  drawCreature(ctx, assets, creature, sx, sy, timeMs)
// hud.js
drawFieldHud(ctx, assets, fieldState, inputFrame)
// main.js
startGame({ canvas })    // also sets window.__game = { scene, setScene, frame } for scripted checks
```

Requirements:

- **Layers** as in the A2 layer table, baked once per stage. The giant pumpkin on the far sheet is drawn at 0.4x for S1. Path tiles (`:`) become the path strip. Pencil scenery is scattered with a seeded rng on ground tiles only, never on the path, a solid tile, a pickup or a spawn.
- **Ink versus pencil:** hedges (`#`), boulders (`O`), candy (glow disc, bobbing 3 px), the rest blanket and creatures are black ink and full colour. The back fence and all decoration are pale pencil.
- **Depth:** props and actors are sorted by feet `y`. A standee in front of the lead that overlaps it fades to 50%.
- **Actors:** sprites flip with `faceX`. Folded height on screen is about 78 px; the open form uses the same scale as its folded form (use the manifest sizes). Walk bob 4 px at about 2.2 Hz with a 0.05 rad tilt while `moving`. A soft baked contact shadow under everyone.
- **Fold hinge:** driven only by `member.form` and `member.foldAnim`. Use the manifest's hinge lines to open the monster like folded paper (the bottom part slides away from the top and the inside is revealed between them, with a 5% overshoot at the end). For a character with no usable hinge data, fall back to the A2 flip (squash to an edge, then the other form springs out).
- **Asleep creature:** lies tilted at its spawn with a small "z".
- **Screen fit (Review focus 5):** the canvas letterboxes to 844:390 on load and on every resize, centred, on a paper-coloured page. In portrait, draw a simple "turn your phone" picture instead of the game.
- **Loop (Review focus 2):** `requestAnimationFrame`, `dt` clamped to 50 ms.
- **Dev scene:** with no field logic yet, `main.js` runs a throwaway scene that moves the fixture's lead with the arrow keys so the camera and sorting can be seen. Task 4 replaces it.
- **`tools/shot.mjs`:** `node tools/shot.mjs --out .shots/a.png [--page Game/index.html] [--query "x=12&form=open"] [--wait 600] [--eval "js"] [--size 844x390]`. It starts its own static file server on a free port rooted at the project folder, opens the page in the installed Google Chrome through puppeteer-core, waits, optionally evaluates a script, saves a PNG, prints any page errors, and exits non-zero if there were errors.
- **`tools/build.mjs`:** bundles `src/main.js` with esbuild (IIFE, minified), embeds only the PNGs the game uses as data URIs downscaled to at most twice their largest on-screen size (use `python3` with PIL, which is installed), and writes `Game/dist/elliot-game.html`. Print the file size.
- Dev query parameters so states can be screenshotted: `x`, `y` (lead position), `form` (`folded`/`open`), `fold` (a `foldAnim` value), `party` (`1` or `3`).

**Done when:** screenshots (looked at with the Read tool) show S1 at the start, at the boulder alcove (x about 20), and at the right end; the monster folded, mid-hinge and open; the built single file opens and renders with no errors; `npm run shot` exits 0. Report frame cost from a 300-frame timing run.

---

### Task 3: Field rules

**Read:** slice-design section 2 (all), section 3 "Field rules", section 9 "Save". `field`, `stages[0]`, `save` in the data.

**Files:** create `src/field/stage.js`, `src/field/field.js`, `src/save.js`, and their tests.

**Produces:**

```js
parseStage(stageData) -> Stage
createField({ stage, data, party, save = null }) -> FieldState     // party: [{ id, hearts }]
stepField(state, stage, input, dt) -> events     // mutates `state`; input is { moveX, moveY, dash, pressed }
applyBattleResult(state, stage, { outcome, creatureUid, hearts })   // outcome 'won' | 'lost' | 'ran'; hearts: { id: n }
// events: { t:'battle', creatureUid, kind, sneak } | { t:'candy', i, j } | { t:'rest' } | { t:'exit', to }
//         | { t:'fold', form } | { t:'swap', lead } | { t:'bump' }
// save.js
toSave(fieldState, settings) -> object;   loadSave(storage) -> object | null;   writeSave(storage, object)
//   storage is anything with getItem/setItem (localStorage in the game, a fake in tests). Key 'elliot-game-save-v1'.
```

Rules to implement (M1 scope):

- **Movement:** 4 tiles/s along x and 4 rows/s in depth, 5.5 while dashing. The lead's footprint is a circle of radius 0.35 tiles. It cannot enter a solid tile or leave `0 <= y < 9`, `0 <= x < width`, and it slides along walls. Movement is sub-stepped so a large `dt` cannot tunnel.
- **Facing:** `faceX` follows the sign of x movement. `facing` is the stronger axis of the last movement.
- **Followers:** each follows the lead's recorded trail about 1.1 tiles behind the one in front, stops when the lead stops, and has no collision. Followers are always folded.
- **Fold (Square):** toggles the lead's `form`; `foldAnim` runs 0 to 1 over 0.5 s. The lead may keep moving.
- **Swap (L1/R1):** rotates `party` so the previous or next member leads. The new lead takes the old lead's position and facing and arrives folded; the old lead becomes a folded follower.
- **Bat:** walks its patrol loop through tile centres at `patrol_speed` (2 tiles/s), facing the way it moves. No sight or chase in M1.
- **Contact:** the lead within 0.35 tiles in x and 0.5 rows in y of a creature in `patrol` mode emits one `battle` event (`sneak: false` in M1).
- **After a battle:** `won`: that creature is `asleep` at its spawn. `ran`: it is in `ignore` for 3 s, then `patrol`. `lost`: the team stands on the last rest blanket with full hearts and every creature is back in `patrol` at its spawn. Hearts otherwise carry over.
- **Rest blanket:** stepping onto its tile (on entry only) restores all hearts, wakes every creature, sets `restAt`, and emits `rest`.
- **Candy:** walking within 0.5 tiles of an untaken candy takes it, adds 1 to `candyCount`, emits `candy`.
- **Exit:** entering an exit tile emits `exit` once per entry. M1 has no second stage, so the lead simply stops at the edge.

**Tests to write first:** the lead walks 4 tiles in 1 s on open ground; it is stopped by the hedge at (19,0) and slides along it; `dt = 2` s against a wall does not pass through (Review focus 2); it cannot leave the depth range; candy at (3,1) is taken once; the candy at (20,0) cannot be reached (boulder at (20,1) and hedges block it); two followers trail in order and stay behind; fold toggles and animates for 0.5 s; swap rotates the party and keeps position; the bat completes its loop back to its start point and visits all four corners; contact emits exactly one `battle`; each battle outcome changes the state as above; the rest blanket heals and wakes on entry only; `parseStage` on S1 returns the right start, rest, candy, boulder, exits and spawn; a save round-trips; `loadSave` returns `null` for garbage, `null`, a wrong version and a throwing storage (Review focus 1).

**Done when:** `npm test` passes.

---

### Task 4: Field scene and input

**Read:** slice-design section 9. Tasks 2 and 3 as built.

**Files:** create `src/input/*`, `src/scenes/fieldscene.js`; modify `src/main.js` (replace the dev scene), `src/render/hud.js` if touch controls need drawing.

**Produces:** `createInput(canvas, { toLogical }) -> { poll(dt) }` returning `InputFrame`; `createFieldScene({ assets, data, input, storage, onBattle }) -> Scene` plus `scene.field` (the `FieldState`) and `scene.resumeFromBattle(result)`.

Requirements: gamepad standard mapping with the button indices in section 9, polling the first connected pad every frame (Review focus 4), pausing with a "controller" picture when a pad that was in use disconnects; keyboard map from this plan; touch: a floating stick in the left half, a large USE and a FOLD button on the right, tappable portraits, all at least 64 px, hidden while a controller is the last-used device. Autosave on candy, rest, battle end and every 30 s. `window.__game` gains `press(name)`, `move(x, y, seconds)` and `state()` for scripted checks. Unit-test the pure parts (deadzone, edge detection, button index mapping) in `test/input.test.js`.

**Done when:** tests pass, and scripted screenshots show the lead walking the path, the team following, a fold, a swap, and the touch controls.

---

### Task 5: Battle screen

**Read:** slice-design section 4 "Screen, buttons and one turn" and section 10 "Battle and boss staging"; style-notes "Battle transition and staging". Task 1 and 2 as built.

**Files:** create `src/render/battleview.js`, `src/scenes/battlescene.js`, `dev/battle.html`.

**Produces:** `createBattleScene({ assets, data, battle, settings, backdrop, onDone }) -> Scene`, where `battle` is a `BattleState` and `onDone({ outcome, hearts })` is called after the win or lose sequence ends.

Requirements: the layout in section 4 (enemy strip with a pointer, intent bubble with one big digit, both heart bars, badges, type wheel, L1/R1 portraits, the four cards in a diamond that mirrors the controller: triangle top, square left, circle right, cross bottom). First press lifts a card and shows the heart preview (hearts that will be lost turn hollow and jiggle; a heal shows ghost hearts); the same press again plays it; `settings.quickPlay` plays on one press. Hold R2 for 1 s with a filling ring to run. Taps on a card do the same as its button. `resolve`'s events are played in order with lunge, flash, big digit pop, hearts tearing off one at a time, hit-stop 40 ms (80 ms for 4 or more) and shake 3, 6 or 10 px; input is ignored during playback (Review focus 3) and an illegal press gets a wiggle. Fold and Open use the hinge from `actors.js` over 0.8 s. Win: paper confetti. Lose: the page tears. `dev/battle.html?enemy=bat&lead=monster&party=3` runs a battle on its own with the keyboard map.

**Done when:** screenshots show the opening state, a lifted card with its preview, a hit mid-flash, the win and the lose screens, and a scripted Claw x3 against the bat ends in a win.

---

### Task 6: Join, sound, and playthrough check

**Files:** modify `src/main.js`; create `src/audio.js`, `tools/play.mjs`.

Requirements: a `battle` event from the field starts the page-turn (0.6 s) into a battle built from the field's party and hearts; `onDone` turns the page back and calls `resumeFromBattle`. Closing the game mid-battle and reopening restarts that battle at round 1 with the hearts the team had going in. Synthesized sounds (Web Audio, started on the first press or tap): step, fold, hit, heal, candy, battle sting, win fanfare, lose, illegal "boing". `tools/play.mjs` drives `window.__game` through: walk to the bat, win with Claw x3, check the bat is asleep and hearts are 9; then a second run that loses on purpose and checks the team is on the blanket with full hearts. Rebuild the single file.

**Done when:** `node tools/play.mjs` passes against both the dev page and the built file.

---

### Task 7: Visual depth pass (approved 14 Nov; run after M1 is committed)

**Why:** the field reads as "simple yet cluttered, lacking a little depth". Causes seen in the screenshots: scenery is scattered evenly at one size and strength; the ground is one flat tone front to back; every fill is perfectly flat.

**Files:** `src/render/stageview.js`, `src/render/props.js`, `src/render/layers.js` (and `core.js` for a shared helper if needed). Bake-time only: no new per-frame drawing passes, no canvas `filter` or `shadowBlur` per frame.

**The rule that must survive:** black ink and full colour means "you can use this"; pale pencil means scenery. Texture goes into ink fills and the paper. Scenery only gets quieter, never stronger.

All seven items:

1. **Cluster the scenery.** Replace the even scatter with five or six patches along the back and front edges. About 40% fewer props overall. Keep a clear band of about 1.5 rows around the path and one tile around anything playable (candy, boulders, hedges, the blanket, spawns, the start).
2. **Quiet the scenery.** Pale orange saturation and pencil line strength down by about a quarter.
3. **Fade with distance.** Props in back rows are smaller (about 0.8x at row 0), paler and cooler; front rows larger (about 1.1x at row 8) and warmer. A soft baked ground gradient to match: hazier at the horizon, warmer toward the camera.
4. **Paper-on-paper shadows.** A baked smudge shadow under each scenery prop and hedge; a cut-paper edge with a soft shadow where the ground sheet sits on the hedge row.
5. **A stronger frame.** Two or three larger pre-blurred clumps in the bottom corners (never covering the path or the touch buttons' targets); a second hill line on the far sheet.
6. **Marker streaks.** Faint overlapping strokes baked inside ink fills (hedges, boulder, blanket, path), about 6 to 10% darker than the fill, slightly irregular in direction and length, seeded.
7. **More paper.** Slightly stronger grain, two or three fold creases across the page, sparse pencil grass-hatching patches on the ground.

**Deliverable:** before-and-after sheets of the same three views (the start, the boulder alcove at x 18.5, the right end) in `Game/.shots/`, plus one battle backdrop before-and-after. Each item behind a named constant at the top of its file so any one can be dialled back. Frame cost measured before and after with `__game.timeFrames(300)`; it must not rise by more than 0.2 ms mean. `npm test`, `battle-check.mjs` and `play.mjs` still pass.
