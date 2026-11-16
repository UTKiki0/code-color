import { createBoard, swap, type Board, type BoardEvent, type Cell } from './board';
import type { Rng } from './rng';
import {
  ENEMY_ATTACK_DAMAGE, PAINT_COLORS, PAINT_MAX, PLAYER_START_HP, STAGES,
  whiteMatchDamage, type Bottle, type EffectName, type EnemyDef, type MixColor, type PaintColor, type Weapon,
} from './rules';

export interface Burn {
  damage: number; // damage dealt at each tick
  turnsLeft: number;
}

export interface Enemy {
  id: number;
  hp: number;
  maxHp: number; // for HP bars
  startCountdown: number; // the countdown value an attack resets to
  countdown: number; // turns until this enemy attacks
  attack: number; // damage dealt to the player when it attacks
  burn: Burn | null;
}

export interface BattleState {
  board: Board;
  paint: Record<PaintColor, number>;
  playerHp: number;
  weapon: Weapon;
  heldMix: MixColor | null; // a mix must be used before the board can be swiped
  enemies: Enemy[]; // living enemies only
  status: 'playing' | 'won' | 'lost';
}

// Events listed in the order they happened, so the UI can replay them.
export type BattleEvent =
  | BoardEvent
  | { type: 'paintGained'; color: PaintColor; amount: number } // amount actually stored, after the cap
  | {
      type: 'enemyDamaged';
      enemyId: number;
      amount: number;
      source: 'white' | 'burn' | 'paint' | 'rainbow';
      cells?: Cell[]; // for white damage: the bottles of the match that dealt it
    }
  | { type: 'effectApplied'; enemyId: number; effect: EffectName }
  | { type: 'paintSpent'; color: PaintColor; amount: number }
  | { type: 'mixed'; mix: MixColor }
  | { type: 'mixUsed'; mix: MixColor }
  | { type: 'rainbow' }
  | { type: 'enemyDied'; enemyId: number }
  | { type: 'enemyAttacked'; enemyId: number; damage: number }
  | { type: 'won' }
  | { type: 'lost' };

export interface TurnResult {
  ok: boolean; // false: the move was rejected and `state` is unchanged
  state: BattleState;
  events: BattleEvent[];
}

/** What a battle starts with. Defaults describe the very first battle of a run. */
export interface BattleSetup {
  enemies?: EnemyDef[];
  playerHp?: number;
  paint?: Record<PaintColor, number>;
  weapon?: Weapon;
  heldMix?: MixColor | null;
}

/** A fresh battle: used to start and to restart, and by runs to start each battle. */
export function createBattle(rng: Rng, setup: BattleSetup = {}): BattleState {
  const enemies = setup.enemies ?? STAGES[0]!.battle;
  return {
    board: createBoard(rng),
    paint: { ...(setup.paint ?? { red: 0, yellow: 0, blue: 0 }) },
    playerHp: setup.playerHp ?? PLAYER_START_HP,
    weapon: setup.weapon ?? 'paintballGun',
    heldMix: setup.heldMix ?? null,
    enemies: enemies.map((e, id) => ({
      id,
      hp: e.hp,
      maxHp: e.hp,
      startCountdown: e.countdown,
      countdown: e.countdown,
      attack: e.attack ?? ENEMY_ATTACK_DAMAGE,
      burn: null,
    })),
    status: 'playing',
  };
}

