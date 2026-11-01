import { ArtSvg } from './ArtSvg';
import s from './art.module.css';

const H = 44;
const SAMPLES = 220;

/** A chord's sound: the sum of its notes' sine waves, over a few of its periods. */
export function ChordWave({ notes, width = 180 }: { notes: readonly number[]; width?: number }) {
  if (!notes.length) return null;
  const hz = notes.map((m) => 440 * 2 ** ((m - 69) / 12));
  // Two octaves under the lowest note: near enough a period the notes all share.
  const period = 4 / Math.min(...hz);
  const points: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * period;
    const v = hz.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / hz.length;
    points.push(`${((i / SAMPLES) * width).toFixed(1)} ${(H / 2 - v * (H / 2 - 4)).toFixed(1)}`);
  }
  return (
    <ArtSvg box={[width, H]}>
      <line className={s.guide} x1={0} x2={width} y1={H / 2} y2={H / 2} />
      <path className={s.deepLine} d={`M${points.join('L')}`} />
    </ArtSvg>
  );
}
