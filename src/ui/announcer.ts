import type { CharacterId } from '../game/characters';

/**
 * Remembers which characters were unlocked during a run and shows one popup for each, in order,
 * when the run is over or the player leaves it (Rerun or Menu). Nothing here touches the page: the
 * session asks what to show and calls `dismiss` when the player continues.
 *
 * Flow: `earn` as characters unlock; `flush(then)` when the run ends or the player tries to leave.
 * If something was earned, `flush` returns true, the popups show one by one, and `then` (what the
 * player was doing) runs when the last one is dismissed. If nothing was earned it returns false and
 * the caller just does the action.
 */
export class UnlockAnnouncer {
  private earned: CharacterId[] = [];
  private queue: CharacterId[] = [];
  private then: (() => void) | null = null;

  /** Records characters unlocked this run (a character is only ever recorded once). */
  earn(ids: CharacterId[]): void {
    for (const id of ids) if (!this.earned.includes(id) && !this.queue.includes(id)) this.earned.push(id);
  }

  /** Queues the popups for everything earned. Returns false (and queues nothing) if nothing was earned. */
  flush(then: () => void): boolean {
    if (this.queue.length > 0) return true; // already showing; keep the first action
    if (this.earned.length === 0) return false;
    this.queue = this.earned;
    this.earned = [];
    this.then = then;
    return true;
  }

  /** The character whose popup is showing, or null when none is. */
  current(): CharacterId | null {
    return this.queue[0] ?? null;
  }

  get showing(): boolean {
    return this.queue.length > 0;
  }

  /** Closes the current popup. After the last one, returns what the player was doing, once. */
  dismiss(): (() => void) | null {
    this.queue.shift();
    if (this.queue.length > 0) return null;
    const then = this.then;
    this.then = null;
    return then;
  }

  /** A new run starts: forget anything not yet shown. */
  reset(): void {
    this.earned = [];
    this.queue = [];
    this.then = null;
  }
}
