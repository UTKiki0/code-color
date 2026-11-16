import { describe, expect, it } from 'vitest';
import { createBattle, takeTurn, type BattleEvent } from '../src/game/battle';
import { findMatches, type Cell } from '../src/game/board';
import { createRng } from '../src/game/rng';
import { ENEMY_ATTACK_DAMAGE, FIRST_BATTLE_ENEMIES, PAINT_MAX, PLAYER_START_HP } from '../src/game/rules';
import { battleOn, cycleRng, enemy, withEdits } from './helpers';

// Refill values (blue, white, empty) chosen so refills do not make new matches.
const refill = () => cycleRng([0.4, 0.7, 0.9]);

// Crafted moves. Each swaps (2,2) with (3,2) to make a three-in-a-row in row 3, columns 0-2.
const RED_BOARD = withEdits({ '3,0': 'r', '3,1': 'r', '2,2': 'r' });
const WHITE_BOARD = withEdits({ '3,0': 'w', '3,1': 'w', '3,2': 'b', '2,2': 'w' });
const DOWN: [Cell, Cell] = [{ row: 2, col: 2 }, { row: 3, col: 2 }];

const damageEvents = (events: BattleEvent[]) => events.filter((e) => e.type === 'enemyDamaged');

describe('fixtures', () => {
  it('crafted boards start with no matches', () => {
    expect(findMatches(RED_BOARD)).toEqual([]);
    expect(findMatches(WHITE_BOARD)).toEqual([]);
  });
});

describe('new battle', () => {
  it('starts with full HP, no paint, and the first-battle enemies', () => {
    const state = createBattle(createRng(5));
    expect(state.status).toBe('playing');
    expect(state.playerHp).toBe(PLAYER_START_HP);
    expect(state.paint).toEqual({ red: 0, yellow: 0, blue: 0 });
    expect(state.enemies.map((e) => e.countdown)).toEqual(FIRST_BATTLE_ENEMIES.map((e) => e.countdown));
  });

  it('restart gives a fresh battle after the old one is over', () => {
    const over = battleOn(RED_BOARD, [], { status: 'won', playerHp: 3 });
    const fresh = createBattle(createRng(9));
    expect(fresh.status).toBe('playing');
    expect(fresh.playerHp).toBe(PLAYER_START_HP);
    expect(over.status).toBe('won'); // the old state is untouched
  });
});

describe('rejected moves', () => {
  it('change nothing and advance no countdown', () => {
    const state = battleOn(RED_BOARD, [enemy(0)]);
    const result = takeTurn(state, { row: 0, col: 0 }, { row: 0, col: 1 }, refill());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it('are the only outcome once the battle is over', () => {
    const state = battleOn(RED_BOARD, [enemy(0)], { status: 'lost' });
    expect(takeTurn(state, ...DOWN, refill()).ok).toBe(false);
  });
});

describe('paint', () => {
  it('collects one paint per bottle cleared', () => {
    const result = takeTurn(battleOn(RED_BOARD, [enemy(0)]), ...DOWN, refill());
    expect(result.ok).toBe(true);
    expect(result.state.paint).toEqual({ red: 3, yellow: 0, blue: 0 });
    expect(result.events).toContainEqual({ type: 'paintGained', color: 'red', amount: 3 });
  });

  it('never exceeds the maximum, and reports only what was stored', () => {
    const state = battleOn(RED_BOARD, [enemy(0)], { paint: { red: 8, yellow: 0, blue: 0 } });
    const result = takeTurn(state, ...DOWN, refill());
    expect(result.state.paint.red).toBe(PAINT_MAX);
    expect(result.events).toContainEqual({ type: 'paintGained', color: 'red', amount: 1 });
  });

  it('gives nothing for white bottles', () => {
    const result = takeTurn(battleOn(WHITE_BOARD, [enemy(0), enemy(1)]), ...DOWN, refill());
    expect(result.state.paint).toEqual({ red: 0, yellow: 0, blue: 0 });
  });
});

describe('white damage', () => {
  it('one match hits one random enemy for every bottle in it', () => {
    const result = takeTurn(battleOn(WHITE_BOARD, [enemy(0, { hp: 20 }), enemy(1, { hp: 20 })]), ...DOWN, refill());
    const hits = damageEvents(result.events);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ amount: 6, source: 'white' }); // 3 bottles x 2 with the paintball gun
  });

  it('counts an L-shaped match as one match', () => {
    // Swapping (2,0) down makes white in row 3 (cols 0-2) and column 0 (rows 3-5): 5 bottles.
    const board = withEdits({ '2,0': 'w', '3,0': 'y', '3,1': 'w', '3,2': 'w', '4,0': 'w', '5,0': 'w' });
    expect(findMatches(board)).toEqual([]);
    const state = battleOn(board, [enemy(0, { hp: 30 }), enemy(1, { hp: 30 })]);
    const result = takeTurn(state, { row: 2, col: 0 }, { row: 3, col: 0 }, refill());
    const hits = damageEvents(result.events);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ amount: 10 });
  });
});

