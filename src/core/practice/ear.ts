import { PROGRESSION_RANGE } from '../content/realize';
import {
  CHORD_QUALITIES,
  romanToChord,
  voiceChord,
  voiceLeadProgression,
  type ChordQuality,
  type SpelledNote,
} from '../theory';

export type Rng = () => number;

const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)]!;

/** The most times one answer comes up in a row. */
export const MAX_RUN = 3;

/**
 * Pick at random, each pick independent of the last, except that an answer
 * already given MAX_RUN times running is left out. `recent` holds the last
 * answers' ids, newest last.
 */
function pickLimitingRuns<T>(
  xs: readonly T[],
  id: (x: T) => string,
  recent: readonly string[],
  rng: Rng,
): T {
  const tail = recent.slice(-MAX_RUN);
  const run = tail.length === MAX_RUN && tail.every((r) => r === tail[0]) ? tail[0] : null;
  const pool = run !== null && xs.length > 1 ? xs.filter((x) => id(x) !== run) : xs;
  return pick(pool, rng);
}

/** Remember an answer for pickLimitingRuns. */
const remember = (recent: string[], id: string) => [...recent, id].slice(-MAX_RUN);

/** Roots spelled the way they are most often written. */
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'G', 'Ab', 'A', 'Bb'] as const;

export interface EarLevel {
  id: string;
  name: string;
}

export interface ChordEarLevel extends EarLevel {
  qualities: readonly string[];
}

export const CHORD_EAR_LEVELS: readonly ChordEarLevel[] = [
  { id: 'major-minor', name: 'Major or minor', qualities: ['major', 'minor'] },
  { id: 'triads', name: 'Triads', qualities: ['major', 'minor', 'dim', 'aug'] },
  { id: 'sevenths', name: 'Sevenths', qualities: ['maj7', '7', 'm7', 'm7b5', 'dim7'] },
  {
    id: 'mixed',
    name: 'Mixed',
    qualities: ['major', 'minor', 'sus4', 'maj7', '7', 'm7', 'm7b5', 'dim7'],
  },
];

export interface ChordQuestion {
  root: string;
  quality: ChordQuality;
  symbol: string;
  voicing: SpelledNote[];
  options: readonly ChordQuality[];
}

export interface EarScore {
  correct: number;
  total: number;
  streak: number;
}

/**
 * Hear a chord, name its quality. Each question is a random root in a
 * comfortable register and a random quality, so the last answer never gives
 * the next one away; no quality comes up more than MAX_RUN times running.
 */
export class ChordEarQuiz {
  readonly level: ChordEarLevel;
  readonly options: readonly ChordQuality[];
  question: ChordQuestion;
  /** The answer given to the current question, if any. */
  answered: { choice: string; correct: boolean } | null = null;
  score: EarScore = { correct: 0, total: 0, streak: 0 };
  private recent: string[] = [];

  constructor(
    level: ChordEarLevel,
    private readonly rng: Rng = Math.random,
  ) {
    this.level = level;
    this.options = level.qualities.map((id) => {
      const q = CHORD_QUALITIES.find((x) => x.id === id);
      if (!q) throw new Error(`Unknown quality "${id}"`);
      return q;
    });
    this.question = this.make();
  }

  private make(): ChordQuestion {
    const quality = pickLimitingRuns(this.options, (q) => q.id, this.recent, this.rng);
    this.recent = remember(this.recent, quality.id);
    const root = pick(ROOTS, this.rng);
    const symbol = `${root}${quality.suffix}`;
    // Roots from C3 to B3, so every quality sits around middle C.
    const voicing = voiceChord(symbol, { style: 'close', floor: 'C3' });
    return { root, quality, symbol, voicing, options: this.options };
  }

  answer(qualityId: string): boolean {
    if (this.answered) return this.answered.correct;
    const correct = qualityId === this.question.quality.id;
    this.answered = { choice: qualityId, correct };
    this.score = {
      correct: this.score.correct + (correct ? 1 : 0),
      total: this.score.total + 1,
      streak: correct ? this.score.streak + 1 : 0,
    };
    return correct;
  }

  next(): ChordQuestion {
    this.question = this.make();
    this.answered = null;
    return this.question;
  }
}

export interface ProgressionEarLevel extends EarLevel {
  /** Numerals the chords after the first are drawn from (the first is always I). */
  numerals: readonly string[];
}

export const PROGRESSION_EAR_LEVELS: readonly ProgressionEarLevel[] = [
  { id: 'primary', name: 'I, IV and V', numerals: ['I', 'IV', 'V'] },
  { id: 'pop', name: 'Add vi', numerals: ['I', 'IV', 'V', 'vi'] },
  { id: 'diatonic', name: 'All six', numerals: ['I', 'ii', 'iii', 'IV', 'V', 'vi'] },
];

export const PROGRESSION_LENGTH = 4;

