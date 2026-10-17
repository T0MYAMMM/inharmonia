import { describe, expect, it } from 'vitest';
import SOURCE_DOC from '../../../docs/format/source.md?raw';
import { PATTERNS } from '@/content/patterns';
import { compileLesson, validateLesson } from '../content/compile';
import { parseFile, stringifyFile, buildFile, songItem } from '../format';
import {
  durationBeats,
  easyKeyFor,
  generatePiece,
  mergeToBeats,
  parseFigure,
  parsePiece,
  pieceFile,
} from '.';

// An invented piece, written for these tests: a dotted rhythm, a tie across a
// bar line, a slash chord, extensions, a written-out left hand and a figure.
const INVENTED = `
# comments are ignored
title: Test Tune
piece: test-tune
added: 2026-01-02
source: original
author: Test
key: D major
meter: 4/4
tempo: 100
summary: An invented tune for the tests.
figure: Bass and roll | cycle 2 | 0 1 root! | 1 .5 0 | 1.5 .5 1
easy-keep: 3

[A] main 1-4
melody:
  | F#4q. E4e D4q E4q | F#4q A4q A4h~ |
  | A4e G4e F#4e E4e D4h | E4w |
chords: | D | A/C# Bm7 | Gmaj9 | A7sus4 |

[B] 5-6
melody: | D5h C#5q B4q | A4w |
chords: | G | D |
left: | G2h D3h | D2w |
`;

const PD = `title: Old Tune
piece: old-tune
added: 2026-01-02
source: public-domain
composer: Invented Composer
composer-died: 1850
first-published: 1840
edition: An invented first edition, 1840
editor: Invented Editor
editor-died: 1880
contributor: arranger; Invented Arranger; 1890
key: A minor
meter: 3/4
tempo: 90
figure: waltz
[Theme] main
melody: | A4h. |
chords: | Am |
`;

describe('the source format', () => {
  it('reads lengths in beats of the meter', () => {
    expect(durationBeats('q', 4)).toBe(1);
    expect(durationBeats('h.', 4)).toBe(3);
    expect(durationBeats('e.', 4)).toBe(0.75);
    expect(durationBeats('s', 4)).toBe(0.25);
    expect(durationBeats('e3', 4)).toBeCloseTo(1 / 3);
    expect(durationBeats('q..', 4)).toBe(1.75);
    expect(durationBeats('x', 4)).toBeNull();
  });

  it('reads a piece: header, sections, notes, chords, left hand and figure', () => {
    const p = parsePiece(INVENTED);
    expect(p.meta).toMatchObject({
      title: 'Test Tune',
      piece: 'test-tune',
      key: { tonic: 'D', mode: 'major' },
      meter: { beats: 4, unit: 4 },
      tempo: 100,
      easyKeep: [3],
      source: { kind: 'original', author: 'Test' },
    });
    expect(p.sections.map((s) => [s.label, s.main, s.original, s.bars.length])).toEqual([
      ['A', true, '1-4', 4],
      ['B', false, '5-6', 2],
    ]);
    const [a] = p.sections;
    expect(a!.bars[0]!.melody).toEqual([
      { note: 'F#4', beats: 1.5 },
      { note: 'E4', beats: 0.5 },
      { note: 'D4', beats: 1 },
      { note: 'E4', beats: 1 },
    ]);
    expect(a!.bars[1]!.melody.at(-1)).toEqual({ note: 'A4', beats: 2, tie: true });
    expect(a!.bars[1]!.chords).toEqual([
      { symbol: 'A/C#', beats: 2 },
      { symbol: 'Bm7', beats: 2 },
    ]);
    expect(p.sections[1]!.bars[0]!.left).toEqual([
      { note: 'G2', beats: 2 },
      { note: 'D3', beats: 2 },
    ]);
    expect(p.meta.figure).toEqual({
      id: 'figure',
      name: 'Bass and roll',
      cycleBeats: 2,
      steps: [
        { at: 0, dur: 1, voices: ['root'], accent: true },
        { at: 1, dur: 0.5, voices: [0] },
        { at: 1.5, dur: 0.5, voices: [1] },
      ],
    });
  });

  it('reads the public-domain proof', () => {
    expect(parsePiece(PD).meta.source).toEqual({
      kind: 'public-domain',
      composer: 'Invented Composer',
      composerDied: 1850,
      firstPublished: 1840,
      edition: 'An invented first edition, 1840',
      editor: { name: 'Invented Editor', died: 1880, additionsUsed: false },
      contributors: [{ role: 'arranger', name: 'Invented Arranger', died: 1890 }],
    });
    expect(() => parsePiece(PD.replace('editor-died: 1880\n', ''))).toThrow(/needs "editor-died:"/);
    expect(
      parsePiece(PD.replace('editor-died: 1880', 'editor-died: unknown\neditor-additions: used'))
        .meta.source,
    ).toMatchObject({
      editor: { name: 'Invented Editor', died: null, additionsUsed: true },
    });
  });

  it('names the line of the first problem', () => {
    const bad = (from: string, to: string) => () => parsePiece(INVENTED.replace(from, to));
    expect(bad('| E4w |', '| E4h |')).toThrow(/Line 16: \[A\] bar 4: melody lasts 2 beats, not 4/);
    expect(bad('Gmaj9', 'Hx9')).toThrow(/Line 19: "Hx9" is not a chord/);
    expect(bad('D5h C#5q', 'D5h Q5q')).toThrow(/Line 22: "Q5q" is not a note/);
    expect(bad('| D | A/C# Bm7 |', '| D |')).toThrow(/4 melody bars but 3 chord bars/);
    expect(bad('[A] main 1-4', '[A] 1-4')).toThrow(/mark the main theme/);
    expect(bad('meter: 4/4', 'meter: 6/8')).toThrow(/Line 9: meter must be 2\/4, 3\/4 or 4\/4/);
    expect(bad('[A] main 1-4', '[A] mainly')).toThrow(/unknown section flag "mainly"/);
    expect(() => parsePiece(PD.replace('composer-died: 1850\n', ''))).toThrow(
      /needs "composer-died:"/,
    );
    expect(() => parseFigure('Nothing | 2 | 0 1 root', 1)).toThrow(/a figure is/);
  });
});

