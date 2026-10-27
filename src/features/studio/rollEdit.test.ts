import { describe, expect, it } from 'vitest';
import type { MidiNote } from '@/core/midi/smf';
import {
  beatLabel,
  cellStart,
  formatClock,
  KeyRecorder,
  moveNotes,
  notesInBox,
  resizeNotes,
  snapBeat,
} from './rollEdit';

const n = (id: string, midi: number, startBeat: number, beats = 1): MidiNote => ({
  id,
  midi,
  startBeat,
  beats,
  velocity: 90,
});
const notes = [n('a', 60, 0), n('b', 64, 1), n('c', 67, 2, 2), n('d', 72, 6)];

describe('box selection', () => {
  it('takes every note the box touches, whichever way it was dragged', () => {
    expect(notesInBox(notes, { fromBeat: 0.5, toBeat: 2.5, lowMidi: 60, highMidi: 67 })).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(notesInBox(notes, { fromBeat: 3.5, toBeat: 0.5, lowMidi: 67, highMidi: 63 })).toEqual([
      'b',
      'c',
    ]);
    expect(notesInBox(notes, { fromBeat: 4.5, toBeat: 5.5, lowMidi: 0, highMidi: 127 })).toEqual(
      [],
    );
  });
});

describe('moving and resizing a group', () => {
  const ids = new Set(['a', 'b']);

  it('moves the selected notes together and leaves the rest', () => {
    const moved = moveNotes(notes, ids, 1.5, 2);
    expect(moved.map((x) => [x.id, x.startBeat, x.midi])).toEqual([
      ['a', 1.5, 62],
      ['b', 2.5, 66],
      ['c', 2, 67],
      ['d', 6, 72],
    ]);
  });

  it('stops the whole group at beat 0 and the MIDI range, keeping its shape', () => {
    const early = moveNotes(notes, ids, -3, 0);
    expect(early.filter((x) => ids.has(x.id)).map((x) => x.startBeat)).toEqual([0, 1]);
    const high = moveNotes(notes, new Set(['c', 'd']), 0, 100);
    expect(high.filter((x) => x.id === 'c' || x.id === 'd').map((x) => x.midi)).toEqual([122, 127]);
  });

  it('resizes the group by the same amount, no shorter than the minimum', () => {
    const r = resizeNotes(notes, new Set(['a', 'c']), -1.5, 0.25);
    expect(r.map((x) => x.beats)).toEqual([0.25, 1, 0.5, 1]);
  });
});

describe('grid and labels', () => {
  it('snaps to the grid and finds the cell under the pointer', () => {
    expect(snapBeat(1.13, 0.25)).toBe(1.25);
    expect(snapBeat(1.13, 0)).toBe(1.13);
    expect(snapBeat(-0.4, 0.5)).toBe(0);
    expect(cellStart(1.24, 0.25)).toBe(1);
    expect(cellStart(1.25, 0.25)).toBe(1.25);
  });

  it('names a position by bar and beat, and a time as m:ss', () => {
    expect(beatLabel(0, 4)).toBe('bar 1, beat 1');
    expect(beatLabel(5.5, 4)).toBe('bar 2, beat 2.5');
    expect(beatLabel(3, 3)).toBe('bar 2, beat 1');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75.9)).toBe('1:15');
  });
});

describe('recording from the keyboard', () => {
  it('step input: each note at the cursor, notes pressed together as a chord', () => {
    const r = new KeyRecorder();
    const one = r.step(60, 0.8, 1000, 2, 0.5);
    expect(one.note).toEqual({ midi: 60, startBeat: 2, beats: 0.5, velocity: 102 });
    expect(one.cursor).toBe(2.5);
    const chord = r.step(64, 0.8, 1040, one.cursor, 0.5);
    expect(chord.note.startBeat).toBe(2);
    expect(chord.cursor).toBe(2.5);
    const nextNote = r.step(67, 0.8, 1300, chord.cursor, 0.5);
    expect(nextNote.note.startBeat).toBe(2.5);
    expect(nextNote.cursor).toBe(3);
  });

  it('live recording: from press to release, snapped to the grid', () => {
    const r = new KeyRecorder();
    r.press(60, 0.5, 1.1);
    r.press(64, 0.5, 1.9);
    expect(r.held().map((h) => h.midi)).toEqual([60, 64]);
    expect(r.release(60, 2.05, 0.25)).toEqual({
      midi: 60,
      startBeat: 1,
      beats: 1,
      velocity: 64,
    });
    expect(r.release(60, 3, 0.25)).toBeNull();
    // A tap shorter than the grid still lasts one step.
    r.press(67, 1, 3.01);
    expect(r.release(67, 3.02, 0.25)!.beats).toBe(0.25);
    expect(r.releaseAll(4, 0.25)).toEqual([{ midi: 64, startBeat: 2, beats: 2, velocity: 64 }]);
    expect(r.held()).toEqual([]);
  });
});
