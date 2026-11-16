import type { BattleEvent, Enemy } from './battle';
import type { Effect, EffectName } from './rules';

/**
 * Applies one effect to an enemy (the enemy object is changed in place, so
 * callers pass a copy). Used for every paint and mix, so a new one is only a
 * new entry in rules.ts. Never advances countdowns or ticks burn.
 */
export function applyEffect(enemy: Enemy, effect: Effect, name: EffectName, events: BattleEvent[]): void {
  if (effect.damage) {
    enemy.hp -= effect.damage;
    events.push({ type: 'enemyDamaged', enemyId: enemy.id, amount: effect.damage, source: 'paint' });
  }
  if (effect.slow) enemy.countdown += effect.slow;
  if (effect.resetCountdown) enemy.countdown = enemy.startCountdown;
  // A new burn replaces the old one: it refreshes the duration and never stacks.
  if (effect.burn) enemy.burn = { damage: effect.burn.damage, turnsLeft: effect.burn.turns };
  events.push({ type: 'effectApplied', enemyId: enemy.id, effect: name });
}
