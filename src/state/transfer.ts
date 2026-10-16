import { PATTERNS } from '@/content/patterns';
import { makeUserChart, type UserChart } from '@/core/charts';
import type { Lesson, Progression } from '@/core/content/types';
import {
  buildFile,
  chartItem,
  describeError,
  exportFileName,
  parseFile,
  progressionItem,
  recordingAsset,
  slugify,
  songItem,
  stringifyFile,
  type FileItem,
  type ImportedItem,
  type ItemKind,
  type ParsedFile,
} from '@/core/format';
import { toLesson, USER_SONG_VERSION, type UserRecording, type UserSong } from '@/core/songs';
import { getRecordings, mySongs, newChartId, newSongId, putMany } from './mySongs';
import { USER_ID_PREFIX, useUserProgressions } from './userProgressions';

/** What to put in an export file. */
export interface ExportSelection {
  songs?: readonly UserSong[];
  charts?: readonly UserChart[];
  progressions?: readonly Progression[];
  /** Built-in songs (original content) can be exported too. */
  builtInSongs?: readonly Lesson[];
  /** Kept Studio recordings of the chosen songs, at the end of the file. */
  includeRecordings?: boolean;
}

export interface ExportResult {
  text: string;
  fileName: string;
  items: number;
  recordings: number;
}

/** One readable file for the chosen songs, charts and progressions. */
export async function exportItems(sel: ExportSelection, now = new Date()): Promise<ExportResult> {
  const items: FileItem[] = [
    ...(sel.builtInSongs ?? []).map((l) =>
      songItem({ id: l.id, source: l.source, lesson: l, voicings: true }),
    ),
    ...(sel.songs ?? []).map((s) =>
      songItem({
        id: s.id,
        source: s.lesson.source,
        lesson: s.lesson,
        updatedAt: s.updatedAt,
        voicings: s.lesson.source.kind !== 'user',
      }),
    ),
    ...(sel.charts ?? []).map((c) =>
      chartItem({
        id: c.id,
        source: c.source,
        chart: c.chart,
        view: c.view,
        updatedAt: c.updatedAt,
      }),
    ),
    ...(sel.progressions ?? []).map(progressionItem),
  ];
  const recordings =
    sel.includeRecordings && sel.songs?.length
      ? await getRecordings(sel.songs.map((s) => s.id))
      : [];
  const text = stringifyFile(buildFile(items, recordings.map(recordingAsset), now));
  return {
    text,
    fileName: exportFileName(items, now),
    items: items.length,
    recordings: recordings.length,
  };
}

/** Hand a file to the browser to save. */
export function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type DuplicateChoice = 'skip' | 'replace' | 'copy';

export interface PreviewRow {
  index: number;
  kind: ItemKind;
  title: string;
  /** Where it would be saved. */
  storeId: string;
  /** Title of what is already saved under that id, if anything. */
  existing: string | null;
  /** The file holds a recording for it. */
  recording: boolean;
}

export interface ImportPreview {
  fatal: string | null;
  version: number | null;
  rows: PreviewRow[];
  /** One line per problem; while there are any, nothing can be imported. */
  errors: string[];
  parsed: ParsedFile | null;
}

const PATTERN_IDS = new Set(Object.keys(PATTERNS));
export const IMPORT_CONTEXT = { patterns: PATTERN_IDS, fallbackPattern: 'arpeggio-8ths' };

/** Your copies live under "mine-" ids (songs saved before phase 8 keep "user-"). */
export function storeIdFor(kind: ItemKind, id: string): string {
  const lower = id.toLowerCase();
  if (lower.startsWith(USER_ID_PREFIX) || lower.startsWith('user-')) return lower.slice(0, 80);
  return `${USER_ID_PREFIX}${kind}-${lower}`.slice(0, 80);
}

function existingTitle(kind: ItemKind, id: string): string | null {
  const { songs, charts } = mySongs.snapshot;
  if (kind === 'song') return songs.find((s) => s.id === id)?.lesson.title ?? null;
  if (kind === 'chart') return charts.find((c) => c.id === id)?.chart.title ?? null;
  return useUserProgressions.getState().get(id)?.name ?? null;
}

/** Read a file and say what importing it would do, without saving anything. */
export function previewImport(text: string): ImportPreview {
  const parsed = parseFile(text, IMPORT_CONTEXT);
  if ('fatal' in parsed)
    return { fatal: parsed.fatal, version: null, rows: [], errors: [], parsed: null };
  const rows = parsed.items.map((i) => {
    const storeId = storeIdFor(i.kind, i.id);
    return {
      index: i.index,
      kind: i.kind,
      title: i.title,
      storeId,
      existing: existingTitle(i.kind, storeId),
      recording: i.kind === 'song' && parsed.recordings.has(i.id),
    };
  });
  return {
    fatal: null,
    version: parsed.version,
    rows,
    errors: parsed.errors.map(describeError),
    parsed,
  };
}

function freshId(kind: ItemKind, title: string): string {
  if (kind === 'song') return newSongId();
  if (kind === 'chart') return newChartId();
  return `${USER_ID_PREFIX}${slugify(title).slice(0, 40)}-${Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')}`;
}

export interface ImportOutcome {
  added: number;
  replaced: number;
  skipped: number;
}

/**
 * Save what the preview showed. Items already here follow `choices` (skip by
 * default, replace, or keep both under a fresh id). Recordings come along when
 * the file has them. Throws when the preview had errors: fix the file first.
 */
export async function applyImport(
  preview: ImportPreview,
  choices: Readonly<Record<number, DuplicateChoice>> = {},
  now = Date.now(),
): Promise<ImportOutcome> {
  if (!preview.parsed || preview.errors.length || preview.fatal)
    throw new Error('This file has problems, so nothing was imported.');
  const out: ImportOutcome = { added: 0, replaced: 0, skipped: 0 };
  const songs: UserSong[] = [];
  const charts: UserChart[] = [];
  const recordings: UserRecording[] = [];
  const byIndex = new Map(preview.parsed.items.map((i) => [i.index, i]));
  for (const row of preview.rows) {
    const item = byIndex.get(row.index)!;
    const choice = row.existing ? (choices[row.index] ?? 'skip') : 'replace';
    if (choice === 'skip') {
      out.skipped++;
      continue;
    }
    const id = row.existing && choice === 'copy' ? freshId(row.kind, row.title) : row.storeId;
    if (row.existing && choice === 'replace') out.replaced++;
    else out.added++;
    save(item, id, now, { songs, charts, recordings }, preview.parsed);
  }
  await putMany({ songs, charts, recordings });
  return out;
}

function save(
  item: ImportedItem,
  id: string,
  now: number,
  into: { songs: UserSong[]; charts: UserChart[]; recordings: UserRecording[] },
  parsed: ParsedFile,
) {
  const updatedAt = item.updatedAt ?? now;
  const v = item.value;
  if (v.kind === 'song') {
    const lesson = item.source.kind === 'user' ? toLesson(v.draft, id) : { ...v.lesson, id };
    into.songs.push({
      id,
      version: USER_SONG_VERSION,
      createdAt: now,
      updatedAt,
      draft: v.draft,
      lesson,
    });
    const rec = parsed.recordings.get(item.id);
    if (rec) into.recordings.push({ ...rec, songId: id });
  } else if (v.kind === 'chart') {
    into.charts.push({ ...makeUserChart(id, v.chart, v.view, now, item.source), updatedAt });
  } else {
    useUserProgressions.getState().put({ ...v.progression, id });
  }
}
