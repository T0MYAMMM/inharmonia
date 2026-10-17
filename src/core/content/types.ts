/**
 * The lesson content format. Every module (song player, chord drills,
 * progression trainer, comping, fills) is content in this shape plus a renderer.
 *
 * Content is plain JSON-compatible data so it can come from TypeScript modules
 * now and from a backend or user storage later. Bump `schemaVersion` and add a
 * migration in `core/persistence` when the shape changes.
 */
import type { Mode, VoicingStyle } from '../theory';

export const LESSON_SCHEMA_VERSION = 1;

/** A chord slot where nothing is played ("N.C." in a chart). */
export const NO_CHORD = 'N.C.';

export type Hand = 'rh' | 'lh';

/** Where a piece of content comes from. Only original, generic or public-domain material ships. */
export type ContentSource =
  | { kind: 'original'; author?: string }
  | { kind: 'generic' } // theory-based material (chord definitions, numeral progressions)
  | { kind: 'public-domain'; composer: string; year: number }
  | { kind: 'user' };

export interface Meter {
  beats: number;
  /** Note value of one beat: 4 = quarter. */
  unit: number;
}

/** A melody or bass note in a bar. Beats are in the meter's beat unit. */
export interface NoteSpec {
  /** Spelled note with octave ("F#4"), or "r" for a rest. */
  note: string;
  beats: number;
  /** 0..1, default from the part. */
  velocity?: number;
  /**
   * Tied to the next note of the same hand (the next one in this bar, or the
   * first of the next bar), which must be the same pitch. The two sound as one
   * held note, and practice waits only for the first.
   */
  tie?: boolean;
}

/** How a chord is voiced: a named style, or explicit notes. */
export type VoicingSpec =
  { style: VoicingStyle; inversion?: number; floor?: string } | { notes: string[] };

export interface ChordSpec {
  /** Chord symbol ("A7sus4", "A/C#"); or a Roman numeral when the lesson is key-relative. */
  symbol: string;
  beats: number;
  voicing?: VoicingSpec;
  /** The Roman numeral it came from, for display (progressions). */
  numeral?: string;
  /** A bass the left hand plays although the symbol leaves it out (a simplified slash chord). */
  bass?: string;
  /** The chord as written, when it is shown simplified. */
  original?: string;
}

export interface Bar {
  chords: ChordSpec[];
  /** Right-hand notes in order; their beats should sum to the bar length. */
  rh?: NoteSpec[];
  /** Explicit left-hand notes; overrides the lesson's left-hand pattern for this bar. */
  lh?: NoteSpec[];
  /** Section marker shown before the bar ("A", "B"), and a double barline. */
  section?: string;
}

/**
 * A left-hand pattern: a rhythm of steps, each choosing voices from the
 * current chord's voicing by index (0 = lowest). Cycles through the chord's duration.
 */
export interface PatternSpec {
  id: string;
  name: string;
  /** One line on how it sounds or when to use it. */
  description?: string;
  /** Beats per bar this pattern is written for (4 for 4/4, 3 for a waltz). Default 4. */
  beatsPerBar?: number;
  /** Length of one cycle in beats. */
  cycleBeats: number;
  steps: PatternStep[];
  /** Velocity of the lowest voice relative to the rest (root accent). */
  rootAccent?: number;
}

export interface PatternStep {
  /** Offset from the start of the cycle, in beats. */
  at: number;
  /** Duration in beats, or 'chord' to sustain until the chord changes (pedal feel). */
  dur: number | 'chord';
  /**
   * What to play: indexes into the voicing (0 = lowest, negative counts from the top),
   * 'all' for the whole voicing, or 'root' / 'fifth' for a bass note in the octave below it.
   */
  voices: PatternVoice[];
  /** Accented step: played at the mix's left-hand accent velocity. */
  accent?: boolean;
  /** Explicit velocity, overriding the mix. Prefer `accent` so levels stay tunable in one place. */
  velocity?: number;
}

export type PatternVoice = number | 'all' | 'root' | 'fifth';

