import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById } from '../src/game/characters';
import { createRng } from '../src/game/rng';
import { chooseWeapon, continueRun, createRun, updateBattle, type RunState } from '../src/game/run';
import { STAGES } from '../src/game/rules';
import { defaultUnlocked, goalsReached, unlock } from '../src/game/unlocks';

const rng = createRng(1);
const win = (run: RunState) => updateBattle(run, { ...run.battle, enemies: [], status: 'won' }, rng);
const moveOn = (run: RunState) => (run.phase === 'choosingWeapon' ? chooseWeapon(run, run.weaponOffer![0]!, rng) : continueRun(run, rng));
// Plays the run forward, winning every battle, until it reaches an encounter of the given kind.
const advanceTo = (kind: 'boss', stage: number) => {
  let run = createRun(createRng(3));
  while (!(run.encounter === kind && run.stage === stage)) run = moveOn(win(run));
  return run;
};

describe('the default characters', () => {
  it('are the ones with no unlock goal', () => {
    expect(defaultUnlocked()).toEqual(['splat']);
  });
});

describe('goals reached by a run', () => {
  it('none while a battle is being fought or after a regular battle', () => {
    const run = createRun(rng);
    expect(goalsReached(run)).toEqual([]);
    expect(goalsReached(win(run))).toEqual([]); // a regular battle is cleared
  });

  it('defeating the first boss reaches "bossDefeated" only', () => {
    expect(goalsReached(win(advanceTo('boss', 0)))).toEqual(['bossDefeated']);
  });

  it('defeating the second boss counts too', () => {
    expect(goalsReached(win(advanceTo('boss', 1)))).toEqual(['bossDefeated']);
  });

  it('winning the run reaches both goals', () => {
    const won = win(advanceTo('boss', STAGES.length - 1));
    expect(won.phase).toBe('won');
    expect(goalsReached(won)).toEqual(['bossDefeated', 'runWon']);
  });

  it('losing the run reaches nothing, even at a boss', () => {
    const boss = advanceTo('boss', 0);
    const lost = updateBattle(boss, { ...boss.battle, status: 'lost' }, rng);
    expect(goalsReached(lost)).toEqual([]);
  });
});

describe('unlocking', () => {
  it('a boss victory unlocks the brush character, and nobody else', () => {
    const result = unlock(defaultUnlocked(), ['bossDefeated']);
    expect(result.newly).toEqual(['stroke']);
    expect(result.unlocked).toEqual(['splat', 'stroke']);
  });

  it('a run win unlocks the roller character, and nobody else', () => {
    const result = unlock(defaultUnlocked(), ['runWon']);
    expect(result.newly).toEqual(['roll']);
    expect(result.unlocked).toEqual(['splat', 'roll']);
  });

  it('both goals unlock both, in the usual order', () => {
    const result = unlock(defaultUnlocked(), ['bossDefeated', 'runWon']);
    expect(result.unlocked).toEqual(CHARACTERS.map((c) => c.id));
    expect(result.newly).toEqual(['stroke', 'roll']);
  });

  it('a goal already met announces nothing new and changes nothing', () => {
    const result = unlock(['splat', 'stroke'], ['bossDefeated']);
    expect(result.newly).toEqual([]);
    expect(result.unlocked).toEqual(['splat', 'stroke']);
  });

  it('no goals changes nothing, and the input list is not modified', () => {
    const have = defaultUnlocked();
    expect(unlock(have, []).unlocked).toEqual(['splat']);
    unlock(have, ['runWon']);
    expect(have).toEqual(['splat']);
  });

  it('every locked character is unlocked by exactly one goal', () => {
    for (const c of CHARACTERS.filter((x) => x.unlock !== null)) {
      expect(unlock(defaultUnlocked(), [c.unlock!]).newly).toEqual([c.id]);
      expect(characterById(c.id).unlock).toBe(c.unlock);
    }
  });
});
