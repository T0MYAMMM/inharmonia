import { useSyncExternalStore } from 'react';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { UserChart } from '@/core/charts';
import { recordingBytes, type UserRecording, type UserSong } from '@/core/songs';

/**
 * Your songs, chord charts and kept recordings, in IndexedDB on this device.
 * Nothing here is uploaded or shared; export and import move them between your
 * own devices (see state/transfer.ts).
 */
interface Schema extends DBSchema {
  songs: { key: string; value: UserSong; indexes: { updatedAt: number } };
  recordings: { key: string; value: UserRecording };
  charts: { key: string; value: UserChart; indexes: { updatedAt: number } };
}

export const DB_NAME = 'inharmonia';
/** 1: songs and recordings (phase 7). 2: chord charts. */
export const DB_VERSION = 2;

export interface MySongsState {
  status: 'loading' | 'ready' | 'unavailable';
  /** Newest first. */
  songs: UserSong[];
  /** Newest first. */
  charts: UserChart[];
  /** Bytes of each kept recording, by song id. */
  recordings: Readonly<Record<string, number>>;
}

const EMPTY: MySongsState = { status: 'loading', songs: [], charts: [], recordings: {} };
let dbp: Promise<IDBPDatabase<Schema>> | null = null;
let state: MySongsState = EMPTY;
const listeners = new Set<() => void>();

function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    // Each step adds what its version brought, so older databases keep their data.
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const songs = d.createObjectStore('songs', { keyPath: 'id' });
        songs.createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('recordings', { keyPath: 'songId' });
      }
      if (oldVersion < 2) {
        const charts = d.createObjectStore('charts', { keyPath: 'id' });
        charts.createIndex('updatedAt', 'updatedAt');
      }
    },
  });
  return dbp;
}

function set(next: MySongsState) {
  state = next;
  listeners.forEach((l) => l());
}

const newestFirst = <T extends { updatedAt: number }>(xs: T[]) =>
  xs.sort((a, b) => b.updatedAt - a.updatedAt);

/** Reload the lists from the database. Marks storage unavailable if it cannot open. */
export async function refresh(): Promise<void> {
  try {
    const d = await db();
    const songs = newestFirst(await d.getAll('songs'));
    const charts = newestFirst(await d.getAll('charts'));
    const recordings: Record<string, number> = {};
    for (const r of await d.getAll('recordings')) recordings[r.songId] = recordingBytes(r);
    set({ status: 'ready', songs, charts, recordings });
  } catch {
    dbp = null;
    set({ ...EMPTY, status: 'unavailable' });
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

function rand(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

/** A fresh id for a new song. (Songs saved before phase 8 keep their "user-" ids.) */
export function newSongId(): string {
  return `mine-song-${Date.now().toString(36)}-${rand()}`;
}

export function newChartId(): string {
  return `mine-chart-${Date.now().toString(36)}-${rand()}`;
}

export async function getSong(id: string): Promise<UserSong | undefined> {
  return (await db()).get('songs', id);
}

export async function getRecording(id: string): Promise<UserRecording | undefined> {
  return (await db()).get('recordings', id);
}

export async function getChart(id: string): Promise<UserChart | undefined> {
  return (await db()).get('charts', id);
}

function askToKeep() {
  void navigator.storage?.persist?.().catch(() => false);
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
  askToKeep();
  await refresh();
}

export async function saveChart(chart: UserChart): Promise<void> {
  await (await db()).put('charts', chart);
  askToKeep();
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

export async function deleteChart(id: string): Promise<void> {
  await (await db()).delete('charts', id);
  await refresh();
}

export async function deleteRecording(id: string): Promise<void> {
  await (await db()).delete('recordings', id);
  await refresh();
}

/** Write many songs, charts and recordings in one go (imports). */
export async function putMany(input: {
  songs: UserSong[];
  charts: UserChart[];
  recordings: UserRecording[];
}): Promise<void> {
  const d = await db();
  const tx = d.transaction(['songs', 'charts', 'recordings'], 'readwrite');
  for (const s of input.songs) await tx.objectStore('songs').put(s);
  for (const c of input.charts) await tx.objectStore('charts').put(c);
  for (const r of input.recordings) await tx.objectStore('recordings').put(r);
  await tx.done;
  askToKeep();
  await refresh();
}

/** Every recording kept for these songs (exports that include them). */
export async function getRecordings(ids: readonly string[]): Promise<UserRecording[]> {
  const d = await db();
  const out: UserRecording[] = [];
  for (const id of ids) {
    const r = await d.get('recordings', id);
    if (r) out.push(r);
  }
  return out;
}

/** Tests: forget the open connection and cached lists. */
export function resetForTests(): void {
  void dbp?.then((d) => d.close());
  dbp = null;
  state = EMPTY;
}

/** The lists for React; loads them on first use. */
export function useMySongs(): MySongsState {
  return useSyncExternalStore(mySongs.subscribe, () => mySongs.snapshot);
}
