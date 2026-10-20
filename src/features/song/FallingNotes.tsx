import { useEffect, useRef } from 'react';
import type { CompiledLesson } from '@/core/content/compile';
import { keyName } from '@/ui/keyboard/layout';
import type { SongMode } from './SongController';
import {
  fallingKeyPositions,
  fallingKeyRange,
  fallingNotesAt,
  type FallingHand,
} from './fallingNotesLayout';
import styles from './FallingNotes.module.css';

export interface FallingNotesProps {
  compiled: CompiledLesson;
  hand: FallingHand;
  lookAheadBeats: number;
  mode: SongMode;
  playing: boolean;
  /** Beat at which the player currently sounds, compensated for output latency. */
  visualBeat: () => number;
  /** The audio transport's swing warp; do not invent another tempo clock. */
  performanceBeat: (beat: number) => number;
  rhOn: boolean;
  lhOn: boolean;
  /** Changes when Practice advances, so a paused roll paints the next target. */
  targetBeat: number;
}

const ROLL_HEIGHT = 265;
const PIANO_HEIGHT = 72;
const HEIGHT = ROLL_HEIGHT + PIANO_HEIGHT;
const RH = '#F2B65B';
const LH = '#A9A0EB';

/**
 * Read-only piano roll. Uses one Canvas and a requestAnimationFrame drawing loop
 * while audio plays, avoiding a React render for each animation frame.
 * There is NO separate timer or note playback.
 */
