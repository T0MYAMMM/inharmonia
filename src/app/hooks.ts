import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AudioSnapshot } from '@/core/audio';
import type { MidiSnapshot } from '@/core/input';
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
