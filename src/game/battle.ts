import { blotBoard, connectedGroups, createBoard, swap, useItem as useBoardItem, type Board, type BoardEvent, type Cell } from './board';
import { isShielded } from './effects';
import type { Rng } from './rng';
import {
  ABILITY_COUNTDOWN, BOSS_HEAL_AMOUNT, INK_BLOT_COUNT, ENEMY_ATTACK_DAMAGE, PAINT_THIEF_AMOUNT, PAINT_COLORS, PAINT_MAX, PLAYER_START_HP, STAGES,
  whiteMatchDamage, type Bottle, type BossAbility, type EffectName, type EnemyDef, type MixColor, type PaintColor, type Weapon,
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
  boss: boolean; // some effects do more damage to a boss
  burn: Burn | null;
  // Bosses only. For every ability but shield, the turns until it acts. For shield, 0 means the
  // shield is up and above 0 is the turns until it returns after paint broke it.
  ability: { kind: BossAbility; countdown: number } | null;
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
  | { type: 'paintStolen'; enemyId: number; color: PaintColor; amount: number } // amount actually taken
  | { type: 'inkBlotted'; enemyId: number; cells: Cell[] } // bottles turned into empties
  | { type: 'shieldBroken'; enemyId: number }
  | { type: 'shieldRestored'; enemyId: number }
  | { type: 'playerHealed'; amount: number } // HP actually restored, after the cap
  | { type: 'bossHealed'; enemyId: number; amount: number } // amount actually healed, after the cap
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
  const enemies = setup.enemies ?? STAGES[0]!.battles[0]!;
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
      boss: e.boss ?? false,
      burn: null,
      // A shield starts up (countdown 0); every other ability starts its countdown at the full value.
      ability: e.ability ? { kind: e.ability, countdown: e.ability === 'shield' ? 0 : ABILITY_COUNTDOWN } : null,
    })),
    status: 'playing',
  };
}

/** The matches of one bottle type among cleared cells: groups of touching bottles. */
const groupMatches = (cells: (Cell & { bottle: Bottle })[], bottle: Bottle): Cell[][] =>
  connectedGroups(cells.filter((c) => c.bottle === bottle));

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

/** Performs a boss's ability. One place for all abilities; each has its own case. */
/** The paint color with the most stored; a tie is broken at random. */
export function fullestBottle(paint: Record<PaintColor, number>, rng: Rng): PaintColor {
  const most = Math.max(...PAINT_COLORS.map((c) => paint[c]));
  const tied = PAINT_COLORS.filter((c) => paint[c] === most);
  return tied[Math.floor(rng() * tied.length)]!;
}

/** What an ability can change besides the boss itself. The board is replaced, never edited. */
interface AbilityTarget {
  paint: Record<PaintColor, number>;
  board: Board;
}

function useAbility(boss: Enemy, target: AbilityTarget, rng: Rng, events: BattleEvent[]): void {
  const { paint } = target;
  switch (boss.ability!.kind) {
    case 'heal': {
      const amount = Math.min(BOSS_HEAL_AMOUNT, boss.maxHp - boss.hp);
      boss.hp += amount;
      events.push({ type: 'bossHealed', enemyId: boss.id, amount });
      break;
    }
    case 'paintThief': {
      // Takes from the fullest bottle (a tie is random). Nothing to take, nothing happens.
      const fullest = fullestBottle(paint, rng);
      const amount = Math.min(PAINT_THIEF_AMOUNT, paint[fullest]);
      if (amount === 0) break;
      paint[fullest] -= amount;
      events.push({ type: 'paintStolen', enemyId: boss.id, color: fullest, amount });
      break;
    }
    case 'inkBlot': {
      const blot = blotBoard(target.board, INK_BLOT_COUNT, rng);
      target.board = blot.board;
      events.push({ type: 'inkBlotted', enemyId: boss.id, cells: blot.cells });
      if (blot.shuffled) events.push({ type: 'shuffled' });
      break;
    }
    default:
      break; // the other abilities are built in later steps
  }
}

/**
 * One player turn: a swap on the board followed by the resolution order in
 * spec.md. A rejected swap, or a finished battle, changes nothing.
 */
export function takeTurn(state: BattleState, a: Cell, b: Cell, rng: Rng): TurnResult {
  if (state.status !== 'playing' || state.heldMix) return { ok: false, state, events: [] };
  return resolveMove(state, swap(state.board, a, b, rng), rng);
}

/** Tapping an item is a turn too: it clears part of the board, then everything resolves as for a swap. */
export function useItem(state: BattleState, at: Cell, rng: Rng): TurnResult {
  if (state.status !== 'playing' || state.heldMix) return { ok: false, state, events: [] };
  return resolveMove(state, useBoardItem(state.board, at, rng), rng);
}

/** The shared turn rules (see spec.md) once the board has changed. A rejected board change is a rejected move. */
function resolveMove(state: BattleState, moved: ReturnType<typeof swap>, rng: Rng): TurnResult {
  if (!moved.ok) return { ok: false, state, events: [] };

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
      const base = whiteMatchDamage(match.length, state.weapon);
      for (const target of hit) {
        // A shield halves white damage (rounded down, at least 1).
        const amount = isShielded(target) ? Math.max(1, Math.floor(base / 2)) : base;
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

  // 5b. Boss abilities count down after the attacks and act at zero.
  const world: AbilityTarget = { paint, board: moved.board };
  for (const enemy of enemies) {
    if (!enemy.ability) continue;
    if (enemy.ability.kind === 'shield') {
      // A broken shield comes back after its turns; a shield that is up has no timer.
      if (enemy.ability.countdown === 0) continue;
      enemy.ability = { kind: 'shield', countdown: enemy.ability.countdown - 1 };
      if (enemy.ability.countdown === 0) events.push({ type: 'shieldRestored', enemyId: enemy.id });
      continue;
    }
    enemy.ability = { ...enemy.ability, countdown: enemy.ability.countdown - 1 };
    if (enemy.ability.countdown > 0) continue;
    useAbility(enemy, world, rng, events);
    enemy.ability.countdown = ABILITY_COUNTDOWN;
  }

  // 6. Win and lose. With no enemies left nothing can have attacked this turn.
  const status = statusFor(enemies, playerHp);
  if (status !== 'playing') events.push({ type: status });

  return {
    ok: true,
    state: { ...state, board: world.board, paint, enemies, playerHp, status },
    events,
  };
}
