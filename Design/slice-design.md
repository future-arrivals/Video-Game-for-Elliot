# Pumpkin Patch: First Playable Slice

Design spec for the first playable slice. Character names, type names and move words are **placeholders** until the child picks them (section 12). Every battle number is exact and was checked by script. `slice-data.json` has the same content in structured form.

**Who it's for:** a capable player of about 7 to 9 who knows Pokémon, Mario and Zelda, and is an early reader. The first ten minutes are an easy on-ramp. After that, battles need real planning, exploration has some action in it, and the boss can take a couple of tries.

---

## 0. Design pillars

1. **Same look, same rule.** A boulder is always a boulder, and water always behaves the same way. A move word means the same thing on everyone who has it (`Curl` always means "folded and does nothing", for the spider and the boss alike). If two things act differently, they must look different. This is what lets him master the systems.
2. **Battles are puzzles, not dice rolls.** No misses and no random numbers. Every enemy shows its whole move loop, and every number shown is the final number. The challenge is planning, not luck.
3. **Puzzles are for thinking, exploration is for action.** The two main field puzzles have no timers, and creatures never go inside puzzle areas. Everywhere else there is light real-time action: creatures that spot and chase you, a rolling-pumpkin lane, and an optional timed dash.
4. **Fold/Unfold is the star.** Every system uses it: field powers, being spotted by creatures, battle defence, and the big moves. Unfolding is staged as the hero moment (section 10).
5. **Readable.** Small numbers (hearts up to 11, hits from 0 to 7, each shown as one big digit). Every move is a picture plus one short word.
6. **Two ways through.** Any character can lead, so every main-path puzzle has at least two solutions and none needs a specific character. Optional secrets may need one specific character.
7. **Collect and master.** No levels in the slice, so the numbers in the Book stay true. The Book records everything he has met, beaten and solved.
8. **Small, normal stakes.** Losing a battle sends the team back to the last rest blanket, with the creatures awake again. Nothing else is lost.

---

## 1. Goal and story

**Opening comic (4 pictures, no words, then a title card):**
1. A big pile of Halloween candy sits in the Pumpkin Patch, and everyone is celebrating.
2. Big Ghost bursts out of the giant pumpkin, and the candy gets sucked inside.
3. Fuzzy Monster's tummy rumbles. It glares at the pumpkin.
4. Title card: the map, with a marker line drawing itself to the giant pumpkin.

> *Big Ghost stole ALL the candy and hid in the giant pumpkin! Fuzzy Monster finds its friends, battles across the Pumpkin Patch, and takes the candy back.*

**Ending comic:** the Little Ghosts are freed and Big Ghost coughs up the candy. Big Ghost was lonely and wanted a party, so everyone shares. Optionally, Frankenstein unfolds in the background (section 11.3). This is a placeholder until he tells us what the baddies want (question 4).

The HUD always shows a pumpkin goal marker.

---

## 2. The Pumpkin Patch: stages (side-on view)

### View and camera [M1]

The game uses a **side-on stage view** (style A2, `style/A2-overworld.png`), not a top-down map. His characters are all drawn facing front, so a stage view only needs **left/right flipping** of each drawing, never back or side views.

- **Screen bands** (design resolution 844 x 390 logical px, scaled to the device and the TV):
  - **Horizon band, top 22% (about 86 px).** Far sheet (pencil hills, trees, bats crossing) and mid sheet (hedge row). The **giant pumpkin** is a distant landmark on the far sheet and grows stage by stage: 0.4x in S1, 0.55x in S2, 0.7x in S3, 0.8x in S4, 0.9x in S5, and filling the horizon in S6.
  - **Ground plane, middle 69% (about 270 px).** The playable stage: **9 rows deep** (y 0 at the back, y 8 at the front) and 24 to 36 tiles wide. One tile is **48 px across x 30 px deep** (the ground is foreshortened).
  - **Foreground edge, bottom 9% (about 34 px).** Pre-blurred grass, leaves and fence posts. Nothing playable sits under it.
- **Visible area:** about **17.5 tiles across** at zoom 1.0. That is 14.8 tiles at the 1.14x push-in and 20 tiles at the 0.86x vista pull-back. The whole 9-row depth is always on screen at zoom 1.0. At push-in the horizon band takes most of the crop; at most half of row 0 goes off the top.
- **Camera:** scrolls along x only. Follow, look-ahead, stiffness and zoom levels are as in the A2 notes:
  - look-ahead 0.32 s, follow stiffness k = 9/s;
  - 1.14x push-in near a power spot or a creature within about 5 tiles;
  - 0.86x vista when the giant pumpkin fills the horizon in open ground;
  - hero-moment and bridge-landing zooms;
  - allowed range 0.85 to 1.45.
  The camera never scrolls past a stage's ends.
- **Movement:** free analog movement in 2D on the ground plane: x along the stage, y in depth. Speed is 4 tiles/s along x and 4 rows/s in depth (5.5 when dashing). Depth steps look shorter on screen; that is intended.
- **Draw order:** by the feet's y; lower on the screen is nearer and drawn on top. A tall standee (hedge, post, boulder, pumpkin) in front of the lead fades to 50% while it overlaps the lead, so the lead is never hidden.
- **Facing:**
  - The sprite flips left or right only.
  - Powers use 4 facing directions, taken from the stronger axis of the last movement. Facing back (up) or front (down) shows a small marker arrow at the lead's feet.
  - The thing a power would hit gets the A2 **dashed outline** ("a power fits here").

### Stage legend (same symbols in every stage)

| Char | Meaning |
|---|---|
| `.` / `:` | Ground / dirt path. Both are walkable; the path marks the main route. |
| `#` | Hedge or fence standee. Blocks walking and sight (ghosts float and see through it). The back edge (y −1) and front edge (y 9) of every stage are implicit fences. |
| `~` | Water. Fish bridges 1 to 3 tiles; a pushed boulder becomes a stepping stone. |
| `O` | Boulder standee. Monster eats it. Ice Cream pushes it 1 tile, never two in a row. |
| `<` / `>` | Stage exit at the left / right end. |
| `S` | Start |
| `R` | Rest blanket (heal, wake, respawn point, autosave, treat stand [M4]) |
| `c` | Candy pickup (A2 glow disc) |
| `H` | Hidden Rainbow Lollipop |
| `^` | Tall post with candy on top |
| `B` | Tall post with a bell |
| `P` | Plate (round dent) |
| `G` | Candy-cane gate (ribbon to its plate or bell) |
| `F` / `I` | Fish joins / Ice Cream joins |
| `Q` / `D` | Giant pumpkin standee / its door |
| `r` | Do-over pumpkin |
| `m` | Sticker machine [M4] |
| `k` / `v` | Pumpkin chute / rolling-pumpkin lane, walkable [M4] |
| `f` / `*` | Candy Dash flag / star spots (stars appear only during a dash) [M4] |
| `b` `s` `g` | Bat, spider and ghost spawn points |
| `E` | Boss-stage exit (back out through the pumpkin door) |
| `X` / `L` | Big Ghost (2x2) / Little Ghost (boss stage only) |

### How the stages connect

```
 S1 Monster's Corner ──> S2 The Pond ──> S3 Candy Stand ──> S4 Candy-Cane Gate ──> S5 Ghost Field ──> S6 Pumpkin Yard ──(door D)──> S7 Ghost House
   (zone A, start)       (zone B,         (zone C,          (Puzzle 1: gate /       (zone D)            (Puzzle 2, rest,                 (boss stage)
                          Fish joins)      Ice Cream joins)   plug / stream)                             sticker machine)
```

- Every exit works both ways.
- Walking off an exit slides the page to the next stage (0.4 s). The team arrives at that stage's matching exit, on the same row where possible, or else the nearest exit row.
- S4's right exit can be reached only by getting past the divider.
- S6 leads on only through the pumpkin door.

