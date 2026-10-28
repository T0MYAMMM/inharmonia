import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { PROGRESSIONS } from '@/content/progressions';
import { SENJA_DI_TERAS } from '@/content/songs/senjaDiTeras';
import { withLyric } from '../charts/lyrics';
import { parseBars } from '../charts/syntax';
import { CHART_VERSION, DEFAULT_VIEW, type ChordChart } from '../charts/types';
import type { MidiProject } from '../midi/smf';
import { makeUserSong, type UserRecording } from '../songs/library';
import { midiToDraft, type SongDraft } from '../songs/draft';
import {
  buildFile,
  FORMAT_VERSION,
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

/**
 * Back to a file item, the way the app exports what it imported, Include
 * lyrics ticked: a chart without lyrics is written the same either way.
 */
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
      lyrics: true,
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
  version: CHART_VERSION,
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
  showLyrics: false,
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
  it.each(['song', 'chart', 'progression', 'midi-song', 'chart-lyrics'])(
    '%s.json matches the schema and round-trips byte for byte',
    (name) => {
      const text = readFileSync(resolve(ROOT, `docs/format/examples/${name}.json`), 'utf8');
      expectSchema(text);
      expect(roundTrip(text)).toBe(text);
    },
  );
});

describe('meters', () => {
  const song = () =>
    JSON.parse(
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
    );

  it('takes 2/4, 3/4, 4/4 and 3/8, and nothing else', () => {
    const ok = song();
    expect(validate(ok)).toBe(true);
    for (const meter of [
      { beats: 3, unit: 8 },
      { beats: 6, unit: 8 },
      { beats: 4, unit: 8 },
      { beats: 3, unit: 2 },
    ]) {
      const f = song();
      f.items[0].song.meter = meter;
      expect(validate(f), JSON.stringify(meter)).toBe(meter.unit === 8 && meter.beats === 3);
    }
    const f = song();
    f.items[0].song.meter = { beats: 6, unit: 8 };
    const p = parseFile(JSON.stringify(f), ctx);
    if ('fatal' in p) throw new Error(p.fatal);
    expect(p.errors.map(describeError)).toEqual([
      'Item 1 (Morning), song.meter: must be 2/4, 3/4, 4/4, 3/8',
    ]);
  });
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

describe('a chart with lyrics', () => {
  // Invented words on the first section's bars.
  const sung = (): ChordChart => ({
    ...chart,
    sections: chart.sections.map((s, si) =>
      si === 0
        ? {
            ...s,
            bars: s.bars.map((b, i) =>
              withLyric(b, ['lanterns on the', 'water', undefined, 'home'][i]),
            ),
          }
        : s,
    ),
  });
  const file = (lyrics?: boolean) =>
    stringifyFile(
      buildFile(
        [
          chartItem({
            id: 'mine-chart-1',
            chart: sung(),
            view,
            updatedAt: at.getTime(),
            ...(lyrics === undefined ? {} : { lyrics }),
          }),
        ],
        [],
        at,
      ),
    );

  it('is exported without them unless asked, and imports as the chart without them', () => {
    const text = file();
    expect(file(false)).toBe(text);
    expectSchema(text);
    expect(text).not.toMatch(/"lyrics"|lanterns|water|home/);
    expect(parsed(text).items[0]!.value).toEqual({ kind: 'chart', chart, view });
    expect(roundTrip(text)).toBe(text);
  });

  it('is exported with them when asked: a line per bar, only for sections that have some', () => {
    const text = file(true);
    expectSchema(text);
    const sections = JSON.parse(text).items[0].chart.sections;
    expect(sections[0].lyrics).toEqual(['lanterns on the', 'water', '', 'home']);
    expect(sections[1]).not.toHaveProperty('lyrics');
    expect(parsed(text).items[0]!.value).toEqual({ kind: 'chart', chart: sung(), view });
    // Imported, then exported with them again: the same bytes.
    expect(roundTrip(text)).toBe(text);
  });

  it('are checked by bar on the way in, and the words are never quoted back', () => {
    const bad = (patch: (lyrics: unknown[]) => unknown) => {
      const doc = JSON.parse(file(true));
      doc.items[0].chart.sections[0].lyrics = patch(doc.items[0].chart.sections[0].lyrics);
      const p = parseFile(JSON.stringify(doc), ctx);
      if ('fatal' in p) throw new Error(p.fatal);
      return p.errors.map(describeError);
    };
    expect(bad((l) => l.slice(1))).toEqual([
      'Item 1 (Test chart), chart.sections[0].lyrics: should list one line of lyrics per bar ("" for none)',
    ]);
    expect(bad((l) => [l[0], 'water\nmore water', l[2], l[3]])).toEqual([
      'Item 1 (Test chart), chart.sections[0].lyrics[1]: should be one line',
    ]);
    expect(bad((l) => [l[0], l[1], 'la '.repeat(41), l[3]])).toEqual([
      'Item 1 (Test chart), chart.sections[0].lyrics[2]: is over 120 characters',
    ]);
    expect(bad((l) => [l[0], 7, l[2], l[3]])).toEqual([
      'Item 1 (Test chart), chart.sections[0].lyrics[1]: should be text',
    ]);
    // Spaces are evened out, and an empty line is no lyrics.
    const doc = JSON.parse(file(true));
    doc.items[0].chart.sections[0].lyrics = ['  lanterns   on the ', ' ', '', 'home'];
    const back = parsed(JSON.stringify(doc)).items[0]!.value;
    expect(
      back.kind === 'chart' && back.chart.sections[0]!.bars.map((b) => b.lyric ?? null),
    ).toEqual(['lanterns on the', null, null, 'home']);
  });
});

describe('version 2 files', () => {
  it.each(['song', 'chart', 'progression'])(
    'the version 2 %s example still imports, and exports again as version 3',
    (name) => {
      const v2 = readFileSync(resolve(__dirname, `fixtures/v2-${name}.json`), 'utf8');
      expect(JSON.parse(v2).version).toBe(2);
      expect(parsed(v2).version).toBe(2);
      const v3 = readFileSync(resolve(ROOT, `docs/format/examples/${name}.json`), 'utf8');
      expect(roundTrip(v2)).toBe(v3);
    },
  );
});

/** Invented: a melody, held chords and a muted bass, a little uneven, as played in. */
function midiProject(bars: number, tempo = 96): MidiProject {
  const late = (i: number) => ((i * 7) % 5) / 480;
  return {
    title: 'Evening ferry',
    ppq: 480,
    tempo,
    meter: { beats: 4, unit: 4 },
    tempos: [
      { beat: 0, bpm: tempo },
      { beat: 128, bpm: tempo - 6 },
    ],
    meters: [{ beat: 0, numerator: 4, denominator: 4 }],
    tracks: [
      {
        id: 't1c0',
        name: 'Melody',
        channel: 0,
        program: 0,
        muted: false,
        notes: Array.from({ length: bars * 2 }, (_, i) => ({
          id: `n${i + 1}`,
          startBeat: i * 2 + late(i),
          beats: 1.75 - late(i + 1),
          midi: [72, 74, 76, 79, 77, 76, 74, 72][i % 8]!,
          velocity: 80 + (i % 20),
        })),
      },
      {
        id: 't2c1',
        name: 'Chords',
        channel: 1,
        program: 4,
        muted: false,
        notes: Array.from({ length: bars * 3 }, (_, i) => ({
          id: `n${i + 1}`,
          startBeat: Math.floor(i / 3) * 4 + late(i),
          beats: 3.9,
          midi: [60, 64, 67][i % 3]! + [0, 5, 7, 0][Math.floor(i / 3) % 4]!,
          velocity: 64,
        })),
      },
      {
        id: 't3c2',
        name: 'Bass',
        channel: 2,
        program: 32,
        muted: true,
        notes: Array.from({ length: bars }, (_, i) => ({
          id: `n${i + 1}`,
          startBeat: i * 4,
          beats: 2,
          midi: 36 + [0, 5, 7, 0][i % 4]!,
          velocity: 100,
        })),
      },
    ],
  };
}

const midiFile = (project: MidiProject, title = project.title) => {
  const song = makeUserSong('mine-song-ferry', { ...midiToDraft(project), title }, at.getTime());
  return {
    song,
    text: stringifyFile(
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
    ),
  };
};

describe('songs made from a MIDI file', () => {
  it('round-trip with every track, at 80 bars, uneven, with a tempo change and a muted track', () => {
    const project = midiProject(80);
    const { song, text } = midiFile(project);
    expectSchema(text);
    const item = JSON.parse(text).items[0];
    expect(Object.keys(item.song)).toEqual(['midi']);
    expect(item.song.midi.tracks.map((t: { name: string }) => t.name)).toEqual([
      'Melody',
      'Chords',
      'Bass',
    ]);
    const back = parsed(text).items[0]!;
    if (back.value.kind !== 'song') throw new Error('expected a song');
    expect(back.value.draft.bars).toBe(80);
    expect(back.value.draft.midi).toEqual(project);
    expect(back.value.lesson).toEqual(song.lesson);
    // One project, shared by the draft and the lesson, as Studio's save leaves it.
    expect(back.value.lesson.midi).toBe(back.value.draft.midi);
    expect(roundTrip(text)).toBe(text);
  });

  it('keep a tempo outside 30 to 240, which a MIDI file may have', () => {
    const back = parsed(midiFile(midiProject(4, 250)).text).items[0]!;
    expect(back.value.kind === 'song' && back.value.lesson.tempo.default).toBe(250);
  });

  it('take the title from the item, and give a song with none a name', () => {
    const titled = parsed(midiFile(midiProject(2), 'Ferry, slower').text).items[0]!;
    expect(titled.value.kind === 'song' && titled.value.lesson.title).toBe('Ferry, slower');
    const blank = midiFile({ ...midiProject(2), title: '' });
    expect(JSON.parse(blank.text).items[0].title).toBe('Untitled');
    expect(roundTrip(blank.text)).toBe(blank.text);
  });

  it('name what is wrong with a project, under song.midi', () => {
    const file = (patch: (p: MidiProject) => void) => {
      const doc = JSON.parse(midiFile(midiProject(2)).text);
      patch(doc.items[0].song.midi);
      const p = parseFile(JSON.stringify(doc), ctx);
      if ('fatal' in p) throw new Error(p.fatal);
      return p.errors.map(describeError);
    };
    expect(file((p) => (p.tracks[1]!.notes[2]!.velocity = 0))).toEqual([
      'Item 1 (Evening ferry), song.midi: invalid MIDI note 3',
    ]);
    expect(file((p) => (p.meter = { beats: 6, unit: 8 }))).toEqual([
      'Item 1 (Evening ferry), song.midi.meter: must be 2/4, 3/4 or 4/4',
    ]);
    expect(file((p) => (p.tracks[0]!.notes[0]!.startBeat = 4 * 512 + 1))).toEqual([
      'Item 1 (Evening ferry), song.midi: is longer than 512 bars',
    ]);
  });

  it('refuse a version 2 export of one, which left its tracks out, and say so', () => {
    // What version 2 wrote: the practice score, every chord N.C., and no project.
    const { song } = midiFile(midiProject(2));
    const { midi: _left, ...lesson } = song.lesson;
    const doc = JSON.parse(
      stringifyFile(
        buildFile(
          [songItem({ id: song.id, source: { kind: 'user' }, lesson, voicings: false })],
          [],
          at,
        ),
      ),
    );
    doc.version = 2;
    const p = parseFile(JSON.stringify(doc), ctx);
    if ('fatal' in p) throw new Error(p.fatal);
    expect(p.items).toEqual([]);
    expect(p.errors.map(describeError)).toEqual([
      'Item 1 (Evening ferry), song: came from a MIDI file, and this older export left its tracks out. Export it again from where it was made.',
    ]);
  });

  it('refuse N.C. in a song of your own, by its field', () => {
    const doc = JSON.parse(
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
    );
    doc.items[0].song.bars[1].chords[1].symbol = 'N.C.';
    const p = parseFile(JSON.stringify(doc), ctx);
    if ('fatal' in p) throw new Error(p.fatal);
    expect(p.errors.map(describeError)).toEqual([
      'Item 1 (Morning), song.bars[1].chords[1].symbol: N.C. works in a chart, not in a song of yours',
    ]);
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
    JSON.stringify({
      format: 'inharmonia',
      version: FORMAT_VERSION,
      exportedAt: at.toISOString(),
      items,
    });
  const good = () =>
    JSON.parse(
      stringifyFile(buildFile([chartItem({ id: 'c1', chart, view: DEFAULT_VIEW })], [], at)),
    ).items[0];

  it.each([
    ['{oops', 'This is not JSON, so it cannot be an Inharmonia export.'],
    ['[1,2]', 'This is not an Inharmonia export.'],
    ['{"format":"other"}', 'This is not an Inharmonia export.'],
    [
      JSON.stringify({ format: 'inharmonia', version: 4, items: [] }),
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
      editor: 'Invented Editor',
      editorDied: 1880,
      editorAdditionsUsed: false,
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
