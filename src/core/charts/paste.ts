import { tidyLyric, withLyric } from './lyrics';
import { rebar } from './rebar';
import { parseHeader, sectionTypeOf, type SectionType } from './sections';
import { NO_CHORD, normalizeChord } from './symbols';
import { parseBars } from './syntax';
import { estimateSheetTiming, expandTabs, type LineChord, type LineTiming } from './timing';
import { evenBeats, LIMITS, type ChartBar, type ChartSection, type ChordChart } from './types';

/**
 * What a pasted line turned out to be. Unless lyrics are kept, the parser
 * keeps no text from the sheet except chord symbols and section labels:
 * lyric lines are only counted.
 */
export type LineKind = 'blank' | 'header' | 'chords' | 'bars' | 'inline' | 'lyric';

export interface PastedLine {
  /** 1-based line number in the paste. */
  n: number;
  kind: LineKind;
  /** Chords found on the line, normalised; unknown ones as written (chord lines only). */
  chords: string[];
  /** Tokens on a chord line that are not chords, to fix by hand. */
  unknown: string[];
  /** More than four chords: probably two (or more) to a bar. */
  dense: boolean;
  /** Lyric text was on this line and was dropped. */
  lyricsRemoved: boolean;
  /** Index into `sections`, for lines that belong to one. */
  section: number | null;
  /** Bars written with "|" (kind "bars"), kept as typed. */
  bars?: ChartBar[];
  /**
   * Kept lyrics only. On a line of chords: the words under each chord (for
   * kind "bars", under each bar), from the line below or, for inline chords,
   * between them.
   */
  words?: (string | undefined)[];
  /** Kept lyrics only: some words were cut to `LIMITS.lyric` a bar. */
  cut?: boolean;
  /** Kept lyrics only, on a lyric line: the line number of the chords it sits under. */
  under?: number;
  /**
   * On a line of chords with words under it (or inline chords in words): how
   * long each chord lasts, estimated from where it sits over the words. Only
   * the estimate is kept, never the words, unless lyrics are kept.
   */
  estimate?: LineTiming;
}

/** How a line of chords becomes bars: estimated from its lyrics, or one or two chords a bar. */
export type LineBars = 'estimated' | 'one' | 'two';

export interface PastedSection {
  label: string;
  type: SectionType;
  repeat: number;
}

export interface ParsedSheet {
  lines: PastedLine[];
  sections: PastedSection[];
  /** Lines (or parts of lines) of lyrics that were dropped. */
  lyricLines: number;
  /** Lines of lyrics kept with their chords (only when asked to keep them). */
  keptLines: number;
}

export interface ParseSheetOptions {
  /**
   * Keep each lyric line with the chords right above it (or inline chords
   * with the words between them), cut at the chords. Off: lyrics are dropped
   * as they are read, and only counted.
   */
  keepLyrics?: boolean;
  /**
   * Scale every estimated length: ½ halves them, 2 doubles them (the Half and
   * Double in the review). Default 1.
   */
  scale?: number;
}

/** Bar lines, repeat marks, N.C., brackets and dashes: ignored when judging a line. */
const STRUCTURAL = /^(?:\|+:?|:?\|+|%|x\s?\d+|\d+\s?x|n\.?\s?c\.?|[[\]()\-–—/:.~*]+)$/i;
/** Bar lines, beat marks, % and x2: all a line of only N.C. holds besides it. */
const BAR_MARKS = /^(?:\|+:?|:?\|+|\.+|\/|%|x\d+|\d+x)$/i;
const INLINE = /\[([^\]]{1,24})\]/g;

/** Strip "(Am)" to "Am" before checking whether a token is a chord. */
const bare = (t: string) => t.replace(/^\(+/, '').replace(/\)+$/, '').replace(/,$/, '');

function chordToken(t: string): string | null {
  const sym = normalizeChord(bare(t));
  return sym === NO_CHORD ? null : sym;
}

/** N.C. as sheets write it: "N.C.", "NC", "(N.C.)". */
const isNoChord = (t: string) => normalizeChord(bare(t)) === NO_CHORD;

/**
 * Is this a line of chords? At least 60% of its tokens (bar lines, repeat
 * marks, N.C., brackets and dashes not counted) must be chords, and there must
 * be two chords, N.C. included, or the spacing chord lines have (indent, wide
 * gaps or bar lines), so a one-word lyric line such as "A" or "Am" is not
 * taken for one. A line of only N.C. ("N.C.", "| N.C. | N.C. |") is a line of
 * chords too: an a cappella intro or a band break. N.C. inside a line of words
 * ("Back home in N.C.") leaves it a lyric.
 */
