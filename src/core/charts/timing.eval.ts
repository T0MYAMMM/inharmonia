import { defaultLineBars, lineBars, parseSheet, type PastedLine } from './paste';
import { parseBars } from './syntax';
import { estimateSheetTiming, expandTabs, type LineChord, type LineTiming } from './timing';
import type { TimingFixture } from './timing.fixtures';
import type { ChartBar } from './types';

/** What one way of reading the lines got right, summed over lines. */
export interface Tally {
  /** Beats with the right chord, out of the longer of the two lengths, so a wrong bar count costs. */
  right: number;
  beats: number;
  /** Lines whose bar count matches. */
  barsRight: number;
  lines: number;
  /**
   * Scale-free: the right chord at SHAPE points spread evenly over each line,
   * both stretched to the same length. A line read at double or half length
   * with its changes in the right places scores in full here; a change in the
   * wrong place, or chords in the wrong order, doesn't.
   */
  shapeRight: number;
  shapePoints: number;
  /** Lines read at twice or half the true number of bars. */
  doubled: number;
}

/** Points per line for the scale-free score. */
export const SHAPE = 48;

export interface LineScore {
  /** 1-based line number of the chords in the sheet. */
  n: number;
  truth: ChartBar[];
  estimated: ChartBar[];
  baseline: ChartBar[];
  confidence: LineTiming['confidence'] | null;
}

export interface FixtureScore {
  id: string;
  lines: LineScore[];
  estimated: Tally;
  baseline: Tally;
}

/** The chord in each beat. */
const beatsOf = (bars: readonly ChartBar[]) =>
  bars.flatMap((b) => b.chords.flatMap((c) => Array.from({ length: c.beats }, () => c.symbol)));

function add(t: Tally, truth: readonly ChartBar[], got: readonly ChartBar[]) {
  const a = beatsOf(truth);
  const b = beatsOf(got);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) t.right++;
  t.beats += Math.max(a.length, b.length);
  for (let k = 0; k < SHAPE; k++) {
    const at = (beats: string[]) => beats[Math.floor(((k + 0.5) * beats.length) / SHAPE)];
    if (at(a) === at(b)) t.shapeRight++;
  }
  t.shapePoints += SHAPE;
  if (truth.length === got.length) t.barsRight++;
  if (got.length === 2 * truth.length || 2 * got.length === truth.length) t.doubled++;
  t.lines++;
}

const tally = (): Tally => ({
  right: 0,
  beats: 0,
  barsRight: 0,
  lines: 0,
  shapeRight: 0,
  shapePoints: 0,
  doubled: 0,
});
const chordLines = (lines: readonly PastedLine[]) => lines.filter((l) => l.chords.length > 0);

/**
 * Score the estimate and today's one chord a bar against a fixture's true
 * bars; `scale` reads the estimate halved (½) or doubled (2), as Half and
 * Double in the review do.
 */
export function scoreFixture(f: TimingFixture, scale = 1): FixtureScore {
  const sheet = parseSheet(f.sheet, f.beatsPerBar, { scale });
  const lines = chordLines(sheet.lines);
  if (lines.length !== f.truth.length)
    throw new Error(`${f.id}: ${lines.length} lines of chords, ${f.truth.length} true`);
  const estimated = tally();
  const baseline = tally();
  const scored = lines.map((line, i) => {
    const truth = parseBars(f.truth[i]!, f.beatsPerBar).bars;
    const est = lineBars(line, defaultLineBars(line), f.beatsPerBar);
    const base = lineBars(line, 'one', f.beatsPerBar);
    add(estimated, truth, est);
    add(baseline, truth, base);
    return {
      n: line.n,
      truth,
      estimated: est,
      baseline: base,
      confidence: line.estimate?.confidence ?? null,
    };
  });
  return { id: f.id, lines: scored, estimated, baseline };
}

/**
 * Every fixture scored; with `bestScale`, each one at whichever of ½, 1 and 2
 * gets the most beats right: what one click on Half or Double gets back.
 */
export function scoreAll(fixtures: readonly TimingFixture[], { bestScale = false } = {}) {
  const rows = fixtures.map((f) => {
    if (!bestScale) return scoreFixture(f);
    const tries = [1, 0.5, 2].map((scale) => scoreFixture(f, scale));
    return tries.reduce((a, b) => (b.estimated.right > a.estimated.right ? b : a));
  });
  const sum = (pick: (r: FixtureScore) => Tally): Tally =>
    rows.map(pick).reduce((a, t) => {
      const out = tally();
      for (const k of Object.keys(out) as (keyof Tally)[]) out[k] = a[k] + t[k];
      return out;
    }, tally());
  return { rows, estimated: sum((r) => r.estimated), baseline: sum((r) => r.baseline) };
}

export const beatAccuracy = (t: Tally) => (t.beats ? t.right / t.beats : 0);
export const barMatch = (t: Tally) => (t.lines ? t.barsRight / t.lines : 0);
export const shapeAccuracy = (t: Tally) => (t.shapePoints ? t.shapeRight / t.shapePoints : 0);

export interface TimingVector {
  /** The fixture the sheet comes from. */
  id: string;
  input: {
    beatsPerBar: number;
    scale: number;
    /** The sheet's lines of chords with words under them, in order. */
    lines: { chords: LineChord[]; lyric: string }[];
  };
  output: LineTiming[];
}

/** Fixtures whose sheets are also written at half and double length. */
const SCALED = ['oh-susanna', 'amazing-grace', 'this-old-man'];

/**
 * Inputs and outputs for every sheet, for other implementations to check
 * against: one per fixture, plus a few halved and doubled. Columns are read
 * from the sheet the way the paste parser reads them (tabs expanded, one chord
 * a token).
 */
export function timingVectors(fixtures: readonly TimingFixture[]): TimingVector[] {
  const out: TimingVector[] = [];
  for (const f of fixtures) {
    const text = f.sheet.split('\n').map(expandTabs);
    const lines = parseSheet(f.sheet, f.beatsPerBar).lines.filter((l) => l.estimate);
    const input = lines.map((line) => {
      if (line.kind !== 'chords') throw new Error(`${f.id}, line ${line.n}: not a line of chords`);
      const tokens = [...text[line.n - 1]!.matchAll(/\S+/g)];
      if (tokens.length !== line.chords.length)
        throw new Error(`${f.id}, line ${line.n}: tokens and chords differ`);
      return {
        chords: line.chords.map((symbol, i) => ({ symbol, col: tokens[i]!.index })),
        lyric: text[line.n]!,
      };
    });
    for (const scale of SCALED.includes(f.id) ? [1, 0.5, 2] : [1])
      out.push({
        id: f.id,
        input: { beatsPerBar: f.beatsPerBar, scale, lines: input },
        output: estimateSheetTiming(input, f.beatsPerBar, { scale }),
      });
  }
  return out;
}
