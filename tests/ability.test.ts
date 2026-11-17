import { describe, expect, it } from 'vitest';
import { createBattle, fullestBottle, takeTurn } from '../src/game/battle';
import { createRun, continueRun, drawBossAbilities, updateBattle } from '../src/game/run';
import { createRng } from '../src/game/rng';
import { ABILITY_COUNTDOWN, BOSS_ABILITIES, BOSS_HEAL_AMOUNT, PAINT_THIEF_AMOUNT, STAGES } from '../src/game/rules';
import { battleOn, cycleRng, enemy, withEdits } from './helpers';

// A red match (no white, so no damage to the boss) made by swapping (2,2) with (3,2).
// Refill values are chosen so refills do not make new matches (same as battle.test.ts).
const board = () => withEdits({ '3,0': 'r', '3,1': 'r', '2,2': 'r' });
const A = { row: 2, col: 2 }, B = { row: 3, col: 2 };
const refill = () => cycleRng([0.4, 0.7, 0.9]);

const healer = (over = {}) => enemy(0, { hp: 20, maxHp: 30, startCountdown: 99, countdown: 99, ability: { kind: 'heal', countdown: ABILITY_COUNTDOWN }, ...over });
const play = (b: ReturnType<typeof battleOn>) => takeTurn(b, A, B, refill());

describe('heal ability', () => {
  it('a boss with an ability starts its countdown at the full value', () => {
    const state = createBattle(createRng(1), { enemies: [{ ...STAGES[0]!.boss, ability: 'heal' }] });
    expect(state.enemies[0]!.ability).toEqual({ kind: 'heal', countdown: ABILITY_COUNTDOWN });
  });

  it('a boss without an ability has none', () => {
    expect(createBattle(createRng(1), { enemies: [STAGES[0]!.boss] }).enemies[0]!.ability).toBeNull();
  });

  it('counts down each turn without acting early', () => {
    const r = play(battleOn(board(), [healer()]));
    expect(r.ok).toBe(true);
    expect(r.state.enemies[0]!.ability!.countdown).toBe(ABILITY_COUNTDOWN - 1);
    expect(r.state.enemies[0]!.hp).toBe(20);
    expect(r.events.some((e) => e.type === 'bossHealed')).toBe(false);
  });

  it('heals when the countdown reaches 0, then resets', () => {
    const r = play(battleOn(board(), [healer({ ability: { kind: 'heal', countdown: 1 } })]));
    expect(r.state.enemies[0]!.hp).toBe(20 + BOSS_HEAL_AMOUNT);
    expect(r.state.enemies[0]!.ability!.countdown).toBe(ABILITY_COUNTDOWN);
    expect(r.events).toContainEqual({ type: 'bossHealed', enemyId: 0, amount: BOSS_HEAL_AMOUNT });
  });

  it('does not heal above max HP, and reports the amount actually healed', () => {
    const r = play(battleOn(board(), [healer({ hp: 28, ability: { kind: 'heal', countdown: 1 } })]));
    expect(r.state.enemies[0]!.hp).toBe(30);
    expect(r.events).toContainEqual({ type: 'bossHealed', enemyId: 0, amount: 2 });
  });

  it('heals after the boss attacks in the same turn', () => {
    const r = play(battleOn(board(), [healer({ countdown: 1, ability: { kind: 'heal', countdown: 1 } })]));
    const types = r.events.map((e) => e.type);
    expect(types.indexOf('enemyAttacked')).toBeLessThan(types.indexOf('bossHealed'));
  });

  it('a dead boss does not heal', () => {
    const r = play(battleOn(board(), [healer({ hp: 0, ability: { kind: 'heal', countdown: 1 } })]));
    expect(r.events.some((e) => e.type === 'bossHealed')).toBe(false);
  });

  it('a rejected move does not advance the ability countdown', () => {
    const state = battleOn(board(), [healer()]);
    const r = takeTurn(state, { row: 3, col: 3 }, { row: 3, col: 4 }, refill());
    expect(r.ok).toBe(false);
    expect(r.state.enemies[0]!.ability!.countdown).toBe(ABILITY_COUNTDOWN);
  });
});

