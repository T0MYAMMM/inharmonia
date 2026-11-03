import type { ChartBar } from './types';

/** A chord and how long it lasts, before it is put into bars. */
export interface TimedChord {
  symbol: string;
  /** Whole beats, at least 1. */
  beats: number;
}

/** Whole beats, at least 1, whatever came in. */
const whole = (beats: number) => (Number.isFinite(beats) ? Math.max(1, Math.round(beats)) : 1);

/**
 * Pack chords in order into bars of `beatsPerBar`. A chord that crosses a
 * barline is split, its symbol written again at the start of the next bar. A
 * last bar that is short is filled by lengthening its last chord. Every bar's
 * beats add up to `beatsPerBar`, so no bar holds more than `beatsPerBar`
 * chords. Symbols are kept exactly as given, in order.
 */
export function rebar(chords: readonly TimedChord[], beatsPerBar: number): ChartBar[] {
  const per = whole(beatsPerBar);
  const bars: ChartBar[] = [];
  let bar: ChartBar['chords'] = [];
  let used = 0;
  for (const chord of chords) {
    let left = whole(chord.beats);
    while (left > 0) {
      const take = Math.min(left, per - used);
      bar.push({ symbol: chord.symbol, beats: take });
      used += take;
      left -= take;
      if (used === per) {
        bars.push({ chords: bar });
        bar = [];
        used = 0;
      }
    }
  }
  if (bar.length) {
    bar[bar.length - 1]!.beats += per - used;
    bars.push({ chords: bar });
  }
  return bars;
}
