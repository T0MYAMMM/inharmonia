import type { MonoAudio } from './types';

/**
 * Sharp onsets (claps, taps, or the click itself leaking into the mic): times
 * where the energy over 5 ms jumps well above the previous 40 ms. Seconds.
 */
export function detectOnsets(
  audio: MonoAudio,
  opts: { ratio?: number; minDb?: number; refractorySec?: number } = {},
): number[] {
  const { samples, sampleRate } = audio;
  const ratio = opts.ratio ?? 6;
  const minPower = 10 ** ((opts.minDb ?? -40) / 10);
  const refractory = opts.refractorySec ?? 0.12;
  const hop = Math.max(1, Math.round(0.0025 * sampleRate));
  const win = Math.max(1, Math.round(0.005 * sampleRate));
  const power: number[] = [];
  for (let i = 0; i + win <= samples.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += samples[j]! * samples[j]!;
    power.push(s / win);
  }
  const back = Math.round(0.04 / 0.0025);
  const out: number[] = [];
  let last = -Infinity;
  for (let k = back; k < power.length; k++) {
    let prev = 0;
    for (let j = k - back; j < k; j++) prev += power[j]!;
    prev /= back;
    const p = power[k]!;
    if (p < minPower || p < prev * ratio) continue;
    const t = (k * hop) / sampleRate;
    if (t - last < refractory) continue;
    out.push(t);
    last = t;
  }
  return out;
}

export interface LatencyEstimate {
  /** Median delay from a scheduled click to the sound coming back in, ms. */
  latencyMs: number;
  /** Median absolute deviation of the delays, ms: how steady the claps were. */
  spreadMs: number;
  /** How many clicks found a matching onset. */
  matched: number;
  /** Enough steady matches to trust. */
  ok: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Round-trip latency from click times and the onsets heard back: each click
 * takes the first onset between 50 ms early (an eager clap) and 400 ms late.
 */
export function estimateLatency(
  clicks: readonly number[],
  onsets: readonly number[],
  opts: { minMatches?: number; maxSpreadMs?: number } = {},
): LatencyEstimate {
  const delays: number[] = [];
  for (const c of clicks) {
    const o = onsets.find((t) => t >= c - 0.05 && t <= c + 0.4);
    if (o !== undefined) delays.push(o - c);
  }
  if (!delays.length) return { latencyMs: NaN, spreadMs: NaN, matched: 0, ok: false };
  const m = median(delays);
  const spread = median(delays.map((d) => Math.abs(d - m)));
  const minMatches = opts.minMatches ?? 5;
  const maxSpread = (opts.maxSpreadMs ?? 40) / 1000;
  return {
    latencyMs: m * 1000,
    spreadMs: spread * 1000,
    matched: delays.length,
    ok: delays.length >= minMatches && spread <= maxSpread,
  };
}
