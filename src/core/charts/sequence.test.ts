import { describe, expect, it } from 'vitest';
import { NO_CHORD } from '../content/types';
import { chartIssues, chartToLesson } from './compile';
import {
  barSplits,
  cleanSequence,
  EMPTY_SEQUENCE,
  isSplit,
  readChords,
  sequenceChart,
  sequenceKey,
  sequenceNumerals,
  sequenceView,
  type ChordSequence,
} from './sequence';
import { barOf, LIMITS, type ChartBar } from './types';

/** Bars as "C:4", "F:2 G:2". */
const show = (bars: readonly ChartBar[]) =>
  bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' '));

const seqOf = (symbols: string[], patch: Partial<ChordSequence> = {}): ChordSequence => ({
  ...EMPTY_SEQUENCE,
  bars: symbols.map((s) => barOf(s.split(' '), 4)),
  ...patch,
});

describe('reading typed chords', () => {
  const read = (text: string, beats: 3 | 4 = 4, room = 32) => readChords(text, beats, room);

  it('reads a line of chords as a bar each', () => {
    const { bars, issues } = read('C Am F G');
    expect(issues).toEqual([]);
    expect(show(bars)).toEqual(['C:4', 'Am:4', 'F:4', 'G:4']);
  });

  it('reads a whole line in chart syntax, splits and dots included', () => {
    expect(show(read('| C | Am | F G |').bars)).toEqual(['C:4', 'Am:4', 'F:2 G:2']);
    expect(show(read('| C . . G | Am |').bars)).toEqual(['C:3 G:1', 'Am:4']);
    expect(show(read('| Am F G |', 3).bars)).toEqual(['Am:1 F:1 G:1']);
  });

  it('writes out repeats and repeated bars', () => {
    expect(show(read('C G x2').bars)).toEqual(['C:4', 'G:4', 'C:4', 'G:4']);
    expect(show(read('| F | % |').bars)).toEqual(['F:4', 'F:4']);
  });

  it('takes N.C. however it is written', () => {
    expect(show(read('C n.c. G').bars)).toEqual(['C:4', `${NO_CHORD}:4`, 'G:4']);
  });

  it('takes lower-case roots', () => {
    const { bars, issues } = read('am f c g bb7 f#m7b5 c... g');
    expect(issues).toEqual([]);
    expect(show(bars)).toEqual(['Am:4', 'F:4', 'C:4', 'G:4', 'Bb7:4', 'F#m7b5:4', 'C:4', 'G:4']);
    expect(show(read('| c . . g |').bars)).toEqual(['C:3 G:1']);
  });

  it('takes commas and spaced dashes between chords', () => {
    expect(show(read('C, Am, F, G').bars)).toEqual(['C:4', 'Am:4', 'F:4', 'G:4']);
    expect(show(read('C - Am – F → G').bars)).toEqual(['C:4', 'Am:4', 'F:4', 'G:4']);
    expect(show(read('C,G').bars)).toEqual(['C:4', 'G:4']);
  });

  it('keeps a dash inside a chord: C-7 is C minor seven', () => {
    const { bars, issues } = read('C-7 - F7');
    expect(issues).toEqual([]);
    expect(show(bars)).toEqual(['C-7:4', 'F7:4']);
  });

  it('reports chords it cannot read, by bar and as typed', () => {
    const { issues } = read('C Hm F');
    expect(issues).toEqual([{ bar: 2, token: 'Hm', message: '"Hm" is not a chord' }]);
    // A lower-case word that is no chord stays as typed in the message.
    expect(read('C dim F').issues).toEqual([
      { bar: 2, token: 'dim', message: '"dim" is not a chord' },
    ]);
    // Dashes between chords only separate when spaced.
    expect(read('C-G').issues.map((i) => i.message)).toEqual(['"C-G" is not a chord']);
  });

  it('reports bars that hold too many chords or last too long', () => {
    expect(read('| C D E F G |').issues.map((i) => i.message)).toEqual([
      `A bar holds up to ${LIMITS.chordsPerBar} chords`,
    ]);
    expect(read('| C . . . . G |').issues.map((i) => i.message)).toEqual([
      'This bar lasts 6 beats, not 4',
    ]);
    expect(read('C . . G').issues.map((i) => i.token)).toEqual(['.', '.']);
  });

  it('reports more bars than there is room for', () => {
    expect(read('C G Am F', 4, 2).issues).toEqual([
      { message: 'That is 4 bars; there is room for 2 more (a sequence holds up to 32)' },
    ]);
    expect(read('C', 4, 0).issues).toEqual([
      { message: 'The sequence is full: it holds up to 32 bars' },
    ]);
    expect(read(Array.from({ length: 33 }, () => 'C').join(' ')).issues).toHaveLength(1);
  });

  it('reads nothing from blank text, separators or empty bar lines', () => {
    for (const text of ['', '   ', ' , ', ' - ', '| |'])
      expect(read(text), JSON.stringify(text)).toEqual({ bars: [], issues: [] });
  });
});

describe('bar splits', () => {
  it('lists every split of 4/4 and 3/4, even ones first', () => {
    expect(barSplits(4).map((s) => s.join('+'))).toEqual([
      '4',
      '2+2',
      '3+1',
      '1+3',
      '2+1+1',
      '1+2+1',
      '1+1+2',
      '1+1+1+1',
    ]);
    expect(barSplits(3).map((s) => s.join('+'))).toEqual([
      '3',
      '2+1',
      '1+2',
      '1+1+1',
      '1+1+0.5+0.5',
    ]);
  });

  it('every split is one a chart accepts', () => {
    for (const beats of [3, 4] as const)
      for (const split of barSplits(beats)) {
        const chart = sequenceChart({
          ...EMPTY_SEQUENCE,
          meter: { beats, unit: 4 },
          bars: [{ chords: split.map((b) => ({ symbol: 'C', beats: b })) }],
        });
        expect(chartIssues(chart), `${beats}: ${split.join('+')}`).toEqual([]);
      }
  });

  it('knows a split when it sees one', () => {
    expect(isSplit([3, 1], 4)).toBe(true);
    expect(isSplit([2, 2], 3)).toBe(false);
    expect(isSplit([1.5, 1.5], 3)).toBe(false);
    expect(isSplit([1, 1, 0.5, 0.5], 3)).toBe(true);
  });
});

