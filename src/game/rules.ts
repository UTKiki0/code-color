// Rule values in one place so balancing means editing numbers, not logic.
// All values are starting values to be tuned by playtesting (see spec.md).

export const BOARD_SIZE = 7;
export const MIN_MATCH = 3;

export type Bottle = 'red' | 'yellow' | 'blue' | 'white' | 'empty';

// Spawn weights for new bottles. They are relative, so they need not sum to 1.
export const SPAWN_WEIGHTS: Record<Bottle, number> = {
  red: 0.18,
  yellow: 0.18,
  blue: 0.18,
  white: 0.28,
  empty: 0.18,
};