### S1 Monster's Corner (zone A), 28 x 9. Teaches moving, sneaking, the first battle, and Eat.

```
    0000000000111111111122222222
    0123456789012345678901234567
 0  ...................#c#......
 1  ...c...............#O#......
 2  ......b.....................
 3  ............................
 4  ...........................>
 5  :S:::::::::::::::::::::::::>
 6  ...........................>
 7  .R..........................
 8  ............................
```

- Start at (1,5); rest blanket at (1,7).
- **Bat**: spawn (6,2), clockwise loop (4,2) → (16,2) → (16,6) → (4,6). The loop crosses the path on rows 5-6.
- Candy at (3,1).
- **Eat lesson:** candy at (20,0) sits in a back alcove behind a boulder at (20,1). Face up from (20,2) and press Cross. Ice Cream cannot push it later, because the candy blocks the boulder.

### S2 The Pond (zone B), 36 x 9. Teaches Bridge, enemy Curl and Sticky, and the Candy Dash [M4].

```
    000000000011111111112222222222333333
    012345678901234567890123456789012345
 0  HOO.....~~~~~~~~~~~~~~~....*........
 1  ###.....~~~~~~~~~~~~~~~.............
 2  ........~~~~~~~c~~~~~~~....c......*.
 3  ........~~~~~~~~~~~~~~~.............
 4  ....*...~~~~~~~~~~~~~~~.............
 5  ........~~~~~~~~~~~~~~~.............
 6  <...........F.................f....>
 7  <::::::::::::::::::::::::::::::::::>
 8  <...s.......*..........*...........>
```

- **Fish joins** at (12,6) on the bank.
- **Bridge lesson:** island candy at (15,2). From (15,6) on the bank, face back (up) over exactly 3 water tiles (rows 5, 4, 3). This is the only spot; every other approach crosses more than 3 water tiles.
- Candy at (27,2).
- **Spider 1**: spawn (4,8), patrol along row 8 from x 2 to x 33.
- **Secret** at the back-left (section 3).
- **Candy Dash [M4]:** flag at (30,6); stars at (34,2), (27,0), (23,8), (12,8), (4,4). The route is about 52 tiles, about 9.5 s while dashing; the limit is **13 s**. Spider 1 patrols the front row the route crosses.

### S3 Candy Stand (zone C), 32 x 9. Teaches Push, Reach and the pumpkin lane [M4].

```
    00000000001111111111222222222233
    01234567890123456789012345678901
 0  .........#c#............k.......
 1  ..R......#.#..^.........v.......
 2  ..........O.............v.......
 3  ......I.................v.......
 4  ........................v.......
 5  <.......................v......>
 6  <:::::::::::::::::::::::v::::::>
 7  <.................s.....v......>
 8  ........................v.......
```

- Rest blanket at (2,1). **Ice Cream joins** at (6,3).
- **Reach lesson:** candy on the tall post at (14,1).
- **Push lesson:** alcove candy at (10,0). Its doorway (10,1) is blocked by a boulder at (10,2). Push it east from (9,2), then walk up. Monster can eat it instead.
- **Spider 2**: spawn (18,7), patrol along row 7 from x 13 to x 22 (it stops short of the lane).
- **Rolling-pumpkin lane [M4]:** chute `k` at the back (24,0). Every 2.5 s a pumpkin rolls **toward the camera** down column 24 at 5 rows/s and bursts at the front edge. The lane covers all 9 rows, so it must be crossed, by timing. A hit costs the lead 1 heart (never below 1) and bumps it 1 tile back the way it came.

### S4 The Candy-Cane Gate (Puzzle 1), 24 x 9

```
    000000000011111111112222
    012345678901234567890123
 0  ................##......
 1  ..r.............OO......
 2  ................##.....>
 3  ................G::::::>
 4  ............O...##.....>
 5  <...............##......
 6  <::::::::::P...~~~......
 7  <...c..........~~~......
 8  ...............~~~......
```

A two-tile-thick divider runs the full depth at x 16-17: hedge, the boulder plug on row 1, the gate on row 3, hedge on rows 4-5, and a 3-wide stream (x 15-17) on rows 6-8. Details are in section 3.

### S5 Ghost Field (zone D), 32 x 9. Teaches the type circle.

```
    00000000001111111111222222222233
    01234567890123456789012345678901
 0  ................................
 1  ........................g.......
 2  ..............##................
 3  <.....g.......##...............>
 4  <::::::::::::::::::::::::::::::>
 5  <..............................>
 6  ................................
 7  ................................
 8  .............................c..
```

- **Ghost 1**: spawn (6,3), patrol along row 3 from x 1 to x 30, floating through the hedge clump at x 14-15.
- **Ghost 2**: spawn (24,1), patrol in depth up and down column 24, rows 0-8. It faces back or front as it moves.
- Candy at (29,8).

### S6 The Pumpkin Yard (Puzzle 2), 32 x 9

```
    00000000001111111111222222222233
    01234567890123456789012345678901
 0  ...................~~~##.QQQQQQ.
 1  .....r.............~~~.O.QQQQQQ.
 2  ...................~~~##.QQQQQQ.
 3  <..................~~~##...DD...
 4  <::::::::::::::::::....#........
 5  <...........~~~~#......#........
 6  ............~...#......G........
 7  .Rm.......O.~.B.#......#......c.
 8  ............~..c#......#........
```

- Rest blanket (1,7) and sticker machine (2,7) [M4] sit right before the puzzle.
- Puzzle details are in section 3.
- The giant pumpkin standee fills the back right, with its door at (27,3)-(28,3).

### S7 Ghost House (boss stage), 20 x 9. Night treatment from the A2 notes.

```
    00000000001111111111
    01234567890123456789
 0  ....................
 1  ....................
 2  ...........L........
 3  .............XX.....
 4  E............XX.....
 5  ................L...
 6  .R..........L.......
 7  ....................
 8  ....................
```

- Enter at E (0,4); rest blanket at (1,6).
- Big Ghost at (13-14, 3-4), with Little Ghosts floating at (11,2), (16,5) and (12,6).
- Walk into Big Ghost to start (section 7).

### Creatures in the stage view: sight, chase, sneaking [M1: the bat's patrol and contact. M2: sight, chase, sneak attack]

- **Facing.** A creature faces the way it is moving. On x-patrols that is left or right; Ghost 2 faces back or front.
- **Sight box** (drawn faintly on the ground as a marker-hatch band):
  - Facing along x: **5 tiles ahead if the lead is open, 2 if folded**, covering the creature's own row ±1 (a band 3 rows deep).
  - Facing in depth: **3 rows ahead if open, 2 if folded**, covering its column ±1.
  - Nothing behind it.
  - Standees between the creature and the lead block sight: hedges, boulders, gates, posts, the sticker machine and the pumpkin. Ghosts see through hedges only.
- **Sneaking in a 9-deep plane** works three ways:
  1. **Change rows:** get 2 or more rows away from its row (the band is only 3 rows deep, so a 9-row plane leaves 6 rows outside it).
  2. **Pass behind it**, or use a standee as cover.
  3. **Fold** to shrink its reach to 2.
- **Spotted:** "!" plus a sting, a camera snap to 1.2x, then the chase at 3 tiles/s (the bat at 3.5). The player walks at 4 and dashes at 5.5. The creature gives up after 3 s out of sight, or 6 tiles from its patrol line, and never leaves its stage. Ghost chases cross hedges.
- **Contact:** only the lead's footprint (radius 0.35 tiles on the ground plane, at matching depth ±0.5 rows) counts.
  - Touching an unaware creature is a **sneak attack**: the enemy is Dizzy.
  - Being caught starts the battle normally.
  - Afterwards the creature sleeps at its spawn until the next rest; if you ran, it ignores you for 3 s.

### Route and on-ramp (one new idea per step)

