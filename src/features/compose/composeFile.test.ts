import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { parseFile } from '@/core/format';
import type { MidiProject } from '@/core/midi/smf';
import { midiToDraft, type SongDraft } from '@/core/songs/draft';
import { makeUserSong } from '@/core/songs/library';
import { composeFile, type ComposeForm } from './composeFile';

const NOW = new Date('2026-11-01T10:00:00Z');

/** An invented Studio song: four bars of a tune in G. */
const draft = (title: string, midi = [67, 71, 74, 72]): SongDraft => ({
  title,
  key: { tonic: 'G', mode: 'major' },
  tempo: 90,
  meter: { beats: 4, unit: 4 },
  bars: 4,
  notes: midi.map((m, i) => ({ id: `n${i + 1}`, startBeat: i * 4, beats: 4, midi: m })),
  chords: [0, 1, 2, 3].map((i) => ({ startBeat: i * 4, beats: 4, symbol: i % 2 ? 'D' : 'G' })),
  lhPattern: 'arpeggio-8ths',
});

/** An invented MIDI project, as Studio keeps one: a melody over two bars. */
const project: MidiProject = {
  title: 'Ferry tune',
  ppq: 480,
  tempo: 96,
  meter: { beats: 3, unit: 4 },
  tempos: [{ beat: 0, bpm: 96 }],
  meters: [{ beat: 0, numerator: 3, denominator: 4 }],
  tracks: [
    {
      id: 't1',
      name: 'Melody',
      channel: 0,
      program: 0,
      muted: false,
      notes: [67, 69, 71, 72, 71, 69].map((midi, i) => ({
        id: `m${i}`,
        startBeat: i,
        beats: 1,
        midi,
        velocity: 90,
      })),
    },
  ],
};

const form = (patch: Partial<ComposeForm> = {}): ComposeForm => ({
  title: 'Evening Ferry',
  piece: 'evening-ferry',
  summary: 'A slow tune for the crossing home.',
  credit: { kind: 'original', author: 'Ayu Lestari' },
  songs: {
    easy: makeUserSong('mine-song-a', draft('Ferry, easy'), 0),
    advanced: makeUserSong('mine-song-b', draft('Ferry, full', [67, 71, 74, 79]), 0),
  },
  ...patch,
});

const ctx = { patterns: new Set(Object.keys(PATTERNS)), fallbackPattern: 'arpeggio-8ths' };

describe('composeFile', () => {
  it('puts Studio songs together as the versions of one catalogue piece', () => {
    const out = composeFile(form(), NOW);
    expect(out.issues).toEqual([]);
    expect(out.fileName).toBe('evening-ferry.json');
    const parsed = parseFile(out.text!, ctx);
    if ('fatal' in parsed) throw new Error(parsed.fatal);
    expect(parsed.errors).toEqual([]);
    expect(parsed.items.map((i) => [i.id, i.title, i.source])).toEqual([
      ['evening-ferry-easy', 'Evening Ferry', { kind: 'original', author: 'Ayu Lestari' }],
      ['evening-ferry-advanced', 'Evening Ferry', { kind: 'original', author: 'Ayu Lestari' }],
    ]);
    const easy = parsed.items[0]!.value;
    if (easy.kind !== 'song') throw new Error('expected a song');
    expect(easy.lesson).toMatchObject({
      piece: 'evening-ferry',
      level: 'easy',
      summary: 'A slow tune for the crossing home.',
    });
    expect(JSON.parse(out.text!).exportedAt).toBe('2026-11-01T10:00:00.000Z');
  });

  it('takes a song made from a MIDI file, with its piece and level', () => {
    const midi = makeUserSong('mine-song-m', midiToDraft(project), 0);
    const out = composeFile(form({ songs: { medium: midi }, summary: '' }), NOW);
    expect(out.issues).toEqual([]);
    const item = JSON.parse(out.text!).items[0];
    expect(Object.keys(item.song)).toEqual(['piece', 'level', 'midi']);
    expect(item).toMatchObject({ id: 'evening-ferry-medium', song: { level: 'medium' } });
  });

  it('says what is missing, in plain words, before anything else', () => {
    expect(
      composeFile(
        form({
          title: ' ',
          piece: 'Evening Ferry',
          songs: {},
          credit: { kind: 'original', author: '' },
        }),
        NOW,
      ),
    ).toEqual({
      fileName: 'Evening Ferry.json',
      text: null,
      issues: [
        'Pick a song for at least one version.',
        'Give it a title.',
        'Give it a piece id: lowercase letters, digits and dashes, like evening-ferry.',
        'Name the composer: the author of this piece.',
      ],
    });
    const pd = {
      kind: 'public-domain' as const,
      composer: 'Invented Composer',
      composerDied: 'long ago',
      firstPublished: '',
      edition: '',
      editor: '',
      editorDied: '',
    };
    expect(composeFile(form({ credit: pd }), NOW).issues).toEqual([
      "The composer's year of death is a year, like 1827.",
      'Give the year the piece was first published, like 1826.',
      'Name the early edition the notes come from.',
    ]);
  });

  it('checks a public-domain credit by the catalogue rules for this year', () => {
    const credit = {
      kind: 'public-domain' as const,
      composer: 'Invented Composer',
      composerDied: '1990',
      firstPublished: '1950',
      edition: 'An invented first edition, 1950',
      editor: '',
      editorDied: '',
    };
    expect(composeFile(form({ credit }), NOW)).toMatchObject({
      text: null,
      issues: [
        'public domain: Invented Composer (composer) died in 1990: public domain under life + 70 only from 2061',
        'public domain: first published in 1950: public domain in the US only from 2046',
      ],
    });
    // A traditional tune, first published long ago, passes.
    const old = { ...credit, composer: '', composerDied: '', firstPublished: '1785' };
    const out = composeFile(form({ credit: old }), NOW);
    expect(out.issues).toEqual([]);
    expect(JSON.parse(out.text!).items[0].source).toMatchObject({
      kind: 'public-domain',
      composer: 'Traditional',
      composerDied: null,
      firstPublished: 1785,
    });
  });

  it('refuses a retired piece id, by the same rule', () => {
    expect(composeFile(form({ piece: 'window-light' }), NOW).issues).toEqual([
      'window-light is a retired piece; choose another id',
    ]);
  });
});
