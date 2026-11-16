import type { BattleState, Enemy } from '../game/battle';
import type { Cell } from '../game/board';
import { GAME_TITLE } from '../game/title';
import { PAINT_COLORS, PAINT_MAX, PLAYER_START_HP, type Bottle, type MixColor, type PaintColor, type Weapon } from '../game/rules';

// Drawing only: this file turns a BattleState into DOM and decides nothing about the rules.

export interface ViewOptions {
  message: string;
  messageIsLock?: boolean;
  popCells?: Cell[]; // bottles to show shrinking away
  falls?: Map<string, number>; // rows each bottle falls, keyed by its new "row,col"
  shake?: Cell[]; // cells to shake (rejected swap)
  floats?: { enemyId: number; text: string }[]; // damage numbers
  attackedEnemies?: number[];
  playerHit?: boolean;
}

const WEAPONS: { id: Weapon; label: string }[] = [
  { id: 'paintballGun', label: 'Paintball gun' },
  { id: 'brush', label: 'Brush' },
  { id: 'roller', label: 'Roller' },
];

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

function enemyCard(enemy: Enemy, view: ViewOptions): HTMLElement {
  const card = el('div', `enemy${view.attackedEnemies?.includes(enemy.id) ? ' attack' : ''}`, {
    'data-enemy-id': String(enemy.id),
    role: 'group',
    'aria-label': `Canvas ${enemy.id + 1}: ${enemy.hp} of ${enemy.maxHp} HP, attacks in ${enemy.countdown} turns`,
  });
  card.append(el('h2', '', {}, `Canvas ${enemy.id + 1}`));
  const bar = el('div', 'bar');
  bar.append(el('div', 'fill', { style: `width:${(enemy.hp / enemy.maxHp) * 100}%` }));
  card.append(bar, el('div', '', {}, `HP ${enemy.hp}/${enemy.maxHp}`));
  card.append(el('div', 'countdown', {}, `Attacks in ${enemy.countdown}`));
  card.append(el('div', 'status', {}, enemy.burn ? `Burn ${enemy.burn.damage} x ${enemy.burn.turnsLeft}` : ''));
  for (const f of view.floats ?? []) {
    if (f.enemyId === enemy.id) card.append(el('span', 'float', {}, f.text));
  }
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
      const cell = el(
        'div',
        `cell bottle-${bottle}${has(view.popCells, row, col) ? ' pop' : ''}${has(view.shake, row, col) ? ' shake' : ''}${fall ? ' fall' : ''}`,
        { 'data-row': String(row), 'data-col': String(col), role: 'gridcell', 'aria-label': `${bottle} bottle, row ${row + 1}, column ${col + 1}` },
      );
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
    const held = el('div', 'held', { 'data-held': state.heldMix, 'aria-label': `Held ${state.heldMix} mix. Drag onto an enemy or a full paint bottle.` });
    held.append(shape(state.heldMix), el('span', '', {}, `${cap(state.heldMix)} mix`));
    root.append(held);
  } else {
    root.append(el('div', 'held-empty', {}, 'No mix held'));
  }
  return root;
}

/** Draws the whole battle into `root`, replacing what was there. */
export function renderBattle(root: HTMLElement, state: BattleState, view: ViewOptions): void {
  const game = el('main', 'game');

  const top = el('header', 'topbar');
  const title = el('h1');
  title.innerHTML = `<span class="code">Code:</span> <span class="color">${GAME_TITLE.split(': ')[1] ?? GAME_TITLE}</span>`;
  const controls = el('div', 'controls');
  const select = el('select', '', { 'data-weapon': '', 'aria-label': 'Weapon (test setting)' });
  for (const w of WEAPONS) {
    const option = el('option', '', { value: w.id }, w.label);
    if (w.id === state.weapon) option.selected = true;
    select.append(option);
  }
  controls.append(select, el('button', '', { 'data-restart': '' }, 'Restart'));
  top.append(title, controls);

  const enemies = el('section', 'enemies', { 'aria-label': 'Enemies' });
  for (let id = 0; id < 3; id++) {
    const enemy = state.enemies.find((e) => e.id === id);
    enemies.append(enemy ? enemyCard(enemy, view) : el('div', 'enemy empty', {}, 'Defeated'));
  }

  const player = el('section', `player${view.playerHit ? ' hit' : ''}`, { 'aria-label': 'Player' });
  const row = el('div', 'row');
  row.append(el('span', '', {}, 'You'), el('span', '', {}, `HP ${state.playerHp}/${PLAYER_START_HP}`));
  const bar = el('div', 'bar hp');
  bar.append(el('div', 'fill', { style: `width:${(state.playerHp / PLAYER_START_HP) * 100}%` }));
  player.append(row, bar);

  const message = el('div', `message${view.messageIsLock ? ' lock' : ''}`, { role: 'status', 'aria-live': 'polite' }, view.message);

  game.append(top, enemies, player, palette(state), message, board(state, view));

  if (state.status !== 'playing') {
    const overlay = el('div', 'overlay');
    overlay.append(
      el('h2', '', {}, state.status === 'won' ? 'You won!' : 'You lost'),
      el('button', '', { 'data-restart': '' }, 'Play again'),
    );
    game.append(overlay);
  }
  root.replaceChildren(game);
}
