import { BOARD_SIZE, type Bottle } from '../src/game/rules';
import type { Board } from '../src/game/board';
import { createBattle, type BattleState, type Enemy } from '../src/game/battle';
import { createRng, type Rng } from '../src/game/rng';

const LETTERS: Record<string, Bottle> = {
  r: 'red', y: 'yellow', b: 'blue', g: 'grey', e: 'empty',
  // Items: h = row line, v = column line, x = bomb, and the color items R Y B G.
  h: 'lineRow', v: 'lineCol', x: 'bomb', R: 'colorRed', Y: 'colorYellow', B: 'colorBlue', G: 'colorGrey',
};

// Parses 7 strings of 7 letters (r y b g e, and the item letters) into a board.
export const parse = (rows: string[]): Board => rows.map((row) => [...row].map((c) => LETTERS[c]!));

// A fixed 7x7 board with no matches and no valid move: the starting point for crafted boards.
export const BASE = [
  'rybgery',
  'bgerybg',
  'erybger',
  'ybgeryb',
  'gerybge',
  'rybgery',
  'bgerybg',
];

// Returns BASE with some cells replaced: edits maps "row,col" to a letter.
export function withEdits(edits: Record<string, string>): Board {
  const rows = BASE.map((r) => [...r]);
  for (const [key, letter] of Object.entries(edits)) {
    const [row, col] = key.split(',').map(Number) as [number, number];
    rows[row]![col] = letter;
  }
  return parse(rows.map((r) => r.join('')));
}

// An rng that repeats the given values, for refills that avoid new matches.
export const cycleRng = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

export const enemy = (id: number, over: Partial<Enemy> = {}): Enemy => ({
  id, hp: 10, maxHp: 10, startCountdown: 4, countdown: 4, attack: 3, boss: false, burn: null, ability: null, ...over,
});

// A battle on a crafted board with the given enemies.
export const battleOn = (board: Board, enemies: Enemy[], over: Partial<BattleState> = {}): BattleState => ({
  ...createBattle(createRng(1)), board, enemies, ...over,
});

export { BOARD_SIZE };
