import { describe, expect, it } from 'vitest';
import { PATTERNS, ARPEGGIO_8THS } from '@/content/patterns';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { applyPattern, compileLesson, validateLesson, type CompiledChord } from './compile';
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
