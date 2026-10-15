import type { TimelineEvent } from '@/core/audio';
import { voiceChord, voiceLeadProgression, spelled } from '@/core/theory';

/**
 * A short original exercise for checking timing: Cmaj7 | Am7 | Dm7 | G7 with an
 * 8th-note left-hand arpeggio and a simple right-hand line.
 */
export const DEMO_KEY = { tonic: 'C', mode: 'major' } as const;
export const DEMO_CHORDS = ['Cmaj7', 'Am7', 'Dm7', 'G7'];
export const DEMO_BEATS_PER_BAR = 4;
export const DEMO_LENGTH = DEMO_CHORDS.length * DEMO_BEATS_PER_BAR;

const MELODY: [string, number][][] = [
  [
    ['G4', 1],
    ['E4', 0.5],
    ['F4', 0.5],
    ['G4', 1],
    ['B4', 1],
  ],
  [
    ['C5', 1.5],
    ['B4', 0.5],
    ['A4', 1],
    ['E4', 1],
  ],
  [
    ['F4', 0.5],
    ['G4', 0.5],
    ['A4', 1],
    ['C5', 1],
    ['A4', 1],
  ],
  [
    ['B4', 1],
    ['D5', 1],
    ['G4', 2],
  ],
];

/** Index pattern through a 4-note voicing, one per 8th note: 1-2-3-4-3-2-3-4. */
const ARPEGGIO = [0, 1, 2, 3, 2, 1, 2, 3];

export function buildDemo(): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const voicings = voiceLeadProgression(DEMO_CHORDS, {
    start: voiceChord('Cmaj7', { floor: 'C3' }).map((n) => n.midi),
    range: [45, 62],
  });
  voicings.forEach((voicing, bar) => {
    const barStart = bar * DEMO_BEATS_PER_BAR;
    ARPEGGIO.forEach((idx, i) => {
      const note = voicing[Math.min(idx, voicing.length - 1)]!;
      const at = i * 0.5;
      events.push({
        id: `lh-${bar}-${i}`,
        beat: barStart + at,
        dur: DEMO_BEATS_PER_BAR - at, // sustain to the end of the chord (pedal feel)
        midi: note.midi,
        velocity: idx === 0 ? 0.62 : 0.42,
        channel: 'lh',
      });
    });
    let t = 0;
    MELODY[bar]!.forEach(([name, beats], i) => {
      events.push({
        id: `rh-${bar}-${i}`,
        beat: barStart + t,
        dur: beats,
        midi: spelled(name).midi,
        velocity: 0.72,
        channel: 'rh',
      });
      t += beats;
    });
  });
  return events;
}
