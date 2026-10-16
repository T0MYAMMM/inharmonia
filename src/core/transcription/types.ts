import type { Meter } from '../content/types';
import type { SpelledNote } from '../theory';

/** Mono audio as plain samples, so the pipeline runs anywhere (worker, tests, Node). */
export interface MonoAudio {
  samples: Float32Array;
  sampleRate: number;
}

/** One analysis frame. Times are seconds from the start of the take. */
export interface PitchFrame {
  /** Centre of the analysis window. */
  time: number;
  /** Fundamental in Hz, or null when the tracker found none. */
  f0: number | null;
  /** Pitch as fractional MIDI (69 = A4, 60.5 = a quarter tone above middle C), or null. */
  midi: number | null;
  /** How periodic the window is, 0..1 (McLeod's normalised peak). */
  clarity: number;
  /** Window loudness, root mean square of the samples (0..1). */
  rms: number;
  /** Loudness over a short 10 ms window at the frame centre, for finding re-attacks. */
  rmsShort: number;
}

/** A sung note, before any grid: seconds and fractional MIDI. */
export interface NoteEvent {
  start: number;
  end: number;
  /** Median pitch over the note, fractional MIDI. */
  pitch: number;
  /** Mean clarity of its frames, 0..1. */
  confidence: number;
}

/** How a take lines up with the click. */
export interface TakeTiming {
  tempo: number;
  meter: Meter;
  /** Seconds into the take where beat 0 (the downbeat after the count-in) was sung. */
  beat0: number;
  bars: number;
}

/** Grid resolution in beats: 1 = quarter notes, 0.5 = eighths, 0.25 = sixteenths. */
export type GridStep = 1 | 0.5 | 0.25;

export interface QuantizeOptions {
  step: GridStep;
  /** Also allow triplet positions (thirds of a beat, or sixths at sixteenths). */
  triplets: boolean;
  /**
   * How far off the grid, as a fraction of a step, an onset may be before it is
   * flagged uncertain. Notes are always snapped; uncertain ones are marked so the
   * editor can point them out.
   */
  tolerance: number;
}

/** A note on the beat grid, monophonic, spelled for the key. */
export interface GridNote {
  startBeat: number;
  beats: number;
  midi: number;
  note: SpelledNote;
  /** The onset was further off the grid than the tolerance. */
  uncertain: boolean;
}
