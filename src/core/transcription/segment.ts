import type { NoteEvent, PitchFrame } from './types';

/** Every threshold segmentation uses, in one place for tuning (see `npm run eval:transcription`). */
export const SEGMENT_CONFIG = {
  /** Frames below this clarity are treated as unpitched. */
  minClarity: 0.85,
  /** Frames quieter than this (dBFS) are silence. */
  minDb: -48,
  /** Frames more than this far (dB) below the take's loudest frame are silence. */
  maxDbBelowPeak: 32,
  /** Median filter length over the pitch curve, frames (odd). */
  medianFrames: 5,
  /**
   * Splits are judged on the pitch curve averaged over this many frames, about
   * one vibrato cycle, so vibrato reads as one steady pitch.
   */
  smoothFrames: 21,
  /** A smoothed pitch more than this many semitones from the note's centre may start a new note… */
  splitSemitones: 0.6,
  /** …once it has held for this many frames. */
  splitFrames: 4,
  /** How far back (frames) a new note may reach to include the slide into it. */
  glideBackFrames: 20,
  /** Unpitched gaps up to this many frames are bridged (consonants, breathy moments). */
  bridgeFrames: 4,
  /** A loudness dip to this fraction of the note's running peak, then a rise, splits a repeated note. */
  dipRatio: 0.65,
  /** The rise after a dip must reach this multiple of the dip within `riseFrames`. */
  riseRatio: 1.6,
  riseFrames: 6,
  /** Notes shorter than this are dropped (or join a neighbour), seconds. */
  minNoteSec: 0.1,
} as const;

export type SegmentConfig = { -readonly [K in keyof typeof SEGMENT_CONFIG]: number };

const dbOf = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-9));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Which frames carry a usable pitch. */
export function voicedMask(
  frames: readonly PitchFrame[],
  cfg: SegmentConfig = SEGMENT_CONFIG,
): boolean[] {
  const peak = Math.max(...frames.map((f) => dbOf(f.rms)), -120);
  const floor = Math.max(cfg.minDb, peak - cfg.maxDbBelowPeak);
  return frames.map((f) => f.midi !== null && f.clarity >= cfg.minClarity && dbOf(f.rms) >= floor);
}

/**
 * Clean the pitch curve: drop unvoiced frames, fold octave errors back to
 * their neighbours, and median-filter. Returns fractional MIDI or NaN per frame.
 */
export function cleanPitch(
  frames: readonly PitchFrame[],
  cfg: SegmentConfig = SEGMENT_CONFIG,
): number[] {
  const voiced = voicedMask(frames, cfg);
  const raw = frames.map((f, i) => (voiced[i] ? f.midi! : NaN));
  // Octave errors: a frame an octave (±0.7) from the local median folds back.
  const fixed = raw.map((p, i) => {
    if (Number.isNaN(p)) return p;
    const around = raw.slice(Math.max(0, i - 7), i + 8).filter((x) => !Number.isNaN(x));
    if (around.length < 5) return p;
    const m = median(around);
    for (const k of [12, -12, 24, -24]) if (Math.abs(p + k - m) < 0.7) return p + k;
    return p;
  });
  // Median filter within voiced runs only.
  const half = cfg.medianFrames >> 1;
  return fixed.map((p, i) => {
    if (Number.isNaN(p)) return p;
    const win: number[] = [];
    for (let j = i - half; j <= i + half; j++) {
      const v = fixed[j];
      if (v !== undefined && !Number.isNaN(v)) win.push(v);
    }
    return median(win);
  });
}

interface Run {
  from: number;
  to: number; // exclusive
}

/** Centred moving average over voiced frames of a run. */
function smoothRun(pitch: number[], run: Run, width: number): number[] {
  const out = new Array<number>(pitch.length).fill(NaN);
  const half = width >> 1;
  for (let i = run.from; i < run.to; i++) {
    if (Number.isNaN(pitch[i]!)) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(run.from, i - half); j <= Math.min(run.to - 1, i + half); j++) {
      const v = pitch[j]!;
      if (!Number.isNaN(v)) {
        sum += v;
        n++;
      }
    }
    out[i] = sum / n;
  }
  return out;
}

/**
 * Split a voiced run where the pitch moves to a new note and stays. Decisions
 * use the vibrato-smoothed curve; the boundary goes where the smoothed curve
 * crosses halfway to the new pitch, then back to where a slide into it began.
 */
