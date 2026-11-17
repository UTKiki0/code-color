import { createBattle, type BattleState } from './battle';
import type { Rng } from './rng';
import { BOSS_ABILITIES, POST_BOSS_HEAL, PLAYER_START_HP, STAGES, WEAPONS, WEAPON_OFFER_SIZE, type BossAbility, type Weapon } from './rules';

// A run: three stages, each some regular battles then a boss. This file decides which
// battle comes next and what carries over. The battle itself is played in battle.ts.

export type Encounter = 'battle' | 'boss';

// fighting:       a battle is being played.
// cleared:        a regular battle was won; waiting for continueRun.
// choosingWeapon: a boss (not the last) was beaten; the player must choose from weaponOffer.
// won:            the final boss was beaten.
// lost:           the player ran out of HP.
export type RunPhase = 'fighting' | 'cleared' | 'choosingWeapon' | 'won' | 'lost';

export interface RunState {
  stage: number; // index into STAGES
  encounter: Encounter;
  round: number; // which regular battle of the stage (0 for the first); 0 during a boss
  battle: BattleState;
  phase: RunPhase;
  weaponOffer: Weapon[] | null; // the weapons to choose from, only while choosingWeapon
  bossAbilities: BossAbility[]; // each stage's boss ability, fixed for the run
}

const enemiesFor = (stage: number, encounter: Encounter, round: number, bossAbilities: BossAbility[]) =>
  encounter === 'boss'
    ? [{ ...STAGES[stage]!.boss, ability: bossAbilities[stage] }]
    : STAGES[stage]!.battles[round]!;

/** Where the run goes after the current encounter: the next round, the stage's boss, or the next stage. */
export function nextEncounter(run: Pick<RunState, 'stage' | 'encounter' | 'round'>): Pick<RunState, 'stage' | 'encounter' | 'round'> {
  if (run.encounter === 'boss') return { stage: run.stage + 1, encounter: 'battle', round: 0 };
  if (run.round + 1 < STAGES[run.stage]!.battles.length) return { stage: run.stage, encounter: 'battle', round: run.round + 1 };
  return { stage: run.stage, encounter: 'boss', round: 0 };
}

/** Gives each boss a different ability, drawn at random; one of the four is left out. */
export function drawBossAbilities(rng: Rng, count: number = STAGES.length): BossAbility[] {
  const pool = [...BOSS_ABILITIES];
  const drawn: BossAbility[] = [];
  while (drawn.length < count) drawn.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  return drawn;
}

/** A new run, at the first battle of the first stage. */
export function createRun(rng: Rng): RunState {
  const battle = createBattle(rng, { enemies: enemiesFor(0, 'battle', 0, []) });
  // Drawn after the first board so the abilities do not change which board a seed gives.
  return { stage: 0, encounter: 'battle', round: 0, battle, phase: 'fighting', weaponOffer: null, bossAbilities: drawBossAbilities(rng) };
}

/** Draws distinct weapons at random from all weapons for the player to choose between. */
export function drawWeaponOffer(rng: Rng, count: number = WEAPON_OFFER_SIZE): Weapon[] {
  const pool = [...WEAPONS];
  const offer: Weapon[] = [];
  while (offer.length < count && pool.length > 0) {
    offer.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  }
  return offer;
}

/**
 * Records the latest battle state (after any move or paint command) and updates the run phase.
 * Beating a boss other than the last one draws the weapon offer, which is why this takes an rng.
 */
export function updateBattle(run: RunState, battle: BattleState, rng: Rng): RunState {
  if (run.phase !== 'fighting') return run;
  if (battle.status === 'lost') return { ...run, battle, phase: 'lost' };
  if (battle.status === 'won') {
    if (run.encounter === 'battle') return { ...run, battle, phase: 'cleared' };
    if (run.stage === STAGES.length - 1) return { ...run, battle, phase: 'won' };
    return { ...run, battle, phase: 'choosingWeapon', weaponOffer: drawWeaponOffer(rng) };
  }
  return { ...run, battle };
}

/**
 * Moves from a cleared battle to the next one. HP, paint, and the weapon carry over. A mix still
 * held when the battle ends is discarded (Developer decision). The player heals after a boss but
 * not after a regular battle.
 */
export function continueRun(run: RunState, rng: Rng): RunState {
  if (run.phase !== 'cleared') return run;
  const afterBoss = run.encounter === 'boss';
  const next = nextEncounter(run);
  const heal = afterBoss ? POST_BOSS_HEAL : 0;
  const battle = createBattle(rng, {
    enemies: enemiesFor(next.stage, next.encounter, next.round, run.bossAbilities),
    playerHp: Math.min(PLAYER_START_HP, run.battle.playerHp + heal),
    paint: run.battle.paint,
    weapon: run.battle.weapon,
  });
  return { ...next, battle, phase: 'fighting', weaponOffer: null, bossAbilities: run.bossAbilities };
}

/**
 * Takes one of the offered weapons (it replaces the current weapon) and moves on to the next
 * battle. Choosing the weapon already held keeps it. Anything not on offer is ignored.
 */
export function chooseWeapon(run: RunState, weapon: Weapon, rng: Rng): RunState {
  if (run.phase !== 'choosingWeapon' || !run.weaponOffer?.includes(weapon)) return run;
  const armed: RunState = { ...run, phase: 'cleared', weaponOffer: null, battle: { ...run.battle, weapon } };
  return continueRun(armed, rng);
}
