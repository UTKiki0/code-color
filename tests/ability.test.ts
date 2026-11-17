import { describe, expect, it } from 'vitest';
import { blotBoard, findMatches, hasValidMove } from '../src/game/board';
import { spend, useMix } from '../src/game/paint';
import { createBattle, fullestBottle, takeTurn } from '../src/game/battle';
import { createRun, continueRun, drawBossAbilities, updateBattle } from '../src/game/run';
import { createRng } from '../src/game/rng';
import { ABILITY_COUNTDOWN, BOSS_ABILITIES, BOSS_HEAL_AMOUNT, INK_BLOT_COUNT, PAINT_THIEF_AMOUNT, SHIELD_BREAK_TURNS, STAGES, type Bottle } from '../src/game/rules';
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

const blotter = (over = {}) => healer({ hp: 30, ability: { kind: 'inkBlot', countdown: 1 }, ...over });

describe('ink blot ability', () => {
  it('turns exactly INK_BLOT_COUNT filled bottles into empties, and reports them', () => {
    const r = blotBoard(withEdits({}), INK_BLOT_COUNT, createRng(7));
    const before = withEdits({}).flat().filter((x) => x === 'empty').length;
    expect(r.cells).toHaveLength(INK_BLOT_COUNT);
    expect(new Set(r.cells.map((c) => `${c.row},${c.col}`)).size).toBe(INK_BLOT_COUNT);
    if (!r.shuffled) {
      expect(r.board.flat().filter((x) => x === 'empty').length).toBe(before + INK_BLOT_COUNT);
      for (const c of r.cells) expect(r.board[c.row]![c.col]).toBe('empty');
    }
  });

  it('never leaves a match on the board and always leaves a valid move (many seeds)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = blotBoard(withEdits({}), INK_BLOT_COUNT, createRng(seed));
      expect(findMatches(r.board)).toEqual([]);
      expect(hasValidMove(r.board)).toBe(true);
    }
  });

  it('picks different bottles for different seeds', () => {
    const picks = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      picks.add(blotBoard(withEdits({}), INK_BLOT_COUNT, createRng(seed)).cells.map((c) => `${c.row},${c.col}`).sort().join(';'));
    }
    expect(picks.size).toBeGreaterThan(10);
  });

  it('does not change the original board', () => {
    const original = withEdits({});
    const copy = original.map((row) => [...row]);
    blotBoard(original, INK_BLOT_COUNT, createRng(3));
    expect(original).toEqual(copy);
  });

  it('only blots the filled bottles that exist when there are fewer than the count', () => {
    const almostEmpty: Bottle[][] = withEdits({}).map((row) => row.map((): Bottle => 'empty'));
    almostEmpty[0]![0] = 'red'; almostEmpty[6]![6] = 'blue';
    // Empties would match, so only the cell count is checked here.
    expect(blotBoard(almostEmpty, INK_BLOT_COUNT, createRng(1)).cells).toHaveLength(2);
  });

  it('blots the board when its countdown reaches 0, and the state keeps the new board', () => {
    const r = play(battleOn(board(), [blotter()]));
    const event = r.events.find((e) => e.type === 'inkBlotted');
    expect(event).toMatchObject({ type: 'inkBlotted', enemyId: 0 });
    expect(r.state.enemies[0]!.ability!.countdown).toBe(ABILITY_COUNTDOWN);
    expect(findMatches(r.state.board)).toEqual([]);
    expect(hasValidMove(r.state.board)).toBe(true);
    // The blotted cells are empties on the board unless the board then had to be shuffled.
    if (!r.events.some((e) => e.type === 'shuffled') && event?.type === 'inkBlotted') {
      for (const c of event.cells) expect(r.state.board[c.row]![c.col]).toBe('empty');
    }
  });

  it('does not act before its countdown reaches 0', () => {
    const r = play(battleOn(board(), [blotter({ ability: { kind: 'inkBlot', countdown: 2 } })]));
    expect(r.events.some((e) => e.type === 'inkBlotted')).toBe(false);
  });

  it('a dead boss does not blot', () => {
    const r = play(battleOn(board(), [blotter({ hp: 0 })]));
    expect(r.events.some((e) => e.type === 'inkBlotted')).toBe(false);
  });
});

