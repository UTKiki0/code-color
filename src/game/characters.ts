import type { PaintColor, Weapon } from './rules';

// The playable characters (Developer decision, 2026-11-17). Each starts every run with its own
// weapon and a small edge in starting paint. The names are working names until the Developer
// chooses real ones. Characters other than the first are locked until their goal is met.

export type CharacterId = 'splat' | 'stroke' | 'roll';

// What unlocks a character: defeating any boss in a run, or winning a full run.
export type UnlockGoal = 'bossDefeated' | 'runWon';

export interface Character {
  id: CharacterId;
  name: string;
  weapon: Weapon;
  startPaint: Record<PaintColor, number>; // stored paint at the start of a run
  unlock: UnlockGoal | null; // null: available from the start
  unlockHint: string; // shown on the select screen while the character is locked
}

export const CHARACTERS: Character[] = [
  {
    id: 'splat', name: 'Splat', weapon: 'paintballGun', startPaint: { red: 0, yellow: 0, blue: 0 },
    unlock: null, unlockHint: '',
  },
  {
    id: 'stroke', name: 'Stroke', weapon: 'brush', startPaint: { red: 3, yellow: 0, blue: 0 },
    unlock: 'bossDefeated', unlockHint: 'Defeat a boss to unlock',
  },
  {
    id: 'roll', name: 'Roll', weapon: 'roller', startPaint: { red: 0, yellow: 3, blue: 0 },
    unlock: 'runWon', unlockHint: 'Win a run to unlock',
  },
];

export const DEFAULT_CHARACTER: CharacterId = 'splat';

export const characterById = (id: CharacterId): Character => CHARACTERS.find((c) => c.id === id)!;
