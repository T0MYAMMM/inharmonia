import { LESSON_SCHEMA_VERSION, type Progression } from '@/core/content/types';

const four = { beats: 4, unit: 4 };
const bar = (numerals: string): Progression['steps'] =>
  numerals.split(/\s+/).flatMap((group) => {
    // "ii7,V7" splits one bar between two chords.
    const parts = group.split(',');
    return parts.map((numeral) => ({ numeral, beats: 4 / parts.length }));
  });

const generic = { kind: 'generic' as const };

/**
 * Common progressions, written key-free as Roman numerals. All are generic
 * theory material; names describe the sound, not any song.
 */
export const PROGRESSIONS: readonly Progression[] = [
  {
    id: 'i-v-vi-iv',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'I–V–vi–IV',
    description: 'The four-chord loop under a great many pop choruses.',
    mode: 'major',
    meter: four,
    steps: bar('I V vi IV'),
    source: generic,
    tags: ['pop'],
  },
  {
    id: 'ii-v-i',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'ii–V–I',
    description: 'The cadence at the heart of jazz harmony.',
    mode: 'major',
    meter: four,
    steps: bar('ii7 V7 Imaj7 Imaj7'),
    source: generic,
    tags: ['jazz'],
  },
  {
    id: 'i-vi-ii-v',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'I–vi–ii–V',
    description: 'A turnaround that leads back to the start.',
    mode: 'major',
    meter: four,
    steps: bar('Imaj7 vi7 ii7 V7'),
    source: generic,
    tags: ['jazz', 'pop'],
  },
  {
    id: 'vi-iv-i-v',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'vi–IV–I–V',
    description: 'The four-chord loop started from the minor chord.',
    mode: 'major',
    meter: four,
    steps: bar('vi IV I V'),
    source: generic,
    tags: ['pop'],
  },
  {
    id: 'twelve-bar-blues',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: '12-bar blues',
    description: 'Twelve bars of dominant sevenths, with a turnaround at the end.',
    mode: 'major',
    meter: four,
    steps: bar('I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7'),
    source: generic,
    tags: ['blues'],
  },
  {
    id: 'minor-descent',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'i–♭VII–♭VI–V',
    description: 'A minor-key descent that lands on the dominant.',
    mode: 'minor',
    meter: four,
    steps: bar('i bVII bVI V7'),
    source: generic,
    tags: ['minor'],
  },
  {
    id: 'iv-v-iii-vi',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'IV–V–iii–vi',
    description: 'A rising, wistful loop that never quite settles on I.',
    mode: 'major',
    meter: four,
    steps: bar('IVmaj7 V7 iii7 vi7'),
    source: generic,
    tags: ['pop', 'ballad'],
  },
  {
    id: 'circle-of-fifths',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'Circle of fifths',
    description: 'Every diatonic seventh chord, each a fifth below the last.',
    mode: 'major',
    meter: four,
    steps: bar('Imaj7 IVmaj7 viiø7 iii7 vi7 ii7 V7 Imaj7'),
    source: generic,
    tags: ['jazz', 'theory'],
  },
  {
    id: 'ballad-doo-wop',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'I–vi–IV–V ballad',
    description: 'A slow, singable loop common in Indonesian pop ballads.',
    mode: 'major',
    meter: four,
    steps: bar('I vi IV V'),
    source: generic,
    tags: ['ballad'],
  },
  {
    id: 'ballad-borrowed-iv',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'Ballad with a borrowed iv',
    description: 'IV turns minor for a bittersweet return home, a favorite in ballads.',
    mode: 'major',
    meter: four,
    steps: bar('Imaj7 I7 IVmaj7 iv6'),
    source: generic,
    tags: ['ballad'],
  },
  {
    id: 'ballad-turnaround',
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: 'Ballad turnaround',
    description: 'From IV down through iii and vi to a suspended V, a common ballad bridge.',
    mode: 'major',
    meter: four,
    steps: bar('IVmaj7 iii7 vi7 ii7 V7sus4,V7 Imaj7'),
    source: generic,
    tags: ['ballad'],
  },
];

export function getProgression(id: string): Progression | undefined {
  return PROGRESSIONS.find((p) => p.id === id);
}
