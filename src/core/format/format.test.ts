import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { PROGRESSIONS } from '@/content/progressions';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { parseBars } from '../charts/syntax';
import { DEFAULT_VIEW, type ChordChart } from '../charts/types';
import { makeUserSong, type UserRecording } from '../songs/library';
import type { SongDraft } from '../songs/draft';
import {
  buildFile,
  chartItem,
  describeError,
  exportFileName,
  parseFile,
  progressionItem,
  recordingAsset,
  songItem,
  stringifyFile,
  type FileItem,
  type ImportedItem,
  type ParsedFile,
} from '.';

const ROOT = resolve(__dirname, '../../..');
const schema = JSON.parse(
  readFileSync(resolve(ROOT, 'docs/format/inharmonia.schema.json'), 'utf8'),
);
const ajv = new Ajv2020({ strict: true, validateFormats: false, allErrors: true });
const validate = ajv.compile(schema);
const ctx = { patterns: new Set(Object.keys(PATTERNS)), fallbackPattern: 'arpeggio-8ths' };
const at = new Date('2026-01-01T00:00:00.000Z');

function expectSchema(text: string) {
  const ok = validate(JSON.parse(text));
  expect(validate.errors ?? [], 'schema').toEqual([]);
  expect(ok).toBe(true);
}

function parsed(text: string): ParsedFile {
  const p = parseFile(text, ctx);
  if ('fatal' in p) throw new Error(p.fatal);
  expect(p.errors.map(describeError)).toEqual([]);
  return p;
}

/** Back to a file item, the way the app exports what it imported. */
function reexport(i: ImportedItem): FileItem {
  const v = i.value;
  const updatedAt = i.updatedAt ?? undefined;
  if (v.kind === 'song')
    return songItem({
      id: i.id,
      source: i.source,
      lesson: v.lesson,
      ...(updatedAt ? { updatedAt } : {}),
      voicings: i.source.kind !== 'user',
    });
  if (v.kind === 'chart')
    return chartItem({
      id: i.id,
      source: i.source,
      chart: v.chart,
      view: v.view,
      ...(updatedAt ? { updatedAt } : {}),
    });
  return progressionItem(v.progression);
}

const roundTrip = (text: string) =>
  stringifyFile(
    buildFile(parsed(text).items.map(reexport), [], new Date(JSON.parse(text).exportedAt)),
  );

// Invented content only.
const bars = (t: string) => parseBars(t, 4).bars;
const chart: ChordChart = {
  version: 1,
  title: 'Test chart',
  key: { tonic: 'Eb', mode: 'major' },
  tempo: 72,
  meter: { beats: 4, unit: 4 },
  sections: [
    {
      id: 'a',
      label: 'Bait',
      type: 'verse',
      repeat: 2,
      bars: bars('| Eb | Cm7 | Ab . . Bb | N.C. |'),
    },
    {
      id: 'b',
      label: 'Reff',
      type: 'chorus',
      repeat: 1,
      bars: bars('| Ab Bb | Gm7 Cm | Fm7 | Bb7sus4 Bb7 |'),
    },
  ],
  form: ['a', 'b', 'a', 'b', 'b'],
  notes: 'Slow down in the last chorus.',
};
const view = {
  transpose: -3,
  simplify: 'simplified' as const,
  style: 'triad-root',
  showFunction: true,
};

const draft: SongDraft = {
  title: 'Morning',
  key: { tonic: 'G', mode: 'major' },
  tempo: 90,
  meter: { beats: 4, unit: 4 },
  bars: 3,
  notes: [
    { id: 'n1', startBeat: 0, beats: 1, midi: 67 },
    { id: 'n2', startBeat: 1, beats: 1, midi: 71 },
    { id: 'n3', startBeat: 2, beats: 3, midi: 74 },
    { id: 'n4', startBeat: 6, beats: 2, midi: 72 },
    { id: 'n5', startBeat: 8, beats: 4, midi: 67 },
  ],
  chords: [
    { startBeat: 0, beats: 4, symbol: 'G' },
    { startBeat: 4, beats: 2, symbol: 'C' },
    { startBeat: 6, beats: 2, symbol: 'D7' },
    { startBeat: 8, beats: 4, symbol: 'G' },
  ],
  lhPattern: 'block',
};

describe('example files', () => {
  it.each(['song', 'chart', 'progression'])(
    '%s.json matches the schema and round-trips byte for byte',
    (name) => {
      const text = readFileSync(resolve(ROOT, `docs/format/examples/${name}.json`), 'utf8');
      expectSchema(text);
      expect(roundTrip(text)).toBe(text);
    },
  );
});