export function isChordLine(line: string): boolean {
  const text = line.replace(/\s+$/, '');
  const tokens = text.split(/\s+/).filter(Boolean);
  const silent = tokens.filter(isNoChord).length;
  const counted = tokens.filter((t) => !STRUCTURAL.test(t) && !isNoChord(t));
  if (counted.length === 0)
    return silent > 0 && tokens.every((t) => isNoChord(t) || BAR_MARKS.test(t));
  const chords = counted.filter((t) => chordToken(t) !== null).length;
  if (chords / counted.length < 0.6) return false;
  const spaced = /^\s/.test(text) || /\S\s{2,}\S/.test(text) || text.includes('|');
  return chords + silent >= 2 || spaced;
}

/** A line of one chord and nothing else, such as "G" or "Am7". */
function loneChord(line: string): boolean {
  const t = line.trim();
  return t !== '' && !/\s/.test(t) && chordToken(t) !== null;
}

/** A line of words: not chords, not a section name, not a lone chord. */
const isWords = (line: string | undefined): line is string =>
  !!line && /\p{L}/u.test(line) && !isChordLine(line) && !parseHeader(line) && !loneChord(line);

/**
 * Lines (1-based) that hold one chord and nothing else, at the start of the
 * line, over a line of words: chord sites write a chord that lasts the whole
 * line that way. `isChordLine` can't tell "G" from a one-word lyric on its
 * own, so the lines around it decide. It is a chord line when the line under
 * it is words, the line above is the start, a blank line, a section name, or
 * words that already sit under a line of chords (so it starts a new pair), and
 * the sheet has other lines of chords or at least two such lines. "A" or "Am"
 * in a run of lyrics stays a lyric.
 */
export function loneChordLines(lines: readonly string[]): Set<number> {
  const lone = new Set<number>();
  const chordsAt = (i: number) => i >= 0 && (lone.has(i) || isChordLine(lines[i]!));
  lines.forEach((line, i) => {
    if (!loneChord(line) || isChordLine(line) || parseHeader(line) || !isWords(lines[i + 1]))
      return;
    const prev = lines[i - 1];
    const starts =
      prev === undefined ||
      !prev.trim() ||
      parseHeader(prev) !== null ||
      (isWords(prev) && chordsAt(i - 2));
    if (starts) lone.add(i);
  });
  const others = lines.some((l) => isChordLine(l));
  return others || lone.size >= 2 ? new Set([...lone].map((i) => i + 1)) : new Set();
}

/**
 * Where each word-run starts in a lyric line cut at these columns: each cut
 * moved back to the start of the word it falls in, so words stay whole. The
 * first takes everything before it too (a pickup).
 */
function cutPoints(line: string, cols: readonly number[]): number[] {
  const out: number[] = [];
  cols.forEach((c, i) => {
    let at = i === 0 ? 0 : Math.min(c, line.length);
    while (at > 0 && /\S/.test(line[at - 1]!) && /\S/.test(line[at] ?? '')) at--;
    out.push(Math.max(at, out.at(-1) ?? 0));
  });
  return out;
}

/** Words to keep in a bar: one line, cut at a word to `LIMITS.lyric` characters. */
function fit(text: string): { words: string | undefined; cut: boolean } {
  const words = tidyLyric(text);
  if (!words || words.length <= LIMITS.lyric) return { words, cut: false };
  const head = words.slice(0, LIMITS.lyric + 1);
  const space = head.lastIndexOf(' ');
  return {
    words: (space > 0 ? head.slice(0, space) : words.slice(0, LIMITS.lyric)).trim(),
    cut: true,
  };
}

/** A lyric line cut at the chords' columns: the words under each. */
function cutLyric(line: string, cols: readonly number[]) {
  const points = cutPoints(line, cols);
  let cut = false;
  const words = points.map((p, i) => {
    const w = fit(line.slice(p, points[i + 1]));
    cut ||= w.cut;
    return w.words;
  });
  return { words, cut };
}

