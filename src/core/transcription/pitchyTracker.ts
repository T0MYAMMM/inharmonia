import { PitchDetector } from 'pitchy';
import type { PitchTracker } from './interfaces';

/** Sung pitch lives roughly between C2 and C6; anything outside is treated as no pitch. */
export const VOICE_RANGE_HZ: [number, number] = [60, 1100];

/** McLeod pitch method via pitchy. */
export class PitchyTracker implements PitchTracker {
  private readonly detector: PitchDetector<Float32Array>;

  constructor(
    readonly windowSize: number,
    private readonly range: [number, number] = VOICE_RANGE_HZ,
  ) {
    this.detector = PitchDetector.forFloat32Array(windowSize);
    // Let segmentation decide what is loud or clear enough; report everything.
    this.detector.minVolumeDecibels = -80;
    this.detector.clarityThreshold = 0.5;
  }

  detect(window: Float32Array, sampleRate: number): { f0: number | null; clarity: number } {
    const [f0, clarity] = this.detector.findPitch(window, sampleRate);
    if (!Number.isFinite(f0) || f0 < this.range[0] || f0 > this.range[1])
      return { f0: null, clarity };
    return { f0, clarity };
  }
}

/** Window length for a sample rate: about 43 ms, a power of two (2048 at 44.1 or 48 kHz). */
export function windowSizeFor(sampleRate: number): number {
  return 2 ** Math.round(Math.log2(sampleRate * 0.043));
}
