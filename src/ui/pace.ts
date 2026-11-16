// How fast a cascade step plays. The first few steps play at normal speed; every step
// after that is a fixed fraction faster than the one before, down to a minimum.
// Tune these three numbers to change the feel.

export const NORMAL_STEPS = 3; // steps up to this one play at full length
export const SPEEDUP_PER_STEP = 0.75; // each later step takes this fraction of the previous step's time
export const MIN_SPEED_FACTOR = 0.3; // no step plays faster than this fraction of normal

/** Fraction of normal duration for a cascade step (1 = normal, smaller = faster). Steps count from 1. */
export function stepSpeed(step: number): number {
  if (step <= NORMAL_STEPS) return 1;
  return Math.max(MIN_SPEED_FACTOR, SPEEDUP_PER_STEP ** (step - NORMAL_STEPS));
}