describe('exports', () => {
  it('writes every built-in song and progression, valid and readable', () => {
    const items = [
      songItem({
        id: SENJA_DI_TERAS.id,
        source: SENJA_DI_TERAS.source,
        lesson: SENJA_DI_TERAS,
        voicings: true,
      }),
      ...PROGRESSIONS.map(progressionItem),
    ];
    const text = stringifyFile(buildFile(items, [], at));
    expectSchema(text);
    expect(text).toContain('"note": "F#4"');
    expect(text).not.toMatch(/"midi"|"events"|"startBeat"/);
    expect(roundTrip(text)).toBe(text);
    const senja = parsed(text).items[0]!;
    expect(senja.source).toEqual({ kind: 'original', author: 'Inharmonia' });
  });

  it('round-trips a chart with its view settings, exactly', () => {
    const text = stringifyFile(
      buildFile([chartItem({ id: 'mine-chart-1', chart, view, updatedAt: at.getTime() })], [], at),
    );
    expectSchema(text);
    expect(text).toContain('"Ab . . Bb"');
    const item = parsed(text).items[0]!;
    expect(item.value).toEqual({ kind: 'chart', chart, view });
    expect(roundTrip(text)).toBe(text);
  });

  it('round-trips a Studio song with a note tied over the barline', () => {
    const song = makeUserSong('user-abc-1', draft, at.getTime());
    const text = stringifyFile(
      buildFile(
        [
          songItem({
            id: song.id,
            source: { kind: 'user' },
            lesson: song.lesson,
            updatedAt: song.updatedAt,
            voicings: false,
          }),
        ],
        [],
        at,
      ),
    );
    expectSchema(text);
    expect(text).toContain('"tie": true');
    expect(text).not.toContain('voicing');
    const item = parsed(text).items[0]!;
    if (item.value.kind !== 'song') throw new Error('expected a song');
    expect(item.value.draft.notes).toEqual(draft.notes);
    expect(item.value.draft.chords.map((c) => c.symbol)).toEqual(['G', 'C', 'D7', 'G']);
    expect(item.value.lesson).toEqual(song.lesson);
    expect(roundTrip(text)).toBe(text);
  });

  it('puts recordings after the music, only when asked, and reads them back', () => {
    const rec: UserRecording = {
      songId: 'user-abc-1',
      sampleRate: 8000,
      samples: Int16Array.from([0, 1, -1, 32767, -32768]),
      beat0: 0.5,
      trace: Float32Array.from([69, Number.NaN, 60.25]),
      traceStart: 0.02,
      traceHop: 0.01,
      traceShift: 12,
    };
    const song = makeUserSong('user-abc-1', draft, 0);
    const text = stringifyFile(
      buildFile(
        [songItem({ id: song.id, source: { kind: 'user' }, lesson: song.lesson, voicings: false })],
        [recordingAsset(rec)],
        at,
      ),
    );
    expectSchema(text);
    expect(text.indexOf('"assets"')).toBeGreaterThan(text.indexOf('"items"'));
    const back = parsed(text).recordings.get('user-abc-1')!;
    expect([...back.samples]).toEqual([...rec.samples]);
    expect([...back.trace]).toEqual([69, Number.NaN, 60.25]);
    expect(back).toMatchObject({ sampleRate: 8000, beat0: 0.5, traceShift: 12 });
  });

  it('names files by kind and title, or by date for several', () => {
    expect(exportFileName([{ kind: 'chart', title: 'Sore di Taman!' }], at)).toBe(
      'inharmonia-chart-sore-di-taman.json',
    );
    expect(
      exportFileName(
        [
          { kind: 'song', title: 'a' },
          { kind: 'chart', title: 'b' },
        ],
        at,
      ),
    ).toBe('inharmonia-export-2026-01-01.json');
  });
});

