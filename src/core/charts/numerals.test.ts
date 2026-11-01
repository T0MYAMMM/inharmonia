import { describe, expect, it } from 'vitest';
import { PROGRESSIONS } from '@/content/progressions';
import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import { parseProgressionText, progressionToText } from '../content/progressionText';
import { chartIssues } from './compile';
import { chordsToProgression, progressionBars, progressionChart } from './numerals';
import { parseBars } from './syntax';
import { NO_CHORD } from './symbols';
import type { ChartBar } from './types';

const C = { tonic: 'C', mode: 'major' } as const;
const bars = (text: string, beats: 3 | 4 = 4) => parseBars(text, beats).bars;
const toText = (
  text: string,
  beats: 3 | 4 = 4,
  key: { tonic: string; mode: 'major' | 'minor' } = C,
) => chordsToProgression(bars(text, beats), beats, key);

describe('chords as a progression for the builder', () => {
  it('writes a bar a word, two even chords as a pair', () => {
    const d = toText('| C | Am | F G | Dm7 | G7 | C |');
    expect(d).toEqual({
      mode: 'major',
      text: 'I vi IV,V ii7 V7 I',
      name: 'I–vi–IV–V–ii7–V7–I',
      notes: [],
    });
  });

  it('writes an uneven 4/4 bar exactly, as four quarters', () => {
    expect(toText('| C . . G | Am . F G | F G . . | C Am F G |').text).toBe(
      'I,I,I,V vi,vi,IV,V IV,V,V,V I,vi,IV,V',
    );
  });

  it('reads a minor key against its own scale, the major V included', () => {
    const d = toText('Am G F E7', 4, { tonic: 'A', mode: 'minor' });
    expect(d.text).toBe('i bVII bVI V7');
    expect(d.name).toBe('i–♭VII–♭VI–V7');
    expect(d.mode).toBe('minor');
  });

  it('writes sharps and flats as the builder types them', () => {
    expect(toText('C Bb Ab F#dim', 4).text).toBe('I bVII bVI #iv°');
  });

  it('turns 3/4 bars into 4/4, chords split evenly, and says so', () => {
    const d = toText('| C | Am F | Dm G C | F G Am C |', 3);
    expect(d.text).toBe('I vi,IV ii,ii,V,I IV,V,vi,I');
    expect(d.notes).toEqual([
      'Progressions are in 4/4: each 3/4 bar is a 4/4 bar here, its chords split evenly.',
    ]);
  });

  it('leaves N.C. out, its beats to the chord before, and says where', () => {
    const d = toText('| C | N.C. | F N.C. | N.C. G | Am | N.C. |');
    expect(d.text).toBe('I IV V vi');
    expect(d.notes).toEqual([
      'N.C. in bars 2, 3, 4 and 6 is left out: a progression has no silent bars.',
    ]);
  });

  it('drops a slash bass, which the progression voices itself', () => {
    expect(toText('C/E | F/C | G7/B | C').text).toBe('I IV V7 I');
  });

  it('writes a chord whose own numeral does not read as its nearest, and says so', () => {
    const d = toText('C | C+maj7 | G7 | C+maj7');
    expect(d.text).toBe('I I+ V7 I+');
    expect(d.notes).toEqual([
      'C+maj7 is written I+ in bars 2 and 4, the nearest numeral it reads.',
    ]);
  });

  it('leaves out a chord it cannot read at all', () => {
    const odd: ChartBar[] = [...bars('C'), { chords: [{ symbol: 'Hx', beats: 4 }] }, ...bars('G')];
    const d = chordsToProgression(odd, 4, C);
    expect(d.text).toBe('I V');
    expect(d.notes).toEqual(['Hx in bar 2 has no numeral the builder reads: left out.']);
  });

  it('gives nothing for nothing but N.C.', () => {
    const d = toText('N.C. N.C.');
    expect(d.text).toBe('');
    expect(d.name).toBe('');
    expect(d.notes).toEqual([
      'N.C. in bars 1 and 2 is left out: a progression has no silent bars.',
    ]);
  });

  it('keeps a long name within the limit', () => {
    const d = toText(Array.from({ length: 32 }, (_, i) => (i % 2 ? 'Dm7' : 'G7')).join(' '));
    expect(d.name.length).toBeLessThanOrEqual(60);
    expect(d.name.endsWith('…')).toBe(true);
  });

  it('always gives text the builder reads without a problem', () => {
    for (const text of [
      '| C . . G | Am |',
      '| Cmaj9 | E7#9 | Am(maj7) | Fm6 | Bbsus2 | Ebaug | Bdim7 | Gm7b5 |',
      'C/G Dm/F G7sus4 C',
    ]) {
      const d = toText(text);
      expect(parseProgressionText(d.text, d.mode).issues, text).toEqual([]);
    }
  });

  it('writes add11, add4 and 7sus2 chords as they are, numerals the builder reads', () => {
    const d = toText('| Ebadd11 | Cmadd11 | Abadd4 | Bb7sus2 |', 4, { tonic: 'Eb', mode: 'major' });
    expect(d.text).toBe('Iadd11 viadd11 IVadd4 V7sus2');
    expect(d.notes).toEqual([]);
    expect(parseProgressionText(d.text, d.mode).issues).toEqual([]);
  });
});

describe('a progression as chords', () => {
  it('puts the steps in bars of four beats, in the key', () => {
    const iiVI = PROGRESSIONS.find((p) => p.id === 'ii-v-i')!;
    expect(progressionBars(iiVI.steps, 'G', 'major')).toEqual([
      { chords: [{ symbol: 'Am7', beats: 4 }] },
      { chords: [{ symbol: 'D7', beats: 4 }] },
      { chords: [{ symbol: 'Gmaj7', beats: 4 }] },
      { chords: [{ symbol: 'Gmaj7', beats: 4 }] },
    ]);
    const turn = PROGRESSIONS.find((p) => p.id === 'ballad-turnaround')!;
    expect(progressionBars(turn.steps, 'C', 'major')[4]).toEqual({
      chords: [
        { symbol: 'G7sus4', beats: 2 },
        { symbol: 'G7', beats: 2 },
      ],
    });
  });

  it('a numeral that does not read is N.C., so the bar still adds up', () => {
    expect(
      progressionBars(
        [
          { numeral: 'I', beats: 2 },
          { numeral: 'Q', beats: 2 },
        ],
        'C',
        'major',
      ),
    ).toEqual([
      {
        chords: [
          { symbol: 'C', beats: 2 },
          { symbol: NO_CHORD, beats: 2 },
        ],
      },
    ]);
  });

  it('every library progression, in every key, makes a valid chart and comes back as written', () => {
    for (const p of PROGRESSIONS)
      for (const tonic of p.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS) {
        const chart = progressionChart(p, tonic);
        expect(chartIssues(chart), `${p.id} in ${tonic}`).toEqual([]);
        expect(chart.title).toBe(p.name);
        const back = chordsToProgression(chart.sections[0]!.bars, 4, chart.key);
        expect(back.text, `${p.id} in ${tonic}`).toBe(progressionToText(p.steps));
        expect(back.notes).toEqual([]);
      }
  });
});
