import { createBattle, type BattleState } from './battle';
import type { Rng } from './rng';
import { POST_BOSS_HEAL, PLAYER_START_HP, STAGES } from './rules';

// A run: three stages, each a regular battle then a boss. This file decides which
// battle comes next and what carries over. The battle itself is played in battle.ts.

export type Encounter = 'battle' | 'boss';

// fighting: a battle is being played.
// cleared:  the battle was won and the run goes on; waiting for continueRun.
// won:      the final boss was beaten.
// lost:     the player ran out of HP.
export type RunPhase = 'fighting' | 'cleared' | 'won' | 'lost';

export interface RunState {
  stage: number; // index into STAGES
  encounter: Encounter;
  battle: BattleState;
  phase: RunPhase;
}

const enemiesFor = (stage: number, encounter: Encounter) =>
  encounter === 'boss' ? [STAGES[stage]!.boss] : STAGES[stage]!.battle;

/** A new run, at the first battle of the first stage. */
export function createRun(rng: Rng): RunState {
  return {
    stage: 0,
    encounter: 'battle',
    battle: createBattle(rng, { enemies: enemiesFor(0, 'battle') }),
    phase: 'fighting',
  };
}

/** Records the latest battle state (after any move or paint command) and updates the run phase. */
export function updateBattle(run: RunState, battle: BattleState): RunState {
  if (run.phase !== 'fighting') return run;
  let phase: RunPhase = 'fighting';
  if (battle.status === 'lost') phase = 'lost';
  else if (battle.status === 'won') {
    const finalBoss = run.encounter === 'boss' && run.stage === STAGES.length - 1;
    phase = finalBoss ? 'won' : 'cleared';
  }
  return { ...run, battle, phase };
}

/**
 * Moves from a cleared battle to the next one. HP, paint, and the weapon carry over. A mix still
 * held when the battle ends is discarded (Developer decision). The player heals after a boss but
 * not after a regular battle.
 */
export function continueRun(run: RunState, rng: Rng): RunState {
  if (run.phase !== 'cleared') return run;
  const afterBoss = run.encounter === 'boss';
  const stage = afterBoss ? run.stage + 1 : run.stage;
  const encounter: Encounter = afterBoss ? 'battle' : 'boss';
  const heal = afterBoss ? POST_BOSS_HEAL : 0;
  const battle = createBattle(rng, {
    enemies: enemiesFor(stage, encounter),
    playerHp: Math.min(PLAYER_START_HP, run.battle.playerHp + heal),
    paint: run.battle.paint,
    weapon: run.battle.weapon,
  });
  return { stage, encounter, battle, phase: 'fighting' };
}
