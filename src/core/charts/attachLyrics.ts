import { chroma, parseChord } from '../theory';
import { fitLyric, withLyric, withoutLyrics } from './lyrics';
import { parseSheet } from './paste';
import { MAX_LABEL, type SectionType } from './sections';
import { simplifyChord } from './simplify';
import { NO_CHORD } from './symbols';
import { nearestShift } from './transpose';
import {
  expandForm,
  formEntries,
  LIMITS,
  type ChartSection,
  type ChordChart,
  type FormEntry,
} from './types';

/**
 * Lyrics from a sheet: put the words of a pasted chord sheet (chords over
 * lyrics) onto a chart that already has its chords and their lengths, such as
 * one aligned to a recording. The chart's chords are never changed: the
 * sheet's chords are only matched to them, in order, to find where its words
 * go. The steps:
 *
 * 1. The sheet, read with its lyrics kept: each chord with the words from its
 *    column up to the next chord's, sections played as often as the sheet
 *    says. A chord written again right after itself is one chord held, its
 *    words kept in order as pieces.
 * 2. The chart, the form written out: each chord as you hear it change (a
 *    chord written again in the next bar is one held chord, as `tapChords`
 *    has it), with the form entry, pass, beat it starts on and its length.
 * 3. A global alignment (Needleman–Wunsch) of the two, the sheet tried in all
 *    12 transpositions (it may be written for a capo or in another key).
 *    Alike chords score (exact 3, same root and family 2, same root 1),
 *    others and gaps cost 1, and section kinds that agree nudge a pair by ¼.
 * 4. Each aligned sheet chord's words go to the bar its chart chord starts
 *    in; a held sheet chord's pieces are spread over the chart chord by their
 *    estimated lengths. Words of a sheet chord the chart lacks join the chord
 *    before them on the same line (or after, if it starts the line); others
 *    are left out and their lines reported. A bar's words are joined in order
 *    and cut at a word to `LIMITS.lyric`.
 * 5. A section played more than once whose words differ from one time to the
 *    next (verse 1, verse 2) gets a copy for each other set of words, with the
 *    same bars, and the form points to it. Times with no words of their own
 *    share the first set.
 *
 * Nothing here keeps the pasted text: it is read once and only the words
 * placed on bars come back.
 */

export interface AttachOptions {
  /** Fresh ids for section copies. */
  newId?: () => string;
}

export interface AttachedSection {
  id: string;
  label: string;
  /** The section this is a copy of, with other words. */
  copyOf?: string;
  /** Chord changes played in the times this section's words are for, and those the sheet matched. */
  events: number;
  matched: number;
  /** Bars that get words. */
  wordBars: number;
  /** 0-based bars none of whose chords the sheet matched, in any time it is played. */
  unmatchedBars: number[];
}

export interface AttachReport {
  /** Chord changes in the chart as played (held chords once), and those the sheet matched. */
  events: number;
  matched: number;
  /** Semitones the sheet is written above the chart, -6 to 5: 2 for a sheet in D over a chart in C. */
  shift: number;
  /** Bars as played (the form written out), and those with words. */
  bars: number;
  barsWithWords: number;
  /** Every section of the result, copies included, in order. */
  sections: AttachedSection[];
  /** Sheet lines (1-based) whose words found no chord, left out. */
  leftOut: number[];
  /** Labels of played sections that got no words. */
  noWords: string[];
  /** Copies made for other words, and those not made because the chart has `LIMITS.sections`. */
  copies: number;
  copiesSkipped: number;
  /** Sections played ×2 or more in one place whose times had different words: the first is kept. */
  repeatsDiffer: string[];
  /** Some bar's words were cut to `LIMITS.lyric`. */
  cut: boolean;
  /** The sheet has no words under its chords: the chart is returned as it was. */
  noLyrics: boolean;
}

export interface AttachResult extends Pick<ChordChart, 'sections' | 'form'> {
  report: AttachReport;
}

