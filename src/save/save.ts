import { CHARACTERS, type CharacterId } from '../game/characters';
import { defaultUnlocked } from '../game/unlocks';

// Saving: only the list of unlocked characters, in the browser's localStorage. Weapon, paint, and
// HP are never saved, so they reset between runs. Anything wrong with storage means a fresh
// start with the default characters, never a crash.

export const SAVE_KEY = 'code-color-save';
export const SAVE_VERSION = 1;

// The part of localStorage used here, so tests can pass a fake.
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null when it is missing or blocked (some private windows throw). */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Keeps only real character ids, adds the default characters, and uses the usual order. */
function normalizeUnlocked(ids: unknown): CharacterId[] {
  const wanted = new Set<unknown>([...defaultUnlocked(), ...(Array.isArray(ids) ? ids : [])]);
  return CHARACTERS.filter((c) => wanted.has(c.id)).map((c) => c.id);
}

/** Pending characters must be unlocked ones that need announcing (never a default character). */
function normalizePending(ids: unknown, unlocked: CharacterId[]): CharacterId[] {
  const wanted = new Set<unknown>(Array.isArray(ids) ? ids : []);
  return CHARACTERS.filter((c) => c.unlock !== null && unlocked.includes(c.id) && wanted.has(c.id)).map((c) => c.id);
}

// What is saved: who is unlocked, and who was unlocked but has not yet been announced with a popup
// (for example because the page was closed mid-run), so the popup can show when the game reopens.
export interface Progress {
  unlocked: CharacterId[];
  pending: CharacterId[];
}

export interface LoadResult extends Progress {
  canSave: boolean; // false when storage is missing or blocked: progress cannot be kept
}

const fresh = (canSave: boolean): LoadResult => ({ unlocked: defaultUnlocked(), pending: [], canSave });

/** Reads the saved progress. Missing, corrupt, or unknown data gives a fresh start. */
export function loadProgress(storage: KeyValueStorage | null): LoadResult {
  if (!storage) return fresh(false);
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return fresh(false);
  }
  if (raw === null) return fresh(true);
  try {
    const data = JSON.parse(raw) as { version?: unknown; unlocked?: unknown; pending?: unknown } | null;
    if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return fresh(true);
    const unlocked = normalizeUnlocked(data.unlocked);
    // A save from before pending existed has no such list, which means nothing is waiting.
    return { unlocked, pending: normalizePending(data.pending, unlocked), canSave: true };
  } catch {
    return fresh(true); // corrupt: start fresh; the next save replaces it
  }
}

/** Saves the progress. Returns false if storage is missing, full, or blocked. */
export function saveProgress(storage: KeyValueStorage | null, progress: Progress): boolean {
  if (!storage) return false;
  try {
    const unlocked = normalizeUnlocked(progress.unlocked);
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, unlocked, pending: normalizePending(progress.pending, unlocked) }));
    return true;
  } catch {
    return false;
  }
}
