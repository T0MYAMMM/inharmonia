import { chartIssues, cleanView, migrateChart } from '../charts/compile';
import { SECTION_NAMES, MAX_LABEL, type SectionType } from '../charts/sections';
import { parseBars } from '../charts/syntax';
import { CHART_VERSION, LIMITS, type ChartView, type ChordChart } from '../charts/types';
import { validateLesson } from '../content/compile';
import { progressionIssues } from '../content/progressionText';
import { MAJOR_KEYS, MINOR_KEYS } from '../content/realize';
import {
  DEFAULT_RULES,
  LESSON_SCHEMA_VERSION,
  NO_CHORD,
  type ContentSource,
  type Lesson,
  type Progression,
} from '../content/types';
import { lessonToDraft, toLesson, type SongDraft } from '../songs/draft';
import { cleanDraft, type UserRecording } from '../songs/library';
import { isValidChord, spelled } from '../theory';
import { FILE_LIMITS, FORMAT, FORMAT_VERSION, type ItemKind } from './types';

export interface ImportContext {
  /** Left-hand pattern ids the app knows. */
  patterns: ReadonlySet<string>;
  fallbackPattern: string;
  /** Largest file accepted, in characters (default FILE_LIMITS.bytes). */
  maxBytes?: number;
}

export type ImportedValue =
  | { kind: 'song'; lesson: Lesson; draft: SongDraft }
  | { kind: 'chart'; chart: ChordChart; view: ChartView }
  | { kind: 'progression'; progression: Progression };

export interface ImportedItem {
  /** 1-based position in the file. */
  index: number;
  kind: ItemKind;
  /** The id written in the file. */
  id: string;
  title: string;
  source: ContentSource;
  updatedAt: number | null;
  value: ImportedValue;
}

export interface ImportError {
  item?: number;
  title?: string;
  /** Where in the item, as a path: "chart.sections[0].bars[2]". */
  field?: string;
  message: string;
}

export type RecordingData = Omit<UserRecording, 'songId'>;