describe('key and numerals', () => {
  const bars = (text: string) => readChords(text, 4, 32).bars;

  it('finds the key the chords suggest', () => {
    expect(sequenceKey(bars('C Am F G'))).toEqual({ tonic: 'C', mode: 'major' });
    expect(sequenceKey(bars('Am F C G'))).toEqual({ tonic: 'A', mode: 'minor' });
    expect(sequenceKey([])).toBeNull();
    expect(sequenceKey(bars('N.C. N.C.'))).toBeNull();
  });

  it('names each chord in the key, and nothing for N.C.', () => {
    expect(
      sequenceNumerals(bars('| C | Am | F G | G7 | N.C. |'), { tonic: 'C', mode: 'major' }),
    ).toEqual([['I'], ['vi'], ['IV', 'V'], ['V7'], [null]]);
    expect(sequenceNumerals(bars('Am G F E'), { tonic: 'A', mode: 'minor' })).toEqual([
      ['i'],
      ['♭VII'],
      ['♭VI'],
      ['V'],
    ]);
  });
});

describe('a sequence as a chart', () => {
  it('is one section, played once, in the suggested key, with the tempo and meter', () => {
    const seq = seqOf(['Am', 'F', 'C', 'G E7'], { tempo: 96 });
    const chart = sequenceChart(seq, 'Evening');
    expect(chartIssues(chart)).toEqual([]);
    expect(chart).toMatchObject({
      title: 'Evening',
      key: { tonic: 'A', mode: 'minor' },
      tempo: 96,
      meter: { beats: 4, unit: 4 },
      form: ['sequence'],
      notes: '',
    });
    expect(chart.sections).toHaveLength(1);
    expect(chart.sections[0]).toMatchObject({ id: 'sequence', type: 'custom', repeat: 1 });
    expect(show(chart.sections[0]!.bars)).toEqual(['Am:4', 'F:4', 'C:4', 'G:2 E7:2']);
  });

  it('plays a lesson bar for each bar, in its style', () => {
    const seq = seqOf(['C', 'Am', 'F G'], { style: 'arpeggio-8ths', showFunction: true });
    expect(sequenceView(seq)).toEqual({
      transpose: 0,
      simplify: 'original',
      style: 'arpeggio-8ths',
      showFunction: true,
    });
    const lesson = chartToLesson('seq', sequenceChart(seq), sequenceView(seq));
    expect(lesson.bars.map((b) => b.chords.map((c) => c.symbol).join(' '))).toEqual([
      'C',
      'Am',
      'F G',
    ]);
    expect(lesson.lhPattern).toBe('arpeggio-8ths');
  });

  it('falls back to C major when there is nothing to suggest a key', () => {
    expect(sequenceChart(seqOf([NO_CHORD])).key).toEqual({ tonic: 'C', mode: 'major' });
  });
});

describe('a stored sequence', () => {
  it('keeps a good one as it is', () => {
    const seq = seqOf(['C', 'Am', 'F G'], { tempo: 100, style: 'held', loop: false });
    expect(cleanSequence(structuredClone(seq))).toEqual(seq);
    const waltz: ChordSequence = {
      ...EMPTY_SEQUENCE,
      meter: { beats: 3, unit: 4 },
      bars: [barOf(['C', 'G', 'Am', 'F'], 3)],
    };
    expect(cleanSequence(structuredClone(waltz))).toEqual(waltz);
  });

  it('is nothing without bars', () => {
    for (const raw of [null, 'C Am', 4, {}, { bars: 'C' }]) expect(cleanSequence(raw)).toBeNull();
  });

  it('drops bars that would not play and fills in settings', () => {
    const clean = cleanSequence({
      meter: { beats: 7 },
      bars: [
        { chords: [{ symbol: 'C', beats: 4 }] },
        { chords: [{ symbol: 'Hx', beats: 4 }] },
        { chords: [{ symbol: 'F', beats: 3 }] },
        { chords: [] },
        { chords: Array.from({ length: 5 }, () => ({ symbol: 'C', beats: 1 })) },
        'G',
        {
          chords: [
            { symbol: NO_CHORD, beats: 2, extra: true },
            { symbol: 'G', beats: 2 },
          ],
        },
      ],
      tempo: 999,
      style: 'polka',
      loop: 'yes',
      showFunction: 1,
    });
    expect(clean).toEqual({
      ...EMPTY_SEQUENCE,
      bars: [
        { chords: [{ symbol: 'C', beats: 4 }] },
        {
          chords: [
            { symbol: NO_CHORD, beats: 2 },
            { symbol: 'G', beats: 2 },
          ],
        },
      ],
      tempo: 200,
    });
    expect(cleanSequence({ bars: [], tempo: 12.4 })!.tempo).toBe(40);
  });

  it('keeps no more bars than a sequence holds', () => {
    const bars = Array.from({ length: 40 }, () => ({ chords: [{ symbol: 'C', beats: 4 }] }));
    expect(cleanSequence({ bars })!.bars).toHaveLength(LIMITS.barsPerSection);
  });
});