/** A chord by pitch class, so spelling and transposition don't matter. */
interface ChordKey {
  root: number;
  intervals: string;
  bass: number | null;
  /** The plain triad it simplifies to: '' (major), 'm', 'dim' or 'aug'. */
  family: string;
}
type Key = ChordKey | 'nc' | null;

function chordKey(symbol: string): Key {
  if (symbol === NO_CHORD) return 'nc';
  try {
    const info = parseChord(symbol);
    const root = chroma(info.root);
    const bass = info.bass ? chroma(info.bass) : null;
    return {
      root,
      intervals: info.intervals.join(','),
      bass: bass === root ? null : bass,
      family: parseChord(simplifyChord(symbol, 'basic').symbol).suffix,
    };
  } catch {
    return null;
  }
}

const up = (pc: number, by: number) => (((pc + by) % 12) + 12) % 12;

function likeness(sheet: Key, chart: Key, shift: number): 0 | 1 | 2 | 3 {
  if (sheet === 'nc' || chart === 'nc') return sheet === chart ? 3 : 0;
  if (!sheet || !chart || up(sheet.root, shift) !== chart.root) return 0;
  const bass = sheet.bass === null ? null : up(sheet.bass, shift);
  if (sheet.intervals === chart.intervals && bass === chart.bass) return 3;
  return sheet.family === chart.family ? 2 : 1;
}

/**
 * How alike a sheet chord, moved up `shift` semitones, is to a chart chord:
 * 3 the same chord (C and C, Bb/D and Bb/D), 2 the same root and family
 * (C, Cmaj7 and Cadd9; Am and Am7), 1 the same root (C and Cm), 0 unlike.
 */
export function chordLikeness(sheet: string, chart: string, shift = 0): 0 | 1 | 2 | 3 {
  return likeness(chordKey(sheet), chordKey(chart), shift);
}

/** Words under a sheet chord: one piece, or one per time it was written while held. */
interface Piece {
  words: string | undefined;
  /** Its estimated length in beats, to spread a held chord's pieces. */
  weight: number;
  line: number;
  /** Place in the sheet, to join a bar's words in order. */
  order: number;
}

interface SheetEvent {
  key: Key;
  symbol: string;
  type: SectionType;
  pieces: Piece[];
}

interface ChartEvent {
  key: Key;
  type: SectionType;
  /** Index into `formEntries(chart)`. */
  entry: number;
  pass: number;
  /** Beat it starts on, from the section's start, and its length. */
  start: number;
  beats: number;
}

function readSheet(text: string, beatsPerBar: number) {
  const sheet = parseSheet(text, beatsPerBar, { keepLyrics: true });
  const events: SheetEvent[] = [];
  let order = 0;
  let run: SheetEvent[] = [];
  let runSection: number | null = null;
  const flush = () => {
    const repeat = runSection === null ? 1 : (sheet.sections[runSection]?.repeat ?? 1);
    for (let i = 0; i < repeat; i++) events.push(...run.map((e) => ({ ...e })));
    run = [];
  };
  for (const line of sheet.lines) {
    if (line.chords.length === 0 || line.section === null) continue;
    if (line.section !== runSection) {
      flush();
      runSection = line.section;
    }
    const type = sheet.sections[line.section]?.type ?? 'custom';
    const chords: { symbol: string; words: string | undefined; weight: number }[] = line.bars
      ? line.bars.flatMap((bar, b) =>
          bar.chords.map((c, k) => ({
            symbol: c.symbol,
            words: k === 0 ? line.words?.[b] : undefined,
            weight: c.beats,
          })),
        )
      : line.chords.map((symbol, i) => ({
          symbol,
          words: line.words?.[i],
          weight: line.estimate?.chords[i]?.beats ?? beatsPerBar,
        }));
    for (const c of chords) {
      const piece = { words: c.words, weight: Math.max(1, c.weight), line: line.n, order: order++ };
      const last = run.at(-1);
      if (last && last.symbol === c.symbol) last.pieces.push(piece);
      else run.push({ key: chordKey(c.symbol), symbol: c.symbol, type, pieces: [piece] });
    }
  }
  flush();
  const leftOut = sheet.lines.filter((l) => l.lyricsRemoved).map((l) => l.n);
  return { events, leftOut, cut: sheet.lines.some((l) => l.cut) };
}

