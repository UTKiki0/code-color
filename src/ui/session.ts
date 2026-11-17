import { createBattle, takeTurn, useItem as useItemTurn, type BattleEvent, type BattleState, type TurnResult } from '../game/battle';
import type { Cell } from '../game/board';
import { mix, spend, useMix } from '../game/paint';
import { createRng, type Rng } from '../game/rng';
import { chooseWeapon, continueRun, createRun, drawBossAbilities, updateBattle, type RunState } from '../game/run';
import { PAINT_MAX, PLAYER_START_HP, POST_BOSS_HEAL, SPEND_COST, STAGES, type BossAbility, type PaintColor } from '../game/rules';
import { floatOverEnemy, floatOverPlayer } from './fx';
import { attachInput } from './input';
import { ITEM_INFO } from './items';
import { playItem, playMove } from './replay';
import { WEAPON_INFO } from './weapons';
import { renderBattle, type ViewOptions } from './view';

// Holds the current run (or a single test battle), sends commands to game/, and plays the
// returned events. The game state is the source of truth; this file never changes it directly.

// run: the full run. battle / boss: one regular battle or boss of a stage, for testing.
export type SessionMode = { kind: 'run' } | { kind: 'battle' | 'boss'; stage: number };
export interface SessionOptions {
  fullPaint: boolean; // test setting: start with full paint bottles
  mode: SessionMode;
  testing: boolean; // test setting: show the weapon dropdown during a run
  ability?: BossAbility; // test setting: the ability of a single test boss (default: drawn)
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A boss fight has one enemy, called Boss on its card; otherwise enemies are Canvas 1 to 3.
const enemyNameFor = (bossFight: boolean) => (id: number) => (bossFight ? 'Boss' : `Canvas ${id + 1}`);

/** Plain-language summary of what happened, shown in the message line. */
function describe(events: BattleEvent[], bossFight: boolean): string {
  const enemyName = enemyNameFor(bossFight);
  const parts: string[] = [];
  // A tapped item's own clear is step 1, so combos are the steps after it.
  const steps = events.filter((e) => e.type === 'bottlesCleared').length - (events.some((e) => e.type === 'itemUsed') ? 1 : 0);
  if (steps > 1) parts.push(`Combo x${steps}!`);
  for (const e of events) {
    if (e.type === 'itemUsed') parts.push(`Used the ${ITEM_INFO[e.item].label}`);
    else if (e.type === 'bottlesCleared') for (const made of e.created) parts.push(`Made a ${ITEM_INFO[made.item].label} item`);
    else if (e.type === 'paintGained' && e.amount > 0) parts.push(`+${e.amount} ${e.color}`);
    else if (e.type === 'paintSpent') parts.push(`Spent ${e.amount} ${e.color}`);
    else if (e.type === 'mixed') parts.push(`Made ${e.mix} - use it before swiping`);
    else if (e.type === 'rainbow') parts.push('Rainbow!');
    else if (e.type === 'effectApplied') parts.push(`${enemyName(e.enemyId)}: ${e.effect} effect`);
    else if (e.type === 'enemyDied') parts.push(`${enemyName(e.enemyId)} finished!`);
    else if (e.type === 'enemyAttacked') parts.push(`${enemyName(e.enemyId)} hit you for ${e.damage}`);
    else if (e.type === 'paintStolen') parts.push(`${enemyName(e.enemyId)} stole ${e.amount} ${e.color}`)
    else if (e.type === 'inkBlotted') parts.push(`${enemyName(e.enemyId)} blotted ${e.cells.length} bottles`)
    else if (e.type === 'shieldBroken') parts.push(`${enemyName(e.enemyId)}'s shield broke`)
    else if (e.type === 'shieldRestored') parts.push(`${enemyName(e.enemyId)}'s shield is back`)
    else if (e.type === 'playerHealed') parts.push(`You healed ${e.amount} HP`)
    else if (e.type === 'bossHealed') parts.push(`Boss healed ${e.amount} HP`);
    else if (e.type === 'shuffled') parts.push('Board shuffled');
  }
  return parts.join('. ') || 'Done.';
}

/** Attack flashes to show with the final state of a move. */
function attackEffects(events: BattleEvent[]): Partial<ViewOptions> {
  const attacks = events.filter((e) => e.type === 'enemyAttacked');
  const blots = events.flatMap((e) => (e.type === 'inkBlotted' ? e.cells : []));
  return {
    blotCells: blots.length > 0 ? blots : undefined,
    attackedEnemies: attacks.map((e) => (e.type === 'enemyAttacked' ? e.enemyId : -1)),
    playerHit: attacks.length > 0,
  };
}

/** Numbers for damage that is not part of a match: spends, mixes, rainbow. */
function floatCommandDamage(events: BattleEvent[]): void {
  const totals = new Map<number, number>();
  for (const e of events) {
    if (e.type === 'enemyDamaged') totals.set(e.enemyId, (totals.get(e.enemyId) ?? 0) + e.amount);
  }
  for (const [enemyId, amount] of totals) floatOverEnemy(enemyId, `-${amount}`, 'damage');
}

/** A red number over the player panel for stolen paint, shown with the final state of a move. */
function floatThefts(events: BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'paintStolen') floatOverPlayer(`-${e.amount} ${e.color}`, 'damage');
  }
}

