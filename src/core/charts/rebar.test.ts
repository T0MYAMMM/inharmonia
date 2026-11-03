import { describe, expect, it } from 'vitest';
import { rebar, type TimedChord } from './rebar';
import { NO_CHORD } from './symbols';
import { LIMITS } from './types';

const t = (...pairs: [string, number][]): TimedChord[] =>
  pairs.map(([symbol, beats]) => ({ symbol, beats }));
/** Bars in chart syntax: "C:4" per chord, bars joined with " | ". */
const show = (bars: ReturnType<typeof rebar>) =>
  bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' ')).join(' | ');

describe('rebar', () => {
  it('puts a 4-beat chord in a bar of its own', () => {
    expect(show(rebar(t(['C', 4], ['G', 4]), 4))).toBe('C:4 | G:4');
  });

  it('shares a bar between two 2-beat chords', () => {
    expect(show(rebar(t(['C', 2], ['G', 2], ['Am', 2], ['F', 2]), 4))).toBe('C:2 G:2 | Am:2 F:2');
  });

  it('keeps 3+1 as it is', () => {
    expect(show(rebar(t(['C', 3], ['G7', 1]), 4))).toBe('C:3 G7:1');
  });

  it('splits a 6-beat chord across a barline and repeats its symbol', () => {
    expect(show(rebar(t(['F', 2], ['C', 6]), 4))).toBe('F:2 C:2 | C:4');
    expect(show(rebar(t(['C', 6], ['G', 2]), 4))).toBe('C:4 | C:2 G:2');
  });

  it('packs 3/4', () => {
    expect(show(rebar(t(['G', 3], ['C', 2], ['G', 1], ['D7', 6]), 3))).toBe(
      'G:3 | C:2 G:1 | D7:3 | D7:3',
    );
    expect(show(rebar(t(['F', 4], ['C', 2]), 3))).toBe('F:3 | F:1 C:2');
  });

  it('fills a short last bar by lengthening its last chord', () => {
    expect(show(rebar(t(['C', 4], ['G', 1]), 4))).toBe('C:4 | G:4');
    expect(show(rebar(t(['C', 4], ['G', 1], ['F', 1]), 4))).toBe('C:4 | G:1 F:3');
    expect(show(rebar(t(['C', 2]), 3))).toBe('C:3');
  });

  it('keeps N.C. and symbols exactly as given', () => {
    expect(show(rebar(t([NO_CHORD, 4], ['Ebadd11', 2], ['B7sus2', 2]), 4))).toBe(
      `${NO_CHORD}:4 | Ebadd11:2 B7sus2:2`,
    );
  });

  it('gives back nothing for nothing', () => {
    expect(rebar([], 4)).toEqual([]);
  });

  it('makes every bar add up, within the chord limit', () => {
    const chords = t(['C', 1], ['D', 1], ['E', 1], ['F', 1], ['G', 5], ['A', 3], ['B', 1]);
    for (const per of [3, 4]) {
      const bars = rebar(chords, per);
      for (const b of bars) {
        expect(b.chords.reduce((s, c) => s + c.beats, 0)).toBe(per);
        expect(b.chords.length).toBeLessThanOrEqual(LIMITS.chordsPerBar);
      }
      // Order and identity: the symbols, with split chords' repeats merged, are the input's.
      const flat = bars.flatMap((b) => b.chords.map((c) => c.symbol));
      expect(flat.filter((s, i) => s !== flat[i - 1])).toEqual(chords.map((c) => c.symbol));
    }
  });
});
