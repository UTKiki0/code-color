import { describe, expect, it } from 'vitest';
import { createBoard, swap, type Board, type Cell } from '../src/game/board';
import { createRng } from '../src/game/rng';
import { BOARD_SIZE } from '../src/game/rules';
import { computeFalls } from '../src/ui/falls';

const cells = (list: [number, number][]): Cell[] => list.map(([row, col]) => ({ row, col }));
const asObject = (m: Map<string, number>) => Object.fromEntries(m);

describe('computeFalls', () => {
  it('drops everything above one cleared bottle by one row, and a new bottle falls in', () => {
    expect(asObject(computeFalls(cells([[3, 2]])))).toEqual({ '0,2': 1, '1,2': 1, '2,2': 1, '3,2': 1 });
  });

  it('only moves the columns that lost bottles', () => {
    const falls = computeFalls(cells([[6, 0], [6, 1], [6, 2]]));
    expect([...falls.keys()].every((key) => Number(key.split(',')[1]) <= 2)).toBe(true);
    expect(falls.size).toBe(3 * BOARD_SIZE); // every cell in those three columns
  });

  it('drops a column by the length of a vertical run', () => {
    // Rows 3-5 cleared in column 0: rows 0-2 fall 3, three new bottles fall 3. Row 6 stays put.
    const falls = computeFalls(cells([[3, 0], [4, 0], [5, 0]]));
    expect(asObject(falls)).toEqual({ '0,0': 3, '1,0': 3, '2,0': 3, '3,0': 3, '4,0': 3, '5,0': 3 });
  });

  it('gives each bottle the number of gaps beneath it when gaps are separated', () => {
    // Rows 1 and 4 cleared: row 0 falls 2 (to row 2); rows 2 and 3 fall 1 (to rows 3 and 4); two new fall in.
    expect(asObject(computeFalls(cells([[1, 0], [4, 0]])))).toEqual({
      '0,0': 2, '1,0': 2, '2,0': 2, '3,0': 1, '4,0': 1,
    });
  });
});

describe('computeFalls agrees with the game', () => {
  // Every bottle that falls must land on the bottle that was `rows` above it in the previous board,
  // and every bottle that does not fall must be unchanged.
  it('matches the real board after every cascade step', () => {
    let steps = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const board = createBoard(createRng(seed));
      const move = firstValidSwap(board);
      const result = swap(board, move[0], move[1], createRng(seed));
      let before: Board = board.map((r) => [...r]);
      before[move[0].row]![move[0].col] = board[move[1].row]![move[1].col]!;
      before[move[1].row]![move[1].col] = board[move[0].row]![move[0].col]!;

      const stepEvents = result.events.filter((e) => e.type === 'bottlesCleared');
      for (const event of stepEvents) {
        if (event.type !== 'bottlesCleared') continue;
        steps++;
        // An item left by the match stays put and falls with the other bottles; only the rest vanish.
        const vacated = event.cells.filter((c) => !event.created.some((i) => i.row === c.row && i.col === c.col));
        const falls = computeFalls(vacated);
        const placed = before.map((r) => [...r]);
        for (const i of event.created) placed[i.row]![i.col] = i.item;
        for (let row = 0; row < BOARD_SIZE; row++) {
          for (let col = 0; col < BOARD_SIZE; col++) {
            const rows = falls.get(`${row},${col}`);
            if (rows === undefined) {
              expect(event.boardAfter[row]![col]).toBe(placed[row]![col]);
            } else if (row - rows >= 0) {
              expect(event.boardAfter[row]![col]).toBe(placed[row - rows]![col]);
            } // otherwise it is a new bottle, which could be anything
          }
        }
        before = event.boardAfter;
      }
      // With no shuffle, the last step's board is the final board.
      const shuffled = result.events.some((e) => e.type === 'shuffled');
      if (!shuffled) expect(result.board).toEqual(before);
    }
    expect(steps).toBeGreaterThan(60);
  });
});

function firstValidSwap(board: Board): [Cell, Cell] {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
        const a = { row, col };
        const b = { row: row + dr, col: col + dc };
        if (b.row < BOARD_SIZE && b.col < BOARD_SIZE && swap(board, a, b, createRng(0)).ok) return [a, b];
      }
    }
  }
  throw new Error('no valid swap');
}
