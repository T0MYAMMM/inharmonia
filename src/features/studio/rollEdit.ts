import type { MidiNote } from '@/core/midi/smf';

/** A box on the roll, in beats and MIDI pitches, inclusive of both pitch rows. */
export interface RollBox {
  fromBeat: number;
  toBeat: number;
  lowMidi: number;
  highMidi: number;
}

const EPS = 1e-9;

/** Notes the box touches: any overlap in time on a pitch row inside it. */
export function notesInBox(notes: readonly MidiNote[], box: RollBox): string[] {
  const from = Math.min(box.fromBeat, box.toBeat);
  const to = Math.max(box.fromBeat, box.toBeat);
  const low = Math.min(box.lowMidi, box.highMidi);
  const high = Math.max(box.lowMidi, box.highMidi);
  return notes
    .filter(
      (n) =>
        n.midi >= low &&
        n.midi <= high &&
        n.startBeat < to + EPS &&
        n.startBeat + n.beats > from - EPS,
    )
    .map((n) => n.id);
}

/**
 * Move a group of notes by the same amount. The whole group stops at beat 0
 * and at the MIDI range edges, so the notes keep their shape.
 */
export function moveNotes(
  notes: readonly MidiNote[],
  ids: ReadonlySet<string>,
  dBeat: number,
  dMidi: number,
): MidiNote[] {
  const group = notes.filter((n) => ids.has(n.id));
  if (!group.length) return [...notes];
  const earliest = Math.min(...group.map((n) => n.startBeat));
  const lowest = Math.min(...group.map((n) => n.midi));
  const highest = Math.max(...group.map((n) => n.midi));
  const db = Math.max(-earliest, dBeat);
  const dm = Math.max(-lowest, Math.min(127 - highest, Math.round(dMidi)));
  return notes.map((n) =>
    ids.has(n.id) ? { ...n, startBeat: round(n.startBeat + db), midi: n.midi + dm } : n,
  );
}

/** Lengthen or shorten a group of notes by the same amount, none shorter than `min`. */
export function resizeNotes(
  notes: readonly MidiNote[],
  ids: ReadonlySet<string>,
  dBeats: number,
  min: number,
): MidiNote[] {
  return notes.map((n) =>
    ids.has(n.id) ? { ...n, beats: round(Math.max(min, n.beats + dBeats)) } : n,
  );
}

/** Snap to the grid, or to a thousandth of a beat when the grid is off. */
export const snapBeat = (beat: number, step: number) =>
  Math.max(0, step ? Math.round(beat / step) * step : round(beat));

/** The grid cell a beat falls in, for hover and drawing. */
export const cellStart = (beat: number, step: number) =>
  Math.max(0, step ? Math.floor(beat / step + EPS) * step : round(beat));

const round = (b: number) => Math.round(b * 1000) / 1000;

/** "bar 2, beat 1.5", counting both from 1. */
export function beatLabel(beat: number, beatsPerBar: number): string {
  const bar = Math.floor(beat / beatsPerBar + EPS);
  const within = round(beat - bar * beatsPerBar) + 1;
  return `bar ${bar + 1}, beat ${Number(within.toFixed(3))}`;
}

/** Seconds as m:ss. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + EPS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Notes pressed this close together, in milliseconds, count as one chord. */
export const CHORD_WINDOW_MS = 80;

/**
 * Turns notes played on a keyboard into MIDI notes.
 * - Stopped (step input): each note lands at the cursor with the grid length,
 *   and the cursor moves on one step. Notes pressed together form a chord at
 *   the same beat.
 * - Playing (live recording): each note starts at the beat it was pressed and
 *   lasts until it is released, both snapped to the grid.
 */
export class KeyRecorder {
  private chordAt = -Infinity;
  private chordBeat = 0;
  private open = new Map<number, { beat: number; velocity: number }>();

  /** Step input: the note to add, and where the cursor goes next. */
  step(
    midi: number,
    velocity: number,
    at: number,
    cursor: number,
    length: number,
  ): { note: Omit<MidiNote, 'id'>; cursor: number } {
    const sameChord = at - this.chordAt <= CHORD_WINDOW_MS;
    const start = sameChord ? this.chordBeat : cursor;
    if (!sameChord) {
      this.chordAt = at;
      this.chordBeat = start;
    }
    return {
      note: { midi, startBeat: start, beats: length, velocity: toVelocity(velocity) },
      cursor: start + length,
    };
  }

  /** Live recording: a key went down at this beat. */
  press(midi: number, velocity: number, beat: number): void {
    this.open.set(midi, { beat: Math.max(0, beat), velocity: toVelocity(velocity) });
  }

  /** Live recording: a key came up; the finished note, if its key was down. */
  release(midi: number, beat: number, step: number): Omit<MidiNote, 'id'> | null {
    const held = this.open.get(midi);
    if (!held) return null;
    this.open.delete(midi);
    const start = snapBeat(held.beat, step);
    const end = Math.max(snapBeat(beat, step), start + (step || 0.0625));
    return { midi, startBeat: start, beats: round(end - start), velocity: held.velocity };
  }

  /** Close every key still down, as if released at this beat (playback stopped). */
  releaseAll(beat: number, step: number): Omit<MidiNote, 'id'>[] {
    return [...this.open.keys()]
      .map((midi) => this.release(midi, beat, step))
      .filter((n): n is Omit<MidiNote, 'id'> => n !== null);
  }

  /** Keys held right now in live recording, with the beat each went down. */
  held(): { midi: number; beat: number }[] {
    return [...this.open].map(([midi, h]) => ({ midi, beat: h.beat }));
  }
}

/** Input velocity 0..1 to MIDI 1..127. */
const toVelocity = (v: number) => Math.max(1, Math.min(127, Math.round((v || 0.75) * 127)));
