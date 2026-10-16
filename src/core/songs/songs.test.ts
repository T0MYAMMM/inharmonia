import { describe, expect, it } from 'vitest';
import { compileLesson, validateLesson } from '../content/compile';
import {
  addNote,
  commit,
  deleteNote,
  historyOf,
  moveNote,
  redo,
  resizeNote,
  setChord,
  toLesson,
  transposeMelody,
  transposeNote,
  undo,
  updateNote,
  type SongDraft,
} from './draft';
import { buildExport, cleanDraft, makeUserSong, parseExport, updateUserSong } from './library';
import { formatBytes, recordingSamples, toUserRecording } from './recording';

/** A small original draft: four bars in G, a note held over the first barline. */
const draft = (): SongDraft => ({
  title: 'Morning',
  key: { tonic: 'G', mode: 'major' },
  tempo: 90,
  meter: { beats: 4, unit: 4 },
  bars: 4,
  notes: [
    { id: 'n1', startBeat: 0, beats: 1, midi: 67 },
    { id: 'n2', startBeat: 1, beats: 1, midi: 71 },
    { id: 'n3', startBeat: 2, beats: 3, midi: 74 },
    { id: 'n4', startBeat: 6, beats: 2, midi: 72 },
    { id: 'n5', startBeat: 8, beats: 4, midi: 71 },
    { id: 'n6', startBeat: 12, beats: 4, midi: 67 },
  ],
  chords: [
    { startBeat: 0, beats: 4, symbol: 'G', numeral: 'I' },
    { startBeat: 4, beats: 4, symbol: 'C', numeral: 'IV' },
    { startBeat: 8, beats: 4, symbol: 'D', numeral: 'V' },
    { startBeat: 12, beats: 4, symbol: 'G', numeral: 'I' },
  ],
  lhPattern: 'block',
});

const BLOCK = {
  block: {
    id: 'block',
    name: 'Block',
    cycleBeats: 4,
    steps: [{ at: 0, dur: 'chord' as const, voices: ['all' as const] }],
  },
};

describe('song drafts', () => {
  it('become a valid, private lesson spelled in the key, tied over the barline', () => {
    const lesson = toLesson(draft(), 'user-1');
    expect(lesson.source).toEqual({ kind: 'user' });
    expect(validateLesson(lesson)).toEqual([]);
    expect(lesson.bars[0]!.rh!.at(-1)).toEqual({ note: 'D5', beats: 2, tie: true });
    expect(lesson.bars[1]!.rh![0]).toEqual({ note: 'D5', beats: 1 });
    expect(compileLesson(lesson, BLOCK).events.filter((e) => e.channel === 'rh')).toHaveLength(6);
  });

  it('spells sharps and flats for the key', () => {
    const d = { ...draft(), key: { tonic: 'Eb', mode: 'major' as const } };
    const lesson = toLesson(transposeMelody(d, -4), 'user-1');
    expect(lesson.bars[0]!.rh![0]!.note).toBe('Eb4');
  });

  it('moves, resizes and repitches a note, and its neighbours make room', () => {
    let d = moveNote(draft(), 'n2', 0.5);
    expect(d.notes.find((n) => n.id === 'n2')).toMatchObject({ startBeat: 1.5, beats: 1 });
    // n3 started at 2 and is overlapped by n2 (1.5..2.5): it now starts at 2.5.
    expect(d.notes.find((n) => n.id === 'n3')).toMatchObject({ startBeat: 2.5, beats: 2.5 });
    d = resizeNote(draft(), 'n1', 2);
    expect(d.notes.find((n) => n.id === 'n1')!.beats).toBe(3);
    expect(d.notes.some((n) => n.id === 'n2')).toBe(false);
    expect(d.notes.find((n) => n.id === 'n3')).toMatchObject({ startBeat: 3, beats: 2 });
    d = transposeNote(draft(), 'n1', 2);
    expect(d.notes[0]!.midi).toBe(69);
  });

  it('keeps notes inside the song and at least a sixteenth long', () => {
    const d = updateNote(draft(), 'n6', { startBeat: 15.9, beats: 4 });
    const n6 = d.notes.find((n) => n.id === 'n6')!;
    expect(n6.startBeat).toBe(15.75);
    expect(n6.beats).toBeCloseTo(0.25);
    expect(resizeNote(draft(), 'n1', -5).notes[0]!.beats).toBe(0.25);
    expect(transposeNote(draft(), 'n1', 100).notes[0]!.midi).toBe(108);
  });

  it('adds a note that wins over what it covers, and deletes notes', () => {
    const { draft: d, id } = addNote(draft(), { startBeat: 4, beats: 2.5, midi: 76 });
    expect(id).toBe('n7');
    expect(d.notes.map((n) => [n.id, n.startBeat, n.beats])).toEqual([
      ['n1', 0, 1],
      ['n2', 1, 1],
      ['n3', 2, 2],
      ['n7', 4, 2.5],
      ['n4', 6.5, 1.5],
      ['n5', 8, 4],
      ['n6', 12, 4],
    ]);
    expect(deleteNote(d, 'n7').notes).toHaveLength(6);
  });

  it('changes a chord', () => {
    const d = setChord(draft(), 1, 'Am7', 'ii7');
    expect(d.chords[1]).toEqual({ startBeat: 4, beats: 4, symbol: 'Am7', numeral: 'ii7' });
    expect(setChord(draft(), 1, 'E7').chords[1]).toEqual({ startBeat: 4, beats: 4, symbol: 'E7' });
  });

  it('undoes and redoes', () => {
    let h = historyOf(draft());
    h = commit(h, moveNote(h.present, 'n1', 1));
    h = commit(h, deleteNote(h.present, 'n6'));
    expect(h.present.notes).toHaveLength(4);
    h = undo(h);
    expect(h.present.notes).toHaveLength(5);
    h = undo(h);
    expect(h.present).toEqual(draft());
    expect(undo(h)).toBe(h);
    h = redo(h);
    // Moving n1 onto n2 replaced it.
    expect(h.present.notes.slice(0, 2)).toMatchObject([
      { id: 'n1', startBeat: 1 },
      { id: 'n3', startBeat: 2 },
    ]);
  });
});

