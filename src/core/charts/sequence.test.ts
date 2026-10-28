import { describe, expect, it } from 'vitest';
import { NO_CHORD } from '../content/types';
import { chartIssues, chartToLesson } from './compile';
import {
  barSplits,
  clearBars,
  cleanSequence,
  copyBar,
  EMPTY_SEQUENCE,
  insertBars,
  isSplit,
  moveBar,
  readChord,
  readChords,
  removeBar,
  removeChord,
  roomLeft,
  setChord,
  setMeter,
  setSplit,
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

describe('reading one typed chord', () => {
  it('normalizes it, lower-case root allowed', () => {
    expect(readChord(' f#m7 ')).toBe('F#m7');
    expect(readChord('C△7')).toBe('Cmaj7');
    expect(readChord('C-7')).toBe('C-7');
    expect(readChord('n.c.')).toBe(NO_CHORD);
    expect(readChord('Hm')).toBeNull();
    expect(readChord('')).toBeNull();
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

describe('editing a sequence', () => {
  const s = seqOf(['C', 'Am', 'F G', 'G7']);
  const bars = (t: string) => readChords(t, 4, 32).bars;

  it('puts bars in anywhere, all or none', () => {
    expect(show(insertBars(s, 4, bars('Dm G')).bars)).toEqual([
      'C:4',
      'Am:4',
      'F:2 G:2',
      'G7:4',
      'Dm:4',
      'G:4',
    ]);
    expect(show(insertBars(s, 1, bars('E7')).bars)).toEqual([
      'C:4',
      'E7:4',
      'Am:4',
      'F:2 G:2',
      'G7:4',
    ]);
    expect(show(insertBars(EMPTY_SEQUENCE, 0, bars('C')).bars)).toEqual(['C:4']);
    const full = seqOf(Array.from({ length: 31 }, () => 'C'));
    expect(roomLeft(full)).toBe(1);
    expect(insertBars(full, 31, bars('F G'))).toBe(full);
    expect(insertBars(full, 31, bars('F')).bars).toHaveLength(32);
    expect(insertBars(s, 5, bars('C'))).toBe(s);
    expect(insertBars(s, -1, bars('C'))).toBe(s);
    expect(insertBars(s, 0, [])).toBe(s);
  });

  it('does not share bars with what was inserted', () => {
    const added = bars('C');
    const next = insertBars(EMPTY_SEQUENCE, 0, added);
    added[0]!.chords[0]!.symbol = 'F';
    expect(show(next.bars)).toEqual(['C:4']);
  });

  it('removes, moves, copies and clears bars', () => {
    expect(show(removeBar(s, 2).bars)).toEqual(['C:4', 'Am:4', 'G7:4']);
    expect(removeBar(s, 4)).toBe(s);
    expect(show(moveBar(s, 0, 3).bars)).toEqual(['Am:4', 'F:2 G:2', 'G7:4', 'C:4']);
    expect(show(moveBar(s, 3, 1).bars)).toEqual(['C:4', 'G7:4', 'Am:4', 'F:2 G:2']);
    expect(moveBar(s, 1, 1)).toBe(s);
    expect(moveBar(s, 1, 4)).toBe(s);
    expect(show(copyBar(s, 2).bars)).toEqual(['C:4', 'Am:4', 'F:2 G:2', 'F:2 G:2', 'G7:4']);
    const copied = copyBar(s, 2);
    expect(copied.bars[3]).not.toBe(copied.bars[2]);
    expect(copyBar(seqOf(Array.from({ length: 32 }, () => 'C')), 0).bars).toHaveLength(32);
    expect(clearBars(s).bars).toEqual([]);
    expect(clearBars(EMPTY_SEQUENCE)).toBe(EMPTY_SEQUENCE);
  });

  it('splits a bar another way, repeating or dropping chords', () => {
    expect(show(setSplit(s, 0, [2, 2]).bars)[0]).toBe('C:2 C:2');
    expect(show(setSplit(s, 2, [3, 1]).bars)[2]).toBe('F:3 G:1');
    expect(show(setSplit(s, 2, [1, 1, 1, 1]).bars)[2]).toBe('F:1 G:1 G:1 G:1');
    expect(show(setSplit(s, 2, [4]).bars)[2]).toBe('F:4');
    expect(setSplit(s, 2, [2, 2])).toBe(s);
    expect(setSplit(s, 2, [2, 1])).toBe(s); // not a 4/4 split
    expect(setSplit(s, 9, [4])).toBe(s);
  });

  it('changes a chord as typed, and only to a chord', () => {
    expect(show(setChord(s, 2, 1, 'G7').bars)[2]).toBe('F:2 G7:2');
    expect(show(setChord(s, 2, 1, ' g7 ').bars)[2]).toBe('F:2 G7:2');
    expect(show(setChord(s, 0, 0, 'C△7').bars)[0]).toBe('Cmaj7:4');
    expect(show(setChord(s, 0, 0, 'nc').bars)[0]).toBe(`${NO_CHORD}:4`);
    expect(setChord(s, 0, 0, 'Hm')).toBe(s);
    expect(setChord(s, 0, 0, 'C')).toBe(s);
    expect(setChord(s, 0, 1, 'D')).toBe(s);
  });

  it('removes a chord, giving its beats to its neighbour', () => {
    const bar = (text: string, beats: 3 | 4 = 4) => ({
      ...EMPTY_SEQUENCE,
      meter: { beats, unit: 4 as const },
      bars: readChords(text, beats, 32).bars,
    });
    expect(show(removeChord(bar('| C . G A |'), 0, 1).bars)).toEqual(['C:3 A:1']);
    expect(show(removeChord(bar('| C . G A |'), 0, 0).bars)).toEqual(['G:3 A:1']);
    expect(show(removeChord(bar('| C G A B |'), 0, 3).bars)).toEqual(['C:1 G:1 A:2']);
    expect(show(removeChord(bar('| C G A B |', 3), 0, 1).bars)).toEqual(['C:1 A:1 B:1']);
    const one = bar('C');
    expect(removeChord(one, 0, 0)).toBe(one);
    expect(removeChord(s, 2, 5)).toBe(s);
  });

  it('every edit leaves every bar a split', () => {
    let x = seqOf(['C', 'Am', 'F G', 'G7']);
    x = setSplit(x, 0, [1, 2, 1]);
    x = removeChord(x, 0, 1);
    x = setMeter(x, 3);
    x = setSplit(x, 3, [1, 1, 0.5, 0.5]);
    x = removeChord(x, 3, 0);
    x = copyBar(x, 3);
    x = setMeter(x, 4);
    for (const b of x.bars)
      expect(
        isSplit(
          b.chords.map((c) => c.beats),
          x.meter.beats,
        ),
      ).toBe(true);
  });

  it('changes the meter, splitting every bar evenly', () => {
    const waltz = setMeter({ ...EMPTY_SEQUENCE, bars: bars('| C . . G | Am F G | D |') }, 3);
    expect(waltz.meter).toEqual({ beats: 3, unit: 4 });
    expect(show(waltz.bars)).toEqual(['C:2 G:1', 'Am:1 F:1 G:1', 'D:3']);
    expect(setMeter(s, 4)).toBe(s);
  });
});
