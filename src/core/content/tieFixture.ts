import { DEFAULT_RULES, LESSON_SCHEMA_VERSION, type Lesson } from './types';

/**
 * A short original exercise for ties (test data): G4 tied across the barline
 * from bar 1 into bar 2, and A4 tied into the chord change from F to G in bar 2.
 */
export const TIES_LESSON: Lesson = {
  id: 'ties',
  schemaVersion: LESSON_SCHEMA_VERSION,
  title: 'Ties',
  kind: 'song',
  source: { kind: 'generic' },
  key: { tonic: 'C', mode: 'major' },
  meter: { beats: 4, unit: 4 },
  tempo: { default: 80, min: 40, max: 120 },
  rules: DEFAULT_RULES,
  bars: [
    {
      chords: [{ symbol: 'C', beats: 4 }],
      rh: [
        { note: 'C4', beats: 1 },
        { note: 'E4', beats: 1 },
        { note: 'G4', beats: 2, tie: true },
      ],
    },
    {
      chords: [
        { symbol: 'F', beats: 2 },
        { symbol: 'G', beats: 2 },
      ],
      rh: [
        { note: 'G4', beats: 1 },
        { note: 'A4', beats: 1, tie: true },
        { note: 'A4', beats: 1 },
        { note: 'B4', beats: 1 },
      ],
    },
    { chords: [{ symbol: 'C', beats: 4 }], rh: [{ note: 'C5', beats: 4 }] },
  ],
};
