import { prettyNumeral } from '../notation';
import { chroma, parseChord, romanToChord, type Mode } from '../theory';
import type { ChordEstimator, ChordSegment } from './interfaces';
import type { TakeTiming } from './types';

/** A melody note on the beat grid (beats from bar 1, beat 1). */
export interface MelodyNote {
  startBeat: number;
  beats: number;
  midi: number;
}

export type HarmonyStyleId = 'simple' | 'diatonic' | 'colour';

/** One way to harmonize: which chords it may use and how often they may change. */
export interface HarmonyStyle {
  id: HarmonyStyleId;
  name: string;
  /** One line on what it sounds like, shown with the suggestion. */
  blurb: string;
  numerals: Record<Mode, readonly string[]>;
  /** Chord changes allowed per bar (2 only where the meter splits evenly). */
  changesPerBar: 1 | 2;
}

export const HARMONY_STYLES: readonly HarmonyStyle[] = [
  {
    id: 'simple',
    name: 'Simple',
    blurb:
      'The three main chords of the key, one per bar. The easiest to play, and a good place to start.',
    numerals: { major: ['I', 'IV', 'V'], minor: ['i', 'iv', 'V'] },
    changesPerBar: 1,
  },
  {
    id: 'diatonic',
    name: 'In the key',
    blurb: 'All the chords of the key, one per bar, so the harmony can follow the melody closely.',
    numerals: {
      major: ['I', 'ii', 'iii', 'IV', 'V', 'vi'],
      minor: ['i', 'bIII', 'iv', 'v', 'V', 'bVI', 'bVII'],
    },
    changesPerBar: 1,
  },
  {
    id: 'colour',
    name: 'Colourful',
    blurb:
      'Sevenths, chords that lean into the next one, and a borrowed chord or two, changing up to twice a bar.',
    numerals: {
      major: [
        'I',
        'Imaj7',
        'ii7',
        'iii7',
        'IV',
        'IVmaj7',
        'V',
        'V7',
        'vi',
        'vi7',
        'V7/V',
        'V7/vi',
        'V7/ii',
        'iv',
        'bVII',
      ],
      minor: ['i', 'i7', 'iiø7', 'bIIImaj7', 'iv7', 'V', 'V7', 'bVImaj7', 'bVII', 'bVII7', 'V7/iv'],
    },
    changesPerBar: 2,
  },
];

type Fn = 'T' | 'S' | 'D';

interface Candidate {
  numeral: string;
  symbol: string;
  root: number;
  tones: ReadonlySet<number>;
  fn: Fn;
  /** Secondary dominant: the numeral it resolves to. */
  target: string | null;
  /** How much rarer or richer than a plain diatonic triad. */
  cost: number;
}

/** A chord in a harmonization, with why it was chosen. */
export interface HarmonyChord {
  startBeat: number;
  beats: number;
  symbol: string;
  numeral: string;
  /** Plain words: which melody notes it holds, or what it does. */
  why: string;
}

export interface Harmonization {
  style: HarmonyStyleId;
  name: string;
  chords: HarmonyChord[];
  /** Share of melody time (beats) that sits on chord tones, 0..1. */
  fit: number;
  /** Short sentences: the style, how well it fits, how it ends, notable chords. */
  explanation: string[];
  /** Ranked alternatives per segment, for editing one chord at a time. */
  segments: ChordSegment[];
  score: number;
}

export interface HarmonizeInput {
  notes: readonly MelodyNote[];
  timing: Pick<TakeTiming, 'meter' | 'bars'>;
  key: { tonic: string; mode: Mode };
}

/** Weights of the scoring model, in one place for tuning. */
export const HARMONY_WEIGHTS = {
  chordTone: 1,
  rootBonus: 0.05,
  nonChordTone: -1,
  /**
   * A note outside the chord that is short, or moves by step into and out of
   * itself (a passing or neighbour tone), after the segment's first beat.
   */
  passingTone: -0.25,
  passingMaxBeats: 0.5,
  stepwiseMaxBeats: 1,
  segmentStart: 1.5,
  onBeat: 1.1,
  offBeat: 0.8,
  heldIn: 0.9,
  holdAcrossBar: -0.15,
  changeMidBar: -1.5,
  fifthDown: 0.2,
  secondaryResolves: 0.3,
  secondaryUnresolved: -0.8,
  startOnTonic: 1,
  endOnTonic: 1,
  endOnDominant: -0.5,
} as const;

