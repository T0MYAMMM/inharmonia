import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { DEFAULT_VIEW, emptyChart, makeUserChart, parseBars, type ChordChart } from '@/core/charts';
import { makeUserSong, type SongDraft, type UserRecording } from '@/core/songs';
import {
  DB_NAME,
  deleteChart,
  deleteRecording,
  deleteSong,
  getChart,
  getRecording,
  getSong,
  mySongs,
  newChartId,
  newSongId,
  refresh,
  resetForTests,
  saveChart,
  saveSong,
} from './mySongs';
import { applyImport, exportItems, previewImport, storeIdFor } from './transfer';
import { useUserProgressions } from './userProgressions';

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

// An invented chart.
const chart = (title = 'Practice chart'): ChordChart => ({
  ...emptyChart(title),
  sections: [
    {
      id: 'v',
      label: 'Bait',
      type: 'verse',
      repeat: 1,
      bars: parseBars('| C | Am | F | G |', 4).bars,
    },
  ],
  form: ['v', 'v'],
});

beforeEach(() => {
  resetForTests();
  globalThis.indexedDB = new IDBFactory();
  useUserProgressions.setState({ items: [] });
});

describe('my songs', () => {
  it('saves songs and charts, lists newest first, and survives a reload', async () => {
    await saveSong(makeUserSong('user-a', draft('A'), 1));
    await saveSong(makeUserSong(newSongId(), draft('B'), 2));
    await saveChart(makeUserChart(newChartId(), chart(), DEFAULT_VIEW, 3));
    expect(mySongs.snapshot.songs.map((s) => s.draft.title)).toEqual(['B', 'A']);
    expect(mySongs.snapshot.charts.map((c) => c.chart.title)).toEqual(['Practice chart']);
    resetForTests();
    await refresh();
    expect(mySongs.snapshot).toMatchObject({ status: 'ready' });
    expect(mySongs.snapshot.songs).toHaveLength(2);
    expect(mySongs.snapshot.charts[0]!.id).toMatch(/^mine-chart-/);
    expect((await getSong('user-a'))!.lesson.source).toEqual({ kind: 'user' });
  });

  it('upgrades a version 1 database, keeping its songs and recordings', async () => {
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('songs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('recordings', { keyPath: 'songId' });
      },
    });
    await v1.put('songs', makeUserSong('user-old', draft('Old'), 1));
    await v1.put('recordings', recording('user-old'));
    v1.close();
    await refresh();
    expect(mySongs.snapshot.songs.map((s) => s.id)).toEqual(['user-old']);
    expect(mySongs.snapshot.recordings).toHaveProperty('user-old');
    await saveChart(makeUserChart('mine-chart-x', chart(), DEFAULT_VIEW, 2));
    expect((await getChart('mine-chart-x'))!.chart.title).toBe('Practice chart');
  });

  it('keeps a recording only when asked, shows its size and deletes it', async () => {
    await saveSong(makeUserSong('user-a', draft(), 1));
    expect(mySongs.snapshot.recordings).toEqual({});
    await saveSong(makeUserSong('user-a', draft(), 1), recording('user-a'));
    expect(mySongs.snapshot.recordings).toEqual({ 'user-a': 16000 + 400 });
    // fake-indexeddb clones in another realm, so check the type by name.
    expect((await getRecording('user-a'))!.samples.constructor.name).toBe('Int16Array');
    await deleteRecording('user-a');
    expect(mySongs.snapshot.recordings).toEqual({});
    await saveSong(makeUserSong('user-a', draft(), 1), recording('user-a'));
    await saveSong(makeUserSong('user-a', draft(), 1), null);
    expect(mySongs.snapshot.recordings).toEqual({});
  });

  it('deletes a song with its recording, and a chart', async () => {
    await saveSong(makeUserSong('user-a', draft(), 1), recording('user-a'));
    await saveChart(makeUserChart('mine-chart-a', chart(), DEFAULT_VIEW, 1));
    await deleteSong('user-a');
    await deleteChart('mine-chart-a');
    expect(mySongs.snapshot).toMatchObject({ songs: [], charts: [] });
    expect(await getRecording('user-a')).toBeUndefined();
  });
});

