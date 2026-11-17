import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SAVE_VERSION, loadUnlocked, saveUnlocked, type KeyValueStorage } from '../src/save/save';

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

describe('loading', () => {
  it('starts with only the default character when nothing is saved, and saving works', () => {
    expect(loadUnlocked(new FakeStorage())).toEqual({ unlocked: ['splat'], canSave: true });
  });

  it('gives the default character and no saving when storage is missing or blocked', () => {
    expect(loadUnlocked(null)).toEqual({ unlocked: ['splat'], canSave: false });
    expect(loadUnlocked(throwing('read'))).toEqual({ unlocked: ['splat'], canSave: false });
  });

  it('starts fresh, but can save, when the saved data is corrupt', () => {
    for (const raw of ['{not json', '[1,2', 'null', '"text"', '42', '{}', '{"version":1}']) {
      const storage = new FakeStorage();
      storage.data.set(SAVE_KEY, raw);
      expect(loadUnlocked(storage)).toMatchObject({ unlocked: ['splat'], canSave: true });
    }
  });

  it('ignores a save from another version', () => {
    const storage = new FakeStorage();
    storage.data.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION + 1, unlocked: ['splat', 'roll'] }));
    expect(loadUnlocked(storage).unlocked).toEqual(['splat']);
  });

  it('ignores unknown character names and wrong types, and removes duplicates', () => {
    const storage = new FakeStorage();
    storage.data.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, unlocked: ['roll', 'ghost', 7, null, 'roll', { id: 'stroke' }] }));
    expect(loadUnlocked(storage).unlocked).toEqual(['splat', 'roll']);
  });

  it('always includes the default character, even if the save left it out', () => {
    const storage = new FakeStorage();
    storage.data.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, unlocked: ['stroke'] }));
    expect(loadUnlocked(storage).unlocked).toEqual(['splat', 'stroke']);
  });

  it('ignores a list that is not a list', () => {
    const storage = new FakeStorage();
    storage.data.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, unlocked: 'roll' }));
    expect(loadUnlocked(storage).unlocked).toEqual(['splat']);
  });
});

describe('saving', () => {
  it('round-trips the unlocked characters, in the usual order', () => {
    const storage = new FakeStorage();
    expect(saveUnlocked(storage, ['roll', 'splat', 'stroke'])).toBe(true);
    expect(loadUnlocked(storage)).toEqual({ unlocked: ['splat', 'stroke', 'roll'], canSave: true });
  });

  it('saves only the unlocked list, with a version and nothing else', () => {
    const storage = new FakeStorage();
    saveUnlocked(storage, ['splat', 'stroke']);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({ version: SAVE_VERSION, unlocked: ['splat', 'stroke'] });
    expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
  });

  it('replaces a corrupt save', () => {
    const storage = new FakeStorage();
    storage.data.set(SAVE_KEY, '{broken');
    saveUnlocked(storage, ['splat', 'roll']);
    expect(loadUnlocked(storage).unlocked).toEqual(['splat', 'roll']);
  });

  it('reports failure, and does not throw, when storage is missing or cannot be written', () => {
    expect(saveUnlocked(null, ['splat'])).toBe(false);
    expect(saveUnlocked(throwing('write'), ['splat'])).toBe(false);
  });
});
