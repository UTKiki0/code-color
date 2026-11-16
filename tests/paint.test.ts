import { describe, expect, it } from 'vitest';
import { takeTurn } from '../src/game/battle';
import { mix, spend, useMix } from '../src/game/paint';
import { createRng } from '../src/game/rng';
import { PAINT_MAX, RAINBOW_DAMAGE, type Weapon } from '../src/game/rules';
import { battleOn, cycleRng, enemy, withEdits } from './helpers';

const rng = createRng(1);
const full = { red: 9, yellow: 9, blue: 9 };
const RED_BOARD = withEdits({ '3,0': 'r', '3,1': 'r', '2,2': 'r' });
const WHITE_BOARD = withEdits({ '3,0': 'w', '3,1': 'w', '3,2': 'b', '2,2': 'w' });
const SWAP = [{ row: 2, col: 2 }, { row: 3, col: 2 }] as const;

// A battle with chosen paint, held mix, weapon, and enemies.
const state = (paint: Partial<typeof full>, enemies = [enemy(0), enemy(1)], weapon: Weapon = 'paintballGun') =>
  battleOn(RED_BOARD, enemies, { paint: { red: 0, yellow: 0, blue: 0, ...paint }, weapon });

describe('spend', () => {
  it('red burns for 1 damage over 3 turns and costs 3 paint', () => {
    const result = spend(state({ red: 5 }), 'red', 0);
    expect(result.ok).toBe(true);
    expect(result.state.paint.red).toBe(2);
    expect(result.state.enemies[0]!.burn).toEqual({ damage: 1, turnsLeft: 3 });
  });

  it('yellow deals 2 damage immediately', () => {
    const result = spend(state({ yellow: 3 }), 'yellow', 1);
    expect(result.state.enemies[1]!.hp).toBe(8);
    expect(result.state.paint.yellow).toBe(0);
  });

  it('blue adds 1 to the countdown', () => {
    const result = spend(state({ blue: 3 }), 'blue', 0);
    expect(result.state.enemies[0]!.countdown).toBe(5);
  });

  it('refreshes a burn instead of stacking it', () => {
    const burning = enemy(0, { burn: { damage: 1, turnsLeft: 1 } });
    const result = spend(state({ red: 3 }, [burning]), 'red', 0);
    expect(result.state.enemies[0]!.burn).toEqual({ damage: 1, turnsLeft: 3 });
  });

  it('is rejected without 3 paint, for a missing enemy, and for a dead enemy', () => {
    expect(spend(state({ red: 2 }), 'red', 0).ok).toBe(false);
    expect(spend(state({ red: 3 }), 'red', 99).ok).toBe(false);
    expect(spend(state({ red: 3 }, [enemy(0, { hp: 0 })]), 'red', 0).ok).toBe(false);
  });

  it('is not a turn: no countdown advances and no burn ticks', () => {
    const burning = enemy(1, { countdown: 2, burn: { damage: 1, turnsLeft: 2 } });
    const before = state({ yellow: 3 }, [enemy(0, { countdown: 3 }), burning]);
    const result = spend(before, 'yellow', 0);
    expect(result.state.enemies[0]!.countdown).toBe(3);
    expect(result.state.enemies[1]).toEqual(burning);
    expect(result.state.playerHp).toBe(before.playerHp);
  });

  it('can win the battle by killing the last enemy', () => {
    const result = spend(state({ yellow: 3 }, [enemy(0, { hp: 2 })]), 'yellow', 0);
    expect(result.state.status).toBe('won');
    expect(result.events).toContainEqual({ type: 'enemyDied', enemyId: 0 });
    expect(result.events.at(-1)).toEqual({ type: 'won' });
  });

  it('is allowed while a mix is held', () => {
    const held = { ...state({ red: 3 }), heldMix: 'green' as const };
    expect(spend(held, 'red', 0).ok).toBe(true);
  });

  it('is rejected once the battle is over', () => {
    expect(spend({ ...state({ red: 3 }), status: 'won' }, 'red', 0).ok).toBe(false);
  });
});

