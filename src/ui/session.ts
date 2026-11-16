import { createBattle, takeTurn, type BattleEvent, type BattleState, type TurnResult } from '../game/battle';
import type { Cell } from '../game/board';
import { mix, spend, useMix } from '../game/paint';
import { createRng, type Rng } from '../game/rng';
import { PAINT_MAX, SPEND_COST, type PaintColor } from '../game/rules';
import { attachInput } from './input';
import { renderBattle, type ViewOptions } from './view';

// Holds the current battle, sends commands to game/, and plays the returned events.
// The game state is the source of truth; this file never changes it directly.

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const POP_MS = 250;

const enemyName = (id: number) => `Canvas ${id + 1}`;

/** Plain-language summary of what happened, shown in the message line. */
function describe(events: BattleEvent[]): string {
  const parts: string[] = [];
  const steps = events.filter((e) => e.type === 'bottlesCleared').length;
  if (steps > 1) parts.push(`Cascade x${steps}!`);
  for (const e of events) {
    if (e.type === 'paintGained' && e.amount > 0) parts.push(`+${e.amount} ${e.color}`);
    else if (e.type === 'paintSpent') parts.push(`Spent ${e.amount} ${e.color}`);
    else if (e.type === 'mixed') parts.push(`Made ${e.mix} - use it before swiping`);
    else if (e.type === 'rainbow') parts.push('Rainbow!');
    else if (e.type === 'effectApplied') parts.push(`${enemyName(e.enemyId)}: ${e.effect} effect`);
    else if (e.type === 'enemyDied') parts.push(`${enemyName(e.enemyId)} finished!`);
    else if (e.type === 'enemyAttacked') parts.push(`${enemyName(e.enemyId)} hit you for ${e.damage}`);
    else if (e.type === 'shuffled') parts.push('Board shuffled');
  }
  return parts.join('. ') || 'Done.';
}

/** Damage numbers and attack flashes to show with the new state. */
function effectsFrom(events: BattleEvent[]): Partial<ViewOptions> {
  const totals = new Map<number, number>();
  for (const e of events) {
    if (e.type === 'enemyDamaged') totals.set(e.enemyId, (totals.get(e.enemyId) ?? 0) + e.amount);
  }
  const attacks = events.filter((e) => e.type === 'enemyAttacked');
  return {
    floats: [...totals].map(([enemyId, amount]) => ({ enemyId, text: `-${amount}` })),
    attackedEnemies: attacks.map((e) => (e.type === 'enemyAttacked' ? e.enemyId : -1)),
    playerHit: attacks.length > 0,
  };
}

export function startSession(root: HTMLElement, seed: number, options: { fullPaint: boolean }): void {
  const rng: Rng = createRng(seed);
  // Test setting: start with full paint so mixing can be tried without a long game.
  const newBattle = (): BattleState => {
    const battle = createBattle(rng);
    return options.fullPaint ? { ...battle, paint: { red: PAINT_MAX, yellow: PAINT_MAX, blue: PAINT_MAX } } : battle;
  };
  let state: BattleState = newBattle();
  let message = 'Swipe a bottle to match three. White bottles hurt enemies; paint can be spent or mixed.';
  let busy = false;

  const draw = (extra: Partial<ViewOptions> = {}) =>
    renderBattle(root, state, { message, messageIsLock: state.heldMix !== null, ...extra });

  /** Applies a command that is not a turn (spend, mix, use mix). */
  const applyPaint = (result: TurnResult, rejectedMessage: string) => {
    if (!result.ok) {
      message = rejectedMessage;
      draw();
      return;
    }
    state = result.state;
    message = describe(result.events);
    draw(effectsFrom(result.events));
  };

  attachInput(root, {
    busy: () => busy,

    async swap(a: Cell, b: Cell) {
      const result = takeTurn(state, a, b, rng);
      if (!result.ok) {
        message = state.heldMix ? 'Use your mix before swiping.'
          : state.status !== 'playing' ? 'The battle is over.'
          : 'That swap makes no match.';
        draw({ shake: [a, b] });
        return;
      }
      busy = true;
      // Show the first match shrinking away, then the resolved board.
      const first = result.events.find((e) => e.type === 'bottlesCleared');
      if (first?.type === 'bottlesCleared' && !reducedMotion()) {
        // The board shown is the pre-swap board, so redraw it with the swap applied first.
        const swapped = state.board.map((r) => [...r]);
        swapped[a.row]![a.col] = state.board[b.row]![b.col]!;
        swapped[b.row]![b.col] = state.board[a.row]![a.col]!;
        renderBattle(root, { ...state, board: swapped }, { message, popCells: first.cells });
        await sleep(POP_MS);
      }
      state = result.state;
      message = describe(result.events);
      draw({ dropIn: !reducedMotion(), ...effectsFrom(result.events) });
      busy = false;
    },

    spend(color: PaintColor, enemyId: number) {
      applyPaint(spend(state, color, enemyId), `Need ${SPEND_COST} paint to attack, on a living enemy.`);
    },

    mix(a: PaintColor, b: PaintColor) {
      applyPaint(
        mix(state, a, b),
        state.heldMix ? 'Use the held mix first.' : `Mixing needs both bottles full (${PAINT_MAX}).`,
      );
    },

    useMix(target) {
      applyPaint(
        useMix(state, target, rng),
        'color' in target ? `Rainbow needs the third paint bottle full (${PAINT_MAX}).` : 'Drop the mix on a living enemy.',
      );
    },

    setWeapon(weapon) {
      state = { ...state, weapon };
      message = `Weapon: ${weapon}.`;
      draw();
    },

    restart() {
      state = newBattle();
      message = 'New battle. Swipe a bottle to match three.';
      draw();
    },
  });

  draw();
}
