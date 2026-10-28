import { chordToRoman, isValidChord, type Mode } from '../theory';
import { suggestKeys } from './key';
import { NO_CHORD, normalizeChord } from './symbols';
import { parseBars } from './syntax';
import {
  barOf,
  CHART_STYLES,
  CHART_VERSION,
  DEFAULT_VIEW,
  LIMITS,
  type ChartBar,
  type ChartSection,
  type ChartStyle,
  type ChartView,
  type ChordChart,
} from './types';

/** Stored sequence shape. Bump it and add a migration step when the shape changes. */
export const SEQUENCE_VERSION = 1;

/** The chart editor's tempo range. */
export const SEQUENCE_TEMPO = { min: 40, max: 200 } as const;

/** The chords of a sequence: what undo and redo step through. */
export interface SequenceBars {
  meter: ChordChart['meter'];
  /** Up to `LIMITS.barsPerSection`, each split as one of `barSplits`. */
  bars: ChartBar[];
}

/**
 * A line of chords to hear: one section of a chord chart, and how it plays.
 * Every bar is always playable, so the chart it makes is always valid.
 */
export interface ChordSequence extends SequenceBars {
  tempo: number;
  /** Accompaniment style id. */
  style: ChartStyle;
  loop: boolean;
  /** Roman numerals under the chord symbols. */
  showFunction: boolean;
}

export const EMPTY_SEQUENCE: ChordSequence = {
  meter: { beats: 4, unit: 4 },
  bars: [],
  tempo: 80,
  style: 'triad-root',
  loop: true,
  showFunction: false,
};

/** The one section a sequence becomes in a chart. */
export const SEQUENCE_SECTION = { id: 'sequence', label: 'Sequence' } as const;

/**
 * Every way a bar can be split: whole beats that add up to the bar, and 3/4's
 * even split into four. Even splits come first for each number of chords.
 */
const SPLITS: Record<3 | 4, readonly (readonly number[])[]> = {
  4: [[4], [2, 2], [3, 1], [1, 3], [2, 1, 1], [1, 2, 1], [1, 1, 2], [1, 1, 1, 1]],
  3: [[3], [2, 1], [1, 2], [1, 1, 1], [1, 1, 0.5, 0.5]],
};

export function barSplits(beatsPerBar: 3 | 4): readonly (readonly number[])[] {
  return SPLITS[beatsPerBar];
}

/** Is this one of the splits of a bar of `beatsPerBar`? */
export function isSplit(beats: readonly number[], beatsPerBar: 3 | 4): boolean {
  return SPLITS[beatsPerBar].some(
    (s) => s.length === beats.length && s.every((b, i) => b === beats[i]),
  );
}

export interface SequenceIssue {
  /** 1-based bar in what was typed, when the issue is in one. */
  bar?: number;
  token?: string;
  message: string;
}

/** Tokens that only separate chords: "C - G - Am", "C → G". */
const SEPARATOR = /^(?:-|–|—|→|->)$/;

/** "am" → "Am", "f#m7" → "F#m7"; anything that is not then a chord stays as typed. */
function capitalRoot(token: string): string {
  // Beat dots may follow a chord: "c..." is C and two more beats.
  const chord = (t: string) => normalizeChord(t.replace(/\.+$/, '')) !== null;
  if (!/^[a-g]/.test(token) || chord(token)) return token;
  const up = token[0]!.toUpperCase() + token.slice(1);
  return chord(up) ? up : token;
}

/** One chord as typed, lower-case root allowed: "f#m7" → "F#m7". Null when it is not a chord. */
export function readChord(typed: string): string | null {
  return normalizeChord(capitalRoot(typed.trim()));
}

/**
 * The ways people type a line of chords, read as chart syntax: commas and
 * spaced dashes separate chords, and a root may be lower case. A dash inside
 * a chord stays ("C-7" is C minor seven).
 */
function relax(text: string): string {
  return text
    .replace(/,/g, ' ')
    .split(/(\s+|\|)/)
    .map((part) => (SEPARATOR.test(part) ? '' : capitalRoot(part)))
    .join('');
}

/**
 * Read typed chords as bars to add to a sequence of `beatsPerBar` with room
 * for `room` more bars: "C Am F G" (a bar each), "| C | Am | F G |" (chart
 * syntax, with its dots, % and x2), commas and spaced dashes between chords,
 * and lower-case roots. Any issue means nothing should be added.
 */
