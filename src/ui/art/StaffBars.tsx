import { ArtSvg } from './ArtSvg';
import { layoutStaff } from './staffLayout';
import type { SongPreview } from './songPreview';
import s from './art.module.css';

/**
 * A song's first bars written as bars ("birama"): a treble staff, the time
 * signature, the melody with stems, beams, flags, dots and ties, and the
 * barlines. Spaced by time, not engraved; the key and accidentals are left
 * out. Only the shape: the score is on the song page.
 */
export function StaffBars({ preview, width = 240 }: { preview: SongPreview; width?: number }) {
  const staff = layoutStaff(preview, width);
  if (!staff) return null;
  return (
    <ArtSvg box={[staff.width, staff.height]}>
      {staff.lines.map((ly) => (
        <line key={ly} className={s.staffLine} x1={0} x2={staff.linesEnd} y1={ly} y2={ly} />
      ))}
      <text className={s.sig} x={staff.sig.x} y={staff.sig.top}>
        {staff.meter.beats}
      </text>
      <text className={s.sig} x={staff.sig.x} y={staff.sig.bottom}>
        {staff.meter.unit}
      </text>
      {staff.barlines.map((bx) => (
        <line
          key={bx}
          className={s.barline}
          x1={bx}
          x2={bx}
          y1={staff.lines[0]}
          y2={staff.lines.at(-1)}
        />
      ))}
      {staff.heads.map((h, i) => (
        <ellipse
          key={i}
          className={h.hollow ? s.hollowHead : s.head}
          cx={h.cx}
          cy={h.cy}
          rx={3.7}
          ry={2.6}
          transform={`rotate(-20 ${h.cx} ${h.cy})`}
        />
      ))}
      <path className={s.stem} d={staff.strokes.join('')} />
      {staff.beams.map((b, i) => (
        <rect key={i} className={s.head} x={b.x} y={b.y} width={b.width} height={2.8} />
      ))}
      {staff.dots.map((d, i) => (
        <circle key={i} className={s.head} cx={d.cx} cy={d.cy} r={1.3} />
      ))}
    </ArtSvg>
  );
}
