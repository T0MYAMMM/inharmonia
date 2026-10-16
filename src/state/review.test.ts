import { describe, expect, it } from 'vitest';
import type { ProgressState } from './progress';
import { dueForReview, lastSevenDays, relativeDay, reviewIntervalDays } from './review';

const at = (iso: string) => new Date(iso);
const ex = (bestAccuracy: number, lastPracticed: string, attempts = 1) => ({
  attempts,
  bestAccuracy,
  bestTempo: null,
  lastPracticed,
});

describe('review', () => {
  it('brings shaky exercises back sooner', () => {
    expect(reviewIntervalDays(ex(0.5, ''))).toBe(1);
    expect(reviewIntervalDays(ex(0.8, ''))).toBe(2);
    expect(reviewIntervalDays(ex(0.95, '', 1))).toBe(7);
    expect(reviewIntervalDays(ex(1, '', 10))).toBe(21);
  });

  it('lists due exercises, most overdue then weakest, and skips unknown ids', () => {
    const state: ProgressState = {
      days: [],
      exercises: {
        shaky: ex(0.5, '2026-10-14T18:00:00Z'), // due 10-15 18:00
        solid: ex(0.95, '2026-10-14T18:00:00Z'), // due 10-21
        old: ex(0.8, '2026-10-01T10:00:00Z'), // due 10-03, very overdue
        gone: ex(0.1, '2026-10-01T10:00:00Z'),
        weak: ex(0.4, '2026-10-15T07:00:00Z'), // due 10-16 07:00, within grace
      },
    };
    const describe = (id: string) => (id === 'gone' ? null : id);
    const due = dueForReview(state, describe, { now: at('2026-10-16T05:00:00Z'), limit: 5 });
    expect(due.map((d) => d.id)).toEqual(['old', 'weak', 'shaky']);
    expect(due[0]!.overdueDays).toBe(12);
    expect(dueForReview(state, describe, { now: at('2026-10-16T05:00:00Z') })).toHaveLength(3);
  });

  it('describes the last seven days', () => {
    const now = new Date(2026, 9, 16, 12);
    const days = lastSevenDays({ exercises: {}, days: ['2026-10-10', '2026-10-16'] }, now);
    expect(days.map((d) => d.key)).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    expect(days.map((d) => d.practised)).toEqual([true, false, false, false, false, false, true]);
  });

  it('says when, in words', () => {
    const now = new Date(2026, 9, 16, 9);
    expect(relativeDay(new Date(2026, 9, 16, 1).toISOString(), now)).toBe('today');
    expect(relativeDay(new Date(2026, 9, 15, 23).toISOString(), now)).toBe('yesterday');
    expect(relativeDay(new Date(2026, 9, 12).toISOString(), now)).toBe('4 days ago');
    expect(relativeDay(new Date(2026, 8, 20).toISOString(), now)).toBe('4 weeks ago');
  });
});
