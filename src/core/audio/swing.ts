/**
 * Swing as a monotonic warp of beat positions.
 *
 * Within each pair of `unit`-long subdivisions (8ths by default), the off-beat moves
 * from the halfway point toward the triplet position. `amount` 0 is straight,
 * 1 is full triplet swing (2:1). Pair boundaries are fixed points, so swing never
 * shifts downbeats and durations stay consistent.
 */
export function swingBeat(beat: number, amount: number, unit = 0.5): number {
  if (amount <= 0) return beat;
  const a = Math.min(1, amount);
  const pair = unit * 2;
  const start = Math.floor(beat / pair + 1e-9) * pair;
  const p = beat - start;
  const split = unit * (1 + a / 3);
  const warped = p < unit ? (p * split) / unit : split + ((p - unit) * (pair - split)) / unit;
  return start + warped;
}
