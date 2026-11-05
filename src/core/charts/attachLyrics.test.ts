import { describe, expect, it } from 'vitest';
import { attachLyrics, chordLikeness } from './attachLyrics';
import { withLyric } from './lyrics';
import type { SectionType } from './sections';
import { parseBars } from './syntax';
import { emptyChart, expandForm, LIMITS, type ChartSection, type ChordChart } from './types';

// Every chart, sheet and word here is invented for these tests.

const section = (
  id: string,
  label: string,
  type: SectionType,
  bars: string,
  repeat = 1,
): ChartSection => ({ id, label, type, repeat, bars: parseBars(bars, 4).bars });

const chartOf = (sections: ChartSection[], form: string[]): ChordChart => ({
  ...emptyChart('Lantern tide'),
  sections,
  form,
});

/** Verse and chorus, played verse, chorus, verse, chorus. */
const song = () =>
  chartOf(
    [
      section('v', 'Verse', 'verse', '| C | G | Am | F |'),
      section('c', 'Chorus', 'chorus', '| F | G | C | C |'),
    ],
    ['v', 'c', 'v', 'c'],
  );

const VERSE_1 = [
  'C              G',
  'paper lanterns drift along',
  'Am             F',
  'over water slow and long',
];
const VERSE_2 = [
  'C              G',
  'morning gulls above the pier',
  'Am             F',
  'calling out the year is here',
];
const CHORUS = ['F          G          C', 'carry me home on the tide'];

const sheetOf = (...parts: string[][]) => parts.flat().join('\n');

/** Each section's words, bar by bar, "-" for none. */
const words = (r: Pick<ChordChart, 'sections'>) =>
  Object.fromEntries(r.sections.map((s) => [s.label, s.bars.map((b) => b.lyric ?? '-')]));

/** What is played, chord by chord, with beats, the form written out: what must never change. */
const playedChords = (c: Pick<ChordChart, 'sections' | 'form'>) =>
  expandForm(c).map((r) => r.bar.chords.map((x) => `${x.symbol}:${x.beats}`).join(' '));

