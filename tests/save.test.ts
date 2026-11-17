import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SAVE_VERSION, loadProgress, saveProgress, type KeyValueStorage } from '../src/save/save';

// An in-memory stand-in for localStorage.
class FakeStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
// Storage that throws, like a blocked or full localStorage.
const throwing = (when: 'read' | 'write'): KeyValueStorage => ({
  getItem() { if (when === 'read') throw new Error('blocked'); return null; },
  setItem() { if (when === 'write') throw new Error('full'); },
});
const withSave = (value: unknown) => {
  const storage = new FakeStorage();
  storage.data.set(SAVE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  return storage;
};
const FRESH = { unlocked: ['splat'], pending: [] };

describe('loading', () => {
  it('starts with only the default character when nothing is saved, and saving works', () => {
    expect(loadProgress(new FakeStorage())).toEqual({ ...FRESH, canSave: true });
  });

  it('gives a fresh start and no saving when storage is missing or blocked', () => {
    expect(loadProgress(null)).toEqual({ ...FRESH, canSave: false });
    expect(loadProgress(throwing('read'))).toEqual({ ...FRESH, canSave: false });
  });

  it('starts fresh, but can save, when the saved data is corrupt', () => {
    for (const raw of ['{not json', '[1,2', 'null', '"text"', '42', '{}', '{"version":1}']) {
      expect(loadProgress(withSave(raw))).toMatchObject({ ...FRESH, canSave: true });
    }
  });

  it('ignores a save from another version', () => {
    const result = loadProgress(withSave({ version: SAVE_VERSION + 1, unlocked: ['splat', 'roll'], pending: ['roll'] }));
    expect(result).toMatchObject(FRESH);
  });

  it('ignores unknown character names and wrong types, and removes duplicates', () => {
    const result = loadProgress(withSave({ version: SAVE_VERSION, unlocked: ['roll', 'ghost', 7, null, 'roll', { id: 'stroke' }] }));
    expect(result.unlocked).toEqual(['splat', 'roll']);
  });

  it('always includes the default character, even if the save left it out', () => {
    expect(loadProgress(withSave({ version: SAVE_VERSION, unlocked: ['stroke'] })).unlocked).toEqual(['splat', 'stroke']);
  });

  it('ignores a list that is not a list', () => {
    expect(loadProgress(withSave({ version: SAVE_VERSION, unlocked: 'roll', pending: 'roll' }))).toMatchObject(FRESH);
  });
});

describe('characters waiting to be announced (pending)', () => {
  it('are loaded back, in the usual order', () => {
    const result = loadProgress(withSave({ version: SAVE_VERSION, unlocked: ['splat', 'stroke', 'roll'], pending: ['roll', 'stroke'] }));
    expect(result.pending).toEqual(['stroke', 'roll']);
  });

  it('are empty for a save made before the list existed', () => {
    expect(loadProgress(withSave({ version: SAVE_VERSION, unlocked: ['splat', 'stroke'] })).pending).toEqual([]);
  });

  it('only count characters that are unlocked, so a pending name cannot unlock anyone', () => {
    const result = loadProgress(withSave({ version: SAVE_VERSION, unlocked: ['splat'], pending: ['roll'] }));
    expect(result.unlocked).toEqual(['splat']);
    expect(result.pending).toEqual([]);
  });

  it('never include the default character, or unknown names, or duplicates', () => {
    const result = loadProgress(withSave({ version: SAVE_VERSION, unlocked: ['splat', 'stroke'], pending: ['splat', 'ghost', 'stroke', 'stroke', 9] }));
    expect(result.pending).toEqual(['stroke']);
  });
});

describe('saving', () => {
  it('round-trips the unlocked and pending characters, in the usual order', () => {
    const storage = new FakeStorage();
    expect(saveProgress(storage, { unlocked: ['roll', 'splat', 'stroke'], pending: ['roll', 'stroke'] })).toBe(true);
    expect(loadProgress(storage)).toEqual({ unlocked: ['splat', 'stroke', 'roll'], pending: ['stroke', 'roll'], canSave: true });
  });

  it('saves a version and the two lists, and nothing else', () => {
    const storage = new FakeStorage();
    saveProgress(storage, { unlocked: ['splat', 'stroke'], pending: ['stroke'] });
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({ version: SAVE_VERSION, unlocked: ['splat', 'stroke'], pending: ['stroke'] });
    expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
  });

  it('can clear the pending list once the popups have been shown', () => {
    const storage = new FakeStorage();
    saveProgress(storage, { unlocked: ['splat', 'stroke'], pending: ['stroke'] });
    saveProgress(storage, { unlocked: ['splat', 'stroke'], pending: [] });
    expect(loadProgress(storage)).toMatchObject({ unlocked: ['splat', 'stroke'], pending: [] });
  });

  it('replaces a corrupt save', () => {
    const storage = withSave('{broken');
    saveProgress(storage, { unlocked: ['splat', 'roll'], pending: ['roll'] });
    expect(loadProgress(storage)).toMatchObject({ unlocked: ['splat', 'roll'], pending: ['roll'] });
  });

  it('reports failure, and does not throw, when storage is missing or cannot be written', () => {
    expect(saveProgress(null, FRESH as never)).toBe(false);
    expect(saveProgress(throwing('write'), FRESH as never)).toBe(false);
  });
});
