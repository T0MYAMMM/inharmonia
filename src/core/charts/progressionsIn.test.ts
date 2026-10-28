import { describe, expect, it } from 'vitest';
import { PROGRESSIONS } from '@/content/progressions';
import { romanToChord } from '../theory';
import { chartProgressions, findProgressions, type ProgressionMatch } from './progressionsIn';
import { parseBars } from './syntax';
import { DEFAULT_VIEW, emptyChart, type ChartBar, type ChordChart } from './types';

const C = { tonic: 'C', mode: 'major' } as const;
const Am = { tonic: 'A', mode: 'minor' } as const;
const bars = (text: string, beats: 3 | 4 = 4) => parseBars(text, beats).bars;
const find = (text: string, key: { tonic: string; mode: 'major' | 'minor' } = C) =>
  findProgressions(bars(text), key, PROGRESSIONS);
const romanIn = (numeral: string, key: { tonic: string; mode: 'major' | 'minor' }) =>
  romanToChord(numeral, key.tonic, key.mode);

/** "i-v-vi-iv 1–4 ×1", "vi-iv-i-v whole 1–4 from vi in C major". */
const show = (ms: ProgressionMatch[]) =>
  ms.map((m) =>
    [
      m.id,
      m.whole ? 'whole' : null,
      m.spans.map((s) => `${s.from}–${s.to}${s.times > 1 ? ` ×${s.times}` : ''}`).join(', '),
      m.startsOn ? `from ${m.startsOn}` : null,
      m.readIn ? `in ${m.readIn.tonic} ${m.readIn.mode}` : null,
    ]
      .filter(Boolean)
      .join(' '),
  );

describe('finding library progressions in bars', () => {
  it('finds a loop that is the whole section, and the same loop by its other name', () => {
    expect(show(find('C G Am F'))).toEqual(['i-v-vi-iv whole 1–4', 'vi-iv-i-v whole 1–4 from I']);
  });

  it('counts a loop gone round more than once', () => {
    expect(show(find('C G Am F C G Am F'))[0]).toEqual('i-v-vi-iv whole 1–8 ×2');
  });

  it('finds a loop started from anywhere, and the progression that starts there', () => {
    expect(show(find('Am F C G'))).toEqual(['vi-iv-i-v whole 1–4', 'i-v-vi-iv whole 1–4 from vi']);
    expect(show(find('F C G Am'))).toEqual([
      'i-v-vi-iv whole 1–4 from IV',
      'vi-iv-i-v whole 1–4 from IV',
    ]);
  });

  it('reads triads: sevenths, extensions, sus and slash basses are the same chord', () => {
    expect(show(find('Dm7 | G7sus4 G7 | Cmaj7/E | C6'))).toEqual(['ii-v-i whole 1–4']);
    expect(show(find('Dm9 G13 Cadd9'))).toEqual(['ii-v-i whole 1–3']);
  });

  it('counts a chord once however long it lasts', () => {
    expect(show(find('| C | C | G G | Am | F | F |'))[0]).toEqual('i-v-vi-iv whole 1–6');
  });

  it('finds a run inside a longer section, by its bars', () => {
    expect(show(find('Em Am Dm7 G7 C Am'))).toEqual(['ii-v-i 3–5']);
    expect(show(find('C Am Dm7 G7 C F'))).toEqual(['i-vi-ii-v 1–4', 'ii-v-i 3–5']);
  });

  it('finds each place a run is, and overlapping ones', () => {
    expect(show(find('Dm7 G7 Cmaj7 Am7 Dm7 G7 Cmaj7 F'))).toEqual([
      'ii-v-i 1–3, 5–7',
      'i-vi-ii-v 3–6',
    ]);
  });

  it('a run that goes round again counts each time, without the same loop again inside it', () => {
    expect(show(find('C G Am F C G Am F G'))).toEqual(['i-v-vi-iv 1–8 ×2']);
    // Round once and a half: the half is not a second time, but it is where the loop is.
    expect(show(find('C G Am F C G F'))).toEqual(['i-v-vi-iv 1–4']);
  });

  it('a run must start where the progression starts', () => {
    // vi IV I V inside a longer line is vi–IV–I–V, not I–V–vi–IV started on vi.
    expect(show(find('Em Am F C G Em'))).toEqual(['vi-iv-i-v 2–5']);
  });

  it('finds the twelve-bar blues and the circle of fifths', () => {
    expect(show(find('C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7'))).toEqual([
      'twelve-bar-blues whole 1–12',
    ]);
    // Round the circle: the last Cmaj7 is the first again.
    expect(show(find('Cmaj7 Fmaj7 Bm7b5 Em7 Am7 Dm7 G7 Cmaj7'))).toEqual([
      'circle-of-fifths whole 1–8',
      'ii-v-i 6–8',
    ]);
    expect(show(find('Cmaj7 Fmaj7 Bm7b5 Em7 Am7 Dm7 G7 Cmaj7 Am'))).toEqual([
      'circle-of-fifths 1–8',
      'ii-v-i 6–8',
    ]);
  });

  it('reads minor keys against their own scale, with the major V', () => {
    expect(show(find('Am G F E7', Am))).toEqual(['minor-descent whole 1–4']);
    expect(show(find('Am G F Em', Am))).toEqual([]);
  });

  it('reads the other mode in the relative key, and says so', () => {
    expect(show(find('Am F C G', Am))).toEqual([
      'vi-iv-i-v whole 1–4 in C major',
      'i-v-vi-iv whole 1–4 from vi in C major',
    ]);
    expect(show(find('C Am G F E7 Am', C))).toEqual(['minor-descent 2–5 in A minor']);
  });

  it('finds nothing for a secondary dominant that fits no progression', () => {
    // A7 is V7/ii: I–VI7–ii–V is not I–vi–ii–V.
    expect(find('C A7 Dm G7')).toEqual([]);
    expect(find('C E7 Am D7 G7')).toEqual([]);
    // It doesn't hide the ii–V–I after it.
    expect(show(find('C A7 Dm G7 C'))).toEqual(['ii-v-i 3–5']);
  });

  it('N.C. and chords it cannot read break a run, and a loop', () => {
    expect(find('Dm7 N.C. G7 C')).toEqual([]);
    const unknown: ChartBar[] = [
      ...bars('Dm7'),
      { chords: [{ symbol: 'Hx', beats: 4 }] },
      ...bars('G7 C'),
    ];
    expect(findProgressions(unknown, C, PROGRESSIONS)).toEqual([]);
    expect(show(find('C G Am F N.C.'))).toEqual(['i-v-vi-iv 1–4']);
  });

  it('works the same in 3/4', () => {
    expect(show(findProgressions(bars('| Dm G | C |', 3), C, PROGRESSIONS))).toEqual([
      'ii-v-i whole 1–2',
    ]);
  });

  it('finds nothing in an empty section or one chord', () => {
    expect(findProgressions([], C, PROGRESSIONS)).toEqual([]);
    expect(find('C C C C')).toEqual([]);
    expect(find('N.C.')).toEqual([]);
  });

  it('every library progression finds itself, in every key it is written for', () => {
    for (const p of PROGRESSIONS) {
      const key = p.mode === 'minor' ? Am : C;
      const text = p.steps.map((s) => s.numeral).join(' ');
      expect(text, p.id).toBeTruthy();
      const m = findProgressions(
        p.steps.map((s) => ({ chords: [{ symbol: romanIn(s.numeral, key), beats: 4 }] })),
        key,
        PROGRESSIONS,
      );
      expect(
        m.map((x) => x.id),
        p.id,
      ).toContain(p.id);
      expect(m.find((x) => x.id === p.id)!.startsOn, p.id).toBeUndefined();
    }
  });
});

