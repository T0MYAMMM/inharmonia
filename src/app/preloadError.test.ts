import { describe, expect, it, vi } from 'vitest';
import { RELOADED_KEY, reloadOnPreloadError } from './preloadError';

function memoryStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

/** A window with its own event target and a reload spy. */
function fakeWindow() {
  const events = new EventTarget();
  const reload = vi.fn();
  const target = Object.assign(events, { location: { reload } }) as unknown as Window;
  const fire = () => {
    const e = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { target, reload, fire };
}

describe('reloadOnPreloadError', () => {
  it('reloads once per session, then leaves the error to the page', () => {
    const { target, reload, fire } = fakeWindow();
    const store = memoryStore();
    reloadOnPreloadError(target, store);

    const first = fire();
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.getItem(RELOADED_KEY)).toBe('1');

    const second = fire();
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload after a reload earlier in the session', () => {
    const { target, reload, fire } = fakeWindow();
    const store = memoryStore();
    store.setItem(RELOADED_KEY, '1');
    reloadOnPreloadError(target, store);
    expect(fire().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads when it cannot remember having done so', () => {
    const { target, reload, fire } = fakeWindow();
    reloadOnPreloadError(target, null);
    expect(fire().defaultPrevented).toBe(false);

    const throwing = memoryStore();
    throwing.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const other = fakeWindow();
    reloadOnPreloadError(other.target, throwing);
    expect(other.fire().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(other.reload).not.toHaveBeenCalled();
  });
});