export function FallingNotes({
  compiled,
  hand,
  lookAheadBeats,
  mode,
  playing,
  visualBeat,
  performanceBeat,
  rhOn,
  lhOn,
  targetBeat,
}: FallingNotesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const focusedMidiRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !viewport || !ctx) return;

    const enabled = compiled.events.filter(
      (event) =>
        (event.channel === 'rh' && rhOn) || (event.channel === 'lh' && lhOn),
    );
    const range = fallingKeyRange(enabled, hand);
    const keys = fallingKeyPositions(range[0], range[1], hand === 'both' ? 21 : 26);
    const positions = new Map(keys.keys.map((key) => [key.midi, key]));
    const selected = enabled.filter((event) => hand === 'both' || event.channel === hand);

    let frame = 0;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const width = Math.max(viewport.clientWidth || 320, keys.width);
      const density = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.ceil(width * density);
      const pixelHeight = Math.ceil(HEIGHT * density);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      canvas.style.width = width + 'px';
      canvas.style.height = HEIGHT + 'px';
      ctx.setTransform(density, 0, 0, density, 0, 0);
      ctx.clearRect(0, 0, width, HEIGHT);
      ctx.fillStyle = '#131E30';
      ctx.fillRect(0, 0, width, HEIGHT);

      const beat = visualBeat();
      const notes = fallingNotesAt(selected, beat, lookAheadBeats, hand, performanceBeat);
      const shift = (width - keys.width) / 2;

      // Subtle vertical pitch lanes plus the metrical grid.
      for (const key of keys.keys) {
        if (key.black) continue;
        ctx.fillStyle = key.midi % 12 === 0 ? '#24324A' : '#1C293C';
        ctx.fillRect(shift + key.x, 0, key.width - 1, ROLL_HEIGHT);
      }
      ctx.strokeStyle = '#64748B55';
      ctx.lineWidth = 1;
      for (let b = Math.ceil(beat); b <= beat + lookAheadBeats; b++) {
        const y = ROLL_HEIGHT * (1 - (performanceBeat(b) - beat) / lookAheadBeats);
        if (y < 0 || y > ROLL_HEIGHT) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Longer held notes have taller bars. The bottom touches the strike line
      // exactly at the same performance beat the transport schedules note-on.
      for (const note of notes) {
        const key = positions.get(note.midi);
        if (!key) continue;
        const x = shift + key.x + key.width * 0.12;
        const w = Math.max(4, key.width * 0.76);
        const y = note.top * ROLL_HEIGHT;
        const h = Math.max(3, (note.bottom - note.top) * ROLL_HEIGHT);
        ctx.fillStyle = note.hand === 'rh' ? RH : LH;
        ctx.globalAlpha = note.active ? 1 : 0.85;
        ctx.fillRect(x, y, w, h);
        if (note.active) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
        }
        ctx.globalAlpha = 1;
        if (w >= 19 && h >= 19) {
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#101827';
          ctx.fillText(keyName(note.midi).replace(/[0-9]+$/, ''), x + w / 2, y + 13, w);
        }
      }

      // Strike line and the integrated virtual keyboard share identical MIDI x coordinates.
      ctx.fillStyle = '#D9E7F7';
      ctx.fillRect(0, ROLL_HEIGHT - 2, width, 3);
      ctx.fillStyle = '#263348';
      ctx.fillRect(0, ROLL_HEIGHT + 1, width, PIANO_HEIGHT - 1);
      const active = new Set(notes.filter((n) => n.active).map((n) => n.midi));
      for (const key of keys.keys) {
        if (key.black) continue;
        ctx.fillStyle = active.has(key.midi) ? RH : '#F1F1EF';
        ctx.fillRect(shift + key.x + 1, ROLL_HEIGHT + 2, Math.max(2, key.width - 2), 64);
        ctx.strokeStyle = '#344054';
        ctx.strokeRect(shift + key.x + 1, ROLL_HEIGHT + 2, Math.max(2, key.width - 2), 64);
        if (key.midi % 12 === 0 && key.width >= 18) {
          ctx.fillStyle = '#49566D';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(keyName(key.midi), shift + key.x + key.width / 2, ROLL_HEIGHT + 59);
        }
      }
      for (const key of keys.keys) {
        if (!key.black) continue;
        ctx.fillStyle = active.has(key.midi) ? LH : '#0C1424';
        ctx.fillRect(
          shift + key.x,
          ROLL_HEIGHT + 2,
          Math.max(3, key.width),
          41,
        );
      }

      // On narrow screens keep the active melody within the viewport. Follow a
      // change in pitch, not every frame, to avoid fighting touch scrolling.
      const focus = notes.find((n) => n.active && n.hand === 'rh') ??
        notes.find((n) => n.active) ??
        notes.find((n) => n.hand === 'rh' && n.bottom > 0.9);
      if (playing && focus && focusedMidiRef.current !== focus.midi) {
        focusedMidiRef.current = focus.midi;
        const key = positions.get(focus.midi);
        if (key && width > viewport.clientWidth) {
          const x = shift + key.x;
          if (x < viewport.scrollLeft + 24 || x > viewport.scrollLeft + viewport.clientWidth - 24)
            viewport.scrollLeft = Math.max(0, x - viewport.clientWidth * 0.4);
        }
      }
      if (playing) frame = requestAnimationFrame(draw);
    };

    focusedMidiRef.current = null;
    draw();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => !playing && draw()) : null;
    observer?.observe(viewport);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [
    compiled,
    hand,
    lookAheadBeats,
    mode,
    playing,
    visualBeat,
    performanceBeat,
    rhOn,
    lhOn,
    targetBeat,
  ]);

  return (
    <div className={styles.frame} data-testid="falling-notes">
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.right} /> Right hand</span>
        <span><i className={styles.left} /> Left hand</span>
        <span className={styles.explanation}>Notes reach the line when played</span>
      </div>
      <div className={styles.viewport} ref={viewportRef} data-testid="falling-notes-viewport">
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          role="img"
          aria-label="Falling piano notes, amber for right hand and lavender for left hand. Notes descend to the keyboard in time with the song."
        >
          Falling-notes visualization requires Canvas support. Use Follow Along for text-based notes.
        </canvas>
      </div>
      <p className={styles.hint}>
        {mode === 'practice'
          ? 'The notes wait at your current practice target. Play the requested melody note or chord to advance.'
          : 'The animation follows the song transport, including tempo changes and accompaniment patterns.'}
        {' '}Scroll sideways on small screens to see more keys.
      </p>
    </div>
  );
}
