import { chartIssues, cleanSequence, LIMITS, type ChartBar, type ChordChart } from '../charts';
import { MAX_NAME } from '../content/progressionText';
import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import { cleanMidiProject, type MidiProject } from '../midi/smf';
import type { Mode } from '../theory';

/**
 * What one page hands the next when something is sent from one room to
 * another: a MIDI project to open in Studio, a progression for the builder,
 * a chart for the chart editor, or chords for the chord sequence. It is
 * written before leaving and read on arrival, and comes from this browser's
 * own pages, but it is still checked on arrival like anything read back from
 * storage. Bump `HANDOFF_VERSION` when a shape changes: an older one is then
 * refused, which is safe, since a handoff lasts only until the next.
 */
export const HANDOFF_VERSION = 1;

/** The way back: the page it was sent from, and what to call it. */
export interface HandoffFrom {
  /** A path in the app, with its search: "/progressions/ii-v-i?key=G". */
  to: string;
  label: string;
}

/** A progression for the builder: what the builder's own fields hold. */
export interface ProgressionPrefill {
  name: string;
  mode: Mode;
  /** The chords as the builder reads them: "I vi IV,V". */
  text: string;
  /** The key the preview plays in, so it sounds as it did where it came from. */
  previewKey: string;
}

export type Handoff =
  | {
      kind: 'studio';
      from: HandoffFrom;
      project: MidiProject;
      /** What was sent, said on arrival. */
      said: string;
    }
  | {
      kind: 'progression';
      from: HandoffFrom;
      prefill: ProgressionPrefill;
      said: string;
      /** What did not come across as it was. */
      notes: string[];
    }
  | { kind: 'chart'; from: HandoffFrom; chart: ChordChart; said: string }
  | {
      kind: 'chords';
      from: HandoffFrom;
      meter: { beats: 3 | 4; unit: 4 };
      bars: ChartBar[];
      /** What the bars are, for the notice: "ii–V–I in G major". */
      what: string;
    };

export type HandoffKind = Handoff['kind'];

/** Text a page said, of a sane length. */
const MAX_TEXT = 400;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isText = (x: unknown, max = MAX_TEXT): x is string =>
  typeof x === 'string' && x.length <= max;

function cleanFrom(raw: unknown): HandoffFrom | null {
  if (!isObject(raw) || !isText(raw.to, 2000) || !isText(raw.label, 200)) return null;
  // Only a path in this app: never another site.
  if (!raw.to.startsWith('/') || raw.to.startsWith('//')) return null;
  return { to: raw.to, label: raw.label };
}

const MODES: readonly Mode[] = ['major', 'minor'];

function cleanPrefill(raw: unknown): ProgressionPrefill | null {
  if (!isObject(raw) || !isText(raw.name, MAX_NAME) || !isText(raw.text, 2000)) return null;
  const mode = MODES.find((m) => m === raw.mode);
  if (!mode) return null;
  const keys: readonly string[] = mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const previewKey = keys.includes(raw.previewKey as string) ? (raw.previewKey as string) : 'C';
  return { name: raw.name, mode, text: raw.text, previewKey };
}

/** A chart with every field of the right kind, so the editor can show it; then its own checks. */
function cleanChart(raw: unknown): ChordChart | null {
  if (!isObject(raw) || !isObject(raw.key) || !isObject(raw.meter)) return null;
  if (!Array.isArray(raw.sections) || !Array.isArray(raw.form)) return null;
  const sectionsOk = raw.sections.every(
    (s) =>
      isObject(s) &&
      typeof s.id === 'string' &&
      typeof s.label === 'string' &&
      typeof s.type === 'string' &&
      typeof s.repeat === 'number' &&
      Array.isArray(s.bars) &&
      s.bars.every(
        (b) =>
          isObject(b) &&
          Array.isArray(b.chords) &&
          b.chords.every(
            (c) => isObject(c) && typeof c.symbol === 'string' && typeof c.beats === 'number',
          ),
      ),
  );
  if (!sectionsOk || !raw.form.every((f) => typeof f === 'string')) return null;
  if (typeof raw.title !== 'string' || typeof raw.notes !== 'string') return null;
  if (typeof raw.tempo !== 'number' || typeof raw.version !== 'number') return null;
  const chart = raw as unknown as ChordChart;
  return chartIssues(chart).length ? null : chart;
}

function cleanBody(
  kind: HandoffKind,
  raw: Record<string, unknown>,
  from: HandoffFrom,
): Handoff | null {
  switch (kind) {
    case 'studio': {
      const project = cleanMidiProject(raw.project);
      if (typeof project === 'string' || !isText(raw.said)) return null;
      if (!project.tracks.some((t) => t.notes.length)) return null;
      return { kind, from, project, said: raw.said };
    }
    case 'progression': {
      const prefill = cleanPrefill(raw.prefill);
      const notes = Array.isArray(raw.notes) ? raw.notes.filter((n) => isText(n)).slice(0, 12) : [];
      if (!prefill || !isText(raw.said)) return null;
      return { kind, from, prefill, said: raw.said, notes: notes as string[] };
    }
    case 'chart': {
      const chart = cleanChart(raw.chart);
      if (!chart || !isText(raw.said)) return null;
      return { kind, from, chart, said: raw.said };
    }
    case 'chords': {
      const seq = cleanSequence({ meter: raw.meter, bars: raw.bars });
      if (!seq || !seq.bars.length || !isText(raw.what)) return null;
      return {
        kind,
        from,
        meter: seq.meter,
        bars: seq.bars.slice(0, LIMITS.barsPerSection),
        what: raw.what,
      };
    }
  }
}

/** A handoff read back, checked: the same kind, every field in range. Null when it is not one. */
export function cleanHandoff(raw: unknown, kind: HandoffKind): Handoff | null {
  if (!isObject(raw) || raw.kind !== kind) return null;
  const from = cleanFrom(raw.from);
  return from ? cleanBody(kind, raw, from) : null;
}

/**
 * A project title that names where it came from, within the 80 characters a
 * MIDI title keeps: "Harbour lights (chart, G major)". A long name is cut.
 */
export function sentTitle(name: string, detail: string): string {
  const tail = ` (${detail})`;
  const plain = name.trim() || 'Untitled';
  const room = 80 - tail.length;
  return `${plain.length > room ? `${plain.slice(0, room - 1)}…` : plain}${tail}`;
}