const FN_MOVES: Record<Fn, Record<Fn, number>> = {
  T: { T: 0, S: 0.3, D: 0.2 },
  S: { T: 0.15, S: 0.05, D: 0.4 },
  D: { T: 0.5, S: -0.3, D: 0 },
};

const EPS = 1e-9;
const K_BEST = 8;

function functionOf(numeral: string, mode: Mode): Fn {
  const n = numeral.replace(/7|maj|ø|°/g, '');
  if (/^(I|i)$/.test(n)) return 'T';
  if (/^(V|v|vii|VII)$/.test(n)) return 'D';
  if (/^(ii|IV|iv|II)$/.test(n)) return 'S';
  if (mode === 'minor') {
    if (n === 'bVII') return 'D';
    if (n === 'bVI') return 'S';
    return 'T'; // bIII
  }
  if (n === 'bVII') return 'S';
  return 'T'; // iii, vi
}

/** The chords a style may use in a key. */
export function candidatesFor(style: HarmonyStyle, key: HarmonizeInput['key']): Candidate[] {
  return style.numerals[key.mode].map((numeral) => {
    const symbol = romanToChord(numeral, key.tonic, key.mode);
    const info = parseChord(symbol);
    const slash = numeral.indexOf('/');
    const target = slash >= 0 ? numeral.slice(slash + 1) : null;
    const seventh = info.tones.length > 3;
    const borrowed =
      key.mode === 'major' ? /^(iv|bVII)$/.test(numeral) : /^(bVII7|V7\/iv)$/.test(numeral);
    return {
      numeral,
      symbol,
      root: chroma(info.root),
      tones: new Set(info.tones.map((t) => chroma(t))),
      fn: target ? 'D' : functionOf(numeral, key.mode),
      target,
      cost: (seventh ? 0.5 : 0) + (target ? 0.4 : 0) + (borrowed ? 0.6 : 0),
    };
  });
}

interface Segment {
  startBeat: number;
  beats: number;
  bar: number;
  /** The segment starts its bar (the downbeat), rather than at the half bar. */
  downbeat: boolean;
}

function segmentsFor(timing: HarmonizeInput['timing'], changesPerBar: 1 | 2): Segment[] {
  const bpb = timing.meter.beats;
  const split = changesPerBar === 2 && bpb % 2 === 0;
  const len = split ? bpb / 2 : bpb;
  const out: Segment[] = [];
  for (let bar = 0; bar < timing.bars; bar++)
    for (let i = 0; i < (split ? 2 : 1); i++)
      out.push({ startBeat: bar * bpb + i * len, beats: len, bar, downbeat: i === 0 });
  return out;
}

/** Notes approached and left by step (at most a whole tone), in melody order. */
function stepwise(notes: readonly MelodyNote[]): boolean[] {
  return notes.map((n, i) => {
    const prev = notes[i - 1];
    const next = notes[i + 1];
    const near = (m?: MelodyNote) => !!m && Math.abs(m.midi - n.midi) <= 2 && m.midi !== n.midi;
    return near(prev) && near(next);
  });
}

