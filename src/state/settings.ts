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
  /** The player's volume, decibels; 0 is the normal level. */
  volumeDb: number;
  metronome: boolean;
  countInBars: number;
  midiInput: string;
  /** Reconnect MIDI on load once the player has connected it. */
  midiEnabled: boolean;
  drill: DrillSettings;
  /** The home page's first-visit welcome has been dismissed. */
  welcomeDismissed: boolean;
  /** Round-trip delay from click to microphone, measured in the Studio; null until calibrated. */
  inputLatencyMs: number | null;
  studio: StudioSettings;
}

export interface StudioSettings {
  tempo: number;
  /** Beats per bar; the beat is a quarter note. */
  beatsPerBar: 2 | 3 | 4;
  bars: number;
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
  volumeDb: 0,
  metronome: false,
  countInBars: 0,
  midiInput: 'all',
  midiEnabled: false,
  welcomeDismissed: false,
  inputLatencyMs: null,
  studio: { tempo: 80, beatsPerBar: 4, bars: 8 },
  drill: {
    qualityIds: ['major', 'minor'],
    naturalsOnly: true,
    inversions: false,
    strictness: 'pitch-class',
  },
};

/** The volume slider's range, decibels. */
export const VOLUME_RANGE = { min: -24, max: 6 } as const;

/** Version 2: volume became relative to a louder master, so the old -4 default resets to 0. */
export const SETTINGS_VERSION = 2;

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
      migrate: (persisted, version) => {
        if (version < 2 && typeof persisted === 'object' && persisted !== null)
          return { ...persisted, volumeDb: DEFAULT_SETTINGS.volumeDb };
        return persisted;
      },
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
  if (
    typeof p.volumeDb === 'number' &&
    p.volumeDb >= VOLUME_RANGE.min &&
    p.volumeDb <= VOLUME_RANGE.max
  )
    out.volumeDb = p.volumeDb;
  if (typeof p.metronome === 'boolean') out.metronome = p.metronome;
  if (typeof p.countInBars === 'number' && p.countInBars >= 0 && p.countInBars <= 2)
    out.countInBars = p.countInBars;
  if (typeof p.midiInput === 'string') out.midiInput = p.midiInput;
  if (typeof p.midiEnabled === 'boolean') out.midiEnabled = p.midiEnabled;
  if (typeof p.welcomeDismissed === 'boolean') out.welcomeDismissed = p.welcomeDismissed;
  if (
    p.inputLatencyMs === null ||
    (typeof p.inputLatencyMs === 'number' && p.inputLatencyMs >= 0 && p.inputLatencyMs < 1000)
  )
    out.inputLatencyMs = p.inputLatencyMs;
  const st = p.studio as Partial<StudioSettings> | undefined;
  if (st && typeof st === 'object') {
    const d = DEFAULT_SETTINGS.studio;
    out.studio = {
      tempo: typeof st.tempo === 'number' && st.tempo >= 40 && st.tempo <= 160 ? st.tempo : d.tempo,
      beatsPerBar:
        st.beatsPerBar === 2 || st.beatsPerBar === 3 || st.beatsPerBar === 4
          ? st.beatsPerBar
          : d.beatsPerBar,
      bars:
        typeof st.bars === 'number' && st.bars >= 1 && st.bars <= 32 ? Math.round(st.bars) : d.bars,
    };
  }
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
