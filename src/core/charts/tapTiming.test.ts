import { describe, expect, it } from 'vitest';
import {
  bpmOf,
  fitsSection,
  gridFromTaps,
  gridFromTempo,
  LIMITS,
  nearestBeat,
  NO_CHORD,
  parseBars,
  retime,
  snapTaps,
  tapChords,
  timedFromStarts,
  withLyric,
  type BeatGrid,
  type ChartBar,
} from '.';

/** Bars as `C:4 | G:2 D:2` for short expectations. */
const show = (bars: ChartBar[]) =>
  bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' ')).join(' | ');

/** A fixed wobble pattern within ±ms, the same every run. */
const JITTER = [0.08, -0.08, 0.05, -0.03, 0.07, -0.06, 0.02, -0.08, 0.04, 0.0, -0.05, 0.08];
const jitter = (i: number, scale = 1) => JITTER[i % JITTER.length]! * scale;

/** Tap times for these beats, with jitter. */
const tapsAt = (beats: number[], grid: BeatGrid, scale = 1) =>
  beats.map((b, i) => grid.downbeat + b * grid.period + jitter(i, scale));

describe('the beat grid', () => {
  it('comes from a tempo and a first downbeat', () => {
    const g = gridFromTempo(120, 3);
    expect(g).toEqual({ downbeat: 3, period: 0.5 });
    expect(bpmOf(g)).toBe(120);
    expect(nearestBeat(3 + 0.5 * 7 + 0.2, g)).toBe(7);
    expect(nearestBeat(2.9, g)).toBe(0);
  });

  it('comes from two bars of steady taps', () => {
    const times = Array.from({ length: 8 }, (_, i) => 1.25 + i * 0.6);
    const g = gridFromTaps(times)!;
    expect(bpmOf(g)).toBeCloseTo(100, 6);
    expect(g.downbeat).toBeCloseTo(1.25, 6);
  });

  for (const bpm of [60, 92, 140, 160]) {
    it(`finds ${bpm} bpm from taps ±80 ms off`, () => {
      const truth = gridFromTempo(bpm, 2);
      const g = gridFromTaps(tapsAt([0, 1, 2, 3, 4, 5, 6, 7], truth))!;
      expect(Math.abs(bpmOf(g) - bpm)).toBeLessThan(bpm * 0.04);
      expect(Math.abs(g.downbeat - 2)).toBeLessThan(0.08);
      // Every beat of the next two bars lands on the right one, tapped ±80 ms too.
      for (let b = 0; b < 8; b++) {
        expect(nearestBeat(2 + b * truth.period, g)).toBe(b);
        expect(nearestBeat(2 + b * truth.period + jitter(b + 3), g)).toBe(b);
      }
    });
  }

  it('has none for too few taps, or taps that are no steady beat', () => {
    expect(gridFromTaps([])).toBeNull();
    expect(gridFromTaps([1])).toBeNull();
    expect(gridFromTaps([1, 1])).toBeNull();
    expect(gridFromTaps([0, 0.1, 0.2, 0.3])).toBeNull(); // 600 bpm
    expect(gridFromTaps([0, 3, 6])).toBeNull(); // 20 bpm
    expect(gridFromTaps([0, 0.5, 1.3, 1.5, 2.6, 2.7])).toBeNull();
    // A beat missed, or one tapped twice.
    expect(gridFromTaps([0, 0.5, 1.5, 2, 2.5, 3])).toBeNull();
    expect(gridFromTaps([0, 0.5, 1, 1.05, 1.5, 2])).toBeNull();
  });
});

describe('snapping taps', () => {
  const grid = gridFromTempo(100, 1);

  it('puts each change on its nearest beat, the first chord on beat 0', () => {
    expect(snapTaps(tapsAt([4, 6, 8, 11], grid), grid)).toEqual([0, 4, 6, 8, 11]);
  });

  for (const bpm of [60, 100, 160]) {
    it(`holds through ±80 ms at ${bpm} bpm`, () => {
      const g = gridFromTempo(bpm, 0.5);
      const changes = [2, 4, 5, 8, 12, 13, 16, 20];
      expect(snapTaps(tapsAt(changes, g), g)).toEqual([0, ...changes]);
    });
  }

  it('follows the beat taps through a long section', () => {
    // 160 bpm, tapped ±80 ms: the grid from two bars alone is a shade off.
    const truth = gridFromTempo(160, 1);
    const beatTaps = tapsAt([0, 1, 2, 3, 4, 5, 6, 7], truth);
    const grid = gridFromTaps(beatTaps)!;
    const changes = [2, 4, 7, 8, 12, 14, 16, 19, 20, 24, 26, 28, 30, 32, 36, 38, 40, 44, 48];
    const taps = tapsAt(changes, truth);
    expect(snapTaps(taps, grid)).not.toEqual([0, ...changes]);
    expect(snapTaps(taps, grid, beatTaps)).toEqual([0, ...changes]);
  });

  it('gives every chord at least a beat', () => {
    // A double tap, and a tap before the first downbeat.
    expect(snapTaps([0.2, 1 + 2.4, 1 + 2.45], grid)).toEqual([0, 1, 4, 5]);
  });
});