/** How well a chord holds the melody notes that sound during a segment. */
function emission(
  c: Candidate,
  seg: Segment,
  notes: readonly MelodyNote[],
  steps: readonly boolean[],
): number {
  const w = HARMONY_WEIGHTS;
  const end = seg.startBeat + seg.beats;
  let total = 0;
  for (const [i, n] of notes.entries()) {
    const d = Math.min(end, n.startBeat + n.beats) - Math.max(seg.startBeat, n.startBeat);
    if (d <= EPS) continue;
    // Only the downbeat counts double; a note on the half bar is an ordinary beat,
    // so holding one chord through the bar is not penalised for it.
    const onDownbeat = seg.downbeat && Math.abs(n.startBeat - seg.startBeat) < EPS;
    const weight =
      n.startBeat < seg.startBeat - EPS
        ? w.heldIn
        : onDownbeat
          ? w.segmentStart
          : Math.abs(n.startBeat - Math.round(n.startBeat)) < EPS
            ? w.onBeat
            : w.offBeat;
    const pc = chroma(n.midi);
    if (c.tones.has(pc)) total += d * weight * (w.chordTone + (pc === c.root ? w.rootBonus : 0));
    else {
      const passing =
        !onDownbeat &&
        n.startBeat >= seg.startBeat - EPS &&
        (n.beats <= w.passingMaxBeats + EPS || (steps[i]! && n.beats <= w.stepwiseMaxBeats + EPS));
      total += d * weight * (passing ? w.passingTone : w.nonChordTone);
    }
  }
  return total - c.cost;
}

function transition(a: Candidate, b: Candidate, sameBar: boolean): number {
  const w = HARMONY_WEIGHTS;
  if (a.symbol === b.symbol) return sameBar ? 0 : w.holdAcrossBar;
  let s = FN_MOVES[a.fn][b.fn] + (sameBar ? w.changeMidBar : 0);
  if ((b.root - a.root + 12) % 12 === 5) s += w.fifthDown;
  if (a.target) {
    const resolves = b.numeral.replace(/7|maj/g, '') === a.target;
    s += resolves ? w.secondaryResolves : w.secondaryUnresolved;
  }
  return s;
}

const isTonic = (c: Candidate) => /^(I|i)(maj7|7)?$/.test(c.numeral);

interface Cell {
  score: number;
  prev: { state: number; rank: number } | null;
}

/**
 * k-best Viterbi over the segments: each state keeps its best K partial paths.
 * Returns the best K whole paths (state index per segment), best first, plus
 * the max-marginal score of every state in every segment.
 */
function viterbi(
  cands: readonly Candidate[],
  segs: readonly Segment[],
  notes: readonly MelodyNote[],
): { paths: { states: number[]; score: number }[]; marginals: number[][] } {
  const w = HARMONY_WEIGHTS;
  const S = cands.length;
  const T = segs.length;
  const steps = stepwise(notes);
  const em = segs.map((seg) => cands.map((c) => emission(c, seg, notes, steps)));
  const endBonus = (c: Candidate) =>
    isTonic(c) ? w.endOnTonic : c.fn === 'D' ? w.endOnDominant : 0;

  const grid: Cell[][][] = [
    cands.map((c, j) => [{ score: em[0]![j]! + (isTonic(c) ? w.startOnTonic : 0), prev: null }]),
  ];
  for (let t = 1; t < T; t++) {
    const sameBar = segs[t]!.bar === segs[t - 1]!.bar;
    grid.push(
      cands.map((c, j) => {
        const options: Cell[] = [];
        for (let i = 0; i < S; i++) {
          const tr = transition(cands[i]!, c, sameBar);
          grid[t - 1]![i]!.forEach((cell, rank) =>
            options.push({ score: cell.score + tr + em[t]![j]!, prev: { state: i, rank } }),
          );
        }
        return options.sort((a, b) => b.score - a.score).slice(0, K_BEST);
      }),
    );
  }

  const finals: { state: number; rank: number; score: number }[] = [];
  grid[T - 1]!.forEach((cells, j) =>
    cells.forEach((cell, rank) =>
      finals.push({ state: j, rank, score: cell.score + endBonus(cands[j]!) }),
    ),
  );
  finals.sort((a, b) => b.score - a.score);
  const paths = finals.slice(0, K_BEST).map((f) => {
    const states: number[] = [];
    let at: { state: number; rank: number } | null = { state: f.state, rank: f.rank };
    for (let t = T - 1; t >= 0 && at; t--) {
      states.unshift(at.state);
      at = grid[t]![at.state]![at.rank]!.prev;
    }
    return { states, score: f.score };
  });

  // Max-marginals: best score of any whole path through state j at segment t.
  const back: number[][] = Array.from({ length: T }, () => new Array<number>(S).fill(0));
  back[T - 1] = cands.map(endBonus);
  for (let t = T - 2; t >= 0; t--) {
    const sameBar = segs[t + 1]!.bar === segs[t]!.bar;
    back[t] = cands.map((a) =>
      Math.max(
        ...cands.map((b, k) => transition(a, b, sameBar) + em[t + 1]![k]! + back[t + 1]![k]!),
      ),
    );
  }
  const marginals = grid.map((cells, t) => cells.map((c, j) => c[0]!.score + back[t]![j]!));
  return { paths, marginals };
}

