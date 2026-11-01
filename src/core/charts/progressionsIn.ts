import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import type { Progression } from '../content/types';
import { chordToRoman, chroma, romanToChord } from '../theory';
import { playChord, viewKey } from './compile';
import { triadOf } from './key';
import { NO_CHORD } from './symbols';
import { transposeKey, type Key } from './transpose';
import type { ChartBar, ChartView, ChordChart } from './types';

/**
 * A progression from the library found in a section of a chart.
 *
 * Chords are compared by their place in the key and their triad, so sevenths,
 * extensions, sus and slash basses don't matter (Dm7 G7sus4 G7 Cmaj7/E is
 * ii–V–I), and a chord held over several bars counts once, so the harmonic
 * rhythm doesn't either. A section that goes round a loop may start anywhere
 * in it ("started on vi"); a shorter run inside a section starts where the
 * progression starts. N.C. and chords that can't be read break a run.
 */
export interface ProgressionMatch {
  id: string;
  name: string;
  /** The whole section is this loop, round once or more. */
  whole: boolean;
  /** Where it is, in the section's own 1-based bars, and how many times round each time. */
  spans: { from: number; to: number; times: number }[];
  /** A whole-section loop that starts elsewhere in the progression: the numeral it starts on. */
  startsOn?: string;
  /** Read in the chart's relative major or minor, not its own key. */
  readIn?: Key;
}

/** A chord as the view plays it, with its Roman numeral in the view's key; null for N.C. */
export interface HarmonyChord {
  symbol: string;
  numeral: string | null;
  beats: number;
}

/** One section of a chart: its chords as numerals, and the progressions found in it. */
export interface SectionHarmony {
  id: string;
  label: string;
  bars: HarmonyChord[][];
  matches: ProgressionMatch[];
}

/** A chord as its distance above the tonic and its triad, "7:maj"; null when it can't be read. */
function degreeOf(symbol: string, tonic: number): string | null {
  if (symbol === NO_CHORD) return null;
  try {
    const { root, quality } = triadOf(symbol);
    return `${(root - tonic + 12) % 12}:${quality}`;
  } catch {
    return null;
  }
}

/** Equal neighbours merged: the chord changes, not the bars they last. */
interface Change {
  degree: string | null;
  firstBar: number;
  lastBar: number;
}

function changesOf(bars: readonly ChartBar[], tonic: number): Change[] {
  const out: Change[] = [];
  bars.forEach((bar, b) => {
    for (const c of bar.chords) {
      const degree = degreeOf(c.symbol, tonic);
      const last = out.at(-1);
      if (last && last.degree === degree) last.lastBar = b;
      else out.push({ degree, firstBar: b, lastBar: b });
    }
  });
  return out;
}

/** A loop's chords: going round, the last chord runs into the first when they are the same. */
function cycleOf<T>(items: readonly T[]): T[] {
  const out = [...items];
  while (out.length > 1 && out.at(-1) === out[0]) out.pop();
  return out;
}

/** The shortest stretch the items repeat, and how many times it goes round. */
function periodOf(items: readonly string[]): { loop: string[]; times: number } {
  const n = items.length;
  for (let p = 1; p <= n; p++)
    if (n % p === 0 && items.every((d, i) => d === items[i % p]))
      return { loop: items.slice(0, p), times: n / p };
  return { loop: [...items], times: 1 };
}

/** A library progression as chord changes, read in C major or A minor. */
interface Pattern {
  progression: Progression;
  /** As written, equal neighbours merged. */
  line: string[];
  /** The numeral each change starts with. */
  numerals: string[];
  /** Going round: `line` with a last chord that repeats the first dropped. */
  cycle: string[];
}

const patterns = new WeakMap<Progression, Pattern | null>();

function patternOf(p: Progression): Pattern | null {
  const hit = patterns.get(p);
  if (hit !== undefined) return hit;
  const ref = p.mode === 'minor' ? 'A' : 'C';
  const line: string[] = [];
  const numerals: string[] = [];
  let pattern: Pattern | null = null;
  try {
    for (const s of p.steps) {
      const degree = degreeOf(romanToChord(s.numeral, ref, p.mode), chroma(ref));
      if (degree === null) throw new Error('unreadable');
      if (line.at(-1) === degree) continue;
      line.push(degree);
      numerals.push(s.numeral);
    }
    if (line.length >= 3) pattern = { progression: p, line, numerals, cycle: cycleOf(line) };
  } catch {
    pattern = null;
  }
  patterns.set(p, pattern);
  return pattern;
}

/** Where `loop` starts in `cycle` when it is the same loop started elsewhere; -1 when it isn't. */
function rotation(loop: readonly string[], cycle: readonly string[]): number {
  const n = cycle.length;
  if (loop.length !== n) return -1;
  for (let r = 0; r < n; r++) if (loop.every((d, i) => d === cycle[(i + r) % n])) return r;
  return -1;
}

/** The relative major of a minor key, or the relative minor of a major one. */
function relativeKey(key: Key): Key {
  const pc = (chroma(key.tonic) + (key.mode === 'major' ? 9 : 3)) % 12;
  return key.mode === 'major'
    ? { tonic: MINOR_KEYS[pc]!, mode: 'minor' }
    : { tonic: MAJOR_KEYS[pc]!, mode: 'major' };
}

