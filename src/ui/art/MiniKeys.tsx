import { layoutKeys } from '@/ui/keyboard/layout';
import { ArtSvg } from './ArtSvg';
import s from './art.module.css';

const W = 12; // a white key
const H = 44;
const BLACK_H = 26;
const BLACK_W = 0.62;

/** A chord's notes as dots on a few octaves of keyboard. */
export function MiniKeys({
  notes,
  below = 0,
  octaves = 2,
}: {
  notes: readonly number[];
  /** Octaves of keyboard to show below the chord's own octave. */
  below?: number;
  octaves?: number;
}) {
  if (!notes.length) return null;
  const top = Math.max(...notes);
  const lo = Math.floor(Math.min(...notes) / 12) * 12 - 12 * below;
  const hi = Math.max(lo + 12 * octaves - 1, top + (11 - (top % 12)));
  const { keys, width } = layoutKeys(lo, hi, BLACK_W);
  const on = new Set(notes);
  return (
    <ArtSvg box={[width * W + 1, H + 1]}>
      {keys
        .filter((k) => !k.black)
        .map((k) => (
          <rect
            key={k.midi}
            className={s.keyWhite}
            x={k.x * W + 0.5}
            y={0.5}
            width={W}
            height={H}
            rx={1.5}
          />
        ))}
      {keys
        .filter((k) => k.black)
        .map((k) => (
          <rect
            key={k.midi}
            className={s.keyBlack}
            x={k.x * W + 0.5}
            y={0.5}
            width={W * BLACK_W}
            height={BLACK_H}
            rx={1}
          />
        ))}
      {keys
        .filter((k) => on.has(k.midi))
        .map((k) =>
          k.black ? (
            <circle
              key={k.midi}
              className={s.dotOnBlack}
              cx={k.x * W + 0.5 + (W * BLACK_W) / 2}
              cy={BLACK_H - 6}
              r={2.2}
            />
          ) : (
            <circle key={k.midi} className={s.dot} cx={k.x * W + 0.5 + W / 2} cy={H - 7} r={2.8} />
          ),
        )}
    </ArtSvg>
  );
}
