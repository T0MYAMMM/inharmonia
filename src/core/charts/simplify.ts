import { chroma, isValidChord, parseChord } from '../theory';
import { NO_CHORD } from '../content/types';
import type { SimplifyLevel } from './types';

export interface SimpleChord {
  /** What the right hand plays and the chart shows. */
  symbol: string;
  /** A slash bass the left hand keeps although the symbol drops it (Simplified). */
  bass?: string;
}

/** The suffix of the plain triad: major, minor, diminished or augmented. Sus becomes major. */
function triadSuffix(iv: ReadonlySet<string>): string {
  if (iv.has('3m')) return iv.has('5d') ? 'dim' : 'm';
  if (iv.has('3M')) return iv.has('5A') ? 'aug' : '';
  return '';
}

/** Down to a seventh (or sixth) chord at most; sus resolved to the plain triad. */
function seventhSuffix(iv: ReadonlySet<string>): string {
  const triad = triadSuffix(iv);
  const m7 = iv.has('7m');
  const M7 = iv.has('7M');
  const six = iv.has('6M') && !m7 && !M7;
  switch (triad) {
    case 'dim':
      return iv.has('7d') ? 'dim7' : m7 ? 'm7b5' : 'dim';
    case 'm':
      return m7 ? 'm7' : M7 ? 'mM7' : six ? 'm6' : 'm';
    case 'aug':
      return m7 ? '7#5' : M7 ? 'maj7#5' : 'aug';
    default:
      return m7 ? '7' : M7 ? 'maj7' : six ? '6' : '';
  }
}

const sameChord = (a: string, b: string) => {
  const set = (s: string) =>
    parseChord(s)
      .tones.map((t) => chroma(t))
      .sort((x, y) => x - y)
      .join(',');
  return set(a) === set(b);
};

/**
 * A chord at a simplify level. Original keeps it as written. Simplified takes
 * extensions down to sevenths, resolves sus to the plain triad and drops the
 * slash from the symbol, while the left hand keeps the slash bass. Basic plays
 * triads only (diminished stays diminished) and drops the slash bass too.
 * Spellings the user wrote are kept when the level does not change the chord.
 */
export function simplifyChord(symbol: string, level: SimplifyLevel): SimpleChord {
  if (level === 'original' || symbol === NO_CHORD) return { symbol };
  let info;
  try {
    info = parseChord(symbol);
  } catch {
    return { symbol };
  }
  const iv = new Set(info.intervals);
  const suffix = level === 'basic' ? triadSuffix(iv) : seventhSuffix(iv);
  const main = `${info.root}${info.suffix}`;
  let out = `${info.root}${suffix}`;
  if (!isValidChord(out) || sameChord(out, main)) out = main;
  const keepBass = level === 'simplified' && info.bass && chroma(info.bass) !== chroma(info.root);
  return keepBass ? { symbol: out, bass: info.bass! } : { symbol: out };
}

/** How hard a chord is to read and play: 0 for a triad, more for sevenths, extensions, sus and slashes. */
export function chordComplexity(symbol: string): number {
  if (symbol === NO_CHORD) return 0;
  let info;
  try {
    info = parseChord(symbol);
  } catch {
    return 3;
  }
  const iv = new Set(info.intervals);
  let score = Math.max(0, info.intervals.length - 3);
  if (!iv.has('3m') && !iv.has('3M')) score += 0.5;
  if (iv.has('5d') || iv.has('5A')) score += 0.5;
  if (info.bass && chroma(info.bass) !== chroma(info.root)) score += 0.5;
  return score;
}