describe('moving things between devices', () => {
  const view = { ...DEFAULT_VIEW, transpose: 2, showFunction: true };

  async function everything(includeRecordings = false) {
    await saveSong(makeUserSong('user-a', draft('Song A'), 10), recording('user-a'));
    await saveChart(makeUserChart('mine-chart-a', chart('Chart A'), view, 20));
    useUserProgressions.getState().save({
      name: 'My loop',
      mode: 'major',
      steps: [
        { numeral: 'I', beats: 4 },
        { numeral: 'IV', beats: 4 },
      ],
    });
    return exportItems(
      {
        songs: mySongs.snapshot.songs,
        charts: mySongs.snapshot.charts,
        progressions: useUserProgressions.getState().items,
        includeRecordings,
      },
      new Date('2026-01-01T00:00:00Z'),
    );
  }

  function fresh() {
    resetForTests();
    globalThis.indexedDB = new IDBFactory();
    useUserProgressions.setState({ items: [] });
  }

  it('exports everything to one file and imports it on another device', async () => {
    const out = await everything();
    expect(out).toMatchObject({
      fileName: 'inharmonia-export-2026-01-01.json',
      items: 3,
      recordings: 0,
    });
    expect(out.text).not.toContain('"assets"');
    fresh();
    await refresh();
    const preview = previewImport(out.text);
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((r) => [r.kind, r.title, r.storeId, r.existing])).toEqual([
      ['song', 'Song A', 'user-a', null],
      ['chart', 'Chart A', 'mine-chart-a', null],
      [
        'progression',
        'My loop',
        useUserProgressions.getState().items[0]?.id ?? expect.stringMatching(/^mine-my-loop-/),
        null,
      ],
    ]);
    expect(await applyImport(preview)).toEqual({ added: 3, replaced: 0, skipped: 0 });
    expect(mySongs.snapshot.songs[0]!.draft.title).toBe('Song A');
    expect(mySongs.snapshot.charts[0]).toMatchObject({ chart: chart('Chart A'), view });
    expect(useUserProgressions.getState().items[0]!.name).toBe('My loop');
    expect(mySongs.snapshot.recordings).toEqual({});
  });

  it('brings recordings along only when they were included', async () => {
    const out = await everything(true);
    expect(out.recordings).toBe(1);
    fresh();
    await refresh();
    const preview = previewImport(out.text);
    expect(preview.rows[0]!.recording).toBe(true);
    await applyImport(preview);
    expect(mySongs.snapshot.recordings).toHaveProperty('user-a');
  });

  it('skips, replaces or keeps both when something is already here', async () => {
    const out = await everything();
    await saveChart({ ...makeUserChart('mine-chart-a', chart('Chart A, edited'), view, 30) });
    const preview = previewImport(out.text);
    expect(preview.rows.map((r) => r.existing)).toEqual(['Song A', 'Chart A, edited', 'My loop']);
    expect(await applyImport(preview)).toEqual({ added: 0, replaced: 0, skipped: 3 });
    expect(await applyImport(preview, { 2: 'replace', 1: 'copy' })).toEqual({
      added: 1,
      replaced: 1,
      skipped: 1,
    });
    expect(mySongs.snapshot.charts.map((c) => c.chart.title)).toEqual(['Chart A']);
    expect(mySongs.snapshot.songs.map((s) => s.id).sort()).toEqual([
      expect.stringMatching(/^mine-song-/),
      'user-a',
    ]);
  });

  it('exports built-in songs as originals and stores imported copies as yours', async () => {
    const out = await exportItems({ builtInSongs: [SENJA_DI_TERAS] }, new Date(0));
    expect(out.fileName).toBe('inharmonia-song-senja-di-teras.json');
    const preview = previewImport(out.text);
    expect(preview.rows[0]!.storeId).toBe('mine-song-senja-di-teras');
    await applyImport(preview);
    const saved = mySongs.snapshot.songs[0]!;
    expect(saved.lesson.source).toEqual({ kind: 'original', author: 'Inharmonia' });
    expect(saved.lesson.bars).toEqual(SENJA_DI_TERAS.bars);
  });

  it('saves nothing from a file with problems', async () => {
    const out = await everything();
    fresh();
    await refresh();
    const broken = out.text.replace('"C"', '"Hx"');
    const preview = previewImport(broken);
    expect(preview.errors).toHaveLength(1);
    await expect(applyImport(preview)).rejects.toThrow('nothing was imported');
    expect(mySongs.snapshot.songs).toEqual([]);
    expect(previewImport('{').fatal).toMatch(/not JSON/);
  });

  it('keeps imported ids under mine-', () => {
    expect(storeIdFor('progression', 'Pop-Axis')).toBe('mine-progression-pop-axis');
    expect(storeIdFor('chart', 'mine-chart-1')).toBe('mine-chart-1');
    expect(storeIdFor('song', 'user-abc')).toBe('user-abc');
  });
});
