import { chroma, pitchClassName, type SpelledNote } from '../theory';
import type { Strictness } from '../content/types';

/** What a chord exercise asks for. */
export interface ChordTarget {
  /** Chord tones as pitch classes (0–11). */
  chromas: number[];
  /** Pitch class (0–11) of the lowest written note. */
  bassChroma: number;
  /** The written voicing, MIDI, lowest first. */
  midis: number[];
}

export function chordTarget(voicing: readonly SpelledNote[]): ChordTarget {
  const midis = voicing.map((n) => n.midi).sort((a, b) => a - b);
  return {
    chromas: [...new Set(voicing.map((n) => chroma(pitchClassName(n.name))))],
    bassChroma: chroma(midis[0] ?? 0),
    midis,
  };
}

export type ChordMatchStatus =
  | 'idle' // nothing held
  | 'partial' // only chord tones so far, some missing
  | 'wrong-bass' // the right notes, but strictness wants a different lowest note
  | 'match'
  | 'wrong'; // something held that is not in the chord

export interface ChordMatch {
  status: ChordMatchStatus;
  /** Held notes that do not belong (MIDI). */
  extra: number[];
  /** Chord tones not yet held (pitch classes for pitch-class/inversion, MIDI for exact). */
  missing: number[];
}

/**
 * Compare held notes with a target chord.
 * - pitch-class: every chord tone held in any octave, doublings allowed, nothing else.
 * - inversion: as pitch-class, and the lowest held note is the written bass.
 * - exact: exactly the written notes.
 */
export function matchChord(
  held: readonly number[],
  target: ChordTarget,
  strictness: Strictness,
): ChordMatch {
  if (held.length === 0) {
    return {
      status: 'idle',
      extra: [],
      missing: strictness === 'exact' ? [...target.midis] : [...target.chromas],
    };
  }
  if (strictness === 'exact') {
    const want = new Set(target.midis);
    const have = new Set(held);
    const extra = held.filter((m) => !want.has(m));
    const missing = target.midis.filter((m) => !have.has(m));
    return {
      status: extra.length ? 'wrong' : missing.length ? 'partial' : 'match',
      extra,
      missing,
    };
  }
  const tones = new Set(target.chromas);
  const extra = held.filter((m) => !tones.has(chroma(m)));
  const heldChromas = new Set(held.map(chroma));
  const missing = target.chromas.filter((c) => !heldChromas.has(c));
  if (extra.length) return { status: 'wrong', extra, missing };
  if (missing.length) return { status: 'partial', extra, missing };
  if (strictness === 'inversion' && chroma(Math.min(...held)) !== target.bassChroma) {
    return { status: 'wrong-bass', extra, missing };
  }
  return { status: 'match', extra, missing };
}

/** Is this single note acceptable as part of the target (used to flag a wrong press at once)? */
export function belongsToChord(midi: number, target: ChordTarget, strictness: Strictness): boolean {
  return strictness === 'exact'
    ? target.midis.includes(midi)
    : target.chromas.includes(chroma(midi));
}

export interface Timers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realTimers: Timers = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Listens to held notes and decides when a chord has been played.
 *
 * A match must hold steady for `settleMs` before it counts, so rolling a chord
 * or adding a wrong note a moment later is judged on the final shape. With
 * `windowMs` set (timed modes), all chord tones must also have gone down within
 * that window of each other; in wait modes you can build the chord at leisure.
 */
export class ChordRecognizer {
  private pending: unknown = null;
  private matchedKey: string | null = null;

  constructor(
    private readonly opts: {
      onMatch: () => void;
      settleMs?: number;
      windowMs?: number | null;
      timers?: Timers;
    },
  ) {}

  private get timers(): Timers {
    return this.opts.timers ?? realTimers;
  }

  /** Call on every note on/off with the current held notes and their press times. */
  update(
    held: readonly { midi: number; at: number }[],
    target: ChordTarget,
    strictness: Strictness,
  ): ChordMatch {
    const midis = held.map((h) => h.midi);
    const result = matchChord(midis, target, strictness);
    this.cancel();
    const key = midis.join(',');
    if (result.status !== 'match') {
      this.matchedKey = null;
      return result;
    }
    const window = this.opts.windowMs;
    if (window != null && held.length > 0) {
      const times = held.map((h) => h.at);
      if (Math.max(...times) - Math.min(...times) > window) return { ...result, status: 'partial' };
    }
    if (this.matchedKey === key) return result; // already reported this exact shape
    this.pending = this.timers.setTimeout(() => {
      this.pending = null;
      this.matchedKey = key;
      this.opts.onMatch();
    }, this.opts.settleMs ?? 60);
    return result;
  }

  /** Forget the last match (call when the target changes). */
  reset(): void {
    this.cancel();
    this.matchedKey = null;
  }

  private cancel(): void {
    if (this.pending !== null) this.timers.clearTimeout(this.pending);
    this.pending = null;
  }
}
