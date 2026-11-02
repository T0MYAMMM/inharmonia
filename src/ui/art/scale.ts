import { noteToMidi } from '@/core/theory';
import { previewNotes, type SongPreview } from './songPreview';

/** Map a pitch range onto a y range, high notes at the top. */
export function pitchY(lo: number, hi: number, top: number, bottom: number) {
  const span = Math.max(hi - lo, 1);
  return (midi: number) => bottom - ((midi - lo) / span) * (bottom - top);
}

/** A note on a piano roll, in the meter's beats. */
export interface RollNote {
  at: number;
  dur: number;
  midi: number;
}

/**
 * The preview's melody as a piano roll would hold it: a tied note and the one
 * it is tied to become one held note. Null if the preview can't be read.
 */
export function rollNotes(preview: SongPreview): RollNote[] | null {
  const notes = previewNotes(preview);
  if (!notes?.length) return null;
  const out: (RollNote & { tie: boolean })[] = [];
  for (const n of notes) {
    const midi = noteToMidi(n.note);
    const prev = out.at(-1);
    if (prev?.tie && prev.midi === midi && Math.abs(prev.at + prev.dur - n.at) < 1e-6) {
      prev.dur += n.beats;
      prev.tie = n.tie;
    } else out.push({ at: n.at, dur: n.beats, midi, tie: n.tie });
  }
  return out.map(({ at, dur, midi }) => ({ at, dur, midi }));
}
