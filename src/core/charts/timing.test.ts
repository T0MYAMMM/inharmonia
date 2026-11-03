import { describe, expect, it } from 'vitest';
import { parseSheet } from './paste';
import {
  countSyllables,
  estimateLineTiming,
  expandTabs,
  isIndonesian,
  type LineChord,
  type LineTiming,
} from './timing';
import { barMatch, beatAccuracy, scoreAll, timingVectors, type TimingVector } from './timing.eval';
import { TIMING_FIXTURES } from './timing.fixtures';
import VECTORS from './timing.vectors.json';

/** Chords over a lyric, as a sheet shows them: each chord's column is where it is written. */
function line(chords: string, lyric: string, beatsPerBar = 4) {
  const placed: LineChord[] = [...expandTabs(chords).matchAll(/\S+/g)].map((m) => ({
    symbol: m[0],
    col: m.index,
  }));
  return estimateLineTiming(placed, expandTabs(lyric), beatsPerBar);
}
const show = (t: LineTiming) => t.chords.map((c) => `${c.symbol}:${c.beats}`).join(' ');
const beatsOf = (t: LineTiming) =>
  t.chords.flatMap((c) => Array.from({ length: c.beats }, () => c.symbol));

describe('syllables', () => {
  it('counts English vowel groups, with a silent e and its endings', () => {
    const words = {
      grace: 1,
      peace: 1,
      syne: 1,
      Doodle: 2,
      looked: 1,
      brightened: 2,
      wanted: 2,
      miles: 1,
      places: 2,
      skies: 1,
      going: 2,
      chariot: 3,
      nation: 2,
      valley: 2,
      canyon: 2,
      Yankee: 2,
      Alabama: 4,
      sunshine: 2,
      heavenly: 3,
      acquaintance: 3,
      "don't": 1,
      pony: 2,
      forever: 3,
    };
    expect(Object.fromEntries(Object.keys(words).map((w) => [w, countSyllables(w)]))).toEqual(
      words,
    );
  });

  it('counts Indonesian vowels, with ai, au, oi and ei at the end of a word as one', () => {
    const words = {
      pantai: 2,
      sampai: 2,
      damai: 2,
      pulau: 2,
      amboi: 2,
      survei: 2,
      bermain: 3,
      laut: 2,
      sayang: 2,
      anakku: 3,
      nyanyi: 2,
      tidurlah: 3,
      sarangnya: 3,
      dia: 2,
      perlahan: 3,
    };
    expect(Object.fromEntries(Object.keys(words).map((w) => [w, countSyllables(w, true)]))).toEqual(
      words,
    );
  });

  it('gives every word with a letter at least one, and marks none', () => {
    expect([countSyllables('Hm'), countSyllables('nth', true), countSyllables('—')]).toEqual([
      1, 1, 0,
    ]);
  });

  it('tells an Indonesian line from an English one', () => {
    expect(isIndonesian('Hatiku tenang, damai sampai pagi'.split(' '))).toBe(true);
    expect(isIndonesian('Aku dan dia di sana'.split(' '))).toBe(true);
    expect(isIndonesian('Oh when the saints go marching in'.split(' '))).toBe(false);
  });
});

describe('expandTabs', () => {
  it('moves to the next stop of 4 columns', () => {
    expect(expandTabs('\tC')).toBe('    C');
    expect(expandTabs('C7\tF')).toBe('C7  F');
    expect(expandTabs('C \t \tG')).toBe('C       G');
  });
});

