import { describe, expect, it } from 'vitest';
import { takeTurn, type BattleState } from '../src/game/battle';
import { chooseWeapon, continueRun, createRun, drawWeaponOffer, updateBattle, type RunState } from '../src/game/run';
import { createRng } from '../src/game/rng';
import { PLAYER_START_HP, POST_BOSS_HEAL, STAGES, WEAPONS, type Weapon } from '../src/game/rules';
import { cycleRng, withEdits } from './helpers';

const rng = createRng(1);
const update = (run: RunState, battle: BattleState) => updateBattle(run, battle, rng);

// Leaves a cleared battle: continues, or after a boss takes the first offered weapon.
const moveOn = (run: RunState): RunState =>
  run.phase === 'choosingWeapon' ? chooseWeapon(run, run.weaponOffer![0]!, rng) : continueRun(run, rng);

// The run with the current battle replaced by a won one (all enemies dead), as if the player had won it.
const winBattle = (run: RunState, over: Partial<BattleState> = {}): RunState =>
  update(run, { ...run.battle, enemies: [], status: 'won', ...over });

// Wins the current battle and continues, `times` times.
const advance = (run: RunState, times: number, over: Partial<BattleState> = {}): RunState => {
  let current = run;
  for (let i = 0; i < times; i++) current = moveOn(winBattle(current, over));
  return current;
};

// Encounters before the stage's boss: stage s starts after the battles and bosses of earlier stages.
const bossIndex = (stage: number) => STAGES.slice(0, stage + 1).reduce((n, st) => n + st.battles.length, 0) + stage;
const ENCOUNTERS = STAGES.reduce((n, st) => n + st.battles.length + 1, 0);
const FIRST_BOSS = bossIndex(0);

describe('a new run', () => {
  it('starts at the first regular battle with full HP, no paint, and the paintball gun', () => {
    const run = createRun(createRng(5));
    expect(run).toMatchObject({ stage: 0, encounter: 'battle', phase: 'fighting' });
    expect(run.battle.enemies.map((e) => [e.hp, e.countdown])).toEqual(STAGES[0]!.battles[0]!.map((e) => [e.hp, e.countdown]));
    expect(run.battle.playerHp).toBe(PLAYER_START_HP);
    expect(run.battle.paint).toEqual({ red: 0, yellow: 0, blue: 0 });
    expect(run.battle.weapon).toBe('paintballGun');
  });
});

describe('run phases', () => {
  it('stays fighting while the battle is being played', () => {
    const run = createRun(rng);
    expect(update(run, { ...run.battle, playerHp: 12 }).phase).toBe('fighting');
  });

  it('is cleared when a regular battle is won, and lost when the player has no HP', () => {
    const run = createRun(rng);
    expect(winBattle(run).phase).toBe('cleared');
    expect(update(run, { ...run.battle, playerHp: 0, status: 'lost' }).phase).toBe('lost');
  });

  it('ignores battle updates once the run is not fighting', () => {
    const lost = update(createRun(rng), { ...createRun(rng).battle, status: 'lost' });
    expect(update(lost, { ...lost.battle, status: 'won', enemies: [] })).toBe(lost);
  });

  it('does not continue unless the battle was cleared', () => {
    const fighting = createRun(rng);
    expect(continueRun(fighting, rng)).toBe(fighting);
    const lost = update(fighting, { ...fighting.battle, status: 'lost' });
    expect(continueRun(lost, rng)).toBe(lost);
  });

  it('is won only by beating the final boss, and then cannot continue', () => {
    const atFinalBoss = advance(createRun(rng), ENCOUNTERS - 1);
    expect(atFinalBoss).toMatchObject({ stage: STAGES.length - 1, encounter: 'boss' });
    const won = winBattle(atFinalBoss);
    expect(won.phase).toBe('won');
    expect(continueRun(won, rng)).toBe(won);
    // Beating the first stage's boss does not win the run; it leads to a weapon choice.
    expect(winBattle(advance(createRun(rng), FIRST_BOSS)).phase).toBe('choosingWeapon');
  });
});