describe('version 1 files', () => {
  it('reads an old progressions export', () => {
    const v1 = JSON.stringify({
      app: 'inharmonia',
      kind: 'progressions',
      version: 1,
      progressions: [
        {
          id: 'mine-loop-ab12',
          schemaVersion: 1,
          name: 'My loop',
          mode: 'major',
          meter: { beats: 4, unit: 4 },
          steps: [
            { numeral: 'I', beats: 4 },
            { numeral: 'IV', beats: 4 },
          ],
          source: { kind: 'user' },
        },
      ],
    });
    const p = parsed(v1);
    expect(p.version).toBe(1);
    expect(p.items[0]).toMatchObject({
      kind: 'progression',
      id: 'mine-loop-ab12',
      title: 'My loop',
    });
  });

  it('reads an old Studio songs export', () => {
    const v1 = JSON.stringify({
      format: 'inharmonia-songs',
      version: 1,
      exportedAt: at.toISOString(),
      songs: [makeUserSong('user-x-1', draft, 5)],
    });
    const p = parsed(v1);
    expect(p.items[0]).toMatchObject({
      kind: 'song',
      id: 'user-x-1',
      title: 'Morning',
      updatedAt: 5,
    });
  });
});

describe('bad files', () => {
  const file = (items: unknown[]) =>
    JSON.stringify({ format: 'inharmonia', version: 2, exportedAt: at.toISOString(), items });
  const good = () =>
    JSON.parse(
      stringifyFile(buildFile([chartItem({ id: 'c1', chart, view: DEFAULT_VIEW })], [], at)),
    ).items[0];

  it.each([
    ['{oops', 'This is not JSON, so it cannot be an Inharmonia export.'],
    ['[1,2]', 'This is not an Inharmonia export.'],
    ['{"format":"other"}', 'This is not an Inharmonia export.'],
    [
      JSON.stringify({ format: 'inharmonia', version: 3, items: [] }),
      'This file comes from a newer version of Inharmonia. Update, then try again.',
    ],
    [file(Array.from({ length: 501 }, () => ({}))), 'This file holds more than 500 items.'],
  ])('%s', (text, fatal) => {
    expect(parseFile(text, ctx)).toEqual({ fatal });
  });

  it('refuses a file that is too large', () => {
    expect(parseFile(file([good()]), { ...ctx, maxBytes: 100 })).toEqual({
      fatal: 'This file is too large to be an Inharmonia export.',
    });
  });

  it('names the item and field that failed', () => {
    const badChord = good();
    badChord.chart.sections[1].bars[2] = 'Hx7';
    const badKind = { ...good(), kind: 'lyrics' };
    const badNote = JSON.parse(
      stringifyFile(
        buildFile(
          [
            songItem({
              id: 's1',
              source: { kind: 'user' },
              lesson: makeUserSong('s1', draft, 0).lesson,
              voicings: false,
            }),
          ],
          [],
          at,
        ),
      ),
    ).items[0];
    badNote.song.bars[0].melody[1].note = 'H4';
    const p = parseFile(file([badChord, badKind, badNote]), ctx);
    if ('fatal' in p) throw new Error(p.fatal);
    expect(p.items).toEqual([]);
    expect(p.errors.map(describeError)).toEqual([
      'Item 1 (Test chart), chart.sections[1].bars[2]: "Hx7" is not a chord',
      'Item 2 (Test chart), kind: "lyrics" is not song, chart or progression',
      'Item 3 (Morning), song.bars[0].melody[1]: "H4" is not a note',
    ]);
  });

  it('drops fields it does not know, so no lyric text gets in', () => {
    const item = good();
    item.lyrics = 'la la la lyric line here';
    item.chart.lyrics = ['la la la'];
    item.chart.sections[0].text = 'lyric line here';
    item.chart.notes = 'Keep it gentle.';
    const p = parsed(file([item]));
    const text = JSON.stringify(p.items);
    expect(text).not.toMatch(/la la|lyric/);
    expect(p.items[0]!.value.kind === 'chart' && p.items[0]!.value.chart.notes).toBe(
      'Keep it gentle.',
    );
  });

  it('keeps a source as written, and treats a strange one as yours', () => {
    const pd = {
      kind: 'public-domain',
      composer: 'Invented Composer',
      composerDied: 1850,
      firstPublished: 1840,
      edition: 'An invented first edition, 1840',
      contributors: [{ role: 'arranger', name: 'Invented Arranger', died: 1890 }],
    };
    const a = { ...good(), source: pd };
    const b = { ...good(), source: { kind: 'stolen' } };
    // Files from before the proof fields had a year only.
    const c = { ...good(), source: { kind: 'public-domain', composer: 'Anon', year: 1850 } };
    const p = parsed(file([a, b, c]));
    expect(p.items.map((i) => i.source)).toEqual([
      pd,
      { kind: 'user' },
      {
        kind: 'public-domain',
        composer: 'Anon',
        composerDied: null,
        firstPublished: 1850,
        edition: '',
      },
    ]);
  });
});
