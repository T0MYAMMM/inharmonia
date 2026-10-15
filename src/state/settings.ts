import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AccidentalStyle, NotationSystem } from '@/core/notation';
import { storage } from '@/core/persistence/storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface SettingsState {
  theme: ThemeChoice;
  notation: NotationSystem;
  accidentalStyle: AccidentalStyle;
  /** Show computer-key letters on piano keys (only on devices with a mouse). */
  showKeyHints: boolean;
  /** Output level, decibels. */
  volumeDb: number;
  metronome: boolean;
  countInBars: number;
  midiInput: string;
}

interface SettingsActions {
  set: (patch: Partial<SettingsState>) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: SettingsState = {
  theme: 'system',
  notation: 'letter',
  accidentalStyle: 'slash',
  showKeyHints: true,
  volumeDb: -4,
  metronome: false,
  countInBars: 0,
  midiInput: 'all',
};

export const SETTINGS_VERSION = 1;

/**
 * App settings, persisted as { state, version } under "inharmonia:settings".
 * (index.html reads `state.theme` from the same key before first paint.)
 */
export const useSettings = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => ({
        getItem: (k) => storage.get(k),
        setItem: (k, v) => void storage.set(k, v),
        removeItem: (k) => storage.remove(k),
      })),
      partialize: ({ set: _s, reset: _r, ...rest }) => rest,
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);

/** Keep only known keys with valid values from whatever was stored. */
function sanitize(x: unknown): Partial<SettingsState> {
  if (typeof x !== 'object' || x === null) return {};
  const p = x as Record<string, unknown>;
  const out: Partial<SettingsState> = {};
  if (p.theme === 'system' || p.theme === 'light' || p.theme === 'dark') out.theme = p.theme;
  if (p.notation === 'letter' || p.notation === 'roman' || p.notation === 'angka')
    out.notation = p.notation;
  if (p.accidentalStyle === 'slash' || p.accidentalStyle === 'suffix')
    out.accidentalStyle = p.accidentalStyle;
  if (typeof p.showKeyHints === 'boolean') out.showKeyHints = p.showKeyHints;
  if (typeof p.volumeDb === 'number' && p.volumeDb <= 6 && p.volumeDb >= -40)
    out.volumeDb = p.volumeDb;
  if (typeof p.metronome === 'boolean') out.metronome = p.metronome;
  if (typeof p.countInBars === 'number' && p.countInBars >= 0 && p.countInBars <= 2)
    out.countInBars = p.countInBars;
  if (typeof p.midiInput === 'string') out.midiInput = p.midiInput;
  return out;
}