describe('the order of encounters', () => {
  it('goes through each stage\'s battles in order, then its boss, with that encounter\'s enemies', () => {
    let run = createRun(rng);
    const seen: string[] = [];
    const expectedSeen: string[] = [];
    STAGES.forEach((stage, i) => {
      stage.battles.forEach((_, round) => expectedSeen.push(`${i}:battle:${round}:3`));
      expectedSeen.push(`${i}:boss:0:1`);
    });
    for (let i = 0; i < ENCOUNTERS; i++) {
      seen.push(`${run.stage}:${run.encounter}:${run.round}:${run.battle.enemies.length}`);
      const expected = run.encounter === 'boss' ? [STAGES[run.stage]!.boss] : STAGES[run.stage]!.battles[run.round]!;
      expect(run.battle.enemies.map((e) => e.hp)).toEqual(expected.map((e) => e.hp));
      run = moveOn(winBattle(run));
    }
    expect(seen).toEqual(expectedSeen);
  });

  it('each stage has more than one regular battle, and a later round is tougher than an earlier one', () => {
    for (const stage of STAGES) {
      expect(stage.battles.length).toBeGreaterThan(1);
      const total = (round: number) => stage.battles[round]!.reduce((sum, e) => sum + e.hp, 0);
      expect(total(1)).toBeGreaterThan(total(0));
    }
  });

  it('carries HP and paint between the battles of a stage with no healing', () => {
    const first = winBattle(createRun(rng), { playerHp: 9, paint: { red: 4, yellow: 0, blue: 7 } });
    const second = moveOn(first);
    expect(second).toMatchObject({ stage: 0, encounter: 'battle', round: 1 });
    expect(second.battle.playerHp).toBe(9);
    expect(second.battle.paint).toEqual({ red: 4, yellow: 0, blue: 7 });
  });

  it('gives bosses their countdown and their own attack damage', () => {
    const boss = advance(createRun(rng), FIRST_BOSS).battle.enemies[0]!;
    expect(boss).toMatchObject({ hp: 30, countdown: 5, startCountdown: 5, attack: 4 });
  });

  it('makes a boss hit the player for its own damage when its countdown ends', () => {
    const atBoss = advance(createRun(rng), FIRST_BOSS);
    const nearAttack = { ...atBoss.battle, enemies: atBoss.battle.enemies.map((e) => ({ ...e, countdown: 1 })),
      board: withEdits({ '3,0': 'r', '3,1': 'r', '2,2': 'r' }) };
    const result = takeTurn(nearAttack, { row: 2, col: 2 }, { row: 3, col: 2 }, cycleRng([0.4, 0.7, 0.9]));
    expect(result.state.playerHp).toBe(PLAYER_START_HP - 4);
  });

  it('shortens regular enemy countdowns in later stages', () => {
    const firstTotal = STAGES[0]!.battles[0]!.reduce((sum, e) => sum + e.countdown, 0);
    const lastTotal = STAGES[2]!.battles[0]!.reduce((sum, e) => sum + e.countdown, 0);
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
    // The last regular battle of the stage, then the boss: neither battle heals.
    const lastBattle = advance(createRun(rng), FIRST_BOSS - 1, { playerHp: 7 });
    const next = continueRun(winBattle(lastBattle, { playerHp: 7 }), rng);
    expect(next.encounter).toBe('boss');
    expect(next.battle.playerHp).toBe(7);
  });

  it('heals 10 after a boss', () => {
    const atBoss = advance(createRun(rng), FIRST_BOSS);
    const next = moveOn(winBattle(atBoss, { playerHp: 5 }));
    expect(next).toMatchObject({ stage: 1, encounter: 'battle' });
    expect(next.battle.playerHp).toBe(5 + POST_BOSS_HEAL);
  });

  it('never heals above the maximum', () => {
    const atBoss = advance(createRun(rng), FIRST_BOSS);
    const next = moveOn(winBattle(atBoss, { playerHp: 15 }));
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
    const lost = update(createRun(rng), { ...createRun(rng).battle, status: 'lost', weapon: 'roller', playerHp: 0 });
    expect(lost.phase).toBe('lost');
    const fresh = createRun(rng);
    expect(fresh).toMatchObject({ stage: 0, encounter: 'battle', phase: 'fighting' });
    expect(fresh.battle).toMatchObject({ playerHp: PLAYER_START_HP, weapon: 'paintballGun', paint: { red: 0, yellow: 0, blue: 0 } });
  });
});