/** Splits cleared cells of one bottle type into matches: groups of touching bottles. */
function groupMatches(cells: (Cell & { bottle: Bottle })[], bottle: Bottle): Cell[][] {
  const remaining = new Map(
    cells.filter((c) => c.bottle === bottle).map((c) => [`${c.row},${c.col}`, c as Cell]),
  );
  const groups: Cell[][] = [];
  while (remaining.size > 0) {
    const [firstKey, first] = remaining.entries().next().value as [string, Cell];
    remaining.delete(firstKey);
    const group = [first];
    for (let i = 0; i < group.length; i++) {
      const { row, col } = group[i]!;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const key = `${row + dr},${col + dc}`;
        const neighbor = remaining.get(key);
        if (neighbor) {
          remaining.delete(key);
          group.push(neighbor);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Removes enemies with no HP left, reporting each death, and returns the survivors. */
export function removeDeadEnemies(enemies: Enemy[], events: BattleEvent[]): Enemy[] {
  for (const enemy of enemies.filter((e) => e.hp <= 0)) {
    events.push({ type: 'enemyDied', enemyId: enemy.id });
  }
  return enemies.filter((e) => e.hp > 0);
}

/** Won when no enemies remain; lost when the player has no HP left. */
export function statusFor(enemies: Enemy[], playerHp: number): BattleState['status'] {
  if (enemies.length === 0) return 'won';
  return playerHp === 0 ? 'lost' : 'playing';
}

/**
 * One player turn: a swap on the board followed by the resolution order in
 * spec.md. A rejected swap, or a finished battle, changes nothing.
 */
export function takeTurn(state: BattleState, a: Cell, b: Cell, rng: Rng): TurnResult {
  const rejected: TurnResult = { ok: false, state, events: [] };
  if (state.status !== 'playing' || state.heldMix) return rejected;

  const moved = swap(state.board, a, b, rng);
  if (!moved.ok) return rejected;

  const paint = { ...state.paint };
  let enemies = state.enemies.map((e) => ({ ...e }));
  let playerHp = state.playerHp;
  const events: BattleEvent[] = [];
  const living = () => enemies.filter((e) => e.hp > 0);

  // 1. Matches and cascades: collect paint, and white matches damage a random enemy.
  for (const event of moved.events) {
    events.push(event);
    if (event.type !== 'bottlesCleared') continue;

    for (const color of PAINT_COLORS) {
      const cleared = event.cells.filter((c) => c.bottle === color).length;
      const amount = Math.min(cleared, PAINT_MAX - paint[color]);
      if (cleared > 0) {
        paint[color] += amount;
        events.push({ type: 'paintGained', color, amount });
      }
    }
    // Each match hits one random enemy (the roller hits every living enemy) for the match damage.
    for (const match of groupMatches(event.cells, 'white')) {
      const targets = living();
      if (targets.length === 0) break;
      const hit = state.weapon === 'roller' ? targets : [targets[Math.floor(rng() * targets.length)]!];
      const amount = whiteMatchDamage(match.length, state.weapon);
      for (const target of hit) {
        target.hp -= amount;
        events.push({ type: 'enemyDamaged', enemyId: target.id, amount, source: 'white', cells: match });
      }
    }
  }

  // 2. Burn ticks on living enemies.
  for (const enemy of living()) {
    if (!enemy.burn) continue;
    enemy.hp -= enemy.burn.damage;
    events.push({ type: 'enemyDamaged', enemyId: enemy.id, amount: enemy.burn.damage, source: 'burn' });
    enemy.burn = enemy.burn.turnsLeft > 1
      ? { ...enemy.burn, turnsLeft: enemy.burn.turnsLeft - 1 }
      : null;
  }

  // 3. Dead enemies are removed, so they never attack.
  enemies = removeDeadEnemies(enemies, events);

  // 4. Remaining countdowns advance by one.
  for (const enemy of enemies) enemy.countdown -= 1;

  // 5. Enemies at zero attack, then reset their countdown.
  for (const enemy of enemies) {
    if (enemy.countdown > 0) continue;
    playerHp = Math.max(0, playerHp - enemy.attack);
    events.push({ type: 'enemyAttacked', enemyId: enemy.id, damage: enemy.attack });
    enemy.countdown = enemy.startCountdown;
  }

  // 6. Win and lose. With no enemies left nothing can have attacked this turn.
  const status = statusFor(enemies, playerHp);
  if (status !== 'playing') events.push({ type: status });

  return {
    ok: true,
    state: { ...state, board: moved.board, paint, enemies, playerHp, status },
    events,
  };
}
