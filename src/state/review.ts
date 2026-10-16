import type { ExerciseProgress, ProgressState } from './progress';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Days until an exercise is worth another look. Shaky ones come back the next
 * day; solid ones after a week, then longer as they keep being played.
 */
export function reviewIntervalDays(p: ExerciseProgress): number {
  if (p.bestAccuracy < 0.7) return 1;
  if (p.bestAccuracy < 0.9) return 2;
  return Math.min(21, 4 + 3 * Math.min(p.attempts, 6));
}

export interface ReviewItem<T> {
  id: string;
  info: T;
  progress: ExerciseProgress;
  /** Days overdue (0 = due today). */
  overdueDays: number;
}

/**
 * What to look at today: practised exercises whose interval has passed, most
 * overdue first, weakest first on ties. `describe` maps an id to what to show
 * for it, or null to leave it out (an exercise that no longer exists).
 */
export function dueForReview<T>(
  state: ProgressState,
  describe: (id: string) => T | null,
  opts: { now?: Date; limit?: number } = {},
): ReviewItem<T>[] {
  const now = (opts.now ?? new Date()).getTime();
  const out: ReviewItem<T>[] = [];
  for (const [id, progress] of Object.entries(state.exercises)) {
    const info = describe(id);
    if (!info) continue;
    const last = Date.parse(progress.lastPracticed);
    if (Number.isNaN(last)) continue;
    const due = last + reviewIntervalDays(progress) * DAY;
    // Half a day's grace, so yesterday evening's practice is due this morning.
    const overdue = (now - due) / DAY;
    if (overdue < -0.5) continue;
    out.push({ id, info, progress, overdueDays: Math.max(0, Math.floor(overdue)) });
  }
  out.sort(
    (a, b) => b.overdueDays - a.overdueDays || a.progress.bestAccuracy - b.progress.bestAccuracy,
  );
  return out.slice(0, opts.limit ?? 3);
}

/** The last seven local days, oldest first, with whether each was practised. */
export function lastSevenDays(state: ProgressState, now: Date = new Date()) {
  const set = new Set(state.days);
  const out: { date: Date; key: string; practised: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: d, key, practised: set.has(key) });
  }
  return out;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago". */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