describe('the documented example', () => {
  it('parses and builds as docs/format/source.md says', () => {
    const block = /## An example\s+```\n([\s\S]*?)```/.exec(SOURCE_DOC)?.[1];
    expect(block).toBeTruthy();
    const { versions } = generatePiece(parsePiece(block!));
    expect(versions.advanced.bars.length).toBe(6);
  });
});

describe('Easy rhythm', () => {
  const n = (note: string, beats: number, tie = false) => ({
    note,
    beats,
    ...(tie ? { tie: true } : {}),
  });

  it('keeps the note sounding on each beat', () => {
    expect(mergeToBeats([n('F#4', 1.5), n('E4', 0.5), n('D4', 1), n('E4', 1)], 4)).toEqual([
      n('F#4', 2),
      n('D4', 1),
      n('E4', 1),
    ]);
    expect(
      mergeToBeats([n('A4', 0.5), n('G4', 0.5), n('F#4', 0.5), n('E4', 0.5), n('D4', 2)], 4),
    ).toEqual([n('A4', 1), n('F#4', 1), n('D4', 2)]);
  });

  it('keeps rests and ties into the next bar', () => {
    expect(mergeToBeats([n('r', 1), n('C5', 0.5), n('D5', 0.5), n('E5', 2, true)], 4)).toEqual([
      n('r', 1),
      n('C5', 1),
      n('E5', 2, true),
    ]);
    expect(mergeToBeats([n('C5', 1, true), n('C5', 0.5), n('B4', 0.5), n('A4', 1)], 3)).toEqual([
      n('C5', 2),
      n('A4', 1),
    ]);
  });
});