// A shield boss; countdown 0 is up, above 0 is the turns until it returns.
const shielded = (countdown = 0, over = {}) => healer({ hp: 30, ability: { kind: 'shield', countdown }, ...over });
// Three whites in a row made by swapping (2,2) with (3,2): one white match of 3 (base damage 1).
// Four whites would be 2, so a second board gives a damage-2 match to show the halving.
const WHITE3 = withEdits({ '3,0': 'w', '3,1': 'w', '3,2': 'b', '2,2': 'w' });
const WHITE4 = withEdits({ '3,0': 'w', '3,1': 'w', '3,2': 'b', '3,3': 'w', '2,2': 'w' });
const whiteDamage = (r: ReturnType<typeof play>) => r.events.flatMap((e) => (e.type === 'enemyDamaged' && e.source === 'white' ? [e.amount] : []));
const gun = { weapon: 'paintballGun' as const };

describe('shield ability', () => {
  it('a shield boss starts with its shield up and no timer', () => {
    const state = createBattle(createRng(1), { enemies: [{ ...STAGES[0]!.boss, ability: 'shield' }] });
    expect(state.enemies[0]!.ability).toEqual({ kind: 'shield', countdown: 0 });
  });

  it('halves white damage while up (rounded down, at least 1)', () => {
    // A 4-white match does 2 damage with the gun's base rules plus its bonus; compare shielded and not.
    const plain = takeTurn(battleOn(WHITE4, [shielded(0, { ability: null })], gun), A, B, refill());
    const shield = takeTurn(battleOn(WHITE4, [shielded(0)], gun), A, B, refill());
    const [full] = whiteDamage(plain), [half] = whiteDamage(shield);
    expect(half).toBe(Math.max(1, Math.floor(full! / 2)));
    expect(half).toBeLessThan(full!);
  });

  it('never reduces white damage below 1', () => {
    const r = takeTurn(battleOn(WHITE3, [shielded(0)], { weapon: 'brush' }), A, B, refill());
    expect(whiteDamage(r)).toEqual([1]); // a brush match of 3 does 1, which stays 1
  });

  it('does not halve white damage once the shield is down', () => {
    const down = takeTurn(battleOn(WHITE4, [shielded(2)], gun), A, B, refill());
    const plain = takeTurn(battleOn(WHITE4, [shielded(0, { ability: null })], gun), A, B, refill());
    expect(whiteDamage(down)).toEqual(whiteDamage(plain));
  });

  it('is broken for SHIELD_BREAK_TURNS turns by a paint spend, which is not halved', () => {
    const state = battleOn(board(), [shielded()], { paint: { red: 0, yellow: 3, blue: 0 } });
    const r = spend(state, 'yellow', 0);
    expect(r.state.enemies[0]!.hp).toBe(27); // yellow does 3, unhalved
    expect(r.state.enemies[0]!.ability).toEqual({ kind: 'shield', countdown: SHIELD_BREAK_TURNS });
    expect(r.events).toContainEqual({ type: 'shieldBroken', enemyId: 0 });
  });

  it('is broken by a used mix and by rainbow', () => {
    const viaMix = useMix(battleOn(board(), [shielded()], { heldMix: 'purple' }), { enemyId: 0 });
    expect(viaMix.events).toContainEqual({ type: 'shieldBroken', enemyId: 0 });
    const viaRainbow = useMix(
      battleOn(board(), [shielded()], { heldMix: 'green', paint: { red: 9, yellow: 0, blue: 0 } }),
      { color: 'red' },
    );
    expect(viaRainbow.events).toContainEqual({ type: 'shieldBroken', enemyId: 0 });
  });

  it('is broken by orange, whose boss damage is not halved', () => {
    const r = useMix(battleOn(board(), [shielded(0, { boss: true })], { heldMix: 'orange' }), { enemyId: 0 });
    expect(r.state.enemies[0]!.hp).toBe(15);
    expect(r.events).toContainEqual({ type: 'shieldBroken', enemyId: 0 });
  });

  it('is not broken by white damage, and a regular enemy is not affected by paint breaking anything', () => {
    const r = takeTurn(battleOn(WHITE3, [shielded()], gun), A, B, refill());
    expect(r.state.enemies[0]!.ability!.countdown).toBe(0);
    const plain = spend(battleOn(board(), [enemy(0)], { paint: { red: 0, yellow: 3, blue: 0 } }), 'yellow', 0);
    expect(plain.events.some((e) => e.type === 'shieldBroken')).toBe(false);
  });

  it('a shield that is already down is not extended by another paint hit', () => {
    const r = spend(battleOn(board(), [shielded(2)], { paint: { red: 0, yellow: 3, blue: 0 } }), 'yellow', 0);
    expect(r.state.enemies[0]!.ability!.countdown).toBe(2);
    expect(r.events.some((e) => e.type === 'shieldBroken')).toBe(false);
  });

  it('comes back after exactly SHIELD_BREAK_TURNS turns', () => {
    let state = battleOn(board(), [shielded(SHIELD_BREAK_TURNS)], gun);
    const restored: boolean[] = [];
    for (let turn = 1; turn <= SHIELD_BREAK_TURNS; turn++) {
      const r = takeTurn({ ...state, board: board() }, A, B, refill());
      restored.push(r.events.some((e) => e.type === 'shieldRestored'));
      state = r.state;
    }
    expect(restored).toEqual([false, false, true]);
    expect(state.enemies[0]!.ability!.countdown).toBe(0);
  });

  it('a shield that is up has no timer: it never changes on its own', () => {
    let state = battleOn(board(), [shielded()], gun);
    for (let i = 0; i < 4; i++) state = takeTurn({ ...state, board: board() }, A, B, refill()).state;
    expect(state.enemies[0]!.ability).toEqual({ kind: 'shield', countdown: 0 });
  });
});