describe('brush', () => {
  it('makes a direct red spend burn for 5 turns', () => {
    const result = spend(state({ red: 3 }, undefined, 'brush'), 'red', 0);
    expect(result.state.enemies[0]!.burn).toEqual({ damage: 1, turnsLeft: 5 });
  });

  it('does not change other paints', () => {
    const result = spend(state({ yellow: 3 }, undefined, 'brush'), 'yellow', 0);
    expect(result.state.enemies[0]!.hp).toBe(8);
  });
});

describe('mix', () => {
  it.each([
    ['blue', 'yellow', 'green'],
    ['red', 'blue', 'purple'],
    ['yellow', 'red', 'orange'],
  ] as const)('%s + %s makes %s and consumes 9 of each', (a, b, result) => {
    const after = mix(state(full), a, b);
    expect(after.ok).toBe(true);
    expect(after.state.heldMix).toBe(result);
    expect(after.state.paint[a]).toBe(0);
    expect(after.state.paint[b]).toBe(0);
    expect(after.events).toEqual([{ type: 'mixed', mix: result }]);
  });

  it('requires both bottles to be full', () => {
    expect(mix(state({ red: 9, blue: 8 }), 'red', 'blue').ok).toBe(false);
  });

  it('rejects mixing a color with itself', () => {
    expect(mix(state(full), 'red', 'red').ok).toBe(false);
  });

  it('is rejected while a mix is already held', () => {
    const held = mix(state(full), 'red', 'blue').state;
    expect(mix(held, 'red', 'yellow').ok).toBe(false);
  });

  it('is not a turn and leaves countdowns and burn unchanged', () => {
    const burning = enemy(0, { countdown: 2, burn: { damage: 1, turnsLeft: 2 } });
    const result = mix(state(full, [burning]), 'red', 'blue');
    expect(result.state.enemies).toEqual([burning]);
  });
});

describe('using a mix on an enemy', () => {
  const held = (m: 'green' | 'purple' | 'orange', enemies = [enemy(0, { countdown: 1 }), enemy(1)]) =>
    ({ ...state({}, enemies), heldMix: m });

  it('green resets the countdown to its start', () => {
    const result = useMix(held('green'), { enemyId: 0 }, rng);
    expect(result.state.enemies[0]!.countdown).toBe(4);
    expect(result.state.heldMix).toBeNull();
  });

  it('purple adds 2 to the countdown and burns for 2 over 3 turns', () => {
    const result = useMix(held('purple'), { enemyId: 0 }, rng);
    expect(result.state.enemies[0]).toMatchObject({ countdown: 3, burn: { damage: 2, turnsLeft: 3 } });
  });

  it('orange burns for 3 over 3 turns and refreshes an existing burn', () => {
    const burning = enemy(0, { burn: { damage: 1, turnsLeft: 1 } });
    const result = useMix(held('orange', [burning]), { enemyId: 0 }, rng);
    expect(result.state.enemies[0]!.burn).toEqual({ damage: 3, turnsLeft: 3 });
  });

  it('is rejected with no held mix, or for a missing or dead enemy', () => {
    expect(useMix(state({}), { enemyId: 0 }, rng).ok).toBe(false);
    expect(useMix(held('green'), { enemyId: 99 }, rng).ok).toBe(false);
    expect(useMix(held('green', [enemy(0, { hp: 0 })]), { enemyId: 0 }, rng).ok).toBe(false);
  });

  it('leaves the other enemies untouched', () => {
    const before = held('purple');
    const result = useMix(before, { enemyId: 0 }, rng);
    expect(result.state.enemies[1]).toEqual(before.enemies[1]);
  });
});

describe('board lock', () => {
  it('rejects swipes while a mix is held, and allows them after it is used', () => {
    const held = mix(state(full), 'red', 'blue').state;
    const blocked = takeTurn(held, ...SWAP, rng);
    expect(blocked.ok).toBe(false);
    expect(blocked.state).toBe(held);

    const used = useMix(held, { enemyId: 0 }, rng).state;
    expect(takeTurn(used, ...SWAP, cycleRng([0.4, 0.7, 0.9])).ok).toBe(true);
  });
});

