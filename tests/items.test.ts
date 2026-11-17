import { describe, expect, it } from 'vitest';
import { takeTurn, useItem as useItemTurn } from '../src/game/battle';
import { blotBoard, findMatches, hasValidMove, swap, useItem, type Board, type BoardEvent, type Cell } from '../src/game/board';
import { createRng } from '../src/game/rng';
import { BOARD_SIZE, BOMB_RADIUS, isItem } from '../src/game/rules';
import { battleOn, cycleRng, enemy, parse } from './helpers';

// A 7x7 filler of yellow, blue, grey, and empty with no run of 3 anywhere and no red, so red
// shapes placed on it are exactly the matches the test builds. Edits are "row,col" -> letter.
const FILLER = 'ybge';
function grid(edits: Record<string, string>): Board {
  const rows = Array.from({ length: BOARD_SIZE }, (_, r) =>
    [...Array.from({ length: BOARD_SIZE }, (_, c) => FILLER[(r * 2 + c * 3) % 4]!)]);
  for (const [key, letter] of Object.entries(edits)) {
    const [r, c] = key.split(',').map(Number) as [number, number];
    rows[r]![c] = letter;
  }
  return parse(rows.map((row) => row.join('')));
}
const refill = () => cycleRng([0.4, 0.7, 0.9]); // blue, grey, empty: never red, never an item
const at = (row: number, col: number): Cell => ({ row, col });
const cleared = (events: BoardEvent[]) => events.filter((e) => e.type === 'bottlesCleared');
const firstStep = (events: BoardEvent[]) => cleared(events)[0]!;
const itemCount = (board: Board) => board.flat().filter(isItem).length;

// Row 3 gets reds in columns `cols`, and the red that completes the run is swapped down from (2,2).
const rowRun = (cols: number[]) => {
  const edits: Record<string, string> = { '2,2': 'r' };
  for (const c of cols) if (c !== 2) edits[`3,${c}`] = 'r';
  return grid(edits);
};
const DOWN: [Cell, Cell] = [at(2, 2), at(3, 2)]; // drags the red down into (3,2)

describe('fixtures', () => {
  it('the filler and the crafted boards start with no matches', () => {
    expect(findMatches(grid({}))).toEqual([]);
    expect(findMatches(rowRun([0, 1, 3]))).toEqual([]);
    expect(findMatches(rowRun([0, 1, 3, 4]))).toEqual([]);
  });
});

