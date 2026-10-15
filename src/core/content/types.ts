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
}

/** How a chord is voiced: a named style, or explicit notes. */
export type VoicingSpec =
  { style: VoicingStyle; inversion?: number; floor?: string } | { notes: string[] };

export interface ChordSpec {
  /** Chord symbol ("A7sus4", "A/C#"); or a Roman numeral when the lesson is key-relative. */
  symbol: string;
  beats: number;
  voicing?: VoicingSpec;
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
  /** Voice indexes into the voicing; negative counts from the top (-1 = highest). */
  voices: number[];
  velocity?: number;
}

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
  kind: 'song' | 'chord-drill' | 'progression' | 'pattern' | 'fill';
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
  steps: { numeral: string; beats: number }[];
  source: ContentSource;
  tags?: string[];
}

/** A fill defined relative to a chord change, so it transposes and slots in anywhere. */
export interface FillSpec {
  id: string;
  schemaVersion: number;
  name: string;
  /** Where the fill sits: leading into the next chord, or over the current one. */
  anchor: 'into-next' | 'over-current';
  /** Length in beats, ending at the chord change for 'into-next'. */
  beats: number;
  notes: {
    /** Scale degree relative to the anchor chord's root or the key ("1", "♭3", "5"). */
    degree: string;
    relativeTo: 'chord' | 'key';
    octave: number;
    at: number;
    dur: number;
    hand?: Hand;
  }[];
  source: ContentSource;
}
