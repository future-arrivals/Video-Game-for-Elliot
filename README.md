# Video Game for Elliot: project handoff

Last updated: 14 November 2026. Read this first in any new chat.

To resume in a new chat: connect this folder and say "Read README.md and Design/slice-design.md, then carry on from Next step."

## What this is

A browser video game starring Elliot's own marker drawings. Many of his drawings are on folded paper: each character has a small folded form and a bigger unfolded form. That fold is the game's main mechanic.

It runs in a phone browser in landscape, played with a PlayStation controller over Bluetooth and cast to the TV, with touch controls as a fallback.

## Status

| Piece | State | Where |
|---|---|---|
| Character art | Done: all 12 characters redrawn as clean SVG, plus creatures and items | `Art/Characters/` |
| Look | Chosen: "Paper Page", cinematic version (A2) | `Art/Style/style-A2.html` |
| Design for the first area | Done, reviewed twice | `Design/slice-design.md` |
| The game itself | Milestone 1 built and Milestone 2 mostly built (14 Nov). **Stages S1 to S3 play end to end**: start as Munch alone, eat the boulder, walk to the pond, Heartfin joins and bridges water, walk to the candy stand, Scoops joins, pushes a boulder and reaches a candy post. **S4 to S6 also play through to the pumpkin door**: the plate-and-gate puzzle, the ghost field, the moat puzzle with the bell, and the do-over pumpkin. Creatures see and chase. Munch, Heartfin, Scoops and the spider are animated while walking. Controller confirmed working on the Mac for an earlier build; **this build has not been played by a person on any device**, only by script | `Game/` (open `Game/dist/elliot-game.html`) |

## Decisions made

1. **Structure:** Pokémon-style. Exploration is live with free movement; battles are turn-based on their own screen. Creatures are visible on the map, with no random encounters.
2. **Any character, any time:** the team travels together and the player swaps lead with L1/R1. Each character keeps its own power. No main-path puzzle may require one specific character.
3. **Fold and unfold** is the signature move in both modes. In the field, the action button unfolds and acts in one press. In battle, folded means protected and unfolded means the big moves.
4. **Camera:** side-on stages, like Paper Mario. A horizon band on top, a ground plane 9 rows deep that scrolls sideways, a blurred foreground edge. Chosen because his characters are all drawn front-facing, so they only need flipping left and right.
5. **Characters are redrawn**, not cut from the photos: faithful to his shapes, faces and colours, with lines and fills tidied.
6. **Look:** the world is drawn in marker on paper. Black marker and full colour means "you can use this"; pale pencil means scenery. Layered paper depth, warm light, scenery that sketches itself in, a snappy camera, and the unfold as the big moment.
7. **Energy and difficulty:** full Nintendo-style punch (flashes, shake, fanfares). Aimed at a capable 7 to 9 year old; he plays above his age. No "calm mode" restrictions.
8. **Battles:** small numbers (hearts up to 11, hits 0 to 7), no misses, no randomness, the enemy shows its next move. Moves sit on Cross, Circle and Triangle; Square folds; L1/R1 switch teammate. Damage shows as one big digit.
9. **First area:** the Pumpkin Patch, seven stages, ending in a boss fight inside the giant pumpkin.
10. **Later lands (his list):** Cave, Water World, Amusement Park, Mushroom Forest, Candy Land. The order in the design doc is a proposal.
11. **Names are placeholders** until he names things. Do not use Nintendo names: the boss is "Big Ghost" and its minions "Little Ghosts" for now.

## Characters

All files are in `Art/Characters/svg/` (vector, built in named parts) and `Art/Characters/png/` (1024 px, transparent). The `compare_*.png` sheets show his drawing beside each redraw.