describe('Easy, Medium and Advanced', () => {
  const src = parsePiece(INVENTED);
  const { versions, easyShift, easyChanges } = generatePiece(src);
  const { easy, medium, advanced } = versions;

  it('moves Easy to the nearest easy key, or the one the source asks for', () => {
    expect(easyKeyFor(src)).toEqual({ tonic: 'C', shift: -2 });
    expect(easyKeyFor(parsePiece(INVENTED.replace('key: D major', 'key: E major')))).toEqual({
      tonic: 'F',
      shift: 1,
    });
    expect(easyKeyFor(parsePiece(INVENTED.replace('key: D major', 'key: B minor')))).toEqual({
      tonic: 'A',
      shift: -2,
    });
    expect(easyKeyFor(parsePiece(INVENTED.replace('figure:', 'easy-key: G\nfigure:')))).toEqual({
      tonic: 'G',
      shift: 5,
    });
    expect(easyShift).toBe(-2);
  });

  it('Easy: main theme, easy key, merged beats except kept bars, triads, held bass', () => {
    expect(easy).toMatchObject({
      id: 'test-tune-easy',
      level: 'easy',
      piece: 'test-tune',
      key: { tonic: 'C', mode: 'major' },
      lhPattern: 'bass-held',
      covers: 'bars 1–4',
      tempo: { default: 80 },
    });
    expect(easy.bars).toHaveLength(4);
    // Moved down a tone; it already sits from C4 up, so no octave move.
    expect(easy.bars[0]!.rh).toEqual([
      { note: 'E4', beats: 2 },
      { note: 'C4', beats: 1 },
      { note: 'D4', beats: 1 },
    ]);
    // Bar 3 is marked easy-keep: every note stays.
    expect(easy.bars[2]!.rh!.map((x) => x.note)).toEqual(['G4', 'F4', 'E4', 'D4', 'C4']);
    expect(easy.bars[1]!.chords).toEqual([
      { symbol: 'G', beats: 2, original: 'G/B' },
      { symbol: 'Am', beats: 2, original: 'Am7' },
    ]);
    expect(easy.bars[3]!.chords[0]).toEqual({ symbol: 'G', beats: 4, original: 'G7sus4' });
    expect(easyChanges).toEqual([
      { bar: 1, section: 'A', before: 'F#4:1.5 E4:0.5 D4:1 E4:1', after: 'E4:2 C4:1 D4:1' },
    ]);
  });

  it('moves an Easy melody that sits low up an octave', () => {
    const low = parsePiece(
      INVENTED.replace('key: D major', 'key: C major')
        .replace('| F#4q. E4e D4q E4q | F#4q A4q A4h~ |', '| A3q. G3e E3q G3q | A3q C4q C4h~ |')
        .replace('| A4e G4e F#4e E4e D4h | E4w |', '| C4e B3e A3e G3e E3h | G3w |'),
    );
    const easyLow = generatePiece(low).versions.easy;
    expect(easyLow.key.tonic).toBe('C');
    expect(easyLow.bars[0]!.rh!.map((x) => x.note)).toEqual(['A4', 'E4', 'G4']);
  });

  it('Medium: main theme as written, sevenths, slash bass in the left hand', () => {
    expect(medium).toMatchObject({
      key: { tonic: 'D' },
      lhPattern: 'root-fifth',
      covers: 'bars 1–4',
    });
    expect(medium.bars[0]!.rh).toEqual(src.sections[0]!.bars[0]!.melody);
    expect(medium.bars[1]!.chords[0]).toEqual({
      symbol: 'A',
      beats: 2,
      bass: 'C#',
      original: 'A/C#',
    });
    expect(medium.bars[2]!.chords[0]).toEqual({ symbol: 'Gmaj7', beats: 4, original: 'Gmaj9' });
    expect(medium.bars[3]!.chords[0]).toEqual({ symbol: 'A7', beats: 4, original: 'A7sus4' });
  });

  it('Advanced: every section, original chords, the figure and the written left hand', () => {
    expect(advanced.bars).toHaveLength(6);
    expect(advanced.covers).toBe('bars 1–6');
    expect(advanced.lhFigure?.name).toBe('Bass and roll');
    expect(advanced.bars[1]!.chords[0]).toEqual({ symbol: 'A/C#', beats: 2 });
    expect(advanced.bars[4]!.lh).toEqual([
      { note: 'G2', beats: 2 },
      { note: 'D3', beats: 2 },
    ]);
    expect(advanced.bars.map((b) => b.section ?? '')).toEqual(['A', '', '', '', 'B', '']);
  });

  it('every version validates, compiles and survives the file format', () => {
    for (const l of [easy, medium, advanced]) {
      expect(validateLesson(l)).toEqual([]);
      expect(compileLesson(l, PATTERNS).events.length).toBeGreaterThan(0);
    }
    const text = pieceFile(src);
    const parsed = parseFile(text, {
      patterns: new Set(Object.keys(PATTERNS)),
      fallbackPattern: 'held',
    });
    if ('fatal' in parsed) throw new Error(parsed.fatal);
    expect(parsed.errors).toEqual([]);
    const again = parsed.items.map((i) =>
      songItem({
        id: i.id,
        source: i.source,
        lesson: i.value.kind === 'song' ? i.value.lesson : easy,
        voicings: false,
      }),
    );
    expect(stringifyFile(buildFile(again, [], new Date('2026-01-02T00:00:00.000Z')))).toBe(text);
  });
});
