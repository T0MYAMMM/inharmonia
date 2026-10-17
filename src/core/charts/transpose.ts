import { Note, Scale } from 'tonal';
import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import { NO_CHORD } from '../content/types';
import { chroma, intervalBetween, parseChord, transposePc, type Mode } from '../theory';

export interface Key {
  tonic: string;
  mode: Mode;
}

/** The key `semitones` away, spelled the usual way (Eb major, not D# major). */
export function transposeKey(key: Key, semitones: number): Key {
  const list: readonly string[] = key.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  const pc = (((chroma(key.tonic) + semitones) % 12) + 12) % 12;
  return { tonic: list[pc]!, mode: key.mode };
}

const AWKWARD = new Set(['Cb', 'Fb', 'E#', 'B#']);

/**
 * Respell double sharps and flats, and Cb, Fb, E# and B# outside the key's own
 * scale, as their plain neighbour: bVI in Eb reads B rather than Cb, while IV in
 * Gb stays Cb.
 */
function plain(pc: string, scale: ReadonlySet<string>): string {
  if (/##|bb/.test(pc)) return Note.enharmonic(pc);
  return AWKWARD.has(pc) && !scale.has(pc) ? Note.enharmonic(pc) : pc;
}

/**
 * Move a chord from one key to another by the interval between the tonics, so
 * each chord keeps its function and is spelled for the new key: V in C (G)
 * becomes Bb in Eb, and a borrowed bVII stays a flat seven.
 */
export function transposeChord(
  symbol: string,
  from: string,
  to: string,
  mode: Mode = 'major',
): string {
  if (symbol === NO_CHORD || chroma(from) === chroma(to)) return symbol;
  const info = parseChord(symbol);
  const iv = intervalBetween(from, to);
  const scale = new Set(Scale.get(`${to} ${mode}`).notes);
  const root = plain(transposePc(info.root, iv), scale);
  const bass = info.bass ? plain(transposePc(info.bass, iv), scale) : null;
  return `${root}${info.suffix}${bass ? `/${bass}` : ''}`;
}

/** "3 semitones lower", "5 semitones higher", "1 semitone higher" or "original key". */
export function shiftLabel(semitones: number): string {
  if (semitones === 0) return 'original key';
  const n = Math.abs(semitones);
  return `${n} semitone${n === 1 ? '' : 's'} ${semitones < 0 ? 'lower' : 'higher'}`;
}

/** Keep a shift within -6..+5 semitones: the nearest way to reach that key. */
export function nearestShift(semitones: number): number {
  const s = (((semitones % 12) + 12) % 12) as number;
  return s > 5 ? s - 12 : s;
}
