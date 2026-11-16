import type { Cell } from '../game/board';
import type { PaintColor, Weapon } from '../game/rules';
import { shape } from './view';

// Turns Pointer Events (mouse and touch) into commands. It makes no rule decisions.

export interface Commands {
  busy(): boolean;
  swap(a: Cell, b: Cell): void;
  spend(color: PaintColor, enemyId: number): void;
  mix(a: PaintColor, b: PaintColor): void;
  useMix(target: { enemyId: number } | { color: PaintColor }): void;
  setWeapon(weapon: Weapon): void;
  continueRun(): void;
  restart(): void;
}

type Gesture =
  | { kind: 'swipe'; pointerId: number; x: number; y: number; cell: Cell; size: number; done: boolean }
  | { kind: 'paint'; pointerId: number; color: PaintColor; ghost: HTMLElement }
  | { kind: 'held'; pointerId: number; ghost: HTMLElement };

const SWIPE_FRACTION = 0.35; // fraction of a cell the pointer must travel to count as a swipe

export function attachInput(root: HTMLElement, commands: Commands): void {
  let gesture: Gesture | null = null;

  const end = () => {
    if (gesture && gesture.kind !== 'swipe') gesture.ghost.remove();
    gesture = null;
    root.classList.remove('dragging');
  };

  const makeGhost = (type: string, x: number, y: number) => {
    const ghost = shape(type as never);
    ghost.classList.add('ghost');
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    document.body.append(ghost);
    root.classList.add('dragging');
    return ghost;
  };

  root.addEventListener('pointerdown', (e) => {
    if (gesture || commands.busy()) return;
    const target = e.target as HTMLElement;

    const cellEl = target.closest<HTMLElement>('[data-row]');
    if (cellEl) {
      const rect = cellEl.getBoundingClientRect();
      gesture = {
        kind: 'swipe', pointerId: e.pointerId, x: e.clientX, y: e.clientY, done: false, size: rect.width,
        cell: { row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) },
      };
      root.setPointerCapture(e.pointerId);
      return;
    }
    const storeEl = target.closest<HTMLElement>('[data-paint]');
    if (storeEl && Number(storeEl.dataset.count) > 0) {
      const color = storeEl.dataset.paint as PaintColor;
      gesture = { kind: 'paint', pointerId: e.pointerId, color, ghost: makeGhost(color, e.clientX, e.clientY) };
      root.setPointerCapture(e.pointerId);
      return;
    }
    const heldEl = target.closest<HTMLElement>('[data-held]');
    if (heldEl) {
      gesture = { kind: 'held', pointerId: e.pointerId, ghost: makeGhost(heldEl.dataset.held!, e.clientX, e.clientY) };
      root.setPointerCapture(e.pointerId);
    }
  });

  root.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    if (gesture.kind !== 'swipe') {
      gesture.ghost.style.left = `${e.clientX}px`;
      gesture.ghost.style.top = `${e.clientY}px`;
      return;
    }
    if (gesture.done) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < gesture.size * SWIPE_FRACTION) return;
    // Only the dominant direction counts, so a diagonal swipe picks one neighbor.
    const { row, col } = gesture.cell;
    const neighbor = Math.abs(dx) > Math.abs(dy)
      ? { row, col: col + Math.sign(dx) }
      : { row: row + Math.sign(dy), col };
    gesture.done = true;
    commands.swap(gesture.cell, neighbor);
  });

  root.addEventListener('pointerup', (e) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const g = gesture;
    end();
    if (g.kind === 'swipe') return;
    // The ghost ignores pointer events, so this finds the element under the finger.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const enemyEl = under?.closest<HTMLElement>('[data-enemy-id]');
    const storeEl = under?.closest<HTMLElement>('[data-paint]');
    if (g.kind === 'paint') {
      if (enemyEl) commands.spend(g.color, Number(enemyEl.dataset.enemyId));
      else if (storeEl && storeEl.dataset.paint !== g.color) commands.mix(g.color, storeEl.dataset.paint as PaintColor);
    } else if (enemyEl) {
      commands.useMix({ enemyId: Number(enemyEl.dataset.enemyId) });
    } else if (storeEl) {
      commands.useMix({ color: storeEl.dataset.paint as PaintColor });
    }
  });

  root.addEventListener('pointercancel', end);

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-restart]')) commands.restart();
    else if (target.closest('[data-continue]')) commands.continueRun();
  });
  root.addEventListener('change', (e) => {
    const select = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-weapon]');
    if (select) commands.setWeapon(select.value as Weapon);
  });
}
