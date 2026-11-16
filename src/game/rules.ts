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

// --- Battle rules (checkpoint 3) ---

export type PaintColor = 'red' | 'yellow' | 'blue';
export const PAINT_COLORS: PaintColor[] = ['red', 'yellow', 'blue'];
export const PAINT_MAX = 9;

export type Weapon = 'paintballGun'; // brush and roller are added in a later checkpoint

// Damage dealt by each white bottle cleared, by equipped weapon.
export const WHITE_DAMAGE: Record<Weapon, number> = { paintballGun: 2 };

export const PLAYER_START_HP = 20;
export const ENEMY_ATTACK_DAMAGE = 3;

// Enemies in the first battle. The countdown is in player turns (successful moves).
export const FIRST_BATTLE_ENEMIES = [
  { hp: 10, countdown: 4 },
  { hp: 10, countdown: 5 },
  { hp: 10, countdown: 6 },
];