/** Columns where each bar of a bar-line line starts, for the bars it reads (one pass). */
function barColumns(body: string, offset: number): number[] {
  const cols: number[] = [];
  const plain = body.replace(/\|:|:\||\|{2,}/g, (m) => '|'.padEnd(m.length, ' '));
  for (const m of plain.matchAll(/[^|]+/g)) {
    const lead = m[0].length - m[0].trimStart().length;
    const cell = m[0].trim();
    if (!cell || REPEAT_MARK.test(cell) || /^[./\s]+$/.test(cell)) continue;
    cols.push(offset + m.index + lead);
  }
  return cols;
}

const REPEAT_MARK = /^(?:x\s?\d+|\d+\s?x)$/i;

/** Words of several chords in one bar, joined and cut to fit. */
const joinWords = (words: readonly (string | undefined)[]) =>
  fit(words.filter(Boolean).join(' ')).words;

/** The way a line becomes bars unless asked otherwise: estimated when it can be. */
export const defaultLineBars = (line: PastedLine): LineBars =>
  line.estimate ? 'estimated' : 'one';

/**
 * The words in each bar of a line with kept lyrics: one chord a bar, or two
 * (`per`), joined; a bar-line line's words are already by bar.
 */
export function barWords(line: PastedLine, per: 1 | 2 = 1): (string | undefined)[] {
  const words = line.words ?? [];
  if (line.bars) return line.bars.map((_, i) => words[i]);
  const out: (string | undefined)[] = [];
  for (let i = 0; i < line.chords.length; i += per) out.push(joinWords(words.slice(i, i + per)));
  return out;
}

/**
 * The bars a line of chords becomes, with its kept words: bar lines as typed;
 * otherwise estimated from the lyrics (each chord's words on the bar where it
 * starts), or one or two chords a bar.
 */
export function lineBars(line: PastedLine, how: LineBars, beatsPerBar: number): ChartBar[] {
  if (line.bars) {
    const words = barWords(line);
    return line.bars.map((b, i) => withLyric(b, words[i]));
  }
  if (how === 'estimated' && line.estimate) {
    const bars = rebar(line.estimate.chords, beatsPerBar);
    if (!line.words) return bars;
    const byBar: (string | undefined)[][] = bars.map(() => []);
    let beat = 0;
    line.estimate.chords.forEach((c, i) => {
      byBar[Math.floor(beat / beatsPerBar)]?.push(line.words?.[i]);
      beat += c.beats;
    });
    return bars.map((b, i) => withLyric(b, joinWords(byBar[i]!)));
  }
  const per = how === 'two' ? 2 : 1;
  const words = line.words ? barWords(line, per) : [];
  const out: ChartBar[] = [];
  for (let i = 0; i < line.chords.length; i += per) {
    const symbols = line.chords.slice(i, i + per);
    const beats = evenBeats(symbols.length, beatsPerBar);
    const bar = { chords: symbols.map((symbol, k) => ({ symbol, beats: beats[k]! })) };
    out.push(withLyric(bar, words[i / per]));
  }
  return out;
}

/**
 * Read a pasted chord sheet: chords over lyrics, inline [C]la la chords, bar
 * lines (| C | G |) and section headers ([Verse], Chorus:, Reff 2x, Bait 2).
 * Lyrics are dropped as they are read, so only chords, section labels and
 * structure are kept, unless `keepLyrics` asks to keep each lyric line with
 * the chords right above it. Pasted sheets carry no bar lines, but a lyric
 * line under a line of chords (or words around inline chords) says where each
 * chord changes: that is read, in passing, into an estimate of how long each
 * chord lasts (`estimate`), and the words are dropped unless kept.
 */
