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

export type Weapon = 'paintballGun' | 'brush' | 'roller';

// Damage dealt by each white bottle cleared, by equipped weapon.
export const WHITE_DAMAGE: Record<Weapon, number> = { paintballGun: 2, brush: 1, roller: 1 };
// The roller's white matches hit every living enemy instead of one random enemy.

export const PLAYER_START_HP = 20;
export const ENEMY_ATTACK_DAMAGE = 3;

// Enemies in the first battle. The countdown is in player turns (successful moves).
export const FIRST_BATTLE_ENEMIES = [
  { hp: 10, countdown: 4 },
  { hp: 10, countdown: 5 },
  { hp: 10, countdown: 6 },
];

// --- Paint use (checkpoint 4) ---

export const SPEND_COST = 3; // paint used by one direct spend on an enemy

// An effect is data: damage now, countdown change, and/or a burn. One shared
// function (effects.ts) applies any effect, so a new paint is a new entry here.
export interface Effect {
  damage?: number;
  slow?: number; // turns added to the enemy's countdown
  resetCountdown?: boolean;
  burn?: { damage: number; turns: number }; // replaces any current burn
}

export const PAINT_EFFECTS: Record<PaintColor, Effect> = {
  red: { burn: { damage: 1, turns: 3 } },
  yellow: { damage: 2 },
  blue: { slow: 1 },
};
// The brush makes a direct red spend burn longer. Mixes are unaffected for now.
export const BRUSH_RED_BURN_TURNS = 5;

export type MixColor = 'green' | 'purple' | 'orange';
export const MIX_COLORS: MixColor[] = ['green', 'purple', 'orange'];
export type EffectName = PaintColor | MixColor;

// Which two paints make each mix. Each mix consumes PAINT_MAX of both.
export const MIX_RECIPES: Record<MixColor, [PaintColor, PaintColor]> = {
  green: ['blue', 'yellow'],
  purple: ['red', 'blue'],
  orange: ['red', 'yellow'],
};

export const MIX_EFFECTS: Record<MixColor, Effect> = {
  green: { resetCountdown: true },
  purple: { slow: 2, burn: { damage: 2, turns: 3 } },
  orange: { burn: { damage: 3, turns: 3 } },
};

// Rainbow: a held mix dropped on the third paint's full bottle (which it consumes).
export const RAINBOW_DAMAGE = 6; // to every enemy, before the random mix effect
