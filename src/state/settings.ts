import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AccidentalStyle, NotationSystem } from '@/core/notation';
import type { Strictness } from '@/core/content/types';
import { CHORD_QUALITIES } from '@/core/theory/qualities';
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
  /** Reconnect MIDI on load once the player has connected it. */
  midiEnabled: boolean;
  drill: DrillSettings;
  /** The home page's first-visit welcome has been dismissed. */
  welcomeDismissed: boolean;
}

export interface DrillSettings {
  qualityIds: string[];
  naturalsOnly: boolean;
  inversions: boolean;
  strictness: Strictness;
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
  midiEnabled: false,
  welcomeDismissed: false,
  drill: {
    qualityIds: ['major', 'minor'],
    naturalsOnly: true,
    inversions: false,
    strictness: 'pitch-class',
  },
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
  if (typeof p.midiEnabled === 'boolean') out.midiEnabled = p.midiEnabled;
  if (typeof p.welcomeDismissed === 'boolean') out.welcomeDismissed = p.welcomeDismissed;
  const d = p.drill as Partial<DrillSettings> | undefined;
  if (d && typeof d === 'object') {
    const known = new Set(CHORD_QUALITIES.map((q) => q.id));
    const ids = Array.isArray(d.qualityIds) ? d.qualityIds.filter((x) => known.has(x)) : [];
    out.drill = {
      qualityIds: ids.length ? ids : DEFAULT_SETTINGS.drill.qualityIds,
      naturalsOnly:
        typeof d.naturalsOnly === 'boolean' ? d.naturalsOnly : DEFAULT_SETTINGS.drill.naturalsOnly,
      inversions:
        typeof d.inversions === 'boolean' ? d.inversions : DEFAULT_SETTINGS.drill.inversions,
      strictness:
        d.strictness === 'pitch-class' || d.strictness === 'inversion' || d.strictness === 'exact'
          ? d.strictness
          : DEFAULT_SETTINGS.drill.strictness,
    };
  }
  return out;
}
