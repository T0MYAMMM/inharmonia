import { CHANGE_BEAT, realizeFill } from '@/core/content/fills';
import type { FillSpec } from '@/core/content/types';
import { romanToChord } from '@/core/theory';
import { ArtSvg } from './ArtSvg';
import { pitchY } from './scale';
import s from './art.module.css';

const H = 44;
const PAD = 8;

/**
 * A fill in C over its suggested change: the notes as dots joined in order,
 * the chord change as a dashed barline, the landing note as an open ring.
 * Each run fills the height with its own range, so its shape reads at a glance.
 */
export function FillRun({ fill, width = 240 }: { fill: FillSpec; width?: number }) {
  const from = romanToChord(fill.suggested.from, 'C');
  const to = romanToChord(fill.suggested.to, 'C');
  const hits = realizeFill(fill, { key: 'C', mode: 'major', from, to });
  if (!hits.length) return null;
  const midis = hits.flatMap((h) => h.notes.map((n) => n.midi));
  const start = Math.min(...hits.map((h) => h.beat));
  const end = Math.max(CHANGE_BEAT + 0.6, ...hits.map((h) => h.beat + 0.25));
  const bw = Math.min(64, (width - 2 * PAD) / Math.max(end - start, 1));
  const X = (beat: number) => PAD + (beat - start) * bw;
  const y = pitchY(Math.min(...midis), Math.max(...midis), 8, H - 8);
  const top = hits.map((h) => `${X(h.beat)} ${y(h.notes.at(-1)!.midi)}`);
  return (
    <ArtSvg box={[X(end) + PAD, H]}>
      {CHANGE_BEAT > start ? (
        <line className={s.change} x1={X(CHANGE_BEAT)} x2={X(CHANGE_BEAT)} y1={1} y2={H - 1} />
      ) : null}
      <path className={s.run} d={`M${top.join('L')}`} />
      {hits.map((h) => (
        <g key={h.id}>
          {h.notes.length > 1 ? (
            <line
              className={s.run}
              x1={X(h.beat)}
              x2={X(h.beat)}
              y1={y(h.notes[0]!.midi)}
              y2={y(h.notes.at(-1)!.midi)}
            />
          ) : null}
          {h.notes.map((n) => (
            <circle
              key={n.midi}
              className={h.landing ? s.landing : s.dot}
              cx={X(h.beat)}
              cy={y(n.midi)}
              r={h.landing ? 4.6 : 3}
            />
          ))}
        </g>
      ))}
    </ArtSvg>
  );
}
