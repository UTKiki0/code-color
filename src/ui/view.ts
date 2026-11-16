import type { BattleState, Enemy } from '../game/battle';
import type { Cell } from '../game/board';
import { GAME_TITLE } from '../game/title';
import { WEAPON_INFO, WEAPON_LIST } from './weapons';
import { PAINT_COLORS, PAINT_MAX, PLAYER_START_HP, type Bottle, type MixColor, type PaintColor, type Weapon } from '../game/rules';

// Drawing only: this file turns a BattleState into DOM and decides nothing about the rules.

export interface ViewOptions {
  message: string;
  messageIsLock?: boolean;
  popCells?: Cell[]; // bottles to show shrinking away
  falls?: Map<string, number>; // rows each bottle falls, keyed by its new "row,col"
  shake?: Cell[]; // cells to shake (rejected swap)
  speed?: number; // 1 = normal; smaller makes this frame's animations shorter
  attackedEnemies?: number[];
  playerHit?: boolean;
  // Run display. These stay the same for every frame of a battle, so replay frames repeat them.
  progress?: { stage: number; encounter: 'battle' | 'boss'; stages: number };
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

function enemyCard(enemy: Enemy, view: ViewOptions): HTMLElement {
  const name = view.bossFight ? 'Boss' : `Canvas ${enemy.id + 1}`;
  const card = el('div', `enemy${view.bossFight ? ' boss' : ''}${view.attackedEnemies?.includes(enemy.id) ? ' attack' : ''}`, {
    'data-enemy-id': String(enemy.id),
    role: 'group',
    'aria-label': `${name}: ${Math.max(0, enemy.hp)} of ${enemy.maxHp} HP, attacks in ${enemy.countdown} turns`,
  });
  card.append(el('h2', '', {}, name));
  const bar = el('div', 'bar');
  const hp = Math.max(0, enemy.hp); // enemies can be shown below zero HP while a move is replayed
  bar.append(el('div', 'fill', { style: `width:${(hp / enemy.maxHp) * 100}%` }));
  card.append(bar, el('div', '', {}, `HP ${hp}/${enemy.maxHp}`));
  card.append(el('div', 'countdown', {}, `Attacks in ${enemy.countdown}`));
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

/** The run's position: six steps (a battle and a boss in each of three stages). */
function progressStrip(p: NonNullable<ViewOptions['progress']>): HTMLElement {
  const current = p.stage * 2 + (p.encounter === 'boss' ? 1 : 0);
  const kind = p.encounter === 'boss' ? 'Boss' : 'Battle';
  const strip = el('div', 'progress', { role: 'img', 'aria-label': `Stage ${p.stage + 1} of ${p.stages}: ${kind}` });
  strip.append(el('span', 'progress-label', {}, `Stage ${p.stage + 1}/${p.stages}: ${kind}`));
  const steps = el('div', 'steps', { 'aria-hidden': 'true' });
  for (let i = 0; i < p.stages * 2; i++) {
    const boss = i % 2 === 1;
    // Done steps are filled, the current step is outlined and bold, and bosses use a star:
    // position is not shown by color alone.
    steps.append(el('span', `step${boss ? ' boss' : ''}${i < current ? ' done' : ''}${i === current ? ' current' : ''}`, {}, boss ? '\u2605' : '\u25CF'));
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

  const player = el('section', `player${view.playerHit ? ' hit' : ''}`, { 'aria-label': 'Player' });
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
