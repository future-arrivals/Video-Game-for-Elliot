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
| The game itself | Not started | (will go in `Game/`) |

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

## Questions for Elliot

Only these are needed before building. The full list, in three short sessions, is in section 12 of the design doc.

1. What is each character's name?
2. What does each one do when it opens up?
3. What is in the monster's tummy? Are the heart faces friends or food?
4. Why did the big ghost take the candy?
5. Is the pink one a heart? What is it called?
6. What is the white one with fire on its head?
7. What noise does each one make? (Record them.)

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

## Next step

Build milestone 1 (section 13 of the design doc): walking on a stage, teammates following, one creature, and one complete battle, in the A2 look.

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
