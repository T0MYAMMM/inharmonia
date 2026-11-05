import { LIBRARY_LIMITS, RETIRED_PIECES } from '@config/library';
import { composerName, creditLine } from '../content/credit';
import {
  SONG_LEVELS,
  type Bar,
  type Lesson,
  type Meter,
  type NoteSpec,
  type SongLevel,
} from '../content/types';
import type { Mode } from '../theory';

/**
 * The song catalogue's index, which lists every song without loading any,
 * and the preview each entry carries. Light enough for the Songs page: the
 * rules a song's file must pass are in rules.ts, with the file reader. Pure:
 * no fetch, no storage.
 */

/**
 * A song's opening melody, for a drawing of it on a staff. Shared with the
 * drawing in src/ui/art, which reads exactly this shape.
 */
export interface SongPreview {
  meter: { beats: number; unit: number };
  /** Melody only, one string per bar: "<note>:<beats>" or "r:<beats>", "~" after a tied note. Beats in the meter's unit. */
  bars: string[];
}

/** Notes and rests a preview holds at most. */
export const PREVIEW_MAX_NOTES = 24;

/**
 * How many bars a preview takes after any pickup: at least two, and enough
 * for six quarter-note beats (three bars of 2/4, four of 3/8), but no more
 * than four. With a pickup, an index entry holds one bar more.
 */
export const PREVIEW_BARS = { min: 2, max: 4, quarters: 6 } as const;

const token = (n: NoteSpec) =>
  `${n.note}:${Number(n.beats.toFixed(4))}${n.tie && n.note !== 'r' ? '~' : ''}`;

/** The bars to take after any pickup, in this meter. */
function barsFor(meter: Meter): number {
  const quarters = (meter.beats * 4) / meter.unit;
  let count = PREVIEW_BARS.min;
  while (count < PREVIEW_BARS.max && count * quarters < PREVIEW_BARS.quarters) count++;
  return count;
}

/**
 * The opening of a melody, as a preview. It starts at the first bar that
 * sounds, skipping an introduction that is all rests. When that bar starts
 * with a rest it is a pickup, and the bars after it follow; otherwise the
 * bars start there. Either way it takes at least two bars and six quarter
 * notes' worth, at most four bars (`PREVIEW_BARS`). A bar with no melody is a
 * whole-bar rest. At most `PREVIEW_MAX_NOTES` notes and rests are kept; a bar
 * the cap cuts ends early.
 */
export function previewOf(bars: readonly Bar[], meter: Meter): SongPreview {
  const sounds = (b: Bar) => (b.rh ?? []).some((n) => n.note !== 'r');
  const first = bars.findIndex(sounds);
  const pickup = first >= 0 && bars[first]!.rh![0]!.note === 'r' ? 1 : 0;
  const shown = first < 0 ? [] : bars.slice(first, first + pickup + barsFor(meter));
  const out: string[] = [];
  let left = PREVIEW_MAX_NOTES;
  for (const bar of shown) {
    if (left <= 0) break;
    const notes = bar.rh?.length ? bar.rh : [{ note: 'r', beats: meter.beats }];
    const kept = notes.slice(0, left);
    left -= kept.length;
    out.push(kept.map(token).join(' '));
  }
  return { meter: { beats: meter.beats, unit: meter.unit }, bars: out };
}

/** One version of a piece, as the index lists it. */
export interface CatalogueLevel {
  level: SongLevel;
  /** The song id: "<piece>-<level>". */
  id: string;
  bars: number;
  /** The key this version plays in (Easy may move to an easier one). */
  key: { tonic: string; mode: Mode };
}

/** A piece in an index: enough to show its card and offer it, without its file. */
export interface CatalogueEntry {
  piece: string;
  /** "<piece>.json", next to the index. */
  file: string;
  /** The file's size in bytes, as UTF-8. */
  bytes: number;
  /** The file's SHA-256, lowercase hex: a download must match it. */
  sha256: string;
  title: string;
  /** For the composer filter: the composer, or an original's author. */
  composer: string;
  /** The card's credit line: "Ludwig van Beethoven, 1826 edition". */
  credit: string;
  /** The written key: the Advanced version's, or the only version's. */
  key: { tonic: string; mode: Mode };
  meter: { beats: number; unit: number };
  summary?: string;
  /** Easy to Advanced, as there are. */
  levels: CatalogueLevel[];
  preview: SongPreview;
}

export const LIBRARY_FORMAT = 'inharmonia-library';
export const LIBRARY_SCHEMA = 1;

export interface LibraryIndex {
  format: typeof LIBRARY_FORMAT;
  schema: number;
  songs: CatalogueEntry[];
}

/** A catalogue file's name: the piece id and ".json", nothing that could leave the folder. */
export const CATALOGUE_FILE = /^[a-z0-9-]+\.json$/;
/** A piece id: lowercase letters, digits and dashes. */
export const PIECE_ID = /^[a-z0-9-]{1,60}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Whether a song id ("senja-di-teras", "window-light-easy") belongs to a retired piece. */
export function isRetired(id: string, retired: readonly string[] = RETIRED_PIECES): boolean {
  return retired.some((p) => id === p || SONG_LEVELS.some((l) => id === `${p}-${l}`));
}

