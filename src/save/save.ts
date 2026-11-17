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
function normalize(ids: unknown): CharacterId[] {
  const wanted = new Set<unknown>([...defaultUnlocked(), ...(Array.isArray(ids) ? ids : [])]);
  return CHARACTERS.filter((c) => wanted.has(c.id)).map((c) => c.id);
}

export interface LoadResult {
  unlocked: CharacterId[];
  canSave: boolean; // false when storage is missing or blocked: progress cannot be kept
}

/** Reads the unlocked characters. Missing, corrupt, or unknown data gives the default characters. */
export function loadUnlocked(storage: KeyValueStorage | null): LoadResult {
  if (!storage) return { unlocked: defaultUnlocked(), canSave: false };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { unlocked: defaultUnlocked(), canSave: false };
  }
  if (raw === null) return { unlocked: defaultUnlocked(), canSave: true };
  try {
    const data = JSON.parse(raw) as { version?: unknown; unlocked?: unknown } | null;
    if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return { unlocked: defaultUnlocked(), canSave: true };
    return { unlocked: normalize(data.unlocked), canSave: true };
  } catch {
    return { unlocked: defaultUnlocked(), canSave: true }; // corrupt: start fresh; the next save replaces it
  }
}

/** Saves the unlocked characters. Returns false if storage is missing, full, or blocked. */
export function saveUnlocked(storage: KeyValueStorage | null, unlocked: CharacterId[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, unlocked: normalize(unlocked) }));
    return true;
  } catch {
    return false;
  }
}
