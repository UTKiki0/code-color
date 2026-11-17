import { describe, expect, it, vi } from 'vitest';
import { UnlockAnnouncer } from '../src/ui/announcer';

describe('the unlock announcer', () => {
  it('shows nothing, and lets the action happen, when nothing was unlocked', () => {
    const a = new UnlockAnnouncer();
    const then = vi.fn();
    expect(a.flush(then)).toBe(false);
    expect(a.showing).toBe(false);
    expect(a.current()).toBeNull();
    expect(then).not.toHaveBeenCalled(); // the caller does the action itself
  });

  it('shows nothing while a run is still going: earning alone does not show a popup', () => {
    const a = new UnlockAnnouncer();
    a.earn(['stroke']);
    expect(a.showing).toBe(false);
  });

  it('shows one popup for a character when the run ends, then runs what came next', () => {
    const a = new UnlockAnnouncer();
    const then = vi.fn();
    a.earn(['stroke']);
    expect(a.flush(then)).toBe(true);
    expect(a.current()).toBe('stroke');
    expect(then).not.toHaveBeenCalled();
    expect(a.dismiss()).toBe(then);
    expect(a.showing).toBe(false);
  });

  it('shows one popup for each character, in the order unlocked, and runs the action only after the last', () => {
    const a = new UnlockAnnouncer();
    const then = vi.fn();
    a.earn(['stroke']);
    a.earn(['roll']);
    a.flush(then);
    expect(a.current()).toBe('stroke');
    expect(a.dismiss()).toBeNull(); // another popup follows
    expect(a.current()).toBe('roll');
    expect(a.dismiss()).toBe(then);
    expect(a.current()).toBeNull();
  });

  it('hands back the action only once', () => {
    const a = new UnlockAnnouncer();
    a.earn(['roll']);
    a.flush(() => undefined);
    expect(a.dismiss()).not.toBeNull();
    expect(a.dismiss()).toBeNull();
  });

  it('shows a character only once, even if it is earned twice', () => {
    const a = new UnlockAnnouncer();
    a.earn(['stroke', 'stroke']);
    a.flush(() => undefined);
    a.earn(['stroke']); // earned again while its popup is showing
    expect(a.dismiss()).not.toBeNull();
    expect(a.showing).toBe(false);
  });

  it('does not show announced characters again at the next flush', () => {
    const a = new UnlockAnnouncer();
    a.earn(['stroke']);
    a.flush(() => undefined);
    a.dismiss();
    expect(a.flush(() => undefined)).toBe(false);
  });

  it('keeps the first action if it is flushed again while a popup is showing', () => {
    const a = new UnlockAnnouncer();
    const first = vi.fn();
    const second = vi.fn();
    a.earn(['stroke']);
    a.flush(first);
    expect(a.flush(second)).toBe(true);
    expect(a.dismiss()).toBe(first);
  });

  it('forgets unshown characters when a new run starts', () => {
    const a = new UnlockAnnouncer();
    a.earn(['stroke']);
    a.reset();
    expect(a.flush(() => undefined)).toBe(false);
    a.earn(['roll']);
    a.flush(() => undefined);
    a.reset();
    expect(a.showing).toBe(false);
  });
});
