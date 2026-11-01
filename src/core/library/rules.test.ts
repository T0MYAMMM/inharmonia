import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { parseFile } from '../format';
import { parsePiece, pieceFile } from '.';
import { catalogueIssues, indexIssues, sizeIssues } from './rules';

const ctx = { patterns: new Set(Object.keys(PATTERNS)), fallbackPattern: 'arpeggio-8ths' };
const YEAR = 2026;

// An invented piece, written for these tests, by an invented composer.
const SOURCE = `title: Harbour Tune
piece: harbour-tune
added: 2026-01-02
source: original
author: Ayu Lestari
key: G major
meter: 4/4
tempo: 90
summary: An invented tune for the tests.
figure: arpeggio-8ths
[A] main 1-2
melody: | G4h B4h | D5w |
chords: | G | D |
`;

/** The piece's file as JSON, to change before reading. */
const file = () => JSON.parse(pieceFile(parsePiece(SOURCE)));
const issues = (doc: unknown, piece = 'harbour-tune') =>
  catalogueIssues(parseFile(JSON.stringify(doc), ctx), { piece, year: YEAR });

describe('catalogue rules', () => {
  it('pass a piece with its three versions and an original credit', () => {
    expect(issues(file())).toEqual([]);
    const one = file();
    one.items = [one.items[1]];
    expect(issues(one)).toEqual([]);
  });

  it('refuse what the reader refuses', () => {
    expect(catalogueIssues(parseFile('nope', ctx), { piece: 'x', year: YEAR })).toEqual([
      'This is not JSON, so it cannot be an Inharmonia export.',
    ]);
    const doc = file();
    doc.items[0].song.bars[0].chords[0].symbol = 'Hx';
    expect(issues(doc)).toEqual([
      'Item 1 (Harbour Tune), song.bars[0].chords[0].symbol: "Hx" is not a chord',
    ]);
  });

  it('take songs only: no chart, no progression, no recording', () => {
    const doc = file();
    doc.items[2] = {
      kind: 'progression',
      id: 'p1',
      title: 'Loop',
      source: { kind: 'original', author: 'Ayu Lestari' },
      progression: {
        mode: 'major',
        meter: { beats: 4, unit: 4 },
        steps: [{ numeral: 'I', beats: 4 }],
      },
    };
    doc.assets = [
      {
        kind: 'recording',
        for: 'harbour-tune-easy',
        sampleRate: 8000,
        beat0: 0,
        traceStart: 0,
        traceHop: 1,
        traceShift: 0,
        samples: '',
        trace: '',
      },
    ];
    expect(issues(doc)).toEqual([
      'has a recording; a catalogue song has none',
      'Item 3 is a progression, not a song',
    ]);
  });

  it('take one to three versions, each level once, each id the piece and its level', () => {
    const four = file();
    four.items.push({ ...four.items[0], id: 'harbour-tune-extra' });
    expect(issues(four)).toContain('needs 1 to 3 songs, not 4');
    expect(issues({ ...file(), items: [] })).toEqual(['needs 1 to 3 songs, not 0']);

    const twice = file();
    twice.items[1].song.level = 'easy';
    expect(issues(twice)).toEqual([
      'Item 2 (Harbour Tune): its id should be harbour-tune-easy',
      'has more than one easy version',
    ]);

    const noLevel = file();
    delete noLevel.items[2].song.level;
    expect(issues(noLevel)).toEqual(['Item 3 (Harbour Tune) needs a level']);
  });

  it('take the piece id from the file name, and refuse a retired one', () => {
    expect(issues(file(), 'other-tune')).toEqual([
      'Item 1 (Harbour Tune): its id should be other-tune-easy',
      'Item 1 (Harbour Tune): its piece should be other-tune',
      'Item 2 (Harbour Tune): its id should be other-tune-medium',
      'Item 2 (Harbour Tune): its piece should be other-tune',
      'Item 3 (Harbour Tune): its id should be other-tune-advanced',
      'Item 3 (Harbour Tune): its piece should be other-tune',
    ]);
    const retired = JSON.parse(
      pieceFile(parsePiece(SOURCE.replace('piece: harbour-tune', 'piece: window-light'))),
    );
    expect(issues(retired, 'window-light')).toEqual([
      'window-light is a retired piece; choose another id',
    ]);
    expect(issues(file(), 'Harbour_Tune')).toContain(
      '"Harbour_Tune" is not a piece id (lowercase letters, digits, dashes)',
    );
  });

  it('need one title and one credit: an original with its author, or public domain proved', () => {
    const titles = file();
    titles.items[2].title = 'Harbour Tune (long)';
    expect(issues(titles)).toEqual(['every version needs the same title']);

    const credits = file();
    credits.items[2].source = { kind: 'original', author: 'Someone Else' };
    expect(issues(credits)).toEqual(['every version needs the same credit']);

    const NEEDS =
      'needs a credit: an original piece with its author, or a public-domain piece with its proof';
    for (const source of [{ kind: 'original' }, { kind: 'generic' }, { kind: 'user' }]) {
      const doc = file();
      for (const item of doc.items) item.source = source;
      expect(issues(doc), source.kind).toContain(NEEDS);
    }
    // A song of yours is rebuilt as yours, so it loses its piece and level too.
    const yours = file();
    for (const item of yours.items) item.source = { kind: 'user' };
    expect(issues(yours)).toContain('Item 1 (Harbour Tune) needs a level');

    const recent = file();
    for (const item of recent.items)
      item.source = {
        kind: 'public-domain',
        composer: 'Invented Composer',
        composerDied: 1990,
        firstPublished: 1950,
        edition: 'An invented first edition',
      };
    expect(issues(recent)).toEqual([
      'public domain: Invented Composer (composer) died in 1990: public domain under life + 70 only from 2061',
      'public domain: first published in 1950: public domain in the US only from 2046',
    ]);
  });
});

describe('index rules', () => {
  it('refuse a piece listed twice or retired, across the built-ins and the catalogue', () => {
    expect(indexIssues([{ piece: 'a' }, { piece: 'b' }])).toEqual([]);
    expect(indexIssues([{ piece: 'a' }, { piece: 'senja-di-teras' }, { piece: 'a' }])).toEqual([
      'senja-di-teras is a retired piece',
      'a is listed twice',
    ]);
  });

  it('cap a song file at 512 kB', () => {
    expect(sizeIssues(512_000)).toEqual([]);
    expect(sizeIssues(512_001)).toEqual([
      'is 512001 bytes, over the 512000 a catalogue song may be',
    ]);
  });
});
