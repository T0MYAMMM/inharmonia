import { describe, expect, it } from 'vitest';
import { PATTERNS, ARPEGGIO_8THS } from '@/content/patterns';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { MIX } from '@config/mix';
import {
  applyPattern,
  compileLesson,
  soundingSpans,
  validateLesson,
  type CompiledChord,
} from './compile';
import { TIES_LESSON } from './tieFixture';
import { DEFAULT_RULES, LESSON_SCHEMA_VERSION, type Lesson } from './types';
import { explicitVoicing } from '../theory';

const tiny = (patch: Partial<Lesson> = {}): Lesson => ({
  id: 't',
  schemaVersion: LESSON_SCHEMA_VERSION,
  title: 'T',
  kind: 'song',
  source: { kind: 'generic' },
  key: { tonic: 'C', mode: 'major' },
  meter: { beats: 4, unit: 4 },
  tempo: { default: 80, min: 40, max: 120 },
  rules: DEFAULT_RULES,
  bars: [
    {
      chords: [
        { symbol: 'C', beats: 2 },
        { symbol: 'G7', beats: 2 },
      ],
      rh: [
        { note: 'E4', beats: 1 },
        { note: 'r', beats: 1 },
        { note: 'D4', beats: 2 },
      ],
    },
  ],
  ...patch,
});