describe('items made by matches', () => {
  it('a match of 3 makes no item', () => {
    const result = swap(rowRun([0, 1]), ...DOWN, refill());
    expect(firstStep(result.events)).toMatchObject({ created: [] });
  });

  it('4 across makes a row line item where the player moved the bottle', () => {
    const result = swap(rowRun([0, 1, 3]), ...DOWN, refill());
    const step = firstStep(result.events);
    expect(step).toMatchObject({ type: 'bottlesCleared', created: [{ row: 3, col: 2, item: 'lineRow' }] });
    // All four reds count as matched (for paint), but only three vanish: one board item remains.
    expect(step.type === 'bottlesCleared' && step.cells).toHaveLength(4);
  });

  it('4 down makes a column line item', () => {
    // Column 4: reds in rows 1, 2, 4, and the red that completes the run swaps in from (3,5).
    const board = grid({ '1,4': 'r', '2,4': 'r', '4,4': 'r', '3,5': 'r' });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, at(3, 5), at(3, 4), refill());
    expect(firstStep(result.events)).toMatchObject({ created: [{ row: 3, col: 4, item: 'lineCol' }] });
  });

  it('5 across makes a color item for that color', () => {
    const result = swap(rowRun([0, 1, 3, 4]), ...DOWN, refill());
    expect(firstStep(result.events)).toMatchObject({ created: [{ row: 3, col: 2, item: 'colorRed' }] });
  });

  it('a run of 5 grey makes the grey color item', () => {
    const board = grid({ '2,2': 'g', '3,0': 'g', '3,1': 'g', '3,3': 'g', '3,4': 'g' });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, ...DOWN, refill());
    expect(firstStep(result.events)).toMatchObject({ created: [{ item: 'colorGrey' }] });
  });

  // The swap drops the red at (2,c) down into the corner or middle (3,c), which completes both
  // the row and the column at once. Column 1 and column 0 hold the vertical part.
  const TO_1: [Cell, Cell] = [at(2, 1), at(3, 1)];
  const TO_0: [Cell, Cell] = [at(2, 0), at(3, 0)];

  it('a T makes a bomb', () => {
    // Row 3 columns 0-2 and column 1 rows 3-5: a T with the stem down.
    const board = grid({ '2,1': 'r', '3,0': 'r', '3,2': 'r', '4,1': 'r', '5,1': 'r' });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, ...TO_1, refill());
    expect(firstStep(result.events)).toMatchObject({ created: [{ row: 3, col: 1, item: 'bomb' }] });
  });

  it('an L makes a bomb', () => {
    // Row 3 columns 0-2 and column 0 rows 3-5.
    const board = grid({ '2,0': 'r', '3,1': 'r', '3,2': 'r', '4,0': 'r', '5,0': 'r' });
    expect(findMatches(board)).toEqual([]);
    const step = firstStep(swap(board, ...TO_0, refill()).events);
    expect(step).toMatchObject({ created: [{ item: 'bomb' }] });
    expect(step.type === 'bottlesCleared' && step.cells).toHaveLength(5);
  });

  it('a T made of a run of 4 and a run of 3 is a bomb, not a line item', () => {
    const board = grid({ '2,1': 'r', '3,0': 'r', '3,2': 'r', '3,3': 'r', '4,1': 'r', '5,1': 'r' });
    expect(findMatches(board)).toEqual([]);
    expect(firstStep(swap(board, ...TO_1, refill()).events)).toMatchObject({ created: [{ item: 'bomb' }] });
  });

  it('a run of 5 that also crosses a column is a color item, not a bomb', () => {
    // Row 3 columns 0-4 (the swap fills the middle) and column 2 rows 3-5.
    const board = grid({ '2,2': 'r', '3,0': 'r', '3,1': 'r', '3,3': 'r', '3,4': 'r', '4,2': 'r', '5,2': 'r' });
    expect(findMatches(board)).toEqual([]);
    expect(firstStep(swap(board, ...DOWN, refill()).events)).toMatchObject({ created: [{ item: 'colorRed' }] });
  });

  it('the item goes to the other swapped bottle when the dragged one is not in the match', () => {
    // Dragging the filler at (3,2) up to (2,2) drops the red at (2,2) down into (3,2), which is
    // where the match is. The dragged bottle (now at (2,2)) is not in it, so the item uses (3,2).
    const result = swap(rowRun([0, 1, 3]), at(3, 2), at(2, 2), refill());
    expect(firstStep(result.events)).toMatchObject({ created: [{ row: 3, col: 2, item: 'lineRow' }] });
  });

  it('empties make no item, even in a run of 4', () => {
    const board = grid({ '2,2': 'e', '3,0': 'e', '3,1': 'e', '3,3': 'e', '3,4': 'y' });
    const result = swap(board, ...DOWN, refill());
    expect(result.ok).toBe(true);
    expect(firstStep(result.events)).toMatchObject({ created: [] });
  });

  it('leaves exactly one item on the board and clears the other bottles of the match', () => {
    const result = swap(rowRun([0, 1, 3]), ...DOWN, refill());
    const step = firstStep(result.events);
    expect(step.type === 'bottlesCleared' && itemCount(step.boardAfter)).toBe(1);
  });

  it('two separate matches in one move each make their own item', () => {
    // Dragging the red down completes a red run of 4 in row 3, and the yellow it swaps up
    // completes a yellow run of 4 in row 2.
    const board = grid({ '2,2': 'r', '3,0': 'r', '3,1': 'r', '3,3': 'r', '2,0': 'y', '2,1': 'y', '2,3': 'y', '2,4': 'b' });
    expect(findMatches(board)).toEqual([]);
    const step = firstStep(swap(board, ...DOWN, refill()).events);
    expect(step.type === 'bottlesCleared' && step.created.map((c) => `${c.row},${c.col}`).sort()).toEqual(['2,2', '3,2']);
  });

  it('items never match, even three of a kind side by side', () => {
    const board = grid({ '3,0': 'h', '3,1': 'h', '3,2': 'h' });
    expect(findMatches(board)).toEqual([]);
  });
});