describe('turn timing', () => {
  it('advances every countdown exactly once, even through a cascade', () => {
    // The cascade fixture from the board tests: a red match, then a blue match as bottles fall.
    const board = withEdits({ '3,0': 'r', '4,0': 'r', '5,0': 'w', '5,1': 'r', '4,1': 'b', '4,2': 'b' });
    const state = battleOn(board, [enemy(0, { countdown: 4 }), enemy(1, { countdown: 5 })]);
    const result = takeTurn(state, { row: 5, col: 0 }, { row: 5, col: 1 }, createRng(7));
    const steps = result.events.filter((e) => e.type === 'bottlesCleared');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(result.state.enemies.map((e) => e.countdown)).toEqual([3, 4]);
  });

  it('collects the paint from every cascade step', () => {
    const board = withEdits({ '3,0': 'r', '4,0': 'r', '5,0': 'w', '5,1': 'r', '4,1': 'b', '4,2': 'b' });
    const state = battleOn(board, [enemy(0, { hp: 99 })]);
    const result = takeTurn(state, { row: 5, col: 0 }, { row: 5, col: 1 }, createRng(7));
    const cleared = { red: 0, yellow: 0, blue: 0 };
    for (const e of result.events) {
      if (e.type !== 'bottlesCleared') continue;
      for (const c of e.cells) if (c.bottle in cleared) cleared[c.bottle as keyof typeof cleared]++;
    }
    for (const color of ['red', 'yellow', 'blue'] as const) {
      expect(result.state.paint[color]).toBe(Math.min(cleared[color], PAINT_MAX));
    }
    expect(result.state.paint.red).toBeGreaterThanOrEqual(3);
    expect(result.state.paint.blue).toBeGreaterThanOrEqual(3);
  });
});

describe('enemy attacks', () => {
  it('attack at zero, damage the player, and reset their countdown', () => {
    const state = battleOn(RED_BOARD, [enemy(0, { countdown: 1 })]);
    const result = takeTurn(state, ...DOWN, refill());
    expect(result.state.playerHp).toBe(PLAYER_START_HP - ENEMY_ATTACK_DAMAGE);
    expect(result.state.enemies[0]!.countdown).toBe(4);
    expect(result.events).toContainEqual({ type: 'enemyAttacked', enemyId: 0, damage: ENEMY_ATTACK_DAMAGE });
  });

  it('do not attack while their countdown is above zero', () => {
    const result = takeTurn(battleOn(RED_BOARD, [enemy(0, { countdown: 2 })]), ...DOWN, refill());
    expect(result.state.playerHp).toBe(PLAYER_START_HP);
    expect(result.state.enemies[0]!.countdown).toBe(1);
  });
});

describe('burn', () => {
  it('ticks once per turn and ends after its last turn', () => {
    const burning = enemy(0, { hp: 10, burn: { damage: 1, turnsLeft: 2 } });
    const first = takeTurn(battleOn(RED_BOARD, [burning]), ...DOWN, refill());
    expect(first.state.enemies[0]).toMatchObject({ hp: 9, burn: { damage: 1, turnsLeft: 1 } });
    const second = takeTurn({ ...first.state, board: RED_BOARD }, ...DOWN, refill());
    expect(second.state.enemies[0]).toMatchObject({ hp: 8, burn: null });
  });

  it('can kill an enemy before it attacks', () => {
    const doomed = enemy(0, { hp: 1, countdown: 1, burn: { damage: 1, turnsLeft: 2 } });
    const state = battleOn(RED_BOARD, [doomed, enemy(1, { countdown: 5 })]);
    const result = takeTurn(state, ...DOWN, refill());
    expect(result.events).toContainEqual({ type: 'enemyDied', enemyId: 0 });
    expect(result.events.some((e) => e.type === 'enemyAttacked')).toBe(false);
    expect(result.state.playerHp).toBe(PLAYER_START_HP);
    expect(result.state.enemies.map((e) => e.id)).toEqual([1]);
  });
});

describe('winning and losing', () => {
  it('wins when the last enemy dies, with no attack that turn', () => {
    const state = battleOn(WHITE_BOARD, [enemy(0, { hp: 6, countdown: 1 })]);
    const result = takeTurn(state, ...DOWN, refill());
    expect(result.state.status).toBe('won');
    expect(result.state.enemies).toEqual([]);
    expect(result.state.playerHp).toBe(PLAYER_START_HP);
    expect(result.events.at(-1)).toEqual({ type: 'won' });
  });

  it('loses when the player reaches zero HP', () => {
    const state = battleOn(RED_BOARD, [enemy(0, { countdown: 1 })], { playerHp: ENEMY_ATTACK_DAMAGE });
    const result = takeTurn(state, ...DOWN, refill());
    expect(result.state.status).toBe('lost');
    expect(result.state.playerHp).toBe(0);
    expect(result.events.at(-1)).toEqual({ type: 'lost' });
  });
});
