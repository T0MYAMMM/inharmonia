import type { MonoAudio, NoteEvent, TakeTiming } from './types';

/**
 * Frame-wise fundamental estimation. The voice pipeline uses McLeod's method
 * (pitchy); a learned model such as CREPE can implement the same interface.
 */
export interface PitchTracker {
  /** Samples per analysis window. */
  readonly windowSize: number;
  /** Estimate the fundamental of one window: Hz (or null) and a clarity in 0..1. */
  detect(window: Float32Array, sampleRate: number): { f0: number | null; clarity: number };
}

/**
 * Audio in, note events out. The voice transcriber (pitch tracking plus
 * segmentation) is one implementation; a polyphonic model for uploaded
 * recordings (e.g. Basic Pitch) can be another, without touching the editor.
 */
export interface Transcriber {
  readonly id: string;
  transcribe(audio: MonoAudio, timing?: TakeTiming): Promise<NoteEvent[]>;
}

/** One stretch of harmony on the beat grid, with ranked candidates. */
export interface ChordSegment {
  startBeat: number;
  beats: number;
  candidates: { symbol: string; numeral?: string; score: number }[];
}

/**
 * Harmony for a melody or a recording. The melody harmonizer reads notes; a
 * chroma-based recogniser for recordings can read the audio instead.
 */
export interface ChordEstimator {
  readonly id: string;
  estimate(input: {
    notes?: readonly { startBeat: number; beats: number; midi: number }[];
    audio?: MonoAudio;
    timing: TakeTiming;
    key: { tonic: string; mode: 'major' | 'minor' };
  }): Promise<ChordSegment[]>;
}