| Files | What it is | Folds? | Notes |
|---|---|---|---|
| `monster_folded`, `monster_unfolded` | Fuzzy orange monster. The starter. | Yes | Mouth opens to show what it ate. |
| `fish_folded`, `fish_unfolded` | **A heart, not a fish.** Heart face on stick legs. | Yes | Unfolded body reads "Mommy", two hearts, "Elliot", a scribbled-out "Mom", "I ♡ U". The team's healer. File names still say "fish". |
| `icecream_folded`, `icecream_unfolded` | Ice cream with dumbbells | Yes | Five scoops, each with its own face. The two forms are separate drawings, so it flips open; it cannot stretch. |
| `pumpkin_folded`, `pumpkin_unfolded` | Jack-o'-lantern | Yes | Six ghosts inside (`ghost-1` to `ghost-6`). |
| `flowerpot_folded`, `flowerpot_unfolded` | Red flowerpot monster | Yes | A plant grows out. The flower cluster is very dense at game size. |
| `frankenstein_folded`, `frankenstein_unfolded` | Frankenstein | Yes | Head and body pull apart to show a huge mouth. |
| `ball_folded`, `ball_unfolded` | **Ball** (placeholder name). Red, white and blue ball with a sideways face. Added 14 Nov from IMG_3534 and IMG_3535. | Yes, sideways | Opens into a long capsule with friends inside: a pink long-necked creature, an orange head with teeth, two green spiky ones, feather fans. Not in the game yet. Proposed: joins in Water World on the beach; field power "Haul" (his green friend drags sunken things up); battle role "Carrier" (brings a teammate in already open). His own character: no Nintendo names or catching mechanics. Generator: `Source/ball/ball.py`; comparison: `Art/Characters/compare_ball.png`. |
| `firecat` | Unknown. Looks like a white marshmallow standing up with its head on fire. | No | Called "fire guy" for now. Ask him. |
| `beaver` | Beaver chewing a log | No | |
| `orangeowl` | Orange fruit with an owl face | No | |
| `juicebox` | Apple juice box | No | |
| `crab` | Crab in a cowboy hat with a star | No | Legs came out chunkier than his. |
| `ghost`, `ghost_2`, `ghost_3`, `ghost_big`, `bat`, `spider` | The wandering creatures and the boss | No | White bodies added so they show on any background. |
| `lollipop`, `candy`, `fx_candy1`, `fx_candy2`, `orange_object` | Pickups and doodles | No | |
| `pizza`, `sausage`, `fish_1` to `fish_3`, `round_thing`, `triangle_thing` | Things in the monster's tummy | No | `fish_1` to `fish_3` are heart faces. The last two are unidentified. |
| `fx_*`, `doodle_*` | Effects and small doodles | No | Flame, wood chips, orange slice, bats, scribbles, flowers. |

How each folding character opens (hinge lines, part names, the move that closes it) is in `Art/Characters/manifests/`.

## Names and creative calls (chosen 14 Nov)

Elliot had no fixed idea for most of these, so the names and powers below were chosen to suit the gameplay. He can overrule any of them. Names in the game come from `placeholder_name` in `Design/slice-data.json`; the design doc still uses the old placeholders in its text.

| Drawing | Name | Why |
|---|---|---|
| Fuzzy orange monster | **Munch** | He eats boulders and gulps attacks. |
| Heart that grows into a fish | **Heartfin** | A heart when folded; a long fish-heart with tail fins when it grows. |
| Ice cream with dumbbells | **Scoops** | Five scoops, and he lifts. |
| Jack-o'-lantern with ghosts inside | **Punkin** | Ghosts come out of him when he opens. |
| Red flowerpot monster | **Sprout** | A plant grows out. |
| Frankenstein | **Bolts** | He stretches between bolt-posts. |
| White block with a flaming head | **Toasty** | A toasted marshmallow. |
| Beaver with a log | **Chip** | Wood chips. |
| Orange with an owl face | **Zest** | An orange. |
| Juice box | **Sip** | |
| Crab in a cowboy hat | **Sheriff Pinch** | |
| Red, white and blue ball | **Roly** | A ball; something long comes out of him and eats things. |
| Bat, spider, ghost | **Zigzag**, **Webster**, **Spook** | |
| The boss and his minions | **Old Howler** and the **Wisps** | His big move is Howl. Not "Big Boo" or similar: those are Nintendo's. |

Creative calls that go with them:
- **Roly:** the long green spiky friend shoots out of him and eats things at a distance (a ranged eat, up to 3 tiles in a straight line, across water too), where Munch eats only what is next to him. In battle he is the Carrier (brings a teammate in already open) and his open attack is the green friend's **Snap**. This replaces the earlier "Haul" idea.
- **Heartfin:** a heart who grows into a fish. This confirms the Bridge power (he grows long and tips over the water) and the Splash and tail-Slap moves.
- **Punkin:** ghosts come out of him. The giant pumpkin in the Patch is Old Howler's house; Punkin himself joins later and his ghosts float through walls.

## Questions for Elliot

Only these are needed before building. The full list, in three short sessions, is in section 12 of the design doc.

1. What is each character's name?
2. What does each one do when it opens up?
3. What is in the monster's tummy? Are the heart faces friends or food?
4. Why did the big ghost take the candy?
5. Is the pink one a heart? What is it called?
6. What is the white one with fire on its head?
7. What noise does each one make? (Record them.)
8. The ball: what is his name, and is his face meant to be sideways? Who are the friends inside him? Is the blue along the bottom water?
9. Is the pink-and-red pickup a candy or a bowtie?

