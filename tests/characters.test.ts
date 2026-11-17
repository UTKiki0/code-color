import { describe, expect, it } from 'vitest';
import { CHARACTERS, DEFAULT_CHARACTER, characterById } from '../src/game/characters';
import { createRng } from '../src/game/rng';
import { chooseWeapon, continueRun, createRun, updateBattle } from '../src/game/run';
import { PAINT_MAX, WEAPONS } from '../src/game/rules';

describe('the characters', () => {
  it('are three, with distinct ids and distinct starting weapons from the real weapons', () => {
    expect(CHARACTERS).toHaveLength(3);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(3);
    expect(new Set(CHARACTERS.map((c) => c.weapon)).size).toBe(3);
    for (const c of CHARACTERS) expect(WEAPONS).toContain(c.weapon);
  });

  it('have one available from the start, and two with different unlock goals', () => {
    expect(characterById(DEFAULT_CHARACTER).unlock).toBeNull();
    const locked = CHARACTERS.filter((c) => c.unlock !== null);
    expect(locked).toHaveLength(2);
    expect(new Set(locked.map((c) => c.unlock))).toEqual(new Set(['bossDefeated', 'runWon']));
    for (const c of locked) expect(c.unlockHint).not.toBe('');
  });

  it('start with sensible paint: never above the maximum, and only the first has none', () => {
    for (const c of CHARACTERS) {
      for (const amount of Object.values(c.startPaint)) expect(amount).toBeLessThanOrEqual(PAINT_MAX);
    }
    expect(characterById('splat').startPaint).toEqual({ red: 0, yellow: 0, blue: 0 });
  });
});

describe('a run for a character', () => {
  it('starts with that character\'s weapon and paint, and remembers who is playing', () => {
    for (const c of CHARACTERS) {
      const run = createRun(createRng(5), c.id);
      expect(run.character).toBe(c.id);
      expect(run.battle.weapon).toBe(c.weapon);
      expect(run.battle.paint).toEqual(c.startPaint);
    }
  });

  it('defaults to the first character', () => {
    const run = createRun(createRng(5));
    expect(run.character).toBe(DEFAULT_CHARACTER);
    expect(run.battle.weapon).toBe('paintballGun');
  });

  it('does not change which board a seed gives, so characters share the same battle', () => {
    expect(createRun(createRng(9), 'stroke').battle.board).toEqual(createRun(createRng(9), 'splat').battle.board);
  });

  it('keeps the character through every encounter and the weapon choice', () => {
    const rng = createRng(2);
    let run = createRun(rng, 'roll');
    for (let i = 0; i < 12 && run.phase !== 'won' && run.phase !== 'lost'; i++) {
      run = updateBattle(run, { ...run.battle, enemies: [], status: 'won' }, rng);
      run = run.phase === 'choosingWeapon' ? chooseWeapon(run, run.weaponOffer![0]!, rng) : continueRun(run, rng);
      expect(run.character).toBe('roll');
    }
  });

  it('carries the starting paint into later battles like any other paint', () => {
    const rng = createRng(2);
    const first = updateBattle(createRun(rng, 'stroke'), { ...createRun(rng, 'stroke').battle, enemies: [], status: 'won' }, rng);
    expect(continueRun(first, rng).battle.paint.red).toBe(3);
  });
});
