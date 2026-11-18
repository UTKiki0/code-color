import type { Rng } from '../game/rng';

// Which picture each enemy gets from art/Canvases_Normal.png. The sheet has four canvases with
// faces (the regular enemies) and a blank one (the boss, for now). The faces are cosmetic: they
// are dealt with their own random numbers so they never change how a game plays out.

export const FACES = ['tongue', 'angry', 'happy', 'neutral'] as const;
export type Face = (typeof FACES)[number] | 'blank';

/**
 * Deals a face to each of `count` enemies. Faces are not repeated within a battle while there are
 * enough of them (four faces, three enemies); with more enemies than faces they start over.
 */
export function dealFaces(count: number, rng: Rng): Face[] {
  const dealt: Face[] = [];
  let pool: Face[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool = [...FACES];
    dealt.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  }
  return dealt;
}
