import { describe, expect, it } from 'vitest';
import {
  createBoard, findMatches, hasValidMove, pickBottle, shuffleBoard, swap,
  type Board, type Cell,
} from '../src/game/board';
import { BOARD_SIZE, SPAWN_WEIGHTS } from '../src/game/rules';
import { createRng } from '../src/game/rng';
import { BASE, parse, withEdits } from './helpers';

// Finds any swap that would make a match, by trying them all.
function findValidSwap(board: Board): [Cell, Cell] | undefined {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
        const a = { row, col };
        const b = { row: row + dr, col: col + dc };
        if (b.row >= BOARD_SIZE || b.col >= BOARD_SIZE) continue;
        if (swap(board, a, b, createRng(0)).ok) return [a, b];
      }
    }
  }
  return undefined;
}

describe('fixtures', () => {
  it('the base board has no matches', () => {
    expect(BASE.every((r) => r.length === BOARD_SIZE)).toBe(true);
    expect(findMatches(parse(BASE))).toEqual([]);
  });
});

describe('spawning', () => {
  it('picks bottle types by the spawn weights', () => {
    expect(pickBottle(() => 0.0)).toBe('red');
    expect(pickBottle(() => 0.2)).toBe('yellow');
    expect(pickBottle(() => 0.4)).toBe('blue');
    expect(pickBottle(() => 0.6)).toBe('white');
    expect(pickBottle(() => 0.95)).toBe('empty');
  });

  it('matches the configured weights over a large sample', () => {
    const rng = createRng(42);
    const counts: Record<string, number> = {};
    const total = 20000;
    for (let i = 0; i < total; i++) {
      const bottle = pickBottle(rng);
      counts[bottle] = (counts[bottle] ?? 0) + 1;
    }
    for (const [bottle, weight] of Object.entries(SPAWN_WEIGHTS)) {
      expect((counts[bottle] ?? 0) / total).toBeCloseTo(weight, 1);
    }
  });

  it('creates boards with no matches and at least one valid move', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const board = createBoard(createRng(seed));
      expect(board).toHaveLength(BOARD_SIZE);
      expect(board.every((row) => row.length === BOARD_SIZE)).toBe(true);
      expect(findMatches(board)).toEqual([]);
      expect(hasValidMove(board)).toBe(true);
    }
  });
});

describe('swap rejection', () => {
  it('rejects a swap that makes no match and changes nothing', () => {
    const board = parse(BASE);
    const before = JSON.stringify(board);
    const result = swap(board, { row: 0, col: 0 }, { row: 0, col: 1 }, createRng(1));
    expect(result.ok).toBe(false);
    expect(result.events).toEqual([]);
    expect(result.board).toBe(board);
    expect(JSON.stringify(board)).toBe(before);
  });

  it('rejects non-adjacent and out-of-bounds swaps', () => {
    const board = parse(BASE);
    const rng = createRng(1);
    expect(swap(board, { row: 0, col: 0 }, { row: 0, col: 2 }, rng).ok).toBe(false);
    expect(swap(board, { row: 0, col: 0 }, { row: 1, col: 1 }, rng).ok).toBe(false);
    expect(swap(board, { row: 0, col: 6 }, { row: 0, col: 7 }, rng).ok).toBe(false);
    expect(swap(board, { row: -1, col: 0 }, { row: 0, col: 0 }, rng).ok).toBe(false);
  });
});

describe('matching', () => {
  it('clears a match of three', () => {
    // Swapping (2,2) down puts red at (3,2), making r r r across row 3, columns 0-2.
    const board = withEdits({ '3,0': 'r', '3,1': 'r', '2,2': 'r' });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, { row: 2, col: 2 }, { row: 3, col: 2 }, createRng(1));
    expect(result.ok).toBe(true);
    const first = result.events[0];
    expect(first).toMatchObject({ type: 'bottlesCleared', step: 1 });
    if (first?.type !== 'bottlesCleared') throw new Error('expected bottlesCleared');
    expect(first.cells.map((c) => `${c.row},${c.col}`).sort()).toEqual(['3,0', '3,1', '3,2']);
    expect(first.cells.every((c) => c.bottle === 'red')).toBe(true);
  });

  it('clears a longer run in full', () => {
    // r r r r r across row 3, columns 0-4 after the swap.
    const board = withEdits({ '3,0': 'r', '3,1': 'r', '3,3': 'r', '2,2': 'r' });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, { row: 2, col: 2 }, { row: 3, col: 2 }, createRng(1));
    const first = result.events[0];
    if (first?.type !== 'bottlesCleared') throw new Error('expected bottlesCleared');
    expect(first.cells).toHaveLength(5);
  });

  it('clears crossing runs once per bottle (L shape)', () => {
    // After swapping (2,0) down: row 3 has r r r (cols 0-2) and column 0 has r r r (rows 3-5).
    // They share (3,0), so 5 distinct bottles clear.
    const board = withEdits({ '2,0': 'r', '3,0': 'y', '3,1': 'r', '3,2': 'r', '4,0': 'r', '5,0': 'r' });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, { row: 2, col: 0 }, { row: 3, col: 0 }, createRng(1));
    const first = result.events[0];
    if (first?.type !== 'bottlesCleared') throw new Error('expected bottlesCleared');
    expect(first.cells).toHaveLength(5);
  });
});

describe('cascades', () => {
  it('keeps clearing as bottles fall, reporting each step in order', () => {
    // Swapping (5,0)/(5,1) clears red in column 0, rows 3-5. The blue bottle at (1,0)
    // falls to (4,0) and lines up with the blues at (4,1) and (4,2): a second match.
    const board = withEdits({
      '3,0': 'r', '4,0': 'r', '5,0': 'w', '5,1': 'r', '4,1': 'b', '4,2': 'b',
    });
    expect(findMatches(board)).toEqual([]);
    const result = swap(board, { row: 5, col: 0 }, { row: 5, col: 1 }, createRng(7));
    expect(result.ok).toBe(true);
    const steps = result.events.filter((e) => e.type === 'bottlesCleared');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    steps.forEach((e, i) => expect(e).toMatchObject({ step: i + 1 }));
    const second = steps[1];
    if (second?.type !== 'bottlesCleared') throw new Error('expected bottlesCleared');
    const cells = second.cells.map((c) => `${c.row},${c.col}`);
    expect(cells).toEqual(expect.arrayContaining(['4,0', '4,1', '4,2']));
  });
});

describe('shuffle', () => {
  // The base board repeats five types in a pattern where no swap makes a match.
  const stuck = parse(BASE);

  it('the fixture really has no valid move', () => {
    expect(findMatches(stuck)).toEqual([]);
    expect(hasValidMove(stuck)).toBe(false);
  });

  it('produces a board with no matches and at least one valid move', () => {
    const shuffled = shuffleBoard(stuck, createRng(3));
    expect(findMatches(shuffled)).toEqual([]);
    expect(hasValidMove(shuffled)).toBe(true);
  });
});

describe('swap invariants over many random boards', () => {
  it('always leaves a stable, playable board; a shuffle is always the last event', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const board = createBoard(createRng(seed));
      const move = findValidSwap(board);
      expect(move).toBeDefined();
      const result = swap(board, move![0], move![1], createRng(seed));
      expect(result.ok).toBe(true);
      expect(findMatches(result.board)).toEqual([]);
      expect(hasValidMove(result.board)).toBe(true);
      result.events.forEach((e, i) => {
        if (e.type === 'shuffled') expect(i).toBe(result.events.length - 1);
      });
    }
  });
});
