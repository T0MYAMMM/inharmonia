import { spellInKey } from '../notation';
import type { GridNote, NoteEvent, QuantizeOptions, TakeTiming } from './types';

export const DEFAULT_QUANTIZE: QuantizeOptions = { step: 0.5, triplets: false, tolerance: 0.35 };

/** Grid points within one beat, in beats. */
export function gridPoints(opts: Pick<QuantizeOptions, 'step' | 'triplets'>): number[] {
  const pts = new Set<number>();
  for (let x = 0; x < 1 - 1e-9; x += opts.step) pts.add(Math.round(x * 1e6) / 1e6);
  if (opts.triplets) {
    const t = opts.step === 0.25 ? 6 : 3;
    for (let k = 0; k < t; k++) pts.add(Math.round((k / t) * 1e6) / 1e6);
  }
  return [...pts].sort((a, b) => a - b);
}

/** Nearest grid position to a beat, and how far it was, in beats. */
function snap(beat: number, points: readonly number[]): { at: number; off: number } {
  const whole = Math.floor(beat);
  let best = { at: whole, off: Math.abs(beat - whole) };
  for (const base of [whole - 1, whole, whole + 1])
    for (const p of points) {
      const at = base + p;
      const off = Math.abs(beat - at);
      if (off < best.off) best = { at, off };
    }
  return best;
}

/** The smallest gap between neighbouring grid points: the shortest note allowed. */
function minStep(points: readonly number[]): number {
  const all = [...points, 1];
  let m = 1;
  for (let i = 1; i < all.length; i++) m = Math.min(m, all[i]! - all[i - 1]!);
  return m;
}

/**
 * Octave shift (in octaves) that puts the most notes inside `range`. A melody
 * that already fits stays where it is.
 */
export function bestOctaveShift(midis: readonly number[], range: [number, number]): number {
  if (!midis.length) return 0;
  const centre = (range[0] + range[1]) / 2;
  const mean = midis.reduce((s, m) => s + m, 0) / midis.length;
  // Fewest notes outside the range; then the smallest move; then the best centred.
  let best = { k: 0, outside: Infinity, move: Infinity, dist: Infinity };
  for (let k = -3; k <= 3; k++) {
    const outside = midis.filter((m) => m + 12 * k < range[0] || m + 12 * k > range[1]).length;
    const move = Math.abs(k);
    const dist = Math.abs(mean + 12 * k - centre);
    const better =
      outside < best.outside ||
      (outside === best.outside && (move < best.move || (move === best.move && dist < best.dist)));
    if (better) best = { k, outside, move, dist };
  }
  return best.k;
}

export interface QuantizeResult {
  notes: GridNote[];
  /** How the timing estimate drifted by the end, in beats (positive: you got later). */
  drift: number;
}

/**
 * Put sung notes on the beat grid. Onsets snap to the nearest grid point after
 * following gentle tempo drift (a running estimate of how late or early you
 * are), ends snap too, notes keep at least one step, the line stays one note at
 * a time, short breaths between notes close up, and pitches round to the
 * nearest semitone and are spelled for the key, after `octaveShift`.
 */
export function quantize(
  events: readonly NoteEvent[],
  timing: TakeTiming,
  key: { tonic: string; mode: 'major' | 'minor' },
  opts: QuantizeOptions = DEFAULT_QUANTIZE,
  octaveShift = 0,
): QuantizeResult {
  const bps = timing.tempo / 60;
  const points = gridPoints(opts);
  const step = minStep(points);
  const totalBeats = timing.bars * timing.meter.beats;
  const toBeat = (sec: number) => (sec - timing.beat0) * bps;

  let offset = 0; // running estimate of lateness, beats
  const raw: GridNote[] = [];
  for (const e of [...events].sort((a, b) => a.start - b.start)) {
    const start = toBeat(e.start) - offset;
    const end = toBeat(e.end) - offset;
    if (end <= -step / 2 || start >= totalBeats) continue;
    const s = snap(start, points);
    // Follow drift slowly, and only from onsets that clearly belong to a grid point.
    if (s.off < step * 0.45) offset += 0.3 * (start - s.at);
    let endAt = snap(end, points).at;
    if (endAt < s.at + step - 1e-9) endAt = s.at + step;
    const startBeat = Math.max(0, s.at);
    const midi = Math.round(e.pitch) + 12 * octaveShift;
    raw.push({
      startBeat,
      beats: Math.min(endAt, totalBeats) - startBeat,
      midi,
      note: spellInKey(midi, { tonic: key.tonic, mode: key.mode }),
      uncertain: s.off > opts.tolerance * step,
    });
  }

  // One note at a time: a note that starts where another does keeps the longer;
  // overlaps trim the earlier note; small gaps close.
  const out: GridNote[] = [];
  for (const n of raw) {
    if (n.beats <= 1e-9) continue;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.startBeat - n.startBeat) < 1e-9) {
      if (n.beats > prev.beats) out[out.length - 1] = n;
      continue;
    }
    if (prev) {
      const prevEnd = prev.startBeat + prev.beats;
      if (prevEnd > n.startBeat + 1e-9) prev.beats = n.startBeat - prev.startBeat;
      else if (n.startBeat - prevEnd < step - 1e-9) prev.beats = n.startBeat - prev.startBeat;
    }
    out.push(n);
  }
  return { notes: out, drift: offset };
}
