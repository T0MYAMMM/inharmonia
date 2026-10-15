import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore, readVersioned, storage, writeVersioned } from './storage';

const isNum = (x: unknown): x is { n: number } =>
  typeof x === 'object' && x !== null && typeof (x as { n: unknown }).n === 'number';

describe('versioned storage', () => {
  it('round-trips and falls back when empty or corrupt', () => {
    const s = memoryStore();
    const opts = { version: 1, fallback: { n: 0 }, validate: isNum };
    expect(readVersioned(s, 'k', opts)).toEqual({ n: 0 });
    writeVersioned(s, 'k', 1, { n: 5 });
    expect(readVersioned(s, 'k', opts)).toEqual({ n: 5 });
    s.set('k', '{not json');
    expect(readVersioned(s, 'k', opts)).toEqual({ n: 0 });
    s.set('k', JSON.stringify({ version: 1, state: { n: 'x' } }));
    expect(readVersioned(s, 'k', opts)).toEqual({ n: 0 });
  });

  it('migrates old versions', () => {
    const s = memoryStore();
    s.set('k', JSON.stringify({ version: 0, state: { count: 3 } }));
    const out = readVersioned(s, 'k', {
      version: 1,
      fallback: { n: 0 },
      validate: isNum,
      migrate: { 0: (old) => ({ n: (old as { count: number }).count }) },
    });
    expect(out).toEqual({ n: 3 });
  });
});

describe('safe localStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps working in memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(storage.set('x', '1')).toBe(false);
    expect(storage.get('x')).toBe('1');
  });
});
