import { describe, expect, it } from 'vitest';
import { takeTurn, type BattleState } from '../src/game/battle';
import { continueRun, createRun, updateBattle, type RunState } from '../src/game/run';
import { createRng } from '../src/game/rng';
import { PLAYER_START_HP, POST_BOSS_HEAL, STAGES } from '../src/game/rules';
import { cycleRng, withEdits } from './helpers';

const rng = createRng(1);

// The run with the current battle replaced by a won one (all enemies dead), as if the player had won it.
const winBattle = (run: RunState, over: Partial<BattleState> = {}): RunState =>
  updateBattle(run, { ...run.battle, enemies: [], status: 'won', ...over });

// Wins the current battle and continues, `times` times.
const advance = (run: RunState, times: number, over: Partial<BattleState> = {}): RunState => {
  let current = run;
  for (let i = 0; i < times; i++) current = continueRun(winBattle(current, over), rng);
  return current;
};

describe('a new run', () => {
  it('starts at the first regular battle with full HP, no paint, and the paintball gun', () => {
    const run = createRun(createRng(5));
    expect(run).toMatchObject({ stage: 0, encounter: 'battle', phase: 'fighting' });
    expect(run.battle.enemies.map((e) => [e.hp, e.countdown])).toEqual(STAGES[0]!.battle.map((e) => [e.hp, e.countdown]));
    expect(run.battle.playerHp).toBe(PLAYER_START_HP);
    expect(run.battle.paint).toEqual({ red: 0, yellow: 0, blue: 0 });
    expect(run.battle.weapon).toBe('paintballGun');
  });
});

describe('run phases', () => {
  it('stays fighting while the battle is being played', () => {
    const run = createRun(rng);
    expect(updateBattle(run, { ...run.battle, playerHp: 12 }).phase).toBe('fighting');
  });

  it('is cleared when a regular battle is won, and lost when the player has no HP', () => {
    const run = createRun(rng);
    expect(winBattle(run).phase).toBe('cleared');
    expect(updateBattle(run, { ...run.battle, playerHp: 0, status: 'lost' }).phase).toBe('lost');
  });

  it('ignores battle updates once the run is not fighting', () => {
    const lost = updateBattle(createRun(rng), { ...createRun(rng).battle, status: 'lost' });
    expect(updateBattle(lost, { ...lost.battle, status: 'won', enemies: [] })).toBe(lost);
  });

  it('does not continue unless the battle was cleared', () => {
    const fighting = createRun(rng);
    expect(continueRun(fighting, rng)).toBe(fighting);
    const lost = updateBattle(fighting, { ...fighting.battle, status: 'lost' });
    expect(continueRun(lost, rng)).toBe(lost);
  });

  it('is won only by beating the final boss, and then cannot continue', () => {
    const atFinalBoss = advance(createRun(rng), STAGES.length * 2 - 1);
    expect(atFinalBoss).toMatchObject({ stage: STAGES.length - 1, encounter: 'boss' });
    const won = winBattle(atFinalBoss);
    expect(won.phase).toBe('won');
    expect(continueRun(won, rng)).toBe(won);
    // Beating the first stage's boss does not win the run.
    expect(winBattle(advance(createRun(rng), 1)).phase).toBe('cleared');
  });
});

