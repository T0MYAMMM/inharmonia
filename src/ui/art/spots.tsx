import { computerKeyMap } from '@/core/input';
import { isBlack, layoutKeys } from '@/ui/keyboard/layout';
import { ArtSvg } from './ArtSvg';
import s from './art.module.css';

/** Five staff lines from x1 to x2, the top one at y, 8 apart. */
function Staff({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const d = [0, 1, 2, 3, 4].map((i) => `M${x1} ${y + i * 8}H${x2}`).join('');
  return <path className={s.thinLine} d={d} />;
}

/** "Nothing here": a whole bar's rest, held under a fermata, and the final barline. */
export function RestSpot({ width = 200 }: { width?: number }) {
  return (
    <ArtSvg box={[200, 100]} width={width} className={s.spot}>
      <Staff x1={10} x2={190} y={44} />
      <path className={s.thinLine} d="M10 44v32 M181 44v32" />
      {/* The final barline: thin, then thick. */}
      <rect className={s.dot} x={184} y={44} width={5} height={32} />
      {/* A whole rest hangs from the fourth line down. */}
      <rect className={s.dot} x={88} y={52} width={18} height={6} rx={0.5} />
      {/* The fermata: hold it. */}
      <path className={s.deepLine} d="M82 32a15 13 0 0 1 30 0" />
      <circle className={s.dot} cx={97} cy={29} r={2.4} />
    </ArtSvg>
  );
}

/** A metronome at rest: the pendulum straight up, nothing ticking yet. */
export function MetronomeSpot({ width = 200 }: { width?: number }) {
  return (
    <ArtSvg box={[200, 100]} width={width} className={s.spot}>
      <path className={s.thinLine} d="M10 86H190" />
      <path className={s.deepLine} d="M84 16h32l14 66H70z" />
      <path className={s.thinLine} d="M80 46h40 M78 56h44 M76 66h48" />
      <path className={s.deepLine} d="M100 76V22" />
      <rect className={s.dot} x={95} y={30} width={10} height={7} rx={1.5} />
      <circle className={s.dot} cx={100} cy={76} r={3} />
    </ArtSvg>
  );
}

const KEY_W = 16;
const KEY_H = 70;
const BLACK_H = 42;
const BLACK_W = 0.62;

/** The computer keys over the piano keys they play, from the same map the keyboard uses. */
export function KeysSpot({ width }: { width?: number }) {
  const map = computerKeyMap();
  const lo = map[0]!.midi;
  const hi = map.at(-1)!.midi + (isBlack(map.at(-1)!.midi) ? 1 : 0);
  const { keys, width: whites } = layoutKeys(lo, hi, BLACK_W);
  const label = new Map(map.map((k) => [k.midi, k.label.toUpperCase()]));
  const box = [whites * KEY_W + 2, KEY_H + 2] as const;
  return (
    <ArtSvg box={box} width={width ?? box[0]} className={s.spot}>
      {keys
        .filter((k) => !k.black)
        .map((k) => (
          <g key={k.midi}>
            <rect
              className={s.keyWhite}
              x={k.x * KEY_W + 1}
              y={1}
              width={KEY_W}
              height={KEY_H}
              rx={2}
            />
            {label.has(k.midi) ? (
              <text className={s.label} x={k.x * KEY_W + 1 + KEY_W / 2} y={KEY_H - 6}>
                {label.get(k.midi)}
              </text>
            ) : null}
          </g>
        ))}
      {keys
        .filter((k) => k.black)
        .map((k) => (
          <g key={k.midi}>
            <rect
              className={s.keyBlack}
              x={k.x * KEY_W + 1}
              y={1}
              width={KEY_W * BLACK_W}
              height={BLACK_H}
              rx={1.5}
            />
            {label.has(k.midi) ? (
              <text
                className={s.labelOnBlack}
                x={k.x * KEY_W + 1 + (KEY_W * BLACK_W) / 2}
                y={BLACK_H - 5}
              >
                {label.get(k.midi)}
              </text>
            ) : null}
          </g>
        ))}
    </ArtSvg>
  );
}
