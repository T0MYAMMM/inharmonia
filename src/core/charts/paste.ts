import { parseHeader, sectionTypeOf, type SectionType } from './sections';
import { NO_CHORD, normalizeChord } from './symbols';
import { parseBars } from './syntax';
import { evenBeats, LIMITS, type ChartBar, type ChartSection, type ChordChart } from './types';

/**
 * What a pasted line turned out to be. The parser keeps no text from the
 * sheet except chord symbols and section labels: lyric lines are only counted.
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
}

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
}

/** Bar lines, repeat marks, N.C., brackets and dashes: ignored when judging a line. */
const STRUCTURAL = /^(?:\|+:?|:?\|+|%|x\s?\d+|\d+\s?x|n\.?\s?c\.?|[[\]()\-–—/:.~*]+)$/i;
const INLINE = /\[([^\]]{1,24})\]/g;

/** Strip "(Am)" to "Am" before checking whether a token is a chord. */
const bare = (t: string) => t.replace(/^\(+/, '').replace(/\)+$/, '').replace(/,$/, '');

function chordToken(t: string): string | null {
  const sym = normalizeChord(bare(t));
  return sym === NO_CHORD ? null : sym;
}

/**
 * Is this a line of chords? At least 60% of its tokens (bar lines, repeat
 * marks, N.C., brackets and dashes not counted) must be chords, and there must
 * be two chords, or the spacing chord lines have (indent, wide gaps or bar
 * lines), so a one-word lyric line such as "A" or "Am" is not taken for one.
 */
export function isChordLine(line: string): boolean {
  const text = line.replace(/\s+$/, '');
  const tokens = text.split(/\s+/).filter(Boolean);
  const counted = tokens.filter((t) => !STRUCTURAL.test(t));
  if (counted.length === 0) return false;
  const chords = counted.filter((t) => chordToken(t) !== null).length;
  if (chords / counted.length < 0.6) return false;
  const spaced = /^\s/.test(text) || /\S\s{2,}\S/.test(text) || text.includes('|');
  return chords >= 2 || spaced;
}

/**
 * Read a pasted chord sheet: chords over lyrics, inline [C]la la chords, bar
 * lines (| C | G |) and section headers ([Verse], Chorus:, Reff 2x, Bait 2).
 * Lyrics are dropped; only chords, section labels and structure are kept.
 * Pasted sheets carry no timing, so each chord becomes a bar until adjusted.
 */
export function parseSheet(text: string, beatsPerBar: number): ParsedSheet {
  const lines: PastedLine[] = [];
  const sections: PastedSection[] = [];
  let lyricLines = 0;
  let current: number | null = null;
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
    extra: Partial<PastedLine> = {},
  ): PastedLine | null => {
    if (body.includes('|') && isChordLine(body)) {
      const { bars } = parseBars(body, beatsPerBar);
      const chords = bars.flatMap((b) => b.chords.map((c) => c.symbol));
      const unknown = chords.filter((c) => c !== NO_CHORD && !normalizeChord(c));
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
    if (isChordLine(body)) {
      const tokens = body.split(/\s+/).filter((t) => t && !STRUCTURAL.test(t));
      const chords: string[] = [];
      const unknown: string[] = [];
      for (const t of tokens) {
        const sym = chordToken(t);
        if (sym) chords.push(sym);
        else unknown.push(bare(t));
      }
      // N.C. is structural for judging the line, but it is kept as a bar.
      const all = body
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((t) =>
          normalizeChord(t) === NO_CHORD
            ? [NO_CHORD]
            : chordToken(t)
              ? [chordToken(t)!]
              : STRUCTURAL.test(t)
                ? []
                : [bare(t)],
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

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/\t/g, '    ');
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
      const removed = /\p{L}/u.test(leftover);
      if (removed) lyricLines++;
      lines.push({
        n,
        kind: 'inline',
        chords: inlineChords,
        unknown: [],
        dense: inlineChords.length > LIMITS.chordsPerBar,
        lyricsRemoved: removed,
        section: ensureSection(),
      });
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
      const chordsAfter = rest ? readChords(n, rest, { kind: 'header' }) : null;
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

    const chordLine = readChords(n, line);
    if (chordLine) {
      lines.push(chordLine);
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
  return { lines, sections, lyricLines };
}

export interface SheetToChartOptions {
  beatsPerBar: number;
  /** Line numbers to read two chords to a bar instead of one. */
  twoPerBar?: ReadonlySet<number>;
  /** Fresh section ids. */
  newId?: () => string;
}

/**
 * Turn a parsed sheet into chart sections and a form. Each chord is a bar
 * (or two to a bar on lines asked for), bar lines keep their bars. A section
 * that repeats an earlier one, by label with no chords of its own or with the
 * same chords, appears in the form again instead of being entered twice.
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
      if (line.bars) {
        bars.push(...line.bars);
        continue;
      }
      const per = opts.twoPerBar?.has(line.n) ? 2 : 1;
      for (let i = 0; i < line.chords.length; i += per) {
        const symbols = line.chords.slice(i, i + per);
        const beats = evenBeats(symbols.length, opts.beatsPerBar);
        bars.push({ chords: symbols.map((symbol, k) => ({ symbol, beats: beats[k]! })) });
      }
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