describe('the order of encounters', () => {
  it('goes battle, boss, battle, boss, battle, boss with each stage\'s enemies', () => {
    let run = createRun(rng);
    const seen: string[] = [];
    for (let i = 0; i < STAGES.length * 2; i++) {
      seen.push(`${run.stage}:${run.encounter}:${run.battle.enemies.length}`);
      const expected = run.encounter === 'boss' ? [STAGES[run.stage]!.boss] : STAGES[run.stage]!.battle;
      expect(run.battle.enemies.map((e) => e.hp)).toEqual(expected.map((e) => e.hp));
      run = continueRun(winBattle(run), rng);
    }
    expect(seen).toEqual(['0:battle:3', '0:boss:1', '1:battle:3', '1:boss:1', '2:battle:3', '2:boss:1']);
  });

  it('gives bosses their countdown and their own attack damage', () => {
    const boss = advance(createRun(rng), 1).battle.enemies[0]!;
    expect(boss).toMatchObject({ hp: 30, countdown: 5, startCountdown: 5, attack: 4 });
  });

  it('makes a boss hit the player for its own damage when its countdown ends', () => {
    const atBoss = advance(createRun(rng), 1);
    const nearAttack = { ...atBoss.battle, enemies: atBoss.battle.enemies.map((e) => ({ ...e, countdown: 1 })),
      board: withEdits({ '3,0': 'r', '3,1': 'r', '2,2': 'r' }) };
    const result = takeTurn(nearAttack, { row: 2, col: 2 }, { row: 3, col: 2 }, cycleRng([0.4, 0.7, 0.9]));
    expect(result.state.playerHp).toBe(PLAYER_START_HP - 4);
  });

  it('shortens regular enemy countdowns in later stages', () => {
    const firstTotal = STAGES[0]!.battle.reduce((sum, e) => sum + e.countdown, 0);
    const lastTotal = STAGES[2]!.battle.reduce((sum, e) => sum + e.countdown, 0);
    expect(lastTotal).toBeLessThan(firstTotal);
  });
});

describe('what carries over', () => {
  it('keeps HP, paint, and weapon into the next battle', () => {
    const next = continueRun(
      winBattle(createRun(rng), { playerHp: 11, paint: { red: 4, yellow: 9, blue: 0 }, weapon: 'brush' }),
      rng,
    );
    expect(next.battle).toMatchObject({ playerHp: 11, paint: { red: 4, yellow: 9, blue: 0 }, weapon: 'brush' });
  });

  it('discards a mix still held when the battle ends, so the board is not locked next battle', () => {
    const next = continueRun(winBattle(createRun(rng), { heldMix: 'green' }), rng);
    expect(next.battle.heldMix).toBeNull();
  });

  it('does not heal after a regular battle', () => {
    const next = continueRun(winBattle(createRun(rng), { playerHp: 7 }), rng);
    expect(next.encounter).toBe('boss');
    expect(next.battle.playerHp).toBe(7);
  });

  it('heals 10 after a boss', () => {
    const atBoss = advance(createRun(rng), 1);
    const next = continueRun(winBattle(atBoss, { playerHp: 5 }), rng);
    expect(next).toMatchObject({ stage: 1, encounter: 'battle' });
    expect(next.battle.playerHp).toBe(5 + POST_BOSS_HEAL);
  });

  it('never heals above the maximum', () => {
    const atBoss = advance(createRun(rng), 1);
    const next = continueRun(winBattle(atBoss, { playerHp: 15 }), rng);
    expect(next.battle.playerHp).toBe(PLAYER_START_HP);
  });

  it('does not change the cleared battle\'s state', () => {
    const cleared = winBattle(createRun(rng), { paint: { red: 4, yellow: 0, blue: 0 } });
    continueRun(cleared, rng);
    expect(cleared.battle.paint.red).toBe(4);
    expect(cleared.phase).toBe('cleared');
  });
});

describe('starting a new run', () => {
  it('after a lost run gives a fresh run, with HP, paint, and weapon reset', () => {
    const lost = updateBattle(createRun(rng), { ...createRun(rng).battle, status: 'lost', weapon: 'roller', playerHp: 0 });
    expect(lost.phase).toBe('lost');
    const fresh = createRun(rng);
    expect(fresh).toMatchObject({ stage: 0, encounter: 'battle', phase: 'fighting' });
    expect(fresh.battle).toMatchObject({ playerHp: PLAYER_START_HP, weapon: 'paintballGun', paint: { red: 0, yellow: 0, blue: 0 } });
  });
});