export interface ParsedFile {
  /** The version the file was written in (1 files are upgraded). */
  version: number;
  items: ImportedItem[];
  /** Recordings by the song id they belong to. */
  recordings: Map<string, RecordingData>;
  /** Anything wrong. When there are errors nothing should be saved. */
  errors: ImportError[];
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown, lo: number, hi: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;

class Fail extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (field: string, message: string): never => {
  throw new Fail(field, message);
};

function key(raw: unknown, field: string): { tonic: string; mode: 'major' | 'minor' } {
  if (!isObj(raw) || (raw.mode !== 'major' && raw.mode !== 'minor'))
    return fail(field, 'needs a tonic and a mode (major or minor)');
  const tonics: readonly string[] = raw.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
  if (typeof raw.tonic !== 'string' || !tonics.includes(raw.tonic))
    return fail(`${field}.tonic`, `"${String(raw.tonic)}" is not a ${raw.mode} key`);
  return { tonic: raw.tonic, mode: raw.mode };
}

function meter(raw: unknown, field: string, allowed: number[]): { beats: number; unit: number } {
  if (!isObj(raw) || !allowed.includes(raw.beats as number) || raw.unit !== 4)
    return fail(field, `must be ${allowed.map((b) => `${b}/4`).join(' or ')}`);
  return { beats: raw.beats as number, unit: 4 };
}

/** A source as written, if it is one; anything else counts as the user's own. */
export function cleanSource(raw: unknown): ContentSource {
  if (!isObj(raw)) return { kind: 'user' };
  switch (raw.kind) {
    case 'original':
      return isStr(raw.author, 80) && raw.author
        ? { kind: 'original', author: raw.author }
        : { kind: 'original' };
    case 'generic':
      return { kind: 'generic' };
    case 'public-domain':
      return isStr(raw.composer, 80) && isNum(raw.year, 0, 3000)
        ? { kind: 'public-domain', composer: raw.composer, year: raw.year }
        : { kind: 'user' };
    default:
      return { kind: 'user' };
  }
}

function readSong(raw: unknown, id: string, title: string, src: ContentSource, ctx: ImportContext) {
  if (!isObj(raw)) return fail('song', 'is missing');
  const k = key(raw.key, 'song.key');
  const m = meter(raw.meter, 'song.meter', [2, 3, 4]);
  const t = raw.tempo;
  if (
    !isObj(t) ||
    !isNum(t.default, 30, 240) ||
    !isNum(t.min, 20, 240) ||
    !isNum(t.max, 30, 300) ||
    !(t.min <= t.default && t.default <= t.max)
  )
    fail('song.tempo', 'needs default, min and max in bpm, with min ≤ default ≤ max');
  const tempo = t as { default: number; min: number; max: number };
  if (raw.summary !== undefined && !isStr(raw.summary, FILE_LIMITS.summary))
    fail('song.summary', `should be text up to ${FILE_LIMITS.summary} characters`);
  const lhPattern =
    typeof raw.lhPattern === 'string' && ctx.patterns.has(raw.lhPattern)
      ? raw.lhPattern
      : ctx.fallbackPattern;
  if (!Array.isArray(raw.bars) || raw.bars.length === 0 || raw.bars.length > FILE_LIMITS.songBars)
    fail('song.bars', `needs 1 to ${FILE_LIMITS.songBars} bars`);
  const bars = (raw.bars as unknown[]).map((b, bi) => {
    const f = `song.bars[${bi}]`;
    if (!isObj(b)) return fail(f, 'is not a bar');
    if (b.section !== undefined && !isStr(b.section, MAX_LABEL))
      fail(`${f}.section`, `should be text up to ${MAX_LABEL} characters`);
    if (!Array.isArray(b.chords) || b.chords.length < 1 || b.chords.length > 4)
      fail(`${f}.chords`, 'needs 1 to 4 chords');
    const chords = (b.chords as unknown[]).map((c, ci) => {
      const cf = `${f}.chords[${ci}]`;
      if (!isObj(c) || typeof c.symbol !== 'string') return fail(cf, 'needs a symbol');
      if (c.symbol !== NO_CHORD && !isValidChord(c.symbol))
        fail(`${cf}.symbol`, `"${c.symbol}" is not a chord`);
      if (!isNum(c.beats, 0.25, 4)) fail(`${cf}.beats`, 'should be a length in beats');
      let voicing: { notes: string[] } | undefined;
      if (c.voicing !== undefined) {
        if (!Array.isArray(c.voicing) || c.voicing.length === 0 || c.voicing.length > 8)
          fail(`${cf}.voicing`, 'should list 1 to 8 notes');
        (c.voicing as unknown[]).forEach((n, ni) => {
          if (typeof n !== 'string' || !noteOk(n))
            fail(`${cf}.voicing[${ni}]`, `"${String(n)}" is not a note`);
        });
        voicing = { notes: c.voicing as string[] };
      }
      return { symbol: c.symbol, beats: c.beats as number, ...(voicing ? { voicing } : {}) };
    });
    if (!Array.isArray(b.melody)) fail(`${f}.melody`, 'should be a list of notes (empty for none)');
    const rh = (b.melody as unknown[]).map((n, ni) => {
      const nf = `${f}.melody[${ni}]`;
      if (!isObj(n) || typeof n.note !== 'string' || (n.note !== 'r' && !noteOk(n.note)))
        return fail(nf, `"${isObj(n) ? String(n.note) : n}" is not a note`);
      if (!isNum(n.beats, 0.05, 4)) fail(`${nf}.beats`, 'should be a length in beats');
      return { note: n.note, beats: n.beats as number, ...(n.tie === true ? { tie: true } : {}) };
    });
    return {
      chords,
      ...(rh.length ? { rh } : {}),
      ...(b.section ? { section: b.section as string } : {}),
    };
  });
  const lesson: Lesson = {
    id,
    schemaVersion: LESSON_SCHEMA_VERSION,
    title,
    ...(raw.summary ? { summary: raw.summary as string } : {}),
    kind: 'song',
    source: src,
    key: k,
    meter: m,
    tempo,
    lhPattern,
    rules: DEFAULT_RULES,
    bars,
  };
  const issues = validateLesson(lesson);
  if (issues.length) {
    const bar = /^Bar (\d+)/.exec(issues[0]!)?.[1];
    fail(bar ? `song.bars[${Number(bar) - 1}]` : 'song', issues[0]!.replace(/^Bar \d+: /, ''));
  }
  const draft = lessonToDraft(lesson);
  // Songs from elsewhere (built-in, or with a named author) stay as written, voicings
  // included; your own songs are rebuilt the way the app builds them.
  const rebuild = src.kind === 'user';
  return { kind: 'song' as const, lesson: rebuild ? toLesson(draft, id) : lesson, draft };
}

function noteOk(n: string): boolean {
  try {
    const s = spelled(n);
    return s.midi >= 12 && s.midi <= 120;
  } catch {
    return false;
  }
}

const SECTION_TYPES = new Set(Object.keys(SECTION_NAMES));

function readChart(raw: unknown, viewRaw: unknown, title: string) {
  if (!isObj(raw)) return fail('chart', 'is missing');
  const k = key(raw.key, 'chart.key');
  const m = meter(raw.meter, 'chart.meter', [3, 4]) as ChordChart['meter'];
  if (!isNum(raw.tempo, 30, 240)) fail('chart.tempo', 'should be 30 to 240 bpm');
  if (raw.notes !== undefined && !isStr(raw.notes, LIMITS.notes))
    fail('chart.notes', `should be text up to ${LIMITS.notes} characters`);
  if (
    !Array.isArray(raw.sections) ||
    raw.sections.length === 0 ||
    raw.sections.length > LIMITS.sections
  )
    fail('chart.sections', `needs 1 to ${LIMITS.sections} sections`);
  const sections = (raw.sections as unknown[]).map((s, si) => {
    const f = `chart.sections[${si}]`;
    if (!isObj(s)) return fail(f, 'is not a section');
    if (typeof s.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(s.id))
      fail(`${f}.id`, 'should be a short id (letters, digits, dashes)');
    if (!isStr(s.label, MAX_LABEL) || !s.label.trim())
      fail(`${f}.label`, `should be a name up to ${MAX_LABEL} characters`);
    const type = SECTION_TYPES.has(s.type as string) ? (s.type as SectionType) : 'custom';
    if (!Number.isInteger(s.repeat) || !isNum(s.repeat, 1, LIMITS.repeat))
      fail(`${f}.repeat`, `should be 1 to ${LIMITS.repeat}`);
    if (!Array.isArray(s.bars) || s.bars.length === 0 || s.bars.length > LIMITS.barsPerSection)
      fail(`${f}.bars`, `needs 1 to ${LIMITS.barsPerSection} bars`);
    const bars = (s.bars as unknown[]).map((b, bi) => {
      const bf = `${f}.bars[${bi}]`;
      if (typeof b !== 'string' || b.length > 80 || b.includes('|') || b.includes('\n'))
        return fail(bf, 'should be one bar of chords, like "Am F"');
      // One bar per string: wrap it in bar lines so "Am F" is one split bar.
      const parsed = parseBars(`| ${b} |`, m.beats);
      if (parsed.issues.length) fail(bf, parsed.issues[0]!.message);
      if (parsed.bars.length !== 1) fail(bf, 'should be exactly one bar');
      return parsed.bars[0]!;
    });
    return {
      id: s.id as string,
      label: (s.label as string).trim(),
      type,
      repeat: s.repeat as number,
      bars,
    };
  });
  if (!Array.isArray(raw.form) || !raw.form.every((x) => typeof x === 'string'))
    fail('chart.form', 'should list section ids');
  const chart = migrateChart({
    version: CHART_VERSION,
    title,
    key: k,
    tempo: raw.tempo as number,
    meter: m,
    sections,
    form: raw.form as string[],
    notes: (raw.notes as string | undefined) ?? '',
  });
  const issues = chartIssues(chart);
  if (issues.length) {
    const i = issues[0]!;
    const si = i.section ? chart.sections.findIndex((s) => s.label === i.section) : -1;
    fail(
      si >= 0 ? `chart.sections[${si}]${i.bar ? `.bars[${i.bar - 1}]` : ''}` : 'chart',
      i.message,
    );
  }
  return {
    kind: 'chart' as const,
    chart,
    view: cleanView(isObj(viewRaw) ? (viewRaw as Partial<ChartView>) : undefined),
  };
}

function readProgression(raw: unknown, id: string, title: string, src: ContentSource) {
  if (!isObj(raw)) return fail('progression', 'is missing');
  const candidate = {
    id: 'imported',
    name: title,
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    mode: raw.mode,
    meter: raw.meter,
    steps: raw.steps,
  };
  const issues = progressionIssues(candidate);
  if (issues.length) fail('progression', issues[0]!.replace(/\.$/, ''));
  const progression: Progression = {
    id,
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: title,
    ...(typeof raw.description === 'string' && raw.description.trim()
      ? { description: raw.description.trim() }
      : {}),
    mode: raw.mode as Progression['mode'],
    meter: { beats: 4, unit: 4 },
    steps: (raw.steps as Progression['steps']).map((s) => ({ numeral: s.numeral, beats: s.beats })),
    source: src,
  };
  return { kind: 'progression' as const, progression };
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readAsset(raw: unknown, field: string): [string, RecordingData] {
  if (!isObj(raw) || raw.kind !== 'recording' || typeof raw.for !== 'string')
    return fail(field, 'is not a recording');
  for (const k of ['sampleRate', 'beat0', 'traceStart', 'traceHop', 'traceShift'])
    if (!isNum(raw[k], -1e6, 1e6)) fail(`${field}.${k}`, 'should be a number');
  if (typeof raw.samples !== 'string' || typeof raw.trace !== 'string')
    fail(field, 'needs samples and trace');
  let pcm: Uint8Array;
  let tr: Uint8Array;
  try {
    pcm = fromBase64(raw.samples as string);
    tr = fromBase64(raw.trace as string);
  } catch {
    return fail(field, 'has damaged audio data');
  }
  if (pcm.length % 2 || tr.length % 4) fail(field, 'has damaged audio data');
  const pv = new DataView(pcm.buffer);
  const tv = new DataView(tr.buffer);
  const samples = new Int16Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = pv.getInt16(i * 2, true);
  const trace = new Float32Array(tr.length / 4);
  for (let i = 0; i < trace.length; i++) trace[i] = tv.getFloat32(i * 4, true);
  return [
    raw.for,
    {
      sampleRate: raw.sampleRate as number,
      beat0: raw.beat0 as number,
      traceStart: raw.traceStart as number,
      traceHop: raw.traceHop as number,
      traceShift: raw.traceShift as number,
      samples,
      trace,
    },
  ];
}

/** Files from before version 2, rewritten as version 2 items. */
function upgradeV1(data: Obj): { items: unknown[] } | null {
  if (data.app === 'inharmonia' && data.kind === 'progressions' && Array.isArray(data.progressions))
    return {
      items: data.progressions.map((p: unknown) =>
        isObj(p)
          ? {
              kind: 'progression',
              id: p.id,
              title: p.name,
              source: p.source,
              progression: {
                mode: p.mode,
                meter: p.meter,
                steps: p.steps,
                description: p.description,
              },
            }
          : p,
      ),
    };
  if (data.format === 'inharmonia-songs' && Array.isArray(data.songs))
    return { items: data.songs.map((s: unknown) => (isObj(s) ? { kind: 'song-v1', ...s } : s)) };
  return null;
}

/**
 * Read an Inharmonia file (version 2, or a version 1 progressions or songs
 * export). Every field is checked; only known fields are read, so unknown text
 * is dropped; lessons are rebuilt from what was read. Any error is reported
 * with its item and field, and then nothing should be saved.
 */
export function parseFile(text: string, ctx: ImportContext): ParsedFile | { fatal: string } {
  if (text.length > (ctx.maxBytes ?? FILE_LIMITS.bytes))
    return { fatal: 'This file is too large to be an Inharmonia export.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { fatal: 'This is not JSON, so it cannot be an Inharmonia export.' };
  }
  if (!isObj(data)) return { fatal: 'This is not an Inharmonia export.' };
  let version: number;
  let rawItems: unknown[];
  const v1 = upgradeV1(data);
  if (v1) {
    version = 1;
    rawItems = v1.items;
  } else if (data.format === FORMAT) {
    if (typeof data.version !== 'number' || data.version > FORMAT_VERSION)
      return {
        fatal: 'This file comes from a newer version of Inharmonia. Update, then try again.',
      };
    if (!Array.isArray(data.items)) return { fatal: 'This export has no items.' };
    version = data.version;
    rawItems = data.items;
  } else return { fatal: 'This is not an Inharmonia export.' };
  if (rawItems.length > FILE_LIMITS.items)
    return { fatal: `This file holds more than ${FILE_LIMITS.items} items.` };

  const out: ParsedFile = { version, items: [], recordings: new Map(), errors: [] };
  rawItems.forEach((raw, i) => {
    const index = i + 1;
    const title =
      isObj(raw) && typeof raw.title === 'string'
        ? raw.title
        : isObj(raw) && isObj(raw.draft) && typeof raw.draft.title === 'string'
          ? raw.draft.title
          : undefined;
    try {
      if (!isObj(raw)) fail('', 'is not an item');
      const item = raw as Obj;
      if (item.kind === 'song-v1') {
        const draft = cleanDraft(item.draft, ctx.patterns, ctx.fallbackPattern);
        if (typeof draft === 'string') fail('draft', draft);
        const d = draft as SongDraft;
        const id = typeof item.id === 'string' ? item.id : `song-${index}`;
        out.items.push({
          index,
          kind: 'song',
          id,
          title: d.title,
          source: { kind: 'user' },
          updatedAt: isNum(item.updatedAt, 0, 1e15) ? item.updatedAt : null,
          value: { kind: 'song', draft: d, lesson: toLesson(d, id) },
        });
        return;
      }
      const kind = item.kind;
      if (kind !== 'song' && kind !== 'chart' && kind !== 'progression')
        fail('kind', `"${String(kind)}" is not song, chart or progression`);
      if (typeof item.id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(item.id))
        fail('id', 'should be a short id (letters, digits, dashes)');
      if (
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        item.title.length > FILE_LIMITS.title
      )
        fail('title', `should be a name up to ${FILE_LIMITS.title} characters`);
      const id = item.id as string;
      const t = (item.title as string).trim();
      const src = cleanSource(item.source);
      const updated = typeof item.updated === 'string' ? Date.parse(item.updated) : NaN;
      const value =
        kind === 'song'
          ? readSong(item.song, id, t, src, ctx)
          : kind === 'chart'
            ? readChart(item.chart, item.view, t)
            : readProgression(item.progression, id, t, src);
      out.items.push({
        index,
        kind: kind as ItemKind,
        id,
        title: t,
        source: src,
        updatedAt: Number.isFinite(updated) ? updated : null,
        value,
      });
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      out.errors.push({
        item: index,
        ...(title ? { title } : {}),
        ...(e.field ? { field: e.field } : {}),
        message: e.message,
      });
    }
  });
  if (Array.isArray(data.assets))
    data.assets.forEach((a, i) => {
      try {
        const [id, rec] = readAsset(a, `assets[${i}]`);
        out.recordings.set(id, rec);
      } catch (e) {
        if (!(e instanceof Fail)) throw e;
        out.errors.push({ field: e.field, message: e.message });
      }
    });
  return out;
}

/** "Item 2 (Sore di Taman), chart.sections[0].bars[3]: "Hx" is not a chord". */
export function describeError(e: ImportError): string {
  const where = [e.item ? `Item ${e.item}${e.title ? ` (${e.title})` : ''}` : '', e.field ?? '']
    .filter(Boolean)
    .join(', ');
  return where ? `${where}: ${e.message}` : e.message;
}