function readChart(entries: readonly FormEntry[]): ChartEvent[] {
  const out: ChartEvent[] = [];
  entries.forEach(({ section }, entry) => {
    for (let pass = 0; pass < section.repeat; pass++) {
      let at = 0;
      let last: (ChartEvent & { symbol: string }) | null = null;
      for (const bar of section.bars)
        for (const c of bar.chords) {
          if (last && last.symbol === c.symbol) last.beats += c.beats;
          else {
            last = {
              key: chordKey(c.symbol),
              symbol: c.symbol,
              type: section.type,
              entry,
              pass,
              start: at,
              beats: c.beats,
            };
            out.push(last);
          }
          at += c.beats;
        }
    }
  });
  return out;
}

/** Pair scores: a nudge for agreeing section kinds, never enough to make unlike chords pair. */
const SCORE = { unlike: -1, gap: -1, kinds: 0.25 } as const;

function pairScore(s: SheetEvent, c: ChartEvent, shift: number): number {
  const like = likeness(s.key, c.key, shift);
  if (like === 0) return SCORE.unlike;
  return like + (s.type === c.type && s.type !== 'custom' ? SCORE.kinds : 0);
}

/**
 * Needleman–Wunsch: the best global alignment of the sheet's chords (moved
 * up `shift`) to the chart's. `pairs[i]` is the chart event sheet event i
 * aligns to, or -1 for a gap.
 */
function align(sheet: readonly SheetEvent[], chart: readonly ChartEvent[], shift: number) {
  const n = sheet.length;
  const m = chart.length;
  const w = m + 1;
  const score = new Float64Array((n + 1) * w);
  // 0 diagonal, 1 a sheet chord left out, 2 a chart chord left out.
  const from = new Uint8Array((n + 1) * w);
  for (let i = 1; i <= n; i++) {
    score[i * w] = i * SCORE.gap;
    from[i * w] = 1;
  }
  for (let j = 1; j <= m; j++) {
    score[j] = j * SCORE.gap;
    from[j] = 2;
  }
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const diag = score[(i - 1) * w + j - 1]! + pairScore(sheet[i - 1]!, chart[j - 1]!, shift);
      const skipSheet = score[(i - 1) * w + j]! + SCORE.gap;
      const skipChart = score[i * w + j - 1]! + SCORE.gap;
      const best = Math.max(diag, skipSheet, skipChart);
      score[i * w + j] = best;
      from[i * w + j] = best === diag ? 0 : best === skipSheet ? 1 : 2;
    }
  const pairs = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const f = from[i * w + j];
    if (i > 0 && j > 0 && f === 0) pairs[--i] = --j;
    else if (i > 0 && (j === 0 || f === 1)) i--;
    else j--;
  }
  return { score: score[n * w + m]!, pairs };
}

/** Shifts to try, nearest first, so a tie keeps the sheet's own key or the nearest. */
const SHIFTS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, 6];

/** The 0-based bar a beat of a section falls in. */
function barAt(section: ChartSection, beat: number): number {
  let at = 0;
  for (let b = 0; b < section.bars.length; b++) {
    at += section.bars[b]!.chords.reduce((s, c) => s + c.beats, 0);
    if (beat < at - 1e-9) return b;
  }
  return section.bars.length - 1;
}

/** A copy's label: "Verse" → "Verse 2", "Bait 1" → "Bait 2", not one the chart has. */
function copyLabel(label: string, n: number, taken: Set<string>): string {
  const m = /^(.*?)(\s*)(\d+)$/.exec(label);
  for (let k = n; k < n + 100; k++) {
    const [base, tail] = m ? [`${m[1]}${m[2]}`, String(Number(m[3]) + k - 1)] : [label, ` ${k}`];
    const name = `${base.slice(0, MAX_LABEL - tail.length)}${tail}`.trim();
    if (!taken.has(name.toLowerCase())) return name;
  }
  return label;
}

