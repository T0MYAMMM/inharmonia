import { inversionCount, voiceChord, type VoicingStyle } from './voicing';
import { transposeNote, type SpelledNote } from './pitch';

export interface VoiceLeadOptions {
  style?: VoicingStyle;
  /** Allowed MIDI range for every note of the voicing, inclusive. Default C3..C5 (48..72). */
  range?: [number, number];
}

/**
 * Movement cost between two voicings: the average, over both directions, of the
 * distance from each note to the nearest note of the other chord. This works for
 * chords of different sizes and rewards common tones.
 */
export function movementCost(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const nearest = (x: number, set: readonly number[]) =>
    Math.min(...set.map((y) => Math.abs(x - y)));
  const ab = a.reduce((s, x) => s + nearest(x, b), 0);
  const ba = b.reduce((s, x) => s + nearest(x, a), 0);
  return (ab + ba) / 2;
}

/** Every inversion of the chord in the style, at every octave that fits the range. */
export function candidateVoicings(symbol: string, opts: VoiceLeadOptions = {}): SpelledNote[][] {
  const style = opts.style ?? 'close';
  const [lo, hi] = opts.range ?? [48, 72];
  const out: SpelledNote[][] = [];
  const n = inversionCount(symbol, style);
  for (let inv = 0; inv < n; inv++) {
    const base = voiceChord(symbol, { style, inversion: inv, floor: lo });
    for (let shift = 0; ; shift += 12) {
      const moved = base.map((x) => transposeNote(x, shift));
      if (moved[moved.length - 1]!.midi > hi) break;
      if (moved[0]!.midi >= lo) out.push(moved);
    }
  }
  return out;
}

/**
 * Pick the voicing of `symbol` that moves least from `previous`.
 * Ties go to the voicing whose centre is closest to the previous centre.
 */
export function nearestVoicing(
  previous: readonly number[],
  symbol: string,
  opts: VoiceLeadOptions = {},
): SpelledNote[] {
  const candidates = candidateVoicings(symbol, opts);
  if (candidates.length === 0) return voiceChord(symbol, { style: opts.style ?? 'close' });
  if (previous.length === 0) return candidates[0]!;
  const centre = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const prevCentre = centre(previous);
  let best = candidates[0]!;
  let bestCost = Infinity;
  let bestTie = Infinity;
  for (const c of candidates) {
    const midis = c.map((x) => x.midi);
    const cost = movementCost(previous, midis);
    const tie = Math.abs(centre(midis) - prevCentre);
    if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) < 1e-9 && tie < bestTie)) {
      best = c;
      bestCost = cost;
      bestTie = tie;
    }
  }
  return best;
}

/** Voice a whole progression with smooth voice leading from a starting voicing. */
export function voiceLeadProgression(
  symbols: readonly string[],
  opts: VoiceLeadOptions & { start?: readonly number[] } = {},
): SpelledNote[][] {
  const out: SpelledNote[][] = [];
  let prev: readonly number[] = opts.start ?? [];
  for (const s of symbols) {
    const v =
      prev.length === 0
        ? voiceChord(s, { style: opts.style ?? 'close', floor: opts.range?.[0] ?? 48 })
        : nearestVoicing(prev, s, opts);
    out.push(v);
    prev = v.map((x) => x.midi);
  }
  return out;
}