// Wins regular battles until the run reaches the first boss.
const toFirstBoss = (start: ReturnType<typeof createRun>) => {
  let run = start;
  // Bounded, so a broken run rule fails the test instead of looping forever.
  for (let i = 0; i < 20 && run.encounter !== 'boss'; i++) {
    run = continueRun(updateBattle(run, { ...run.battle, enemies: [], status: 'won' }, createRng(1)), createRng(1));
  }
  return run;
};

describe('boss abilities in a run', () => {
  it('draws different abilities without repeats', () => {
    const leftOut = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const drawn = drawBossAbilities(createRng(seed), 3);
      expect(drawn).toHaveLength(3);
      expect(new Set(drawn).size).toBe(3);
      leftOut.add(BOSS_ABILITIES.find((a) => !drawn.includes(a))!);
    }
    expect(leftOut.size).toBe(4); // any of the four can be the one left out
  });

  it('the run gives the boss its ability and keeps it for the whole run', () => {
    let run = createRun(createRng(3));
    const planned = run.bossAbilities;
    run = toFirstBoss(run);
    expect(run.encounter).toBe('boss');
    expect(run.battle.enemies[0]!.ability?.kind).toBe(planned[0]);
    expect(run.bossAbilities).toBe(planned);
  });

  it('only the boss encounters are marked as bosses', () => {
    let run = createRun(createRng(3));
    expect(run.battle.enemies.every((e) => !e.boss)).toBe(true);
    run = toFirstBoss(run);
    expect(run.battle.enemies.map((e) => e.boss)).toEqual([true]);
  });

  it('regular enemies never get an ability', () => {
    expect(createRun(createRng(3)).battle.enemies.every((e) => e.ability === null)).toBe(true);
  });
});