export function readChords(
  text: string,
  beatsPerBar: 3 | 4,
  room: number,
): { bars: ChartBar[]; issues: SequenceIssue[] } {
  const relaxed = relax(text).trim();
  if (!relaxed || /^[\s|]*$/.test(relaxed)) return { bars: [], issues: [] };
  const parsed = parseBars(relaxed, beatsPerBar);
  // Each problem once, where it first shows: "C . . G" has two stray dots, one mistake.
  const issues: SequenceIssue[] = parsed.issues
    .filter((i, k, all) => all.findIndex((x) => x.message === i.message) === k)
    .map((i) => ({
      ...(i.bar ? { bar: i.bar } : {}),
      ...(i.token ? { token: i.token } : {}),
      message: i.message,
    }));
  const n = parsed.bars.length;
  if (n > room)
    issues.push({
      message:
        room <= 0
          ? `The sequence is full: it holds up to ${LIMITS.barsPerSection} bars`
          : `That is ${n} bars; there is room for ${room} more (a sequence holds up to ${LIMITS.barsPerSection})`,
    });
  return { bars: parsed.bars, issues };
}

// ---- edits ------------------------------------------------------------------
// Each returns a new sequence, or the same one when there is nothing to do,
// and keeps every bar one of the splits.

/** Bars left before the sequence is full. */
export function roomLeft(s: SequenceBars): number {
  return LIMITS.barsPerSection - s.bars.length;
}

const copyOf = (bar: ChartBar): ChartBar => ({ chords: bar.chords.map((c) => ({ ...c })) });

function replaceBar<T extends SequenceBars>(s: T, index: number, bar: ChartBar): T {
  return { ...s, bars: s.bars.map((b, i) => (i === index ? bar : b)) };
}

/** Put bars in at `at`, 0 to the length. Nothing changes unless they all fit. */
export function insertBars<T extends SequenceBars>(s: T, at: number, bars: readonly ChartBar[]): T {
  if (bars.length === 0 || bars.length > roomLeft(s)) return s;
  if (!Number.isInteger(at) || at < 0 || at > s.bars.length) return s;
  return { ...s, bars: [...s.bars.slice(0, at), ...bars.map(copyOf), ...s.bars.slice(at)] };
}

export function removeBar<T extends SequenceBars>(s: T, index: number): T {
  if (!s.bars[index]) return s;
  return { ...s, bars: s.bars.filter((_, i) => i !== index) };
}

/** Move bar `from` so that it ends up at `to`. */
export function moveBar<T extends SequenceBars>(s: T, from: number, to: number): T {
  const bar = s.bars[from];
  if (!bar || from === to || !Number.isInteger(to) || to < 0 || to >= s.bars.length) return s;
  const bars = s.bars.filter((_, i) => i !== from);
  bars.splice(to, 0, bar);
  return { ...s, bars };
}

/** A copy of bar `index` right after it. */
export function copyBar<T extends SequenceBars>(s: T, index: number): T {
  const bar = s.bars[index];
  return bar ? insertBars(s, index + 1, [bar]) : s;
}

export function clearBars<T extends SequenceBars>(s: T): T {
  return s.bars.length ? { ...s, bars: [] } : s;
}

/**
 * Split bar `index` another way, one of `barSplits`: more chords repeat the
 * last one, fewer drop chords from the end.
 */
export function setSplit<T extends SequenceBars>(s: T, index: number, split: readonly number[]): T {
  const bar = s.bars[index];
  if (!bar || !isSplit(split, s.meter.beats)) return s;
  if (bar.chords.length === split.length && bar.chords.every((c, i) => c.beats === split[i]))
    return s;
  const chords = split.map((beats, i) => ({
    symbol: (bar.chords[i] ?? bar.chords.at(-1)!).symbol,
    beats,
  }));
  return replaceBar(s, index, { chords });
}

/** Change one chord as typed. Nothing changes unless it reads as a chord (or N.C.). */
export function setChord<T extends SequenceBars>(
  s: T,
  index: number,
  slot: number,
  typed: string,
): T {
  const bar = s.bars[index];
  const chord = bar?.chords[slot];
  const symbol = readChord(typed);
  if (!bar || !chord || !symbol || symbol === chord.symbol) return s;
  return replaceBar(s, index, {
    chords: bar.chords.map((c, i) => (i === slot ? { ...c, symbol } : c)),
  });
}

/**
 * Take a chord out of a bar. Its beats go to the chord before it (or after
 * it, for the first), so the others keep their lengths; 3/4's even four
 * becomes three even beats. A bar's last chord stays: delete the bar instead.
 */
export function removeChord<T extends SequenceBars>(s: T, index: number, slot: number): T {
  const bar = s.bars[index];
  const gone = bar?.chords[slot];
  if (!bar || !gone || bar.chords.length < 2) return s;
  const left = bar.chords.filter((_, i) => i !== slot);
  if (bar.chords.some((c) => !Number.isInteger(c.beats)))
    return replaceBar(
      s,
      index,
      barOf(
        left.map((c) => c.symbol),
        s.meter.beats,
      ),
    );
  const to = Math.max(0, slot - 1);
  return replaceBar(s, index, {
    chords: left.map((c, i) => (i === to ? { ...c, beats: c.beats + gone.beats } : c)),
  });
}

