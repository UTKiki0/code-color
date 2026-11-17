import { CHARACTERS, DEFAULT_CHARACTER, characterById, type CharacterId } from '../game/characters';
import { createBattle, takeTurn, useItem as useItemTurn, type BattleEvent, type BattleState, type TurnResult } from '../game/battle';
import type { Cell } from '../game/board';
import { mix, spend, useMix } from '../game/paint';
import { createRng, type Rng } from '../game/rng';
import { chooseWeapon, continueRun, createRun, drawBossAbilities, nextEncounter, updateBattle, type RunState } from '../game/run';
import { PAINT_MAX, PLAYER_START_HP, POST_BOSS_HEAL, SPEND_COST, STAGES, type BossAbility, type PaintColor } from '../game/rules';
import { goalsReached, unlock } from '../game/unlocks';
import { browserStorage, loadProgress, saveProgress, type KeyValueStorage } from '../save/save';
import { floatOverEnemy, floatOverPlayer } from './fx';
import { attachInput } from './input';
import { ITEM_INFO } from './items';
import { playItem, playMove } from './replay';
import { WEAPON_INFO } from './weapons';
import { renderSelect } from './select';
import { UnlockAnnouncer } from './announcer';
import { renderBattle, type ViewOptions } from './view';

// Holds the current run (or a single test battle), sends commands to game/, and plays the
// returned events. The game state is the source of truth; this file never changes it directly.

// run: the full run. battle / boss: one regular battle or boss of a stage, for testing.
export type SessionMode = { kind: 'run' } | { kind: 'battle'; stage: number; round: number } | { kind: 'boss'; stage: number };
export interface SessionOptions {
  fullPaint: boolean; // test setting: start with full paint bottles
  mode: SessionMode;
  testing: boolean; // test setting: show the weapon dropdown during a run
  ability?: BossAbility; // test setting: the ability of a single test boss (default: drawn)
  unlockAll?: boolean; // test setting: every character is unlocked, and nothing is saved
  character?: CharacterId; // test setting: start a run with this character, skipping the select screen
  storage?: KeyValueStorage | null; // where unlocks are saved (default: the browser's localStorage)
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A boss fight has one enemy, called Boss on its card; otherwise enemies are Canvas 1 to 3.
/** A short name for an encounter: "stage 2 boss" or "stage 1 battle 2". */
const encounterName = (e: { stage: number; encounter: 'battle' | 'boss'; round: number }) =>
  `stage ${e.stage + 1} ${e.encounter === 'boss' ? 'boss' : STAGES[e.stage]!.battles.length > 1 ? `battle ${e.round + 1}` : 'battle'}`;

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);
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
    else if (e.type === 'playerHealed') parts.push(e.amount > 0 ? `You healed ${e.amount} HP` : 'You are at full HP: the green mix did nothing')
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

