import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import {
  DEFAULT_RULES,
  LESSON_SCHEMA_VERSION,
  NO_CHORD,
  type Bar,
  type Lesson,
} from '../content/types';
import {
  chordToRoman,
  isValidChord,
  voiceChord,
  voiceLeadProgression,
  type SpelledNote,
} from '../theory';
import { MAX_LABEL, SECTION_NAMES, type SectionType } from './sections';
import { simplifyChord } from './simplify';
import { transposeChord, transposeKey, type Key } from './transpose';
import {
  CHART_STYLES,
  CHART_VERSION,
  DEFAULT_VIEW,
  evenBeats,
  expandForm,
  LIMITS,
  type ChartView,
  type ChordChart,
  type SimplifyLevel,
} from './types';

/** Right-hand chords stay around middle C: G3 to E5. */
export const RH_RANGE: [number, number] = [55, 76];

export interface ChartIssue {
  /** Section label and 1-based bar, when the issue is in one. */
  section?: string;
  bar?: number;
  message: string;
}

const SECTION_TYPES = new Set(Object.keys(SECTION_NAMES) as SectionType[]);

/** Everything that would make a chart wrong to save or play. Empty when valid. */
export function chartIssues(chart: ChordChart): ChartIssue[] {
  const out: ChartIssue[] = [];
  if (chart.title.length > LIMITS.title)
    out.push({ message: `Title is over ${LIMITS.title} characters` });
  if (chart.notes.length > LIMITS.notes)
    out.push({ message: `Notes are over ${LIMITS.notes} characters` });
  const tonics: readonly string[] = chart.key.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  if (!tonics.includes(chart.key.tonic))
    out.push({ message: `Unknown key ${chart.key.tonic} ${chart.key.mode}` });
  if (!(chart.tempo >= 30 && chart.tempo <= 240))
    out.push({ message: 'Tempo must be 30 to 240 bpm' });
  if (chart.meter.beats !== 3 && chart.meter.beats !== 4)
    out.push({ message: 'Meter must be 3/4 or 4/4' });
  if (chart.sections.length === 0) out.push({ message: 'Add a section' });
  if (chart.sections.length > LIMITS.sections)
    out.push({ message: `Up to ${LIMITS.sections} sections` });
  const ids = new Set<string>();
  for (const s of chart.sections) {
    if (ids.has(s.id)) out.push({ section: s.label, message: 'Two sections share an id' });
    ids.add(s.id);
    if (!s.label.trim() || s.label.length > MAX_LABEL)
      out.push({ section: s.label, message: `Name it in up to ${MAX_LABEL} characters` });
    if (!SECTION_TYPES.has(s.type))
      out.push({ section: s.label, message: `Unknown section type ${s.type}` });
    if (!(Number.isInteger(s.repeat) && s.repeat >= 1 && s.repeat <= LIMITS.repeat))
      out.push({ section: s.label, message: `Repeat must be 1 to ${LIMITS.repeat}` });
    if (s.bars.length === 0) out.push({ section: s.label, message: 'Has no bars' });
    if (s.bars.length > LIMITS.barsPerSection)
      out.push({ section: s.label, message: `Up to ${LIMITS.barsPerSection} bars a section` });
    s.bars.forEach((b, i) => {
      const where = { section: s.label, bar: i + 1 };
      if (b.chords.length < 1 || b.chords.length > LIMITS.chordsPerBar)
        out.push({ ...where, message: `A bar holds 1 to ${LIMITS.chordsPerBar} chords` });
      let total = 0;
      const even = evenBeats(b.chords.length, chart.meter.beats);
      const isEven = b.chords.every((c, k) => c.beats === even[k]);
      for (const c of b.chords) {
        if (c.symbol !== NO_CHORD && !isValidChord(c.symbol))
          out.push({ ...where, message: `"${c.symbol}" is not a chord` });
        if (!(c.beats > 0) || (!Number.isInteger(c.beats) && !isEven))
          out.push({
            ...where,
            message: 'Chord lengths are whole beats, or an even split of the bar',
          });
        total += c.beats;
      }
      if (Math.abs(total - chart.meter.beats) > 1e-9)
        out.push({ ...where, message: `Chords last ${total} beats, not ${chart.meter.beats}` });
    });
  }
  if (chart.form.length === 0) out.push({ message: 'The form is empty: add a section to it' });
  if (chart.form.length > LIMITS.form)
    out.push({ message: `The form holds up to ${LIMITS.form} entries` });
  for (const id of chart.form)
    if (!ids.has(id)) out.push({ message: `The form names a missing section` });
  const length = expandForm(chart).length;
  if (length > LIMITS.expandedBars)
    out.push({
      message: `The song is ${length} bars long written out; the limit is ${LIMITS.expandedBars}`,
    });
  return out;
}

