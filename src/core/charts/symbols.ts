import { NO_CHORD } from '../content/types';
import { isValidChord, normalizeAccidentals } from '../theory';

export { NO_CHORD };

const ROOT = '[A-G](?:##|bb|#|b)?';
/** Looks like a chord symbol: an upper-case root, then anything but spaces. */
const CHORD_SHAPE = new RegExp(`^${ROOT}[^\\s]*$`);

/**
 * Turn the ways people write chords into a symbol the theory module reads.
 * Returns null when it is not a chord. Only spellings that need it are
 * rewritten, so "CM7" and "C-" stay as written.
 *
 * - accidentals: ♯ ♭ → # b
 * - △7, Δ7, △, Δ, MA7 → maj7; ø7, ø → m7b5; mi7 → m7; m(maj7), mmaj7 → mM7
 * - 7-5, 7-9, 7+5, 7+9 → 7b5, 7b9, 7#5, 7#9
 * - parentheses dropped: C7(b9) → C7b9, C(add9) → Cadd9
 * - 6/9 → 69 (not a slash chord)
 * - N.C., NC, n.c. → N.C.
 */
export function normalizeChord(token: string): string | null {
  const t = token.trim();
  if (/^n\.?\s?c\.?$/i.test(t)) return NO_CHORD;
  let s = normalizeAccidentals(t);
  if (!CHORD_SHAPE.test(s)) return null;
  // A bare "o" for diminished ("Go") is far more often a word; write "G°" or "Gdim".
  if (/^[A-G](?:##|bb|#|b)?o$/.test(s)) return null;
  s = s
    .replace(/6\/9/g, '69')
    .replace(/[()]/g, '')
    .replace(/[△Δ]7?/g, 'maj7')
    .replace(/ø7?/g, 'm7b5')
    .replace(/^([A-G](?:##|bb|#|b)?)MA(?=\d|$)/, '$1maj')
    .replace(/^([A-G](?:##|bb|#|b)?)mi(?=\d|$)/, '$1m')
    .replace(/^([A-G](?:##|bb|#|b)?)mmaj/, '$1mM')
    .replace(/([0-9])-(5|9|13)/g, '$1b$2')
    .replace(/([0-9])\+(5|9|11)/g, '$1#$2');
  return isValidChord(s) ? s : null;
}

/** Is this token a chord (or N.C.) as written? */
export function isChordToken(token: string): boolean {
  return normalizeChord(token) !== null;
}