/** The index entry for a piece's file, from its songs (which passed `catalogueIssues`). */
export function indexEntry(input: {
  piece: string;
  bytes: number;
  sha256: string;
  songs: readonly Lesson[];
}): CatalogueEntry {
  const rank = (l: Lesson) => SONG_LEVELS.indexOf(l.level!);
  const songs = [...input.songs].sort((a, b) => rank(a) - rank(b));
  const main = songs.at(-1)!;
  const summary = main.summary ?? songs.find((s) => s.summary)?.summary;
  return {
    piece: input.piece,
    file: `${input.piece}.json`,
    bytes: input.bytes,
    sha256: input.sha256,
    title: main.title,
    composer: composerName(main.source),
    credit: creditLine(main.source),
    key: { tonic: main.key.tonic, mode: main.key.mode },
    meter: { beats: main.meter.beats, unit: main.meter.unit },
    ...(summary ? { summary } : {}),
    levels: songs.map((s) => ({
      level: s.level!,
      id: s.id,
      bars: s.bars.length,
      key: { tonic: s.key.tonic, mode: s.key.mode },
    })),
    preview: previewOf(main.bars, main.meter),
  };
}

/** An index as written: one entry per line, so a diff shows the songs that changed. */
export function stringifyIndex(songs: readonly CatalogueEntry[]): string {
  const head = JSON.stringify({ format: LIBRARY_FORMAT, schema: LIBRARY_SCHEMA }).slice(0, -1);
  return `${head},"songs":[\n${songs.map((s) => JSON.stringify(s)).join(',\n')}\n]}\n`;
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isText = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
const isCount = (x: unknown, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max;

function readKey(x: unknown): { tonic: string; mode: Mode } | null {
  return isObj(x) && isText(x.tonic, 3) && (x.mode === 'major' || x.mode === 'minor')
    ? { tonic: x.tonic, mode: x.mode }
    : null;
}

function readMeter(x: unknown): { beats: number; unit: number } | null {
  return isObj(x) && isCount(x.beats, 16) && x.beats > 0 && isCount(x.unit, 16) && x.unit > 0
    ? { beats: x.beats, unit: x.unit }
    : null;
}

/** One entry as fetched, checked field by field; null when anything is off. */
function readEntry(x: unknown): CatalogueEntry | null {
  if (!isObj(x) || typeof x.piece !== 'string' || !PIECE_ID.test(x.piece)) return null;
  const piece = x.piece;
  if (x.file !== `${piece}.json` || !CATALOGUE_FILE.test(x.file)) return null;
  if (!isCount(x.bytes, LIBRARY_LIMITS.fileBytes) || x.bytes === 0) return null;
  if (typeof x.sha256 !== 'string' || !SHA256.test(x.sha256)) return null;
  if (!isText(x.title, 80) || !isText(x.composer, 80) || !isText(x.credit, 200)) return null;
  if (x.summary !== undefined && !isText(x.summary, 140)) return null;
  const key = readKey(x.key);
  const meter = readMeter(x.meter);
  if (!key || !meter || !Array.isArray(x.levels) || x.levels.length < 1 || x.levels.length > 3)
    return null;
  const levels: CatalogueLevel[] = [];
  for (const l of x.levels) {
    const lk = isObj(l) ? readKey(l.key) : null;
    if (!isObj(l) || !lk || !SONG_LEVELS.includes(l.level as SongLevel)) return null;
    if (l.id !== `${piece}-${String(l.level)}` || !isCount(l.bars, 1000)) return null;
    if (levels.some((m) => m.level === l.level)) return null;
    levels.push({ level: l.level as SongLevel, id: l.id, bars: l.bars, key: lk });
  }
  const p = x.preview;
  const pm = isObj(p) ? readMeter(p.meter) : null;
  if (!isObj(p) || !pm || !Array.isArray(p.bars)) return null;
  if (p.bars.length > PREVIEW_BARS.max + 1) return null;
  if (!p.bars.every((b) => typeof b === 'string' && b.length <= 400)) return null;
  return {
    piece,
    file: x.file,
    bytes: x.bytes,
    sha256: x.sha256,
    title: x.title,
    composer: x.composer,
    credit: x.credit,
    key,
    meter,
    ...(x.summary ? { summary: x.summary } : {}),
    levels,
    preview: { meter: pm, bars: [...(p.bars as string[])] },
  };
}

/**
 * Read an index as fetched. Each entry is checked; one that doesn't fit is left
 * out, so a newer index still lists what this version can read. Null when the
 * text is not an index at all.
 */
export function parseIndex(text: string): CatalogueEntry[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(data) || data.format !== LIBRARY_FORMAT || !Array.isArray(data.songs)) return null;
  if (typeof data.schema !== 'number' || data.schema < LIBRARY_SCHEMA) return null;
  const out: CatalogueEntry[] = [];
  for (const raw of data.songs) {
    const entry = readEntry(raw);
    if (entry && !out.some((e) => e.piece === entry.piece)) out.push(entry);
  }
  return out;
}
