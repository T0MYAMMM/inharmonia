import { ArtSvg } from './ArtSvg';
import { Pills } from './Pills';
import { pitchY, rollNotes } from './scale';
import type { SongPreview } from './songPreview';
import s from './art.module.css';

const H = 44;

/**
 * The marks of a piano roll, to draw inside another drawing: the melody's
 * notes as bars, with a line on every beat and a stronger one on every bar.
 * Starts at the first note, so a pickup leaves no hole.
 */
export function RollMarks({ preview, width }: { preview: SongPreview; width: number }) {
  const notes = rollNotes(preview);
  if (!notes) return null;
  const perBar = preview.meter.beats;
  const start = notes[0]!.at;
  const end = Math.max(preview.bars.length * perBar, start + 1);
  const X = (beat: number) => ((beat - start) / (end - start)) * width;
  const midis = notes.map((n) => n.midi);
  const y = pitchY(Math.min(...midis), Math.max(...midis), 6, H - 6);
  const beats: number[] = [];
  for (let b = Math.floor(start) + 1; b < end; b++) beats.push(b);
  return (
    <>
      {beats.map((b) => (
        <line
          key={b}
          className={b % perBar ? s.faintGuide : s.guide}
          x1={X(b)}
          x2={X(b)}
          y1={0}
          y2={H}
        />
      ))}
      <Pills notes={notes} x={X} y={y} h={5} className={s.deepPill} />
    </>
  );
}

/** A song's first bars as a piano roll, like Studio's: the shape of the tune on its beat grid. */
export function SongRoll({ preview, width = 200 }: { preview: SongPreview; width?: number }) {
  if (!rollNotes(preview)) return null;
  return (
    <ArtSvg box={[width + 1, H]}>
      <RollMarks preview={preview} width={width} />
    </ArtSvg>
  );
}