type Span = ProgressionMatch['spans'][number];

/** A match, and how far each place goes round, part of a time included. */
interface Found {
  match: Omit<ProgressionMatch, 'readIn'>;
  reach: Span[];
}

function matchIn(changes: readonly Change[], pattern: Pattern): Found | null {
  const { progression, line, cycle, numerals } = pattern;
  const base = { id: progression.id, name: progression.name };
  const lastBar = changes.at(-1)?.lastBar ?? 0;

  // The whole section, gone round once or more, when nothing breaks it.
  if (changes.length && changes.every((c) => c.degree !== null)) {
    const { loop, times } = periodOf(cycleOf(changes.map((c) => c.degree!)));
    const r = rotation(loop, cycle);
    if (r >= 0) {
      const spans = [{ from: 1, to: lastBar + 1, times }];
      return {
        match: { ...base, whole: true, spans, ...(r > 0 ? { startsOn: numerals[r]! } : {}) },
        reach: spans,
      };
    }
  }

  // Runs inside it: the progression from its start, then round again while it carries on.
  const spans: Span[] = [];
  const reach: Span[] = [];
  const n = cycle.length;
  const bar = (k: number, edge: 'firstBar' | 'lastBar') => changes[k]![edge] + 1;
  for (let i = 0; i + line.length <= changes.length;) {
    let length = 0;
    while (i + length < changes.length && changes[i + length]!.degree === cycle[length % n])
      length++;
    if (!line.every((d, k) => changes[i + k]!.degree === d)) {
      i++;
      continue;
    }
    // Only whole times round count; a part of one more is still where the loop is.
    const times = Math.max(1, Math.floor(length / n));
    const full = Math.max(line.length, times * n);
    spans.push({ from: bar(i, 'firstBar'), to: bar(i + full - 1, 'lastBar'), times });
    reach.push({ from: bar(i, 'firstBar'), to: bar(i + length - 1, 'lastBar'), times });
    i += Math.max(full, length);
  }
  return spans.length ? { match: { ...base, whole: false, spans }, reach } : null;
}

/**
 * The library progressions in a run of bars, in a key: each progression of
 * the key's own mode, and each of the other mode read in the relative key.
 * Whole-section loops come first (those that start where the progression
 * starts before those that don't), then runs by where they start.
 */
export function findProgressions(
  bars: readonly ChartBar[],
  key: Key,
  library: readonly Progression[],
): ProgressionMatch[] {
  const relative = relativeKey(key);
  const home = changesOf(bars, chroma(key.tonic));
  const away = changesOf(bars, chroma(relative.tonic));
  const found: (Found & { match: ProgressionMatch; pattern: Pattern })[] = [];
  for (const p of library) {
    const pattern = patternOf(p);
    if (!pattern) continue;
    const ownMode = p.mode === key.mode;
    const f = matchIn(ownMode ? home : away, pattern);
    if (f)
      found.push({ ...f, match: ownMode ? f.match : { ...f.match, readIn: relative }, pattern });
  }
  // A run inside a longer stretch of the same loop under another name is no news:
  // vi–IV–I–V in the middle of I–V–vi–IV twice.
  const sameLoop = (a: Pattern, b: Pattern) =>
    a !== b && a.progression.mode === b.progression.mode && rotation(a.cycle, b.cycle) >= 0;
  const inside = (s: Span, t: Span) =>
    s.from >= t.from && s.to <= t.to && t.to - t.from > s.to - s.from;
  const kept = found.flatMap(({ match, pattern }) => {
    if (match.whole) return [match];
    const spans = match.spans.filter(
      (s) => !found.some((o) => sameLoop(pattern, o.pattern) && o.reach.some((t) => inside(s, t))),
    );
    return spans.length ? [{ ...match, spans }] : [];
  });
  const rank = (m: ProgressionMatch) => (m.whole ? (m.startsOn ? 1 : 0) : 2);
  return kept.sort((a, b) => rank(a) - rank(b) || a.spans[0]!.from - b.spans[0]!.from);
}

function numeralIn(symbol: string, key: Key): string | null {
  if (symbol === NO_CHORD) return null;
  try {
    return chordToRoman(symbol, key.tonic, key.mode);
  } catch {
    return null;
  }
}

/**
 * Every section of a chart, in the order they were entered: its chords as the
 * view plays them, with their Roman numerals in the view's key, and the
 * library progressions in it. Matching reads the chart as written, so a new
 * key or simplify level changes the chords shown, never what is found; a key
 * a match reads in moves with the view.
 */
export function chartProgressions(
  chart: ChordChart,
  view: ChartView,
  library: readonly Progression[],
): SectionHarmony[] {
  const key = viewKey(chart, view);
  return chart.sections.map((s) => ({
    id: s.id,
    label: s.label,
    bars: s.bars.map((b) =>
      b.chords.map((c) => {
        const symbol = playChord(c.symbol, chart, view).symbol;
        return { symbol, numeral: numeralIn(symbol, key), beats: c.beats };
      }),
    ),
    matches: findProgressions(s.bars, chart.key, library).map((m) =>
      m.readIn ? { ...m, readIn: transposeKey(m.readIn, view.transpose) } : m,
    ),
  }));
}
