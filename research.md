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

## Sources and credits

List every external source, code library, asset, and dataset you use, with its link, license or usage terms, and required credit.

Development tooling (installed 2026-11-16; licenses are from the Agent's general knowledge and should be checked against each package's `LICENSE`):
- TypeScript 7.0.2, https://www.typescriptlang.org, Apache-2.0. No credit needed in the game.
- Vite 8.3.8, https://vite.dev, MIT.
- Vitest 5.1.0, https://vitest.dev, MIT.
- Node 26.13.1 (installed with Homebrew), https://nodejs.org. Used for development only.
