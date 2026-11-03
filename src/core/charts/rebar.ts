import type { ChartBar } from './types';

/** A chord and how long it lasts, in whole beats (at least 1), before it is put in bars. */
export interface TimedChord {
  symbol: string;
  beats: number;
}

/**
 * Pack chords in order into bars of `beatsPerBar`. Chords keep their order and
 * their exact symbols. A chord that crosses a barline is split, and its symbol
 * starts the next bar again. A last bar that comes up short is filled by
 * lengthening its last chord. Every bar's beats add up to `beatsPerBar`, so a
 * bar never holds more chords than it has beats.
 */
export function rebar(chords: readonly TimedChord[], beatsPerBar: number): ChartBar[] {
  const bars: ChartBar[] = [];
  let bar: ChartBar = { chords: [] };
  let used = 0;
  for (const { symbol, beats } of chords) {
    let left = Math.max(1, Math.round(beats));
    while (left > 0) {
      const take = Math.min(left, beatsPerBar - used);
      bar.chords.push({ symbol, beats: take });
      used += take;
      left -= take;
      if (used === beatsPerBar) {
        bars.push(bar);
        bar = { chords: [] };
        used = 0;
      }
    }
  }
  if (bar.chords.length > 0) {
    bar.chords.at(-1)!.beats += beatsPerBar - used;
    bars.push(bar);
  }
  return bars;
}
