import { removeDeadEnemies, statusFor, type BattleEvent, type BattleState, type TurnResult } from './battle';
import { applyEffect, breakShield } from './effects';
import {
  BRUSH_RED_BURN_TURNS, BRUSH_YELLOW_EXTRA_DAMAGE, MIX_COLORS, MIX_EFFECTS, MIX_RECIPES, PAINT_EFFECTS, PAINT_MAX,
  PLAYER_START_HP, RAINBOW_EFFECT, SPEND_COST, type Effect, type PaintColor,
} from './rules';

// Paint commands. None of them is a turn: they never advance countdowns or tick burn.

const reject = (state: BattleState): TurnResult => ({ ok: false, state, events: [] });

/** Removes dead enemies, checks win/lose, and builds the result. */
function finish(state: BattleState, over: Partial<BattleState>, events: BattleEvent[]): TurnResult {
  const enemies = removeDeadEnemies(over.enemies ?? state.enemies, events);
  const status = statusFor(enemies, state.playerHp);
  if (status !== 'playing') events.push({ type: status });
  return { ok: true, state: { ...state, ...over, enemies, status }, events };
}

/** Direct spend of 3 paint on one enemy. Allowed while a mix is held. */
export function spend(state: BattleState, color: PaintColor, enemyId: number): TurnResult {
  if (state.status !== 'playing' || state.paint[color] < SPEND_COST) return reject(state);
  const enemies = state.enemies.map((e) => ({ ...e }));
  const target = enemies.find((e) => e.id === enemyId && e.hp > 0);
  if (!target) return reject(state);

  let effect: Effect = PAINT_EFFECTS[color];
  if (state.weapon === 'brush') {
    // The brush strengthens direct red and yellow spends.
    if (color === 'red' && effect.burn) {
      effect = { ...effect, burn: { ...effect.burn, turns: BRUSH_RED_BURN_TURNS } };
    } else if (color === 'yellow' && effect.damage) {
      effect = { ...effect, damage: effect.damage + BRUSH_YELLOW_EXTRA_DAMAGE };
    }
  }
  const events: BattleEvent[] = [{ type: 'paintSpent', color, amount: SPEND_COST }];
  applyEffect(target, effect, color, events);
  breakShield(target, events);
  const paint = { ...state.paint, [color]: state.paint[color] - SPEND_COST };
  return finish(state, { enemies, paint }, events);
}

/** Mixes two full paint bottles into a held mix, consuming PAINT_MAX of each. */
export function mix(state: BattleState, a: PaintColor, b: PaintColor): TurnResult {
  if (state.status !== 'playing' || state.heldMix || a === b) return reject(state);
  if (state.paint[a] < PAINT_MAX || state.paint[b] < PAINT_MAX) return reject(state);
  const result = MIX_COLORS.find((m) => MIX_RECIPES[m].includes(a) && MIX_RECIPES[m].includes(b));
  if (!result) return reject(state);

  const paint = { ...state.paint, [a]: 0, [b]: 0 };
  return {
    ok: true,
    state: { ...state, paint, heldMix: result },
    events: [{ type: 'mixed', mix: result }],
  };
}

/**
 * Uses the held mix. Green goes on the player (it heals); the other mixes go on an enemy (an
 * effect with allEnemies hits every living enemy). Dropping a mix on the third paint's full
 * bottle makes rainbow instead.
 */
export function useMix(
  state: BattleState,
  target: { enemyId: number } | { color: PaintColor } | { player: true },
): TurnResult {
  const held = state.heldMix;
  if (state.status !== 'playing' || !held) return reject(state);
  const effect = MIX_EFFECTS[held];
  const enemies = state.enemies.map((e) => ({ ...e }));

  if ('player' in target) {
    // Refused at full HP, so a mix is not wasted by accident.
    if (!effect.healPlayer || state.playerHp >= PLAYER_START_HP) return reject(state);
    const amount = Math.min(effect.healPlayer, PLAYER_START_HP - state.playerHp);
    const events: BattleEvent[] = [{ type: 'mixUsed', mix: held }, { type: 'playerHealed', amount }];
    return finish(state, { playerHp: state.playerHp + amount, heldMix: null }, events);
  }

  if ('enemyId' in target) {
    const chosen = enemies.find((e) => e.id === target.enemyId && e.hp > 0);
    if (!chosen || effect.healPlayer) return reject(state);
    const events: BattleEvent[] = [{ type: 'mixUsed', mix: held }];
    for (const enemy of effect.allEnemies ? enemies.filter((e) => e.hp > 0) : [chosen]) {
      applyEffect(enemy, effect, held, events);
      breakShield(enemy, events);
    }
    return finish(state, { enemies, heldMix: null }, events);
  }

  // Rainbow: the target must be the one paint not in the held mix, and it must be full.
  if (MIX_RECIPES[held].includes(target.color) || state.paint[target.color] < PAINT_MAX) {
    return reject(state);
  }
  const events: BattleEvent[] = [{ type: 'rainbow' }];
  for (const enemy of enemies) {
    applyEffect(enemy, RAINBOW_EFFECT, 'rainbow', events, 'rainbow');
    breakShield(enemy, events);
  }
  const paint = { ...state.paint, [target.color]: 0 };
  return finish(state, { enemies, heldMix: null, paint }, events);
}
