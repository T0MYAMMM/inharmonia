import type { GridNote, NoteEvent, PitchFrame, TakeTiming } from '@/core/transcription';
import styles from './studio.module.css';

const BEAT_PX = 44;
const ROW_PX = 9;

export interface TakeViewProps {
  timing: TakeTiming;
  frames: readonly PitchFrame[];
  events: readonly NoteEvent[];
  notes: readonly GridNote[];
  /** Octaves the draft was moved by; the trace moves with it so it lines up. */
  octaveShift: number;
  /** Frames below this clarity are not drawn. */
  minClarity: number;
}

/**
 * The take on the beat grid: the raw pitch trace in muted ink, the detected
 * notes as outlines, and the quantized melody in amber on top.
 */
export function TakeView({
  timing,
  frames,
  events,
  notes,
  octaveShift,
  minClarity,
}: TakeViewProps) {
  const bps = timing.tempo / 60;
  const beats = timing.bars * timing.meter.beats;
  const shift = 12 * octaveShift;
  const toBeat = (sec: number) => (sec - timing.beat0) * bps;
  const midis = notes.map((n) => n.midi);
  const lo = Math.floor((midis.length ? Math.min(...midis) : 60) - 3);
  const hi = Math.ceil((midis.length ? Math.max(...midis) : 72) + 3);
  const width = beats * BEAT_PX;
  const height = (hi - lo + 1) * ROW_PX;
  const x = (beat: number) => beat * BEAT_PX;
  const y = (midi: number) => (hi - midi) * ROW_PX;

  // Trace as polylines broken at unvoiced frames.
  const paths: string[] = [];
  let d = '';
  for (const f of frames) {
    const b = toBeat(f.time);
    const ok = f.midi !== null && f.clarity >= minClarity && b >= -0.25 && b <= beats + 0.25;
    if (!ok) {
      if (d) paths.push(d);
      d = '';
      continue;
    }
    const pt = `${x(b).toFixed(1)},${(y(f.midi! + shift) + ROW_PX / 2).toFixed(1)}`;
    d += d ? ` L${pt}` : `M${pt}`;
  }
  if (d) paths.push(d);

  return (
    <div className={styles.rollScroll}>
      <svg
        className={styles.roll}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Your take on the beat grid: ${notes.length} notes over ${timing.bars} bars`}
      >
        {Array.from({ length: hi - lo + 1 }, (_, i) => {
          const m = hi - i;
          return m % 12 === 0 ? (
            <line
              key={m}
              x1={0}
              x2={width}
              y1={y(m) + ROW_PX}
              y2={y(m) + ROW_PX}
              className={styles.cLine}
            />
          ) : null;
        })}
        {Array.from({ length: beats + 1 }, (_, b) => (
          <line
            key={b}
            x1={x(b)}
            x2={x(b)}
            y1={0}
            y2={height}
            className={b % timing.meter.beats === 0 ? styles.barLine : styles.beatLine}
          />
        ))}
        {paths.map((p, i) => (
          <path key={i} d={p} className={styles.tracePath} />
        ))}
        {events.map((e, i) => {
          const b0 = toBeat(e.start);
          const b1 = toBeat(e.end);
          if (b1 < 0 || b0 > beats) return null;
          return (
            <rect
              key={i}
              x={x(b0)}
              y={y(Math.round(e.pitch) + shift)}
              width={Math.max(2, x(b1) - x(b0))}
              height={ROW_PX}
              rx={2}
              className={styles.detected}
            />
          );
        })}
        {notes.map((n, i) => (
          <rect
            key={i}
            x={x(n.startBeat) + 1}
            y={y(n.midi) + 1}
            width={Math.max(3, x(n.beats) - 2)}
            height={ROW_PX - 2}
            rx={3}
            className={styles.gridNote}
            data-uncertain={n.uncertain || undefined}
          />
        ))}
        {Array.from({ length: timing.bars }, (_, bar) => (
          <text key={bar} x={x(bar * timing.meter.beats) + 4} y={11} className={styles.barNumber}>
            {bar + 1}
          </text>
        ))}
      </svg>
    </div>
  );
}
