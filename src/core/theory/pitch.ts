import { Interval, Note } from 'tonal';

/** A note with both a spelled name (for display) and a MIDI number (for the engine). */
export interface SpelledNote {
  /** Spelled scientific pitch, e.g. "F#4", "Bb3", "Ebb5". */
  name: string;
  midi: number;
}

export const MIDDLE_C = 60;

export function noteToMidi(name: string): number {
  const midi = Note.midi(name);
  if (midi === null) throw new Error(`Not a note with octave: "${name}"`);
  return midi;
}

export function spelled(name: string): SpelledNote {
  return { name: normalizeAccidentals(name), midi: noteToMidi(name) };
}

export function chroma(midiOrPc: number | string): number {
  if (typeof midiOrPc === 'number') return ((midiOrPc % 12) + 12) % 12;
  const c = Note.chroma(normalizeAccidentals(midiOrPc));
  if (c === undefined || Number.isNaN(c)) throw new Error(`Not a pitch class: "${midiOrPc}"`);
  return c;
}

/** Pitch class (no octave) of a spelled note: "F#4" → "F#". */
export function pitchClassName(name: string): string {
  const pc = Note.pitchClass(normalizeAccidentals(name));
  if (!pc) throw new Error(`Not a note: "${name}"`);
  return pc;
}

/** Accept ♯/♭/𝄪/𝄫 as well as #/b. */
export function normalizeAccidentals(s: string): string {
  return s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/𝄪/g, '##').replace(/𝄫/g, 'bb');
}

/**
 * Give a pitch class an octave so its MIDI number equals `midi`.
 * Handles spellings that cross the octave boundary (B#3 = C4, Cb4 = B3).
 */
export function spellAt(pc: string, midi: number): SpelledNote {
  const base = Math.floor(midi / 12) - 1;
  for (const oct of [base, base + 1, base - 1]) {
    const name = `${pc}${oct}`;
    if (Note.midi(name) === midi) return { name, midi };
  }
  throw new Error(`Cannot spell ${pc} at MIDI ${midi}`);
}

/** Lowest placement of `pc` whose MIDI number is ≥ `minMidi`. */
export function placeAtOrAbove(pc: string, minMidi: number): SpelledNote {
  const c = chroma(pc);
  const midi = minMidi + ((c - chroma(minMidi) + 12) % 12);
  return spellAt(pc, midi);
}

/** Highest placement of `pc` whose MIDI number is < `maxMidi`. */
export function placeBelow(pc: string, maxMidi: number): SpelledNote {
  const above = placeAtOrAbove(pc, maxMidi - 12);
  return above.midi < maxMidi ? above : spellAt(pc, above.midi - 12);
}

export function transposeNote(note: SpelledNote, semitones: number): SpelledNote {
  return spellAt(pitchClassName(note.name), note.midi + semitones);
}

/** Transpose a spelled pitch class by an interval name, e.g. ("D", "3M") → "F#". */
export function transposePc(pc: string, interval: string): string {
  const out = Note.transpose(normalizeAccidentals(pc), interval);
  if (!out) throw new Error(`Cannot transpose ${pc} by ${interval}`);
  return Note.pitchClass(out);
}

export function intervalBetween(fromPc: string, toPc: string): string {
  return Interval.distance(normalizeAccidentals(fromPc), normalizeAccidentals(toPc));
}

export function sortByPitch<T extends { midi: number }>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => a.midi - b.midi);
}
