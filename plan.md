# Plan

> EDITING DIRECTIVE: DEVELOPER AND AGENT EDIT THIS FILE COLLABORATIVELY. THE DEVELOPER MUST REVIEW AND APPROVE ITS CONTENT.

Purpose: Track the five-week map, the next build checkpoints, testing, and simplification reviews.

## Working agreement

Developer: Choose priorities, plan only the next few checkpoints in detail, test results directly, and keep the map current.

Agent: Read the project documents and inspect the project. Where practical, keep each checkpoint small enough to run and judge. Do not expand scope or mark the Developer's verification complete.

When you begin this step, start a fresh chat so its transcript stays clean. For example:

`Read the project documents, inspect the project, and help me complete the next checkpoint.`

## Five-week map

The current plan for each phase, starting from the map in your pitch. Update it as the project evolves.

**2026-11-09 — Approved platform change:** Use a browser-based build instead of Godot. Keep the existing gameplay, scope, and first milestone of one playable battle. The web stack remains to be selected with the Developer. The remaining phase goals in the pitch still apply; progress and schedule feasibility need review before revising dates.

## Checkpoints

The next few results to build, each with what it should produce and how you will test it against the acceptance checks in `spec.md`. Test each result before moving on, including related behavior that already worked, and commit meaningful working checkpoints.

The web stack was approved on 2026-11-09 (see `research.md`). The battle rules and architecture in `spec.md` were approved on 2026-11-16. The Developer chose a logic-first order: nothing is playable until checkpoint 5, but each rule is verified by automated tests before the next is built on it. Studio director pitch approval is still unconfirmed.

Status of all checkpoints: not started.

1. **Project setup.** Vite + TypeScript + Vitest scaffold, one passing test, deployed to GitHub Pages. Test: the public URL loads and the test command passes. This also tests the delivery risk from the pitch early.
2. **Board logic (no UI).** Swap, match of 3 or more, cascades, refill, free shuffle. Test: Vitest tests for the swap-reverts, cascade, and shuffle checks in `spec.md`.
3. **Turn rules.** Paint storage with the cap of 9, white damage, burn, countdowns, enemy attacks, win and lose. Test: Vitest tests for the countdown-once, turn-order, and win/lose/restart checks.
4. **Paint use.** Spending, mixing, the held mix and board lock, rainbow, and the paintball gun effect. Test: Vitest tests for the paint, mix, burn-refresh, and board-lock checks.
5. **Playable UI.** Board, storage bottles, held mix, enemies, swipe and drag, restart. Test: the Developer plays a full battle on desktop and phone, checking behavior against every acceptance check, including earlier ones.

Commit each working checkpoint. Schedule (2026-11-16): the Developer is behind the pitch's map, chose to leave the dates unchanged, and plans to put in more time to catch up.

## Testing and evidence

Record what you tested and what happened. For peer testing, note what people did or said separately from your interpretation, keep it non-identifying, and record the revisions you made and how you verified them.

- **2026-11-09:** Documentation records the approved platform change. No browser build or gameplay validation has been completed.

## Simplification reviews

A project this size invites Agents to pile on code. Redirect them away from bloat, stacked patches, obsolete features, and edge cases that a simpler design or code-structure rule would prevent. At the end of Phases 3, 4, and 5, have the Agent identify these problems, then decide yourself what to change. Record what it found, what you decided and why, and the result. Update the architecture in `spec.md` if the structure changes.