function describeFit(fit: number): string {
  const pct = Math.round(fit * 100);
  if (pct >= 90) return `The melody is on a chord note ${pct}% of the time.`;
  if (pct >= 70)
    return `The melody is on a chord note ${pct}% of the time; the rest are passing notes.`;
  return `The melody is on a chord note only ${pct}% of the time, so some notes rub against the chords.`;
}

function describeEnding(
  chords: readonly HarmonyChord[],
  cands: readonly Candidate[],
): string | null {
  const last = chords.at(-1);
  const before = chords.at(-2);
  if (!last) return null;
  const info = (h: HarmonyChord) => cands.find((c) => c.symbol === h.symbol)!;
  const l = info(last);
  if (!isTonic(l))
    return `It ends away from home, on ${prettyNumeral(last.numeral)}, so it feels unfinished.`;
  if (!before) return null;
  const b = info(before);
  if (b.fn === 'D' && !b.target)
    return `It ends with ${prettyNumeral(before.numeral)}–${prettyNumeral(last.numeral)}, the strongest way home.`;
  if (b.fn === 'S')
    return `It ends with ${prettyNumeral(before.numeral)}–${prettyNumeral(last.numeral)}, a softer close than V–I.`;
  return null;
}

const pcNames = (symbol: string): Map<number, string> =>
  new Map(parseChord(symbol).tones.map((t) => [chroma(t), t]));

function whyChord(
  c: Candidate,
  start: number,
  beats: number,
  notes: readonly MelodyNote[],
  next: Candidate | null,
): string {
  if (c.target && next && next.numeral.replace(/7|maj/g, '') === c.target)
    return `Leans into ${next.symbol}, the chord that follows.`;
  const names = pcNames(c.symbol);
  const held = new Set<string>();
  let sounding = false;
  for (const n of notes) {
    const d = Math.min(start + beats, n.startBeat + n.beats) - Math.max(start, n.startBeat);
    if (d <= EPS) continue;
    sounding = true;
    const name = names.get(chroma(n.midi));
    if (name) held.add(name);
  }
  if (!sounding) return 'Keeps the harmony going under the rest.';
  if (held.size === 0) return 'The melody passes over it; it keeps the progression moving.';
  const list = [...held];
  const text = list.length === 1 ? list[0]! : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  return `The melody's ${text} ${list.length === 1 ? 'is' : 'are'} in ${c.symbol}.`;
}

/** Share of melody beats on chord tones of whatever chord sounds at the time. */
function fitOf(chords: readonly HarmonyChord[], notes: readonly MelodyNote[]): number {
  let on = 0;
  let all = 0;
  for (const h of chords) {
    const tones = new Set(parseChord(h.symbol).tones.map((t) => chroma(t)));
    for (const n of notes) {
      const d =
        Math.min(h.startBeat + h.beats, n.startBeat + n.beats) - Math.max(h.startBeat, n.startBeat);
      if (d <= EPS) continue;
      all += d;
      if (tones.has(chroma(n.midi))) on += d;
    }
  }
  return all ? on / all : 1;
}

