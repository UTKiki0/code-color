import { describe, expect, it } from 'vitest';
import { GAME_TITLE } from '../src/game/title';

describe('project setup', () => {
  it('loads the game module without a DOM', () => {
    expect(GAME_TITLE).toBe('Code: Color');
  });
});
