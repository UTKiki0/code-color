import type { Cell } from '../game/board';

// Short-lived floating text (damage, paint, combo). It lives on the page itself,
// not inside the redrawn game DOM, so it keeps animating while the board is redrawn.

export type FxKind = 'damage' | 'heal' | 'paint' | 'combo' | 'info';

/** Page position of the middle of an element. */
function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY };
}

function spawn(text: string, at: { x: number; y: number }, kind: FxKind, color?: string, dy = 0): void {
  const node = document.createElement('div');
  node.className = `fx fx-${kind}`;
  node.textContent = text;
  node.setAttribute('aria-hidden', 'true'); // the message line carries the same information
  node.style.left = `${at.x}px`;
  node.style.top = `${at.y + dy}px`;
  if (color) node.style.setProperty('--c', color);
  document.body.append(node);
  node.addEventListener('animationend', () => node.remove());
}

/** Floats text over the middle of a group of board cells (a match). */
export function floatOverCells(cells: Cell[], text: string, kind: FxKind, color?: string, dy = 0): void {
  const points = cells
    .map((c) => document.querySelector(`.cell[data-row="${c.row}"][data-col="${c.col}"]`))
    .filter((el): el is Element => el !== null)
    .map(centerOf);
  if (points.length === 0) return;
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  spawn(text, { x, y }, kind, color, dy);
}

export function floatOverEnemy(enemyId: number, text: string, kind: FxKind): void {
  const card = document.querySelector(`[data-enemy-id="${enemyId}"]`);
  if (!card) return;
  // Start at the card's top edge so the number rises away from the card's own text.
  const r = card.getBoundingClientRect();
  spawn(text, { x: r.left + r.width / 2 + window.scrollX, y: r.top + window.scrollY + 8 }, kind);
}

export function floatOverPlayer(text: string, kind: FxKind): void {
  const panel = document.querySelector('.player');
  if (panel) spawn(text, centerOf(panel), kind);
}