export interface ProgressionQuestion {
  key: string;
  numerals: string[];
  symbols: string[];
  voicings: SpelledNote[][];
}

/** Voice a list of numerals in a key, smoothly, around middle C. */
export function voiceNumerals(numerals: readonly string[], key: string): SpelledNote[][] {
  const symbols = numerals.map((n) => romanToChord(n, key));
  return voiceLeadProgression(symbols, {
    style: 'close',
    range: PROGRESSION_RANGE,
    start: voiceChord(symbols[0]!, { style: 'close', floor: 'C3' }).map((n) => n.midi),
  });
}

/**
 * Hear four chords in a major key, starting on I, and name the other three.
 * Chords next to each other are always different, and at least one chord
 * after the first isn't I.
 */
export class ProgressionEarQuiz {
  question: ProgressionQuestion;
  /** Per chord: was it named right? The first (I, given) is always true. */
  answered: { choice: string[]; right: boolean[]; correct: boolean } | null = null;
  score: EarScore = { correct: 0, total: 0, streak: 0 };

  constructor(
    readonly level: ProgressionEarLevel,
    private readonly rng: Rng = Math.random,
  ) {
    this.question = this.make();
  }

  private make(): ProgressionQuestion {
    const key = pick(MAJOR_KEYS, this.rng);
    const numerals = ['I'];
    while (numerals.length < PROGRESSION_LENGTH) {
      const prev = numerals[numerals.length - 1]!;
      const options = this.level.numerals.filter((n) => n !== prev);
      numerals.push(pick(options, this.rng));
    }
    return {
      key,
      numerals,
      symbols: numerals.map((n) => romanToChord(n, key)),
      voicings: voiceNumerals(numerals, key),
    };
  }

  /** Answer with a numeral for every chord (the first is ignored: it is I). */
  answer(choice: readonly string[]): boolean {
    if (this.answered) return this.answered.correct;
    const right = this.question.numerals.map((n, i) => i === 0 || choice[i] === n);
    const correct = right.every(Boolean);
    this.answered = { choice: ['I', ...choice.slice(1)], right, correct };
    this.score = {
      correct: this.score.correct + (correct ? 1 : 0),
      total: this.score.total + 1,
      streak: correct ? this.score.streak + 1 : 0,
    };
    return correct;
  }

  next(): ProgressionQuestion {
    this.question = this.make();
    this.answered = null;
    return this.question;
  }
}

export interface NoteEarLevel extends EarLevel {
  /** Pitch classes asked, 0 = C. */
  pitchClasses: readonly number[];
}

export const NOTE_EAR_LEVELS: readonly NoteEarLevel[] = [
  { id: 'naturals', name: 'White keys', pitchClasses: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'all', name: 'All twelve', pitchClasses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

/** Note names: a black key by both its names. */
export const PITCH_CLASS_NAMES = [
  'C',
  'C#/Db',
  'D',
  'D#/Eb',
  'E',
  'F',
  'F#/Gb',
  'G',
  'G#/Ab',
  'A',
  'A#/Bb',
  'B',
] as const;

/** The notes a note question is played from: C2 to B6, five octaves. */
export const NOTE_EAR_RANGE: readonly [number, number] = [36, 95];

export interface NoteQuestion {
  midi: number;
  pitchClass: number;
}

/**
 * Hear one note, in any octave, and name it with no reference: practice for
 * perfect pitch. The note is random across five octaves, so its octave gives
 * nothing away, and no note name comes up more than MAX_RUN times running.
 */
export class NoteEarQuiz {
  question: NoteQuestion;
  answered: { choice: number; correct: boolean } | null = null;
  score: EarScore = { correct: 0, total: 0, streak: 0 };
  private recent: string[] = [];

  constructor(
    readonly level: NoteEarLevel,
    private readonly rng: Rng = Math.random,
  ) {
    this.question = this.make();
  }

  private make(): NoteQuestion {
    const pitchClass = pickLimitingRuns(this.level.pitchClasses, String, this.recent, this.rng);
    this.recent = remember(this.recent, String(pitchClass));
    const [lo, hi] = NOTE_EAR_RANGE;
    const octaves: number[] = [];
    for (let m = lo; m <= hi; m++) if (m % 12 === pitchClass) octaves.push(m);
    return { midi: pick(octaves, this.rng), pitchClass };
  }

  /** Answer with a pitch class, 0 = C. */
  answer(pitchClass: number): boolean {
    if (this.answered) return this.answered.correct;
    const correct = pitchClass === this.question.pitchClass;
    this.answered = { choice: pitchClass, correct };
    this.score = {
      correct: this.score.correct + (correct ? 1 : 0),
      total: this.score.total + 1,
      streak: correct ? this.score.streak + 1 : 0,
    };
    return correct;
  }

  next(): NoteQuestion {
    this.question = this.make();
    this.answered = null;
    return this.question;
  }
}

/** Questions in a round; a finished round is saved to progress. */
export const EAR_ROUND = 10;
