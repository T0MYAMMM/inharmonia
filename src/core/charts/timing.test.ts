import { describe, expect, it } from 'vitest';
import {
  countSyllables,
  estimateLineTiming,
  expandTabs,
  isIndonesian,
  type LineChord,
  type LineTiming,
} from './timing';

/** Chords over a lyric, as a sheet shows them: each chord's column is where it is written. */
function line(chords: string, lyric: string, beatsPerBar = 4) {
  const placed: LineChord[] = [...expandTabs(chords).matchAll(/\S+/g)].map((m) => ({
    symbol: m[0],
    col: m.index,
  }));
  return estimateLineTiming(placed, expandTabs(lyric), beatsPerBar);
}
const show = (t: LineTiming) => t.chords.map((c) => `${c.symbol}:${c.beats}`).join(' ');

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