describe('estimateLineTiming', () => {
  it('times chords from the syllables between them, on whole beats that fill whole bars', () => {
    const t = line('C                G7', 'Swing along the river road, my darling');
    expect(t.chords.map((c) => c.symbol)).toEqual(['C', 'G7']);
    expect(t.chords.reduce((s, c) => s + c.beats, 0)).toBe(t.bars * 4);
    expect([2, 4]).toContain(t.bars);
  });

  it('changes chords mid-bar when the words between them are short', () => {
    // Swing low, sweet chariot: Bb and F half a bar each.
    expect(show(line('F           Bb    F', 'Rolling slow, sweet harbour,'))).toMatch(/Bb:2 F:\d/);
  });

  it('holds one chord for a whole line of words', () => {
    const t = line('    C', 'Oh when the saints go marching in');
    expect(t.chords).toEqual([{ symbol: 'C', beats: t.bars * 4 }]);
    expect(t.bars).toBeGreaterThanOrEqual(2);
  });

  it('gives a long line 8 bars, and a short one fewer', () => {
    const long =
      'the river runs along the valley floor and carries every little stone along the way to meet the open sea at last tonight';
    const t = estimateLineTiming(
      [
        { symbol: 'C', col: 0 },
        { symbol: 'F', col: 30 },
        { symbol: 'G', col: 60 },
        { symbol: 'C', col: 92 },
      ],
      long,
      4,
    );
    expect(t.bars).toBe(8);
    expect(line('C   G', 'oh yeah').bars).toBeLessThanOrEqual(2);
  });

  it('starts the line at its first chord: words before it are a pickup', () => {
    const withPickup = line(
      '           C                    G7',
      'Oh when the saints go marching in',
    );
    const without = line('           C                    G7', '            saints go marching in');
    expect(withPickup).toEqual(without);
  });

  it('gives chords over blank space before the words their own time', () => {
    const t = line('Am       F      C', '                Selamat malam, kawan,');
    expect(t.chords.map((c) => c.symbol)).toEqual(['Am', 'F', 'C']);
    expect(t.chords[0]!.beats).toBeGreaterThanOrEqual(2);
    expect(t.chords[1]!.beats).toBeGreaterThanOrEqual(2);
  });

  it('gives a chord after the last word a bar of its own', () => {
    const t = line('C        F     G   C                   G', 'Hatiku tenang, damai sampai pagi.');
    expect(t.chords.at(-1)).toEqual({ symbol: 'G', beats: 4 });
  });

  it('lands a chord written a column or two off, or with tabs, the same', () => {
    const lyric = 'Where the deer and the antelope play,';
    // G over "deer" (column 10), D7 over "play" (column 32).
    const exact = line('          G                     D7', lyric, 3);
    expect(line('         G                       D7', lyric, 3)).toEqual(exact);
    expect(line('            G                    D7', lyric, 3)).toEqual(exact);
    expect(line('\t\t  G\t\t\t\t\t\tD7', lyric, 3)).toEqual(exact);
    expect(line('\t\t \tG \t\t\t\t\tD7', lyric, 3)).toEqual(exact);
  });

  it('times 3/4 lines in bars of three', () => {
    const t = line('   C           F        C', 'My Bonnie lies over the ocean,', 3);
    expect(show(t)).toBe('C:3 F:3 C:6');
  });

  it('falls back to one chord a bar with no words under the chords', () => {
    expect(line('C   G   Am', '  ...  --  ')).toEqual({
      chords: [
        { symbol: 'C', beats: 4 },
        { symbol: 'G', beats: 4 },
        { symbol: 'Am', beats: 4 },
      ],
      bars: 3,
      confidence: 'rough',
    });
    expect(estimateLineTiming([], 'la la', 4)).toEqual({
      chords: [],
      bars: 0,
      confidence: 'rough',
    });
  });

  it('gives every chord at least a beat when they crowd one word', () => {
    const t = line('C G Am F E', 'Hallelujah');
    expect(t.chords.map((c) => c.symbol)).toEqual(['C', 'G', 'Am', 'F', 'E']);
    expect(Math.min(...t.chords.map((c) => c.beats))).toBeGreaterThanOrEqual(1);
    expect(t.chords.reduce((s, c) => s + c.beats, 0)).toBe(t.bars * 4);
  });
});

