import type { BattleEvent, BattleState, TurnResult } from '../game/battle';
import type { Board, Cell } from '../game/board';
import type { PaintColor } from '../game/rules';
import { computeFalls } from './falls';
import { floatOverCells, floatOverEnemy } from './fx';
import { stepSpeed } from './pace';
import { renderBattle, type ViewOptions } from './view';

// Replays one move step by step: for each cascade step the matched bottles pop,
// the numbers and combo text appear over them while the bars update, and then the
// board falls into place. The caller draws the authoritative final state afterwards.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const POP_MS = 220; // how long matched bottles shrink before the board falls (at normal speed)
const FALL_BASE_MS = 200; // wait after a fall starts; longer falls wait a little more (at normal speed)
const FALL_PER_ROW_MS = 70;
const BURN_BEAT_MS = 450;
const COMBO_RAISE_PX = -40; // combo text sits above the numbers

const PAINT_CSS: Record<PaintColor, string> = { red: 'var(--red)', yellow: 'var(--yellow)', blue: 'var(--blue)' };

type ClearEvent = Extract<BattleEvent, { type: 'bottlesCleared' }>;
interface Step {
  clear: ClearEvent;
  derived: BattleEvent[]; // paint gained and grey damage caused by this step's matches
}

/** Groups the move's events by cascade step. Burn, deaths, and attacks come after the last step. */
function groupSteps(events: BattleEvent[]): Step[] {
  const steps: Step[] = [];
  for (const event of events) {
    if (event.type === 'bottlesCleared') steps.push({ clear: event, derived: [] });
    else if (steps.length > 0 && (event.type === 'paintGained' || (event.type === 'enemyDamaged' && event.source === 'grey'))) {
      steps[steps.length - 1]!.derived.push(event);
    }
  }
  return steps;
}

function swapped(board: Board, a: Cell, b: Cell): Board {
  const next = board.map((r) => [...r]);
  next[a.row]![a.col] = board[b.row]![b.col]!;
  next[b.row]![b.col] = board[a.row]![a.col]!;
  return next;
}

/** Applies paint and damage from events to the state being shown, so the bars move step by step. */
function applyToView(view: BattleState, events: BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'paintGained') view.paint[e.color] += e.amount;
    else if (e.type === 'enemyDamaged') {
      const enemy = view.enemies.find((x) => x.id === e.enemyId);
      if (enemy) enemy.hp -= e.amount;
    }
  }
}

/** Shows the numbers and combo text for one step over the bottles that caused them. */
function showStepFx(step: Step): void {
  if (step.clear.step > 1) {
    floatOverCells(step.clear.cells, `Combo x${step.clear.step}!`, 'combo', undefined, COMBO_RAISE_PX);
  }
  const shownMatches = new Set<string>(); // the roller reports one hit per enemy for the same match
  for (const e of step.derived) {
    if (e.type === 'paintGained') {
      const cells = step.clear.cells.filter((c) => c.bottle === e.color);
      floatOverCells(cells, e.amount > 0 ? `+${e.amount}` : 'Full!', 'paint', PAINT_CSS[e.color]);
    } else if (e.type === 'enemyDamaged') {
      const key = (e.cells ?? []).map((c) => `${c.row},${c.col}`).join(';');
      if (e.cells && !shownMatches.has(key)) {
        shownMatches.add(key);
        floatOverCells(e.cells, `-${e.amount}`, 'damage');
      }
      floatOverEnemy(e.enemyId, `-${e.amount}`, 'damage'); // the target is random, so also mark who was hit
    }
  }
}

/** Replays a swipe: the swapped board first, then each cascade step. */
export function playMove(
  root: HTMLElement, before: BattleState, a: Cell, b: Cell, result: TurnResult, message: string,
  base: Partial<ViewOptions> = {}, // run display options, repeated on every frame so they do not flicker
): Promise<void> {
  return replaySteps(root, before, swapped(before.board, a, b), result, message, base);
}

/** Replays a tapped item: the board as it is, then the item's clear and each cascade step. */
export function playItem(
  root: HTMLElement, before: BattleState, result: TurnResult, message: string, base: Partial<ViewOptions> = {},
): Promise<void> {
  return replaySteps(root, before, before.board, result, message, base);
}

async function replaySteps(
  root: HTMLElement, before: BattleState, start: Board, result: TurnResult, message: string,
  base: Partial<ViewOptions>,
): Promise<void> {
  // A copy of the state that is updated as steps play; the real state is applied by the caller.
  const view: BattleState = { ...before, paint: { ...before.paint }, enemies: before.enemies.map((e) => ({ ...e })) };
  let board = start;

  for (const step of groupSteps(result.events)) {
    const stepMessage = step.clear.step > 1 ? `Combo x${step.clear.step}!` : message;
    const speed = stepSpeed(step.clear.step); // later steps play faster
    // An item the match leaves stays on the board (and falls with it); only the rest pops away.
    const vacated = step.clear.cells.filter((c) => !step.clear.created.some((i) => i.row === c.row && i.col === c.col));
    const shown = board.map((r) => [...r]);
    for (const i of step.clear.created) shown[i.row]![i.col] = i.item;
    applyToView(view, step.derived);
    renderBattle(root, { ...view, board: shown }, { ...base, message: stepMessage, popCells: vacated, madeCells: step.clear.created, speed });
    showStepFx(step);
    await sleep(POP_MS * speed);

    const falls = computeFalls(vacated);
    board = step.clear.boardAfter;
    renderBattle(root, { ...view, board }, { ...base, message: stepMessage, falls, speed });
    await sleep((FALL_BASE_MS + Math.max(0, ...falls.values()) * FALL_PER_ROW_MS) * speed);
  }

  // Burn ticks happen after all the matches, so they get their own beat.
  const burns = result.events.filter((e) => e.type === 'enemyDamaged' && e.source === 'burn');
  if (burns.length > 0) {
    applyToView(view, burns);
    renderBattle(root, { ...view, board }, { ...base, message });
    for (const e of burns) if (e.type === 'enemyDamaged') floatOverEnemy(e.enemyId, `-${e.amount} burn`, 'damage');
    await sleep(BURN_BEAT_MS);
  }
}
