import {
  readVersioned,
  storage,
  writeVersioned,
  type KeyValueStore,
} from '@/core/persistence/storage';

/** Per-exercise progress. Stored as plain JSON so a backend can sync it later. */
export interface ExerciseProgress {
  attempts: number;
  /** 0..1 */
  bestAccuracy: number;
  /** Highest tempo completed (timed modes); null for wait-mode practice. */
  bestTempo: number | null;
  /** ISO timestamp. */
  lastPracticed: string;
}

export interface ProgressState {
  exercises: Record<string, ExerciseProgress>;
  /** Local calendar days with any finished attempt, "YYYY-MM-DD", newest last. */
  days: string[];
}

const KEY = 'progress';
const VERSION = 1;
const EMPTY: ProgressState = { exercises: {}, days: [] };

const isProgress = (x: unknown): x is ProgressState =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as ProgressState).exercises === 'object' &&
  Array.isArray((x as ProgressState).days);

export function loadProgress(store: KeyValueStore = storage): ProgressState {
  return readVersioned(store, KEY, { version: VERSION, fallback: EMPTY, validate: isProgress });
}

const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Record a finished attempt. Accuracy is hits / (hits + misses). */
export function recordAttempt(
  exerciseId: string,
  result: { hits: number; misses: number; tempo?: number },
  opts: { store?: KeyValueStore; now?: Date } = {},
): ExerciseProgress {
  const store = opts.store ?? storage;
  const now = opts.now ?? new Date();
  const state = loadProgress(store);
  const total = result.hits + result.misses;
  const accuracy = total > 0 ? result.hits / total : 0;
  const prev = state.exercises[exerciseId];
  const next: ExerciseProgress = {
    attempts: (prev?.attempts ?? 0) + 1,
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
    bestTempo:
      result.tempo === undefined
        ? (prev?.bestTempo ?? null)
        : Math.max(prev?.bestTempo ?? 0, result.tempo),
    lastPracticed: now.toISOString(),
  };
  const day = dayOf(now);
  const days = state.days.at(-1) === day ? state.days : [...state.days, day].slice(-366);
  writeVersioned(store, KEY, VERSION, {
    exercises: { ...state.exercises, [exerciseId]: next },
    days,
  });
  return next;
}

/** Consecutive days practiced, ending today or yesterday. */
export function streak(state: ProgressState, now: Date = new Date()): number {
  const set = new Set(state.days);
  const d = new Date(now);
  if (!set.has(dayOf(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayOf(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
