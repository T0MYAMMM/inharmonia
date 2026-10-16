import { formatNote, prettyAccidentals, spellInKey, type NotationSystem } from '@/core/notation';
import type { DraftNote, SongDraft } from '@/core/songs';

export const BEAT_PX = 48;
export const ROW_PX = 14;

/** The sung pitch, to draw under the notes. */
export interface EditorTrace {
  values: Float32Array;
  start: number;
  hop: number;
  beat0: number;
  tempo: number;
  /** Semitones to add so the trace lines up with the (octave-moved) notes. */
  shift: number;
}

export interface ChordOption {
  symbol: string;
  numeral?: string;
}

/** Where a note sits, in words: "E4, bar 2, beat 1, 1 beat". */
export function describeNote(n: DraftNote, d: SongDraft, notation: NotationSystem): string {
  const bpb = d.meter.beats;
  const name =
    notation === 'angka'
      ? formatNote(spellInKey(n.midi, d.key), d.key, { system: 'angka', accidentalStyle: 'suffix' })
          .text
      : prettyAccidentals(spellInKey(n.midi, d.key).name);
  const bar = Math.floor(n.startBeat / bpb + 1e-6) + 1;
  const beat = +((n.startBeat % bpb) + 1).toFixed(2);
  const len = +n.beats.toFixed(2);
  return `${name}, bar ${bar}, beat ${beat}, ${len} beat${len === 1 ? '' : 's'}`;
}
