import type { BattleState, Enemy } from '../game/battle';
import type { Cell } from '../game/board';
import { GAME_TITLE } from '../game/title';
import { ITEM_INFO } from './items';
import { WEAPON_INFO, WEAPON_LIST } from './weapons';
import { PAINT_COLORS, PAINT_MAX, PLAYER_START_HP, isItem, type Bottle, type BossAbility, type MixColor, type PaintColor, type Weapon } from '../game/rules';

// Drawing only: this file turns a BattleState into DOM and decides nothing about the rules.

export interface ViewOptions {
  message: string;
  messageIsLock?: boolean;
  popCells?: Cell[]; // bottles to show shrinking away
  falls?: Map<string, number>; // rows each bottle falls, keyed by its new "row,col"
  shake?: Cell[]; // cells to shake (rejected swap)
  blotCells?: Cell[]; // bottles a boss just turned into empties
  madeCells?: Cell[]; // items just made by a match
  speed?: number; // 1 = normal; smaller makes this frame's animations shorter
  attackedEnemies?: number[];
  playerHit?: boolean;
  // Run display. These stay the same for every frame of a battle, so replay frames repeat them.
  progress?: { stage: number; encounter: 'battle' | 'boss'; round: number; stageSizes: number[] }; // stageSizes: encounters in each stage
  bossFight?: boolean; // one large boss card instead of three enemy cards
  testControls?: boolean; // show the weapon dropdown (a test setting)
  restartLabel?: string;
  // A screen over the game: between battles, run won or lost, or battle won or lost.
  overlay?: {
    title: string;
    lines: string[];
    button?: { label: string; action: 'continue' | 'restart' };
    choices?: { weapon: Weapon; label: string; description: string }[]; // weapon buttons after a boss
  };
}

const cap = (word: string) => word[0]!.toUpperCase() + word.slice(1);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = '', attrs: Record<string, string> = {}, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A bottle shape. Its type decides both its color and its outline. */
export function shape(type: Bottle | MixColor): HTMLElement {
  const wrap = el('div', `bottle-${type}`);
  wrap.append(el('div', 'shape'));
  return wrap;
}

const ABILITY_LABELS: Record<BossAbility, string> = {
  paintThief: 'Paint thief', inkBlot: 'Ink blot', shield: 'Shield', heal: 'Heal',
};

/** The ability line on a boss card. A shield shows up or down; the others show their countdown. */
function abilityText(ability: NonNullable<Enemy['ability']>): string {
  const label = ABILITY_LABELS[ability.kind];
  if (ability.kind !== 'shield') return `${label}: acts in ${ability.countdown}`;
  return ability.countdown === 0 ? `${label}: up (halves white damage)` : `${label} broken: back in ${ability.countdown}`;
}

function enemyCard(enemy: Enemy, view: ViewOptions): HTMLElement {
  const name = view.bossFight ? 'Boss' : `Canvas ${enemy.id + 1}`;
  const card = el('div', `enemy${view.bossFight ? ' boss' : ''}${enemy.ability?.kind === 'shield' && enemy.ability.countdown === 0 ? ' shielded' : ''}${view.attackedEnemies?.includes(enemy.id) ? ' attack' : ''}`, {
    'data-enemy-id': String(enemy.id),
    role: 'group',
    'aria-label': `${name}: ${Math.max(0, enemy.hp)} of ${enemy.maxHp} HP, attacks in ${enemy.countdown} turns${enemy.ability ? `, ${abilityText(enemy.ability)}` : ''}`,
  });
  card.append(el('h2', '', {}, name));
  const bar = el('div', 'bar');
  const hp = Math.max(0, enemy.hp); // enemies can be shown below zero HP while a move is replayed
  bar.append(el('div', 'fill', { style: `width:${(hp / enemy.maxHp) * 100}%` }));
  card.append(bar, el('div', '', {}, `HP ${hp}/${enemy.maxHp}`));
  card.append(el('div', 'countdown', {}, `Attacks in ${enemy.countdown}`));
  if (enemy.ability) {
    // Pulses when the ability is one turn away, so the player has a warning.
    // For a shield, "one turn away" means it returns next turn.
    const soon = enemy.ability.countdown === 1;
    card.append(el('div', `ability${soon ? ' soon' : ''}`, {}, abilityText(enemy.ability)));
  }
  card.append(el('div', 'status', {}, enemy.burn ? `Burn ${enemy.burn.damage} x ${enemy.burn.turnsLeft}` : ''));
  return card;
}

