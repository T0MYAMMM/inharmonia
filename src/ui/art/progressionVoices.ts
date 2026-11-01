import type { Mode } from '@/core/theory';
import { romanToChord, voiceLeadProgression } from '@/core/theory';

/**
 * A progression's chords voiced as the progression page plays them (close,
 * voice-led), in C major or A minor, as MIDI numbers. Null if a numeral can't
 * be read: one of your own progressions never breaks the page it's listed on.
 */
export function voicedNumerals(numerals: readonly string[], mode: Mode): number[][] | null {
  if (!numerals.length) return null;
  try {
    const symbols = numerals.map((n) => romanToChord(n, mode === 'minor' ? 'A' : 'C', mode));
    return voiceLeadProgression(symbols, { style: 'close', range: [48, 72] }).map((v) =>
      v.map((n) => n.midi),
    );
  } catch {
    return null;
  }
}