/** A green number over the player panel when a mix heals. */
function floatPlayerHeals(events: BattleEvent[]): void {
  for (const e of events) if (e.type === 'playerHealed') floatOverPlayer(`+${e.amount}`, 'heal');
}

/** Short notes over the boss when its shield breaks or returns. */
function floatShield(events: BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'shieldBroken') floatOverEnemy(e.enemyId, 'Shield broken!', 'info');
    else if (e.type === 'shieldRestored') floatOverEnemy(e.enemyId, 'Shield back', 'info');
  }
}

/** Green numbers for boss healing, shown with the final state of a move. */
function floatHeals(events: BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'bossHealed' && e.amount > 0) floatOverEnemy(e.enemyId, `+${e.amount}`, 'heal');
  }
}

const FULL_PAINT = { red: PAINT_MAX, yellow: PAINT_MAX, blue: PAINT_MAX };

export function startSession(root: HTMLElement, seed: number, options: SessionOptions): void {
  const rng: Rng = createRng(seed);
  const { mode } = options;

  let run: RunState | null = null; // only in run mode
  let state: BattleState; // the battle being played (in run mode, the same as run.battle)
  let message = '';
  let busy = false;

  /** Starts a new run, or a new single battle in a test mode. */
  const begin = () => {
    if (mode.kind === 'run') {
      run = createRun(rng);
      if (options.fullPaint) run = { ...run, battle: { ...run.battle, paint: { ...FULL_PAINT } } };
      state = run.battle;
      message = 'Stage 1: battle. Swipe a bottle to match three. White bottles hurt enemies; paint can be spent or mixed.';
    } else {
      const stage = STAGES[mode.stage - 1]!;
      const ability = options.ability ?? drawBossAbilities(rng, 1)[0];
      const enemies = mode.kind === 'boss' ? [{ ...stage.boss, ability }] : stage.battle;
      state = createBattle(rng, { enemies, paint: options.fullPaint ? FULL_PAINT : undefined });
      message = `Test ${mode.kind}, stage ${mode.stage}. Swipe a bottle to match three.`;
    }
  };

  /** Records a new battle state, and in a run lets the run notice a win or loss. */
  const setBattle = (next: BattleState) => {
    state = next;
    if (run) run = updateBattle(run, next, rng);
  };

  // Options that stay the same for every frame of a battle, including the replay frames.
  const baseView = (): Partial<ViewOptions> => ({
    progress: run ? { stage: run.stage, encounter: run.encounter, stages: STAGES.length } : undefined,
    bossFight: run ? run.encounter === 'boss' : mode.kind === 'boss',
    testControls: options.testing || mode.kind !== 'run',
    restartLabel: run ? 'New run' : 'Restart',
  });

  /** The screen over the game between battles, at the end of a run, or after a test battle. */
  const overlay = (): ViewOptions['overlay'] => {
    if (!run) {
      if (state.status === 'playing') return undefined;
      return { title: state.status === 'won' ? 'You won!' : 'You lost', lines: [], button: { label: 'Play again', action: 'restart' } };
    }
    if (run.phase === 'won') {
      return { title: 'Run won!', lines: ['You beat all three bosses.'], button: { label: 'New run', action: 'restart' } };
    }
    if (run.phase === 'lost') {
      return {
        title: 'Run lost',
        lines: [`You fell in stage ${run.stage + 1} (${run.encounter}).`],
        button: { label: 'New run', action: 'restart' },
      };
    }
    if (run.phase === 'cleared' || run.phase === 'choosingWeapon') {
      const afterBoss = run.encounter === 'boss';
      const paint = state.paint;
      const lines = [
        `HP ${state.playerHp}/${PLAYER_START_HP}`,
        `Paint kept: R ${paint.red}, Y ${paint.yellow}, B ${paint.blue}`,
        afterBoss ? `You heal ${POST_BOSS_HEAL} HP.` : 'No healing between battles.',
        afterBoss ? `Next: stage ${run.stage + 2} battle.` : `Next: stage ${run.stage + 1} boss.`,
      ];
      // A held mix is discarded when the battle ends, so say so rather than lose it silently.
      if (state.heldMix) lines.push(`Your ${state.heldMix} mix was not used and will be lost.`);
      const title = afterBoss ? 'Boss defeated!' : 'Battle cleared!';
      if (run.phase === 'choosingWeapon') {
        // The weapon already held is labeled "Keep"; choosing it changes nothing.
        const choices = (run.weaponOffer ?? []).map((weapon) => ({
          weapon,
          label: weapon === state.weapon ? `Keep: ${WEAPON_INFO[weapon].label}` : WEAPON_INFO[weapon].label,
          description: WEAPON_INFO[weapon].description,
        }));
        return { title, lines: [...lines, 'Choose your next weapon:'], choices };
      }
      return { title, lines, button: { label: 'Continue', action: 'continue' } };
    }
    return undefined;
  };

  const draw = (extra: Partial<ViewOptions> = {}) =>
    renderBattle(root, state, {
      message, messageIsLock: state.heldMix !== null, ...baseView(), overlay: overlay(), ...extra,
    });

  /** Applies a command that is not a turn (spend, mix, use mix). */
  const applyPaint = (result: TurnResult, rejectedMessage: string) => {
    if (!result.ok) {
      message = rejectedMessage;
      draw();
      return;
    }
    setBattle(result.state);
    message = describe(result.events, baseView().bossFight === true);
    draw();
    floatCommandDamage(result.events);
    floatShield(result.events);
    floatPlayerHeals(result.events);
  };

  /** Plays a turn that changed the board (a swipe or a tapped item), then shows its final state. */
  const playTurn = async (result: TurnResult, replay: () => Promise<void>) => {
    busy = true;
    if (!reducedMotion()) await replay();
    setBattle(result.state);
    message = describe(result.events, baseView().bossFight === true);
    draw(attackEffects(result.events));
    floatHeals(result.events);
    floatShield(result.events);
    floatThefts(result.events);
    if (!reducedMotion()) {
      const hits = result.events.filter((e) => e.type === 'enemyAttacked');
      const total = hits.reduce((sum, e) => sum + (e.type === 'enemyAttacked' ? e.damage : 0), 0);
      if (total > 0) floatOverPlayer(`-${total}`, 'damage');
    }
    busy = false;
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
      await playTurn(result, () => playMove(root, state, a, b, result, message, baseView()));
    },

    async useItem(cell: Cell) {
      const result = useItemTurn(state, cell, rng);
      if (!result.ok) {
        message = state.heldMix ? 'Use your mix before tapping an item.'
          : state.status !== 'playing' ? 'The battle is over.'
          : 'That is not an item.';
        draw();
        return;
      }
      await playTurn(result, () => playItem(root, state, result, message, baseView()));
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
      const held = state.heldMix;
      const rejected = 'color' in target ? `Rainbow needs the third paint bottle full (${PAINT_MAX}).`
        : 'player' in target ? (held === 'green' ? 'You are at full HP, so the heal would be wasted.' : 'Only green heals you. Drop this mix on an enemy.')
        : held === 'green' ? 'Green heals you: drop it on your panel.' : 'Drop the mix on a living enemy.';
      applyPaint(useMix(state, target), rejected);
    },

    setWeapon(weapon) {
      state = { ...state, weapon };
      if (run) run = { ...run, battle: state };
      message = `Weapon: ${weapon}.`;
      draw();
    },

    continueRun() {
      if (!run || run.phase !== 'cleared') return;
      const hpBefore = state.playerHp;
      run = continueRun(run, rng);
      state = run.battle;
      const healed = state.playerHp - hpBefore;
      const where = `Stage ${run.stage + 1}: ${run.encounter}.`;
      message = healed > 0 ? `${where} Healed ${healed} HP.` : where;
      draw();
    },

    chooseWeapon(weapon) {
      if (!run || run.phase !== 'choosingWeapon') return;
      const hpBefore = state.playerHp;
      const previous = state.weapon;
      run = chooseWeapon(run, weapon, rng);
      state = run.battle;
      const healed = state.playerHp - hpBefore;
      const weaponNote = weapon === previous ? `Kept the ${WEAPON_INFO[weapon].label}.` : `Now using the ${WEAPON_INFO[weapon].label}.`;
      message = `Stage ${run.stage + 1}: ${run.encounter}. ${healed > 0 ? `Healed ${healed} HP. ` : ''}${weaponNote}`;
      draw();
    },

    restart() {
      begin();
      draw();
    },
  });

  begin();
  draw();
}
