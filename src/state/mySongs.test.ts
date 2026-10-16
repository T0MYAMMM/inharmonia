import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildExport, makeUserSong, type SongDraft, type UserRecording } from '@/core/songs';
import {
  deleteRecording,
  deleteSong,
  exportSongs,
  getRecording,
  getSong,
  importSongs,
  mySongs,
  refresh,
  resetForTests,
  saveSong,
} from './mySongs';

const draft = (title = 'Morning'): SongDraft => ({
  title,
  key: { tonic: 'C', mode: 'major' },
  tempo: 80,
  meter: { beats: 4, unit: 4 },
  bars: 1,
  notes: [{ id: 'n1', startBeat: 0, beats: 4, midi: 64 }],
  chords: [{ startBeat: 0, beats: 4, symbol: 'C' }],
  lhPattern: 'block',
});

const recording = (songId: string): UserRecording => ({
  songId,
  sampleRate: 8000,
  samples: new Int16Array(8000),
  beat0: 0.5,
  trace: new Float32Array(100).fill(Number.NaN),
  traceStart: 0,
  traceHop: 0.01,
  traceShift: 0,
});

const patterns = new Set(['block']);

beforeEach(() => {
  resetForTests();
  globalThis.indexedDB = new IDBFactory();
});

describe('my songs', () => {
  it('saves, lists newest first, and survives a reload', async () => {
    await saveSong(makeUserSong('user-a', draft('A'), 1));
    await saveSong(makeUserSong('user-b', draft('B'), 2));
    expect(mySongs.snapshot.songs.map((s) => s.draft.title)).toEqual(['B', 'A']);
    resetForTests();
    await refresh();
    expect(mySongs.snapshot).toMatchObject({ status: 'ready' });
    expect(mySongs.snapshot.songs).toHaveLength(2);
    expect((await getSong('user-a'))!.lesson.source).toEqual({ kind: 'user' });
  });

  it('keeps a recording only when asked, shows its size and deletes it', async () => {
    await saveSong(makeUserSong('user-a', draft(), 1));
    expect(mySongs.snapshot.recordings).toEqual({});
    await saveSong(makeUserSong('user-a', draft(), 1), recording('user-a'));
    expect(mySongs.snapshot.recordings).toEqual({ 'user-a': 16000 + 400 });
    // fake-indexeddb clones in another realm, so check the type by name.
    expect((await getRecording('user-a'))!.samples.constructor.name).toBe('Int16Array');
    await saveSong(makeUserSong('user-a', draft(), 1));
    expect(mySongs.snapshot.recordings).toHaveProperty('user-a');
    await deleteRecording('user-a');
    expect(mySongs.snapshot.recordings).toEqual({});
    await saveSong(makeUserSong('user-a', draft(), 1), recording('user-a'));
    await saveSong(makeUserSong('user-a', draft(), 1), null);
    expect(mySongs.snapshot.recordings).toEqual({});
  });

  it('deletes a song with its recording', async () => {
    await saveSong(makeUserSong('user-a', draft(), 1), recording('user-a'));
    await deleteSong('user-a');
    expect(mySongs.snapshot.songs).toEqual([]);
    expect(await getRecording('user-a')).toBeUndefined();
  });

  it('exports songs without recordings and imports them on another device', async () => {
    await saveSong(makeUserSong('user-a', draft('A'), 1), recording('user-a'));
    const text = await exportSongs(new Date(0));
    expect(text).not.toContain('samples');
    resetForTests();
    globalThis.indexedDB = new IDBFactory();
    expect(await importSongs(text, patterns, 'block')).toEqual({
      added: 1,
      updated: 0,
      kept: 0,
      skipped: [],
    });
    expect(mySongs.snapshot.songs.map((s) => s.draft.title)).toEqual(['A']);
    // The same file again changes nothing; a newer copy replaces the old one.
    expect(await importSongs(text, patterns, 'block')).toMatchObject({ added: 0, kept: 1 });
    const newer = JSON.stringify(
      buildExport([makeUserSong('user-a', draft('A2'), 5)], new Date(0)),
    );
    expect(await importSongs(newer, patterns, 'block')).toMatchObject({ updated: 1 });
    expect((await getSong('user-a'))!.draft.title).toBe('A2');
  });

  it('reports a file that is not an export', async () => {
    expect(await importSongs('hello', patterns, 'block')).toEqual({
      error: 'This file is not an Inharmonia export.',
    });
  });
});