describe('export and import', () => {
  const patterns = new Set(['block', 'arpeggio-8ths']);
  const song = makeUserSong('user-abc-1', draft(), 1000);

  it('round-trips your songs', () => {
    const text = JSON.stringify(buildExport([song], new Date(0)));
    const parsed = parseExport(text, patterns, 'arpeggio-8ths');
    expect(parsed).toEqual({ songs: [song], skipped: [] });
  });

  it('rebuilds lessons from drafts and marks every song as yours', () => {
    const tampered = {
      ...song,
      lesson: { ...song.lesson, source: { kind: 'original', author: 'Someone' }, title: 'Other' },
    };
    const parsed = parseExport(
      JSON.stringify(buildExport([tampered as never], new Date(0))),
      patterns,
      'arpeggio-8ths',
    );
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.songs[0]!.lesson.source).toEqual({ kind: 'user' });
    expect(parsed.songs[0]!.lesson.title).toBe('Morning');
  });

  it('skips broken songs and says why', () => {
    const bad = [
      { ...song, id: 'not-user' },
      { ...song, id: 'user-x', draft: { ...song.draft, tempo: 900 } },
      {
        ...song,
        id: 'user-y',
        draft: { ...song.draft, chords: [{ startBeat: 0, beats: 4, symbol: 'H9' }] },
      },
      { ...song, id: 'user-z', draft: { ...song.draft, chords: song.draft.chords.slice(0, 2) } },
    ];
    const parsed = parseExport(
      JSON.stringify({ ...buildExport([], new Date(0)), songs: bad }),
      patterns,
      'block',
    );
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.songs).toEqual([]);
    expect(parsed.skipped.map((s) => s.reason)).toEqual([
      'no id',
      'tempo out of range',
      'bad chord 1',
      'Bar 3: chords last 0 beats, not 4',
    ]);
  });

  it('rejects files that are not exports, or from a newer version', () => {
    expect(parseExport('{', patterns, 'block')).toEqual({
      error: 'This file is not an Inharmonia export.',
    });
    expect(parseExport('{"songs":[]}', patterns, 'block')).toHaveProperty('error');
    expect(
      parseExport(
        JSON.stringify({ ...buildExport([], new Date(0)), version: 99 }),
        patterns,
        'block',
      ),
    ).toHaveProperty('error', expect.stringContaining('newer version'));
  });

  it('falls back to a known left-hand pattern and trims long titles', () => {
    const d = cleanDraft(
      { ...draft(), lhPattern: 'nope', title: 'x'.repeat(200) },
      patterns,
      'block',
    );
    if (typeof d === 'string') throw new Error(d);
    expect(d.lhPattern).toBe('block');
    expect(d.title).toHaveLength(80);
  });

  it('updates a song with a new draft and a fresh lesson', () => {
    const next = updateUserSong(song, { ...draft(), title: 'Evening' }, 2000);
    expect(next).toMatchObject({ id: song.id, createdAt: 1000, updatedAt: 2000 });
    expect(next.lesson.title).toBe('Evening');
  });
});

describe('kept recordings', () => {
  it('store 16-bit samples and a trace with gaps', () => {
    const r = toUserRecording({
      songId: 'user-a',
      samples: Float32Array.from([0, 0.5, -1, 2]),
      sampleRate: 8000,
      beat0: 0.25,
      frames: [
        { time: 0, f0: 440, midi: 69, clarity: 0.95, rms: 0.1, rmsShort: 0.1 },
        { time: 0.01, f0: 440, midi: 69, clarity: 0.4, rms: 0.1, rmsShort: 0.1 },
        { time: 0.02, f0: null, midi: null, clarity: 0, rms: 0, rmsShort: 0 },
      ],
      minClarity: 0.85,
      hop: 0.01,
      shift: 12,
    });
    expect([...r.samples]).toEqual([0, 16384, -32767, 32767]);
    expect([...r.trace]).toEqual([69, Number.NaN, Number.NaN]);
    expect(recordingSamples(r)[1]).toBeCloseTo(0.5, 3);
    expect(formatBytes(r.samples.byteLength + r.trace.byteLength)).toBe('1 KB');
    expect(formatBytes(2_450_000)).toBe('2.5 MB');
  });
});