export function parseSheet(
  text: string,
  beatsPerBar: number,
  options: ParseSheetOptions = {},
): ParsedSheet {
  const keep = options.keepLyrics === true;
  const lines: PastedLine[] = [];
  const sections: PastedSection[] = [];
  let lyricLines = 0;
  let keptLines = 0;
  let current: number | null = null;
  /** Columns of each chord (or bar) on a line of chords, by line number. */
  const columns = new Map<number, number[]>();
  /** Chords and their columns on a line of chords (not bar lines), by line number, for timing. */
  const placed = new Map<number, LineChord[]>();
  /**
   * Lines to time, with their words, read only for this call: the whole sheet
   * is timed at the end, at one speed. The words go no further.
   */
  const toTime: { line: PastedLine; chords: LineChord[]; lyric: string }[] = [];
  const ensureSection = () => {
    if (current === null) {
      sections.push({ label: 'Section', type: 'custom', repeat: 1 });
      current = sections.length - 1;
    }
    return current;
  };

  const readChords = (
    n: number,
    body: string,
    offset = 0,
    extra: Partial<PastedLine> = {},
    lone = false,
  ): PastedLine | null => {
    if (body.includes('|') && isChordLine(body)) {
      const { bars } = parseBars(body, beatsPerBar);
      const chords = bars.flatMap((b) => b.chords.map((c) => c.symbol));
      const unknown = chords.filter((c) => c !== NO_CHORD && !normalizeChord(c));
      columns.set(n, barColumns(body, offset));
      return {
        n,
        kind: 'bars',
        chords,
        unknown,
        dense: false,
        lyricsRemoved: false,
        section: ensureSection(),
        bars,
        ...extra,
      };
    }
    if (lone || isChordLine(body)) {
      const tokens = body.split(/\s+/).filter((t) => t && !STRUCTURAL.test(t) && !isNoChord(t));
      const chords: string[] = [];
      const unknown: string[] = [];
      for (const t of tokens) {
        const sym = chordToken(t);
        if (sym) chords.push(sym);
        else unknown.push(bare(t));
      }
      // N.C. is structural for judging the line, but it is kept as a bar.
      const all: string[] = [];
      const cols: number[] = [];
      for (const m of body.matchAll(/\S+/g)) {
        const t = m[0];
        const entry = isNoChord(t)
          ? NO_CHORD
          : (chordToken(t) ?? (STRUCTURAL.test(t) ? null : bare(t)));
        if (entry === null) continue;
        all.push(entry);
        cols.push(offset + m.index);
      }
      columns.set(n, cols);
      placed.set(
        n,
        all.map((symbol, i) => ({ symbol, col: cols[i]! })),
      );
      return {
        n,
        kind: 'chords',
        chords: all,
        unknown,
        dense: chords.length > LIMITS.chordsPerBar,
        lyricsRemoved: false,
        section: ensureSection(),
        ...extra,
      };
    }
    return null;
  };

  const rows = text.split(/\r?\n/).map(expandTabs);
  const lone = loneChordLines(rows);
  rows.forEach((line, i) => {
    const n = i + 1;
    if (!line.trim()) {
      lines.push({
        n,
        kind: 'blank',
        chords: [],
        unknown: [],
        dense: false,
        lyricsRemoved: false,
        section: current,
      });
      return;
    }

    // Inline chords: [C]la la [G]la. Brackets holding a chord are chords, not headers.
    const inline = [...line.matchAll(INLINE)].map((m) => m[1]!.trim());
    const inlineChords = inline
      .map((c) => normalizeChord(c))
      .filter((c): c is string => c !== null);
    if (inlineChords.length > 0 && inlineChords.length === inline.length) {
      const leftover = line.replace(INLINE, ' ').trim();
      const hasWords = /\p{L}/u.test(leftover);
      // Kept: the words between the chords, with the chords taken out of the line.
      let plain = '';
      const cols: number[] = [];
      let from = 0;
      for (const m of line.matchAll(INLINE)) {
        plain += line.slice(from, m.index);
        cols.push(plain.length);
        from = m.index + m[0].length;
      }
      plain += line.slice(from);
      const kept = keep && hasWords ? cutLyric(plain, cols) : null;
      if (kept) keptLines++;
      else if (hasWords) lyricLines++;
      const inlineLine: PastedLine = {
        n,
        kind: 'inline',
        chords: inlineChords,
        unknown: [],
        dense: inlineChords.length > LIMITS.chordsPerBar,
        lyricsRemoved: hasWords && !kept,
        section: ensureSection(),
        ...(kept ? { words: kept.words, ...(kept.cut ? { cut: true } : {}) } : {}),
      };
      if (hasWords)
        toTime.push({
          line: inlineLine,
          chords: inlineChords.map((symbol, k) => ({ symbol, col: cols[k]! })),
          lyric: plain,
        });
      lines.push(inlineLine);
      return;
    }

    const header = parseHeader(line);
    if (header) {
      sections.push({
        label: header.label,
        type: header.type,
        repeat: Math.min(LIMITS.repeat, header.repeat),
      });
      current = sections.length - 1;
      const rest = header.rest;
      // Where the chords after the name start on the line, so lyrics under them line up.
      const offset = rest ? line.trimEnd().length - rest.length : 0;
      const chordsAfter = rest ? readChords(n, rest, offset, { kind: 'header' }) : null;
      if (chordsAfter) lines.push({ ...chordsAfter, kind: 'header' });
      else {
        const removed = /\p{L}/u.test(rest);
        if (removed) lyricLines++;
        lines.push({
          n,
          kind: 'header',
          chords: [],
          unknown: [],
          dense: false,
          lyricsRemoved: removed,
          section: current,
        });
      }
      return;
    }

    const chordLine = readChords(n, line, 0, {}, lone.has(n));
    if (chordLine) {
      lines.push(chordLine);
      return;
    }
    // Right under a line of chords: the words time its chords, then are dropped unless kept.
    const above = lines.at(-1);
    const under = above?.n === n - 1 ? above : undefined;
    const timed = under && !toTime.some((t) => t.line === under) ? placed.get(under.n) : undefined;
    if (under && timed?.length && /\p{L}/u.test(line))
      toTime.push({ line: under, chords: timed, lyric: line });
    const cols = keep && under && !under.words ? columns.get(under.n) : undefined;
    if (above && cols?.length) {
      const { words, cut } = cutLyric(line, cols);
      above.words = above.bars ? above.bars.map((_, i) => words[i]) : words;
      if (cut) above.cut = true;
      keptLines++;
      lines.push({
        n,
        kind: 'lyric',
        chords: [],
        unknown: [],
        dense: false,
        lyricsRemoved: false,
        section: current,
        under: above.n,
      });
      return;
    }
    lyricLines++;
    lines.push({
      n,
      kind: 'lyric',
      chords: [],
      unknown: [],
      dense: false,
      lyricsRemoved: true,
      section: current,
    });
  });
  const estimates = estimateSheetTiming(toTime, beatsPerBar, { scale: options.scale ?? 1 });
  toTime.forEach((t, i) => (t.line.estimate = estimates[i]));
  return { lines, sections, lyricLines, keptLines };
}

