import { useEffect, useRef } from 'react';
import type { CompiledLesson } from '@/core/content/compile';
import { layoutKeys, keyName } from '@/ui/keyboard/layout';
import { KeyboardDock } from '@/ui/keyboard/KeyboardDock';
import type { SongMode } from './SongController';
import { fallingKeyRange, fallingNotesAt, type FallingHand } from './fallingNotesLayout';
import styles from './FallingNotes.module.css';

export interface FallingNotesProps {
  compiled: CompiledLesson;
  hand: FallingHand;
  lookAheadBeats: number;
  mode: SongMode;
  playing: boolean;
  /** Beat at which audio is heard, already compensated for output latency. */
  visualBeat: () => number;
  /** The audio transport's beat warp (including swing). */
  performanceBeat: (beat: number) => number;
  rhOn: boolean;
  lhOn: boolean;
  targetBeat: number;
  /** Same MIDI range and focus as the regular playable keyboard dock. */
  keyboard?: {
    low: number;
    high: number;
    focus: [number, number];
    showTarget: boolean;
  };
}

const ROLL_HEIGHT = 265;
const RH = '#F2B65B';
const LH = '#A9A0EB';

/**
 * The falling roll shares a scroll surface and responsive MIDI-key geometry
 * with InHarmonia's actual playable keyboard. The keyboard is never drawn
 * in Canvas: touching it and playing via MIDI always reaches the normal
 * NoteStream, KeyLights and audio engine.
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
  keyboard,
}: FallingNotesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focusedMidiRef = useRef<number | null>(null);
  const [low, high] = keyboard
    ? [keyboard.low, keyboard.high]
    : fallingKeyRange(compiled.events, hand);

  useEffect(() => {
    const canvas = canvasRef.current;
    const strip = canvas?.parentElement;
    const scroller = canvas?.closest<HTMLElement>('[data-keyboard-scroller]');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !strip || !ctx) return;

    const geometry = layoutKeys(low, high);
    const positions = new Map(geometry.keys.map((key) => [key.midi, key]));
    const selected = compiled.events.filter(
      (event) =>
        (hand === 'both' || event.channel === hand) &&
        ((event.channel === 'rh' && rhOn) || (event.channel === 'lh' && lhOn)),
    );

    let frame = 0;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      // Read width from the SAME element that uses the keyboard's --w unit.
      // This includes pointer-coarse and phone-landscape key size rules.
      const width = Math.max(1, strip.clientWidth);
      const density = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.ceil(width * density);
      const pixelHeight = Math.ceil(ROLL_HEIGHT * density);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      canvas.style.width = width + 'px';
      canvas.style.height = ROLL_HEIGHT + 'px';
      ctx.setTransform(density, 0, 0, density, 0, 0);
      ctx.clearRect(0, 0, width, ROLL_HEIGHT);
      ctx.fillStyle = '#131E30';
      ctx.fillRect(0, 0, width, ROLL_HEIGHT);

      const beat = visualBeat();
      const notes = fallingNotesAt(selected, beat, lookAheadBeats, hand, performanceBeat);
      const unit = width / geometry.width;

      // Vertical pitch lanes align exactly with the real keys below them.
      for (const key of geometry.keys) {
        if (key.black) continue;
        ctx.fillStyle = key.midi % 12 === 0 ? '#24324A' : '#1C293C';
        ctx.fillRect(key.x * unit, 0, unit - 1, ROLL_HEIGHT);
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

      // Note starts hit the real keyboard edge at the same performance beat
      // that the audio transport schedules them. Holds preserve their height.
      for (const note of notes) {
        const key = positions.get(note.midi);
        if (!key) continue;
        const pitchWidth = unit * (key.black ? 0.6 : 1);
        const x = key.x * unit + pitchWidth * 0.12;
        const w = Math.max(4, pitchWidth * 0.76);
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

      ctx.fillStyle = '#D9E7F7';
      ctx.fillRect(0, ROLL_HEIGHT - 2, width, 3);

      // On mobile, move the ONE shared scroller, so the notes and actual keys
      // never scroll independently. Avoid fighting manual scrolling each frame.
      const focus =
        notes.find((n) => n.active && n.hand === 'rh') ??
        notes.find((n) => n.active) ??
        notes.find((n) => n.hand === 'rh' && n.bottom > 0.9);
      if (playing && focus && focusedMidiRef.current !== focus.midi) {
        focusedMidiRef.current = focus.midi;
        if (scroller && scroller.scrollWidth > scroller.clientWidth) {
          const key = positions.get(focus.midi);
          if (key) {
            const x = (key.x + (key.black ? 0.3 : 0.5)) * unit;
            if (x < scroller.scrollLeft + 24 || x > scroller.scrollLeft + scroller.clientWidth - 24)
              scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.4);
          }
        }
      }
      if (playing) frame = requestAnimationFrame(draw);
    };

    focusedMidiRef.current = null;
    draw();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => !playing && draw()) : null;
    observer?.observe(strip);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [
    compiled,
    low,
    high,
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
        <span>
          <i className={styles.right} /> Right hand
        </span>
        <span>
          <i className={styles.left} /> Left hand
        </span>
        <span className={styles.explanation}>Notes arrive on the playable keys below</span>
      </div>
      <KeyboardDock
        inline
        low={low}
        high={high}
        focus={keyboard?.focus}
        showTarget={keyboard?.showTarget ?? mode === 'practice'}
        roll={
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            role="img"
            aria-label="Falling piano notes aligned with the interactive piano below. Amber for right hand, lavender for left hand."
          >
            Falling-notes visualization requires Canvas support. Use Follow Along for text-based
            notes.
          </canvas>
        }
      />
      <p className={styles.hint}>
        {mode === 'practice'
          ? 'Notes wait at your current practice target. Play the corresponding keys below to advance.'
          : 'The falling notes arrive on the same playable piano you use in every other mode.'}{' '}
        Scroll sideways to see more keys on small screens.
      </p>
    </div>
  );
}
