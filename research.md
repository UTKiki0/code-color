# Research

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

Purpose: Keep the evidence, decisions, and current scope that guide the build.

## Working agreement

Developer: Direct the inquiry toward what the next decision needs, judge sources and options, make the consequential decisions, and keep this file current.

Agent: Read the project documents and inspect the project. Help investigate, compare options, and test assumptions quickly. Verify sources directly.

When you begin this step, start a fresh chat so its transcript stays clean. For example:

`Read the project documents and help me research what I need for the next build decision.`

## Inquiry and decisions

Record what informs your build decisions: the questions you investigated, useful sources and what they support, experiments and their results, and the decisions you made with your reasons. Distinguish evidence from assumptions; an Agent's recommendation alone is not evidence.

- **2026-11-09 — Platform decision:** The Developer chose a browser-based build in place of Godot and explicitly retained the current gameplay and scope. The web stack, hosting, supported browsers, and save mechanism remain undecided. This records the Developer's preference; no technical comparison has been conducted.

- **2026-11-09 — Web stack decision:** The Developer approved: TypeScript, Vite, Vitest, DOM + CSS rendering (no Canvas, no game framework), Pointer Events for mouse and touch, `localStorage` for character unlocks, and GitHub Pages hosting from the Developer's existing repo. Inputs: the Developer has some JavaScript experience, wants minimal dependencies, and wants desktop and touch support at launch. Reasons: TypeScript guards state logic; DOM + CSS gives responsive layout, simple UI, and accessibility hooks with less code than Canvas; a pure logic module makes the countdown checks automatically testable. Assumptions, not yet tested: DOM performance is sufficient for the board and animations; `localStorage` is acceptable if players clear it. Supported browsers were approved on 2026-11-16; see `spec.md`. A small Canvas layer for paint effects may be revisited if DOM proves limiting. The Agent's recommendation is not evidence; the first battle prototype will test these assumptions.

## Scope

### Stretch goals

Keep the current stretch goals in priority order, starting from your approved pitch, noting cuts and additions.

### Scope changes

Record consequential changes to the approved scope: what changed, why, and what was added or cut. Update `spec.md` when a change alters the intended behavior.

- **2026-11-09:** Replace the Godot build direction with a browser-based game. Retain matching, cascades, paint storage, separate palette mixing, paint abilities, enemy countdowns, equipment, repeatable runs targeting roughly 30 minutes, and three characters. Equipment and paint reset between runs; character unlocks persist. The first milestone remains one playable battle. No gameplay features were added or cut. This decision supersedes the Godot direction in `pitch.md`; the pitch is preserved as the original proposal. Studio director approval status has not been confirmed in this session.

- **2026-11-16:** Phase 3 adds boss special abilities, which the pitch did not include (the pitch named only a final boss). A run now has three stages of a regular battle and a boss, with three bosses. Each boss has a special ability drawn at random without repeats from four: paint thief, ink blot, shield, and heal, each with its own art. HP and paint carry over within a run, and the player chooses between two random weapons after each of the first two bosses. This increases scope and schedule risk, since it needs new rules, events, UI, and art. Abilities are built last in the checkpoint order so a plain run is playable first. See `spec.md` for the rules and open items.

- **2026-11-17:** Four consequential scope changes in checkpoint 10, all at the Developer's direction, none in the pitch. (1) The mixes were reworked because they did not feel rewarding for their cost: green heals the player 5 HP, orange deals 5 to all enemies (15 to a boss), purple's burn is 3 x 3, and rainbow deals 10 to all (20 to a boss) with slow 3 and burn 2 x 3. (2) Board items were added: a match of 4 leaves a row or column line item, a T or L leaves a 5 x 5 bomb, and a run of 5 leaves a clear-one-color item; tapping one is a turn. (3) Each stage now has two regular battles before its boss (nine encounters per run instead of six), the second a bit tougher. (4) The heal after each boss rose from 10 to 15 HP. These add rules, UI, and tests and lengthen a run, which adds schedule risk; the schedule dates are unchanged and the Developer is making up the time. A balance simulator kept outside the repo (greedy bot over seeded runs) was used to compare changes; it is not evidence of how the game feels. See `spec.md` and `plan.md`.

## Sources and credits

List every external source, code library, asset, and dataset you use, with its link, license or usage terms, and required credit.

Development tooling (installed 2026-11-16; licenses are from the Agent's general knowledge and should be checked against each package's `LICENSE`):
- TypeScript 7.0.2, https://www.typescriptlang.org, Apache-2.0. No credit needed in the game.
- Vite 8.3.8, https://vite.dev, MIT.
- Vitest 5.1.0, https://vitest.dev, MIT.
- Node 26.13.1 (installed with Homebrew), https://nodejs.org. Used for development only.
- Art: `art/Paint bottle.png`, a 128 by 128 pixel sprite sheet of the paint bottles, mixes, and items, supplied by the Developer on 2026-11-17 (used in the game from that date). Origin and licence: the Developer's own work, to be confirmed by the Developer.

