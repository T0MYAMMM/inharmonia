import { hzToMidi, HOP_SEC } from './frames';
import type { PitchTracker } from './interfaces';
import type { PitchFrame } from './types';

/**
 * Streaming pitch tracker for the live trace: feed blocks of samples as they
 * arrive, get frames every hop over the most recent window.
 */
export class LivePitch {
  private ring: Float32Array;
  private written = 0;
  private sinceHop = 0;
  private readonly hop: number;
  private readonly window: Float32Array;

  constructor(
    private readonly tracker: PitchTracker,
    private readonly sampleRate: number,
    hopSec = HOP_SEC,
  ) {
    this.ring = new Float32Array(tracker.windowSize);
    this.window = new Float32Array(tracker.windowSize);
    this.hop = Math.max(1, Math.round(hopSec * sampleRate));
  }

  /** Add samples; returns any frames completed. Frame times are seconds since the first sample. */
  push(block: Float32Array): PitchFrame[] {
    const n = this.ring.length;
    const out: PitchFrame[] = [];
    for (let i = 0; i < block.length; i++) {
      this.ring[this.written % n] = block[i]!;
      this.written++;
      if (++this.sinceHop < this.hop) continue;
      this.sinceHop = 0;
      if (this.written < n) continue;
      let sum = 0;
      for (let k = 0; k < n; k++) {
        const v = this.ring[(this.written + k) % n]!;
        this.window[k] = v;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / n);
      const { f0, clarity } =
        rms > 1e-5 ? this.tracker.detect(this.window, this.sampleRate) : { f0: null, clarity: 0 };
      out.push({
        time: (this.written - n / 2) / this.sampleRate,
        f0,
        midi: f0 === null ? null : hzToMidi(f0),
        clarity,
        rms,
        rmsShort: rms,
      });
    }
    return out;
  }
}