function splitByPitch(pitch: number[], run: Run, cfg: SegmentConfig): Run[] {
  const smooth = smoothRun(pitch, run, cfg.smoothFrames);
  const out: Run[] = [];
  let start = run.from;
  let centre: number[] = [];
  let away = 0;
  // After a split, wait for the smoothed curve to settle on the new note.
  let settle = run.from;
  for (let i = run.from; i < run.to; i++) {
    const p = smooth[i]!;
    if (Number.isNaN(p) || i < settle) continue;
    if (centre.length < 3) {
      centre.push(p);
      continue;
    }
    const c = median(centre);
    if (Math.abs(p - c) <= cfg.splitSemitones) {
      away = 0;
      centre.push(p);
      if (centre.length > 60) centre.shift();
      continue;
    }
    away++;
    if (away < cfg.splitFrames) continue;
    // Where the new pitch settles: the smoothed curve a little further on.
    const ahead = smooth
      .slice(i, Math.min(run.to, i + cfg.smoothFrames))
      .filter((x) => !Number.isNaN(x));
    const target = ahead.length ? median(ahead) : p;
    const mid = (c + target) / 2;
    const up = target > c;
    let at = i;
    while (at > start + 1) {
      const v = smooth[at - 1]!;
      if (Number.isNaN(v) || (up ? v < mid : v > mid)) break;
      at--;
    }
    // Reach back over a slide: raw pitch still moving towards the new note, away from the old.
    for (let k = 0; k < cfg.glideBackFrames && at > start + 1; k++) {
      const a = pitch[at - 1]!;
      const b = pitch[at]!;
      if (Number.isNaN(a) || Number.isNaN(b)) break;
      const moving = up ? b - a > 0.02 : a - b > 0.02;
      if (!moving || Math.abs(a - c) < 0.25) break;
      at--;
    }
    out.push({ from: start, to: at });
    start = at;
    centre = [];
    settle = i + (cfg.smoothFrames >> 1);
    away = 0;
  }
  out.push({ from: start, to: run.to });
  return out.filter((r) => r.to > r.from);
}

/** Split a run where loudness dips and comes back: the same pitch sung again. */
function splitByEnergy(frames: readonly PitchFrame[], run: Run, cfg: SegmentConfig): Run[] {
  const env = frames.slice(run.from, run.to).map((f) => f.rmsShort);
  // Light smoothing so a single quiet frame doesn't count.
  const smooth = env.map(
    (_, i) => (env[Math.max(0, i - 1)]! + env[i]! + env[Math.min(env.length - 1, i + 1)]!) / 3,
  );
  const cuts: number[] = [];
  let peak = 0;
  for (let i = 1; i < smooth.length - 1; i++) {
    peak = Math.max(peak, smooth[i - 1]!);
    const v = smooth[i]!;
    const isMin = v <= smooth[i - 1]! && v <= smooth[i + 1]!;
    if (!isMin || v > peak * cfg.dipRatio) continue;
    const later = smooth.slice(i + 1, i + 1 + cfg.riseFrames);
    if (
      later.length &&
      Math.max(...later) >= v * cfg.riseRatio &&
      Math.max(...later) >= peak * 0.7
    ) {
      cuts.push(run.from + i);
      peak = 0;
    }
  }
  const out: Run[] = [];
  let start = run.from;
  for (const c of cuts) {
    if (c - start >= 3) {
      out.push({ from: start, to: c });
      start = c;
    }
  }
  out.push({ from: start, to: run.to });
  return out;
}

/**
 * Turn a pitch track into notes: voiced runs (bridging short gaps), split where
 * the pitch moves to a new note or the loudness re-attacks, with vibrato and
 * small glides kept inside one note. Notes shorter than `minNoteSec` go.
 */
export function segmentNotes(
  frames: readonly PitchFrame[],
  cfg: SegmentConfig = SEGMENT_CONFIG,
): NoteEvent[] {
  if (frames.length === 0) return [];
  const pitch = cleanPitch(frames, cfg);
  const hop = frames.length > 1 ? frames[1]!.time - frames[0]!.time : 0.01;

  // Voiced runs, bridging gaps up to bridgeFrames.
  const runs: Run[] = [];
  let i = 0;
  while (i < pitch.length) {
    if (Number.isNaN(pitch[i]!)) {
      i++;
      continue;
    }
    const from = i;
    let last = i;
    while (i < pitch.length) {
      if (!Number.isNaN(pitch[i]!)) last = i;
      else if (i - last > cfg.bridgeFrames) break;
      i++;
    }
    runs.push({ from, to: last + 1 });
  }

  const minFrames = Math.ceil(cfg.minNoteSec / hop);
  const notes: NoteEvent[] = [];
  for (const run of runs) {
    const pieces = splitByEnergy(frames, run, cfg).flatMap((r) => splitByPitch(pitch, r, cfg));
    // A piece too short to be a note (the middle of a glide, a scoop) joins the
    // next piece of the same phrase, so the next note starts where the sound did.
    const merged: { span: Run; core: Run }[] = [];
    let carry: number | null = null;
    pieces.forEach((r, k) => {
      const short = r.to - r.from < minFrames;
      if (short && k < pieces.length - 1) {
        carry ??= r.from;
        return;
      }
      if (short && merged.length) {
        merged[merged.length - 1]!.span.to = r.to;
        return;
      }
      merged.push({ span: { from: carry ?? r.from, to: r.to }, core: r });
      carry = null;
    });
    for (const { span, core } of merged) {
      const ps = pitch.slice(core.from, core.to).filter((x) => !Number.isNaN(x));
      if (!ps.length) continue;
      const start = frames[span.from]!.time - hop / 2;
      const end = frames[span.to - 1]!.time + hop / 2;
      if (end - start < cfg.minNoteSec) continue;
      const cl = frames.slice(core.from, core.to).map((f) => f.clarity);
      notes.push({
        start,
        end,
        pitch: median(ps),
        confidence: cl.reduce((s, x) => s + x, 0) / cl.length,
      });
    }
  }
  return notes;
}