const thief = (over = {}) => healer({ hp: 30, ability: { kind: 'paintThief', countdown: 1 }, ...over });
const withPaint = (paint: { red: number; yellow: number; blue: number }, boss = thief()) => battleOn(board(), [boss], { paint });

// A white match gains no paint, so the stored paint is exactly what the test sets.
const WHITE = withEdits({ '3,0': 'w', '3,1': 'w', '3,2': 'b', '2,2': 'w' });
const whiteWith = (paint: { red: number; yellow: number; blue: number }) => battleOn(WHITE, [thief()], { paint });
const playWhite = (b: ReturnType<typeof battleOn>) => takeTurn(b, A, B, refill());

describe('paint thief ability', () => {
  it('takes paint from the fullest bottle when its countdown reaches 0', () => {
    // The red match adds 3 red (0 to 3), so yellow at 8 stays the fullest.
    const r = play(withPaint({ red: 0, yellow: 8, blue: 2 }));
    expect(r.state.paint.yellow).toBe(8 - PAINT_THIEF_AMOUNT);
    expect(r.state.paint.blue).toBe(2);
    expect(r.events).toContainEqual({ type: 'paintStolen', enemyId: 0, color: 'yellow', amount: PAINT_THIEF_AMOUNT });
  });

  it('does not act before its countdown reaches 0', () => {
    const r = play(withPaint({ red: 0, yellow: 8, blue: 2 }, thief({ ability: { kind: 'paintThief', countdown: 2 } })));
    expect(r.state.paint.yellow).toBe(8);
    expect(r.events.some((e) => e.type === 'paintStolen')).toBe(false);
  });

  it('takes only what is there, and resets its countdown', () => {
    const r = playWhite(whiteWith({ red: 2, yellow: 0, blue: 0 }));
    expect(r.state.paint.red).toBe(0);
    expect(r.events).toContainEqual({ type: 'paintStolen', enemyId: 0, color: 'red', amount: 2 });
    expect(r.state.enemies[0]!.ability!.countdown).toBe(ABILITY_COUNTDOWN);
  });

  it('picks the fullest bottle, and breaks a tie at random', () => {
    expect(fullestBottle({ red: 1, yellow: 7, blue: 3 }, () => 0.99)).toBe('yellow');
    const tie = { red: 2, yellow: 6, blue: 6 };
    expect(fullestBottle(tie, () => 0)).toBe('yellow');
    expect(fullestBottle(tie, () => 0.99)).toBe('blue');
    expect(fullestBottle({ red: 4, yellow: 4, blue: 4 }, () => 0.5)).toBe('yellow');
  });

  it('does nothing, with no event, when the player has no paint, and still resets', () => {
    const r = playWhite(whiteWith({ red: 0, yellow: 0, blue: 0 }));
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.type === 'paintStolen')).toBe(false);
    expect(r.state.enemies[0]!.ability!.countdown).toBe(ABILITY_COUNTDOWN);
  });

  it('a dead paint thief does not steal', () => {
    const r = play(withPaint({ red: 0, yellow: 8, blue: 0 }, thief({ hp: 0 })));
    expect(r.state.paint.yellow).toBe(8);
  });
});

describe('boss abilities in a run', () => {
  it('draws different abilities without repeats', () => {
    // With all four built, three draws must be distinct; checked on the draw itself.
    for (let seed = 1; seed <= 30; seed++) {
      const drawn = drawBossAbilities(createRng(seed), 3);
      expect(new Set(drawn.filter(Boolean)).size).toBe(drawn.filter(Boolean).length);
    }
    expect(BOSS_ABILITIES).toHaveLength(4);
  });

  it('the run gives the boss its ability and keeps it for the whole run', () => {
    let run = createRun(createRng(3));
    const planned = run.bossAbilities;
    run = continueRun(updateBattle(run, { ...run.battle, enemies: [], status: 'won' }, createRng(1)), createRng(1));
    expect(run.encounter).toBe('boss');
    expect(run.battle.enemies[0]!.ability?.kind ?? null).toBe(planned[0]);
    expect(run.bossAbilities).toBe(planned);
  });

  it('regular enemies never get an ability', () => {
    expect(createRun(createRng(3)).battle.enemies.every((e) => e.ability === null)).toBe(true);
  });
});
