import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { beatLabel, formatClock } from './rollEdit';
import styles from './midiWorkspace.module.css';

interface Props {
  /** The beat shown now: the playhead while playing, the cursor when stopped. */
  getBeat: () => number;
  endBeat: number;
  beatsPerBar: number;
  bpm: number;
  onSeek(beat: number): void;
}

/**
 * A video-player style progress bar: click or drag anywhere to move the
 * playhead there. It redraws itself each frame from `getBeat`, so playback
 * never re-renders the editor.
 */
export function SeekBar({ getBeat, endBeat, beatsPerBar, bpm, onSeek }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const where = useRef<HTMLSpanElement>(null);
  const scrubbing = useRef<number | null>(null);
  const end = Math.max(beatsPerBar, endBeat);
  const seconds = (b: number) => (b * 60) / bpm;

  useEffect(() => {
    let frame = 0;
    let shown = NaN;
    const draw = () => {
      const beat = Math.min(end, Math.max(0, getBeat()));
      if (beat !== shown) {
        shown = beat;
        const pct = `${(beat / end) * 100}%`;
        if (fill.current) fill.current.style.width = pct;
        if (thumb.current) thumb.current.style.left = pct;
        if (now.current) now.current.textContent = formatClock(seconds(beat));
        if (where.current) where.current.textContent = beatLabel(beat, beatsPerBar);
        track.current?.setAttribute('aria-valuenow', String(Math.round(beat * 100) / 100));
        track.current?.setAttribute('aria-valuetext', beatLabel(beat, beatsPerBar));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
    // seconds() only depends on bpm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBeat, end, beatsPerBar, bpm]);

  const beatAtPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
    // Land on a sixteenth, so a click is easy to repeat.
    return Math.round(f * end * 4) / 4;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = e.pointerId;
    onSeek(beatAtPointer(e));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current === e.pointerId) onSeek(beatAtPointer(e));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current === e.pointerId) scrubbing.current = null;
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const beat = getBeat();
    const by: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: beatsPerBar,
      PageDown: -beatsPerBar,
    };
    let target: number | null = null;
    if (e.key in by) target = beat + by[e.key]!;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = end;
    if (target === null) return;
    e.preventDefault();
    e.stopPropagation();
    onSeek(Math.min(end, Math.max(0, Math.round(target * 4) / 4)));
  };

  return (
    <div className={styles.seek}>
      <span className={styles.seekTime}>
        <span ref={now}>0:00</span> / {formatClock(seconds(end))}
      </span>
      <div
        ref={track}
        className={styles.seekTrack}
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={end}
        aria-valuenow={0}
        data-testid="midi-seek"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
      >
        <div className={styles.seekRail}>
          <div ref={fill} className={styles.seekFill} />
        </div>
        <div ref={thumb} className={styles.seekThumb} />
      </div>
      <span ref={where} className={styles.seekWhere} data-testid="midi-seek-where">
        bar 1, beat 1
      </span>
    </div>
  );
}
