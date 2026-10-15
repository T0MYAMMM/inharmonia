import { Interval } from 'tonal';
import { bassToneIndex, parseChord } from './chord';
import { chroma, intervalBetween, normalizeAccidentals, transposePc } from './pitch';

export type Mode = 'major' | 'minor';

/**
 * Roman numerals are read against the MAJOR scale of the tonic, in every mode,
 * with explicit accidentals for anything else (the pop/jazz convention).
 * So in A minor, "i ♭VII ♭VI V" is Am G F E.
 */
const MAJOR_DEGREE_INTERVALS = ['1P', '2M', '3M', '4P', '5P', '6M', '7M'] as const;
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

const NUMERAL_RE = /^(bb|b|##|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;

export interface ParsedNumeral {
  accidental: number;
  degree: number;
  upper: boolean;
  suffix: string;
  secondary: ParsedNumeral | null;
}

export function parseNumeral(input: string): ParsedNumeral {
  const s = normalizeAccidentals(input.trim());
  const slash = s.indexOf('/');
  if (slash >= 0) {
    const head = parseNumeral(s.slice(0, slash));
    return { ...head, secondary: parseNumeral(s.slice(slash + 1)) };
  }
  const m = NUMERAL_RE.exec(s);
  if (!m) throw new Error(`Not a Roman numeral: "${input}"`);
  const acc = m[1] ?? '';
  const numeral = m[2]!;
  return {
    accidental: acc.startsWith('#') ? acc.length : -acc.length,
    degree: NUMERALS.indexOf(numeral.toUpperCase() as (typeof NUMERALS)[number]) + 1,
    upper: numeral === numeral.toUpperCase(),
    suffix: m[3] ?? '',
    secondary: null,
  };
}

function degreeRoot(tonic: string, degree: number, accidental: number): string {
  const base = transposePc(tonic, MAJOR_DEGREE_INTERVALS[degree - 1]!);
  if (accidental === 0) return base;
  const shift = accidental > 0 ? '1A' : '-1A';
  let pc = base;
  for (let i = 0; i < Math.abs(accidental); i++) pc = transposePc(pc, shift);
  return pc;
}

/** Map a numeral suffix plus case to a chord-symbol suffix. */
function chordSuffix(upper: boolean, suffix: string): string {
  const s = suffix.replace(/Δ/g, 'maj').replace(/^M7/, 'maj7');
  if (s.startsWith('°') || s.startsWith('o')) return s.slice(1) === '7' ? 'dim7' : 'dim';
  if (s.startsWith('ø')) return 'm7b5';
  if (s.startsWith('+')) return s.slice(1) === '7' ? '7#5' : 'aug';
  if (s === 'dim' || s === 'dim7' || s === 'aug' || s === 'm7b5') return s;
  if (/^(7)?sus[24]/.test(s)) return s;
  if (upper) return s;
  // Lowercase numerals are minor.
  if (s.startsWith('maj')) return `mMaj${s.slice(3)}`;
  if (s === 'add9') return 'madd9';
  return `m${s}`;
}

/** "ii7" in C → "Dm7"; "♭VII" in A minor → "G"; "V7/V" in C → "D7". */
export function romanToChord(numeral: string, key: string, _mode: Mode = 'major'): string {
  const p = parseNumeral(numeral);
  const tonic = p.secondary
    ? parseChord(romanToChord(serialize(p.secondary), key)).root
    : normalizeAccidentals(key);
  const root = degreeRoot(tonic, p.degree, p.accidental);
  const symbol = `${root}${chordSuffix(p.upper, p.suffix)}`;
  parseChord(symbol); // validates
  return symbol;
}

function serialize(p: ParsedNumeral): string {
  const acc = p.accidental > 0 ? '#'.repeat(p.accidental) : 'b'.repeat(-p.accidental);
  const num = NUMERALS[p.degree - 1]!;
  return `${acc}${p.upper ? num : num.toLowerCase()}${p.suffix}`;
}

const FIGURES_TRIAD = ['', '⁶', '⁶₄'];
const FIGURES_SEVENTH = ['7', '⁶₅', '⁴₃', '⁴₂'];

/** Degree label of a pitch class relative to the tonic: "♭7", "3", "♯4". */
export function scaleDegreeOf(tonic: string, pc: string): { degree: number; accidental: number } {
  const iv = Interval.get(intervalBetween(tonic, pc));
  const degree = ((iv.num - 1) % 7) + 1;
  const ref = Interval.semitones(MAJOR_DEGREE_INTERVALS[degree - 1]!) ?? 0;
  let acc = chroma(pc) - chroma(tonic) - ref;
  acc = ((acc + 18) % 12) - 6;
  return { degree, accidental: acc };
}

const ACC_TEXT = (a: number) => (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));

/** Display a chord symbol as a Roman numeral in a key: "F#m7" in D → "iii7". */
export function chordToRoman(symbol: string, key: string, _mode: Mode = 'major'): string {
  const info = parseChord(symbol);
  const tonic = normalizeAccidentals(key);
  const { degree, accidental } = scaleDegreeOf(tonic, info.root);
  const lower = info.family === 'minor' || info.family === 'diminished';
  const numeral = lower ? NUMERALS[degree - 1]!.toLowerCase() : NUMERALS[degree - 1]!;

  let sfx = info.suffix;
  if (sfx === 'm7b5') sfx = 'ø7';
  else if (sfx === 'dim7' || sfx === 'o7') sfx = '°7';
  else if (sfx === 'dim' || sfx === 'o') sfx = '°';
  else if (sfx === 'aug' || sfx === '+') sfx = '+';
  else if (sfx === 'M' || sfx === 'maj') sfx = '';
  else if (lower && sfx.startsWith('mMaj')) sfx = `maj${sfx.slice(4)}`;
  else if (lower && sfx.startsWith('m')) sfx = sfx.slice(1);

  let figure = '';
  const bassIdx = bassToneIndex(info);
  if (bassIdx !== null && bassIdx > 0) {
    const isSeventh = info.tones.length >= 4;
    figure = (isSeventh ? FIGURES_SEVENTH : FIGURES_TRIAD)[bassIdx] ?? '';
    if (isSeventh && /^[ø°]?7$/.test(sfx)) sfx = sfx.replace('7', '');
  } else if (bassIdx === -1 && info.bass) {
    const b = scaleDegreeOf(tonic, info.bass);
    figure = `/${ACC_TEXT(b.accidental)}${b.degree}`;
  }
  return `${ACC_TEXT(accidental)}${numeral}${sfx}${figure}`;
}
