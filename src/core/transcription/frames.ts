import type { PitchTracker } from './interfaces';
import type { MonoAudio, PitchFrame } from './types';

export const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Analysis hop in seconds: 100 frames a second. */
export const HOP_SEC = 0.01;

/**
 * Track pitch frame by frame across a whole take. Frame times are window
 * centres; the first and last half-window are padded with silence.
 */
export function trackPitch(
  audio: MonoAudio,
  tracker: PitchTracker,
  hopSec = HOP_SEC,
): PitchFrame[] {
  const { samples, sampleRate } = audio;
  const n = tracker.windowSize;
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const window = new Float32Array(n);
  const short = Math.max(1, Math.round(0.01 * sampleRate));
  const frames: PitchFrame[] = [];
  for (let centre = 0; centre < samples.length; centre += hop) {
    const from = centre - n / 2;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const j = from + i;
      const v = j >= 0 && j < samples.length ? samples[j]! : 0;
      window[i] = v;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / n);
    let shortSum = 0;
    for (let j = centre - (short >> 1); j < centre + (short >> 1); j++) {
      const v = j >= 0 && j < samples.length ? samples[j]! : 0;
      shortSum += v * v;
    }
    const rmsShort = Math.sqrt(shortSum / short);
    const { f0, clarity } =
      rms > 1e-5 ? tracker.detect(window, sampleRate) : { f0: null, clarity: 0 };
    frames.push({
      time: centre / sampleRate,
      f0,
      midi: f0 === null ? null : hzToMidi(f0),
      clarity,
      rms,
      rmsShort,
    });
  }
  return frames;
}
