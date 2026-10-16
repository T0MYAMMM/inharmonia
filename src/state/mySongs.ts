import { useSyncExternalStore } from 'react';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  buildExport,
  parseExport,
  recordingBytes,
  type ParsedImport,
  type UserRecording,
  type UserSong,
} from '@/core/songs';

/**
 * Your songs and kept recordings, in IndexedDB on this device. Nothing here is
 * uploaded or shared; export and import move songs between your own devices.
 */
interface Schema extends DBSchema {
  songs: { key: string; value: UserSong; indexes: { updatedAt: number } };
  recordings: { key: string; value: UserRecording };
}

export const DB_NAME = 'inharmonia';
const DB_VERSION = 1;

export interface MySongsState {
  status: 'loading' | 'ready' | 'unavailable';
  /** Newest first. */
  songs: UserSong[];
  /** Bytes of each kept recording, by song id. */
  recordings: Readonly<Record<string, number>>;
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
let state: MySongsState = { status: 'loading', songs: [], recordings: {} };
const listeners = new Set<() => void>();

function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      const songs = d.createObjectStore('songs', { keyPath: 'id' });
      songs.createIndex('updatedAt', 'updatedAt');
      d.createObjectStore('recordings', { keyPath: 'songId' });
    },
  });
  return dbp;
}

function set(next: MySongsState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Reload the list from the database. Marks storage unavailable if it cannot open. */
export async function refresh(): Promise<void> {
  try {
    const d = await db();
    const songs = (await d.getAll('songs')).sort((a, b) => b.updatedAt - a.updatedAt);
    const recordings: Record<string, number> = {};
    for (const r of await d.getAll('recordings')) recordings[r.songId] = recordingBytes(r);
    set({ status: 'ready', songs, recordings });
  } catch {
    dbp = null;
    set({ status: 'unavailable', songs: [], recordings: {} });
  }
}

export const mySongs = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    if (state.status === 'loading' && listeners.size === 1) void refresh();
    return () => listeners.delete(l);
  },
  get snapshot(): MySongsState {
    return state;
  },
};

/** A fresh id for a new song. */
export function newSongId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `user-${Date.now().toString(36)}-${rand}`;
}

export async function getSong(id: string): Promise<UserSong | undefined> {
  return (await db()).get('songs', id);
}

export async function getRecording(id: string): Promise<UserRecording | undefined> {
  return (await db()).get('recordings', id);
}

/**
 * Save a song. A recording is stored with it only when given; `recording: null`
 * removes one kept before. Asks the browser not to clear the data on its own.
 */
export async function saveSong(song: UserSong, recording?: UserRecording | null): Promise<void> {
  const d = await db();
  const tx = d.transaction(['songs', 'recordings'], 'readwrite');
  await tx.objectStore('songs').put(song);
  if (recording) await tx.objectStore('recordings').put(recording);
  else if (recording === null) await tx.objectStore('recordings').delete(song.id);
  await tx.done;
  void navigator.storage?.persist?.().catch(() => false);
  await refresh();
}

export async function deleteSong(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['songs', 'recordings'], 'readwrite');
  await tx.objectStore('songs').delete(id);
  await tx.objectStore('recordings').delete(id);
  await tx.done;
  await refresh();
}

export async function deleteRecording(id: string): Promise<void> {
  await (await db()).delete('recordings', id);
  await refresh();
}

/** Every song as an export file's text (recordings are not included). */
export async function exportSongs(now = new Date()): Promise<string> {
  const songs = await (await db()).getAll('songs');
  return JSON.stringify(buildExport(songs, now), null, 2);
}

export interface ImportResult {
  added: number;
  updated: number;
  /** Already here and not older on this device. */
  kept: number;
  skipped: ParsedImport['skipped'];
}

/**
 * Bring in songs from an export. A song already here is replaced only when the
 * file's copy is newer, so importing the same backup twice changes nothing.
 */
export async function importSongs(
  text: string,
  patterns: ReadonlySet<string>,
  fallbackPattern: string,
): Promise<ImportResult | { error: string }> {
  const parsed = parseExport(text, patterns, fallbackPattern);
  if ('error' in parsed) return parsed;
  const d = await db();
  const tx = d.transaction('songs', 'readwrite');
  const result: ImportResult = { added: 0, updated: 0, kept: 0, skipped: parsed.skipped };
  for (const song of parsed.songs) {
    const existing = await tx.store.get(song.id);
    if (!existing) result.added++;
    else if (song.updatedAt > existing.updatedAt) result.updated++;
    else {
      result.kept++;
      continue;
    }
    await tx.store.put(song);
  }
  await tx.done;
  await refresh();
  return result;
}

/** Tests: forget the open connection and cached list. */
export function resetForTests(): void {
  void dbp?.then((d) => d.close());
  dbp = null;
  state = { status: 'loading', songs: [], recordings: {} };
}

/** The song list for React; loads it on first use. */
export function useMySongs(): MySongsState {
  return useSyncExternalStore(mySongs.subscribe, () => mySongs.snapshot);
}
