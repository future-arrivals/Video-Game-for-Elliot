# M2 "Puzzles and Friends" Implementation Plan

> **For agentic workers:** each task below is given to one fresh agent. Read this header, the header of the M1 plan (`2026-11-14-m1-walk-and-fight.md`: Global constraints and Shared shapes still apply), then your own task and the spec sections it names. Do not run any `git` command: the lead session commits after review. Do not add any `TODO(human)` comment, and leave `touches()` in `src/field/field.js` exactly as it is.

**Goal:** The player can walk from Monster's Corner (S1) to the pumpkin door in the Pumpkin Yard (S6) with any lead: five more stages, two friends who join, three more field powers, two puzzles, creatures that see and chase.

**Architecture:** Unchanged from M1. Rules are pure modules under `src/field` tested in Node; drawing only reads state. New in M2: a `World` holds everything that outlives a stage (who has joined, hearts, candy, each stage's memory); a `FieldState` is still the live simulation of the one stage on screen, built from the World on entry and written back on exit.

**Tech stack:** as M1. No new dependencies.

**Spec:** `Design/slice-design.md` sections 2 (stages S2 to S6, creatures in the stage view, route), 3 (field rules, Puzzle 1, Puzzle 2, the secret, do-over), 5 (join moments), 6 (spider, ghost), 9 (dash), 10 (hero unfold); `Design/slice-data.json` (`stages`, `puzzles`, `field`). The note at the top of the design doc lists what changed after it was written (names; Eat is forgiving; the helper is a badge over the target, not a HUD picture).

**Done when** (design section 13): he can reach the pumpkin door with any lead.

**Out of scope (M3, M4):** S7 and the boss, comics, Candy Dash, the rolling-pumpkin lane, treat stand, sticker machine, the Book, lightbulb hints. Their map characters (`k v f * m`) parse as plain ground.

## Decisions made here (the spec leaves them open)

- **Save** moves to version 2 under the key `elliot-game-save-v2`. A v1 save is ignored: the game starts fresh.
- **A gate stays open once opened**, even if the boulder later leaves the plate. This is kinder and removes a softlock.
- **Forgiving reach for every power**, as for Eat: the right character standing edge-adjacent to the thing (or within 1.3 tiles of its centre) is enough; Cross turns the lead to face it. Bridge is the exception: direction matters, so it uses the lead's facing, and Cross with water adjacent but the wrong facing turns the lead toward the nearest bridgeable line if exactly one exists.
- **Who the badge shows:** if the lead can use the target, the lead. Otherwise the first party member (marching order) who can.
- **A power's wind-up** (unfold, bridge, push, reach) locks movement and buttons until it lands, as Eat does. Creature contact during a wind-up starts the battle after the power lands.
- **Leaving a stage** is not possible during a wind-up. Creatures never follow through an exit.
- **Joining:** walking onto a join tile (`F`, `I`) adds that character to the back of the party at full hearts and emits `join`. The scene plays the hero unfold. Before joining, that character is drawn waiting on its tile, folded.
- **M1's dev default of three characters ends:** a fresh game starts with the monster alone. `?party=3` gives all three for testing.

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/field/creatures.js` | Creature patrol (moved from field.js), then sight, chase, sneak | 0, 3 |
| `src/field/stage.js` | Parses every legend character; solid and water queries | 1 |
| `src/field/world.js` | The World: create, enter a stage, leave a stage, rest, do-over | 1 |
| `src/save.js` | Save v2 (the World plus the live stage) | 1 |
| `src/field/field.js` | Movement, followers, contact; builds a FieldState from World + Stage | 1, then hooks in 2 |
| `src/field/powers.js` | Buttons, target, Eat, Bridge, Push, Reach | 2 |
| `src/field/puzzles.js` | Plates, gates, bells, stones, join tiles, lollipop, do-over | 2 |
| `test/stage.test.js`, `world.test.js`, `powers.test.js`, `puzzles.test.js`, `creatures.test.js` | | 1, 2, 3 |
| `src/render/stagebake.js`, `props.js`, `layers.js`, `stageview.js`, `fieldmarks.js` | Dressing for S2 to S6; water, stones, plate, gate, posts, bell, lollipop, do-over pumpkin, waiting friends, the growing giant pumpkin, the door | 4 |
| `src/render/fieldfx.js` (new), `actors.js`, `camera.js`, `hud.js` | Bridge stretch, push slide, reach, gate opening, sight band, "!", hero unfold | 5 |
| `src/scenes/fieldscene.js`, `src/main.js`, `src/audio.js`, `tools/play.mjs` | Stage travel with the 0.4 s slide, join sequence, pause-menu do-over, sounds, full-route playthroughs | 6 |

## Shared shapes (pinned)

```js
// Stage (src/field/stage.js): M1 fields plus
{ water: [[i, j]], plates: [[i, j]], gates: [[i, j]], posts: [{ at: [i, j], kind: 'candy' | 'bell' }],
  joins: [{ at: [i, j], id: 'fish' | 'icecream' }], doOver: [[i, j]], lollipop: [i, j] | null,
  door: [[i, j]], pumpkin: [[i, j]],          // 'D' and 'Q'
  entrance(fromStageId) -> [i, j] }            // where the team arrives; the stage start if fromStageId is null
// Solid tiles: '#', 'Q', posts, the do-over pumpkin, a waiting friend, a closed gate, a boulder. Water is not
// solid but is not walkable unless it holds a stone or a live bridge. One query answers both:
// canStand(state, stage, i, j) -> bool        (exported from field.js; movement and powers both use it)

// World (src/field/world.js): plain JSON-safe data
{ stageId,                                      // the stage on screen
  party: [{ id, hearts }],                      // lead first; only characters who have joined
  candyCount, lollipop: bool, restAt: { stageId, i, j },
  stages: { [stageId]: StageMemory } }          // only stages visited
StageMemory { candyTaken: [[i, j]], boulders: [[i, j]],   // where each boulder is now
              stones: [[i, j]], gatesOpen: [[i, j]], postsTaken: [[i, j]], joined: [id], asleep: [uid] }

createWorld(data, { party = ['monster'] } = {}) -> World
enterStage(world, stage, data, { from = null, at = null } = {}) -> FieldState   // `at` {x, y} for a save or a dev start
leaveStage(world, fieldState) -> void           // writes the StageMemory and party hearts back
doOver(world, stage, data) -> FieldState        // boulders and stones back to the map; team at the left entrance;
                                                // candy taken and open gates kept
restWorld(world) -> void                        // full hearts; every stage's asleep list cleared

// FieldState: M1 fields plus
{ stones: [{ i, j }], gates: [{ i, j, open }], plates: [{ i, j, down }],
  posts: [{ i, j, kind, taken }], friends: [{ id, i, j }],     // not yet joined, waiting on their tiles
  lollipop: null | { i, j, taken },
  action: null | { kind: 'eat' | 'bridge' | 'push' | 'reach', u, ... } }  // the wind-up in progress, u 0..1; drawing reads it
// action for a bridge: { kind: 'bridge', from: [i, j], dir: [di, dj], len: 1..3, u, short: bool }  (short = falls short, pulls back)
// action for a push:   { kind: 'push', from: [i, j], to: [i, j], u, blocked: bool }

fieldState.target   // null, or { i, j, kind: 'boulder' | 'water' | 'post' | 'bell' | 'doover',
                    //            power: 'eat' | 'bridge' | 'push' | 'reach' | 'reset', by, ready[, nudgeAt] }

Creature { uid, kind, x, y, faceX, facing,
           mode: 'patrol' | 'chase' | 'return' | 'asleep' | 'ignore',
           sees: bool,                           // the lead is in its sight box right now
           sight: { x0, y0, x1, y1 } }           // its sight box in tile units, for drawing the hatch band

// New events from stepField: { t: 'bridge', len }, { t: 'short' }, { t: 'push', to }, { t: 'stone', i, j },
// { t: 'reach', kind }, { t: 'gate', i, j }, { t: 'join', id }, { t: 'lollipop' }, { t: 'spotted', uid },
// { t: 'gaveUp', uid }, { t: 'doOver' }. 'battle' gains sneak: true when the creature had not seen the lead.
// 'exit' stays { t: 'exit', to }.
```

## Review focus

1. **Stuck with no way back.** A boulder pushed into a corner, a stone in the wrong ditch, a reload in that state. The do-over must always work and every listed dead end in section 3 must still be escapable. Task 2 tests each dead end, then a do-over, then a solution.
2. **Something happens in the middle of a wind-up.** Swap pressed mid-bridge, a creature arrives mid-push, the frame is 2 s long, the game is closed. Task 2 tests that each power lands exactly once and the state is never half-way; Task 1 tests that a save taken mid-action loads to a standable tile.
3. **Standing where the ground changes.** On a stone when a do-over fires, in a gate's tile, on the far bank with no bridger in the lead. Task 2 tests that the team is always moved to a standable tile.
4. **A chase that ends badly.** Chased into an exit, caught on the frame of a stage change, a ghost chasing through a hedge and giving up inside it. Task 3 tests give-up returns the creature to its patrol line through walls if it must, and that a creature never leaves its stage.
5. **An old or odd save.** A v1 save, a save naming a stage that no longer exists, a party member who has not joined. Task 1 tests each: fresh start, no crash.

---

## Wave A: rules (all checked in Node; no pictures needed)

### Task 0 (Sonnet): move the creature code out of field.js

**Files:** create `src/field/creatures.js`; modify `src/field/field.js`. Nothing else.
A pure move: `patrolPoints`, `loopLength`, `pointOnLoop`, `distOnLoop`, `face`, `resetCreature`, `stepCreature` and their constants go to `creatures.js`, exporting what field.js calls. `touches()` and `checkContact` stay in field.js, untouched. No behaviour change: `npm test` (65) and `node tools/play.mjs` (30) pass before and after with no test edited. field.js ends under 400 lines.

### Task 1 (Opus): stages, the World, and the save

**Files:** `src/field/stage.js`, `src/field/world.js` (new), `src/field/field.js` (createField becomes a helper of `enterStage`; add `canStand`), `src/save.js`, `test/stage.test.js` (new), `test/world.test.js` (new), `test/save.test.js`, `test/field.test.js` (only where setup must change), `src/scenes/fieldscene.js` (the minimum to keep S1 playable on the new API; Task 6 does the rest).
**Produces:** the Stage, World and FieldState shapes above; `createWorld`, `enterStage`, `leaveStage`, `restWorld`; save v2 `toSave(world, fieldState, settings, pendingBattle)` and `loadSave`.
**Tests:**
- Every stage S1 to S7 parses; each legend character lands in the right list; the counts match the design (S4: 1 plate, 1 gate, 3 boulders, 9 water; S6: 1 bell post, 1 gate, the door at (27,3) and (28,3)).
- Exits pair up: leaving S1 by its right exit on row 5 arrives in S2 at its left exit on the nearest row; coming back arrives at S1's right exit. `entrance(null)` is the start.
- A boulder eaten in S1 is still gone after S1 → S2 → S1; candy taken stays taken; a creature beaten stays asleep until `restWorld`.
- `canStand`: hedge no, water no, water with a stone yes, closed gate no, open gate yes, a waiting friend's tile no.
- Save: round trip mid-stage; v1 save, garbage, a stage id that does not exist, a party member not in the data → `null` (fresh start); a saved position on a tile that cannot be stood on is moved to the stage entrance.
- All existing tests still pass (edit a test's setup only where the API forces it; never its assertions).
**Check:** `node tools/play.mjs` still passes on S1 (runs A to E).

### Task 2 (Opus): powers and puzzles (after Task 1)

**Files:** `src/field/powers.js`, `src/field/puzzles.js` (new), `src/field/field.js` (hooks only), `test/powers.test.js` (new), `test/puzzles.test.js` (new). Move the Eat tests from `test/field.test.js` into `test/powers.test.js` unchanged.
**Produces:** the `target` and `action` shapes and the events above; `doOver` wired to the do-over pumpkin (`reset` power) and exported for the pause menu.
**Rules:** section 3 "Field rules (exact)", with the decisions at the top of this plan. Bridge: 1 to 3 water tiles in a straight line then a standable tile; the team crosses in about 1 s; too long a gap emits `short` and nothing changes. Push: one tile onto ground, path, plate or water (water makes a permanent stone); anything else blocks. Reach: takes the candy from a post or rings a bell. A plate goes down when a boulder is on it (the team's weight does not count); a bell or a plate opens every gate in its stage.
**Tests (each solution is replayed as inputs through `stepField`, not by setting state):**
- Puzzle 1: 1a (ice cream), 1b (fish, from each of rows 6, 7, 8), 1c (monster). With no power used the right exit cannot be reached (flood fill over `canStand`).
- Puzzle 1 dead ends: the loose boulder against the back fence, into the stream, into (15,1); after each, the other solutions still work, and after a do-over 1a works.
- Puzzle 2: 2a, 2b (both bridge spots), 2c, 2d. Fish alone, monster alone and no powers cannot reach the door (search over legal power uses, depth-limited).
- The odd case in section 3: ice cream pushes the plug back into the moat from inside the yard; the fish can bridge back.
- The secret: only a party with the monster reaches (0,0) in S2; the lollipop sets `world.lollipop`.
- S2 bridge lesson: from (15,6) facing back the fish reaches the island candy; from (14,6) it emits `short`.
- S3: push the boulder east from (9,2) and take the alcove candy; reach the post candy at (14,1).
- Review focus 1, 2 and 3 as written above.

### Task 3 (Opus): creatures that see and chase (after Task 0; in parallel with Task 2)

**Files:** `src/field/creatures.js`, `test/creatures.test.js` (new). May not edit `field.js`, `powers.js` or `puzzles.js`; if a hook in field.js is needed, report the exact line.
**Rules:** section 2 "Creatures in the stage view" and `data.field.sight` / `chase`. Sight box 5 ahead (2 if the lead is folded), own row ±1; in depth 3 ahead (2 folded), own column ±1; blind behind; blocked by standees (ghosts see through hedges only). Spotted → chase at 3 tiles/s (bat 3.5); gives up after 3 s out of sight or 6 tiles from its patrol line, then returns. Ghosts move through hedges; ghost 2 patrols in depth and faces back or front. Contact by an unaware creature's victim, that is the lead touching a creature whose `sees` is false and mode is `patrol`, is a sneak attack.
**Tests:** each number above; folded shrinks the reach; a hedge between hides the lead from a spider but not from a ghost; two rows away is outside the band; give-up by time and by distance; a creature never crosses a stage edge; a 2 s frame does not teleport a chaser through the lead without contact; review focus 4.

---

## Wave B: drawing and joining (each agent takes before-and-after or contact-sheet screenshots)

### Task 4 (Opus): dress stages S2 to S6

**Files:** `src/render/stagebake.js`, `props.js`, `layers.js`, `stageview.js`, `fieldmarks.js`. Dev parameter `stage=S4` read in render code or reported for Task 6.
Everything in the Stage and FieldState shapes that sits still: water (marker-blue with a pencil ripple, ink edge), stones, plate, the candy-cane gate with its ribbon to the plate or bell, tall posts with candy or a bell, the lollipop, the do-over pumpkin, a waiting friend (folded, full ink, a small bob), the giant pumpkin growing on the far sheet (0.4x in S1 to filling the horizon in S6), the door. The power outline and badge for every target kind. The look rules from the depth pass hold: ink and full colour means usable; scenery clustered, quiet, clear of anything playable. **Deliverable:** one contact sheet of all six stages end to end, and a close shot of each new object.

### Task 5 (Opus): things that move (after Task 4)

**Files:** `src/render/fieldfx.js` (new), `actors.js`, `camera.js`, `hud.js`, and the calls into them from `stageview.js`.
Draws `fieldState.action`: the fish stretching into a bridge and the team running over; the boulder sliding; the strained face on a blocked push; the reach; a gate swinging open. Each creature's sight box as a faint marker-hatch band; "!" on `spotted`; the camera's 1.2x snap. The hero unfold when a friend joins (design section 10). Tapping a HUD portrait swaps to that character. **Deliverable:** a strip of frames for each animation.

### Task 6 (Opus): join it up (after Tasks 1 to 5)

**Files:** `src/scenes/fieldscene.js`, `src/main.js`, `tools/play.mjs`, `README.md`.
Stage travel with the 0.4 s page slide; the join sequence; the do-over in the pause menu; autosave on entering a stage; the battle backdrop takes the current stage. **Playthroughs added to `play.mjs`:** three full routes from a fresh save to the pumpkin door, each leaning on a different character (monster: Eat the plug in S4, 2c in S6; fish: 1b, 2b; ice cream: 1a, 2a), plus the secret and one sneak attack. Runs A to E keep passing. Rebuild and run the routes against the built file.

### Task 7 (Opus, then Sonnet per character): character animations from `Art/Demos/`

The owner's other session built 15 animation demos (`Art/Demos/*_animation_demo.html`: SVG part rigs posed by script, with clips such as Idle, Waddle, Unfold, a special move, Ouch, Yay). The game draws bitmaps on a canvas, so they need a bridge.
- **7a (Opus, running 14 Nov):** `src/render/rig.js` (rig runtime), `tools/rigparts.mjs` (rasterizes each part), `src/render/rigs/monster.js` (Munch ported, all six clips), `dev/rig.html`, and `src/render/rigs/README.md` (how to port one more). Not wired into the game.
- **7b (Sonnet, one task per character):** port Heartfin, Scoops, Webster and Spook from their demos by following the README. Later characters as they enter the game. There is no demo for the bat (Zigzag).
- **7c (Opus, with Task 5):** wire rigs into `drawMember` and the battle actors: Idle and Waddle in the field, Unfold in place of the paper hinge, the special move, Ouch and Yay in battles. Fall back to the bitmap sprite for any character without a rig.

## Sonnet-sized tasks (hand out as the files become free)

| Task | Files | Check |
|---|---|---|
| New sounds: splash, stretch, push, bell, gate, join fanfare, spotted sting | `src/audio.js` | each plays without error in `dev/input.html`'s sound test |
| Contact-sheet tool: one PNG of every stage end to end | `tools/stages.mjs` (new) | the PNG shows S1 to S6 |
| Candy counter pop, and a lollipop icon in the HUD once found | `src/render/hud.js` (after Task 5) | screenshot |
| The battle backdrop's giant pumpkin scales with the stage | `src/render/battle/scenery.js` | screenshots for S1 and S6 |
| Spider and ghost field sprites at field size, with a paper-white fill | `src/render/actors.js` (before Task 5) | screenshot |
| README and design-doc notes when M2 lands | `README.md`, `Design/slice-design.md` | read-through |

## Order and cost

Wave A is three Opus tasks and one Sonnet task and needs no visual sign-off: every claim is a Node test. Wave B is three Opus tasks plus the Sonnet list and ends with a look at the pictures. From the clarity batch (three Opus agents, one correction round, two Sonnet tasks: about 35% of a 5-hour window including review), expect Wave A at about 30% of a window and Wave B at about 45%.

## Progress log (lead session)

- **Task 0** done and committed (8ee0cbc). **Sounds** done and committed (8ca701d).
- **Task 3** (creatures) reported done, NOT yet committed: `src/field/creatures.js`, `test/creatures.test.js` (12 pass). Two setup changes to apply once Task 1 has finished with these files:
  1. `test/field.test.js`, "contact emits exactly one battle", the "contact needs matching depth" part: test `touches()` directly (`touches({x:9.5,y:3.2},{x:9.5,y:2.5}) === false`, `touches({x:9.5,y:3.0},{x:9.5,y:2.5}) === true`; import `touches`).
  2. `tools/play.mjs` run C: replace `__play.meet()` with `__play.walkTo(16.5, 4.5)` so the bat spots the lead and the battle is not a sneak attack.
  Follow-ups for Task 2 or a Sonnet task: `blocksSight` / `blocksMove` at the top of creatures.js should learn the new blockers (closed gates, posts, `Q`, do-over pumpkin, waiting friends; walkers follow `canStand`; ghost and bat pass `#`). The spider's 1 s pause at each patrol end is not implemented. `OVER_HEDGES` lets the bat fly over hedges.
- **Task 1** (stages, world, save) and **Task 7a** (rig runtime + Munch) running.
- **Tasks 1 and 3 committed** with both setup fixes applied: 94 tests pass, play.mjs all passed. Changes to the pinned shapes that Task 1 made (later tasks must use these):
  - `stage.entrance(fromStageId, row?)` and `enterStage(world, stage, data, { from, row, at })`: `row` picks the nearest exit row; the team arrives one tile inside the exit. `at` may carry `faceX`, `facing`, `form`.
  - `stage.doorTo` (S6: 'S7'); `stageId(to)` cleans annotated exit targets; every `exits[].to` is a plain id.
  - `stage.isSolid` also blocks `Q ^ B r`. `canStand(state, stage, i, j)` (field.js) is the one walkability query: no for outside, `#`, `Q`, posts, `r`, live boulders, a waiting friend, a closed gate; water only with a stone; **live bridge tiles are not in it yet (Task 2 adds them; a comment marks the spot)**.
  - The S3 post candy at (14,1) is only in `stage.posts` / `fieldState.posts` (not in `stage.candy`): Reach must add 1 to `candyCount`.
  - `createField({ stage, data, party, memory, candyCount, restAt, lollipop, at, from, row })` is the builder `enterStage` uses. `fieldState._sim.joinIds` feeds `StageMemory.joined`.
  - Save v2: `{ v: 2, stageId, world, lead: { x, y, faceX, facing, form }, settings[, pendingBattle] }`; `toSave(world, fieldState, settings, pendingBattle)`; load with `enterStage(s.world, stage, data, { at: s.lead })`. `scene.world` is exposed by fieldscene.js.
  - Dev: a fresh game is the monster alone; `party=3` gives all three; `lead=X` implies `party=3`.
  - Creature: `c.sees`, `c.sight {x0,y0,x1,y1}` (recomputed even when asleep: drawing skips asleep creatures); events `spotted`, `gaveUp`.

### 15:30, Task 7a done (commit e6f21c4)
- Rig runtime: `src/render/rig.js`. `loadRig(assets, id)`, `rigPose(rig, clip, t, { form, T, zoom }, out)`, `drawRig(ctx, rig, pose, sx, sy, scale, { flip, alpha, shadow, glow, flashMax })`, `drawRigFx(...)` for particles and word pops. (sx, sy) is the feet point; scale is screen px per drawing unit, same as drawMember.
- Munch (`monster`) has six clips: idle, hop, unfold, chomp, hurt, happy. Looping clips wrap; one-shots clamp to a rest pose.
- `loadRig` returns null for a character with no rig: the caller falls back to the bitmap.
- Decision for wiring (Task 7c): hurt keeps `flashMax` 0.7 and drops the demo's second white pulse (one flash only, TV-safe).
- Scoops needs two rigs (`icecream`, `icecream_folded`), chosen by form. Heartfin port started with a Sonnet agent; other ports wait for usage.
- Usage at 15:28: 60% of the 5-hour window, resets 19:30 local.

### 15:40, scope for today narrowed by the owner
- Target: S1 to S3 playable end to end by 19:30 local, with about 40% of the usage window left. The owner will not be working after 19:30.
- Tasks 2 and 4 told to finish what S1 to S3 need and stub the rest (plates, gates, bells, lollipop, S4 to S6 scenery).
- Order from here: review powers, review S2 and S3 drawing, join up S1 to S3 (Task 6, narrowed, with only the simplest motion from Task 5), then wire Munch's rig if usage is left. End with a rebuild, README update and a clean commit.
- S4 to S6, the other character ports and the rest of Task 5 carry over to the next session.

### 16:00, Task 2 done (rules part 2 committed); Heartfin rig ported (57c01e5)
- Nothing stubbed: all powers, plates, gates, bells, lollipop, joins and do-over are built and tested (134 tests).
- Shape changes: `state.action` replaces `_sim.eat`; actions `eat {kind,i,j,u}`, `reach {kind,i,j,what,u}`; wind-ups: unfold 0.5 s first, then push 0.4, blocked push 0.5, reach 0.4, bridge 1.0, short bridge 0.8.
- Events: blocked push ends with `nope`; `reach` carries `i, j, kind` and a candy post emits only `reach` (the HUD candy pop must listen for it); `join {id}` (tile from `stage.joins`).
- Joining is by touch: lead within 0.4 tiles of the friend's tile (the tile itself cannot be stood on).
- `doOver(world, stage, data, state = null)` in world.js; rules in `puzzles.js` `resetPuzzle`.
- New exports: field.js `placeTeam`, `standableNear`; powers.js `advancePowers`; puzzles.js `bridgeLine`, `onBridge`, `pushResult`, etc.
- Design note for later: P2 solution 2d (Fish + Ice Cream, west) does not work on the real map (boxed in at (23,1)); not a softlock, 2b still solves it. Fix the map or the doc when S5 and S6 are dressed.
