import { BOARD_SIZE, MIN_MATCH, SPAWN_WEIGHTS, type Bottle } from './rules';
import type { Rng } from './rng';

// board[row][col]; row 0 is the top. Boards are never mutated: every
// function returns a new board.
export type Board = Bottle[][];
export interface Cell {
  row: number;
  col: number;
}

// Events tell the UI (and later the turn rules) what happened, in order.
export type BoardEvent =
  | { type: 'bottlesCleared'; step: number; cells: (Cell & { bottle: Bottle })[] }
  | { type: 'shuffled' };

export interface SwapResult {
  ok: boolean; // false: the swap was rejected and `board` is unchanged
  board: Board;
  events: BoardEvent[];
}

const BOTTLES = Object.keys(SPAWN_WEIGHTS) as Bottle[];
const MAX_ATTEMPTS = 1000;

/** Picks a bottle type using the spawn weights. */
export function pickBottle(rng: Rng): Bottle {
  const total = BOTTLES.reduce((sum, b) => sum + SPAWN_WEIGHTS[b], 0);
  let roll = rng() * total;
  for (const bottle of BOTTLES) {
    roll -= SPAWN_WEIGHTS[bottle];
    if (roll < 0) return bottle;
  }
  return BOTTLES[BOTTLES.length - 1]!; // guards against floating-point rounding
}

const copyBoard = (board: Board): Board => board.map((row) => [...row]);

/** Every cell that belongs to a horizontal or vertical run of MIN_MATCH or more. */
export function findMatches(board: Board): Cell[] {
  const matched = new Set<string>();
  const mark = (row: number, col: number) => matched.add(`${row},${col}`);

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const bottle = board[row]![col]!;
      // Look right and down from every cell; only runs starting here are measured
      // when the previous cell differs, so each run is found once.
      if (col === 0 || board[row]![col - 1] !== bottle) {
        let end = col;
        while (end + 1 < BOARD_SIZE && board[row]![end + 1] === bottle) end++;
        if (end - col + 1 >= MIN_MATCH) for (let c = col; c <= end; c++) mark(row, c);
      }
      if (row === 0 || board[row - 1]![col] !== bottle) {
        let end = row;
        while (end + 1 < BOARD_SIZE && board[end + 1]![col] === bottle) end++;
        if (end - row + 1 >= MIN_MATCH) for (let r = row; r <= end; r++) mark(r, col);
      }
    }
  }
  return [...matched].map((key) => {
    const [row, col] = key.split(',').map(Number) as [number, number];
    return { row, col };
  });
}

function swapped(board: Board, a: Cell, b: Cell): Board {
  const next = copyBoard(board);
  next[a.row]![a.col] = board[b.row]![b.col]!;
  next[b.row]![b.col] = board[a.row]![a.col]!;
  return next;
}

/** True if at least one swap of two adjacent bottles would make a match. */
export function hasValidMove(board: Board): boolean {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const here = { row, col };
      const neighbors = [
        { row, col: col + 1 },
        { row: row + 1, col },
      ].filter((n) => n.row < BOARD_SIZE && n.col < BOARD_SIZE);
      for (const neighbor of neighbors) {
        if (findMatches(swapped(board, here, neighbor)).length > 0) return true;
      }
    }
  }
  return false;
}

/** A new random board with no existing matches and at least one valid move. */
export function createBoard(rng: Rng): Board {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const board: Board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => pickBottle(rng)),
    );
    if (findMatches(board).length === 0 && hasValidMove(board)) return board;
  }
  throw new Error('Could not create a playable board');
}

/** Rearranges the existing bottles into a board with no matches and a valid move. */
export function shuffleBoard(board: Board, rng: Rng): Board {
  const bottles = board.flat();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Fisher-Yates shuffle
    for (let i = bottles.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bottles[i], bottles[j]] = [bottles[j]!, bottles[i]!];
    }
    const next: Board = Array.from({ length: BOARD_SIZE }, (_, row) =>
      bottles.slice(row * BOARD_SIZE, (row + 1) * BOARD_SIZE),
    );
    if (findMatches(next).length === 0 && hasValidMove(next)) return next;
  }
  // The current bottles may be unable to form a playable board; start fresh.
  return createBoard(rng);
}

/** Removes cleared cells, drops bottles down each column, and fills the top with new ones. */
function clearAndRefill(board: Board, cleared: Cell[], rng: Rng): Board {
  const next = copyBoard(board);
  for (let col = 0; col < BOARD_SIZE; col++) {
    const clearedRows = new Set(cleared.filter((c) => c.col === col).map((c) => c.row));
    const kept: Bottle[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      if (!clearedRows.has(row)) kept.push(board[row]![col]!);
    }
    const missing = BOARD_SIZE - kept.length;
    for (let row = 0; row < BOARD_SIZE; row++) {
      next[row]![col] = row < missing ? pickBottle(rng) : kept[row - missing]!;
    }
  }
  return next;
}

/**
 * Swaps two adjacent bottles. A swap that makes no match is rejected with no
 * change. Otherwise matches clear, bottles fall and refill, and this repeats
 * until stable (cascades). If no valid move remains, the board shuffles for free.
 */
export function swap(board: Board, a: Cell, b: Cell, rng: Rng): SwapResult {
  const inBounds = (c: Cell) =>
    Number.isInteger(c.row) && Number.isInteger(c.col) &&
    c.row >= 0 && c.row < BOARD_SIZE && c.col >= 0 && c.col < BOARD_SIZE;
  const adjacent = Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  if (!inBounds(a) || !inBounds(b) || !adjacent) return { ok: false, board, events: [] };

  let current = swapped(board, a, b);
  if (findMatches(current).length === 0) return { ok: false, board, events: [] };

  const events: BoardEvent[] = [];
  for (let step = 1; ; step++) {
    const matches = findMatches(current);
    if (matches.length === 0) break;
    events.push({
      type: 'bottlesCleared',
      step,
      cells: matches.map((cell) => ({ ...cell, bottle: current[cell.row]![cell.col]! })),
    });
    current = clearAndRefill(current, matches, rng);
  }

  if (!hasValidMove(current)) {
    current = shuffleBoard(current, rng);
    events.push({ type: 'shuffled' });
  }
  return { ok: true, board: current, events };
}
