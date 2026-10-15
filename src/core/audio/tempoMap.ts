/**
 * Piecewise-linear map between audio-clock time (seconds) and transport beats.
 *
 * Each segment says "at `time`, the transport is at `beat` and moving at `bpm`".
 * A tempo change appends a segment that starts where the previous one would be,
 * so beat positions never jump and nothing drifts. A loop wrap appends a segment
 * whose beat jumps back to the loop start.
 */
export interface TempoSegment {
  time: number;
  beat: number;
  bpm: number;
}

export class TempoMap {
  private segments: TempoSegment[];

  constructor(initial: TempoSegment) {
    this.segments = [initial];
  }

  get current(): TempoSegment {
    return this.segments[this.segments.length - 1]!;
  }

  get all(): readonly TempoSegment[] {
    return this.segments;
  }

  private segmentAt(time: number): TempoSegment {
    for (let i = this.segments.length - 1; i > 0; i--) {
      const s = this.segments[i]!;
      if (time >= s.time) return s;
    }
    return this.segments[0]!;
  }

  /** Transport beat at an audio time. Before the first segment it extrapolates (count-in, latency). */
  beatAt(time: number): number {
    const s = this.segmentAt(time);
    return s.beat + ((time - s.time) * s.bpm) / 60;
  }

  bpmAt(time: number): number {
    return this.segmentAt(time).bpm;
  }

  /** Audio time of a beat, measured in the latest segment (the one being scheduled). */
  timeAt(beat: number): number {
    const s = this.current;
    return s.time + ((beat - s.beat) * 60) / s.bpm;
  }

  /** Seconds that `beats` last at the latest segment's tempo. */
  duration(beats: number): number {
    return (beats * 60) / this.current.bpm;
  }

  push(segment: TempoSegment): void {
    const last = this.current;
    if (segment.time < last.time) {
      throw new Error(`Tempo segment at ${segment.time}s is before the last one (${last.time}s)`);
    }
    if (segment.time === last.time) this.segments[this.segments.length - 1] = segment;
    else this.segments.push(segment);
  }

  /** Drop segments that ended before `time`; keeps the one active at `time`. */
  prune(time: number): void {
    let keepFrom = 0;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (this.segments[i]!.time <= time) {
        keepFrom = i;
        break;
      }
    }
    if (keepFrom > 0) this.segments = this.segments.slice(keepFrom);
  }
}
