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

// White damage per match: a base amount for a match of three, plus an extra amount for each
// white bottle beyond the third, plus a bonus some weapons add to every match. A match is one
// group of touching bottles.
export const WHITE_BASE_DAMAGE = 1;
export const WHITE_EXTRA_DAMAGE = 1;
// The paintball gun's effect is more white damage. The Developer chose the effect but not the
// amount, so +1 per match is a starting value to tune.
export const WEAPON_WHITE_BONUS: Record<Weapon, number> = { paintballGun: 1, brush: 0, roller: 0 };
export const whiteMatchDamage = (size: number, weapon: Weapon): number =>
  WHITE_BASE_DAMAGE + Math.max(0, size - MIN_MATCH) * WHITE_EXTRA_DAMAGE + WEAPON_WHITE_BONUS[weapon];

export const PLAYER_START_HP = 20; // also the most HP the player can have
export const ENEMY_ATTACK_DAMAGE = 3; // a regular enemy's hit; bosses set their own

// --- Runs (checkpoint 6) ---

// An enemy as described in a stage. The countdown is in player turns (successful moves).
export interface EnemyDef {
  hp: number;
  countdown: number;
  attack?: number; // damage to the player; defaults to ENEMY_ATTACK_DAMAGE
}

// A run has three stages. Each is a regular battle followed by a boss.
// Starting values, to tune by playtesting (see spec.md).
export interface Stage {
  battle: EnemyDef[];
  boss: EnemyDef;
}
export const STAGES: Stage[] = [
  {
    battle: [{ hp: 10, countdown: 4 }, { hp: 10, countdown: 5 }, { hp: 10, countdown: 6 }],
    boss: { hp: 30, countdown: 5, attack: 4 },
  },
  {
    battle: [{ hp: 12, countdown: 4 }, { hp: 12, countdown: 4 }, { hp: 12, countdown: 5 }],
    boss: { hp: 40, countdown: 5, attack: 5 },
  },
  {
    battle: [{ hp: 14, countdown: 3 }, { hp: 14, countdown: 4 }, { hp: 14, countdown: 5 }],
    boss: { hp: 50, countdown: 5, attack: 6 },
  },
];

// The player heals this much after each boss (up to PLAYER_START_HP), and not after regular battles.
export const POST_BOSS_HEAL = 10;

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
  yellow: { damage: 3 },
  blue: { slow: 1 },
};
// The brush strengthens direct spends: red burns longer and yellow hits harder.
// Mixes are unaffected for now.
export const BRUSH_RED_BURN_TURNS = 5;
export const BRUSH_YELLOW_EXTRA_DAMAGE = 1;

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
