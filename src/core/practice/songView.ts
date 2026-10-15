import type { CompiledChord, CompiledLesson, CompiledNote } from '../content/compile';

const EPS = 1e-9;

/** Bar index at a beat, clamped to the lesson. */
export function barAt(c: CompiledLesson, beat: number): number {
  const i = Math.floor((beat + EPS) / c.beatsPerBar);
  return Math.max(0, Math.min(c.bars.length - 1, i));
}

/** The chord sounding at a beat. */
export function chordAt(c: CompiledLesson, beat: number): CompiledChord | null {
  const bar = c.bars[barAt(c, beat)];
  if (!bar) return null;
  for (const ch of bar.chords)
    if (beat >= ch.startBeat - EPS && beat < ch.startBeat + ch.beats - EPS) return ch;
  return bar.chords.at(-1) ?? null;
}

/** The written right-hand note (or rest) under the playhead, or null outside the song. */
export function rhNoteAt(c: CompiledLesson, beat: number): CompiledNote | null {
  if (beat < -EPS || beat >= c.lengthBeats - EPS) return null;
  for (const n of c.bars[barAt(c, beat)]!.rh) {
    if (beat >= n.startBeat - EPS && beat < n.startBeat + n.beats - EPS) return n;
  }
  return null;
}

/** The chord a note sits in (the chord sounding at the note's start). */
export function chordOf(c: CompiledLesson, note: CompiledNote): CompiledChord | null {
  return chordAt(c, note.startBeat);
}