describe('using an item', () => {
  it('a row line clears its whole row, and a column line its whole column', () => {
    const row = useItem(grid({ '3,2': 'h' }), at(3, 2), refill());
    const rowStep = firstStep(row.events);
    expect(rowStep.type === 'bottlesCleared' && rowStep.cells.every((c) => c.row === 3)).toBe(true);
    expect(rowStep.type === 'bottlesCleared' && rowStep.cells).toHaveLength(BOARD_SIZE);

    const col = useItem(grid({ '3,2': 'v' }), at(3, 2), refill());
    const colStep = firstStep(col.events);
    expect(colStep.type === 'bottlesCleared' && colStep.cells.every((c) => c.col === 2)).toBe(true);
    expect(colStep.type === 'bottlesCleared' && colStep.cells).toHaveLength(BOARD_SIZE);
  });

  it('a bomb clears a 5x5 area, and less at a corner or edge', () => {
    const size = (cell: Cell) => {
      const step = firstStep(useItem(grid({ [`${cell.row},${cell.col}`]: 'x' }), cell, refill()).events);
      return step.type === 'bottlesCleared' ? step.cells.length : -1;
    };
    expect(size(at(3, 3))).toBe((2 * BOMB_RADIUS + 1) ** 2);
    expect(size(at(0, 0))).toBe((BOMB_RADIUS + 1) ** 2);
    expect(size(at(0, 3))).toBe((BOMB_RADIUS + 1) * (2 * BOMB_RADIUS + 1));
  });

  it('a color item clears every bottle of its color and itself', () => {
    const board = grid({ '0,0': 'r', '2,5': 'r', '4,1': 'r', '6,6': 'r', '3,3': 'R' });
    const step = firstStep(useItem(board, at(3, 3), refill()).events);
    expect(step.type === 'bottlesCleared' && step.cells).toHaveLength(5); // four reds and the item
    expect(step.type === 'bottlesCleared' && step.cells.filter((c) => c.bottle === 'red')).toHaveLength(4);
  });

  it('an item caught in the clear goes off too, and items can chain', () => {
    // The row line at (3,0) catches the bomb at (3,3); the bomb's 5x5 area then catches the
    // column line at (1,5), which clears column 5.
    const board = grid({ '3,0': 'h', '3,3': 'x', '1,5': 'v' });
    const step = firstStep(useItem(board, at(3, 0), createRng(9)).events); // real random: a big refill must settle
    expect(step.type === 'bottlesCleared' && step.cells.some((c) => c.row === 0 && c.col === 5)).toBe(true); // via the column line
    expect(step.type === 'bottlesCleared' && step.cells.some((c) => c.row === 6 && c.col === 5)).toBe(true);
    expect(step.type === 'bottlesCleared' && step.cells.some((c) => c.row === 1 && c.col === 1)).toBe(true); // bomb area
  });

  it('starts with itemUsed, numbers its own clear as step 1, and later cascades from step 2', () => {
    const result = useItem(grid({ '3,2': 'h' }), at(3, 2), createRng(4));
    expect(result.events[0]).toEqual({ type: 'itemUsed', cell: at(3, 2), item: 'lineRow' });
    const steps = cleared(result.events).map((e) => (e.type === 'bottlesCleared' ? e.step : 0));
    expect(steps[0]).toBe(1);
    steps.forEach((step, i) => expect(step).toBe(i + 1));
  });

  it('is rejected when the cell is not an item or is out of bounds, leaving the board alone', () => {
    const board = grid({ '3,2': 'h' });
    for (const cell of [at(0, 0), at(-1, 2), at(3, 9)]) {
      const result = useItem(board, cell, refill());
      expect(result.ok).toBe(false);
      expect(result.board).toBe(board);
    }
  });

  it('items count as a valid move, so a board with an item never shuffles', () => {
    // No swap on the filler makes a match, so without an item the board is stuck.
    expect(hasValidMove(grid({}))).toBe(false);
    expect(hasValidMove(grid({ '3,2': 'h' }))).toBe(true);
  });

  it('can be swiped like a bottle; it never matches, but its neighbor can', () => {
    // The row line sits at (3,2); swapping it down puts the red from (4,2) ... into row 3.
    const board = grid({ '3,0': 'r', '3,1': 'r', '4,2': 'r', '3,2': 'h' });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, at(3, 2), at(4, 2), refill());
    expect(result.ok).toBe(true);
    expect(firstStep(result.events)).toMatchObject({ type: 'bottlesCleared' });
  });

  it('a boss ink blot never takes an item', () => {
    const board = grid({ '0,0': 'x', '6,6': 'h' });
    for (let seed = 1; seed <= 40; seed++) {
      const blotted = blotBoard(board, 4, createRng(seed));
      if (blotted.shuffled) continue; // a shuffle may move items, but the blot did not take them
      expect(blotted.cells.every((c) => !isItem(board[c.row]![c.col]!))).toBe(true);
      expect(itemCount(blotted.board)).toBe(2);
    }
  });
});