describe('timing on the evaluation set', () => {
  const vectors = VECTORS as TimingVector[];

  it('reproduces every vector in timing.vectors.json exactly', () => {
    expect(vectors.length).toBeGreaterThan(50);
    for (const { input, output } of vectors)
      expect(estimateLineTiming(input.chords, input.lyric, input.beatsPerBar)).toEqual(output);
  });

  it('has vectors that match the fixtures (npm run eval:timing -- --write-vectors)', () => {
    expect(timingVectors(TIMING_FIXTURES)).toEqual(vectors);
  });

  it('keeps every line whole: beats of at least 1 that fill 1, 2, 4 or 8 bars', () => {
    for (const { input, output } of vectors) {
      expect([1, 2, 4, 8]).toContain(output.bars);
      expect(output.chords.map((c) => c.symbol)).toEqual(input.chords.map((c) => c.symbol));
      expect(output.chords.every((c) => Number.isInteger(c.beats) && c.beats >= 1)).toBe(true);
      expect(output.chords.reduce((s, c) => s + c.beats, 0)).toBe(output.bars * input.beatsPerBar);
    }
  });

  it('has at least 12 public-domain songs, in 4/4 and 3/4, and Indonesian lines', () => {
    const english = TIMING_FIXTURES.filter((f) => !f.source.startsWith('Original'));
    expect(english.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TIMING_FIXTURES.map((f) => f.beatsPerBar))).toEqual(new Set([3, 4]));
    expect(TIMING_FIXTURES.some((f) => f.sheet.includes('\t'))).toBe(true);
    expect(
      TIMING_FIXTURES.some((f) => parseSheet(f.sheet, f.beatsPerBar).lines.some((l) => l.estimate)),
    ).toBe(true);
  });

  it('beats one chord a bar, song by song as measured (right beats, beats, right bar counts, lines)', () => {
    const { rows, estimated, baseline } = scoreAll(TIMING_FIXTURES);
    const t = (x: typeof estimated) => [x.right, x.beats, x.barsRight, x.lines];
    expect(rows.map((r) => [r.id, t(r.estimated), t(r.baseline)])).toEqual([
      ['amazing-grace', [52, 57, 5, 5], [45, 57, 3, 5]],
      ['silent-night', [55, 72, 4, 5], [24, 72, 0, 5]],
      ['oh-susanna', [56, 64, 4, 4], [16, 64, 0, 4]],
      ['when-the-saints', [64, 64, 4, 4], [32, 64, 0, 4]],
      ['swing-low', [32, 96, 0, 6], [30, 64, 2, 6]],
      ['auld-lang-syne', [62, 64, 4, 4], [48, 72, 1, 4]],
      ['yankee-doodle', [63, 64, 4, 4], [40, 64, 2, 4]],
      ['red-river-valley', [60, 64, 4, 4], [32, 64, 0, 4]],
      ['camptown-races', [62, 64, 4, 4], [16, 64, 0, 4]],
      ['home-on-the-range', [45, 48, 4, 4], [18, 48, 0, 4]],
      ['clementine', [48, 48, 4, 4], [30, 48, 2, 4]],
      ['my-bonnie', [48, 48, 4, 4], [36, 48, 0, 4]],
      ['down-in-the-valley', [47, 48, 4, 4], [12, 48, 0, 4]],
      ['senja', [66, 80, 5, 5], [38, 84, 1, 5]],
      ['tidurlah', [41, 48, 4, 4], [24, 48, 0, 4]],
    ]);
    expect(beatAccuracy(estimated)).toBeCloseTo(0.862, 3);
    expect(beatAccuracy(baseline)).toBeCloseTo(0.485, 3);
    expect(barMatch(estimated)).toBeCloseTo(0.892, 3);
    expect(barMatch(baseline)).toBeCloseTo(0.169, 3);
    expect(beatAccuracy(estimated) - beatAccuracy(baseline)).toBeGreaterThan(0.25);
  });

  it('hardly moves when every chord is written a column or two off', () => {
    for (const [shift, least] of [
      [-2, 0.95],
      [-1, 0.98],
      [1, 0.98],
      [2, 0.94],
    ] as const) {
      let same = 0;
      let total = 0;
      for (const { input, output } of vectors) {
        let next = 0;
        const moved = input.chords.map((c) => {
          const col = Math.max(next, c.col + shift);
          next = col + c.symbol.length + 1;
          return { ...c, col };
        });
        const a = beatsOf(output);
        const b = beatsOf(estimateLineTiming(moved, input.lyric, input.beatsPerBar));
        for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
        total += Math.max(a.length, b.length);
      }
      expect(same / total).toBeGreaterThanOrEqual(least);
    }
  });
});