function board(state: BattleState, view: ViewOptions): HTMLElement {
  const root = el('div', `board${state.heldMix ? ' locked' : ''}`, {
    role: 'grid', 'aria-label': 'Bottle board',
  });
  const has = (cells: Cell[] | undefined, row: number, col: number) =>
    cells?.some((c) => c.row === row && c.col === col) ?? false;
  state.board.forEach((rowBottles, row) =>
    rowBottles.forEach((bottle, col) => {
      const fall = view.falls?.get(`${row},${col}`);
      const item = isItem(bottle) ? ITEM_INFO[bottle] : null;
      const cell = el(
        'div',
        `cell bottle-${bottle}${has(view.madeCells, row, col) ? ' made' : ''}${has(view.popCells, row, col) ? ' pop' : ''}${has(view.shake, row, col) ? ' shake' : ''}${has(view.blotCells, row, col) ? ' blot' : ''}${fall ? ' fall' : ''}`,
        { 'data-row': String(row), 'data-col': String(col), role: 'gridcell', 'aria-label': item ? `${item.label} item, ${item.description}. Tap to use. Row ${row + 1}, column ${col + 1}` : `${bottle} bottle, row ${row + 1}, column ${col + 1}` },
      );
      if (item) { cell.dataset.item = bottle; cell.style.setProperty('--glyph', `'${item.glyph}'`); }
      if (fall) cell.style.setProperty('--fall', String(fall));
      cell.append(el('div', 'shape'));
      root.append(cell);
    }),
  );
  return root;
}

function palette(state: BattleState): HTMLElement {
  const root = el('div', 'palette', { 'aria-label': 'Paint' });
  for (const color of PAINT_COLORS) {
    const count = state.paint[color];
    const store = el('div', `store bottle-${color}${count === PAINT_MAX ? ' full' : ''}`, {
      'data-paint': color, 'data-count': String(count),
      'aria-label': `${cap(color)} paint, ${count} of ${PAINT_MAX}`,
    });
    const meter = el('div', 'meter');
    meter.append(el('i', '', { style: `width:${(count / PAINT_MAX) * 100}%` }));
    // Shape and text label as well as color, so color is never the only signal.
    store.append(el('div', 'shape'), el('span', '', {}, `${color[0]!.toUpperCase()} ${count}/${PAINT_MAX}`), meter);
    root.append(store);
  }
  if (state.heldMix) {
    const held = el('div', 'held', { 'data-held': state.heldMix, 'aria-label': `Held ${state.heldMix} mix. ${state.heldMix === 'green' ? 'Drag onto your panel to heal, or' : 'Drag onto an enemy, or'} onto the full paint bottle that is not in it to make rainbow.` });
    held.append(shape(state.heldMix), el('span', '', {}, `${cap(state.heldMix)} mix`));
    root.append(held);
  } else {
    root.append(el('div', 'held-empty', {}, 'No mix held'));
  }
  return root;
}

