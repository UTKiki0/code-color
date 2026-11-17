// Rule values in one place so balancing means editing numbers, not logic.
// All values are starting values to be tuned by playtesting (see spec.md).

export const BOARD_SIZE = 7;
export const MIN_MATCH = 3;

// Bottles that spawn on the board.
export type BaseBottle = 'red' | 'yellow' | 'blue' | 'white' | 'empty';

// Items (Developer decision, 2026-11-17): bigger matches leave an item on the board that the
// player taps to clear part of it. They never spawn and never match. The color items clear every
// bottle of one color, so there is one per matchable color.
export type ItemBottle = 'lineRow' | 'lineCol' | 'bomb' | 'colorRed' | 'colorYellow' | 'colorBlue' | 'colorWhite';
export type Bottle = BaseBottle | ItemBottle;
export const ITEM_BOTTLES: ItemBottle[] = ['lineRow', 'lineCol', 'bomb', 'colorRed', 'colorYellow', 'colorBlue', 'colorWhite'];
export const isItem = (bottle: Bottle): bottle is ItemBottle => (ITEM_BOTTLES as Bottle[]).includes(bottle);

// A run of 4 makes a line item (it clears its row or column), a T or L makes a bomb (it clears
// the area within BOMB_RADIUS of it, so 5x5), and a run of 5 or more makes a color item.
export const LINE_ITEM_RUN = 4;
export const COLOR_ITEM_RUN = 5;
export const BOMB_RADIUS = 2;
// Which color item clears which bottle. Empties make no item.
export const COLOR_ITEMS: Partial<Record<Bottle, ItemBottle>> = {
  red: 'colorRed', yellow: 'colorYellow', blue: 'colorBlue', white: 'colorWhite',
};
export const COLOR_ITEM_CLEARS: Partial<Record<ItemBottle, Bottle>> = {
  colorRed: 'red', colorYellow: 'yellow', colorBlue: 'blue', colorWhite: 'white',
};

// Spawn weights for new bottles. They are relative, so they need not sum to 1.
export const SPAWN_WEIGHTS: Record<BaseBottle, number> = {
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

// Every weapon, and how many are offered after a boss. The offer is drawn from all weapons, so it
// can include the weapon the player already holds.
export const WEAPONS: Weapon[] = ['paintballGun', 'brush', 'roller'];
export const WEAPON_OFFER_SIZE = 2;

export const PLAYER_START_HP = 20; // also the most HP the player can have
export const ENEMY_ATTACK_DAMAGE = 3; // a regular enemy's hit; bosses set their own

// --- Runs (checkpoint 6) ---

// An enemy as described in a stage. The countdown is in player turns (successful moves).
export interface EnemyDef {
  hp: number;
  countdown: number;
  attack?: number; // damage to the player; defaults to ENEMY_ATTACK_DAMAGE
  boss?: boolean; // some effects do more damage to a boss
  ability?: BossAbility; // bosses only; chosen per run, not listed in STAGES
}

// --- Boss abilities (checkpoint 9) ---

export type BossAbility = 'paintThief' | 'inkBlot' | 'shield' | 'heal';
export const BOSS_ABILITIES: BossAbility[] = ['paintThief', 'inkBlot', 'shield', 'heal'];
export const ABILITY_COUNTDOWN = 3; // turns between uses, counted from the start of the fight
export const BOSS_HEAL_AMOUNT = 4;
export const SHIELD_BREAK_TURNS = 3; // turns a shield stays down after paint hits the boss
export const INK_BLOT_COUNT = 4; // bottles turned into empties
export const PAINT_THIEF_AMOUNT = 3; // paint taken from the player's fullest bottle

// A run has three stages. Each is regular battles (rounds, in order) followed by a boss. The later
// round of a stage is a bit tougher than the earlier one (+2 HP each; Developer's choice, 2026-11-17).
// Starting values, to tune by playtesting (see spec.md).
export interface Stage {
  battles: EnemyDef[][]; // one list of enemies per regular battle, in the order they are fought
  boss: EnemyDef;
}
export const STAGES: Stage[] = [
  {
    battles: [
      [{ hp: 10, countdown: 4 }, { hp: 10, countdown: 5 }, { hp: 10, countdown: 6 }],
      [{ hp: 12, countdown: 4 }, { hp: 12, countdown: 5 }, { hp: 12, countdown: 6 }],
    ],
    boss: { hp: 30, countdown: 5, attack: 4, boss: true },
  },
  {
    battles: [
      [{ hp: 12, countdown: 4 }, { hp: 12, countdown: 4 }, { hp: 12, countdown: 5 }],
      [{ hp: 14, countdown: 4 }, { hp: 14, countdown: 4 }, { hp: 14, countdown: 5 }],
    ],
    boss: { hp: 40, countdown: 5, attack: 5, boss: true },
  },
  {
    battles: [
      [{ hp: 14, countdown: 3 }, { hp: 14, countdown: 4 }, { hp: 14, countdown: 5 }],
      [{ hp: 16, countdown: 3 }, { hp: 16, countdown: 4 }, { hp: 16, countdown: 5 }],
    ],
    boss: { hp: 50, countdown: 5, attack: 6, boss: true },
  },
];

// The player heals this much after each boss (up to PLAYER_START_HP), and not after regular battles.
export const POST_BOSS_HEAL = 10;

// --- Paint use (checkpoint 4) ---

export const SPEND_COST = 3; // paint used by one direct spend on an enemy

// An effect is data: damage now, countdown change, and/or a burn. One shared
// function (effects.ts) applies any effect to an enemy, so a new paint is a new entry here.
export interface Effect {
  damage?: number;
  bossDamage?: number; // damage instead of `damage` when the enemy is a boss
  allEnemies?: boolean; // used on one enemy, it hits every living enemy
  slow?: number; // turns added to the enemy's countdown
  burn?: { damage: number; turns: number }; // replaces any current burn
  healPlayer?: number; // HP the player regains (used on the player, not on an enemy)
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
export type EffectName = PaintColor | MixColor | 'rainbow';

// Which two paints make each mix. Each mix consumes PAINT_MAX of both.
export const MIX_RECIPES: Record<MixColor, [PaintColor, PaintColor]> = {
  green: ['blue', 'yellow'],
  purple: ['red', 'blue'],
  orange: ['red', 'yellow'],
};

// Mix effects (Developer decision, 2026-11-17): green heals the player, orange is a spread
// attack, purple slows and burns. Green is dropped on the player; the others on an enemy.
export const MIX_EFFECTS: Record<MixColor, Effect> = {
  green: { healPlayer: 5 },
  purple: { slow: 2, burn: { damage: 3, turns: 3 } },
  orange: { damage: 5, bossDamage: 15, allEnemies: true },
};

// Rainbow: a held mix dropped on the third paint's full bottle (which it consumes).
export const RAINBOW_EFFECT: Effect = {
  damage: 10, bossDamage: 20, allEnemies: true, slow: 3, burn: { damage: 2, turns: 3 },
};