describe('the weapon offer', () => {
  const afterFirstBoss = () => winBattle(advance(createRun(rng), FIRST_BOSS));

  it('is drawn after each of the first two bosses', () => {
    const first = afterFirstBoss();
    expect(first.phase).toBe('choosingWeapon');
    expect(first.weaponOffer).toHaveLength(2);
    const secondBoss = advance(createRun(rng), bossIndex(1));
    expect(secondBoss).toMatchObject({ stage: 1, encounter: 'boss' });
    expect(winBattle(secondBoss).phase).toBe('choosingWeapon');
  });

  it('is not drawn after a regular battle or after the final boss', () => {
    const regular = winBattle(createRun(rng));
    expect(regular.phase).toBe('cleared');
    expect(regular.weaponOffer).toBeNull();
    const finalBoss = winBattle(advance(createRun(rng), ENCOUNTERS - 1));
    expect(finalBoss.phase).toBe('won');
    expect(finalBoss.weaponOffer).toBeNull();
  });

  it('offers two different, real weapons', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const offer = drawWeaponOffer(createRng(seed));
      expect(offer).toHaveLength(2);
      expect(new Set(offer).size).toBe(2);
      for (const weapon of offer) expect(WEAPONS).toContain(weapon);
    }
  });

  it('draws from all weapons, so any pair, including the held weapon, can come up', () => {
    const pairs = new Set<string>();
    const seen = new Set<Weapon>();
    for (let seed = 1; seed <= 200; seed++) {
      const offer = drawWeaponOffer(createRng(seed));
      pairs.add([...offer].sort().join('+'));
      offer.forEach((w) => seen.add(w));
    }
    expect(seen.size).toBe(WEAPONS.length);
    expect(pairs.size).toBe(3); // all three possible pairs
  });

  it('is repeatable with the same seed', () => {
    expect(drawWeaponOffer(createRng(7))).toEqual(drawWeaponOffer(createRng(7)));
  });

  it('cannot be skipped: continueRun does nothing while a weapon must be chosen', () => {
    const choosing = afterFirstBoss();
    expect(continueRun(choosing, rng)).toBe(choosing);
  });

  it('is cleared and the chosen weapon replaces the current one, moving on to the next battle', () => {
    const choosing = winBattle(advance(createRun(rng), FIRST_BOSS), { weapon: 'paintballGun', playerHp: 5 });
    const pick = choosing.weaponOffer!.find((w) => w !== 'paintballGun') ?? choosing.weaponOffer![0]!;
    const next = chooseWeapon(choosing, pick, rng);
    expect(next).toMatchObject({ stage: 1, encounter: 'battle', phase: 'fighting', weaponOffer: null });
    expect(next.battle.weapon).toBe(pick);
    expect(next.battle.playerHp).toBe(5 + POST_BOSS_HEAL); // the heal after a boss still happens
  });

  it('keeps the held weapon when the player chooses it', () => {
    // Find a seed whose offer includes the held paintball gun.
    for (let seed = 1; seed <= 50; seed++) {
      const r = createRng(seed);
      const run = updateBattle(advance(createRun(r), FIRST_BOSS), { ...advance(createRun(r), FIRST_BOSS).battle, enemies: [], status: 'won' }, r);
      if (run.weaponOffer?.includes('paintballGun')) {
        expect(chooseWeapon(run, 'paintballGun', r).battle.weapon).toBe('paintballGun');
        return;
      }
    }
    throw new Error('no seed offered the held weapon');
  });

  it('ignores a weapon that was not offered, and a choice made at the wrong time', () => {
    const choosing = afterFirstBoss();
    const notOffered = WEAPONS.find((w) => !choosing.weaponOffer!.includes(w))!;
    expect(chooseWeapon(choosing, notOffered, rng)).toBe(choosing);
    const fighting = createRun(rng);
    expect(chooseWeapon(fighting, 'brush', rng)).toBe(fighting);
  });
});