/** The run's position: one step per encounter (each stage's battles, then its boss). */
function progressStrip(p: NonNullable<ViewOptions['progress']>): HTMLElement {
  const battles = p.stageSizes[p.stage]! - 1; // regular battles in this stage
  const before = p.stageSizes.slice(0, p.stage).reduce((sum, n) => sum + n, 0);
  const current = before + (p.encounter === 'boss' ? battles : p.round);
  const kind = p.encounter === 'boss' ? 'Boss' : battles > 1 ? `Battle ${p.round + 1}/${battles}` : 'Battle';
  const strip = el('div', 'progress', { role: 'img', 'aria-label': `Stage ${p.stage + 1} of ${p.stageSizes.length}: ${kind}` });
  strip.append(el('span', 'progress-label', {}, `Stage ${p.stage + 1}/${p.stageSizes.length}: ${kind}`));
  const steps = el('div', 'steps', { 'aria-hidden': 'true' });
  let i = 0;
  for (const size of p.stageSizes) {
    for (let k = 0; k < size; k++, i++) {
      const boss = k === size - 1; // each stage ends with its boss
      // Done steps are filled, the current step is outlined and bold, and bosses use a star:
      // position is not shown by color alone.
      steps.append(el('span', `step${boss ? ' boss' : ''}${i < current ? ' done' : ''}${i === current ? ' current' : ''}`, {}, boss ? '\u2605' : '\u25CF'));
    }
  }
  strip.append(steps);
  return strip;
}

/** Draws the whole battle into `root`, replacing what was there. */
export function renderBattle(root: HTMLElement, state: BattleState, view: ViewOptions): void {
  const game = el('main', 'game');
  if (view.speed !== undefined) game.style.setProperty('--speed', String(view.speed));

  const top = el('header', 'topbar');
  const title = el('h1');
  title.innerHTML = `<span class="code">Code:</span> <span class="color">${GAME_TITLE.split(': ')[1] ?? GAME_TITLE}</span>`;
  const controls = el('div', 'controls');
  const select = el('select', '', { 'data-weapon': '', 'aria-label': 'Weapon (test setting)' });
  for (const w of WEAPON_LIST) {
    const option = el('option', '', { value: w.id }, w.label);
    if (w.id === state.weapon) option.selected = true;
    select.append(option);
  }
  if (view.testControls) controls.append(select);
  controls.append(el('button', '', { 'data-restart': '' }, view.restartLabel ?? 'Restart'));
  top.append(title, controls);

  const enemies = el('section', `enemies${view.bossFight ? ' boss-fight' : ''}`, { 'aria-label': 'Enemies' });
  for (let id = 0; id < (view.bossFight ? 1 : 3); id++) {
    const enemy = state.enemies.find((e) => e.id === id);
    enemies.append(enemy ? enemyCard(enemy, view) : el('div', 'enemy empty', {}, 'Defeated'));
  }

  const player = el('section', `player${view.playerHit ? ' hit' : ''}${state.heldMix === 'green' ? ' droppable' : ''}`, { 'aria-label': 'Player' });
  const row = el('div', 'row');
  row.append(el('span', '', {}, `You (${WEAPON_INFO[state.weapon].label})`), el('span', '', {}, `HP ${state.playerHp}/${PLAYER_START_HP}`));
  const bar = el('div', 'bar hp');
  bar.append(el('div', 'fill', { style: `width:${(state.playerHp / PLAYER_START_HP) * 100}%` }));
  player.append(row, bar);

  const message = el('div', `message${view.messageIsLock ? ' lock' : ''}`, { role: 'status', 'aria-live': 'polite' }, view.message);

  game.append(top);
  if (view.progress) game.append(progressStrip(view.progress));
  game.append(enemies, player, palette(state), message, board(state, view));

  if (view.overlay) {
    const overlay = el('div', 'overlay', { role: 'dialog', 'aria-label': view.overlay.title });
    overlay.append(el('h2', '', {}, view.overlay.title));
    for (const line of view.overlay.lines) overlay.append(el('p', '', {}, line));
    if (view.overlay.choices) {
      const choices = el('div', 'choices');
      for (const c of view.overlay.choices) {
        const button = el('button', 'choice', { 'data-choose': c.weapon });
        button.append(el('strong', '', {}, c.label), el('span', '', {}, c.description));
        choices.append(button);
      }
      overlay.append(choices);
    }
    if (view.overlay.button) {
      const attr = view.overlay.button.action === 'continue' ? 'data-continue' : 'data-restart';
      overlay.append(el('button', '', { [attr]: '' }, view.overlay.button.label));
    }
    game.append(overlay);
  }
  root.replaceChildren(game);
}
