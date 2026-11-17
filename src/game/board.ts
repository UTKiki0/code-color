import {
  BOARD_SIZE, BOMB_RADIUS, COLOR_ITEM_CLEARS, COLOR_ITEM_RUN, COLOR_ITEMS, LINE_ITEM_RUN, MIN_MATCH, SPAWN_WEIGHTS,
  isItem, type BaseBottle, type Bottle, type ItemBottle,
} from './rules';
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
  | {
      type: 'bottlesCleared';
      step: number;
      // Every bottle matched or cleared by an item, including one that became an item.
      cells: (Cell & { bottle: Bottle })[];
      created: (Cell & { item: ItemBottle })[]; // items left behind by this step's matches (not cleared)
      boardAfter: Board; // the board once these bottles are gone, the rest have fallen, and new ones filled in
    }
  | { type: 'itemUsed'; cell: Cell; item: ItemBottle } // the player tapped an item
  | { type: 'shuffled' };

export interface SwapResult {
  ok: boolean; // false: the swap was rejected and `board` is unchanged
  board: Board;
  events: BoardEvent[];
}

const BOTTLES = Object.keys(SPAWN_WEIGHTS) as BaseBottle[];
const MAX_ATTEMPTS = 1000;

/** Picks a bottle type using the spawn weights. */
export function pickBottle(rng: Rng): BaseBottle {
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
      if (isItem(bottle)) continue; // items never match, even three of a kind side by side
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
  if (board.some((row) => row.some(isItem))) return true; // an item can be tapped
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

/**
 * Turns `count` random non-empty bottles into empties (a boss's ink blot). The pick is retried
 * so the board is left with no match and a valid move; if no pick works the board is shuffled.
 */
export function blotBoard(board: Board, count: number, rng: Rng): { board: Board; cells: Cell[]; shuffled: boolean } {
  const filled: Cell[] = [];
  // Items are rewards, so a blot never takes one.
  board.forEach((bottles, row) => bottles.forEach((bottle, col) => { if (bottle !== 'empty' && !isItem(bottle)) filled.push({ row, col }); }));
  const n = Math.min(count, filled.length);

  let next = board;
  let picked: Cell[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Partial Fisher-Yates: the first n of a shuffled copy are n distinct cells.
    const pool = [...filled];
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    picked = pool.slice(0, n);
    next = copyBoard(board);
    for (const c of picked) next[c.row]![c.col] = 'empty';
    if (findMatches(next).length === 0 && hasValidMove(next)) return { board: next, cells: picked, shuffled: false };
  }
  return { board: shuffleBoard(next, rng), cells: picked, shuffled: true };
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

/** Splits cells into groups of touching bottles of the same type (one group per match). */
export function connectedGroups<T extends Cell & { bottle: Bottle }>(cells: T[]): T[][] {
  const remaining = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));
  const groups: T[][] = [];
  while (remaining.size > 0) {
    const [firstKey, first] = remaining.entries().next().value as [string, T];
    remaining.delete(firstKey);
    const group = [first];
    for (let i = 0; i < group.length; i++) {
      const { row, col, bottle } = group[i]!;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const key = `${row + dr},${col + dc}`;
        const neighbor = remaining.get(key);
        if (neighbor && neighbor.bottle === bottle) {
          remaining.delete(key);
          group.push(neighbor);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * The item one match leaves behind, or null. One match (a group of touching bottles) makes at
 * most one item. Priority: a run of 5 or more (color), then a T or L (bomb), then a run of 4 (line).
 */
function itemForMatch(group: Cell[], bottle: Bottle): ItemBottle | null {
  if (bottle === 'empty') return null;
  const inGroup = new Set(group.map((c) => `${c.row},${c.col}`));
  const has = (row: number, col: number) => inGroup.has(`${row},${col}`);

  // Maximal horizontal and vertical runs inside the group, kept when long enough to be a match.
  const horizontal = new Set<string>();
  const vertical = new Set<string>();
  let longest = 0;
  let longestIsRow = true;
  for (const { row, col } of group) {
    if (!has(row, col - 1)) {
      let end = col;
      while (has(row, end + 1)) end++;
      const length = end - col + 1;
      if (length >= MIN_MATCH) {
        for (let c = col; c <= end; c++) horizontal.add(`${row},${c}`);
        if (length > longest) { longest = length; longestIsRow = true; }
      }
    }
    if (!has(row - 1, col)) {
      let end = row;
      while (has(end + 1, col)) end++;
      const length = end - row + 1;
      if (length >= MIN_MATCH) {
        for (let r = row; r <= end; r++) vertical.add(`${r},${col}`);
        if (length > longest) { longest = length; longestIsRow = false; }
      }
    }
  }
  if (longest >= COLOR_ITEM_RUN) return COLOR_ITEMS[bottle] ?? null;
  if ([...horizontal].some((key) => vertical.has(key))) return 'bomb'; // a T, L, or plus: a row and a column share a bottle
  if (longest >= LINE_ITEM_RUN) return longestIsRow ? 'lineRow' : 'lineCol';
  return null;
}

/**
 * Finds this step's matches and the items they leave. An item appears at the bottle the player
 * moved (`prefer`, tried in order) if it is in the match, otherwise at the first bottle of it.
 */
function analyzeMatches(board: Board, prefer: Cell[] = []) {
  const cells = findMatches(board).map((c) => ({ ...c, bottle: board[c.row]![c.col]! }));
  const created: (Cell & { item: ItemBottle })[] = [];
  for (const group of connectedGroups(cells)) {
    const item = itemForMatch(group, group[0]!.bottle);
    if (!item) continue;
    const spot = prefer
      .map((p) => group.find((c) => c.row === p.row && c.col === p.col))
      .find((c) => c !== undefined)
      ?? [...group].sort((x, y) => x.row - y.row || x.col - y.col)[0]!;
    created.push({ row: spot.row, col: spot.col, item });
  }
  return { cells, created };
}

/**
 * Clears matches, drops bottles, and refills until the board is stable (cascades). Matches leave
 * items behind. `firstStep` numbers the first step, and `prefer` is where a first-step item goes.
 */
function cascade(board: Board, rng: Rng, firstStep: number, prefer: Cell[] = []): SwapResult {
  let current = board;
  const events: BoardEvent[] = [];
  for (let step = firstStep; ; step++) {
    const { cells, created } = analyzeMatches(current, step === firstStep ? prefer : []);
    if (cells.length === 0) break;
    const marked = copyBoard(current);
    for (const c of created) marked[c.row]![c.col] = c.item;
    const cleared = cells.filter((c) => !created.some((i) => i.row === c.row && i.col === c.col));
    current = clearAndRefill(marked, cleared, rng);
    events.push({ type: 'bottlesCleared', step, cells, created, boardAfter: current });
  }
  return { ok: true, board: current, events };
}

/** Free shuffle when no swap makes a match and there is no item to tap. */
function shuffleIfStuck(result: SwapResult, rng: Rng): SwapResult {
  if (hasValidMove(result.board)) return result;
  return { ...result, board: shuffleBoard(result.board, rng), events: [...result.events, { type: 'shuffled' }] };
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

  const current = swapped(board, a, b);
  if (findMatches(current).length === 0) return { ok: false, board, events: [] };

  // The bottle the player dragged ends up at b, so an item prefers b, then a.
  return shuffleIfStuck(cascade(current, rng, 1, [b, a]), rng);
}

/** The cells an item clears when tapped, not counting items it sets off (see `itemClear`). */
function itemArea(board: Board, at: Cell, item: ItemBottle): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const inArea =
        item === 'lineRow' ? row === at.row
        : item === 'lineCol' ? col === at.col
        : item === 'bomb' ? Math.abs(row - at.row) <= BOMB_RADIUS && Math.abs(col - at.col) <= BOMB_RADIUS
        : board[row]![col] === COLOR_ITEM_CLEARS[item];
      if (inArea) cells.push({ row, col });
    }
  }
  return cells;
}

/** Everything cleared by tapping the item at `at`: its area, plus the areas of items caught in it. */
function itemClear(board: Board, at: Cell): Cell[] {
  const cleared = new Map<string, Cell>();
  const queue: Cell[] = [at];
  const fired = new Set<string>();
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const key = `${cell.row},${cell.col}`;
    if (fired.has(key)) continue;
    fired.add(key);
    cleared.set(key, cell);
    for (const hit of itemArea(board, cell, board[cell.row]![cell.col] as ItemBottle)) {
      cleared.set(`${hit.row},${hit.col}`, hit);
      if (isItem(board[hit.row]![hit.col]!)) queue.push(hit); // an item caught in the clear goes off too
    }
  }
  return [...cleared.values()];
}

/**
 * Taps an item: it and what it clears are removed, the rest falls and refills, and cascades
 * follow (numbered from step 2). Tapping anything that is not an item is rejected.
 */
export function useItem(board: Board, at: Cell, rng: Rng): SwapResult {
  const inBounds = Number.isInteger(at.row) && Number.isInteger(at.col) &&
    at.row >= 0 && at.row < BOARD_SIZE && at.col >= 0 && at.col < BOARD_SIZE;
  const item = inBounds ? board[at.row]![at.col]! : null;
  if (item === null || !isItem(item)) return { ok: false, board, events: [] };

  const cleared = itemClear(board, at);
  const cells = cleared.map((c) => ({ ...c, bottle: board[c.row]![c.col]! }));
  const first = clearAndRefill(board, cleared, rng);
  const events: BoardEvent[] = [
    { type: 'itemUsed', cell: at, item },
    { type: 'bottlesCleared', step: 1, cells, created: [], boardAfter: first },
  ];
  const rest = cascade(first, rng, 2);
  return shuffleIfStuck({ ok: true, board: rest.board, events: [...events, ...rest.events] }, rng);
}