/** Two sets of a section's words that never give one bar different words. */
const agree = (a: readonly (string | undefined)[], b: readonly (string | undefined)[]) =>
  a.every((w, i) => !w || !b[i] || w === b[i]);

/**
 * Put a pasted sheet's lyrics on a chart's bars, its chords untouched: only
 * bars' `lyric` and, where verses differ, copies of sections are added. Any
 * lyrics the chart had are replaced. See the steps at the top of this file.
 */
export function attachLyrics(
  chart: ChordChart,
  sheetText: string,
  opts: AttachOptions = {},
): AttachResult {
  let counter = 0;
  const newId = opts.newId ?? (() => `copy${++counter}`);
  const bpb = chart.meter.beats;
  const plain = withoutLyrics(chart);
  const entries = formEntries(plain);
  const { events: sheet, leftOut: unplaced, cut: cutInSheet } = readSheet(sheetText, bpb);
  const played = readChart(entries);

  let best = { score: -Infinity, shift: 0, pairs: [] as number[] };
  for (const shift of SHIFTS) {
    const a = align(sheet, played, shift);
    if (a.score > best.score) best = { ...a, shift };
  }
  const { pairs, shift } = best;
  const matched = played.map(() => false);
  pairs.forEach((c, s) => {
    if (c >= 0 && likeness(sheet[s]!.key, played[c]!.key, shift) > 0) matched[c] = true;
  });

  // Words by form entry, pass and bar.
  type Placed = { order: number; words: string };
  const placed = new Map<string, Placed[]>();
  const place = (c: ChartEvent, beat: number, p: Piece) => {
    if (!p.words) return;
    const k = `${c.entry}/${c.pass}/${barAt(entries[c.entry]!.section, beat)}`;
    placed.set(k, [...(placed.get(k) ?? []), { order: p.order, words: p.words }]);
  };
  const leftOut = new Set(unplaced);
  /** The nearest aligned sheet chord on this line, before (-1) or after (1) sheet chord `s`. */
  const neighbour = (s: number, line: number, dir: -1 | 1) => {
    for (let k = s + dir; k >= 0 && k < sheet.length; k += dir) {
      if (!sheet[k]!.pieces.some((p) => p.line === line)) return -1;
      if (pairs[k]! >= 0) return k;
    }
    return -1;
  };
  sheet.forEach((s, si) => {
    const c = pairs[si]!;
    if (c >= 0) {
      const ev = played[c]!;
      const total = s.pieces.reduce((t, p) => t + p.weight, 0);
      let acc = 0;
      for (const p of s.pieces) {
        place(ev, ev.start + (acc / total) * ev.beats, p);
        acc += p.weight;
      }
      return;
    }
    for (const p of s.pieces) {
      if (!p.words) continue;
      const before = neighbour(si, p.line, -1);
      const after = before < 0 ? neighbour(si, p.line, 1) : -1;
      if (before >= 0) {
        const ev = played[pairs[before]!]!;
        place(ev, ev.start + ev.beats - 1e-6, p);
      } else if (after >= 0) {
        const ev = played[pairs[after]!]!;
        place(ev, ev.start, p);
      } else leftOut.add(p.line);
    }
  });

  // Each form entry's words, bar by bar: the first pass that has words for a bar.
  let cut = cutInSheet;
  const repeatsDiffer = new Set<string>();
  const entryWords = entries.map(({ section }, e) =>
    section.bars.map((_, b) => {
      let words: string | undefined;
      for (let pass = 0; pass < section.repeat; pass++) {
        const here = placed.get(`${e}/${pass}/${b}`);
        if (!here) continue;
        const fitted = fitLyric(
          [...here]
            .sort((x, y) => x.order - y.order)
            .map((x) => x.words)
            .join(' '),
        );
        cut ||= fitted.cut;
        if (words === undefined) words = fitted.words;
        else if (fitted.words !== words) repeatsDiffer.add(section.label);
      }
      return words;
    }),
  );

  // Sets of words per section: an entry joins the first set it agrees with.
  const sets = new Map<string, { words: (string | undefined)[]; entries: number[] }[]>();
  entryWords.forEach((words, e) => {
    if (words.every((w) => !w)) return;
    const id = entries[e]!.section.id;
    const list = sets.get(id) ?? [];
    const same = list.find((g) => agree(g.words, words));
    if (same) {
      same.words = same.words.map((w, i) => w ?? words[i]);
      same.entries.push(e);
    } else list.push({ words: [...words], entries: [e] });
    sets.set(id, list);
  });

  const sections: ChartSection[] = [];
  const form = [...plain.form];
  const copyOf = new Map<string, string>();
  /** The result section each form entry plays. */
  const entrySection = entries.map((x) => x.section.id);
  const taken = new Set(plain.sections.map((s) => s.label.toLowerCase()));
  let room = LIMITS.sections - plain.sections.length;
  let copies = 0;
  let copiesSkipped = 0;
  for (const s of plain.sections) {
    const list = sets.get(s.id) ?? [];
    const withWords = (words: readonly (string | undefined)[] | undefined) =>
      s.bars.map((b, i) => withLyric(b, words?.[i]));
    sections.push({ ...s, bars: withWords(list[0]?.words) });
    list.slice(1).forEach((set, k) => {
      if (room <= 0) {
        copiesSkipped++;
        return;
      }
      room--;
      copies++;
      const id = newId();
      const label = copyLabel(s.label, k + 2, taken);
      taken.add(label.toLowerCase());
      copyOf.set(id, s.id);
      sections.push({ ...s, id, label, bars: withWords(set.words) });
      for (const e of set.entries) {
        form[entries[e]!.index] = id;
        entrySection[e] = id;
      }
    });
  }

  const report: AttachReport = {
    events: played.length,
    matched: matched.filter(Boolean).length,
    shift: nearestShift(-shift),
    bars: 0,
    barsWithWords: 0,
    sections: sections.map((s) => {
      const evs = played.flatMap((ev, i) => (entrySection[ev.entry] === s.id ? [i] : []));
      const unmatched = new Set<number>();
      const hit = new Set<number>();
      for (const i of evs) {
        const ev = played[i]!;
        const sec = entries[ev.entry]!.section;
        const last = barAt(sec, ev.start + ev.beats - 1e-6);
        for (let b = barAt(sec, ev.start); b <= last; b++) (matched[i] ? hit : unmatched).add(b);
      }
      const copied = copyOf.get(s.id);
      return {
        id: s.id,
        label: s.label,
        ...(copied ? { copyOf: copied } : {}),
        events: evs.length,
        matched: evs.filter((i) => matched[i]).length,
        wordBars: s.bars.filter((b) => b.lyric).length,
        unmatchedBars: [...unmatched].filter((b) => !hit.has(b)).sort((a, b) => a - b),
      };
    }),
    leftOut: [...leftOut].sort((a, b) => a - b),
    noWords: [],
    copies,
    copiesSkipped,
    repeatsDiffer: [...repeatsDiffer],
    cut,
    noLyrics: !sheet.some((s) => s.pieces.some((p) => p.words)),
  };
  const rows = expandForm({ sections, form });
  report.bars = rows.length;
  report.barsWithWords = rows.filter((r) => r.bar.lyric).length;
  report.noWords = [
    ...new Set(rows.map((r) => r.section).filter((s) => s.bars.every((b) => !b.lyric))),
  ].map((s) => s.label);
  if (report.noLyrics) return { sections: chart.sections, form: chart.form, report };
  return { sections, form, report };
}