## Folder map

| Path | Contents |
|---|---|
| `IMG_35xx.HEIC` | His original drawings (photos) |
| `Settings Elliot Would Love.txt` | His list of lands |
| `Art/Characters/` | Redrawn sprites, comparison sheets, manifests |
| `Art/Style/style-A2.html` | The chosen look: three stills and a 15-second animated scene |
| `Art/Style/style-notes.md` | Palette, layers, lighting, camera numbers, unfold timing, asset list |
| `Art/Style/style-directions.html` | The three first options (A was chosen) |
| `Design/slice-design.md` | Full design of the Pumpkin Patch: stages, puzzles, battle rules, boss, controls, build order |
| `Design/slice-data.json` | The same design as data, ready for the game to load |
| `Source/a2_engine.js`, `a2_template.html`, `build_a2.py` | Source of the animated scene. The game's drawing code should start from this. |
| `Source/scripts.zip` | The scripts that generate every character SVG |

## The game build

- Source is small ES modules in `Game/src/`; `cd Game && npm run build` writes the single self-contained file `Game/dist/elliot-game.html`.
- Checks: `npm test` (rules, including every puzzle solution replayed), `node tools/battle-check.mjs` (battle screen), `node tools/play.mjs` (scripted playthroughs by inputs only: battles, save and reload, and the whole route stage to stage; add `--page Game/dist/elliot-game.html` to run them on the built file).
- Animations: `Art/Demos/` holds the animated demo page for each character. `node tools/rigparts.mjs <id>` turns a demo into a parts atlas in `Game/assets/rigs/<id>/`; the clip code is in `Game/src/render/rigs/`, with a porting guide in its `README.md`. `Game/dev/rig.html?rig=monster` plays one rig. `RIG.on` in `Game/src/render/actors.js` switches the game back to the still pictures.
- Look: every visual choice sits behind a named constant at the top of `Game/src/render/stagebake.js`, `fieldmarks.js`, `layers.js`, `props.js` and `actors.js`, so any one can be dialled back. `node tools/sheet.mjs` builds before/after sheets.
- Keyboard for testing: arrows or WASD move; `K` Cross, `L` Circle, `I` Triangle, `J` Square; `Q`/`E` L1/R1; hold `Shift` for R2; `Enter` pause.
- The plans, with what each module does and a progress log of every decision: `docs/superpowers/plans/2026-11-14-m1-walk-and-fight.md` and `2026-11-14-m2-puzzles-and-friends.md`.
- A fresh game starts with Munch alone. For testing: `?party=3` gives all three, `?lead=fish`, `?stage=S3`, `?x=..&y=..` place the team, `?fresh` ignores the save.

## Next step

1. Play it by hand: on the Mac with the controller, then on the phone and cast to the TV. Nobody has yet. Listen to the sounds too (seven are new and unheard).
2. Milestone 2 leftovers: a pause menu with a do-over (the pause screen is only a dimmed card), the hero unfold when a friend joins, a rung bell that still shows its helper badge, Heartfin's tall open form covering the pumpkin door, the spider's dark mouth and web thread, animations for the bat and ghost (the bat has no demo). The design's puzzle 2 route "2d" does not work on the real map (2b does).
3. Animations in battles: the rigs have hurt, happy and attack clips that the battle screen does not use yet.
4. Then milestone 3 (the boss and comics), and milestone 4 after his first playtest.

Milestone 1 as originally specified (section 13 of the design doc): walking on a stage, teammates following, one creature, and one complete battle, in the A2 look.

- One self-contained HTML file, plain canvas, no libraries.
- Controller through the browser's Gamepad API, plus on-screen touch controls.
- Start the renderer from `Source/a2_engine.js`: it already does the paper layers, wobbly marker lines, self-drawing scenery and the unfold sequence at phone-friendly cost.
- Load characters from the PNGs; use the manifests for the fold animation.
- Then milestone 2 (the two puzzles), milestone 3 (the boss and comics), and milestone 4 after his first playtest (timed dash, stickers, collection book).

## Things to know

- The battle input is two presses: the first press previews the move and its damage, the second plays it. A "quick play" setting makes it one press. This was the design agent's addition and has not been tested with him.
- The type circle (Sweet, Spooky, Chompy) is a placeholder that fits badly in places. He should choose the types.
- An earlier automatic tracing of the pumpkin and monster was rejected for looking scratchy. Characters should stay hand-drawn paths.
- One small ghost peeking over the pumpkin's teeth is a tangle of lines in his drawing and is still hard to read.
