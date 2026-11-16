import { describe, expect, it } from 'vitest';
import { MIN_SPEED_FACTOR, NORMAL_STEPS, stepSpeed } from '../src/ui/pace';

describe('stepSpeed', () => {
  it('plays the first three steps at normal speed', () => {
    for (let step = 1; step <= NORMAL_STEPS; step++) expect(stepSpeed(step)).toBe(1);
  });

  it('makes every step after the third faster than the one before', () => {
    let previous = stepSpeed(NORMAL_STEPS);
    for (let step = NORMAL_STEPS + 1; step <= NORMAL_STEPS + 3; step++) {
      expect(stepSpeed(step)).toBeLessThan(previous);
      previous = stepSpeed(step);
    }
  });

  it('never goes below the minimum, however long the combo', () => {
    expect(stepSpeed(50)).toBe(MIN_SPEED_FACTOR);
    for (let step = 1; step <= 50; step++) expect(stepSpeed(step)).toBeGreaterThanOrEqual(MIN_SPEED_FACTOR);
  });
});
