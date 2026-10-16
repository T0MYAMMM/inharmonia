import type { PitchFrame } from '../transcription/types';
import type { UserRecording } from './library';

/**
 * A take ready to keep: 16-bit samples (half the size of floats) and the pitch
 * trace as one number per frame, NaN where nothing steady was heard.
 */
export function toUserRecording(input: {
  songId: string;
  samples: Float32Array;
  sampleRate: number;
  beat0: number;
  frames: readonly PitchFrame[];
  minClarity: number;
  hop: number;
  /** Semitones the draft moved the melody (12 × its octave shift). */
  shift: number;
}): UserRecording {
  const pcm = new Int16Array(input.samples.length);
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, input.samples[i]!));
    pcm[i] = Math.round(x * 32767);
  }
  const { values: trace } = traceOf(input.frames, input.minClarity);
  return {
    songId: input.songId,
    sampleRate: input.sampleRate,
    samples: pcm,
    beat0: input.beat0,
    trace,
    traceStart: input.frames[0]?.time ?? 0,
    traceHop: input.hop,
    traceShift: input.shift,
  };
}

/** A pitch trace: one value per frame from `start`, NaN where nothing steady was heard. */
export function traceOf(
  frames: readonly PitchFrame[],
  minClarity: number,
): { values: Float32Array; start: number } {
  const values = new Float32Array(frames.length);
  frames.forEach((f, i) => {
    values[i] = f.midi !== null && f.clarity >= minClarity ? f.midi : Number.NaN;
  });
  return { values, start: frames[0]?.time ?? 0 };
}

/** Back to floats for playback. */
export function recordingSamples(r: Pick<UserRecording, 'samples'>): Float32Array {
  const out = new Float32Array(r.samples.length);
  for (let i = 0; i < out.length; i++) out[i] = r.samples[i]! / 32767;
  return out;
}

/** Bytes as "1.2 MB" or "340 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
