import { CHARACTERS, type CharacterId, type UnlockGoal } from './characters';
import type { RunState } from './run';

// Which characters a player has unlocked, and what unlocks the rest. This file only decides;
// saving the result is done in save/.

/** The characters available before any goal is met. */
export const defaultUnlocked = (): CharacterId[] => CHARACTERS.filter((c) => c.unlock === null).map((c) => c.id);

/**
 * The goals a run has just reached. Defeating any boss in a run counts (so does the final one),
 * and winning the run counts as the other goal. A run that is still being fought reaches none.
 */
export function goalsReached(run: RunState): UnlockGoal[] {
  const goals: UnlockGoal[] = [];
  if (run.phase === 'choosingWeapon' || run.phase === 'won') goals.push('bossDefeated');
  if (run.phase === 'won') goals.push('runWon');
  return goals;
}

/**
 * Adds the characters unlocked by the given goals. Returns the full list in the usual order and
 * which characters are new, so the screen can announce them. Goals already met change nothing.
 */
export function unlock(unlocked: CharacterId[], goals: UnlockGoal[]): { unlocked: CharacterId[]; newly: CharacterId[] } {
  const have = new Set(unlocked);
  const newly = CHARACTERS.filter((c) => c.unlock !== null && goals.includes(c.unlock) && !have.has(c.id)).map((c) => c.id);
  const all = new Set([...have, ...newly]);
  return { unlocked: CHARACTERS.filter((c) => all.has(c.id)).map((c) => c.id), newly };
}