/** Floating notes for what a boss or a mix did, shown with the final state: heals, stolen paint, shield changes. */
function floatEffects(events: BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'bossHealed' && e.amount > 0) floatOverEnemy(e.enemyId, `+${e.amount}`, 'heal');
    else if (e.type === 'playerHealed' && e.amount > 0) floatOverPlayer(`+${e.amount}`, 'heal');
    else if (e.type === 'paintStolen') floatOverPlayer(`-${e.amount} ${e.color}`, 'damage');
    else if (e.type === 'shieldBroken') floatOverEnemy(e.enemyId, 'Shield broken!', 'info');
    else if (e.type === 'shieldRestored') floatOverEnemy(e.enemyId, 'Shield back', 'info');
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

  // Characters: which are unlocked, whether progress can be kept, and the select screen. The
  // select screen only exists for a run; the single-battle test modes start straight in.
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const loaded = options.unlockAll
    ? { unlocked: CHARACTERS.map((c) => c.id), pending: [], canSave: true }
    : loadProgress(storage);
  let unlocked: CharacterId[] = loaded.unlocked;
  // Unlocked but not yet announced with a popup. It is saved, so a player who closed the page
  // mid-run gets the popups the next time they open the game.
  let pending: CharacterId[] = loaded.pending;
  const savePending = () => { if (!options.unlockAll) canSave = saveProgress(storage, { unlocked, pending }); };
  let canSave = loaded.canSave;
  let characterId: CharacterId = options.character ?? DEFAULT_CHARACTER;
  let onSelectScreen = mode.kind === 'run' && options.character === undefined;
  // Characters unlocked during a run are saved at once (so closing the page keeps them) but only
  // announced, one popup each, when the run ends or the player leaves it with Rerun or Menu.
  const announcer = new UnlockAnnouncer();

  /** Starts a new run, or a new single battle in a test mode. */
  const begin = () => {
    if (mode.kind === 'run') {
      run = createRun(rng, characterId);
      announcer.reset();
      if (options.fullPaint) run = { ...run, battle: { ...run.battle, paint: { ...FULL_PAINT } } };
      state = run.battle;
      message = `${characterById(characterId).name}: stage 1, battle 1. Swipe a bottle to match three. Grey bottles hurt enemies; paint can be spent or mixed.`;
    } else {
      const stage = STAGES[mode.stage - 1]!;
      const ability = options.ability ?? drawBossAbilities(rng, 1)[0];
      const enemies = mode.kind === 'boss' ? [{ ...stage.boss, ability }] : stage.battles[Math.min(mode.round, stage.battles.length) - 1]!;
      state = createBattle(rng, { enemies, paint: options.fullPaint ? FULL_PAINT : undefined });
      message = `Test ${mode.kind}, stage ${mode.stage}${mode.kind === 'battle' ? `, battle ${mode.round}` : ''}. Swipe a bottle to match three.`;
    }
  };

  /** Records a new battle state, and in a run lets the run notice a win or loss. */
  const setBattle = (next: BattleState) => {
    state = next;
    if (!run) return;
    run = updateBattle(run, next, rng);
    // A boss defeated or a run won may unlock characters: save them now, announce them later.
    const result = unlock(unlocked, goalsReached(run));
    if (result.newly.length > 0) {
      unlocked = result.unlocked;
      pending = [...pending, ...result.newly];
      announcer.earn(result.newly);
      savePending();
    }
    // When the run is over, everything it unlocked is announced, one popup each, over the end screen.
    if (run.phase === 'won' || run.phase === 'lost') announcer.flush(() => undefined);
  };

  // Options that stay the same for every frame of a battle, including the replay frames.
  const baseView = (): Partial<ViewOptions> => ({
    progress: run ? { stage: run.stage, encounter: run.encounter, round: run.round, stageSizes: STAGES.map((st) => st.battles.length + 1) } : undefined,
    bossFight: run ? run.encounter === 'boss' : mode.kind === 'boss',
    testControls: options.testing || mode.kind !== 'run',
    restartLabel: run ? 'Rerun' : 'Restart',
    menuButton: run !== null,
  });

  // The end-of-run buttons: Rerun starts again with the same character, Menu goes back to select.
  const endButtons: NonNullable<NonNullable<ViewOptions['overlay']>['buttons']> = [
    { label: 'Rerun', action: 'restart' }, { label: 'Menu', action: 'menu' },
  ];

  /** The screen over the game between battles, at the end of a run, or after a test battle. */
  const overlay = (): ViewOptions['overlay'] => {
    if (!run) {
      if (state.status === 'playing') return undefined;
      return { title: state.status === 'won' ? 'You won!' : 'You lost', lines: [], buttons: [{ label: 'Play again', action: 'restart' }] };
    }
    if (run.phase === 'won') {
      return { title: 'Run won!', lines: ['You beat all three bosses.'], buttons: endButtons };
    }
    if (run.phase === 'lost') {
      return { title: 'Run lost', lines: [`You fell in ${encounterName(run)}.`], buttons: endButtons };
    }
    if (run.phase === 'cleared' || run.phase === 'choosingWeapon') {
      const afterBoss = run.encounter === 'boss';
      const paint = state.paint;
      const lines = [
        `HP ${state.playerHp}/${PLAYER_START_HP}`,
        `Paint kept: R ${paint.red}, Y ${paint.yellow}, B ${paint.blue}`,
        afterBoss ? `You heal ${POST_BOSS_HEAL} HP.` : 'No healing between battles.',
        `Next: ${encounterName(nextEncounter(run))}.`,
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
      return { title, lines, buttons: [{ label: 'Continue', action: 'continue' }] };
    }
    return undefined;
  };

  /** What the unlock popup shows for a character, or nothing when no popup is due. */
  const popupFor = (id: CharacterId | null) => id === null ? undefined : {
    name: characterById(id).name,
    note: canSave ? undefined : 'Progress cannot be saved in this browser, so this will not be kept.',
  };

  const draw = (extra: Partial<ViewOptions> = {}) => {
    if (onSelectScreen) {
      renderSelect(root, { unlocked, canSave, popup: popupFor(announcer.current()) });
      return;
    }
    renderBattle(root, state, {
      message, messageIsLock: state.heldMix !== null, ...baseView(), overlay: overlay(), ...extra,
      popup: popupFor(announcer.current()),
    });
  };

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
    floatEffects(result.events);
  };

  /** Plays a turn that changed the board (a swipe or a tapped item), then shows its final state. */
  const playTurn = async (result: TurnResult, replay: () => Promise<void>) => {
    busy = true;
    if (!reducedMotion()) await replay();
    setBattle(result.state);
    message = describe(result.events, baseView().bossFight === true);
    draw(attackEffects(result.events));
    floatEffects(result.events);
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
        : 'player' in target ? 'Only green heals you. Drop this mix on an enemy.'
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
      const where = `${cap(encounterName(run))}.`;
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
      message = `${cap(encounterName(run))}. ${healed > 0 ? `Healed ${healed} HP. ` : ''}${weaponNote}`;
      draw();
    },

    // These three ignore clicks while a move is still being replayed, so the replay cannot draw
    // the old battle over the new screen.
    // If the run unlocked characters, their popups come first and the action waits for them.
    restart() {
      if (busy || announcer.showing) return;
      const go = () => { begin(); draw(); };
      if (announcer.flush(go)) draw(); else go();
    },

    menu() {
      if (busy || announcer.showing) return;
      const go = () => { run = null; announcer.reset(); onSelectScreen = true; draw(); };
      if (announcer.flush(go)) draw(); else go();
    },

    dismissPopup() {
      // A character is announced once it has been seen, so it stops being pending (and is saved).
      const seen = announcer.current();
      if (seen !== null) {
        pending = pending.filter((id) => id !== seen);
        savePending();
      }
      announcer.dismiss()?.(); // after the last popup, carry on with what the player was doing
      draw(); // then redraw: the next popup, or the screen without one
    },

    chooseCharacter(id: CharacterId) {
      if (busy || !unlocked.includes(id)) return;
      characterId = id;
      onSelectScreen = false;
      begin();
      draw();
    },
  });

  if (!onSelectScreen) begin();
  // Characters unlocked in an earlier visit that were never announced (the page was closed mid-run)
  // get their popups now, before anything else, in a run (the test modes stay clean).
  if (mode.kind === 'run' && pending.length > 0) {
    announcer.earn(pending);
    announcer.flush(() => undefined);
  }
  draw();
}
