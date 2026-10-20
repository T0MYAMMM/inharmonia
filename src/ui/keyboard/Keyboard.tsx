import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { KEY_HINTS, BASE_MIDI } from '@/core/input';
import { bindPointerInput } from '@/core/input/pointer';
import type { NoteStream } from '@/core/input';
import type { KeyLights } from '@/state/keyLights';
import { keyName, layoutKeys } from './layout';
import styles from './Keyboard.module.css';

export interface KeyboardProps {
  low: number;
  high: number;
  stream: NoteStream;
  lights: KeyLights;
  /** Octave shift of the computer-key mapping, for the hint letters. */
  octaveShift?: number;
  showHints?: boolean;
  /** MIDI range to keep in view; the scroller centres on it when it changes. */
  focus?: [number, number];
  onGesture?: () => void;
  label?: string;
  /** Content directly above the keys, with identical width and horizontal scrolling. */
  roll?: ReactNode;
}

/**
 * On-screen piano. Rendered once per range; key highlights are applied by
 * subscribing each key element to `lights` and writing `data-layers` directly.
 */
export function Keyboard({
  low,
  high,
  stream,
  lights,
  octaveShift = 0,
  showHints = true,
  focus,
  onGesture,
  label = 'Piano keyboard',
  roll,
}: KeyboardProps) {
  const { keys, width } = useMemo(() => layoutKeys(low, high), [low, high]);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef(onGesture);
  useEffect(() => {
    gestureRef.current = onGesture;
  }, [onGesture]);

  // Pointer input.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    return bindPointerInput(el, stream, { onGesture: () => gestureRef.current?.() });
  }, [stream]);

  // Fine-grained highlight subscriptions, one per key.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const offs: (() => void)[] = [];
    el.querySelectorAll<HTMLElement>('[data-midi]').forEach((keyEl) => {
      const midi = Number(keyEl.dataset.midi);
      const apply = (layers: ReadonlySet<string>) => {
        const v = [...layers].join(' ');
        if (v) keyEl.dataset.layers = v;
        else delete keyEl.dataset.layers;
      };
      apply(lights.get(midi));
      offs.push(lights.subscribe(midi, apply));
    });
    return () => offs.forEach((off) => off());
  }, [lights, keys]);

  // Keep the active range in view.
  const focusLo = focus?.[0];
  const focusHi = focus?.[1];
  useEffect(() => {
    const scroller = scrollerRef.current;
    const board = boardRef.current;
    if (!scroller || !board || focusLo === undefined || focusHi === undefined) return;
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    const keyX = (m: number) => {
      const k = board.querySelector<HTMLElement>(`[data-midi="${m}"]`);
      return k ? k.offsetLeft + k.offsetWidth / 2 : 0;
    };
    const centre = (keyX(Math.max(low, focusLo)) + keyX(Math.min(high, focusHi))) / 2;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo?.({
      left: centre - scroller.clientWidth / 2,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [focusLo, focusHi, low, high]);

  const hintBase = BASE_MIDI + 12 * octaveShift;
  const boardStyle = { width: `calc(var(--w) * ${width})` } as CSSProperties;

  return (
    <div ref={scrollerRef} className={styles.scroller} data-keyboard-scroller>
      {roll ? (
        <div className={styles.roll} style={boardStyle} data-testid="keyboard-roll">
          {roll}
        </div>
      ) : null}
      <div
        ref={boardRef}
        className={[styles.keyboard, showHints && styles.showHints].filter(Boolean).join(' ')}
        style={boardStyle}
        role="group"
        aria-label={label}
        data-testid="keyboard"
      >
        {keys.map((k) => {
          const hint = KEY_HINTS[k.midi - hintBase];
          const isC = k.midi % 12 === 0;
          return (
            <div
              key={k.midi}
              data-midi={k.midi}
              aria-hidden="true"
              title={keyName(k.midi)}
              className={`${styles.key} ${k.black ? styles.black : styles.white}`}
              style={{ left: `calc(var(--w) * ${k.x})` }}
            >
              {hint ? <span className={styles.hint}>{hint}</span> : null}
              {isC && !k.black ? <span className={styles.cLabel}>{keyName(k.midi)}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
