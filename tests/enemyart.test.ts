import { describe, expect, it } from 'vitest';
import { createRng } from '../src/game/rng';
import { FACES, dealFaces } from '../src/ui/enemyart';

describe('dealing faces to enemies', () => {
  it('gives each of three enemies a different, real face', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const faces = dealFaces(3, createRng(seed));
      expect(faces).toHaveLength(3);
      expect(new Set(faces).size).toBe(3);
      for (const f of faces) expect(FACES).toContain(f);
    }
  });

  it('is repeatable for the same seed, and different seeds give different deals', () => {
    expect(dealFaces(3, createRng(7))).toEqual(dealFaces(3, createRng(7)));
    const deals = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) deals.add(dealFaces(3, createRng(seed)).join());
    expect(deals.size).toBeGreaterThan(8); // 24 possible deals of 3 from 4
  });

  it('uses every face when dealing four, and all four can be left out of a deal of three', () => {
    expect(new Set(dealFaces(4, createRng(3)))).toEqual(new Set(FACES));
    const missing = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const dealt = new Set(dealFaces(3, createRng(seed)));
      missing.add(FACES.find((f) => !dealt.has(f))!);
    }
    expect(missing.size).toBe(4);
  });

  it('starts over when there are more enemies than faces, and deals nothing for none', () => {
    const six = dealFaces(6, createRng(5));
    expect(six).toHaveLength(6);
    expect(new Set(six.slice(0, 4)).size).toBe(4);
    expect(dealFaces(0, createRng(5))).toEqual([]);
  });
});
