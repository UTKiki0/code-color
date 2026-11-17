# Specification

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

Purpose: Keep a concise, testable description of what the project should do now and how the system is structured to do it.

## Working agreement

Developer: Approve the intended behavior and the system's structure, test directly, understand each part well enough to explain it in your own words, and update this file whenever either changes.

Agent: Read the project documents and inspect the project. Turn the Developer's decisions into acceptance checks without inventing product choices or freezing details that still need testing. Propose structures suited to the project's scope, with their trade-offs, in plain language. Keep the architecture consistent with the actual project and point out where they have drifted apart. Do not restructure the project without the Developer's approval.

When you begin this step, start a fresh chat so its transcript stays clean. For example:

`Read the project documents, inspect the project, and help me specify what the next version should do.`

## Intended experience

What Users should be able to do and experience in the current version, tied to the goals in your pitch.

**Platform decision approved by the Developer, 2026-11-09:** Build Code: Color as a browser-based game. Keep the painting-themed match-3 battle RPG, its playful cartoon direction, and its audience of RPG players who enjoy builds with approachable rules for casual players.

The retained scope includes repeatable runs targeting roughly 30 minutes, equipment rewards and a final boss, and three characters: one initially available and two unlocked through distinct goals. Equipment and stored paint reset between runs; character unlocks persist. Exact unlock conditions and scoring remain open.

## Behavior and acceptance checks

For each feature or behavior you are building, describe what it should do and what counts as working, including failure cases and accessibility where they apply. Distinguish approved behavior from provisional ideas, and leave untested details open until they are needed.

The first playable milestone remains one battle demonstrating bottle matching, cascades, paint storage, separate palette mixing, paint abilities, an equipment effect, and enemy countdowns. Retain these checks from the pitch; implementation and verification remain pending:

- A successful board move collects paint from its matches and cascades and advances enemy countdowns exactly once.
- Mixing and spending stored paint do not advance enemy countdowns.
- An enemy attacks when its countdown reaches zero.
- The player can win or lose the battle and restart.

### Battle rules (Developer-approved 2026-11-16; numbers are starting values to be tuned by playtesting)

**Board**
- 7×7 grid. The player swipes a bottle to swap it with an adjacent one. A match is 3 or more in a row, horizontal or vertical.
- Bottle types: red, yellow, blue, white, empty. Each paint color has a distinct shape as well as a color. Empty bottles can be swapped and matched, and give no reward.
- A swap that makes no match reverts and is not a move. Matched bottles clear, bottles above fall, and new bottles fill in (cascades repeat until no match remains).
- If no valid move exists, the board shuffles. A shuffle is free: it advances no countdowns and ticks no burn.
- Starting spawn weights: red, yellow, blue 18% each; white 28%; empty 18%.

**Turns**
- A turn is one successful move. Burn ticks once per turn; countdowns advance once per turn, including all cascades from that move. Mixing and spending paint are not turns.
- Order of resolution for each turn: (1) the swap, matches, and cascades resolve, collecting paint and dealing white damage; (2) burn ticks on enemies; (3) dead enemies are removed; (4) remaining countdowns advance by 1; (5) any enemy at 0 attacks the player, then resets its countdown; (6) win and lose are checked. Burn can therefore kill an enemy before it attacks.

**Matching and paint**
- Each white match picks one random living enemy and deals it 1 damage, plus 1 more for each white bottle beyond the third (3 whites = 1, 4 = 2, 5 = 3), plus any weapon bonus below (Developer decision, 2026-11-16, replacing the earlier per-bottle damage). A match is a group of touching cleared bottles of one type, so an L or T shape counts as one match. Each match in a cascade picks its own target.
- A battle ends at the end of turn resolution: if the last enemy dies mid-move, remaining steps run with no enemies left, so burn and attacks do nothing.
- Each red, yellow, or blue bottle cleared adds 1 paint of that color to its storage bottle, up to a maximum of 9. Storage bottles sit above the board.
- Only white bottles deal damage on a match.

