import { BOARD_SIZE } from '../game/rules';
import type { Cell } from '../game/board';

/**
 * For one cascade step, how many rows each bottle falls to reach its new cell.
 * Returns a map from "row,col" (the bottle's NEW cell) to rows fallen.
 * Bottles above a cleared gap fall by the number of cleared cells beneath them;
 * new bottles fill the top of the column and fall in from above the board.
 */
export function computeFalls(cleared: Cell[]): Map<string, number> {
  const falls = new Map<string, number>();
  for (let col = 0; col < BOARD_SIZE; col++) {
    const clearedRows = new Set(cleared.filter((c) => c.col === col).map((c) => c.row));
    if (clearedRows.size === 0) continue;
    for (let row = 0; row < BOARD_SIZE; row++) {
      if (clearedRows.has(row)) continue;
      let below = 0;
      for (const r of clearedRows) if (r > row) below++;
      if (below > 0) falls.set(`${row + below},${col}`, below);
    }
    // New bottles take rows 0 to k-1 and start k rows higher, above the board.
    for (let row = 0; row < clearedRows.size; row++) falls.set(`${row},${col}`, clearedRows.size);
  }
  return falls;
}