describe('tapping an item is a turn', () => {
  const state = (board: Board, enemies = [enemy(0, { hp: 20, maxHp: 20, countdown: 3 })], over = {}) =>
    battleOn(board, enemies, { weapon: 'brush', ...over });

  it('advances countdowns, ticks burn, and lets enemies attack', () => {
    const burning = enemy(0, { hp: 20, maxHp: 20, countdown: 1, burn: { damage: 2, turnsLeft: 2 } });
    const result = useItemTurn(state(grid({ '3,2': 'h' }), [burning]), at(3, 2), refill());
    expect(result.ok).toBe(true);
    expect(result.events.some((e) => e.type === 'enemyAttacked')).toBe(true);
    expect(result.events.some((e) => e.type === 'enemyDamaged' && e.source === 'burn')).toBe(true);
    expect(result.state.enemies[0]!.countdown).toBe(burning.startCountdown); // attacked, so it reset
  });

  it('gives paint for every cleared bottle', () => {
    // Row 3 reads r r h e b b y, so it holds 2 red, 2 blue, and 1 yellow (more can come from cascades).
    const board = grid({ '3,0': 'r', '3,1': 'r', '3,4': 'b', '3,2': 'h' });
    const result = useItemTurn(state(board), at(3, 2), refill());
    expect(result.state.paint.red).toBeGreaterThanOrEqual(2);
    expect(result.state.paint.blue).toBeGreaterThanOrEqual(2);
    expect(result.state.paint.yellow).toBeGreaterThanOrEqual(1);
  });

  it('damages enemies for cleared greys, once per group of touching greys', () => {
    // Row 3 becomes WW y WWW b ...: a group of 2 and a group of 3 greys in the row, not touching.
    const board = grid({ '3,0': 'g', '3,1': 'g', '3,2': 'h', '3,3': 'g', '3,4': 'g', '3,5': 'g', '3,6': 'b' });
    const result = useItemTurn(state(board), at(3, 2), refill());
    const hits = result.events.filter((e) => e.type === 'enemyDamaged' && e.source === 'grey');
    // The brush adds no bonus: a group of 2 does 1 damage and a group of 3 does 1.
    expect(hits.length).toBe(2);
    expect(hits.every((e) => e.type === 'enemyDamaged' && e.amount === 1)).toBe(true);
  });

  it('wins the battle when the damage kills the last enemy', () => {
    const board = grid({ '3,0': 'g', '3,1': 'g', '3,2': 'h', '3,3': 'g', '3,4': 'g', '3,5': 'g', '3,6': 'b' });
    const result = useItemTurn(state(board, [enemy(0, { hp: 1 })]), at(3, 2), refill());
    expect(result.state.status).toBe('won');
  });

  it('is rejected on a non-item (nothing advances) and while a mix is held', () => {
    const board = grid({ '3,2': 'h' });
    const plain = useItemTurn(state(board), at(0, 0), refill());
    expect(plain.ok).toBe(false);
    expect(plain.state.enemies[0]!.countdown).toBe(3);
    expect(useItemTurn(state(board, undefined, { heldMix: 'green' }), at(3, 2), refill()).ok).toBe(false);
  });

  it('uses the same turn rules as a swap (an ordinary move is unchanged)', () => {
    const result = takeTurn(state(rowRun([0, 1])), ...DOWN, refill());
    expect(result.ok).toBe(true);
    expect(result.state.enemies[0]!.countdown).toBe(2);
  });
});
