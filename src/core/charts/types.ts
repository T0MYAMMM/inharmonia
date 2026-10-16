import type { Mode } from '../theory';
import type { SectionType } from './sections';

/** Stored chart shape. Bump it and add a step to `migrateChart` when the shape changes. */
export const CHART_VERSION = 1;

export const LIMITS = {
  title: 80,
  notes: 500,
  sections: 24,
  barsPerSection: 32,
  form: 40,
  /** Bars once the form is written out, repeats included. */
  expandedBars: 400,
  chordsPerBar: 4,
  repeat: 8,
} as const;

/** A chord in a bar, or N.C. (no chord), lasting `beats`. */
export interface ChartChord {
  symbol: string;
  beats: number;
}

export interface ChartBar {
  /** 1 to 4 chords whose beats add up to the bar. */
  chords: ChartChord[];
}

export interface ChartSection {
  id: string;
  /** As the user wrote it: "Bait 2", "Reff", "Chorus". */
  label: string;
  /** What it is, for logic: Bait → verse, Reff → chorus. */
  type: SectionType;
  bars: ChartBar[];
  /** Play the section this many times wherever it appears in the form. */
  repeat: number;
}

/**
 * A song as a chord chart: sections entered once, a form that orders them, and
 * the key, tempo and meter. Never holds lyrics: only chord symbols, section
 * labels, structure and the user's own notes.
 */
export interface ChordChart {
  version: number;
  title: string;
  key: { tonic: string; mode: Mode };
  tempo: number;
  meter: { beats: 3 | 4; unit: 4 };
  sections: ChartSection[];
  /** Section ids in play order; a section may appear many times. */
  form: string[];
  /** Free text the user typed ("slow down in the bridge"); never filled from a paste. */
  notes: string;
}

export type SimplifyLevel = 'original' | 'simplified' | 'basic';

/**
 * How the chart is shown and played. Kept beside the chart, which stays exactly
 * as entered.
 */
export interface ChartView {
  /** Semitones, -11 to 11. */
  transpose: number;
  simplify: SimplifyLevel;
  /** Accompaniment style id. */
  style: string;
  /** Show Roman numerals under the chord symbols. */
  showFunction: boolean;
}

export const DEFAULT_VIEW: ChartView = {
  transpose: 0,
  simplify: 'original',
  style: 'triad-root',
  showFunction: false,
};

/** Even splits of a bar: 4/4 as 4, 2+2, 2+1+1, 1+1+1+1; 3/4 as 3, 2+1, 1+1+1, 1+1+½+½. */
export function evenBeats(count: number, beatsPerBar: number): number[] {
  const n = Math.max(1, Math.min(LIMITS.chordsPerBar, count));
  if (beatsPerBar === 3) return [[3], [2, 1], [1, 1, 1], [1, 1, 0.5, 0.5]][n - 1]!;
  return [[4], [2, 2], [2, 1, 1], [1, 1, 1, 1]][n - 1]!;
}

/** A bar of these chords, split evenly. */
export function barOf(symbols: readonly string[], beatsPerBar: number): ChartBar {
  const beats = evenBeats(symbols.length, beatsPerBar);
  return {
    chords: symbols
      .slice(0, LIMITS.chordsPerBar)
      .map((symbol, i) => ({ symbol, beats: beats[i]! })),
  };
}

export interface FormEntry {
  section: ChartSection;
  /** Index into `form`. */
  index: number;
}

/** The form with sections looked up, skipping ids that no longer exist. */
export function formEntries(chart: Pick<ChordChart, 'form' | 'sections'>): FormEntry[] {
  const byId = new Map(chart.sections.map((s) => [s.id, s]));
  return chart.form.flatMap((id, index) => {
    const section = byId.get(id);
    return section ? [{ section, index }] : [];
  });
}

/** Bars in play order, with each pass of each section marked where it starts. */
export function expandForm(
  chart: Pick<ChordChart, 'form' | 'sections'>,
): { bar: ChartBar; section: ChartSection; startsSection: boolean; pass: number }[] {
  const out: { bar: ChartBar; section: ChartSection; startsSection: boolean; pass: number }[] = [];
  for (const { section } of formEntries(chart))
    for (let pass = 0; pass < section.repeat; pass++)
      section.bars.forEach((bar, i) =>
        out.push({ bar, section, startsSection: i === 0 && pass === 0, pass }),
      );
  return out;
}

/** A blank chart to start from. */
export function emptyChart(title = ''): ChordChart {
  return {
    version: CHART_VERSION,
    title,
    key: { tonic: 'C', mode: 'major' },
    tempo: 80,
    meter: { beats: 4, unit: 4 },
    sections: [],
    form: [],
    notes: '',
  };
}