export interface SheetToChartOptions {
  beatsPerBar: number;
  /**
   * How each line of chords becomes bars, by line number. A line not listed
   * takes `defaultLineBars`: estimated if it had words, else one chord a bar.
   */
  lineBars?: ReadonlyMap<number, LineBars>;
  /** Fresh section ids. */
  newId?: () => string;
}

/**
 * Turn a parsed sheet into chart sections and a form. Lines with words are
 * timed from them (or one or two chords a bar, on lines asked for), other
 * lines take a bar a chord, bar lines keep their bars, and kept lyrics go on
 * the bars where their words start. A section that repeats an earlier
 * one, by label with no chords of its own or with the same bars (words
 * included, so a second verse with its own words stays its own section),
 * appears in the form again instead of being entered twice.
 */
export function sheetToChart(
  sheet: ParsedSheet,
  opts: SheetToChartOptions,
): Pick<ChordChart, 'sections' | 'form'> {
  let counter = 0;
  const newId = opts.newId ?? (() => `s${++counter}`);
  const built = sheet.sections.map((s, si) => {
    const bars: ChartBar[] = [];
    for (const line of sheet.lines) {
      if (line.section !== si || line.chords.length === 0) continue;
      const how = opts.lineBars?.get(line.n) ?? defaultLineBars(line);
      bars.push(...lineBars(line, how, opts.beatsPerBar));
    }
    return { ...s, bars: bars.slice(0, LIMITS.barsPerSection) };
  });

  const sections: ChartSection[] = [];
  const form: string[] = [];
  const key = (label: string) => label.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const s of built) {
    const sameLabel = sections.find((x) => key(x.label) === key(s.label));
    const sameMusic = sections.find(
      (x) => sectionTypeOf(x.label) === s.type && JSON.stringify(x.bars) === JSON.stringify(s.bars),
    );
    if (s.bars.length === 0 && sameLabel) {
      form.push(sameLabel.id);
      continue;
    }
    if (s.bars.length === 0) continue;
    if (sameMusic && sameMusic.repeat === s.repeat) {
      form.push(sameMusic.id);
      continue;
    }
    const id = newId();
    sections.push({ id, label: s.label, type: s.type, bars: s.bars, repeat: s.repeat });
    form.push(id);
  }
  return { sections: sections.slice(0, LIMITS.sections), form: form.slice(0, LIMITS.form) };
}