**Board items** (Developer decision, 2026-11-17; the rules below were built and tested in checkpoint 10, step 3a, and the screen in step 3b)
- A match that is a group of touching bottles of one type leaves one item on the board. Priority: a run of 5 or more makes a color item, a T or L (a row of 3 or more and a column of 3 or more sharing a bottle) makes a bomb, and a run of 4 makes a line item. The match's other bottles clear as usual, and all of its bottles still count for paint and damage.
- Line item: clears its whole row (made by 4 across) or its whole column (made by 4 down). Bomb: clears the 5x5 area centered on it (less at an edge or corner). Color item: clears every bottle of the color it was made from (red, yellow, blue, or white), and itself.
- The item appears at the bottle the player dragged if it is in the match, else at the other swapped bottle, else at the first bottle of the match (for cascades). Matches of empties make no item. Cascade steps make items too (Agent's choice, so every step follows one rule; not yet reviewed).
- The player taps an item to use it. This is a turn (Developer decision): the cleared bottles give paint and white damage, then bottles fall and cascade, then burn, countdowns, and attacks resolve as for a swipe. It cannot be used while a mix is held. Tapping a bottle that is not an item does nothing.
- Cleared white bottles deal damage by the usual rule, once per group of touching whites: 1 damage plus 1 for each white beyond the third, plus the weapon bonus, to one random enemy (every enemy for the roller). Cleared paint bottles give paint.
- An item caught in another item's clear goes off too, so items can chain. Items never match, even three side by side. An item can be swiped like a bottle, and the swap must still make a match.
- A board with an item always has a move, so the free shuffle happens only with no matching swap and no item. A boss's ink blot never takes an item.
- Display: each item has its own shape and a text mark as well as color: a dark rounded square with an arrow (row or column line), a dark circle with a star burst (bomb), and a star in the paint's color marked ALL (color item). A new item pops in. Tapping an item replays like a move: the cleared bottles pop, then the board falls and cascades. The message line says "Made a Bomb item" and "Used the Row line". The cell's screen-reader label names the item and what it does.

**Spending paint on an enemy** (drag a storage bottle onto an enemy; costs 3 paint)
- Red: burn of 1 damage per turn for 3 turns.
- Yellow: 3 damage immediately (Developer change, 2026-11-16; it was 2).
- Blue: the enemy's countdown increases by 1.
- Burning again refreshes the duration; it does not stack.
- Spending is allowed while a mix is held (Developer decision, 2026-11-16). The brush changes only direct red and yellow spends for now; the Developer may widen it after playtesting.

**Mixing** (drag a full storage bottle onto another full storage bottle; consumes 9 of each ingredient)
- The mixed paint is held, shown over the storage bottles. The player then drags it onto an enemy to apply it, or onto the one remaining full paint bottle to make rainbow. Nothing is applied until the player drops it.
- Rainbow therefore takes two drags: first a mix of any two colors, then that mix onto the third full color. The player consumes 9 of each color in total.
- Only one mix can be held at a time, and a mix cannot be cancelled. While a mix is held, the board is locked: the player must use the mix before swiping again, so a held mix never carries into a move.
- Green (blue + yellow): heals the player 5 HP, up to the 20 maximum. It is dropped on the player panel (which is outlined while a green mix is held) and does nothing to enemies. At full HP the drop does nothing: the mix is used up (and the message says so), which unlocks the board. Green can still be made at full HP, for example to put it into a rainbow by dropping it on a full red bottle (Developer decision, 2026-11-17; it replaced a rule that refused the drop at full HP and soft-locked the game, and then a rule that refused making green at full HP). Every mix that can be made can be used. It no longer resets a countdown. (Developer decision, 2026-11-17.)
- Purple (red + blue): countdown +2, then burn of 3 damage per turn for 3 turns (was 2). (Developer decision, 2026-11-17.)
- Orange (red + yellow): a spread attack that deals 5 damage to every living enemy, or 15 to a boss; dropped on any enemy. It replaces the burn. (Developer decision, 2026-11-17.)
- Rainbow (a held mix dropped onto the remaining full third color): 10 damage to every living enemy (20 to a boss), countdown +3, and burn of 2 damage per turn for 3 turns on every enemy that survives. It replaces the random mix effect. (Developer decision, 2026-11-17.)
- A boss is the single enemy of a boss fight. Mix and rainbow damage is paint damage: it is not halved by a shield, and it breaks the shield. Enemies the damage kills get no slow or burn.

**Weapons** (Developer-approved 2026-11-16; effects are starting values)
- **Paintball gun:** white matches deal +1 damage (so 3 whites = 2, 4 = 3). The Developer chose the effect on 2026-11-16 but not the amount; +1 per match is a provisional starting value. The first character starts with it.
- **Brush:** strengthens direct spends: red burn lasts 5 turns instead of 3, and yellow deals 1 extra damage (4 instead of 3). Mixes are unaffected. Exact scope is provisional (the yellow bonus was added by the Developer on 2026-11-16).
- **Roller:** white matches hit every living enemy instead of one random enemy, for the base white damage with no bonus (a 4-match deals 2 to each enemy). The Developer lowered it from per-bottle damage on 2026-11-16 because it felt too strong.
- The other two characters start with the brush and the roller. Which weapon goes with which character is deferred to Phase 4.
- A run has three boss fights; beating the final one wins the run. After beating a boss fight, the player chooses a new weapon, which replaces the current one (one weapon at a time). Weapons reset between runs.

**Battle**
- First battle: the player has 20 HP and faces 3 enemies with 10 HP each and countdowns of 4, 5, and 6 turns.
- When an enemy's countdown reaches 0, it deals 3 damage to the player, and its countdown resets.
- The player wins when all enemies are dead and loses when HP reaches 0. Either result offers a restart.

**Supported platforms** (Developer-approved 2026-11-16)
- Desktop: the latest two versions of Chrome, Firefox, Safari, and Edge. Mobile: Safari on iOS and Chrome on Android.
- Layout works from a portrait phone width of about 360px up to a desktop window; the board scales to fit. Mouse and touch both work through Pointer Events.
- The Developer tests on their own desktop browser and phone. Other combinations are untested.

**Accessibility** (Developer accepted the Agent's proposal on 2026-11-16, with item 6 deferred)
- Color is never the only signal: each paint has a distinct shape, and storage bottles and held mixes also show a text label or icon, such as "R 6/9".
- Enemy countdowns, burn and slow status, player HP, and paint counts appear as numbers or icons, not only color or bars.
- Text and key UI meet WCAG AA contrast (4.5:1 for normal text).
- Draggable bottles and enemies are at least 44×44 CSS px.
- With the browser's reduced-motion setting on, animations are shortened or removed, and nothing flashes.
- Deferred to Phase 5: keyboard operation (arrow-key selection, Enter to swap, spend, and mix). Input handling stays separate from game logic so this can be added later.

**Runs and bosses** (Phase 3; decisions are the Developer's from 2026-11-16 unless marked as proposed; nothing is implemented yet)
- A run has three stages. Each stage is two regular battles followed by a boss, nine encounters in all (Developer decision, 2026-11-17, to see whether the longer stretch between bosses improves the difficulty; a stage used to be one battle and a boss). There is no healing between the two battles; the +10 heal comes only after a boss. Beating the final boss wins the run. Player HP reaching 0 loses it, and the player can start a new run.
- HP and stored paint carry over between battles within a run (Developer decision, 2026-11-16; stored paint carrying over may change after balancing). A mix still held when a battle ends does not carry over; it is discarded (Developer decision, 2026-11-16). The player heals +10 HP after each boss, capped at max HP (20), and does not heal after regular battles.
- After beating a boss (the first two; the third ends the run), the player chooses between two random weapons, drawn from all weapons, so one may be the weapon already held. The offer that matches the held weapon is labeled "Keep" (for example "Keep: Brush"). Choosing a different weapon replaces the current one. The choice cannot be skipped, and it appears on the "Boss defeated!" screen with each weapon's one-line effect; choosing moves straight on to the next battle (with the +10 heal). The player panel shows the equipped weapon. Developer decision, 2026-11-16.
- Each boss is one enemy with a special ability. The four abilities are paint thief, ink blot, shield, and heal. Each run gives the three bosses three different abilities, chosen at random (one of the four is left out). Each boss has its own art, tied to its ability. The ability and its countdown are shown on the boss card from the start of the fight, and the card pulses when the ability is one turn away (Developer decision, 2026-11-16).
- Ability details (proposed starting values, to tune by playtesting; each runs on its own countdown, which starts at its full value when the boss fight starts (Developer decision), and acts after enemy attacks in the turn order):
  - Paint thief: every 3 turns, removes 3 paint from the player's fullest bottle (or whatever is left if it holds less). A tie for fullest is broken at random (Developer decision, 2026-11-16). With no paint stored, nothing happens. The theft shows as a red number over the player panel. Built in checkpoint 9.
  - Ink blot: every 3 turns, turns 4 random non-empty board bottles into empties (empties give no paint and no damage). The pick is retried so the board is left with no match and a valid move; if no pick works the board shuffles for free (Agent's rule, not yet reviewed). The blotted cells flash dark and the message says "Boss blotted 4 bottles". Built in checkpoint 9.
  - Shield: the boss starts shielded, and while shielded white damage to it is halved (rounded down, at least 1). Any paint spend, used mix, or rainbow that hits the boss breaks the shield for 3 of the player's turns (moves), then it returns; the paint's own damage is not halved. Burn and white matches do not break it. Paint that hits a shield already down does not extend it (Agent's choice, not yet reviewed). It has no separate ability timer (Developer decision, 2026-11-16). The card shows "Shield: up" with a blue outline, or "Shield broken: back in N" (pulsing at 1). Built in checkpoint 9.
  - Heal: every 3 turns, the boss heals 4 HP, up to its max HP. Built in checkpoint 9; the heal appears as a green number on the boss card.
- Starting encounters (Developer accepted the Agent's numbers on 2026-11-16, to be tuned by playtesting; enemy countdowns shorten in later stages by the Developer's request, and the specific later-stage countdowns are the Agent's proposal):
  - Stage 1: a first battle of 3 enemies with 10 HP and countdowns 4, 5, 6; a second battle of the same enemies with 12 HP; then a boss with 30 HP that hits for 4.
  - Stage 2: 3 enemies with 12 HP and countdowns 4, 4, 5, then the same with 14 HP; then a boss with 40 HP that hits for 5.
  - Stage 3: 3 enemies with 14 HP and countdowns 3, 4, 5, then the same with 16 HP; then a boss with 50 HP that hits for 6.
  - The second battle of a stage is a bit tougher than the first (+2 HP each; Developer's choice, 2026-11-17).
  - Every boss has a countdown of 5 turns and attacks when it reaches 0, like other enemies, using its own damage.
- Run screens (checkpoint 7, Agent proposal that the Developer did not object to): a progress strip shows the stage and whether it is a battle or a boss (one marker per encounter, so nine; the label reads "Stage 1/3: Battle 2/2"; done steps filled, the current step bold and underlined, bosses marked with a star). A boss fight shows one large card labeled Boss. After a won battle, a "Battle cleared!" or "Boss defeated!" screen shows HP, the paint kept, whether the player heals, and what comes next, with a Continue button; if a mix was still held it says the mix will be lost. Winning the final boss shows "Run won!" and losing shows "Run lost", each with a New run button.
- Out of scope for Phase 3: character unlocks, saving, and extra encounter variety (Phase 4).
- Open: how boss art is made (placeholder CSS shapes for now), the exact ability numbers, and whether any ability needs an on-screen warning before it triggers.

**Test settings** (for the Developer's testing, not player features), added to the address: `?seed=N` for a repeatable game; `?fullPaint` to start with full paint bottles so mixing and rainbow can be tried quickly; `?battle` for a single regular battle instead of a run (`?battle=2` for stage 2's first battle, and `?battle=2&round=2` for its second); `?boss` for a single boss battle (`?boss=3` for stage 3's boss); `?ability=heal` (with `?boss`) to give the test boss a chosen ability (`paintThief`, `inkBlot`, `shield`, `heal`; without it one is drawn); `?testing` to show the weapon dropdown during a run. The single-battle and single-boss modes show the weapon dropdown and a Restart button; the run shows a New run button and no dropdown.

**Acceptance checks (all pending implementation and verification)**
- A swap that creates no match reverts and changes no countdown, burn, or paint.
- A move with a cascade collects the correct paint and white damage, and advances countdowns and burn exactly once.
- Paint never exceeds 9. Spending requires 3 paint; mixing requires every ingredient bottle full.
- Spending and mixing leave countdowns and burn unchanged.
- Each paint effect and mix matches the rules above, and burn refresh does not stack.
- A shuffle changes no battle state.
- A white match deals 1 damage plus 1 for each white beyond the third, plus 1 with the paintball gun; the roller deals it to every living enemy and the other weapons to one random enemy.
- While a mix is held, board swipes are rejected. Using the mix unlocks the board.
- A turn resolves in the order given above. An enemy killed by burn does not attack.
- An enemy attacks at countdown 0, and the player can win, lose, and restart.

**Still open**
- Balance: white is now weak (a 3-match deals 2 with the gun and 1 with the others, against 10-HP enemies), so yellow spends (3 damage for 3 paint, 4 with the brush), burns, and rainbow carry most damage. Enemy HP and other numbers may need retuning after playtesting.
- How the three boss fights fit between ordinary battles in a run (run structure is outside the single-battle milestone).

## Architecture

How the system works and the structural decisions that keep it coherent, consistent, and easy to change. Adapt these sections to your project and tech stack.

### Overview

The main parts of the system, what each is responsible for, and how they connect. Include a simple diagram.

Status: Developer approved this structure on 2026-11-16. Nothing is implemented yet.

```
 Pointer events ──> ui/ (DOM + CSS) ──commands──> game/ (pure TypeScript)
                      ^                              |
                      └──── state + events ──────────┘
                                                     
 save/ (localStorage) <── unlocks only ── ui/ (outside the battle)
 tests/ (Vitest) ──────── commands ──────> game/ (no DOM needed)
```

- **`game/`:** all rules: board, matching and cascades, paint storage, mixing, effects, enemies, turn resolution, and weapons. It has no DOM access and uses a seedable random number generator so tests can force outcomes.
- **`ui/`:** renders the current state and turns Pointer Events into commands. It decides nothing about the rules.
- **`save/`:** stores character unlocks in `localStorage`. It is not needed for the first battle.
- **`tests/`:** Vitest tests, one per acceptance check, run against `game/` alone.

### Data and state

What information the system keeps, where each piece lives, and how it moves and changes. Name the single source of truth for each important piece of state.

- **Battle state** lives only in `game/`: board grid, paint storage (3 counts, each 0 to 9), the held mix (none or one), player HP, the equipped weapon, and each enemy's HP, countdown, burn, and status. The UI reads it and never changes it.
- **Rule values** (damage, durations, costs, spawn weights, enemy stats) live in one data file in `game/`, so balancing means editing numbers, not logic.
- **Unlocked characters** live only in `save/` (`localStorage`). Equipment and paint are never saved, so they reset between runs.
- **Transient UI state** (drag in progress, animation timing) lives in `ui/` and never reaches the game.

### Interaction loop

How User input or other events lead to changes in state and then to what the User sees, hears, or receives.

1. The player acts: swipes a bottle, or drags a storage bottle or held mix. `ui/` converts this to a command: `swap`, `spend`, `mix`, `useMix`, or `restart`.
2. `game/` validates the command against the rules (for example, rejecting swipes while a mix is held, or a mix with a non-full bottle). A rejected command changes nothing.
3. For an accepted command, `game/` returns the new state and an ordered list of events, such as `bottlesCleared`, `paintGained`, `burnTicked`, `enemyDied`, `enemyAttacked`, and `shuffled`.
4. `ui/` replays the events as animation and then shows the final state. If the two ever disagree, the state wins.
5. Turn commands resolve in the order set out in "Turns".

### Visual and content rules

The shared rules that establish the art style and keep the presentation consistent, such as branding, layout, color, type, motion, sound, and asset conventions.

Direction from the pitch: playful, slightly chaotic, cartoony. Specific typography, palette, logo, and sound are not yet decided.

- Layout is one column, scaled to the viewport: enemies on top, then the storage bottles and held mix, then the board. One CSS layout model (grid or flexbox) is used throughout, with sizes relative to the board cell.
- Colors and sizes are CSS variables defined in one place. Each paint's shape and label are defined with its color.
- Animation is driven by game events and respects the reduced-motion setting.
- Cascades play one step at a time (Developer request, 2026-11-16): matched bottles shrink, the bottles above fall by the number of gaps beneath them, and new bottles fall in from above the board edge, then the next step starts. Longer falls take longer, and landings have a small bounce. The board is not interactive while a move plays. The first three steps play at normal speed and every step after that is faster than the one before (Developer request, 2026-11-16), down to a minimum speed; the three tuning numbers are at the top of `src/ui/pace.ts`.
- Numbers and combo text (Developer request, 2026-11-16): while each cascade step's bottles pop, the UI shows "+N" with the paint's color over the matched bottles of that paint ("Full!" when the bottle is already at 9), "-N" over each white match, "-N" at the top of the enemy that was hit, and "Combo xN!" from the second step on. Enemy HP bars and paint meters update at the same moment. Burn ticks follow the last step as their own beat, and enemy attacks show with the final state. Floating text is decoration: the message line gives the same information in words. The game reports the board after each step so the UI shows what the rules did rather than computing its own result.
- Accessibility rules above apply to every screen.

### Structure rules

The conventions that keep the system lean: how files and code are organized, where new features belong, and the general rules that handle cases by design instead of one-off fixes.

- A rule goes in `game/`; how something looks or is input goes in `ui/`. If a feature needs both, the rule is written first and tested alone.
- `game/` never imports from `ui/` or touches the DOM.
- Paint effects, mixes, and weapons are defined as data (a table of entries) with one shared way of applying them, so a new effect or weapon is a new entry, not a new special case.
- Every acceptance check has a Vitest test before the feature is called done.
- Keep dependencies to TypeScript, Vite, and Vitest unless the Developer approves another.

### Decisions and changes

Consequential structural decisions, the alternatives considered, and why you chose as you did, including later changes to the structure.

- **2026-11-09:** The Developer approved switching from Godot to a browser-based build while retaining gameplay and scope. See `research.md` for the platform change record.
- **2026-11-16 — Architecture approved:** The `game/` (pure rules), `ui/` (DOM), `save/`, and `tests/` split described above, with commands in and state plus events out. Trade-off accepted: the UI makes no decisions, so desktop and touch behave identically, but animation must be driven from returned events.
- **2026-11-09 — Stack approved:** TypeScript + Vite + Vitest; DOM + CSS rendering; Pointer Events for mouse and touch; `localStorage` for character unlocks; GitHub Pages hosting. Alternatives considered: Canvas (more control over effects, but UI, layout, and accessibility must be hand-built), Phaser, and React/Svelte (extra libraries). Intended structural direction, pending architecture approval: game rules live in a pure TypeScript module with no DOM access, separate from the rendering layer, so acceptance checks run as automated tests. Supported browsers and the detailed architecture sections above remain undefined.
