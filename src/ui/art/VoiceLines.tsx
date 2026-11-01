import type { Mode } from '@/core/theory';
import { ArtSvg } from './ArtSvg';
import { pitchY } from './scale';
import { voicedNumerals } from './progressionVoices';
import s from './art.module.css';

const H = 44;
const PAD = 6;

/**
 * A progression as its voices move: each chord a column of dots, each note
 * joined to the nearest note of the next chord. Held tones run flat; leaps
 * show as slopes.
 */
export function VoiceLines({
  numerals,
  mode,
  width = 260,
}: {
  numerals: readonly string[];
  mode: Mode;
  width?: number;
}) {
  const voicings = voicedNumerals(numerals, mode);
  if (!voicings) return null;
  const col = Math.min(60, (width - 2 * PAD) / Math.max(voicings.length - 1, 1));
  const all = voicings.flat();
  const y = pitchY(Math.min(...all), Math.max(...all), 5, H - 5);
  const x = (i: number) => PAD + i * col;
  const lines: string[] = [];
  voicings.forEach((v, i) => {
    const next = voicings[i + 1];
    if (!next) return;
    for (const m of v) {
      const to = next.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
      lines.push(`M${x(i)} ${y(m)}L${x(i + 1)} ${y(to)}`);
    }
  });
  return (
    <ArtSvg box={[PAD * 2 + (voicings.length - 1) * col, H]}>
      {voicings.slice(1).map((_, i) => (
        <line
          key={i}
          className={s.guide}
          x1={x(i) + col / 2}
          x2={x(i) + col / 2}
          y1={2}
          y2={H - 2}
        />
      ))}
      <path className={s.line} d={lines.join('')} />
      {voicings.map((v, i) =>
        v.map((m) => <circle key={`${i}-${m}`} className={s.dot} cx={x(i)} cy={y(m)} r={2.4} />),
      )}
    </ArtSvg>
  );
}
