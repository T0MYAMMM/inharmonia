import { synthesize, type Fixture, type FixtureSpec } from './fixtures';
import type { NoteEvent, QuantizeOptions } from './types';
import { draftMelody, VoiceTranscriber } from './voice';

export const ONSET_TOLERANCE_SEC = 0.05;

export interface FixtureScore {
  id: string;
  notes: number;
  detected: number;
  /** Onset precision, recall and F1 within ±50 ms. */
  precision: number;
  recall: number;
  f1: number;
  /** Of the matched notes, the fraction within half a semitone. */
  pitchAccuracy: number;
  /** Mean |onset error| of matched notes, ms. */
  meanOnsetMs: number;
  keyCorrect: boolean;
  /** The right key is one of the top two candidates (the UI offers both). */
  keyTop2: boolean;
  /** Fraction of intended grid notes found at the right beat with the right pitch class. */
  gridAccuracy: number;
}

/** Match detected onsets to the truth one-to-one, nearest first, within the tolerance. */
export function matchOnsets(
  truth: readonly NoteEvent[],
  detected: readonly NoteEvent[],
  tol = ONSET_TOLERANCE_SEC,
) {
  const pairs: { t: number; d: number; err: number }[] = [];
  truth.forEach((t, ti) =>
    detected.forEach((d, di) => {
      const err = Math.abs(d.start - t.start);
      if (err <= tol) pairs.push({ t: ti, d: di, err });
    }),
  );
  pairs.sort((a, b) => a.err - b.err);
  const usedT = new Set<number>();
  const usedD = new Set<number>();
  const matches: typeof pairs = [];
  for (const p of pairs) {
    if (usedT.has(p.t) || usedD.has(p.d)) continue;
    usedT.add(p.t);
    usedD.add(p.d);
    matches.push(p);
  }
  return matches;
}

function quantizeFor(spec: FixtureSpec): QuantizeOptions {
  const beats = spec.notes.map((n) => n.beats);
  const triplets = beats.some(
    (b) => Math.abs(b * 3 - Math.round(b * 3)) < 1e-6 && Math.abs(b * 2 - Math.round(b * 2)) > 1e-6,
  );
  const step = beats.some(
    (b) => Math.abs(b * 4 - Math.round(b * 4)) < 1e-6 && Math.abs(b * 2 - Math.round(b * 2)) > 1e-6,
  )
    ? 0.25
    : 0.5;
  return { step, triplets, tolerance: 0.35 };
}

export function scoreFixture(fx: Fixture, transcriber = new VoiceTranscriber()): FixtureScore {
  const frames = transcriber.frames(fx.audio);
  const detected = transcriber.transcribeFrames(frames);
  const matches = matchOnsets(fx.truth, detected);
  const precision = detected.length ? matches.length / detected.length : 0;
  const recall = fx.truth.length ? matches.length / fx.truth.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const pitchOk = matches.filter(
    (m) => Math.abs(detected[m.d]!.pitch - fx.truth[m.t]!.pitch) < 0.5,
  ).length;
  const draft = draftMelody(detected, fx.timing, { quantize: quantizeFor(fx.spec) });
  const k = fx.spec.key;
  const keyCorrect = draft.key.tonic === k.tonic && draft.key.mode === k.mode;
  const keyTop2 = draft.keys.slice(0, 2).some((c) => c.tonic === k.tonic && c.mode === k.mode);
  const gridHits = fx.grid.filter((g) =>
    draft.grid.notes.some(
      (n) => Math.abs(n.startBeat - g.startBeat) < 1e-6 && (n.midi - g.midi) % 12 === 0,
    ),
  ).length;
  return {
    id: fx.spec.id,
    notes: fx.truth.length,
    detected: detected.length,
    precision,
    recall,
    f1,
    pitchAccuracy: matches.length ? pitchOk / matches.length : 0,
    meanOnsetMs: matches.length
      ? (1000 * matches.reduce((s, m) => s + m.err, 0)) / matches.length
      : NaN,
    keyCorrect,
    keyTop2,
    gridAccuracy: fx.grid.length ? gridHits / fx.grid.length : 0,
  };
}

export function scoreAll(specs: readonly FixtureSpec[]): FixtureScore[] {
  return specs.map((s) => scoreFixture(synthesize(s)));
}