describe('rainbow', () => {
  // A purple mix (red + blue) is held; yellow is the third color.
  const rainbowState = (enemies = [enemy(0, { hp: 20 }), enemy(1, { hp: 20 }), enemy(2, { hp: 20 })]) =>
    ({ ...state({ yellow: 9 }, enemies), heldMix: 'purple' as const });

  it('damages every enemy for 6 and consumes the third bottle', () => {
    const result = useMix(rainbowState(), { color: 'yellow' }, cycleRng([0]));
    expect(result.ok).toBe(true);
    expect(result.state.enemies.map((e) => e.hp)).toEqual([20 - RAINBOW_DAMAGE, 14, 14]);
    expect(result.state.paint.yellow).toBe(0);
    expect(result.state.heldMix).toBeNull();
  });

  it('rolls a random mix effect separately for each enemy', () => {
    // Rolls 0, 0.4, 0.9 pick green, purple, orange.
    const before = rainbowState([
      enemy(0, { hp: 20, countdown: 1 }), enemy(1, { hp: 20, countdown: 1 }), enemy(2, { hp: 20, countdown: 1 }),
    ]);
    const result = useMix(before, { color: 'yellow' }, cycleRng([0, 0.4, 0.9]));
    const [a, b, c] = result.state.enemies;
    expect(a).toMatchObject({ countdown: 4, burn: null }); // green: reset
    expect(b).toMatchObject({ countdown: 3, burn: { damage: 2, turnsLeft: 3 } }); // purple
    expect(c).toMatchObject({ countdown: 1, burn: { damage: 3, turnsLeft: 3 } }); // orange
  });

  it('gives no random effect to enemies the damage kills', () => {
    const before = rainbowState([enemy(0, { hp: 6 }), enemy(1, { hp: 20, countdown: 1 })]);
    // One roll only: the dead enemy must not consume one. 0 picks green.
    const result = useMix(before, { color: 'yellow' }, cycleRng([0, 0.9]));
    expect(result.events).toContainEqual({ type: 'enemyDied', enemyId: 0 });
    expect(result.state.enemies).toHaveLength(1);
    expect(result.state.enemies[0]).toMatchObject({ id: 1, countdown: 4 }); // green reset
  });

  it('wins the battle when it kills every enemy', () => {
    const result = useMix(rainbowState([enemy(0, { hp: 6 })]), { color: 'yellow' }, rng);
    expect(result.state.status).toBe('won');
  });

  it('needs the third color: not a color already in the mix, and full', () => {
    expect(useMix(rainbowState(), { color: 'red' }, rng).ok).toBe(false); // red is in purple
    const notFull = { ...rainbowState(), paint: { red: 0, yellow: 8, blue: 0 } };
    expect(useMix(notFull, { color: 'yellow' }, rng).ok).toBe(false);
  });

  it('is not a turn: countdowns and burn do not advance', () => {
    const burning = enemy(0, { hp: 20, countdown: 2, burn: { damage: 1, turnsLeft: 2 } });
    const result = useMix(rainbowState([burning]), { color: 'yellow' }, cycleRng([0.9]));
    // Orange replaces the burn but nothing ticked: HP is only reduced by the rainbow damage.
    expect(result.state.enemies[0]).toMatchObject({ hp: 14, countdown: 2 });
  });
});

describe('roller', () => {
  it('white matches hit every living enemy for each bottle in the match', () => {
    const before = battleOn(WHITE_BOARD, [enemy(0, { hp: 20 }), enemy(1, { hp: 20 })], { weapon: 'roller' });
    const result = takeTurn(before, ...SWAP, cycleRng([0.4, 0.7, 0.9]));
    const hits = result.events.filter((e) => e.type === 'enemyDamaged');
    expect(hits).toHaveLength(2);
    expect(hits.every((e) => e.type === 'enemyDamaged' && e.amount === 3)).toBe(true);
  });
});

describe('weapons and white damage', () => {
  it.each([
    ['paintballGun', 6],
    ['brush', 3],
  ] as const)('%s deals %i for a 3-bottle white match', (weapon, amount) => {
    const before = battleOn(WHITE_BOARD, [enemy(0, { hp: 20 })], { weapon });
    const result = takeTurn(before, ...SWAP, cycleRng([0.4, 0.7, 0.9]));
    expect(result.state.enemies[0]!.hp).toBe(20 - amount);
  });
});

describe('limits', () => {
  it('paint never exceeds the maximum after spending and refilling', () => {
    const result = spend(state({ red: PAINT_MAX }), 'red', 0);
    expect(result.state.paint.red).toBe(PAINT_MAX - 3);
  });
});