/** A new meter: every bar keeps its chords, split evenly, as the chart editor does. */
export function setMeter<T extends SequenceBars>(s: T, beats: 3 | 4): T {
  if (beats === s.meter.beats) return s;
  return {
    ...s,
    meter: { beats, unit: 4 },
    bars: s.bars.map((b) =>
      barOf(
        b.chords.map((c) => c.symbol),
        beats,
      ),
    ),
  };
}

const sectionOf = (bars: readonly ChartBar[]): ChartSection => ({
  ...SEQUENCE_SECTION,
  type: 'custom',
  repeat: 1,
  bars: bars as ChartBar[],
});

/** The key the chords suggest, or null when there are no chords to go by. */
export function sequenceKey(bars: readonly ChartBar[]): { tonic: string; mode: Mode } | null {
  if (!bars.some((b) => b.chords.some((c) => c.symbol !== NO_CHORD))) return null;
  const best = suggestKeys([sectionOf(bars)])[0];
  return best && best.score > 0 ? { tonic: best.tonic, mode: best.mode } : null;
}

/** Each chord's Roman numeral in the key, bar by bar; null for N.C. */
export function sequenceNumerals(
  bars: readonly ChartBar[],
  key: { tonic: string; mode: Mode },
): (string | null)[][] {
  return bars.map((b) =>
    b.chords.map((c) => {
      if (c.symbol === NO_CHORD) return null;
      try {
        return chordToRoman(c.symbol, key.tonic, key.mode);
      } catch {
        return null;
      }
    }),
  );
}

/**
 * The sequence as a chord chart: one section, played once, in the key the
 * chords suggest. This is what plays it, and what it is saved as.
 */
export function sequenceChart(seq: ChordSequence, title = ''): ChordChart {
  return {
    version: CHART_VERSION,
    title,
    key: sequenceKey(seq.bars) ?? { tonic: 'C', mode: 'major' },
    tempo: seq.tempo,
    meter: seq.meter,
    sections: [sectionOf(seq.bars)],
    form: [SEQUENCE_SECTION.id],
    notes: '',
  };
}

/** How the chart plays: as written, in the sequence's style. */
export function sequenceView(seq: ChordSequence): ChartView {
  return {
    transpose: 0,
    simplify: 'original',
    style: seq.style,
    showFunction: seq.showFunction,
    showLyrics: DEFAULT_VIEW.showLyrics,
  };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

function cleanBar(raw: unknown, beatsPerBar: 3 | 4): ChartBar | null {
  if (!isObject(raw) || !Array.isArray(raw.chords)) return null;
  const chords = raw.chords;
  if (chords.length < 1 || chords.length > LIMITS.chordsPerBar) return null;
  const out: ChartBar = { chords: [] };
  for (const c of chords) {
    if (!isObject(c) || typeof c.symbol !== 'string' || typeof c.beats !== 'number') return null;
    if (c.symbol !== NO_CHORD && !isValidChord(c.symbol)) return null;
    out.chords.push({ symbol: c.symbol, beats: c.beats });
  }
  return isSplit(
    out.chords.map((c) => c.beats),
    beatsPerBar,
  )
    ? out
    : null;
}

/**
 * A stored sequence, read from outside: null unless it has bars, and then
 * with every field in range. Bars that are not playable are dropped.
 */
export function cleanSequence(raw: unknown): ChordSequence | null {
  if (!isObject(raw) || !Array.isArray(raw.bars)) return null;
  const meter = isObject(raw.meter) && raw.meter.beats === 3 ? 3 : 4;
  const bars = raw.bars
    .map((b) => cleanBar(b, meter))
    .filter((b): b is ChartBar => b !== null)
    .slice(0, LIMITS.barsPerSection);
  const tempo =
    typeof raw.tempo === 'number' && Number.isFinite(raw.tempo)
      ? Math.round(Math.min(SEQUENCE_TEMPO.max, Math.max(SEQUENCE_TEMPO.min, raw.tempo)))
      : EMPTY_SEQUENCE.tempo;
  const style = CHART_STYLES.find((s) => s.id === raw.style)?.id ?? EMPTY_SEQUENCE.style;
  return {
    meter: { beats: meter, unit: 4 },
    bars,
    tempo,
    style,
    loop: typeof raw.loop === 'boolean' ? raw.loop : EMPTY_SEQUENCE.loop,
    showFunction: raw.showFunction === true,
  };
}
