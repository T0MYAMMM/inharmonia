import type { RollNote } from './scale';

/** Notes as rounded bars on a roll. */
export function Pills({
  notes,
  x,
  y,
  h,
  className,
}: {
  notes: readonly RollNote[];
  x: (beat: number) => number;
  y: (midi: number) => number;
  h: number;
  className: string | undefined;
}) {
  return (
    <>
      {notes.map((n, i) => (
        <rect
          key={i}
          className={className}
          x={x(n.at) + 1}
          y={y(n.midi) - h / 2}
          width={Math.max(x(n.at + n.dur) - x(n.at) - 2, h)}
          height={h}
          rx={h / 2}
        />
      ))}
    </>
  );
}