/** Pass a section's chords (to a key). */
const transposed = (lines: string[], map: Record<string, string>) =>
  lines.map((l) => (/[a-z]{3}/.test(l) ? l : l.replace(/[A-G][#b]?m?/g, (c) => map[c] ?? c)));

describe('chordLikeness', () => {
  it('scores the same chord, the same family, the same root, and unlike chords', () => {
    expect(chordLikeness('C', 'C')).toBe(3);
    expect(chordLikeness('Bb/D', 'A#/D')).toBe(3);
    expect(chordLikeness('Cmaj7', 'C')).toBe(2);
    expect(chordLikeness('Cadd9', 'C')).toBe(2);
    expect(chordLikeness('Am7', 'Am')).toBe(2);
    expect(chordLikeness('C/E', 'C')).toBe(2);
    expect(chordLikeness('Cm', 'C')).toBe(1);
    expect(chordLikeness('G', 'C')).toBe(0);
    expect(chordLikeness('N.C.', 'N.C.')).toBe(3);
    expect(chordLikeness('N.C.', 'C')).toBe(0);
  });

  it('moves the sheet chord first', () => {
    expect(chordLikeness('D', 'C', -2)).toBe(3);
    expect(chordLikeness('Bm7', 'Am', -2)).toBe(2);
    expect(chordLikeness('D/F#', 'C/E', -2)).toBe(3);
  });
});

describe('attachLyrics', () => {
  it('puts each chord’s words on the bar it starts in, when the chords match exactly', () => {
    const r = attachLyrics(song(), sheetOf(['[Verse]'], VERSE_1, ['[Chorus]'], CHORUS));
    expect(words(r)).toEqual({
      Verse: ['paper lanterns', 'drift along', 'over water slow', 'and long'],
      Chorus: ['carry me', 'home on the', 'tide', '-'],
    });
    expect(r.form).toEqual(['v', 'c', 'v', 'c']);
    // Played twice, written once: the second verse and chorus share the words.
    expect(r.report).toMatchObject({ shift: 0, copies: 0, noLyrics: false, leftOut: [] });
    expect(r.report.bars).toBe(16);
    expect(r.report.barsWithWords).toBe(14);
    // The second time through had nothing to match: half the changes.
    expect(r.report.events).toBe(14);
    expect(r.report.matched).toBe(7);
  });

  it('finds a sheet written two semitones up (a capo) and says so', () => {
    const up = { C: 'D', G: 'A', Am: 'Bm', F: 'G' };
    const sheet = sheetOf(
      ['[Verse]'],
      transposed(VERSE_1, up),
      ['[Chorus]'],
      transposed(CHORUS, up),
    );
    expect(sheet).toContain('Bm');
    const r = attachLyrics(song(), sheet);
    expect(r.report.shift).toBe(2);
    expect(words(r).Verse).toEqual([
      'paper lanterns',
      'drift along',
      'over water slow',
      'and long',
    ]);
    // And down: a sheet in A♭ over a chart in C.
    const down = { C: 'Ab', G: 'Eb', Am: 'Fm', F: 'Db' };
    const r2 = attachLyrics(song(), sheetOf(['[Verse]'], transposed(VERSE_1, down)));
    expect(r2.report.shift).toBe(-4);
    expect(words(r2).Verse![2]).toBe('over water slow');
  });

  it('matches sevenths on the sheet to triads in the chart', () => {
    const sevenths = {
      C: 'Cmaj7',
      G: 'G7',
      Am: 'Am7',
      F: 'Fmaj7',
    };
    const r = attachLyrics(song(), sheetOf(['[Verse]'], transposed(VERSE_1, sevenths)));
    expect(words(r).Verse).toEqual([
      'paper lanterns',
      'drift along',
      'over water slow',
      'and long',
    ]);
    expect(r.report.sections[0]).toMatchObject({ label: 'Verse', events: 8, matched: 4 });
    // The chords stay the chart's own.
    expect(r.sections[0]!.bars.map((b) => b.chords[0]!.symbol)).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('leaves a bridge the sheet skips without words, and the chorus after it still gets its own', () => {
    const chart = chartOf(
      [
        section('v', 'Verse', 'verse', '| C | G | Am | F |'),
        section('c', 'Chorus', 'chorus', '| F | G | C | C |'),
        section('i', 'Interlude', 'interlude', '| Dm | Em | F | G |'),
      ],
      ['v', 'c', 'i', 'c'],
    );
    const other = ['F          G          C', 'lift the sails and turn the bay'];
    const r = attachLyrics(
      chart,
      sheetOf(['[Verse]'], VERSE_1, ['[Chorus]'], CHORUS, ['[Chorus]'], other),
    );
    expect(r.report.noWords).toEqual(['Interlude']);
    expect(r.report.sections.find((s) => s.label === 'Interlude')).toMatchObject({
      matched: 0,
      unmatchedBars: [0, 1, 2, 3],
    });
    // The two choruses differ: the second is a copy, with the same bars.
    expect(words(r)['Chorus 2']).toEqual(['lift the', 'sails and', 'turn the bay', '-']);
    expect(r.form).toEqual(['v', 'c', 'i', 'copy1']);
    expect(r.report).toMatchObject({ copies: 1, matched: 10, events: 14 });
  });

  it('writes the chorus once for a chart that plays it twice, and copies it only when its words differ', () => {
    const chart = chartOf([section('c', 'Chorus', 'chorus', '| F | G | C | C |')], ['c', 'c']);
    const once = attachLyrics(chart, sheetOf(['[Chorus]'], CHORUS));
    expect(once.sections).toHaveLength(1);
    expect(once.form).toEqual(['c', 'c']);
    expect(once.report.barsWithWords).toBe(6);

    const same = attachLyrics(chart, sheetOf(['[Chorus]'], CHORUS, ['[Chorus]'], CHORUS));
    expect(same.sections).toHaveLength(1);
    expect(same.report).toMatchObject({ copies: 0, matched: 6, events: 6 });
  });

  it('gives verse 2 its own copy of the verse, with the same bars and the form pointing to it', () => {
    const r = attachLyrics(
      song(),
      sheetOf(
        ['[Verse]'],
        VERSE_1,
        ['[Chorus]'],
        CHORUS,
        ['[Verse 2]'],
        VERSE_2,
        ['[Chorus]'],
        CHORUS,
      ),
      { newId: () => 'v2' },
    );
    expect(r.sections.map((s) => [s.id, s.label])).toEqual([
      ['v', 'Verse'],
      ['v2', 'Verse 2'],
      ['c', 'Chorus'],
    ]);
    expect(r.form).toEqual(['v', 'c', 'v2', 'c']);
    expect(words(r)['Verse 2']).toEqual([
      'morning gulls',
      'above the pier',
      'calling out the',
      'year is here',
    ]);
    expect(r.sections[1]!.bars.map((b) => b.chords)).toEqual(
      r.sections[0]!.bars.map((b) => b.chords),
    );
    expect(r.sections[1]).toMatchObject({ type: 'verse', repeat: 1 });
    expect(r.report).toMatchObject({ copies: 1, matched: 14, events: 14, barsWithWords: 14 });
    expect(r.report.sections[1]).toMatchObject({ label: 'Verse 2', copyOf: 'v', matched: 4 });
  });

  it('reads an Indonesian sheet, Bait and Reff, numbered copies counting on', () => {
    const chart = chartOf(
      [
        section('b', 'Bait 1', 'verse', '| G | D | Em | C |'),
        section('r', 'Reff', 'chorus', '| C D | G Em | C D | G |'),
      ],
      ['b', 'r', 'b', 'r'],
    );
    const sheet = [
      'Bait 1:',
      'G             D',
      'langit sore berwarna jingga',
      'Em            C',
      'angin pelan di tepi kota',
      'Reff:',
      'C    D        G     Em',
      'pulanglah bersama ombak',
      'C    D        G',
      'pulanglah sebelum gelap',
      'Bait 2:',
      'G             D',
      'perahu kecil menunggu pagi',
      'Em            C',
      'lampu kapal menyala lagi',
      'Reff 2x',
    ].join('\n');
    const r = attachLyrics(chart, sheet);
    expect(r.sections.map((s) => s.label)).toEqual(['Bait 1', 'Bait 2', 'Reff']);
    expect(words(r)['Bait 2']).toEqual([
      'perahu kecil',
      'menunggu pagi',
      'lampu kapal',
      'menyala lagi',
    ]);
    // Each word goes with the chord whose column it starts at or after.
    expect(words(r).Reff).toEqual(['pulanglah', 'bersama ombak', 'pulanglah', 'sebelum gelap']);
  });

  it('never changes a chord, a beat or a bar, whatever the sheet', () => {
    const charts = [
      song(),
      chartOf(
        [
          section('i', 'Intro', 'intro', '| N.C. | C . . G |'),
          section('v', 'Verse', 'verse', '| Am7 | D7 | Gmaj7 Cmaj7 | F#m7b5 B7 |', 2),
          section('c', 'Chorus', 'chorus', '| Em | C | G/B | D |'),
        ],
        ['i', 'v', 'c', 'v', 'c', 'c'],
      ),
      chartOf([section('x', 'Riff', 'custom', '| E5 | E5 | G5 A5 | E5 |', 4)], ['x', 'x']),
    ];
    const sheets = [
      sheetOf(['[Verse]'], VERSE_1, ['[Chorus]'], CHORUS, ['[Verse]'], VERSE_2),
      sheetOf(transposed(VERSE_2, { C: 'E', G: 'B', Am: 'C#m', F: 'A' })),
      'Em7   A7   Dmaj7\nsome words drift over here\nBm   E\nmore of them now',
      '[C]sing it [G]low and [Am]slow, [F]oh',
      '| C | G |\n| Am | F |',
      'no chords at all, only a line of words',
    ];
    for (const chart of charts)
      for (const sheet of sheets) {
        const before = playedChords(chart);
        const r = attachLyrics(chart, sheet);
        expect(playedChords(r)).toEqual(before);
        for (const s of r.sections) {
          const original = chart.sections.find(
            (x) => x.id === s.id || x.id === r.report.sections.find((y) => y.id === s.id)?.copyOf,
          )!;
          expect(s.bars.map((b) => b.chords)).toEqual(original.bars.map((b) => b.chords));
          expect(s.repeat).toBe(original.repeat);
        }
        expect(r.form).toHaveLength(chart.form.length);
      }
  });

  it('cuts a bar’s words at a word to the lyric limit', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const r = attachLyrics(song(), sheetOf(['C'], [long, 'G'], ['short']));
    const first = r.sections[0]!.bars[0]!.lyric!;
    expect(first.length).toBeLessThanOrEqual(LIMITS.lyric);
    expect(long.startsWith(first)).toBe(true);
    expect(long[first.length]).toBe(' ');
    expect(r.report.cut).toBe(true);
  });

  it('changes nothing for a sheet with no words, and says so', () => {
    const chart = song();
    chart.sections[0]!.bars[0] = withLyric(chart.sections[0]!.bars[0]!, 'kept as it was');
    const r = attachLyrics(chart, '[Verse]\n| C | G | Am | F |\n[Chorus]\n| F | G | C | C |');
    expect(r.sections).toBe(chart.sections);
    expect(r.form).toBe(chart.form);
    expect(r.report).toMatchObject({ noLyrics: true, barsWithWords: 0, copies: 0 });
    expect(r.report.matched).toBe(7);
  });

  it('replaces the lyrics a chart had', () => {
    const chart = song();
    chart.sections[1]!.bars[3] = withLyric(chart.sections[1]!.bars[3]!, 'old words');
    const r = attachLyrics(chart, sheetOf(['[Verse]'], VERSE_1));
    expect(words(r).Chorus).toEqual(['-', '-', '-', '-']);
    expect(r.report.noWords).toEqual(['Chorus']);
  });

  it('gives the words of a chord the chart lacks to the chord before it on the line', () => {
    const passing = ['C        G/B      Am             F', 'paper lanterns drift along the shore'];
    const r = attachLyrics(
      chartOf([section('v', 'Verse', 'verse', '| C | Am | F |')], ['v']),
      sheetOf(passing),
    );
    expect(words(r).Verse).toEqual(['paper lanterns', 'drift along the', 'shore']);
    expect(r.report).toMatchObject({ matched: 3, events: 3, leftOut: [] });
  });

  it('spreads a held chord’s words over the bars it lasts', () => {
    const chart = chartOf([section('v', 'Verse', 'verse', '| C | C | G | G |')], ['v']);
    const sheet = [
      'C',
      'first line of words here',
      'C',
      'second line of words',
      'G',
      'third',
      'G',
      'fourth',
    ].join('\n');
    const r = attachLyrics(chart, sheet);
    expect(words(r).Verse).toEqual([
      'first line of words here',
      'second line of words',
      'third',
      'fourth',
    ]);
  });

  it('lets section names settle a tie, and no more', () => {
    const chart = chartOf(
      [section('v', 'Verse', 'verse', '| C | G |'), section('c', 'Chorus', 'chorus', '| C | G |')],
      ['v', 'c'],
    );
    const line = ['C              G', 'paper lanterns drift along'];
    // The same chords in both: the sheet's Chorus goes to the chorus.
    expect(words(attachLyrics(chart, sheetOf(['[Chorus]'], line)))).toEqual({
      Verse: ['-', '-'],
      Chorus: ['paper lanterns', 'drift along'],
    });
    // A name never outweighs the chords: a "Chorus" of the verse's chords goes to the verse.
    const other = chartOf(
      [section('v', 'Verse', 'verse', '| C | G |'), section('c', 'Chorus', 'chorus', '| Dm | E |')],
      ['v', 'c'],
    );
    expect(words(attachLyrics(other, sheetOf(['[Chorus]'], line))).Verse).toEqual([
      'paper lanterns',
      'drift along',
    ]);
  });

  it('fits a sheet the way sheets are written to a chart timed from a recording', () => {
    // Uneven lengths, an intro and a solo the sheet leaves out; the sheet in A over a chart in
    // G, with sevenths, a passing chord, Asus4 into A, and "Reff" alone for the chorus again.
    const chart = chartOf(
      [
        section('i', 'Intro', 'intro', '| G | G | C | D |'),
        section('v', 'Verse', 'verse', '| G | G D | Em | Em | C | C D | G | G |'),
        section('c', 'Chorus', 'chorus', '| C | D | G . . Em | Em | C | D | G | G |'),
        section('s', 'Solo', 'solo', '| Em | C | G | D |'),
      ],
      ['i', 'v', 'c', 'v', 'c', 's', 'c'],
    );
    const sheet = [
      'Verse 1:',
      'A                    E',
      'lanterns hang along the quay',
      'F#m7                 D       E',
      'someone sings a song for me',
      'A          C#m/G#    A',
      'and the evening settles in',
      'Reff:',
      'D        E          A      F#m',
      'carry me home before the light',
      'D        E          Asus4  A',
      'carry me home across the night',
      'Verse 2:',
      'A                    E',
      'boats come in with silver nets',
      'F#m7                 D       E',
      'gulls are calling no regrets',
      'A          C#m/G#    A',
      'and the harbour sleeps again',
      'Reff',
      'Reff',
    ].join('\n');
    const r = attachLyrics(chart, sheet);
    expect(r.report).toMatchObject({ shift: 2, events: 40, matched: 33, copies: 1, leftOut: [] });
    expect(r.report.noWords).toEqual(['Intro', 'Solo']);
    expect(words(r)).toEqual({
      Intro: ['-', '-', '-', '-'],
      Verse: [
        ...['lanterns hang along', 'the quay', 'someone sings a song', '-'],
        ...['for me', '-', 'and the evening settles in', '-'],
      ],
      'Verse 2': [
        ...['boats come in with', 'silver nets', 'gulls are calling no', '-'],
        ...['regrets', '-', 'and the harbour sleeps again', '-'],
      ],
      // Played three times, the same words each time: one chorus. Asus4's word goes with the A.
      Chorus: [
        ...['carry me', 'home before', 'the light', '-'],
        ...['carry me', 'home across', 'the night', '-'],
      ],
      Solo: ['-', '-', '-', '-'],
    });
    expect(r.form).toEqual(['i', 'v', 'c', 'copy1', 'c', 's', 'c']);
    expect(playedChords(r)).toEqual(playedChords(chart));
  });

  it('reports lines of words with no chords above them', () => {
    const r = attachLyrics(song(), sheetOf(['[Verse]', 'a line sung before any chord'], VERSE_1));
    expect(r.report.leftOut).toEqual([2]);
    expect(words(r).Verse![0]).toBe('paper lanterns');
  });

  it('keeps the first time’s words for a section played ×2 in one place', () => {
    const chart = chartOf([section('c', 'Chorus', 'chorus', '| F | G | C | C |', 2)], ['c']);
    const other = ['F          G          C', 'lift the sails and turn the bay'];
    const r = attachLyrics(chart, sheetOf(['[Chorus]'], CHORUS, other));
    expect(r.sections).toHaveLength(1);
    expect(words(r).Chorus).toEqual(['carry me', 'home on the', 'tide', '-']);
    expect(r.report.repeatsDiffer).toEqual(['Chorus']);
  });

  it('makes no copy past the sections limit', () => {
    const chart = song();
    for (let i = chart.sections.length; i < LIMITS.sections; i++)
      chart.sections.push(section(`x${i}`, `Extra ${i}`, 'custom', '| E |'));
    const r = attachLyrics(
      chart,
      sheetOf(['[Verse]'], VERSE_1, ['[Chorus]'], CHORUS, ['[Verse 2]'], VERSE_2),
    );
    expect(r.sections).toHaveLength(LIMITS.sections);
    expect(r.form).toEqual(chart.form);
    expect(r.report).toMatchObject({ copies: 0, copiesSkipped: 1 });
    expect(words(r).Verse![0]).toBe('paper lanterns');
  });

  it('names a copy so that no two sections share a label', () => {
    const chart = song();
    chart.sections.push(section('v2', 'Verse 2', 'verse', '| E |'));
    const r = attachLyrics(
      chart,
      sheetOf(['[Verse]'], VERSE_1, ['[Chorus]'], CHORUS, ['[Verse]'], VERSE_2),
    );
    expect(r.sections.map((s) => s.label)).toEqual(['Verse', 'Verse 3', 'Chorus', 'Verse 2']);
  });
});