describe("a chart's sections, as numerals and progressions", () => {
  const chart: ChordChart = {
    ...emptyChart('Harbour lights'),
    sections: [
      { id: 'v', label: 'Verse', type: 'verse', repeat: 1, bars: bars('C G Am F C G Am F') },
      { id: 'c', label: 'Chorus', type: 'chorus', repeat: 2, bars: bars('Am F C G') },
      {
        id: 'b',
        label: 'Bridge',
        type: 'bridge',
        repeat: 1,
        bars: bars('| C/E | A7 | Dm7 G7 | N.C. |'),
      },
    ],
    form: ['v', 'c', 'v', 'c', 'b'],
  };

  it('gives each section once, in the order entered, with chords and numerals', () => {
    const s = chartProgressions(chart, DEFAULT_VIEW, PROGRESSIONS);
    expect(s.map((x) => x.label)).toEqual(['Verse', 'Chorus', 'Bridge']);
    expect(s[2]!.bars).toEqual([
      [{ symbol: 'C/E', numeral: 'I⁶', beats: 4 }],
      [{ symbol: 'A7', numeral: 'VI7', beats: 4 }],
      [
        { symbol: 'Dm7', numeral: 'ii7', beats: 2 },
        { symbol: 'G7', numeral: 'V7', beats: 2 },
      ],
      [{ symbol: 'N.C.', numeral: null, beats: 4 }],
    ]);
    expect(s.map((x) => show(x.matches))).toEqual([
      ['i-v-vi-iv whole 1–8 ×2', 'vi-iv-i-v whole 1–8 ×2 from I'],
      ['vi-iv-i-v whole 1–4', 'i-v-vi-iv whole 1–4 from vi'],
      [],
    ]);
  });

  it('shows the chords in the view, finds the same, and moves a relative key with it', () => {
    const view = { ...DEFAULT_VIEW, transpose: 7, simplify: 'basic' as const };
    const s = chartProgressions(chart, view, PROGRESSIONS);
    expect(s[0]!.bars.flat().map((c) => `${c.symbol} ${c.numeral}`)).toEqual([
      'G I',
      'D V',
      'Em vi',
      'C IV',
      'G I',
      'D V',
      'Em vi',
      'C IV',
    ]);
    expect(s[2]!.bars.flat().map((c) => c.symbol)).toEqual(['G', 'E', 'Am', 'D', 'N.C.']);
    expect(s.map((x) => x.matches.map((m) => m.id))).toEqual([
      ['i-v-vi-iv', 'vi-iv-i-v'],
      ['vi-iv-i-v', 'i-v-vi-iv'],
      [],
    ]);

    const minor: ChordChart = {
      ...chart,
      key: { tonic: 'A', mode: 'minor' },
      sections: [chart.sections[1]!],
      form: ['c'],
    };
    const moved = chartProgressions(minor, { ...DEFAULT_VIEW, transpose: 2 }, PROGRESSIONS);
    expect(moved[0]!.matches[0]!.readIn).toEqual({ tonic: 'D', mode: 'major' });
  });
});
