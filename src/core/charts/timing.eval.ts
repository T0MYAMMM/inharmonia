import { defaultLineBars, lineBars, parseSheet, type PastedLine } from './paste';
import { parseBars } from './syntax';
import { estimateLineTiming, expandTabs, type LineChord, type LineTiming } from './timing';
import type { TimingFixture } from './timing.fixtures';
import type { ChartBar } from './types';

/** Right beats out of all beats: the longer of the two counts, so a wrong bar count costs. */
export interface Tally {
  right: number;
  beats: number;
  /** Lines whose bar count matches. */
  barsRight: number;
  lines: number;
}

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
  if (truth.length === got.length) t.barsRight++;
  t.lines++;
}

const tally = (): Tally => ({ right: 0, beats: 0, barsRight: 0, lines: 0 });
const chordLines = (lines: readonly PastedLine[]) => lines.filter((l) => l.chords.length > 0);

/** Score the estimate and today's one chord a bar against a fixture's true bars. */
export function scoreFixture(f: TimingFixture): FixtureScore {
  const sheet = parseSheet(f.sheet, f.beatsPerBar);
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

export function scoreAll(fixtures: readonly TimingFixture[]) {
  const rows = fixtures.map(scoreFixture);
  const sum = (pick: (r: FixtureScore) => Tally): Tally =>
    rows.map(pick).reduce(
      (a, t) => ({
        right: a.right + t.right,
        beats: a.beats + t.beats,
        barsRight: a.barsRight + t.barsRight,
        lines: a.lines + t.lines,
      }),
      tally(),
    );
  return { rows, estimated: sum((r) => r.estimated), baseline: sum((r) => r.baseline) };
}

export const beatAccuracy = (t: Tally) => (t.beats ? t.right / t.beats : 0);
export const barMatch = (t: Tally) => (t.lines ? t.barsRight / t.lines : 0);

export interface TimingVector {
  input: { chords: LineChord[]; lyric: string; beatsPerBar: number };
  output: LineTiming;
}

/**
 * Inputs and outputs for every line of chords with words under it, for other
 * implementations to check against. Columns are read from the sheet the way
 * the paste parser reads them (tabs expanded, one chord a token).
 */
export function timingVectors(fixtures: readonly TimingFixture[]): TimingVector[] {
  const out: TimingVector[] = [];
  for (const f of fixtures) {
    const text = f.sheet.split('\n').map(expandTabs);
    for (const line of parseSheet(f.sheet, f.beatsPerBar).lines) {
      if (!line.estimate || line.kind !== 'chords') continue;
      const tokens = [...text[line.n - 1]!.matchAll(/\S+/g)];
      if (tokens.length !== line.chords.length)
        throw new Error(`${f.id}, line ${line.n}: tokens and chords differ`);
      const input = {
        chords: line.chords.map((symbol, i) => ({ symbol, col: tokens[i]!.index })),
        lyric: text[line.n]!,
        beatsPerBar: f.beatsPerBar,
      };
      out.push({ input, output: estimateLineTiming(input.chords, input.lyric, input.beatsPerBar) });
    }
  }
  return out;
}
