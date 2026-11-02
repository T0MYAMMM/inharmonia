import { useSyncExternalStore } from 'react';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CatalogueEntry } from '@/core/library/catalogue';
import { LibraryError } from './catalogue';

/**
 * Catalogue songs downloaded to this device, in their own IndexedDB database,
 * apart from your songs: a download is a copy of a published file, kept as
 * it came, and removing it touches nothing of yours, progress included.
 * Light enough for Home: getting a file and reading it are in download.ts.
 */

/** A downloaded piece: its file as it came, and the index entry it came with. */
export interface DownloadedPiece {
  piece: string;
  /** The file's SHA-256: an index with another one has an update. */
  sha256: string;
  /** The index schema `entry` is written in. */
  schema: number;
  downloadedAt: number;
  entry: CatalogueEntry;
  /** The file itself, read again when it is played, so a later app needs no migration. */
  text: string;
}

interface Schema extends DBSchema {
  pieces: { key: string; value: DownloadedPiece };
}

export const LIBRARY_DB = 'inharmonia-library';
export const LIBRARY_DB_VERSION = 1;

export interface DownloadsState {
  status: 'loading' | 'ready' | 'unavailable';
  /** By title. */
  pieces: readonly DownloadedPiece[];
}

const EMPTY: DownloadsState = { status: 'loading', pieces: [] };
let dbp: Promise<IDBPDatabase<Schema>> | null = null;
let state: DownloadsState = EMPTY;
const listeners = new Set<() => void>();

function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>(LIBRARY_DB, LIBRARY_DB_VERSION, {
    upgrade(d) {
      d.createObjectStore('pieces', { keyPath: 'piece' });
    },
  });
  return dbp;
}

function set(next: DownloadsState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Reload the list from the database. Marks storage unavailable if it cannot open. */
export async function refreshDownloads(): Promise<void> {
  try {
    // A record this version can't list (from a later one, say) is left where it is.
    const pieces = (await (await db()).getAll('pieces')).filter(
      (p) => typeof p.entry?.title === 'string' && Array.isArray(p.entry.levels),
    );
    pieces.sort((a, b) => a.entry.title.localeCompare(b.entry.title));
    set({ status: 'ready', pieces });
  } catch {
    dbp = null;
    set({ ...EMPTY, status: 'unavailable' });
  }
}

export const downloads = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    if (state.status === 'loading' && listeners.size === 1) void refreshDownloads();
    return () => listeners.delete(l);
  },
  get snapshot(): DownloadsState {
    return state;
  },
};

/** The downloads for React; reads them on first use. */
export function useDownloads(): DownloadsState {
  return useSyncExternalStore(downloads.subscribe, () => downloads.snapshot);
}

const isQuota = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  ((e as { name?: unknown }).name === 'QuotaExceededError' ||
    (e as { code?: unknown }).code === 22);

/** Store a downloaded piece, checked already (see download.ts), replacing an older copy. */
export async function keepPiece(record: DownloadedPiece): Promise<void> {
  let d: IDBPDatabase<Schema>;
  try {
    d = await db();
  } catch {
    dbp = null;
    set({ ...EMPTY, status: 'unavailable' });
    throw new LibraryError('unavailable');
  }
  try {
    await d.put('pieces', record);
  } catch (e) {
    throw new LibraryError(isQuota(e) ? 'quota' : 'unavailable');
  }
  // Downloads are worth keeping: ask the browser not to clear them on its own.
  void navigator.storage?.persist?.().catch(() => false);
  await refreshDownloads();
}

/** Remove a downloaded piece from this device. Progress on it is kept. */
export async function removePiece(piece: string): Promise<void> {
  try {
    await (await db()).delete('pieces', piece);
  } catch {
    throw new LibraryError('unavailable');
  }
  await refreshDownloads();
}

/** Whether the index has a newer file than the one on this device. */
export const hasUpdate = (kept: DownloadedPiece, entry: CatalogueEntry | undefined) =>
  entry !== undefined && entry.sha256 !== kept.sha256;

/** Tests: forget the open connection and the list. */
export function resetDownloadsForTests(): void {
  void dbp?.then((d) => d.close());
  dbp = null;
  state = EMPTY;
}
