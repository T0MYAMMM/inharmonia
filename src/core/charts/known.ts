import { Chord } from 'tonal';
import { NO_CHORD } from '../content/types';
import { CHORD_QUALITIES, chroma, parseChord } from '../theory';

/** One chord in the known-chords profile. */
export interface KnownEntry {
  /** Set by hand; it always wins over plays. */
  manual?: boolean;
  /** Local days ("YYYY-MM-DD") of clean plays, oldest first, one per play. */
  plays: string[];
}

/** Known after this many clean plays spread over at least this many different days. */
export const KNOWN_RULE = { plays: 3, days: 2, keep: 12 } as const;

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const SUFFIX_BY_TYPE = new Map<string, string>([
  ...CHORD_QUALITIES.map((q) => [Chord.get(`C${q.suffix}`).type, q.suffix] as [string, string]),
  [Chord.get('CmM7').type, 'mM7'],
  [Chord.get('Cm6').type, 'm6'],
]);

/**
 * One id per chord the hand plays: enharmonic roots share an id (A# = Bb),
 * spellings share an id (CM7 = Cmaj7), and a slash bass is left out because
 * the right hand plays the same shape. Null for N.C. and unreadable symbols.
 */
export function chordId(symbol: string): string | null {
  if (symbol === NO_CHORD) return null;
  try {
    const info = parseChord(symbol);
    const type = Chord.get(`C${info.suffix}`).type;
    const suffix = SUFFIX_BY_TYPE.get(type) ?? info.suffix;
    return `${ROOTS[chroma(info.root)]}${suffix}`;
  } catch {
    return null;
  }
}

/** Manual marks win; otherwise 3 clean plays on 2 or more different days. */
export function isKnownEntry(entry: KnownEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.manual !== undefined) return entry.manual;
  return entry.plays.length >= KNOWN_RULE.plays && new Set(entry.plays).size >= KNOWN_RULE.days;
}

/** Add one clean play on `day`, keeping the most recent few. */
export function withPlay(entry: KnownEntry | undefined, day: string): KnownEntry {
  const plays = [...(entry?.plays ?? []), day].slice(-KNOWN_RULE.keep);
  return { ...(entry?.manual !== undefined ? { manual: entry.manual } : {}), plays };
}

/** "2 of 3 clean plays, 1 of 2 days" while it is being learned. */
export function knownProgress(entry: KnownEntry | undefined): { plays: number; days: number } {
  const plays = entry?.plays ?? [];
  return {
    plays: Math.min(plays.length, KNOWN_RULE.plays),
    days: Math.min(new Set(plays).size, KNOWN_RULE.days),
  };
}

/** Local calendar day of a date, "YYYY-MM-DD". */
export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