/** Read a stored chart of any version into the current shape. */
export function migrateChart(raw: { version?: unknown } & Record<string, unknown>): ChordChart {
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > CHART_VERSION)
    throw new Error('This chart was made by a newer version of Inharmonia.');
  // Version 1 is current. Older shapes would be upgraded here, one step at a time.
  return {
    ...(raw as unknown as ChordChart),
    version: CHART_VERSION,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/** A view with every field present and in range. */
export function cleanView(raw: Partial<ChartView> | undefined): ChartView {
  const v = { ...DEFAULT_VIEW, ...(raw ?? {}) };
  const levels: SimplifyLevel[] = ['original', 'simplified', 'basic'];
  return {
    transpose: Number.isInteger(v.transpose) && Math.abs(v.transpose) <= 11 ? v.transpose : 0,
    simplify: levels.includes(v.simplify) ? v.simplify : 'original',
    style: CHART_STYLES.some((x) => x.id === v.style) ? v.style : DEFAULT_VIEW.style,
    showFunction: v.showFunction === true,
  };
}

function numeral(symbol: string, key: Key): string | undefined {
  try {
    return chordToRoman(symbol, key.tonic, key.mode);
  } catch {
    return undefined;
  }
}

/** One chord as the view plays it. */
export interface PlayedChord {
  /** Index of the written-out bar. */
  bar: number;
  /** Symbol shown and played by the right hand. */
  symbol: string;
  /** The chord as entered (transposed), when the view simplifies it. */
  original?: string;
  /** Slash bass kept for the left hand at Simplified. */
  bass?: string;
  beats: number;
  /** Right-hand notes, voice-led from the chord before; empty for N.C. */
  voicing: SpelledNote[];
}

/** The key the view plays in. */
export function viewKey(chart: ChordChart, view: ChartView): Key {
  return transposeKey(chart.key, view.transpose);
}

/** The right hand's shape for a symbol: the chord without its slash bass. */
function handShape(symbol: string): string {
  return symbol.replace(/\/.*$/, '');
}

/**
 * Every chord of the written-out form as the view plays it: transposed (spelled
 * for the new key), simplified, and voiced so the right hand moves as little as
 * possible around middle C. The chart itself is not changed.
 */
export function playedChords(chart: ChordChart, view: ChartView = DEFAULT_VIEW): PlayedChord[][] {
  const rows = expandForm(chart).slice(0, LIMITS.expandedBars);
  const to = viewKey(chart, view).tonic;
  const bars = rows.map((r) =>
    r.bar.chords.map((c) => {
      if (c.symbol === NO_CHORD) return { symbol: NO_CHORD, beats: c.beats };
      const moved = transposeChord(c.symbol, chart.key.tonic, to, chart.key.mode);
      const simple = simplifyChord(moved, view.simplify);
      return {
        symbol: simple.symbol,
        beats: c.beats,
        ...(simple.symbol !== moved ? { original: moved } : {}),
        ...(simple.bass ? { bass: simple.bass } : {}),
      };
    }),
  );
  const shapes = bars
    .flat()
    .filter((c) => c.symbol !== NO_CHORD)
    .map((c) => handShape(c.symbol));
  const voicings = shapes.length
    ? voiceLeadProgression(shapes, {
        style: 'close',
        range: RH_RANGE,
        start: voiceChord(shapes[0]!, { style: 'close', floor: 'C4' }).map((n) => n.midi),
      })
    : [];
  let k = 0;
  return bars.map((chords, bar) =>
    chords.map((c) => ({
      ...c,
      bar,
      voicing: c.symbol === NO_CHORD ? [] : voicings[k++]!,
    })),
  );
}

/**
 * The chart as a playable lesson in the view's key, simplify level and style:
 * the form written out (repeats included), a section marker where each section
 * starts, right-hand voicings voice-led around middle C, and the left hand on
 * the root (or slash bass). N.C. slots stay silent. The chart is not changed.
 */
export function chartToLesson(
  id: string,
  chart: ChordChart,
  view: ChartView = DEFAULT_VIEW,
): Lesson {
  const rows = expandForm(chart).slice(0, LIMITS.expandedBars);
  const key = viewKey(chart, view);
  const played = playedChords(chart, view);
  const bars: Bar[] = played.map((chords, i) => ({
    chords: chords.map((c) => {
      if (c.symbol === NO_CHORD) return { symbol: NO_CHORD, beats: c.beats };
      const n = numeral(c.symbol, key);
      return {
        symbol: c.symbol,
        beats: c.beats,
        ...(n ? { numeral: n } : {}),
        ...(c.bass ? { bass: c.bass } : {}),
        ...(c.original ? { original: c.original } : {}),
        voicing: { notes: c.voicing.map((v) => v.name) },
      };
    }),
    ...(rows[i]!.startsSection ? { section: rows[i]!.section.label } : {}),
  }));
  return {
    id,
    schemaVersion: LESSON_SCHEMA_VERSION,
    title: chart.title.trim() || 'Untitled chart',
    kind: 'chart',
    source: { kind: 'user' },
    key,
    meter: chart.meter,
    tempo: {
      default: chart.tempo,
      min: Math.min(40, chart.tempo),
      max: Math.max(200, chart.tempo),
    },
    lhPattern: view.style,
    rules: { ...DEFAULT_RULES, hands: ['lh'] },
    bars,
  };
}
