import { describe, expect, it, vi } from 'vitest';
import { KeyLights } from './keyLights';

describe('KeyLights', () => {
  it('notifies only the key that changed', () => {
    const k = new KeyLights();
    const c = vi.fn();
    const d = vi.fn();
    k.subscribe(60, c);
    k.subscribe(62, d);
    k.set(60, 'rh', true);
    k.set(60, 'rh', true); // no-op
    expect(c).toHaveBeenCalledTimes(1);
    expect(d).not.toHaveBeenCalled();
    expect(k.has(60, 'rh')).toBe(true);
  });

  it('sets a layer on exactly a set of keys', () => {
    const k = new KeyLights();
    k.setExactly('lh', [48, 52]);
    k.setExactly('lh', [52, 55]);
    expect(k.has(48, 'lh')).toBe(false);
    expect(k.has(52, 'lh')).toBe(true);
    expect(k.has(55, 'lh')).toBe(true);
  });

  it('flashes and clears after the duration', () => {
    vi.useFakeTimers();
    const k = new KeyLights();
    k.flash(60, 'wrong', 260);
    expect(k.has(60, 'wrong')).toBe(true);
    vi.advanceTimersByTime(259);
    expect(k.has(60, 'wrong')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(k.has(60, 'wrong')).toBe(false);
    vi.useRealTimers();
  });
});
