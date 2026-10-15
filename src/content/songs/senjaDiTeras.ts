import {
  DEFAULT_RULES,
  LESSON_SCHEMA_VERSION,
  type Bar,
  type Lesson,
  type VoicingSpec,
} from '@/core/content/types';

/**
 * Senja di Teras, an original piece written for Inharmonia.
 * D major, 4/4, 16 bars. Left hand: 8th-note arpeggio of each chord's 4-note voicing.
 */

/**
 * Left-hand voicings, lowest first.
 * A and D come from the prototype's VOICINGS table. The others are provisional
 * until reference/senja-di-teras.html is in the repo; that table is the source of truth.
 */
const VOICINGS: Record<string, VoicingSpec> = {
  A: { notes: ['A1', 'E2', 'A2', 'C#3'] },
  D: { notes: ['D2', 'A2', 'D3', 'F#3'] },
};

const PROVISIONAL: VoicingSpec = { style: 'close', floor: 'D2' };

const voicing = (symbol: string): VoicingSpec => VOICINGS[symbol] ?? PROVISIONAL;

/** Chords per bar; two chords in a bar split it 2 + 2. */
const CHORDS: string[][] = [
  ['Dmaj7'],
  ['Bm7'],
  ['Em7'],
  ['A7sus4', 'A7'],
  ['Dmaj7'],
  ['Bm7'],
  ['Gmaj7'],
  ['A7sus4', 'A7'],
  ['Gmaj7'],
  ['A'],
  ['F#m7'],
  ['Bm7'],
  ['Gmaj7'],
  ['A/C#'],
  ['Em7', 'A7'],
  ['D'],
];

/** Melody as note:beats per bar. */
const MELODY = [
  'A4:1 F#4:.5 E4:.5 F#4:1 A4:1',
  'B4:1.5 A4:.5 F#4:1 D4:1',
  'E4:.5 F#4:.5 G4:1 B4:1 A4:1',
  'G4:1 F#4:1 E4:2',
  'A4:1 F#4:.5 E4:.5 F#4:1 D5:1',
  'C#5:1 B4:.5 A4:.5 F#4:2',
  'G4:.5 A4:.5 B4:1 A4:.5 G4:.5 F#4:1',
  'E4:1 G4:1 A4:2',
  'D5:1.5 C#5:.5 B4:1 A4:1',
  'C#5:1.5 B4:.5 A4:1 E4:1',
  'F#4:.5 A4:.5 C#5:1 E5:1 C#5:1',
  'D5:2 B4:1 A4:1',
  'B4:1 D5:1 E5:1 D5:1',
  'C#5:1 A4:1 E5:1.5 D5:.5',
  'B4:1 A4:.5 G4:.5 F#4:1 E4:1',
  'F#4:1 E4:1 D4:2',
];

const parseMelody = (bar: string) =>
  bar.split(' ').map((tok) => {
    const [note, beats] = tok.split(':') as [string, string];
    return { note, beats: Number(beats) };
  });

const bars: Bar[] = CHORDS.map((symbols, i) => ({
  chords: symbols.map((symbol) => ({
    symbol,
    beats: 4 / symbols.length,
    voicing: voicing(symbol),
  })),
  rh: parseMelody(MELODY[i]!),
  ...(i === 0 ? { section: 'A' } : i === 8 ? { section: 'B' } : {}),
}));

export const SENJA_DI_TERAS: Lesson = {
  id: 'senja-di-teras',
  schemaVersion: LESSON_SCHEMA_VERSION,
  title: 'Senja di Teras',
  summary: 'A gentle ballad in D major with a broken-chord left hand.',
  kind: 'song',
  source: { kind: 'original', author: 'Inharmonia' },
  key: { tonic: 'D', mode: 'major' },
  meter: { beats: 4, unit: 4 },
  tempo: { default: 76, min: 50, max: 110 },
  lhPattern: 'arpeggio-8ths',
  rules: DEFAULT_RULES,
  bars,
  tags: ['song', 'ballad'],
};
