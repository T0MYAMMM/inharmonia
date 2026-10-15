import type { PatternSpec } from '@/core/content/types';

/**
 * Left-hand patterns. Voice indexes point into the chord's voicing, lowest first.
 * The phase 4 library adds block chords, Alberti, stride and the rest.
 */
export const ARPEGGIO_8THS: PatternSpec = {
  id: 'arpeggio-8ths',
  name: 'Broken chord in 8ths',
  cycleBeats: 4,
  // 1-2-3-4-3-2-3-4, each note held until the chord changes (pedal feel).
  // The first note of each chord segment is accented (levels in config/mix.ts).
  steps: [0, 1, 2, 3, 2, 1, 2, 3].map((v, i) => ({
    at: i * 0.5,
    dur: 'chord' as const,
    voices: [v],
    accent: i === 0,
  })),
};

export const PATTERNS: Readonly<Record<string, PatternSpec>> = {
  [ARPEGGIO_8THS.id]: ARPEGGIO_8THS,
};