function buildHarmonization(
  style: HarmonyStyle,
  cands: readonly Candidate[],
  segs: readonly Segment[],
  states: readonly number[],
  score: number,
  marginals: readonly number[][],
  notes: readonly MelodyNote[],
): Harmonization {
  // Merge a chord held through both halves of a bar; bars keep their own chords.
  const merged: { start: number; beats: number; state: number }[] = [];
  segs.forEach((seg, t) => {
    const last = merged.at(-1);
    if (last && last.state === states[t] && segs[t - 1]!.bar === seg.bar) last.beats += seg.beats;
    else merged.push({ start: seg.startBeat, beats: seg.beats, state: states[t]! });
  });
  const chords: HarmonyChord[] = merged.map((m, i) => {
    const c = cands[m.state]!;
    const next = merged[i + 1] ? cands[merged[i + 1]!.state]! : null;
    return {
      startBeat: m.start,
      beats: m.beats,
      symbol: c.symbol,
      numeral: c.numeral,
      why: whyChord(c, m.start, m.beats, notes, next),
    };
  });
  const fit = fitOf(chords, notes);
  const leaning = chords.flatMap((h, i) => {
    const next = chords[i + 1];
    const target = cands.find((c) => c.symbol === h.symbol)?.target;
    return target && next && next.numeral.replace(/7|maj/g, '') === target
      ? [`${h.symbol} is the V7 of ${next.symbol}: it leads into it like a small cadence.`]
      : [];
  });
  const explanation = [
    style.blurb,
    describeFit(fit),
    describeEnding(chords, cands),
    ...new Set(leaning),
  ].filter((s): s is string => s !== null);
  const segments: ChordSegment[] = segs.map((seg, t) => ({
    startBeat: seg.startBeat,
    beats: seg.beats,
    candidates: cands
      .map((c, j) => ({ symbol: c.symbol, numeral: c.numeral, score: marginals[t]![j]! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4),
  }));
  return { style: style.id, name: style.name, chords, fit, explanation, segments, score };
}

const signature = (h: Harmonization) => h.chords.map((c) => `${c.startBeat}:${c.symbol}`).join(' ');

/**
 * Three ways to harmonize a melody, one per style: simple, in the key and
 * colourful. Each is the best path of a hidden-Markov model whose states are the
 * style's chords: emissions score how well each chord holds the melody notes
 * sounding over it (weighted by length and beat), and transitions favour
 * functional motion (tonic → subdominant → dominant → tonic), roots falling a
 * fifth and secondary dominants that resolve. When a style's best path is the
 * same as an earlier style's, its next best is used, so the three differ.
 */
export function harmonize(input: HarmonizeInput): Harmonization[] {
  const notes = [...input.notes].sort((a, b) => a.startBeat - b.startBeat);
  const out: Harmonization[] = [];
  for (const style of HARMONY_STYLES) {
    const cands = candidatesFor(style, input.key);
    const segs = segmentsFor(input.timing, style.changesPerBar);
    if (segs.length === 0) continue;
    const { paths, marginals } = viterbi(cands, segs, notes);
    const seen = new Set(out.map(signature));
    const options = paths.map((p) =>
      buildHarmonization(style, cands, segs, p.states, p.score, marginals, notes),
    );
    // A different path that still ends where the best one does, if there is one.
    const fresh = options.filter((h) => !seen.has(signature(h)));
    const ending = options[0]!.chords.at(-1)!.symbol;
    const pick = fresh.find((h) => h.chords.at(-1)!.symbol === ending) ?? fresh[0];
    if (pick) out.push(pick);
  }
  return out;
}

/** The melody harmonizer behind the `ChordEstimator` interface (one style). */
export class MelodyHarmonizer implements ChordEstimator {
  readonly id: string;

  constructor(private readonly style: HarmonyStyleId = 'diatonic') {
    this.id = `melody-harmonizer:${style}`;
  }

  estimate(input: Parameters<ChordEstimator['estimate']>[0]): Promise<ChordSegment[]> {
    const style = HARMONY_STYLES.find((s) => s.id === this.style)!;
    const cands = candidatesFor(style, input.key);
    const segs = segmentsFor(input.timing, style.changesPerBar);
    const notes = [...(input.notes ?? [])].sort((a, b) => a.startBeat - b.startBeat);
    if (segs.length === 0) return Promise.resolve([]);
    const { paths, marginals } = viterbi(cands, segs, notes);
    const best = paths[0]!;
    return Promise.resolve(
      buildHarmonization(style, cands, segs, best.states, best.score, marginals, notes).segments,
    );
  }
}
