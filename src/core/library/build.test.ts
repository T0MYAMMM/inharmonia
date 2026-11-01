import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@/content/patterns';
import { parseIndex } from './catalogue';
import { buildLibrary, type LibraryInput } from './build';
import { parsePiece, pieceFile } from '.';

// Invented pieces, written for these tests.
const tune = (piece: string, author = 'Ayu Lestari') => `title: ${piece}
piece: ${piece}
added: 2026-01-02
source: original
author: ${author}
key: G major
meter: 4/4
tempo: 90
figure: arpeggio-8ths
[A] main 1-2
melody: | G4h B4h | D5w |
chords: | G | D |
`;

const input = (patch: Partial<LibraryInput> = {}): LibraryInput => ({
  sources: { 'harbour.piece': tune('harbour'), 'lantern.piece': tune('lantern') },
  catalogue: {},
  builtInFiles: [],
  builtIns: ['harbour'],
  year: 2026,
  ctx: { patterns: new Set(Object.keys(PATTERNS)), fallbackPattern: 'arpeggio-8ths' },
  sha256: (text) => `${text.length}`.padStart(64, '0'),
  gzipBytes: () => 100,
  ...patch,
});

describe('buildLibrary', () => {
  it('writes a built-in piece next to the app and a catalogue piece to the library', () => {
    const { files, issues } = buildLibrary(input());
    expect(issues).toEqual([]);
    expect([...files.keys()].sort()).toEqual([
      'public/library/index.json',
      'public/library/lantern.json',
      'src/content/songs/harbour.json',
      'src/content/songs/index.json',
    ]);
    expect(files.get('public/library/lantern.json')).toBe(pieceFile(parsePiece(tune('lantern'))));
    const index = parseIndex(files.get('public/library/index.json')!)!;
    expect(index.map((e) => [e.piece, e.bytes, e.credit])).toEqual([
      [
        'lantern',
        new TextEncoder().encode(files.get('public/library/lantern.json')!).length,
        'Original, by Ayu Lestari',
      ],
    ]);
    expect(parseIndex(files.get('src/content/songs/index.json')!)!.map((e) => e.piece)).toEqual([
      'harbour',
    ]);
  });

  it("writes a composer's file the app's way, Easy first, keeping its date", () => {
    const made = JSON.parse(pieceFile(parsePiece(tune('evening'))));
    made.items.reverse();
    made.exportedAt = '2026-05-06T07:08:09.000Z';
    const text = JSON.stringify(made);
    const { files, issues } = buildLibrary(input({ catalogue: { 'evening.json': text } }));
    expect(issues).toEqual([]);
    const out = JSON.parse(files.get('public/library/evening.json')!);
    expect(out.items.map((i: { id: string }) => i.id)).toEqual([
      'evening-easy',
      'evening-medium',
      'evening-advanced',
    ]);
    expect(out.exportedAt).toBe('2026-05-06T07:08:09.000Z');
    // Written again, it is unchanged.
    const again = buildLibrary(
      input({ catalogue: { 'evening.json': files.get('public/library/evening.json')! } }),
    );
    expect(again.files.get('public/library/evening.json')).toBe(
      files.get('public/library/evening.json'),
    );
  });

  it('says what keeps the library from building, by file', () => {
    const { issues } = buildLibrary(
      input({
        sources: { 'lantern.piece': tune('lantern'), 'wrong-name.piece': tune('other') },
        catalogue: {
          'Bad Name.json': '{}',
          'harbour.json': pieceFile(parsePiece(tune('harbour'))),
          'broken.json': 'not json',
        },
        builtIns: ['harbour'],
        builtInFiles: ['index.json', 'lantern.json', 'sources'],
        gzipBytes: () => 60_000,
      }),
    );
    expect(issues).toEqual([
      'src/content/songs/sources/wrong-name.piece: should be named other.piece',
      'public/library/Bad Name.json: a catalogue file is named <piece>.json',
      'public/library/broken.json: This is not JSON, so it cannot be an Inharmonia export.',
      'public/library/harbour.json: harbour is built in, so it has no catalogue file',
      'src/content/songs/lantern.json: only built-in pieces go here (see config/library.ts)',
      'harbour is built in, so it needs src/content/songs/sources/harbour.piece',
      'src/content/songs/index.json: 60000 bytes gzipped, over 50000: time to split the index',
      'public/library/index.json: 60000 bytes gzipped, over 50000: time to split the index',
    ]);
  });

  it('builds a piece with a source from it, and refuses a piece with no credit', () => {
    // The source wins over whatever the piece's file says.
    const { files, issues } = buildLibrary(input({ catalogue: { 'lantern.json': 'stale' } }));
    expect(issues).toEqual([]);
    expect(files.get('public/library/lantern.json')).toBe(pieceFile(parsePiece(tune('lantern'))));
    const uncredited = JSON.parse(pieceFile(parsePiece(tune('quiet'))));
    for (const item of uncredited.items) item.source = { kind: 'original' };
    expect(
      buildLibrary(input({ catalogue: { 'quiet.json': JSON.stringify(uncredited) } })).issues,
    ).toEqual([
      'public/library/quiet.json: needs a credit: an original piece with its author, or a public-domain piece with its proof',
    ]);
  });
});