export type Strictness =
  | 'pitch-class' // right notes, any octave or inversion
  | 'inversion' // right notes with the right bass note
  | 'exact'; // exactly the written voicing

export interface ExerciseRules {
  /** Which hands the player must play; the others play automatically. */
  hands: Hand[];
  /** wait: the score waits for each target. timed: keeps time and scores hits. */
  mode: 'wait' | 'timed';
  strictness: Strictness;
  /** Timed mode: how early or late a hit may be, ms. */
  hitWindowMs: number;
  /** Chords count as played when all tones go down within this window, ms. */
  chordWindowMs: number;
}

export const DEFAULT_RULES: ExerciseRules = {
  hands: ['rh'],
  mode: 'wait',
  strictness: 'pitch-class',
  hitWindowMs: 150,
  chordWindowMs: 120,
};

export interface Lesson {
  id: string;
  schemaVersion: number;
  title: string;
  /** One sentence shown in lists. */
  summary?: string;
  kind: 'song' | 'chord-drill' | 'progression' | 'pattern' | 'fill' | 'chart';
  source: ContentSource;
  key: { tonic: string; mode: Mode };
  meter: Meter;
  /** Default tempo, beats per minute, and the slider range. */
  tempo: { default: number; min: number; max: number };
  bars: Bar[];
  /** Default left-hand pattern id, applied to bars without explicit `lh`. */
  lhPattern?: string;
  rules: ExerciseRules;
  tags?: string[];
}

/** A key-agnostic progression written as Roman numerals. */
export interface Progression {
  id: string;
  schemaVersion: number;
  name: string;
  mode: Mode;
  meter: Meter;
  /** Beats are in the progression's meter; a step of `meter.beats` lasts one bar. */
  steps: { numeral: string; beats: number }[];
  /** One line on where you hear it or what it teaches. */
  description?: string;
  source: ContentSource;
  tags?: string[];
}

/** Kinds of fill, as the library groups them. */
export type FillCategory =
  | 'passing'
  | 'chromatic'
  | 'scale-run'
  | 'grace'
  | 'octave'
  | 'pentatonic'
  | 'sixths'
  | 'turnaround';

/**
 * One note of a fill, relative to a chord change so it transposes to any key
 * and slots between any two chords. Start from the root (or a chord tone) of
 * the chord before the change ('from'), after it ('to') or the key's tonic
 * ('key'); walk `step` notes along the fill's scale; then shift by `semis`
 * semitones and `octave` octaves. Roots sit in the hand's register: C4–B4 for
 * the right hand, C2–B2 for the left.
 */
export interface FillPitch {
  ref: 'from' | 'to' | 'key';
  tone?: 'root' | 'third' | 'fifth';
  step?: number;
  semis?: number;
  octave?: number;
}

/** Notes struck together (one note, or a double stop), `at` beats into the fill. */
export interface FillHitSpec {
  at: number;
  dur: number;
  notes: FillPitch[];
  /** 0..1; default from the mix. */
  velocity?: number;
}

/** A short fill or run between two chords. */
export interface FillSpec {
  id: string;
  schemaVersion: number;
  name: string;
  category: FillCategory;
  /** One line on how it sounds or what to listen for. */
  description: string;
  /** 1 (first week) to 3 (takes practice). */
  level: 1 | 2 | 3;
  /**
   * 'into-next' fills end on the chord change: they start `beats` before it and
   * may land on it (a hit at `at === beats`). 'over-current' fills start with
   * the bar before the change and stay within it.
   */
  anchor: 'into-next' | 'over-current';
  /** Length in beats (at most a bar), not counting a landing note. */
  beats: number;
  /** What `step` walks along: the key's scale, or its pentatonic. Default 'key'. */
  scale?: 'key' | 'pentatonic';
  hand: Hand;
  /** A change it suits, as Roman numerals, shown first in the trainer. */
  suggested: { from: string; to: string };
  hits: FillHitSpec[];
  source: ContentSource;
}
