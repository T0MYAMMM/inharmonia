import { describe, expect, it } from 'vitest';
import {
  countSyllables,
  estimateLineTiming,
  estimateSheetTiming,
  expandTabs,
  isIndonesian,
  type LineChord,
  type LineTiming,
} from './timing';
import {
  barMatch,
  beatAccuracy,
  scoreAll,
  SHAPE,
  shapeAccuracy,
  timingVectors,
  type Tally,
  type TimingVector,
} from './timing.eval';
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
    // Two columns into a one-syllable word lands past it: on a line alone, with no other
    // lines to set the speed, that can read it at half or double length, in the same proportions.
    const share = (t: LineTiming) => t.chords.map((c) => c.beats / (t.bars * 3));
    expect(share(line('            G                    D7', lyric, 3))).toEqual(share(exact));
    expect(line('\t\t  G\t\t\t\t\t\tD7', lyric, 3)).toEqual(exact);
    expect(share(line('\t\t \tG \t\t\t\t\tD7', lyric, 3))).toEqual(share(exact));
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

describe('a sheet timed at one speed', () => {
  const pair = (chords: string, lyric: string) => ({
    chords: [...chords.matchAll(/\S+/g)].map((m) => ({ symbol: m[0], col: m.index })),
    lyric,
  });
  // Two-bar lines of quarter notes, the speed shared by every line.
  const SHEET = [
    pair('C             F       C', 'Lanterns over the water, glow'),
    pair('G7            C', 'Slowly the boats come home'),
    pair('C              F      C', 'Harbour lights are burning low'),
    pair('G7         C', 'Over the evening foam'),
  ];

  it('gives the lines of a sheet the same speed, so like lines get like bars', () => {
    const lines = estimateSheetTiming(SHEET, 4);
    expect(lines.map((l) => l.bars)).toEqual([2, 2, 2, 2]);
  });

  it('halves and doubles the speed with the scale; a line too crowded to halve keeps its length', () => {
    const as = estimateSheetTiming(SHEET, 4);
    const half = estimateSheetTiming(SHEET, 4, { scale: 0.5 });
    const double = estimateSheetTiming(SHEET, 4, { scale: 2 });
    expect(double.map((l) => l.bars)).toEqual(as.map((l) => l.bars * 2));
    // Two chords halve to a bar of 2 + 2; three chords keep their 2 bars.
    expect(half.map((l) => l.bars)).toEqual([2, 1, 2, 1]);
    expect(half[1]!.chords.map((c) => c.beats)).toEqual([2, 2]);
    for (const [i, l] of double.entries())
      expect(l.chords.map((c) => c.symbol)).toEqual(as[i]!.chords.map((c) => c.symbol));
  });

  it('leaves lines with no words a bar a chord, and lines with no chords empty', () => {
    const [none, empty, timed] = estimateSheetTiming(
      [pair('C   G', '  --  '), { chords: [], lyric: 'la la' }, SHEET[0]!],
      4,
    );
    expect(none).toEqual({
      chords: [
        { symbol: 'C', beats: 4 },
        { symbol: 'G', beats: 4 },
      ],
      bars: 2,
      confidence: 'rough',
    });
    expect(empty).toEqual({ chords: [], bars: 0, confidence: 'rough' });
    expect(timed!.bars).toBeGreaterThan(0);
  });

  it('times a line alone as a sheet of one line', () => {
    expect(estimateLineTiming(SHEET[1]!.chords, SHEET[1]!.lyric, 4)).toEqual(
      estimateSheetTiming([SHEET[1]!], 4)[0],
    );
  });
});

