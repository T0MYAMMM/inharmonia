import { NO_CHORD } from '../content/types';
import { chroma } from '../theory';
import { playedChords, viewKey } from './compile';
import { chordId } from './known';
import { chordComplexity } from './simplify';
import { nearestShift, shiftLabel, type Key } from './transpose';
import type { ChartView, ChordChart } from './types';

const BLACK = new Set([1, 3, 6, 8, 10]);

export interface KeyOption {
  /** Semitones from the chart's own key, -6..5. */
  transpose: number;
  key: Key;
  /** "3 semitones lower", "original key". */
  shift: string;
  /** The song's chords in this key, each once, in order of first use. */
  chords: string[];
  /** Of those, the ones not in the known-chords profile. */
  unknown: string[];
  /** Share of chord changes (by time played) on chords you know, 0..1. */
  knownShare: number;
  /** Average black keys per chord in the right-hand voicings and left-hand bass. */
  blackKeys: number;
  /** Average chord complexity (0 = triads). */
  complexity: number;
  /** Higher is easier. */
  score: number;
}

/** Weights of the easy-key score; kept together so the balance is easy to tune. */
export const EASY_KEY_WEIGHTS = {
  known: 4,
  blackKey: 0.6,
  complexity: 0.5,
  /** Per semitone moved, so a key near the original wins a tie. */
  distance: 0.08,
} as const;

/**
 * Score one transposition of the chart for how easy it is to play: how much of
 * it uses chords you know, how many black keys its voicings need, how complex
 * its chords are at the current simplify level, and how far it moves from the
 * written key (a big move may not suit the voice).
 */
export function scoreKey(
  chart: ChordChart,
  view: ChartView,
  transpose: number,
  isKnown: (symbol: string) => boolean,
): KeyOption {
  const v = { ...view, transpose };
  const played = playedChords(chart, v)
    .flat()
    .filter((c) => c.symbol !== NO_CHORD);
  const chords: string[] = [];
  const seen = new Set<string>();
  for (const c of played) {
    const id = chordId(c.symbol) ?? c.symbol;
    if (!seen.has(id)) {
      seen.add(id);
      chords.push(c.symbol);
    }
  }
  const unknown = chords.filter((s) => !isKnown(s));
  const total = played.reduce((s, c) => s + c.beats, 0) || 1;
  const knownBeats = played.filter((c) => isKnown(c.symbol)).reduce((s, c) => s + c.beats, 0);
  const knownShare = knownBeats / total;
  const n = played.length || 1;
  const blackKeys =
    played.reduce((s, c) => {
      const bass = c.bass ?? (c.symbol.includes('/') ? c.symbol.split('/')[1]! : null);
      const bassBlack = bass && BLACK.has(chroma(bass)) ? 1 : 0;
      return s + c.voicing.filter((x) => BLACK.has(chroma(x.midi))).length + bassBlack;
    }, 0) / n;
  const complexity = played.reduce((s, c) => s + chordComplexity(c.symbol), 0) / n;
  const w = EASY_KEY_WEIGHTS;
  const score =
    w.known * knownShare -
    w.blackKey * blackKeys -
    w.complexity * complexity -
    w.distance * Math.abs(transpose);
  return {
    transpose,
    key: viewKey(chart, v),
    shift: shiftLabel(transpose),
    chords,
    unknown,
    knownShare,
    blackKeys,
    complexity,
    score,
  };
}

/** Every key the chart can move to (6 down to 5 up), easiest first. */
export function rankKeys(
  chart: ChordChart,
  view: ChartView,
  isKnown: (symbol: string) => boolean,
): KeyOption[] {
  const out: KeyOption[] = [];
  for (let t = -6; t <= 5; t++) out.push(scoreKey(chart, view, nearestShift(t), isKnown));
  return out.sort((a, b) => b.score - a.score || Math.abs(a.transpose) - Math.abs(b.transpose));
}

/** The three easiest keys for "Find an easier key". */
export function easierKeys(
  chart: ChordChart,
  view: ChartView,
  isKnown: (symbol: string) => boolean,
  count = 3,
): KeyOption[] {
  return rankKeys(chart, view, isKnown).slice(0, count);
}
