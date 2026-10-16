import { describe, expect, it } from 'vitest';
import { getFill } from '@/content/fills';
import { realizeFill } from '../content/fills';
import { FillRepScorer, FillWaitSession, SpeedLadder } from './fillPractice';

const ctx = { key: 'C', mode: 'major' as const, from: 'G7', to: 'C' };
const stepUp = realizeFill(getFill('step-up')!, ctx); // A3 B3 C4 at beats 2, 3, 4
const sixths = realizeFill(getFill('rising-sixths')!, ctx); // A3+F4, B3+G4, ...

describe('FillWaitSession', () => {
  it('waits for each note, in any octave, and loops after the last', () => {
    const s = new FillWaitSession(stepUp);
    expect(s.press(57 + 12).kind).toBe('hit'); // A4 counts for A3
    expect(s.press(60)).toMatchObject({ kind: 'miss' });
    expect(s.press(59)).toMatchObject({ kind: 'hit', index: 1 });
    const last = s.press(60);
    expect(last).toMatchObject({ kind: 'hit', finished: { hits: 3, misses: 1 } });
    expect(s.index).toBe(0);
  });

  it('can insist on the written octave', () => {
    const s = new FillWaitSession(stepUp, 'exact');
    expect(s.press(69).kind).toBe('miss');
    expect(s.press(57).kind).toBe('hit');
  });

  it('needs both notes of a double stop, together or one after the other', () => {
    const s = new FillWaitSession(sixths);
    expect(s.press(57).kind).toBe('progress');
    expect(s.press(65).kind).toBe('hit');
    // Notes from the last hit don't count: B3 then G4 make the next one.
    expect(s.press(59).kind).toBe('progress');
    expect(s.press(67).kind).toBe('hit');
    expect(s.press(48).kind).toBe('progress'); // C, half of C4+A4
    expect(s.press(62)).toMatchObject({ kind: 'miss' });
    expect(s.press(69).kind).toBe('hit');
  });
});

describe('FillRepScorer', () => {
  it('scores a clean repetition within the window', () => {
    const r = new FillRepScorer(stepUp, { windowMs: 150 });
    // At 60 bpm the window is 0.15 beats.
    expect(r.noteOn(57, 2.1, 60)).toBe(true);
    expect(r.noteOn(59, 2.9, 60)).toBe(true);
    expect(r.noteOn(60, 4, 60)).toBe(true);
    expect(r.result()).toEqual({ clean: true, notes: 3, onTime: 3, missed: 0, wrong: 0 });
  });

  it('counts late, extra and missing notes', () => {
    const r = new FillRepScorer(stepUp, { windowMs: 150 });
    expect(r.noteOn(57, 2.3, 60)).toBe(false); // too late
    expect(r.noteOn(62, 3, 60)).toBe(false); // not in the fill
    expect(r.noteOn(59, 3, 60)).toBe(true);
    expect(r.result()).toEqual({ clean: false, notes: 3, onTime: 1, missed: 2, wrong: 2 });
  });

  it('widens the window in beats as the tempo rises', () => {
    const r = new FillRepScorer(stepUp, { windowMs: 150 });
    expect(r.windowBeats(120)).toBeCloseTo(0.3);
    expect(r.noteOn(57, 2.25, 120)).toBe(true);
  });

  it('matches the nearest of repeated pitches', () => {
    const turn = realizeFill(getFill('pentatonic-turn')!, ctx); // E D C A C G C
    const r = new FillRepScorer(turn, { windowMs: 150 });
    const notes = turn.flatMap((h) => h.notes.map((n) => [n.midi, h.beat] as const));
    for (const [midi, beat] of notes) expect(r.noteOn(midi, beat, 80)).toBe(true);
    expect(r.result().clean).toBe(true);
  });
});

describe('SpeedLadder', () => {
  it('speeds up after N clean reps in a row and stops at the goal', () => {
    const l = new SpeedLadder({ start: 60, goal: 68, step: 5, needed: 2 });
    expect(l.rep(true)).toBe('clean');
    expect(l.rep(false)).toBe('reset');
    expect(l.rep(true)).toBe('clean');
    expect(l.rep(true)).toBe('up');
    expect(l.tempo).toBe(65);
    expect(l.best).toBe(60);
    l.rep(true);
    expect(l.rep(true)).toBe('up');
    expect(l.tempo).toBe(68);
    l.rep(true);
    expect(l.rep(true)).toBe('goal');
    expect(l.tempo).toBe(68);
    expect(l.best).toBe(68);
    expect({ reps: l.reps, clean: l.clean }).toEqual({ reps: 8, clean: 7 });
  });
});