describe('the section as tapped', () => {
  it('hears a chord written again in the next bar as one chord held', () => {
    const { bars } = parseBars('| C | C | G D | D | N.C. | N.C. |', 4);
    expect(tapChords(bars)).toEqual([
      { symbol: 'C', beats: 8 },
      { symbol: 'G', beats: 2 },
      { symbol: 'D', beats: 6 },
      { symbol: NO_CHORD, beats: 8 },
    ]);
  });

  it('times each chord to the next tap, and the last to the end of its bar', () => {
    const chords = tapChords(parseBars('| C | G | Am | F |', 4).bars);
    expect(timedFromStarts(chords, [0, 6, 8, 11], 4)).toEqual([
      { symbol: 'C', beats: 6 },
      { symbol: 'G', beats: 2 },
      { symbol: 'Am', beats: 3 },
      { symbol: 'F', beats: 1 },
    ]);
    expect(timedFromStarts(chords, [0, 4, 8, 12], 4).at(-1)).toEqual({ symbol: 'F', beats: 4 });
    expect(timedFromStarts(chords, [0, 2, 3, 6], 3).at(-1)).toEqual({ symbol: 'F', beats: 3 });
  });

  it('keeps the lengths of chords not reached, stopped early', () => {
    const chords = tapChords(parseBars('| C | G | Am F G |', 4).bars);
    // C, G and Am reached; Am, F and G keep theirs (F a whole beat, G to the bar's end).
    expect(timedFromStarts(chords, [0, 2, 4], 4)).toEqual([
      { symbol: 'C', beats: 2 },
      { symbol: 'G', beats: 2 },
      { symbol: 'Am', beats: 2 },
      { symbol: 'F', beats: 1 },
      { symbol: 'G', beats: 1 },
    ]);
    // Half beats round up to whole ones.
    const waltz = tapChords(parseBars('| C | D E F G |', 3).bars);
    expect(waltz.map((c) => c.beats)).toEqual([3, 1, 1, 0.5, 0.5]);
    expect(timedFromStarts(waltz, [0], 3).map((c) => c.beats)).toEqual([3, 1, 1, 1, 3]);
  });

  it('turns into bars, chords and order unchanged', () => {
    const bars = parseBars('| C | G | Am | F |', 4).bars;
    const chords = tapChords(bars);
    const next = retime(bars, timedFromStarts(chords, [0, 6, 8, 11], 4), 4);
    expect(show(next)).toBe('C:4 | C:2 G:2 | Am:3 F:1');
    expect(tapChords(next).map((c) => c.symbol)).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('moves lyrics with the music', () => {
    const bars = parseBars('| C | C | G | F |', 4).bars.map((b, i) =>
      withLyric(b, ['one', 'two', 'three', i === 3 ? 'four' : ''][i]),
    );
    const chords = tapChords(bars); // C:8 G:4 F:4
    // C held for four bars, G two, F one.
    const next = retime(bars, timedFromStarts(chords, [0, 16, 24], 4), 4);
    expect(next.map((b) => b.lyric ?? null)).toEqual([
      'one',
      null,
      'two',
      null,
      'three',
      null,
      'four',
    ]);
    // Squeezed: G and F into one bar, their words joined.
    const short = retime(bars, timedFromStarts(chords, [0, 8, 10], 4), 4);
    expect(show(short)).toBe('C:4 | C:4 | G:2 F:2');
    expect(short.map((b) => b.lyric ?? null)).toEqual(['one', 'two', 'three four']);
  });

  it('says when it no longer fits in a section', () => {
    const many = Array.from({ length: LIMITS.barsPerSection + 1 }, () => ({
      chords: [{ symbol: 'C', beats: 4 }],
    }));
    expect(fitsSection(many)).toBe(false);
    expect(fitsSection(many.slice(1))).toBe(true);
  });
});

describe('tapping along, end to end', () => {
  it('turns two bars of beat taps and jittered changes into bars', () => {
    // A song at 84 bpm, its section starting 7.3 s in: tapped by hand, ±80 ms.
    const truth = gridFromTempo(84, 7.3);
    const beatTaps = tapsAt([0, 1, 2, 3, 4, 5, 6, 7], truth);
    const grid = gridFromTaps(beatTaps)!;
    const bars = parseBars('| Am | F | C | G | Am | E7 |', 4).bars;
    const chords = tapChords(bars);
    // Am 3, F 5, C 4, G 2, Am 2, E7 to the end.
    const taps = tapsAt([3, 8, 12, 14, 16], truth);
    const starts = snapTaps(taps, grid, beatTaps);
    const next = retime(bars, timedFromStarts(chords, starts, 4), 4);
    expect(show(next)).toBe('Am:3 F:1 | F:4 | C:4 | G:2 Am:2 | E7:4');
  });

  it('in 3/4 too', () => {
    const truth = gridFromTempo(126, 0.9);
    const beatTaps = tapsAt([0, 1, 2, 3, 4, 5], truth);
    const grid = gridFromTaps(beatTaps)!;
    const bars = parseBars('| D | A | Bm | G |', 3).bars;
    const starts = snapTaps(tapsAt([3, 6, 8], truth), grid, beatTaps);
    const next = retime(bars, timedFromStarts(tapChords(bars), starts, 3), 3);
    expect(show(next)).toBe('D:3 | A:3 | Bm:2 G:1');
  });
});
