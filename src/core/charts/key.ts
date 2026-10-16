import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import { chroma, parseChord, type Mode } from '../theory';
import { NO_CHORD } from './symbols';
import type { ChartSection } from './types';

export interface KeyScore {
  tonic: string;
  mode: Mode;
  /** 0..1: weighted share of chords that belong to the key. */
  score: number;
}

type Quality = 'maj' | 'min' | 'dim' | 'aug' | 'other';

/** Triad quality of each scale degree; minor allows the major V and vii° of harmonic minor. */
const MAJOR_DEGREES: [number, Quality[]][] = [
  [0, ['maj']],
  [2, ['min']],
  [4, ['min']],
  [5, ['maj']],
  [7, ['maj']],
  [9, ['min']],
  [11, ['dim']],
];
const MINOR_DEGREES: [number, Quality[]][] = [
  [0, ['min']],
  [2, ['dim']],
  [3, ['maj']],
  [5, ['min']],
  [7, ['min', 'maj']],
  [8, ['maj']],
  [10, ['maj']],
  [11, ['dim']],
];

function qualityOf(symbol: string): { root: number; quality: Quality } {
  const info = parseChord(symbol);
  const has = (iv: string) => info.intervals.includes(iv);
  const quality: Quality =
    info.family === 'diminished' || (has('3m') && has('5d'))
      ? 'dim'
      : info.family === 'augmented'
        ? 'aug'
        : has('3m')
          ? 'min'
          : has('3M') || info.family === 'suspended' || (has('5P') && !has('3m'))
            ? 'maj'
            : 'other';
  return { root: chroma(info.root), quality };
}

/** How well one chord sits in a key: 1 diatonic, 0.4 root in the scale but another quality, 0 outside. */
function fit(chord: { root: number; quality: Quality }, tonic: number, mode: Mode): number {
  const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;
  const step = (chord.root - tonic + 12) % 12;
  const deg = degrees.find(([s]) => s === step);
  if (!deg) return 0;
  return deg[1].includes(chord.quality) ? 1 : 0.4;
}

/**
 * Rank the 24 keys for a chart. Every chord counts by how diatonic it is, and
 * the first and last chord of each section count three times, with a bonus
 * when they are the key's tonic chord, since songs tend to start and end
 * sections at home. That also tells a major key from its relative minor.
 */
export function suggestKeys(sections: readonly ChartSection[]): KeyScore[] {
  const weighted: { chord: { root: number; quality: Quality }; weight: number; edge: boolean }[] =
    [];
  for (const s of sections) {
    const chords = s.bars.flatMap((b) => b.chords).filter((c) => c.symbol !== NO_CHORD);
    chords.forEach((c, i) => {
      try {
        const edge = i === 0 || i === chords.length - 1;
        weighted.push({ chord: qualityOf(c.symbol), weight: (edge ? 3 : 1) * c.beats, edge });
      } catch {
        /* unknown chords don't vote */
      }
    });
  }
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  const keys: KeyScore[] = [];
  for (const mode of ['major', 'minor'] as const)
    for (const tonic of mode === 'major' ? MAJOR_KEYS : MINOR_KEYS) {
      const t = chroma(tonic);
      let score = 0;
      let bonus = 0;
      for (const w of weighted) {
        score += w.weight * fit(w.chord, t, mode);
        const home = w.chord.root === t && w.chord.quality === (mode === 'major' ? 'maj' : 'min');
        if (w.edge && home) bonus += w.weight * 0.5;
      }
      keys.push({ tonic, mode, score: total ? (score + bonus) / (total * 1.5) : 0 });
    }
  return keys.sort((a, b) => b.score - a.score);
}
