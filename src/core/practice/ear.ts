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
 * comfortable register, never the same quality twice running when the level
 * has more than one to choose from.
 */
export class ChordEarQuiz {
  readonly level: ChordEarLevel;
  readonly options: readonly ChordQuality[];
  question: ChordQuestion;
  /** The answer given to the current question, if any. */
  answered: { choice: string; correct: boolean } | null = null;
  score: EarScore = { correct: 0, total: 0, streak: 0 };

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
    this.question = this.make(null);
  }

  private make(prev: ChordQuestion | null): ChordQuestion {
    let quality = pick(this.options, this.rng);
    for (let i = 0; i < 8 && prev && quality.id === prev.quality.id && this.options.length > 1; i++)
      quality = pick(this.options, this.rng);
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
    this.question = this.make(this.question);
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

/** Questions in a round; a finished round is saved to progress. */
export const EAR_ROUND = 10;
