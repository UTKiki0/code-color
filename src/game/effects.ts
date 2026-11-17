import type { BattleEvent, Enemy } from './battle';
import { SHIELD_BREAK_TURNS, type Effect, type EffectName } from './rules';

/**
 * Applies one effect to an enemy (the enemy object is changed in place, so
 * callers pass a copy). Used for every paint and mix, so a new one is only a
 * new entry in rules.ts. Never advances countdowns or ticks burn.
 */
export function applyEffect(
  enemy: Enemy, effect: Effect, name: EffectName, events: BattleEvent[], source: 'paint' | 'rainbow' = 'paint',
): void {
  const damage = enemy.boss && effect.bossDamage ? effect.bossDamage : effect.damage;
  if (damage) {
    enemy.hp -= damage;
    events.push({ type: 'enemyDamaged', enemyId: enemy.id, amount: damage, source });
    if (enemy.hp <= 0) return; // an enemy the damage kills gets no slow or burn
  }
  if (effect.slow) enemy.countdown += effect.slow;
  // A new burn replaces the old one: it refreshes the duration and never stacks.
  if (effect.burn) enemy.burn = { damage: effect.burn.damage, turnsLeft: effect.burn.turns };
  events.push({ type: 'effectApplied', enemyId: enemy.id, effect: name });
}

/** A shield is up when the boss has the shield ability and its countdown is 0 (see Enemy.ability). */
export const isShielded = (enemy: Enemy): boolean => enemy.ability?.kind === 'shield' && enemy.ability.countdown === 0;

/**
 * Paint hitting a shielded boss breaks the shield for SHIELD_BREAK_TURNS turns. A shield that is
 * already down is left alone (it is not extended). Any other enemy is unaffected.
 */
export function breakShield(enemy: Enemy, events: BattleEvent[]): void {
  if (!isShielded(enemy)) return;
  enemy.ability = { kind: 'shield', countdown: SHIELD_BREAK_TURNS };
  events.push({ type: 'shieldBroken', enemyId: enemy.id });
}
