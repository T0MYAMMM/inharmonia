import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AudioSnapshot } from '@/core/audio';
import { activeInput, type ActiveInput, type InputSource, type MidiSnapshot } from '@/core/input';
import { audio, keys, midi, notes } from './services';

export function useAudioState(): AudioSnapshot {
  return useSyncExternalStore(
    (cb) => audio.subscribe(cb),
    () => audio.state,
  );
}

export function useMidiState(): MidiSnapshot {
  return useSyncExternalStore(
    (cb) => midi.subscribe(cb),
    () => midi.state,
  );
}

/** Held notes, lowest first. Re-renders on every note on/off; use for small readouts only. */
export function useHeldNotes(): number[] {
  const [held, setHeld] = useState<number[]>(() => notes.held());
  useEffect(() => notes.subscribe(() => setHeld(notes.held())), []);
  return held;
}

/** Whether the browser says it is online, kept up to date. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Enable the computer keyboard while the calling component is mounted. */
export function useComputerKeys(): number {
  const [shift, setShift] = useState(keys.octaveShift);
  useEffect(() => {
    const detach = keys.attach(window);
    const off = keys.onShiftChange(setShift);
    return () => {
      off();
      detach();
    };
  }, []);
  return shift;
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * The breakpoints in tokens.css, as media queries for useMediaQuery. CSS
 * can't read custom properties in a media query, so the widths are repeated
 * here once rather than in each component.
 */
export const BREAKPOINTS = {
  /** Phones: rows stack, settings fold away. */
  compact: '(max-width: 600px)',
  /** Small tablets: side-by-side panels become one column. */
  medium: '(max-width: 760px)',
  /** The nav and four-up grids give way. */
  wide: '(max-width: 960px)',
} as const;

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

/** A touch screen and nothing finer: no mouse or trackpad to point with, so no keyboard either. */
export function useTouchOnly(): boolean {
  const coarse = useMediaQuery('(pointer: coarse)');
  const fine = useMediaQuery('(any-pointer: fine)');
  return coarse && !fine;
}

/** The input in use (see activeInput), updated as notes arrive from each source. */
export function useActiveInput(): ActiveInput {
  const midiState = useMidiState();
  const touchOnly = useTouchOnly();
  const [last, setLast] = useState<InputSource | null>(null);
  useEffect(
    () =>
      notes.subscribe((e) => {
        if (e.type === 'on' && e.source !== 'auto') setLast(e.source);
      }),
    [],
  );
  return activeInput(last, midiState, touchOnly);
}
