import { Chord, Interval } from 'tonal';
import { chroma, normalizeAccidentals, pitchClassName } from './pitch';

export interface ChordInfo {
  /** Symbol as given, normalized to ASCII accidentals ("F#m7", "A/C#"). */
  symbol: string;
  /** Root pitch class ("F#"). */
  root: string;
  /** Text after the root, before any slash ("m7", "", "7sus4"). */
  suffix: string;
  /** Slash bass pitch class, or null. */
  bass: string | null;
  /** Interval names from the root, root position ("1P", "3m", "5P", "7m"). */
  intervals: string[];
  /** Spelled chord tones (pitch classes), root position. */
  tones: string[];
  /** Formula as degrees: ["1", "♭3", "5", "♭7"]. */
  formula: string[];
  /** Interval names in words: ["root", "minor third", ...]. */
  intervalNames: string[];
  /** Tonal's quality family, used for Roman numeral case. */
  family: 'major' | 'minor' | 'diminished' | 'augmented' | 'suspended' | 'other';
}

const SYMBOL_RE = /^([A-Ga-g](?:##|bb|#|b)?)([^/]*)(?:\/([A-Ga-g](?:##|bb|#|b)?))?$/;

export function parseChord(input: string): ChordInfo {
  const symbol = normalizeAccidentals(input.trim());
  const m = SYMBOL_RE.exec(symbol);
  if (!m) throw new Error(`Not a chord symbol: "${input}"`);
  const root = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
  const suffix = m[2] ?? '';
  const bass = m[3] ? m[3].charAt(0).toUpperCase() + m[3].slice(1) : null;
  const chord = Chord.get(`${root}${suffix}`);
  if (chord.empty) throw new Error(`Unknown chord quality "${suffix}" in "${input}"`);
  const intervals = chord.intervals;
  return {
    symbol: `${root}${suffix}${bass ? `/${bass}` : ''}`,
    root,
    suffix,
    bass,
    intervals,
    tones: chord.notes.map((n) => pitchClassName(n)),
    formula: intervals.map(degreeLabel),
    intervalNames: intervals.map(intervalName),
    family: familyOf(chord.quality, intervals),
  };
}

export function isValidChord(symbol: string): boolean {
  try {
    parseChord(symbol);
    return true;
  } catch {
    return false;
  }
}

/** Index of the slash bass among the chord tones, -1 if it is not a chord tone, null if no slash. */
export function bassToneIndex(info: ChordInfo): number | null {
  if (!info.bass) return null;
  const c = chroma(info.bass);
  return info.tones.findIndex((t) => chroma(t) === c);
}

function familyOf(quality: string, intervals: string[]): ChordInfo['family'] {
  if (!intervals.some((i) => i === '3M' || i === '3m')) {
    return intervals.includes('4P') || intervals.includes('2M') ? 'suspended' : 'other';
  }
  switch (quality) {
    case 'Major':
      return 'major';
    case 'Minor':
      return 'minor';
    case 'Diminished':
      return 'diminished';
    case 'Augmented':
      return 'augmented';
    default:
      return 'other';
  }
}

const ALT_SIGN: Record<string, string> = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };

/** "3m" → "♭3", "7M" → "7", "5d" → "♭5", "7d" → "𝄫7", "5A" → "♯5". */
export function degreeLabel(interval: string): string {
  const iv = Interval.get(interval);
  if (iv.empty) throw new Error(`Bad interval ${interval}`);
  // Alteration relative to the major scale (perfect intervals are their own reference).
  const majorRef = [0, 2, 4, 5, 7, 9, 11][(iv.num - 1) % 7]!;
  const octaves = Math.floor((iv.num - 1) / 7);
  const alt = iv.semitones - (majorRef + 12 * octaves);
  return `${ALT_SIGN[String(alt)] ?? ''}${iv.num}`;
}

const NUM_NAMES: Record<number, string> = {
  1: 'root',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'octave',
  9: 'ninth',
  11: 'eleventh',
  13: 'thirteenth',
};
const Q_NAMES: Record<string, string> = {
  M: 'major',
  m: 'minor',
  P: 'perfect',
  d: 'diminished',
  A: 'augmented',
  dd: 'doubly diminished',
  AA: 'doubly augmented',
};

export function intervalName(interval: string): string {
  const iv = Interval.get(interval);
  if (iv.num === 1 && iv.q === 'P') return 'root';
  const num = NUM_NAMES[iv.num] ?? `${iv.num}th`;
  return `${Q_NAMES[iv.q] ?? iv.q} ${num}`;
}
