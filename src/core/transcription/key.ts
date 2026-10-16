import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import { chroma } from '../theory';

/** Krumhansl–Kessler key profiles (probe-tone ratings), from the tonic up. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface KeyCandidate {
  tonic: string;
  mode: 'major' | 'minor';
  /** Pearson correlation with the profile, -1..1. */
  score: number;
}

function correlate(a: readonly number[], b: readonly number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Duration-weighted pitch-class profile: how long each of the 12 pitch classes sounds. */
export function pitchClassProfile(notes: readonly { midi: number; weight: number }[]): number[] {
  const pcp = new Array<number>(12).fill(0);
  for (const n of notes) pcp[((Math.round(n.midi) % 12) + 12) % 12]! += n.weight;
  return pcp;
}

/**
 * Krumhansl–Schmuckler key finding: correlate the melody's pitch-class profile
 * with each of the 24 rotated key profiles. Best first. Tonic names use the
 * usual key spellings (E♭ major, C♯ minor).
 */
export function detectKey(notes: readonly { midi: number; weight: number }[]): KeyCandidate[] {
  const pcp = pitchClassProfile(notes);
  const out: KeyCandidate[] = [];
  for (const [mode, keys, profile] of [
    ['major', MAJOR_KEYS, MAJOR_PROFILE],
    ['minor', MINOR_KEYS, MINOR_PROFILE],
  ] as const) {
    for (const tonic of keys) {
      const t = chroma(tonic);
      const rotated = profile.map((_, i) => profile[(i - t + 12) % 12]!);
      out.push({ tonic, mode, score: correlate(pcp, rotated) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