describe('applyPattern', () => {
  const chord = (beats: number): CompiledChord => ({
    id: 'c',
    symbol: 'D',
    barIndex: 0,
    startBeat: 0,
    beats,
    voicing: explicitVoicing('D2 A2 D3 F#3'),
  });

  it('plays 1-2-3-4-3-2-3-4 in 8ths, each held to the chord change', () => {
    const notes = applyPattern(ARPEGGIO_8THS, chord(4), 'x');
    expect(notes.map((n) => n.note!.name)).toEqual([
      'D2',
      'A2',
      'D3',
      'F#3',
      'D3',
      'A2',
      'D3',
      'F#3',
    ]);
    expect(notes.map((n) => n.startBeat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(notes.map((n) => n.beats)).toEqual([4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5]);
  });

  it('accents the lowest voice', () => {
    const [root, second] = applyPattern(ARPEGGIO_8THS, chord(4), 'x');
    expect(root!.velocity).toBeGreaterThan(second!.velocity);
  });

  it('restarts per chord and stops at a 2-beat chord change', () => {
    const notes = applyPattern(ARPEGGIO_8THS, chord(2), 'x');
    expect(notes.map((n) => n.note!.name)).toEqual(['D2', 'A2', 'D3', 'F#3']);
    expect(notes.at(-1)!.beats).toBe(0.5);
  });
});

describe('compileLesson', () => {
  it('lays out bars, chords and both hands on one timeline', () => {
    const c = compileLesson(tiny({ lhPattern: 'arpeggio-8ths' }), PATTERNS);
    expect(c.lengthBeats).toBe(4);
    expect(c.chords.map((x) => [x.symbol, x.startBeat, x.beats])).toEqual([
      ['C', 0, 2],
      ['G7', 2, 2],
    ]);
    const rh = c.events.filter((e) => e.channel === 'rh');
    expect(rh.map((e) => [e.beat, e.midi])).toEqual([
      [0, 64],
      [2, 62],
    ]); // the rest produces no event
    expect(c.bars[0]!.rh[1]!.note).toBeNull();
    expect(c.events.filter((e) => e.channel === 'lh')).toHaveLength(8);
  });

  it('rejects an unknown pattern', () => {
    expect(() => compileLesson(tiny({ lhPattern: 'nope' }), PATTERNS)).toThrow('nope');
  });
});

describe('validateLesson', () => {
  it('reports wrong bar lengths and bad symbols', () => {
    const bad = tiny();
    bad.bars[0]!.rh = [{ note: 'E4', beats: 3 }];
    bad.bars[0]!.chords[1]!.symbol = 'Gxyz';
    expect(validateLesson(bad)).toEqual([
      'Bar 1: unknown chord "Gxyz"',
      'Bar 1: right hand lasts 3 beats, not 4',
    ]);
  });
});

describe('Senja di Teras', () => {
  it('is valid: 16 bars of 4 beats, chords and melody add up', () => {
    expect(validateLesson(SENJA_DI_TERAS)).toEqual([]);
    expect(SENJA_DI_TERAS.bars).toHaveLength(16);
  });

  it('compiles with the prototype voicings and an 8th-note arpeggio', () => {
    const c = compileLesson(SENJA_DI_TERAS, PATTERNS);
    expect(c.lengthBeats).toBe(64);
    const a = c.chords.find((x) => x.symbol === 'A')!;
    expect(a.voicing.map((n) => n.name)).toEqual(['A1', 'E2', 'A2', 'C#3']);
    const d = c.chords.find((x) => x.symbol === 'D')!;
    expect(d.voicing.map((n) => n.name)).toEqual(['D2', 'A2', 'D3', 'F#3']);
    expect(c.bars[3]!.chords.map((x) => [x.symbol, x.beats])).toEqual([
      ['A7sus4', 2],
      ['A7', 2],
    ]);
    expect(c.bars[0]!.rh.map((n) => n.note!.name)).toEqual(['A4', 'F#4', 'E4', 'F#4', 'A4']);
    expect(c.bars[15]!.rh.at(-1)).toMatchObject({ startBeat: 62, beats: 2 });
    expect(c.chords[0]!.voicing.map((n) => n.name)).toEqual(['D2', 'A2', 'C#3', 'F#3']);
    expect(c.chords.find((x) => x.symbol === 'A/C#')!.voicing.map((n) => n.name)).toEqual([
      'C#2',
      'A2',
      'C#3',
      'E3',
    ]);
  });

  it('uses the prototype playback levels', () => {
    const c = compileLesson(SENJA_DI_TERAS, PATTERNS);
    const rh = c.events.filter((e) => e.channel === 'rh');
    expect(rh[0]).toMatchObject({ velocity: 0.4, dur: 0.95 });
    const lh = c.events.filter((e) => e.channel === 'lh' && e.beat < 4);
    expect(lh.map((e) => e.velocity)).toEqual([0.26, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13]);
    expect(c.bars.filter((b) => b.section).map((b) => [b.index, b.section])).toEqual([
      [0, 'Verse'],
      [8, 'Chorus'],
    ]);
  });
});

describe('ties', () => {
  const legato = MIX.melody.legato;
  const c = compileLesson(TIES_LESSON);
  const rh = c.events.filter((e) => e.channel === 'rh');

  it('links a note tied across the barline and one tied into a chord change', () => {
    expect(c.bars[0]!.rh[2]).toMatchObject({ tiedTo: 'rh-1-0' });
    expect(c.bars[1]!.rh[0]).toMatchObject({ tiedFrom: 'rh-0-2' });
    expect(c.bars[1]!.rh[1]).toMatchObject({ tiedTo: 'rh-1-2' });
    expect(c.bars[1]!.rh[2]).toMatchObject({ tiedFrom: 'rh-1-1' });
    expect(c.bars[1]!.rh[3]!.tiedFrom).toBeUndefined();
  });

  it('plays each tied pair as one held note, released like its last note', () => {
    expect(rh.map((e) => [e.midi, e.beat])).toEqual([
      [60, 0],
      [64, 1],
      [67, 2],
      [69, 5],
      [71, 7],
      [72, 8],
    ]);
    // G4: 2 beats + 1 beat across the barline; A4: 1 + 1 across the change to G.
    expect(rh[2]!.dur).toBeCloseTo(3 - (1 - legato));
    expect(rh[3]!.dur).toBeCloseTo(2 - (1 - legato));
    expect(rh[0]!.dur).toBeCloseTo(legato);
  });

  it('keeps both chips of a tie for the score', () => {
    expect(c.bars[1]!.rh.map((n) => n.note!.name)).toEqual(['G4', 'A4', 'A4', 'B4']);
  });

  it('restrikes a note tied in from outside a slice', () => {
    const g = c.chords.find((ch) => ch.symbol === 'G')!;
    const slice = c.bars[1]!.rh.filter((n) => n.startBeat >= g.startBeat);
    expect(soundingSpans(slice).map((s) => [s.first.note!.name, s.beats])).toEqual([
      ['A4', 1],
      ['B4', 1],
    ]);
    expect(soundingSpans(c.bars[1]!.rh).map((s) => s.beats)).toEqual([1, 2, 1]);
  });

  it('is a valid lesson', () => {
    expect(validateLesson(TIES_LESSON)).toEqual([]);
  });

  it('reports ties to a rest, to another pitch or past the end', () => {
    const lesson = tiny({
      bars: [
        {
          chords: [{ symbol: 'C', beats: 4 }],
          rh: [
            { note: 'E4', beats: 1, tie: true },
            { note: 'r', beats: 1, tie: true },
            { note: 'D4', beats: 1, tie: true },
            { note: 'E4', beats: 1, tie: true },
          ],
        },
      ],
    });
    expect(validateLesson(lesson)).toEqual([
      'Bar 1: right hand tie from "E4" needs the same note next, not "r"',
      'Bar 1: right hand has a tie on a rest',
      'Bar 1: right hand tie from "D4" needs the same note next, not "E4"',
      'Bar 1: right hand tie from "E4" has no note to join',
    ]);
    // Bad ties are ignored when compiling: every note is struck.
    expect(compileLesson(lesson).events).toHaveLength(3);
  });
});