| Stage | Party | New idea |
|---|---|---|
| S1 | Monster | moving, sneaking, first battle, **Eat** |
| S2 | + Fish | **Bridge**; enemy **Curl** and **Sticky**; Candy Dash [M4] |
| S3 | + Ice Cream | **Push** and **Reach**; pumpkin lane [M4] |
| S4 | all 3 | **plate opens gate** (Puzzle 1; any single character solves it) |
| S5 | all 3 | **type circle** (ghosts) |
| S6 | all 3 | **stepping stones and combining powers** (Puzzle 2) |
| S7 | all 3 | boss |

- **Candy:** 10 on the map. S1 has 2, S2 2, S3 2, S4 1, S5 1, S6 2; plus the Rainbow Lollipop in S2.
- **Rest blankets:** S1, S3, S6 and S7.
- **Length:** 45 to 75 minutes in total, over a few 10 to 20 minute sittings. Each rest blanket is a natural stop.

---

## 3. Field powers and puzzles

### Field rules (exact) [M2, except the Fold toggle, which is M1]

- **Fold/Open (Square). [M1]** A manual toggle with the 0.5 s paper-hinge animation (A2: the flap's back is a different paper colour and settles with a 5% overshoot). It matters mostly for sneaking: the sight reach is 5 when open and 2 when folded. Speed is the same in both forms, and followers are always folded.
- **Use (Cross). [M2]** Works when the tile directly ahead in the facing direction holds something the lead can use; that thing shows the dashed outline. **One press does everything:** a folded lead unfolds (the hinge plays), then acts.
- **Form after a power (same rule everywhere): the lead is left open.** Press Square to fold again.
- **Eat (Monster):** removes the boulder ahead.
- **Bridge (Fish):** the tiles ahead must be 1 to 3 water tiles in a straight line, then a walkable tile. This works along x, and in depth (back or front), where the bridge is drawn foreshortened. The team runs over in about 1 s, and the Fish is left open on the far bank. Too long a gap: it stretches, falls short, and pulls back.
- **Push (Ice Cream):** the boulder ahead slides 1 tile onto ground, path, plate or water (water makes a permanent stepping stone). Anything else, including another boulder or a candy, stops it: the strained teal-scoop face appears and the boulder wobbles.
- **Reach (Ice Cream):** takes the candy from the tall post ahead, or rings the bell ahead.
- **Swap lead (L1/R1 or tap a portrait):** free, anytime.
- **Helper portraits:** when the lead is within 2 tiles of something a teammate could use, that teammate's portrait shows a tiny picture of it.
- **Do-over pumpkin (`r`), also in the pause menu:** resets that stage's puzzle boulders and stones and puts the team at the stage's left entrance. Collected candy and opened gates stay as they are.

### Puzzle 1: The Candy-Cane Gate (stage S4; no creatures) [M2]

**Goal:** get past the divider at x 16-17 to the right exit. **New idea:** a plate opens its gate. **Any one character can solve it alone.** No reshaping was needed; the same three solutions fit the 9-deep stage.

| Solution | Character | Steps |
|---|---|---|
| 1a | **Ice Cream** | Stand at (13,4) facing left and push the boulder to (11,4). Walk around to (11,3), face front (down), and push twice: (11,5), then onto the plate at (11,6). The gate at (16,3) opens. Walk through (16,3) → (17,3) → the path to the exit. Two push directions make it a small sokoban. |
| 1b | **Fish** | From any of (14,6), (14,7) or (14,8), face right and Bridge over (15-17, y) to (18, y). |
| 1c | **Monster** | At (15,1) face right and Eat (16,1). Step forward, Eat (17,1), and walk out to (18,1). |

Checked by script on the stage grid:
- Each character alone can solve it.
- With no powers it cannot be solved.
- Ice Cream cannot push the plug, because the boulders are two in a row.

Dead ends:
- The loose boulder pushed against the back fence, into the stream (it becomes a stone, but 2 water tiles remain), or into (15,1) in front of the plug. The plug and stream solutions still work, and the do-over restores the plate solution.
- **Softlock check:** in every reachable state the player can still get back to the entrance by walking, or by bridging back from the far bank or a stone. The pause-menu do-over always works.

### Puzzle 2: The Pumpkin Yard (stage S6; no creatures) [M2]

**Goal:** reach the pumpkin door at (27-28, 3). The yard (x 24-31) is walled by a hedge at x 23 with two openings: the boulder plug at (23,1) and the gate at (23,6). **New idea:** stepping stones and combining powers. No reshaping was needed.

| Solution | Characters | Steps |
|---|---|---|
| 2a | **Ice Cream** alone | From (9,7) facing right, push the boulder (10,7) to (11,7), then into the ditch at (12,7): it becomes a stone. Walk (12,7) → (13,7). Face right and ring the bell at (14,7). Gate (23,6) opens; walk in to the door. |
| 2b | **Fish + Ice Cream** | Fish Bridges the ditch from (11,6-8) facing right, or from (13-15,4) facing front. Swap to Ice Cream and ring the bell. |
| 2c | **Fish + Monster** | From the bank at (18,1), Fish Bridges right over (19-21,1) to the landing at (22,1), which is boxed in by hedges at (22,0) and (22,2). Swap to Monster, Eat (23,1), and walk into the yard. |
| 2d | **Fish + Ice Cream** (west) | As 2c, but Ice Cream pushes (23,1) right to (24,1). |

Checked by script:
- Solvable by Ice Cream alone, Fish + Monster, Fish + Ice Cream, and Monster + Ice Cream.
- **Not** solvable by Fish alone, Monster alone, or no powers.
- So no character is required: without Ice Cream use 2c, without Fish use 2a, without Monster use 2a, 2b or 2d.
- The moat cannot be bridged from the front (4 tiles deep) or onto hedge.

**Softlock check:** in every reachable state the player can still get back by walking or by bridging. In the oddest case, Ice Cream pushes the plug back into the moat from inside the yard and stands on the new stone; the Fish bridges back west from it. The pause-menu do-over always works.

### Secret: Rainbow Lollipop (stage S2, back-left; Monster only; optional) [M2]

- A one-row corridor along the back fence: lollipop at (0,0), boulders at (1,0) and (2,0), hedges at (0-2,1).
- Stand at (3,0) facing left. Eat (2,0), step, Eat (1,0), and take the lollipop.
- Checked by script: only teams that include the Monster can reach it. Ice Cream cannot push two boulders in a row, and there is no water to bridge.

### When he gets stuck: hints with no reading [M2: do-over pumpkin. M4: lightbulb hints and stamps]

The lightbulb (Triangle in the field) shows the lead's thought bubble. Each press inside a puzzle stage shows the next card:
1. **Goal card:** the target.
2. **Who can help:** a portrait plus the object, cycling through the solutions he has not stamped yet.
3. **Show me:** glowing footprints on the ground plane, with the facing arrow, step by step.

Outside puzzles, the lightbulb points toward the next stage. Each different solution earns a Book stamp (3 slots for Puzzle 1, 4 for Puzzle 2); after solving, the do-over can reset the puzzle so he can collect the rest.

---

## 4. Battle system [M1 core]

Battles are one active character against one enemy, on a separate page. Turns go one at a time. The player always acts first.

### Rules

- **Start.** The lead enters **folded**. The enemy's strip starts at card 1, or card 1 is skipped if the enemy is Dizzy from a sneak attack.
- **Enemy strip.** A fixed loop of cards that repeats, shown in full above the enemy with a pointer. Each card shows:
  - the enemy's **form** this round, which also applies during your action;
  - its action: an icon, a word, and the final number against your current character and form.
- **Round order:**
  1. Show the card.
  2. The player picks an action with the face buttons, shoulders or triggers (section 4, buttons). There is no turn timer. The first press lifts the card and previews its exact heart loss. If the action would change your form or character, the enemy's intent digit updates.
  3. Your action resolves.
  4. If the enemy (or its last shield) is gone, the battle (or phase) ends and the card **does not happen**.
  5. The card resolves.
  6. If your active character has 0 hearts, it is **knocked out (Sleepy)**. You pick the next character for free and it comes in folded.
  7. The pointer moves on.
- **Damage:** `final = base (+2 Lift) (+1 Fresh) + type bonus − 1 if the target is folded`, never below 0. The same rule applies to everyone.
- **Fold/Open** uses your turn and takes effect immediately, so it already counts against this round's card.
  - **Folded:** takes 1 less from every hit. Folded moves only.
  - **Open:** takes full hits. Open moves only.
- **Fresh (the fold/unfold combo).** After you Open, your **first damaging move while open gets +1**. A sparkle badge shows it. The bonus is lost if you Fold first. This is the reward for timing an Open well, for example during an enemy's `Curl` or `Float`.
- **Status effects (two in the slice):**
  - **Sticky** (from the spider's `Web`) **[M4 polish; rule M1]**. While the `Web` card is showing, nothing is locked yet: its intent bubble shows a web icon and the word, and **no buttons appear locked during that round's selection**, because you act first. When `Web` resolves at the end of the round, a big wrapping animation webs over the **Fold/Open** and **Team** buttons and the Sticky badge appears. It applies to **your next turn only**, then the web snaps off.
  - **Dizzy** (sneak attack) **[M2]**: the enemy skips its first card. Stars appear on that card.
- **Bag (items) [M4].** Carry up to 3 **Candy Apples**. Each heals the active character 3 and uses your turn. They are bought at a rest blanket's treat stand for 2 candy each.
- **Team (switch)** uses your turn. The incoming character arrives folded and receives the card. The outgoing character folds and drops any Lift, Fresh or tummy contents.
- **Heals** never go above max hearts and never wake a Sleepy character.
- **Hearts carry over** between battles. Rest blankets restore them for free.
- **Run** always works against creatures, and the battle ends before the enemy acts. You **cannot run from the boss**.
- **Win.** A victory fanfare plays. The creature flops over dizzy, drops its candy, and sleeps at its spawn until the next rest. Its Book page gets +1 "times beaten".
- **Lose** (all three Sleepy). The page tears softly, and the team wakes at the **last rest blanket** with full hearts. Every creature is awake again at its spawn, and Candy Apples used are gone. Candy, puzzles and stamps are kept.
- **Boss-loss hint (no words) [M3].** After losing to the boss, the team wakes at the rest blanket inside the pumpkin, and the type-wheel icon glows on the portrait of whichever teammate is strong against the boss's type (Ice Cream: Sweet beats Spooky). It keeps glowing until the next boss attempt starts.

### Type circle (placeholder names) [M1]

**Sweet beats Spooky, Spooky beats Chompy, Chompy beats Sweet.** Strong: **+1**. Weak: **−1**. Same type: **0**.

| attacker ↓ / defender → | Sweet | Spooky | Chompy |
|---|---|---|---|
| Sweet | 0 | +1 | −1 |
| Spooky | −1 | 0 | +1 |
| Chompy | +1 | −1 | 0 |

A small 3-icon wheel stays in the corner of the battle screen. Arrows next to a number show when a modifier applies.

### Screen, buttons and one turn [M1; hit-stop and shake polish M4]

```
 (Flap)(Flap)[Bite]  <- enemy strip, pointer on current card        (type wheel)
                                    ENEMY  ♥♥♥♥♡    intent bubble: [teeth] 3
 [L1 portrait]                                           [R1 portrait]
   YOUR CHARACTER ♥♥♥♥♥♥♡♡♡   badges: Fresh / Lift / tummy / Sticky
                               [△ Drop 3]
            [□ Open/Fold]                  [○ Snack 2♥]
                               [✕ Claw 2]
 (hold L2: Bag)                                     (hold R2: Run)
```

**Damage display (everywhere):**
- Every move card and the enemy's intent bubble show the **final number as one big marker digit**, already including type, fold, Fresh and Lift. Heals show the digit on a green heart.
- Badge moves show their badge with a digit: Lift shows a dumbbell with 2; Gulp shows the number it would swallow; Burp shows its final damage.
- When a card is **lifted** (previewed), the target's heart bar shows the exact hearts that will be lost: they turn hollow and jiggle. A heal shows ghost hearts filling in.
- Lifting Fold/Open or a teammate changes the intent digit, and **your** heart bar previews the hearts you will lose.
- Damage is never shown as stars or pips. The heart bar itself is the only count.

**Buttons (no cursor strip; the card cluster mirrors the controller):**
- **Cross, Circle and Triangle** are move slots 1, 2 and 3 of the current form. Each card shows its button symbol (✕ ○ △) in a corner.
- **Square** is Fold/Open, as in the field.
- **L1 / R1** switch to the previous / next teammate, as in the field.
- **First press lifts the card and previews it; pressing the same button again plays it.** Pressing a different button lifts that one instead, so nothing ever needs cancelling. A "Quick play" setting makes one press play at once, for when he's confident.
- **Bag:** hold L2 for 0.5 s; a ring fills, then the Bag opens. Pick with Cross/Circle/Triangle; Square closes it.
- **Run:** hold R2 for 1 s while a ring fills. Not shown in boss fights.
- Holding a trigger is the safeguard against accidental presses.
- **"What is this?":** Create shows big picture cards for the lifted move (or all three cards if none is lifted).

**One turn:**
1. The pointer snaps to the next card and the intent bubble pops up with its big digit.
2. He presses a button. The card lifts, and the heart preview shows on the target.
3. He presses it again. The attacker lunges. On impact:
   - an A2 hit flash (one white flash, at most 0.7 opacity, 120 ms);
   - the big digit pops;
   - the hearts tear off one by one;
   - a hit-stop of 40 ms (80 ms for 4 or more), and a shake of 3, 6 or 10 px for 1, 2 or 3+ hearts.
4. The enemy's card plays the same way.
5. Next round. About 2 to 3 s per round, plus however long he thinks.

The battle opens with a page-turn transition (0.6 s) and a battle sting.

**Slot rule:** no form of any character may have more than three moves. Checked for all current characters and the later roster (section 11.2).

| Character | Folded (✕ ○ △) | Open (✕ ○ △) |
|---|---|---|
| Monster | Claw, Snack | Chomp, Gulp, Burp |
| "Pink Fish" | Splash, Hug | Slap, Love |
| Ice Cream | Bonk, Lift | Drop, Smash |

---

## 5. Playable characters [Monster M1; Fish and Ice Cream M2 with their join moments]

Each one plays a different way. Folded is safe but weak; open is risky but has the big moves, plus Fresh. The numbers below are base values; the buttons show the final values.

### Fuzzy Monster: Chompy, 9 hearts. Role: eats your attack and burps it back. Starter.

| Form | Move | Icon | Effect |
|---|---|---|---|
| Folded | **Claw** | three-finger claw | 2 damage |
| Folded | **Snack** | pizza slice | heal self 2 |
| Open | **Chomp** | zigzag teeth | 3 damage |
| Open | **Gulp** | wide-open mouth | Needs an empty tummy. If this round's card is an attack, the Monster takes 0 from it and **stores the exact number the intent bubble was showing** (the final number against the open Monster). |
| Open | **Burp** | burp cloud | Needs a full tummy. **Base = the stored number** (no bonus), then the normal Fresh, type and fold rules. Empties the tummy. |

**What you see is what you get:** if the bubble says 6, the tummy badge says 6, and the Burp button shows its final damage (for example 6 − 1 = 5 against a Spooky enemy). The harder something hits the Monster, the harder it comes back, so Gulp is strongest exactly in its bad matchups. The tummy badge shows food from the drawing (1-2 = sausage, 3-4 = fish, 5 or more = pizza) next to the number.

### "Pink Fish" (placeholder name): Spooky (a placeholder that fits badly), 8 hearts. Role: healer and glass cannon.

It may not be a fish. Read by its handwriting, upright puts the two round lobes and eyes at the top: a heart-shaped face on stick legs whose body unfolds tall, with hearts and names written inside. Session 1 asks him (section 12). **The Bridge power works either way:** it unfolds long and tips over the water. Only the art and the name change.

| Form | Move | Icon | Effect |
|---|---|---|---|
| Folded | **Splash** | water drop | 1 damage |
| Folded | **Hug** | one heart | heal self 2 |
| Open | **Slap** | long fish tail | 3 damage |
| Open | **Love** | three hearts | heal every awake teammate 2, benched ones included |

### Ice Cream: Sweet, 10 hearts. Role: tank and charger.

| Form | Move | Icon | Effect |
|---|---|---|---|
| Folded | **Bonk** | cone tip | 1 damage |
| Folded | **Lift** | dumbbell | next damaging move +2 base. One at a time; dropped on bench. |
| Open | **Drop** | falling scoop | 3 damage |
| Open | **Smash** | four scoops toppling | 4 damage, then **folded again for free** |

**The real decision** for each: Monster opens to Gulp a telegraphed big hit. Fish opens to triple its damage and heal the team, but takes full hits. Ice Cream builds up with Lift while folded, opens for big hits, and times Smash so the free fold lands just before a big enemy hit.

---

## 6. Creatures [Bat M1; Spider and Ghost M2]

| Creature | Type | Hearts | Strip (repeats) | Teaches | Drop |
|---|---|---|---|---|---|
| **Zigzag Bat** (A) | Chompy | 5 | `Flap 1` → `Flap 1` → `Bite 3` (all open) | Reading the next move | Wrapped candy |
| **Toothy Spider** (B, C) | Sweet | 6 | `Curl` (folded, nothing) → `Poke 2` → `Web` (no damage, makes you **Sticky**) | Enemies can fold; status; Fresh timing | Lollipop |
| **Ghost** (D) | Spooky | 6 | `Spook 2` → `Float` (nothing) | The type circle | Candy corn |

Checked lines:
- **Monster vs Bat** (on-ramp): Claw x3 takes it 5 → 3 → 1 → 0 by round 3, so the `Bite` never lands. The Monster takes 0.
- **Fish vs Spider** (the spider is strong against the fish): R1 on `Curl`: Open. R2 on `Poke`: Slap with Fresh, 3+1−1 = 3, spider at 3. Takes Poke 2+1 = 3, fish at 5. R3 on `Web`: Slap 3−1 = 2, spider at 1. Fish is now Sticky. R4 on `Curl`: Slap 3−1−1 = 1, spider at 0. Wins with 5 of 8. If the fish stays folded and Splashes, it loses.
- **Ice Cream vs Ghost:** Bonk 1+1 = 2 (ghost at 4). On `Float`: Open. Drop with Fresh, 3+1+1 = 5. Wins with all 10 hearts.
- **Ice Cream vs Bat** (the bat is strong against Ice Cream): Bonk shows **0**, so he must Lift or Open. Lift → Open → Drop wins with 7.

---

## 7. Boss: Big Ghost in the ghost house [M3]

The boss room is stage **S7** (20 x 9, section 2), drawn with the A2 night treatment. Enter at E (0,4); the rest blanket is at (1,6). Big Ghost (2x2) is at (13-14, 3-4), with the Little Ghosts floating around it. Walk into Big Ghost to start the letterbox intro (section 10).

**Big Ghost: Spooky. No running.**

**Phase 1: Little Ghosts.** Three Little Ghosts float in front of Big Ghost. Each has 1 heart, is Spooky, and never acts or folds.
- While any are left, damaging moves hit the front one. Any final damage of 1 or more knocks it away, and **the extra damage is lost**.
- Strip: `Blow 1` → `Blow 1` → `Call` (if fewer than 3 are left, one comes back).
- The phase ends the moment the last one goes. Big Ghost skips its card that round, roars, and the music shifts up a gear.

**Phase 2: Big Ghost, 11 hearts.** Strip: `Curl` (folded, nothing) → `Swoop 2` → `Howl 5` → `Nap` (nothing).

**Why it's a puzzle, not a race to deal the most damage:**
- **Phase 1 punishes big hits.** A big hit knocks away only one Little Ghost, the same as a tiny one, and spending a turn to Open lets `Call` undo progress. The best play is three quick folded hits before `Call` comes up.
- **Phase 2 is about timing.** `Curl` is the turn to set up: Open there and you get Fresh with no risk. `Nap` is the free hit. `Howl 5` is the problem, and **each character has its own answer**:
  - Ice Cream: Smash on the Howl round, so it is folded and takes only 3.
  - Fish: Love before Howl lands.
  - Monster: Gulp the Howl (its bubble shows 6), then Burp it back for 6 − 1 = 5.
- Playing without thinking (staying folded and spamming the first move) **loses** with Fish or Monster as lead and wins with Ice Cream. That is the type lesson: bring the right friend.
- **Margins with the best solo plan** (solver): Ice Cream 9 of 10, Monster 5 of 9, Fish 4 of 8. The natural lines below finish with 6, 4 and 3. The Monster is the story's hero and the default lead: it is strong but not the obvious best pick. Switching and Candy Apples make it easier. **Expect 1 to 3 attempts.** After a loss, the boss-loss hint (section 4) points at Ice Cream.

### Worked examples (checked by script)

**Solo Ice Cream** (Sweet vs Spooky: deals +1, takes −1). Wins with 6 of 10 hearts.

| R | Card | Action | Arithmetic | IC | Boss |
|---|---|---|---|---|---|
| 1 | Blow 1 | Bonk | 1+1 = 2 knocks a Little Ghost away. Blow 1−1−1 = 0 | 10 | 2 LG |
| 2 | Blow 1 | Bonk | knocks one away. Blow 0 | 10 | 1 LG |
| 3 | Call | Bonk | last one gone. Phase 2 (card skipped) | 10 | 11 ♥ |
| 4 | Curl | Open | Fresh ready | 10 | 11 |
| 5 | Swoop 2 | Drop | 3+1 Fresh+1 = 5 → 6. Swoop 2−1 = 1 | 9 | 6 |
| 6 | Howl 5 | Smash | 4+1 = 5 → 1, then folds. Howl 5−1−1 = 3 | 6 | 1 |
| 7 | Nap | Bonk | 1+1 = 2 → 0. **Win** | 6 | 0 |

**Solo Fish** (no type modifiers). Wins with 3 of 8 hearts.

| R | Card | Action | Arithmetic | Fish | Boss |
|---|---|---|---|---|---|
| 1 | Blow 1 | Splash | 1 knocks a Little Ghost away. Blow 1−1 = 0 | 8 | 2 LG |
| 2 | Blow 1 | Splash | knocks one away. Blow 0 | 8 | 1 LG |
| 3 | Call | Splash | last one gone. Phase 2 | 8 | 11 |
| 4 | Curl | Open | Fresh ready | 8 | 11 |
| 5 | Swoop 2 | Slap | 3+1 = 4 → 7. Swoop 2 | 6 | 7 |
| 6 | Howl 5 | Love | +2 → 8. Howl 5 | 3 | 7 |
| 7 | Nap | Slap | 3 → 4 | 3 | 4 |
| 8 | Curl | Slap | 3−1 (Big Ghost folded) = 2 → 2 | 3 | 2 |
| 9 | Swoop 2 | Slap | 3 → 0. **Win** (before Swoop) | 3 | 0 |

**Solo Monster** (Chompy vs Spooky: deals −1, takes +1). Wins with 4 of 9 hearts. It opens on the free `Curl` round, so no hit is taken on purpose.

| R | Card | Action | Arithmetic | Mon | Boss |
|---|---|---|---|---|---|
| 1 | Blow 1 | Claw | 2−1 = 1 knocks a Little Ghost away. Blow 1+1−1 = 1 | 8 | 2 LG |
| 2 | Blow 1 | Claw | knocks one away. Blow 1 | 7 | 1 LG |
| 3 | Call | Claw | last one gone. Phase 2 | 7 | 11 |
| 4 | Curl | Open | Fresh ready | 7 | 11 |
| 5 | Swoop 2 | Chomp | 3+1 Fresh−1 = 3 → 8. Swoop 2+1 = 3 | 4 | 8 |
| 6 | Howl 5 | Gulp | bubble shows 5+1 = 6: eaten, tummy 6 | 4 | 8 |
| 7 | Nap | Burp | 6−1 = 5 → 3 | 4 | 3 |
| 8 | Curl | Chomp | 3−1−1 = 1 → 2 | 4 | 2 |
| 9 | Swoop 2 | Chomp | 3−1 = 2 → 0. **Win** | 4 | 0 |

**Team, Monster leads and switches** (the realistic fight). Wins with Ice Cream on 6, Monster on 7, Fish untouched on 8.

| R | Card | Action | Arithmetic | Active hearts | Boss |
|---|---|---|---|---|---|
| 1-3 | Blow, Blow, Call | Claw x3 | as in the Monster line | Mon 7 | 11 |
| 4 | Curl | Team → Ice Cream | arrives folded. Curl: nothing | IC 10 | 11 |
| 5 | Swoop 2 | Open | Fresh ready. Swoop 2−1 = 1 | IC 9 | 11 |
| 6 | Howl 5 | Smash | 4+1 Fresh+1 = 6 → 5, then folds. Howl 5−1−1 = 3 | IC 6 | 5 |
| 7 | Nap | Lift | +2 badge | IC 6 | 5 |
| 8 | Curl | Open | Fresh ready. Curl: nothing | IC 6 | 5 |
| 9 | Swoop 2 | Drop | 3+2 Lift+1 Fresh+1 = 7 → 0. **Win** | IC 6 | 0 |

**Reward:** a victory fanfare, Big Ghost's candy bag (+10 candy), Book pages for Big Ghost and the Little Ghosts, and the ending comic.

---

## 8. Progression and rewards [candy pickups and counter M2; treat stand, Bag, sticker machine, Book M4]

- **Candy is both collection and currency.**
  - 10 map candies (numbered slots on the Book's stage-strip page) and the Rainbow Lollipop (a gold slot).
  - Creature drops: bat → wrapped candy, spider → lollipop, ghost → candy corn. One per win, and creatures wake again after each rest.
  - Candy Dash: +5. Boss: +10.
- **Spending:**
  - Treat stand (at every rest blanket): Candy Apple for **2 candy**, carry up to 3.
  - Sticker machine (30,11): **3 candy** for the next sticker. The order is fixed and the next sticker is shown, so there is no gacha.
  - Resting is always free.
- **Collection Book** (Create button):
  - **Team:** a photo of his real drawing, the folded and open art, hearts, type, every move with its number, and the field power.
  - **Creatures:** a silhouette until met. After the first win: hearts, type, full strip, drop, and times beaten.
  - **Type wheel and matchup grid** (filled in as he sees each matchup).
  - **Candy slots.**
  - **Puzzle stamps.**
  - **Stickers**, including the Speed Star.
  - **Best boss win:** the most hearts he had left.
- No levels and no XP in the slice.

---

## 9. Controls [M1; R2 dash M2]

Gamepad API, standard mapping (DualShock 4 / DualSense over Bluetooth). Polling starts after the first button press.

| Button (index) | Field (stage view) | Battle |
|---|---|---|
| Left stick (axes 0, 1) | Analog move on the ground plane (x along, y in depth), deadzone 0.25 | (none) |
| D-pad (12-15) | Move (8-way) | (none) |
| Cross ✕ (0) | Use (auto-unfolds) / interact | Move slot 1: first press lifts, second plays |
| Circle ○ (1) | Close a menu or bubble | Move slot 2: lift, then play |
| Triangle △ (3) | Hint lightbulb | Move slot 3: lift, then play |
| Square □ (2) | Fold / Open the lead | Fold / Open: lift, then play |
| L1 / R1 (4, 5) | Previous / next lead | Switch to previous / next teammate: lift, then play |
| L2 (6) | (none) | **Hold 0.5 s:** open the Bag |
| R2 (7) | Hold to dash (5.5 tiles/s) | **Hold 1 s:** Run (not in boss fights) |
| Create (8) | Book | "What is this?" picture cards |
| Options (9) | Pause: Book, Do-over, Settings | Pause |

The same button does the same job in the field and in battle wherever it can: Square is always Fold/Open, and L1/R1 always change who is in front.

**Touch (landscape):**
- *Field:*
  - a floating joystick in the left half (push past 90% to dash);
  - on the right, a big **Use** button with **Fold** to its left;
  - team portraits at the top corners (tap to make lead);
  - lightbulb at the top centre, pause at the top left.
- *Battle:*
  - The cards sit in a diamond at the bottom right, matching the controller: ✕ bottom, ○ right, △ top, □ (Fold/Open) left.
  - Teammate portraits sit at the top left and top right, standing in for L1/R1.
  - Tap a card to lift and preview it; tap it again to play.
  - **Bag** and **Run** are small icons at the bottom left that need a 0.5 s long-press, with a filling ring.
  - Long-press a move card for its "What is this?" picture card.
- Touch targets are at least 64 px. The on-screen controls hide while a controller is connected. A controller disconnecting pauses the game.

**Save:** localStorage, saved on stage change, candy, puzzle solved, battle end, rest, and every 30 s. If the game was closed during a battle, that battle restarts at round 1 with the hearts the team had going in.

---

## 10. Look, staging, sound and feedback ("Paper Page", cinematic) [paper look and basic sounds M1; hero unfold M2; boss intro and comics M3; sketch-in, camera push-ins and full polish M4]

**World look**
- Everything is drawn in marker on white paper, matching his drawings. Characters are cut from scans of the real drawings, and the folded and open art comes from the folded and unfolded photos.
- **Layered paper depth:** the A2 layer stack (sky, far sheet 0.25 parallax, mid sheet 0.55, playfield 1.0, props and actors sorted by y, effects, foreground 1.4, light, ambient, UI); in short, 3 paper layers, each with a soft drop shadow beneath:
  - back: the paper texture, with faint ruled lines and grass hatching;
  - middle: ground and objects;
  - front: cut-out hedge tops and pumpkin leaves that overlap the characters a little.
  The layers have slight parallax as the camera moves (up to 10 px).
- **Warm light:** golden late-afternoon tint and a gentle vignette. Lantern pools glow inside the ghost house, and ghosts carry a soft glow of their own.
- **Scenery sketches itself in:** decorative scenery (grass tufts, leaves, distant fence lines) draws in as marker strokes, then colour fill, over 0.6 s the first time it comes on screen. It stays drawn after that, and the Book's map page fills in the same way. Gameplay objects (water, boulders, gates, candy, creatures, hazards) are always fully drawn before they come within 6 tiles of the lead, so sketch-in never hides anything that matters.
- **Camera (stage view; full rules in section 2 and the A2 notes):**
  - Within about 5 tiles of a creature or a power spot, the camera pushes in to 1.14x (stiffness 7/s), with its centre pulled halfway toward the spot, and eases back out on leaving. When the giant pumpkin fills the horizon in open ground, it pulls back to 0.86x (stiffness 5/s).
  - When a creature spots you, a quick snap to 1.2x for the "!".
  - Settings has a "Steady camera" option to turn this off.

**Hero moment: the unfold**
- Every Fold/Open is a paper hinge: the panel swings open in 3D on its crease, with a paper sound and a burst of marker sparkles.
  - In the field: 0.5 s.
  - In battle: 0.8 s, with a quick push-in on the character.
- The **first time** each character opens in the game, it gets a 2 s hero version: the camera pushes in, the scenery dims, a warm light bloom, a fanfare sting, and the character's name card is drawn in marker. Any button skips it.

**Battle and boss staging**
- Battle start: "!" → screen-wide page turn → sting.
- Hits: white flash on the target, a damage number in big marker digits, hearts tearing off one by one.
- Big hits (4 or more), plus Smash, Burp and Howl: 60 ms hit-stop, then a screen shake.
- Win: confetti cut from paper, and a fanfare.
- **Boss intro:**
  1. Letterbox bars slide in.
  2. The camera pushes in slowly on Big Ghost as it rises out of a lantern pool.
  3. The Little Ghosts spiral around it.
  4. A big title card writes itself in marker: "BIG GHOST".
  5. A drum hit, then the boss theme starts.
  6. The bars slide out as round 1 begins.
- **Phase 2:** Big Ghost roars, the screen shakes, the lanterns flare, and the music shifts to a faster, fuller version.

**Sound**
- **Paper fold and open** sounds come from real recordings of his drawings being folded.
- Each character has its own signature attack sound. Every boulder Eat, Push and gate opening sounds the same every time (same action, same sound).
- Short, bright sounds for candy pickup. A fanfare for new Book entries.
- Field music, battle music and boss music each have their own theme. The Candy Dash gets a fast, ticking version.
- A failed action gets a cartoon "boing" and the character wiggling.
- **Settings:** master, music and effects volume; Steady camera; Reduce flashes (turns hit flashes into an outline pulse). Optional: he records the character voices himself.

---

## 11. Later lands and the wider roster [after the slice]

### 11.1 The world, in order

The Pumpkin Patch is the hub. The lands open one after another, in this order:

1. **Water World.** The Patch's pond stream flows out the east side into Water World. Its gate opens once Big Ghost is beaten (the freed Little Ghosts lift it). Inside: a pond (the Fish's home), a beach and a reef.
   - **Joins:** the Sheriff Crab.
   - **Creatures:** toothy fish (from the Monster's tummy drawing), jellyfish, crab bandits.
   - **Signature puzzle: currents and nets.** Currents flow in fixed, visible directions. The Crab **Pinches** ropes and nets to set floating logs free; they drift with the current and plug gaps, so the Fish's 3-tile **Bridge** can reach.
   - **Fold power taught:** Fish **Bridge** (advanced).
2. **Amusement Park.** Reached by a boardwalk pier from the beach.
   - **Joins:** Frankenstein, rescued from the haunted house.
   - **Creatures:** the black zigzag bats (from his Frankenstein drawing) and haunted-house ghosts.
   - **Signature puzzle: powering the rides.** Unfolded Frankenstein stretches between two bolt-posts to complete a circuit. That powers rides that move on fixed, readable cycles: a Ferris wheel of platforms, a carousel turntable, a bumper-car track. The strongman bell is a high thing (Reach).
   - **Fold power taught:** Frankenstein **Stretch/Connect**.
3. **Candy Land.** Through the candy-floss stand's candy-cane gate at the back of the park. This is the home of his sweet characters and doodles. Ice Cream moved here from the park: its dumbbells come from the **Gumdrop Gym**, and its scoop family lives on **Ice Cream Mountain**. That leaves the park as Frankenstein's land and gives Candy Land its strongest hero.
   - **Joins:** Juice Box and the Marshmallow Block. Ice Cream comes home and gets a story moment here.
   - **Creatures:** lollipop walkers, wrapped-candy flutterers (the bow-tie wrapper shape works as wings, like the bats), and gummy blobs.
   - **Signature puzzle: build, melt and flood.** Ice Cream **Lifts** gumdrop blocks and **stacks** them into stairs and bridges. The Marshmallow Block's flame melts chocolate walls into puddles that harden into floor. Juice Box **drinks** juice rivers down or **squirts** them up, which changes which blocks float.
   - **Fold power taught:** Ice Cream **Lift and stack**: carrying a block and setting it down on another, the upgrade to Push.
   - **How collectible candy fits a land made of candy:** the land is the candy factory the Patch's candy came from. Scenery made of candy (gumdrop hills, candy-cane fences, chocolate walls) is **terrain, never a pickup**. Pickups always wear the same sparkle wrapper they have in the Patch, so the rule "a thing that looks the same behaves the same" still holds. In Candy Land, collected candy also becomes a **key**: gumdrop locks show a picture of a candy kind (wrapped candy, lollipop, candy corn...), and giving one from the jar opens the lock. Every Book candy slot fills a page of the factory's "recipe book", and a full page unlocks a candy shop item.
4. **Mushroom Forest.** Down the gumdrop hills at Candy Land's edge, where the gumdrops turn into mushrooms.
   - **Joins:** Flowerpot Monster and the Orange Owl.
   - **Creatures:** the little bud-faces from the flowerpot drawing, plus spiders.
   - **Signature puzzle: climbing.** Vine climbing onto mushroom caps, bouncy mushrooms that launch the team along fixed arcs, and a dark grove whose path only shows when the Owl is lead.
   - **Fold power taught:** Flowerpot **Vine**.
5. **Cave.** Down a hole under the biggest mushroom.
   - **Joins:** the Pumpkin (Big Ghost's old house, now on the team; its lit face is the cave's light source) and the Beaver.
   - **Creatures:** spiders and bats.
   - **Signature puzzle: seeing through walls.** The Pumpkin's ghost floats through rock walls to press plates on the far side. Dark rooms show only the tiles near the lit Pumpkin. The Beaver chews mine beams into log bridges.
   - **Fold power taught:** Pumpkin **Ghost**.
   - **Finale: the Monster's Belly.** The deepest tunnel ends in a huge mouth: a giant sleeping fuzzy monster. Its pizza, fish and sausage are the platforms. Every power returns, and puzzles combine three characters.

### 11.2 Roster: field powers and battle roles

| Character | Folds? | Proposed type | Field power | Battle role | Land |
|---|---|---|---|---|---|
| Pumpkin | yes | Spooky | Open: its ghost floats through walls to press plates and pull levers; its lit face lights dark rooms | **Summoner**: open, it puts up Little Ghost shields (the boss mechanic, now on his side) | Cave |
| Flowerpot Monster | yes | Sweet | Open: a vine grows, and the team climbs one ledge | **Grower**: each open turn adds a leaf that blocks 1 damage (up to 3) | Mushroom Forest |
| **Frankenstein** (new) | yes | Spooky | Open: head and body pull apart into a long section. **Stretch** across one pit tile, or **Connect** two bolt-posts to power machines | **Opener**: folded `Stomp 2`. Open `Zap 3`, and `Lick` (the huge tongue), which pulls a folded enemy open, so its fold no longer counts this round. The answer to `Curl` | Amusement Park |
| **Sheriff Crab** (new) | no (flat) | Chompy | **Pinch**: cuts ropes, nets and seaweed. Walks sideways through 1-tile gaps between rocks | **Counter**: `Guard`: if hit this round, snaps back 2. Its star badge, `Halt`, freezes the enemy's pointer for one round (once per battle) | Water World |
| Marshmallow Block (name open) | no (flat) | Sweet | Its flaming head melts chocolate walls into puddles that harden into floor, and burns cobwebs and brambles | **Burner**: `Burn` puts a flame badge showing 3 on the enemy; at the end of each enemy turn it deals 1 and the digit counts down | Candy Land |
| Beaver | no (flat) | Chompy | Chews logs and beams into bridges (a second way across water and pits) | **Chipper**: a small hit that lowers the enemy's next attack by 1 | Cave |
| Orange Owl | no (flat) | Spooky | When lead, hidden tiles and paths show up | **Seer**: shows 2 extra cards of a long boss strip | Mushroom Forest |
| Juice Box | no (flat) | Sweet | **Drink** lowers juice/water; **Squirt** raises it | **Medic**: `Sip` heals itself 3; `Squirt` pushes the enemy's pointer back one card | Candy Land |

**Rule for flat characters** (needed for consistency): flat characters have one form. They never fold, they always take full hits, they always have all their moves, and their field powers work without opening. Their Square card shows a flat-paper icon and does nothing.

**Three-button check (proposed move sets, never more than 3 per form):**

| Character | Folded or flat (✕ ○ △) | Open (✕ ○ △) |
|---|---|---|
| Pumpkin | Roll 2, Glow (heal 2) | Haunt 3, Shield (Little Ghost shield) |
| Flowerpot Monster | Root 2, Water (heal 2) | Whip 3, Leaf (block 1, up to 3) |
| Frankenstein | Stomp 2, Bolt (Lift-style +2) | Zap 3, Lick |
| Sheriff Crab (flat) | Pinch 2, Guard, Halt | none |
| Marshmallow Block (flat) | Toast 2, Burn | none |
| Beaver (flat) | Chip 1, Gnaw 3 | none |
| Orange Owl (flat) | Peck 2, Look | none |
| Juice Box (flat) | Spray 2, Sip, Squirt | none |

### 11.3 Frankenstein in the slice? (optional, does not change scope)

**Option A (recommended): rescued helper, seen in the ending only.**
- Frankenstein lies folded flat behind Big Ghost in the ghost house, tied up with candy-cane ribbon.
- When Big Ghost loses, the ribbon snaps. Frankenstein gets the full hero-unfold moment, reveals the huge red mouth, and waves.
- His Book page unlocks with a "Joins in the Amusement Park" stamp.
- Cost: one cutscene and one Book page. No new systems, and it builds anticipation for the next land.

**Option B: mid-boss.** Frankenstein guards the pumpkin door before Big Ghost. This adds a fight and about 5 minutes to the final sitting. Not recommended for the slice.

---

## 12. Questions to ask him, in three short sessions

**Session 1: before building, with the drawings in hand. BLOCKS M1.**
1. "What's this guy's name?" (Point to each drawing.) → **all names** in the game, the Book and the JSON. *Blocking.*
2. "What does this one do when it opens up?" (Ask for each folding drawing.) → **field powers** and the **big open moves**. *Blocking.*
3. "What's in the fuzzy guy's tummy? What does he eat?" → **Gulp/Burp**, the tummy food pictures, and what is edible. *Blocking.*
4. "Why did the big ghost take the candy? Is he mean, or sad, or hungry?" → **story motive, the comics**, and whether Big Ghost joins later. *Blocking.*
5. "The pink one with the hearts and names inside: what is it? Is it a fish, or something with a heart face and legs? Which way is up?" → the **"Pink Fish" art, orientation and name**. Its Bridge power works either way. *Blocking.*
6. "Let's record the noises. What does each one say when it opens up? When it gets hit?" → **voice and sound recordings**, plus recording the paper folds. *Blocking.*

**Session 2: once there's a screen test of his characters unfolding. Not blocking; placeholders stand.**
7. "If the ice cream fought a ghost, who'd win? What about the monster and the ice cream?" → the **type circle** direction.
8. "What kinds of powers are there? Sweet ones, spooky ones... what else? Which kind is each friend?" → the **type names** and each character's type.
9. "Which ice cream scoop is the strongest? Which one's sleepy?" → **Lift** and **Smash** animations.
10. "What's the candy for? Buying stuff, or collecting?" → **candy prices** and rewards.
11. "Who should be with you at the very start?" → the **starter** (default: Monster).
12. "Are the bats and spiders baddies, or just grumpy? And the little ghosts: good or naughty?" → creature personalities and the **Little Ghosts**.

**Session 3: after he has played the Pumpkin Patch. Not blocking.**
13. "Cave, water world, amusement park, mushroom forest, Candy Land: which one first? What lives in each one? Who lives in Candy Land?" → the **order of the lands** and their residents.
14. "The white block with fire on its head: what is it? A marshmallow? What does the fire do?" → the **Marshmallow Block's** name and powers.
15. "When Frankenstein opens and shows his big mouth, what does he do with it? Goodie or baddie?" → Frankenstein's **power and battle role**, and Option A vs B.
16. "Why does the crab have a hat with a star? Is he a sheriff?" → the **Sheriff Crab's** name and role.
17. "What's at the very end of the cave?" → the **Monster's Belly finale**.

---

## 13. Build order

Keep the first build small. Each milestone is playable on its own. Inline `[M1]`-`[M4]` tags throughout this doc mark where each feature belongs.

| Milestone | Contents | Done when |
|---|---|---|
| **M1: walk and fight** | Stage S1 only, in the side-on stage view (screen bands, x-scrolling camera, depth sort, left/right flip). Paper look; analog movement; teammates following; Fold toggle; one bat (patrol and contact); one complete battle with the Monster (strip, intent, big-digit cards with heart preview, face-button moves with lift-then-play, Fold/Open, damage, types, Fresh, Claw/Snack/Chomp/Gulp/Burp, win, lose to the rest blanket); controller and touch; autosave. | He can walk, bump the bat, win or lose, and retry. |
| **M2: puzzles and friends** | Stages S2 to S6 with their exits. Fish and Ice Cream join moments, with the first-time hero unfold. Field powers with one-press Use. Puzzle 1, Puzzle 2, the Rainbow Lollipop, do-over pumpkins. Spider (with Sticky) and ghost; sight cones, chase, sneak attack (Dizzy); dash; candy pickups and counter. | He can reach the pumpkin door with any lead. |
| **M3: boss and story** | Stage S7 ghost house (night treatment), Big Ghost (both phases), letterbox intro, boss-loss portrait hint, opening and ending comics, optional Frankenstein cameo. | The slice can be finished. |
| **M4: after his first playtest** | Candy Dash, rolling-pumpkin lane, treat stand, Bag and Candy Apples, sticker machine, the Book, lightbulb hints and solution stamps, sketch-in and camera push-in polish, hit-stop and shake polish. | Tuned from what he did in the playtest. |

---

## 14. Check against decisions

| Decision | Where it is met |
|---|---|
| Live free analog movement, team follows, visible creatures, no random encounters, fight or sneak | Now a side-on stage view (decided later; replaces top-down). Free 2D movement on a 9-deep ground plane; sight bands, chases and sneak attacks (section 2) |
| Turn-based battles on a separate screen | Section 4 |
| Any lead, swap anytime, each keeps its own powers | Free in the field; costs a turn in battle |
| No main-path puzzle needs one specific character; at least two solutions | P1: 3 single-character solutions. P2: 4 solutions, and for each character at least one solution does without it |
| Optional secret may need one character | Rainbow Lollipop (Monster) |
| Fold/Open in both modes, with the given field powers | Bridge, Push/Reach, Eat (the Pumpkin ghost and Flowerpot vine come in later lands) |
| Small numbers, no misses, no hidden randomness, enemy shows its next move | Hearts up to 11, hits 0 to 7, full strips visible; Gulp stores exactly the number shown |
| Folded = less damage, open = big move, form change costs a turn | In battle (section 4), plus the Fresh combo. In the field, Use unfolds and acts in one press, and the lead is left open |
| Enemy shows its next move, honestly | Web locks nothing during its own round; the lock lands at round end, for the next turn only |
| Type circle, child chooses | Placeholder; session 2, questions 7-8 |
| Picture + one short word per move | Section 5. Every card and intent shows one big final digit plus a live heart preview; moves sit on ✕ ○ △, Fold/Open on □, switching on L1/R1, and no form has more than 3 moves |
| Slice scope | 3 characters, 3 creatures, 2 puzzles, boss inside the pumpkin. Frankenstein only as an optional ending cameo. Built in milestones M1-M4 (section 13). |
| Platform, sittings, autosave | Sections 2 and 9 |
| Revised difficulty | Main puzzles have no timer; real-time action lives in exploration; small loss consequence; boss expects 1 to 3 attempts; easy zone A on-ramp |
| Paper Page cinematic look | Section 10 |
