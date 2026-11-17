import { describe, expect, it } from 'vitest';
import { unlockMessage } from '../src/ui/unlocktext';

describe('unlock announcements', () => {
  it('say nothing when nothing was unlocked', () => {
    expect(unlockMessage([], true)).toEqual([]);
    expect(unlockMessage([], false)).toEqual([]);
  });

  it('name one character', () => {
    expect(unlockMessage(['stroke'], true)).toEqual(['Unlocked this run: Stroke!']);
  });

  it('list everything unlocked during the run, so a first-time winner sees both', () => {
    expect(unlockMessage(['stroke', 'roll'], true)).toEqual(['Unlocked this run: Stroke and Roll!']);
  });

  it('add a warning when progress cannot be saved', () => {
    expect(unlockMessage(['roll'], false)).toEqual([
      'Unlocked this run: Roll!',
      'Progress cannot be saved in this browser, so this will not be kept.',
    ]);
  });
});