describe('timing on the evaluation set', () => {
  const vectors = VECTORS as TimingVector[];

  it('reproduces every vector in timing.vectors.json exactly', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(TIMING_FIXTURES.length);
    expect(new Set(vectors.map((v) => v.input.scale))).toEqual(new Set([1, 0.5, 2]));
    for (const { input, output } of vectors)
      expect(estimateSheetTiming(input.lines, input.beatsPerBar, { scale: input.scale })).toEqual(
        output,
      );
  });

  it('has vectors that match the fixtures (npm run eval:timing -- --write-vectors)', () => {
    expect(timingVectors(TIMING_FIXTURES)).toEqual(vectors);
  });

  it('keeps every line whole: beats of at least 1 that fill 1, 2, 4 or 8 bars', () => {
    for (const { input, output } of vectors)
      for (const [i, line] of output.entries()) {
        expect([1, 2, 4, 8]).toContain(line.bars);
        expect(line.chords.map((c) => c.symbol)).toEqual(
          input.lines[i]!.chords.map((c) => c.symbol),
        );
        expect(line.chords.every((c) => Number.isInteger(c.beats) && c.beats >= 1)).toBe(true);
        expect(line.chords.reduce((n, c) => n + c.beats, 0)).toBe(line.bars * input.beatsPerBar);
      }
  });

  it('has public-domain songs in 4/4 and 3/4, Indonesian lines, and a test half', () => {
    const english = TIMING_FIXTURES.filter((f) => !f.source.startsWith('Original'));
    expect(english.length).toBeGreaterThanOrEqual(12);
    expect(TIMING_FIXTURES.filter((f) => f.split === 'test').length).toBeGreaterThanOrEqual(6);
    expect(new Set(TIMING_FIXTURES.map((f) => f.beatsPerBar))).toEqual(new Set([3, 4]));
    expect(TIMING_FIXTURES.some((f) => f.sheet.includes('\t'))).toBe(true);
  });

  /** Right beats, beats, right bar counts, scale-free points right, lines read at ×2 or ×½. */
  const t = (x: Tally) => [x.right, x.beats, x.barsRight, x.shapeRight, x.doubled];

  it('scores the tune half as measured, well above one chord a bar', () => {
    const { rows, estimated, baseline } = scoreAll(
      TIMING_FIXTURES.filter((f) => f.split === 'tune'),
    );
    expect(rows.map((r) => [r.id, t(r.estimated), t(r.baseline)])).toEqual([
      ['amazing-grace', [52, 57, 5, 220, 0], [45, 57, 3, 228, 1]],
      ['silent-night', [55, 72, 4, 208, 1], [24, 72, 0, 216, 3]],
      ['oh-susanna', [56, 64, 4, 168, 0], [16, 64, 0, 144, 1]],
      ['when-the-saints', [16, 64, 0, 192, 4], [32, 64, 0, 168, 1]],
      ['swing-low', [39, 56, 5, 246, 1], [30, 64, 2, 228, 0]],
      ['auld-lang-syne', [62, 64, 4, 186, 0], [48, 72, 1, 160, 0]],
      ['yankee-doodle', [63, 64, 4, 189, 0], [40, 64, 2, 180, 2]],
      ['red-river-valley', [16, 64, 0, 192, 4], [32, 64, 0, 168, 1]],
      ['camptown-races', [62, 64, 4, 186, 0], [16, 64, 0, 168, 1]],
      ['home-on-the-range', [45, 48, 4, 180, 0], [18, 48, 0, 180, 3]],
      ['clementine', [48, 48, 4, 192, 0], [30, 48, 2, 168, 2]],
      ['my-bonnie', [48, 48, 4, 192, 0], [36, 48, 0, 144, 0]],
      ['down-in-the-valley', [47, 48, 4, 188, 0], [12, 48, 0, 192, 4]],
      ['senja', [44, 80, 3, 198, 2], [38, 84, 1, 210, 2]],
      ['tidurlah', [41, 48, 4, 164, 0], [24, 48, 0, 156, 1]],
      ['this-old-man', [21, 40, 3, 144, 1], [22, 44, 1, 156, 0]],
      ['polly-wolly-doodle', [28, 32, 4, 168, 0], [18, 36, 1, 180, 2]],
      ['buffalo-gals', [31, 32, 4, 186, 0], [24, 32, 2, 192, 2]],
      ['skip-to-my-lou', [32, 32, 4, 192, 0], [20, 32, 1, 192, 3]],
    ]);
    expect(beatAccuracy(estimated)).toBeCloseTo(0.786, 3);
    expect(beatAccuracy(baseline)).toBeCloseTo(0.499, 3);
    expect(barMatch(estimated)).toBeCloseTo(0.84, 3);
    expect(shapeAccuracy(estimated)).toBeCloseTo(0.924, 3);
  });

  it('scores the test half as measured (never used to set the constants)', () => {
    const { rows, estimated, baseline } = scoreAll(
      TIMING_FIXTURES.filter((f) => f.split === 'test'),
    );
    expect(rows.map((r) => [r.id, t(r.estimated), t(r.baseline)])).toEqual([
      ['are-you-sleeping', [17, 40, 3, 126, 1], [20, 64, 0, 156, 1]],
      ['mary-had-a-little-lamb', [29, 32, 4, 174, 0], [24, 32, 2, 192, 2]],
      ['coming-round-the-mountain', [20, 56, 1, 180, 3], [28, 32, 3, 192, 1]],
      ['muffin-man', [32, 32, 4, 192, 0], [32, 32, 4, 192, 0]],
      ['aura-lee', [32, 32, 4, 192, 0], [32, 32, 4, 192, 0]],
      ['old-smoky', [12, 48, 0, 192, 4], [12, 48, 0, 192, 4]],
    ]);
    // As estimated, no better than one chord a bar on these beats; Half or Double fixes most.
    expect(beatAccuracy(estimated)).toBeCloseTo(0.592, 3);
    expect(beatAccuracy(baseline)).toBeCloseTo(0.617, 3);
    expect(barMatch(estimated)).toBeCloseTo(0.667, 3);
    const best = scoreAll(
      TIMING_FIXTURES.filter((f) => f.split === 'test'),
      { bestScale: true },
    );
    expect(beatAccuracy(best.estimated)).toBeCloseTo(0.889, 3);
    expect(barMatch(best.estimated)).toBeCloseTo(0.958, 3);
  });

  it('hardly moves when every chord in a sheet is written a column or two off', () => {
    // [shift, least share of beats the same, least share of the line's shape the same]
    // Beats move more than the shape: a sheet whose speed sits near the boundary between
    // two readings a factor of 2 apart can tip over, which Half or Double puts back.
    for (const [shift, beats, shape] of [
      [-2, 0.95, 0.97],
      [-1, 0.98, 0.99],
      [1, 0.92, 0.97],
      [2, 0.85, 0.93],
    ] as const) {
      let same = 0;
      let total = 0;
      let alike = 0;
      let points = 0;
      for (const { input, output } of vectors.filter((v) => v.input.scale === 1)) {
        const moved = input.lines.map((l) => {
          let next = 0;
          return {
            lyric: l.lyric,
            chords: l.chords.map((c) => {
              const col = Math.max(next, c.col + shift);
              next = col + c.symbol.length + 1;
              return { ...c, col };
            }),
          };
        });
        const got = estimateSheetTiming(moved, input.beatsPerBar);
        for (const [i, line] of output.entries()) {
          const a = beatsOf(line);
          const b = beatsOf(got[i]!);
          for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] === b[k]) same++;
          total += Math.max(a.length, b.length);
          for (let k = 0; k < SHAPE; k++) {
            const at = (x: string[]) => x[Math.floor(((k + 0.5) * x.length) / SHAPE)];
            if (at(a) === at(b)) alike++;
            points++;
          }
        }
      }
      expect(same / total).toBeGreaterThanOrEqual(beats);
      expect(alike / points).toBeGreaterThanOrEqual(shape);
    }
  });
});
