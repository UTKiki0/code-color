import { describe, expect, it } from 'vitest';
import { takeTurn } from '../src/game/battle';
import { findMatches } from '../src/game/board';
import { mix, spend, useMix } from '../src/game/paint';
import { createRng } from '../src/game/rng';
import { MIX_EFFECTS, PAINT_MAX, PLAYER_START_HP, RAINBOW_EFFECT, whiteMatchDamage, type Weapon } from '../src/game/rules';
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

  it('yellow deals 3 damage immediately', () => {
    const result = spend(state({ yellow: 3 }), 'yellow', 1);
    expect(result.state.enemies[1]!.hp).toBe(7);
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
    const result = spend(state({ yellow: 3 }, [enemy(0, { hp: 3 })]), 'yellow', 0);
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

  it('makes a direct yellow spend deal 1 extra damage', () => {
    const result = spend(state({ yellow: 3 }, undefined, 'brush'), 'yellow', 0);
    expect(result.state.enemies[0]!.hp).toBe(6); // 3 base plus 1
  });

  it('does not change blue', () => {
    const result = spend(state({ blue: 3 }, undefined, 'brush'), 'blue', 0);
    expect(result.state.enemies[0]!.countdown).toBe(5);
  });

  it('leaves red and yellow unchanged for the other weapons', () => {
    const gun = spend(state({ yellow: 3 }, undefined, 'paintballGun'), 'yellow', 0);
    expect(gun.state.enemies[0]!.hp).toBe(7);
    const roller = spend(state({ red: 3 }, undefined, 'roller'), 'red', 0);
    expect(roller.state.enemies[0]!.burn).toEqual({ damage: 1, turnsLeft: 3 });
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

describe('using a mix', () => {
  const held = (m: 'green' | 'purple' | 'orange', enemies = [enemy(0, { countdown: 1 }), enemy(1)], over = {}) =>
    ({ ...state({}, enemies), heldMix: m, ...over });

  it('green heals the player 5 HP when dropped on the player, and touches no enemy', () => {
    const before = held('green', undefined, { playerHp: 10 });
    const result = useMix(before, { player: true });
    expect(result.ok).toBe(true);
    expect(result.state.playerHp).toBe(10 + MIX_EFFECTS.green.healPlayer!);
    expect(result.state.heldMix).toBeNull();
    expect(result.state.enemies).toEqual(before.enemies);
    expect(result.events).toContainEqual({ type: 'playerHealed', amount: 5 });
  });

  it('green cannot heal above max HP, and reports the amount actually healed', () => {
    const result = useMix(held('green', undefined, { playerHp: PLAYER_START_HP - 2 }), { player: true });
    expect(result.state.playerHp).toBe(PLAYER_START_HP);
    expect(result.events).toContainEqual({ type: 'playerHealed', amount: 2 });
  });

  it('green is refused at full HP, so the mix is kept', () => {
    const result = useMix(held('green', undefined, { playerHp: PLAYER_START_HP }), { player: true });
    expect(result.ok).toBe(false);
    expect(result.state.heldMix).toBe('green');
  });

  it('green is refused on an enemy, and the other mixes are refused on the player', () => {
    expect(useMix(held('green', undefined, { playerHp: 5 }), { enemyId: 0 }).ok).toBe(false);
    expect(useMix(held('purple', undefined, { playerHp: 5 }), { player: true }).ok).toBe(false);
    expect(useMix(held('orange', undefined, { playerHp: 5 }), { player: true }).ok).toBe(false);
  });

  it('purple adds 2 to the countdown and burns for 3 over 3 turns, on the chosen enemy only', () => {
    const before = held('purple');
    const result = useMix(before, { enemyId: 0 });
    expect(result.state.enemies[0]).toMatchObject({ countdown: 3, burn: { damage: 3, turnsLeft: 3 } });
    expect(result.state.enemies[1]).toEqual(before.enemies[1]);
  });

  it('orange deals 5 damage to every living enemy, wherever it is dropped', () => {
    const enemies = [enemy(0, { hp: 10 }), enemy(1, { hp: 10 }), enemy(2, { hp: 10 })];
    const result = useMix(held('orange', enemies), { enemyId: 1 });
    expect(result.state.enemies.map((e) => e.hp)).toEqual([5, 5, 5]);
    expect(result.state.heldMix).toBeNull();
  });

  it('orange deals 15 to a boss', () => {
    const result = useMix(held('orange', [enemy(0, { hp: 30, maxHp: 30, boss: true })]), { enemyId: 0 });
    expect(result.state.enemies[0]!.hp).toBe(15);
  });

  it('orange kills what it can and wins the battle if that is everyone', () => {
    const result = useMix(held('orange', [enemy(0, { hp: 5 }), enemy(1, { hp: 5 })]), { enemyId: 0 });
    expect(result.events.filter((e) => e.type === 'enemyDied')).toHaveLength(2);
    expect(result.state.status).toBe('won');
  });

  it('is rejected with no held mix, or for a missing or dead enemy', () => {
    expect(useMix(state({}), { enemyId: 0 }).ok).toBe(false);
    expect(useMix(held('purple'), { enemyId: 99 }).ok).toBe(false);
    expect(useMix(held('purple', [enemy(0, { hp: 0 })]), { enemyId: 0 }).ok).toBe(false);
  });

  it('is not a turn: countdowns and burn do not advance', () => {
    const burning = enemy(0, { hp: 20, countdown: 2, burn: { damage: 1, turnsLeft: 2 } });
    const result = useMix(held('orange', [burning]), { enemyId: 0 });
    expect(result.state.enemies[0]).toMatchObject({ hp: 15, countdown: 2, burn: { damage: 1, turnsLeft: 2 } });
  });
});

describe('board lock', () => {
  it('rejects swipes while a mix is held, and allows them after it is used', () => {
    const held = mix(state(full), 'red', 'blue').state;
    const blocked = takeTurn(held, ...SWAP, rng);
    expect(blocked.ok).toBe(false);
    expect(blocked.state).toBe(held);

    const used = useMix(held, { enemyId: 0 }).state;
    expect(takeTurn(used, ...SWAP, cycleRng([0.4, 0.7, 0.9])).ok).toBe(true);
  });
});

describe('rainbow', () => {
  // A purple mix (red + blue) is held; yellow is the third color.
  const rainbowState = (enemies = [enemy(0, { hp: 30 }), enemy(1, { hp: 30 }), enemy(2, { hp: 30 })]) =>
    ({ ...state({ yellow: 9 }, enemies), heldMix: 'purple' as const });

  it('damages every enemy for 10 and consumes the third bottle and the mix', () => {
    const result = useMix(rainbowState(), { color: 'yellow' });
    expect(result.ok).toBe(true);
    expect(result.state.enemies.map((e) => e.hp)).toEqual([30 - RAINBOW_EFFECT.damage!, 20, 20]);
    expect(result.state.paint.yellow).toBe(0);
    expect(result.state.heldMix).toBeNull();
  });

  it('deals 20 to a boss', () => {
    const result = useMix(rainbowState([enemy(0, { hp: 50, maxHp: 50, boss: true })]), { color: 'yellow' });
    expect(result.state.enemies[0]!.hp).toBe(30);
  });

  it('slows every surviving enemy by 3 and burns it for 2 over 3 turns', () => {
    const result = useMix(rainbowState([enemy(0, { hp: 30, countdown: 2 }), enemy(1, { hp: 30, countdown: 4 })]), { color: 'yellow' });
    expect(result.state.enemies[0]).toMatchObject({ countdown: 5, burn: { damage: 2, turnsLeft: 3 } });
    expect(result.state.enemies[1]).toMatchObject({ countdown: 7, burn: { damage: 2, turnsLeft: 3 } });
  });

  it('gives no slow or burn to enemies the damage kills', () => {
    const result = useMix(rainbowState([enemy(0, { hp: 10 }), enemy(1, { hp: 30 })]), { color: 'yellow' });
    expect(result.events).toContainEqual({ type: 'enemyDied', enemyId: 0 });
    expect(result.events.filter((e) => e.type === 'effectApplied')).toEqual([{ type: 'effectApplied', enemyId: 1, effect: 'rainbow' }]);
    expect(result.state.enemies).toHaveLength(1);
  });

  it('wins the battle when it kills every enemy', () => {
    expect(useMix(rainbowState([enemy(0, { hp: 10 })]), { color: 'yellow' }).state.status).toBe('won');
  });

  it('needs the third color: not a color already in the mix, and full', () => {
    expect(useMix(rainbowState(), { color: 'red' }).ok).toBe(false); // red is in purple
    const notFull = { ...rainbowState(), paint: { red: 0, yellow: 8, blue: 0 } };
    expect(useMix(notFull, { color: 'yellow' }).ok).toBe(false);
  });

  it('is not a turn: it replaces a burn but nothing ticks', () => {
    const burning = enemy(0, { hp: 30, countdown: 2, burn: { damage: 1, turnsLeft: 2 } });
    const result = useMix(rainbowState([burning]), { color: 'yellow' });
    expect(result.state.enemies[0]).toMatchObject({ hp: 20, countdown: 5, burn: { damage: 2, turnsLeft: 3 } });
  });
});

// Swapping (2,2) down makes four whites in row 3, columns 0-3.
const FOUR_WHITES = withEdits({ '3,0': 'w', '3,1': 'w', '3,2': 'b', '3,3': 'w', '2,2': 'w' });

describe('roller', () => {
  const rollerHits = (board: ReturnType<typeof withEdits>) => {
    const before = battleOn(board, [enemy(0, { hp: 20 }), enemy(1, { hp: 20 })], { weapon: 'roller' });
    const result = takeTurn(before, ...SWAP, cycleRng([0.4, 0.7, 0.9]));
    return result.events.filter((e) => e.type === 'enemyDamaged');
  };

  it('a white match damages every living enemy, once each', () => {
    const hits = rollerHits(WHITE_BOARD); // a 3-bottle match
    expect(hits).toHaveLength(2);
    expect(hits.every((e) => e.type === 'enemyDamaged' && e.amount === 1)).toBe(true);
  });

  it('uses the same damage formula for a longer match', () => {
    expect(findMatches(FOUR_WHITES)).toEqual([]);
    const hits = rollerHits(FOUR_WHITES);
    expect(hits).toHaveLength(2);
    expect(hits.every((e) => e.type === 'enemyDamaged' && e.amount === 2)).toBe(true);
  });
});

describe('white damage', () => {
  it('is 1 for a match of three, plus 1 for each white beyond the third', () => {
    expect([3, 4, 5, 6, 7].map((size) => whiteMatchDamage(size, 'brush'))).toEqual([1, 2, 3, 4, 5]);
    expect([3, 4, 5, 6, 7].map((size) => whiteMatchDamage(size, 'roller'))).toEqual([1, 2, 3, 4, 5]);
  });

  it('gets the paintball gun\'s bonus of 1 on every match', () => {
    expect([3, 4, 5].map((size) => whiteMatchDamage(size, 'paintballGun'))).toEqual([2, 3, 4]);
  });

  it.each([
    ['paintballGun', 18, 17],
    ['brush', 19, 18],
  ] as const)('with the %s: 3 whites leave 20 HP at %i and 4 whites at %i', (weapon, afterThree, afterFour) => {
    const three = takeTurn(battleOn(WHITE_BOARD, [enemy(0, { hp: 20 })], { weapon }), ...SWAP, cycleRng([0.4, 0.7, 0.9]));
    expect(three.state.enemies[0]!.hp).toBe(afterThree);
    const four = takeTurn(battleOn(FOUR_WHITES, [enemy(0, { hp: 20 })], { weapon }), ...SWAP, cycleRng([0.4, 0.7, 0.9]));
    expect(four.state.enemies[0]!.hp).toBe(afterFour);
  });
});

describe('limits', () => {
  it('paint never exceeds the maximum after spending and refilling', () => {
    const result = spend(state({ red: PAINT_MAX }), 'red', 0);
    expect(result.state.paint.red).toBe(PAINT_MAX - 3);
  });
});
