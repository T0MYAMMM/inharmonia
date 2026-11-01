import { ArtSvg } from './ArtSvg';
import s from './art.module.css';

const GAP = 32;
const H = 44;

/** The last seven days: filled where you practised, open where you didn't. */
export function WeekDots({ days }: { days: readonly { key: string; practised: boolean }[] }) {
  if (!days.length) return null;
  const end = 8 + GAP * (days.length - 1);
  return (
    <ArtSvg box={[end + 8, H]}>
      <line className={s.guide} x1={8} x2={end} y1={H / 2} y2={H / 2} />
      {days.map((d, i) =>
        d.practised ? (
          <circle key={d.key} className={s.dot} cx={8 + i * GAP} cy={H / 2} r={5.5} />
        ) : (
          <circle key={d.key} className={s.ring} cx={8 + i * GAP} cy={H / 2} r={5} />
        ),
      )}
    </ArtSvg>
  );
}
