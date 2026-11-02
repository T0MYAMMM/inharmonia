import { LIBRARY_LIMITS } from '@config/library';
import { PATTERNS } from '@/content/patterns';
import type { Lesson } from '@/core/content/types';
import { parseFile, type ImportContext } from '@/core/format/read';
import { LIBRARY_SCHEMA, type CatalogueEntry } from '@/core/library/catalogue';
import { catalogueIssues } from '@/core/library/rules';
import { fetchLibraryFile, LibraryError, libraryUrl } from './catalogue';
import { keepPiece, type DownloadedPiece } from './downloads';

/**
 * Getting a catalogue song onto this device, and reading one that is there.
 * Both read song files, so the file reader comes with them; the list of what
 * is downloaded (downloads.ts) does without it.
 */

const CONTEXT: ImportContext = {
  patterns: new Set(Object.keys(PATTERNS)),
  fallbackPattern: 'arpeggio-8ths',
  maxBytes: LIBRARY_LIMITS.fileBytes,
};

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

/**
 * Download a catalogue song and keep it on this device. Checked at the
 * boundary, in order: its address (a plain file name, same origin), its size,
 * its SHA-256 against the index (asked again once past every cache, which
 * GitHub Pages keeps for ten minutes), the reader, then the catalogue rules.
 * Only then is it stored. Throws a LibraryError naming what went wrong;
 * nothing is stored unless everything passed. Updating is downloading again.
 */
export async function downloadPiece(entry: CatalogueEntry, now: Date = new Date()): Promise<void> {
  const url = libraryUrl(entry.file);
  let bytes = await fetchLibraryFile(url, LIBRARY_LIMITS.fileBytes, 'no-cache');
  if ((await sha256(bytes)) !== entry.sha256) {
    bytes = await fetchLibraryFile(url, LIBRARY_LIMITS.fileBytes, 'reload');
    if ((await sha256(bytes)) !== entry.sha256) throw new LibraryError('changed');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new LibraryError('unreadable');
  }
  const parsed = parseFile(text, CONTEXT);
  if ('fatal' in parsed || parsed.errors.length) throw new LibraryError('unreadable');
  if (catalogueIssues(parsed, { piece: entry.piece, year: now.getFullYear() }).length)
    throw new LibraryError('unreadable');
  await keepPiece({
    piece: entry.piece,
    sha256: entry.sha256,
    schema: LIBRARY_SCHEMA,
    downloadedAt: now.getTime(),
    entry,
    text,
  });
}

const songsByHash = new Map<string, Lesson[]>();

/** A downloaded piece's songs, Easy to Advanced, read from its file once per visit. */
export function songsOf(kept: DownloadedPiece): Lesson[] {
  let songs = songsByHash.get(kept.sha256);
  if (!songs) {
    const parsed = parseFile(kept.text, CONTEXT);
    songs =
      'fatal' in parsed
        ? []
        : parsed.items.flatMap((i) =>
            i.value.kind === 'song' ? [{ ...i.value.lesson, id: i.id }] : [],
          );
    songsByHash.set(kept.sha256, songs);
  }
  return songs;
}

/** A downloaded song by its id, with the piece it belongs to. */
export function findDownloaded(
  pieces: readonly DownloadedPiece[],
  id: string,
): { song: Lesson; kept: DownloadedPiece } | undefined {
  for (const kept of pieces) {
    if (!kept.entry.levels.some((l) => l.id === id)) continue;
    const song = songsOf(kept).find((s) => s.id === id);
    if (song) return { song, kept };
  }
  return undefined;
}

/** Tests: forget the songs read so far. */
export function resetReadingForTests(): void {
  songsByHash.clear();
}
