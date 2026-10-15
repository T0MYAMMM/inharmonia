import { describe, expect, it } from 'vitest';
import { memoryStore } from '@/core/persistence/storage';
import { loadProgress, recordAttempt, streak } from './progress';

describe('progress', () => {
  it('keeps the best accuracy and counts attempts', () => {
    const store = memoryStore();
    recordAttempt('senja', { hits: 8, misses: 2 }, { store, now: new Date(2026, 9, 14, 10) });
    const p = recordAttempt(
      'senja',
      { hits: 5, misses: 5 },
      { store, now: new Date(2026, 9, 15, 10) },
    );
    expect(p).toMatchObject({ attempts: 2, bestAccuracy: 0.8, bestTempo: null });
    expect(loadProgress(store).exercises.senja!.lastPracticed).toBe(
      new Date(2026, 9, 15, 10).toISOString(),
    );
  });

  it('counts a streak of consecutive days', () => {
    const store = memoryStore();
    for (const day of [12, 13, 14])
      recordAttempt('x', { hits: 1, misses: 0 }, { store, now: new Date(2026, 9, day, 9) });
    const state = loadProgress(store);
    expect(streak(state, new Date(2026, 9, 14, 20))).toBe(3);
    expect(streak(state, new Date(2026, 9, 15, 8))).toBe(3); // today not practised yet
    expect(streak(state, new Date(2026, 9, 17, 8))).toBe(0);
  });

  it('starts empty when nothing is stored', () => {
    expect(loadProgress(memoryStore())).toEqual({ exercises: {}, days: [] });
  });
});
