import { describe, expect, it } from 'vitest';
import { getSong, versionsOf } from '@/content/lessons';
import type { Bar, NoteSpec } from '../content/types';
import {
  indexEntry,
  isRetired,
  parseIndex,
  previewOf,
  stringifyIndex,
  type CatalogueEntry,
} from './catalogue';

const bar = (rh: NoteSpec[] | undefined): Bar => ({
  chords: [{ symbol: 'C', beats: 4 }],
  ...(rh ? { rh } : {}),
});
const n = (note: string, beats: number, tie?: boolean): NoteSpec => ({
  note,
  beats,
  ...(tie ? { tie } : {}),
});
const FOUR = { beats: 4, unit: 4 };

describe('previewOf', () => {
  it('takes the opening bars of the melody, in the shared string format', () => {
    // Two bars of 2/4 are four beats: a third bar makes six.
    const twinkle = getSong('twinkle-twinkle-advanced')!;
    expect(previewOf(twinkle.bars, twinkle.meter)).toEqual({
      meter: { beats: 2, unit: 4 },
      bars: ['C5:1 C5:1', 'G5:1 G5:1', 'A5:1 A5:1'],
    });
  });

  it('takes at least two bars and six quarter notes, and at most four bars', () => {
    const bars = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5'].map((note) => bar([n(note, 1)]));
    const count = (beats: number, unit: number) => previewOf(bars, { beats, unit }).bars.length;
    expect(count(4, 4)).toBe(2);
    expect(count(3, 4)).toBe(2);
    expect(count(6, 8)).toBe(2);
    expect(count(2, 4)).toBe(3);
    expect(count(3, 8)).toBe(4);
    // Four bars of 2/8 are only four quarter notes: four bars is the most.
    expect(count(2, 8)).toBe(4);
    // A song shorter than that gives what it has.
    expect(previewOf(bars.slice(0, 1), { beats: 2, unit: 4 }).bars).toEqual(['C5:1']);
  });

  it('treats a first bar that starts with a rest as a pickup, and adds the bars after it', () => {
    const three = { beats: 3, unit: 4 };
    const bars = [
      bar([n('r', 2), n('G4', 0.5), n('G4', 0.5)]),
      bar([n('Bb4', 1.5), n('G4', 0.5), n('G4', 1)]),
      bar([n('C5', 3)]),
      bar([n('D5', 3)]),
    ];
    expect(previewOf(bars, three)).toEqual({
      meter: { beats: 3, unit: 4 },
      bars: ['r:2 G4:0.5 G4:0.5', 'Bb4:1.5 G4:0.5 G4:1', 'C5:3'],
    });
    // Für Elise starts on its two-note pickup, in 3/8: the pickup, then four
    // bars for six quarter notes, cut at 24 notes and rests.
    const elise = getSong('fur-elise-advanced')!;
    const preview = previewOf(elise.bars, elise.meter);
    expect(preview.meter).toEqual({ beats: 3, unit: 8 });
    expect(preview.bars).toHaveLength(5);
    expect(preview.bars[0]).toMatch(/^r:2 E5:0.5 D#5:0.5$/);
    expect(preview.bars.join(' ').split(' ').length).toBeLessThanOrEqual(24);
  });

  it('skips an introduction that is all rests', () => {
    const bars = [
      bar([n('r', 4)]),
      bar(undefined),
      bar([n('E5', 2), n('D5', 2)]),
      bar([n('C5', 4)]),
      bar([n('G4', 4)]),
    ];
    expect(previewOf(bars, FOUR).bars).toEqual(['E5:2 D5:2', 'C5:4']);
  });

  it('marks a tie, and writes a bar with no melody as a whole-bar rest', () => {
    const bars = [bar([n('E4', 2), n('G4', 2, true)]), bar([n('G4', 1), n('r', 3)])];
    expect(previewOf(bars, FOUR).bars).toEqual(['E4:2 G4:2~', 'G4:1 r:3']);
    expect(previewOf([bar([n('C4', 4)]), bar(undefined)], FOUR).bars).toEqual(['C4:4', 'r:4']);
  });

  it('keeps at most 24 notes and rests, cutting the bar that reaches the cap', () => {
    const sixteenths = Array.from({ length: 16 }, (_, i) => n(i % 2 ? 'D5' : 'C5', 0.25));
    const preview = previewOf([bar(sixteenths), bar(sixteenths), bar(sixteenths)], FOUR);
    expect(preview.bars).toHaveLength(2);
    expect(preview.bars[0]!.split(' ')).toHaveLength(16);
    expect(preview.bars[1]!.split(' ')).toHaveLength(8);
  });

  it('rounds a triplet to four decimals, and has no bars for a song with no melody', () => {
    const third = 1 / 3;
    expect(
      previewOf([bar([n('C5', third), n('D5', third), n('E5', third), n('F5', 3)])], FOUR),
    ).toEqual({ meter: FOUR, bars: ['C5:0.3333 D5:0.3333 E5:0.3333 F5:3'] });
    expect(previewOf([bar(undefined), bar([n('r', 4)])], FOUR)).toEqual({ meter: FOUR, bars: [] });
  });
});

describe('the index', () => {
  const ode = (): CatalogueEntry =>
    indexEntry({
      piece: 'ode-to-joy',
      bytes: 61_000,
      sha256: 'a'.repeat(64),
      // Out of order on purpose: the entry lists them Easy to Advanced.
      songs: [...versionsOf('ode-to-joy')].reverse(),
    });

  it('describes a piece from its songs: the written key, every version, a preview', () => {
    const entry = ode();
    expect(entry).toMatchObject({
      piece: 'ode-to-joy',
      file: 'ode-to-joy.json',
      title: 'Ode to Joy',
      composer: 'Ludwig van Beethoven',
      credit: 'Ludwig van Beethoven, 1826 edition',
      key: { tonic: 'D', mode: 'major' },
      meter: { beats: 4, unit: 4 },
    });
    expect(entry.summary).toMatch(/^Beethoven's tune/);
    expect(entry.levels).toEqual([
      { level: 'easy', id: 'ode-to-joy-easy', bars: 24, key: { tonic: 'C', mode: 'major' } },
      { level: 'medium', id: 'ode-to-joy-medium', bars: 24, key: { tonic: 'D', mode: 'major' } },
      {
        level: 'advanced',
        id: 'ode-to-joy-advanced',
        bars: 24,
        key: { tonic: 'D', mode: 'major' },
      },
    ]);
    expect(entry.preview.bars).toEqual(['F#4:2 G4:1 A4:1', 'A4:1 G4:1 F#4:1 E4:1']);
  });

  it('writes one entry per line and reads back what it wrote', () => {
    const entries = [ode(), { ...ode(), piece: 'other', file: 'other.json' }];
    entries[1]!.levels = entries[1]!.levels.map((l) => ({ ...l, id: `other-${l.level}` }));
    const text = stringifyIndex(entries);
    expect(text.split('\n')).toHaveLength(5);
    expect(text.startsWith('{"format":"inharmonia-library","schema":1,"songs":[\n')).toBe(true);
    expect(JSON.parse(text).songs).toEqual(entries);
    expect(parseIndex(text)).toEqual(entries);
    expect(parseIndex(stringifyIndex([]))).toEqual([]);
  });

  it('leaves out an entry that does not fit, and refuses what is not an index', () => {
    const good = ode();
    const bad: unknown[] = [
      { ...good, piece: 'other' }, // its file and ids name another piece
      { ...good, file: '../ode-to-joy.json' },
      { ...good, sha256: 'not a hash' },
      { ...good, bytes: 600_000 },
      { ...good, levels: [] },
      { ...good, levels: [good.levels[0], good.levels[0]] },
      { ...good, title: '' },
      { ...good, preview: { meter: good.meter, bars: 'C4:4' } },
      'ode-to-joy',
    ];
    const text = JSON.stringify({ format: 'inharmonia-library', schema: 1, songs: [...bad, good] });
    expect(parseIndex(text)).toEqual([good]);
    // A newer schema is read as far as this version can.
    expect(
      parseIndex(JSON.stringify({ format: 'inharmonia-library', schema: 2, songs: [good] })),
    ).toEqual([good]);
    // The same piece twice: the first is kept.
    expect(parseIndex(stringifyIndex([good, { ...good, title: 'Again' }]))).toEqual([good]);
    expect(parseIndex('not json')).toBeNull();
    expect(parseIndex('{"format":"inharmonia","items":[]}')).toBeNull();
    expect(parseIndex('{"format":"inharmonia-library","schema":0,"songs":[]}')).toBeNull();
  });
});

describe('retired pieces', () => {
  it('knows a retired piece by its id and by each version', () => {
    expect(isRetired('senja-di-teras')).toBe(true);
    expect(isRetired('window-light-easy')).toBe(true);
    expect(isRetired('morning-ferry-advanced')).toBe(true);
    expect(isRetired('window-light-hard')).toBe(false);
    expect(isRetired('ode-to-joy-easy')).toBe(false);
  });
});
