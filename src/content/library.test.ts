import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_PIECES } from '@config/library';
import { compileLesson, validateLesson } from '@/core/content/compile';
import { publicDomainIssues } from '@/core/content/publicDomain';
import { SONG_LEVELS, type Lesson } from '@/core/content/types';
import { parseFile } from '@/core/format';
import { buildLibrary, BUILT_IN_DIR, CATALOGUE_DIR, INDEX_FILE } from '@/core/library/build';
import { parseIndex } from '@/core/library/catalogue';
import { SONGS, versionsOf } from './lessons';
import { PATTERNS } from './patterns';

const SOURCES = import.meta.glob('./songs/sources/*.piece', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const BUILT_IN = import.meta.glob('./songs/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const CATALOGUE = import.meta.glob('../../public/library/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const ctx = { patterns: new Set(Object.keys(PATTERNS)), fallbackPattern: 'arpeggio-8ths' };
const name = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** What is on disk, by path from the repo root, as `npm run songs` names it. */
const ON_DISK = new Map<string, string>([
  ...Object.entries(BUILT_IN).map(([p, t]) => [`${BUILT_IN_DIR}/${name(p)}`, t] as const),
  ...Object.entries(CATALOGUE).map(([p, t]) => [`${CATALOGUE_DIR}/${name(p)}`, t] as const),
]);

/** Every catalogue song, read from its file the way a download reads it. */
function catalogueSongs(): Lesson[] {
  return Object.entries(CATALOGUE)
    .filter(([p]) => name(p) !== INDEX_FILE)
    .flatMap(([p, text]) => {
      const parsed = parseFile(text, ctx);
      if ('fatal' in parsed) throw new Error(`${p}: ${parsed.fatal}`);
      expect(parsed.errors, p).toEqual([]);
      return parsed.items.flatMap((i) => (i.value.kind === 'song' ? [i.value.lesson] : []));
    });
}

const catalogueVersions = (piece: string) =>
  catalogueSongs()
    .filter((s) => s.piece === piece)
    .sort((a, b) => SONG_LEVELS.indexOf(a.level!) - SONG_LEVELS.indexOf(b.level!));

describe('the song library', () => {
  it('is what npm run songs builds, rules passed (run it after editing a source)', () => {
    const built = buildLibrary({
      sources: Object.fromEntries(Object.entries(SOURCES).map(([p, t]) => [name(p), t])),
      catalogue: Object.fromEntries(
        Object.entries(CATALOGUE)
          .filter(([p]) => name(p) !== INDEX_FILE)
          .map(([p, t]) => [name(p), t]),
      ),
      builtIns: BUILT_IN_PIECES,
      year: new Date().getFullYear(),
      ctx,
      sha256: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
      gzipBytes: (text) => gzipSync(text).length,
    });
    expect(built.issues).toEqual([]);
    expect(built.files.size).toBeGreaterThan(BUILT_IN_PIECES.length + 2);
    for (const [path, text] of built.files) expect(ON_DISK.get(path), path).toBe(text);
  });

  it('bundles the built-in pieces, each with its three versions', () => {
    const pieces = [...new Set(SONGS.map((s) => s.piece))].sort();
    expect(pieces).toEqual(expect.arrayContaining([...BUILT_IN_PIECES]));
    // Until downloads land, the catalogue pieces are bundled too: exact copies.
    for (const [path, text] of Object.entries(BUILT_IN)) {
      const piece = name(path).slice(0, -'.json'.length);
      if (name(path) === INDEX_FILE || BUILT_IN_PIECES.includes(piece)) continue;
      expect(text, path).toBe(CATALOGUE[`../../public/library/${piece}.json`]);
    }
    for (const p of pieces)
      expect(
        versionsOf(p!).map((s) => s.level),
        p,
      ).toEqual([...SONG_LEVELS]);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });

  it('lists every built-in and catalogue piece in its index', () => {
    const builtIn = parseIndex(BUILT_IN[`./songs/${INDEX_FILE}`]!)!;
    expect(builtIn.map((e) => e.piece).sort()).toEqual([...BUILT_IN_PIECES].sort());
    const catalogue = parseIndex(CATALOGUE[`../../public/library/${INDEX_FILE}`]!)!;
    expect(catalogue.length).toBeGreaterThan(0);
    expect(catalogue.map((e) => e.file).sort()).toEqual(
      Object.keys(CATALOGUE)
        .map(name)
        .filter((n) => n !== INDEX_FILE)
        .sort(),
    );
  });

  // The unit sweep: every version of every song, built in or in the catalogue, compiles.
  it('plays every song, built in or in the catalogue', () => {
    const all = [...SONGS, ...catalogueSongs().filter((c) => !SONGS.some((s) => s.id === c.id))];
    expect(all.length).toBeGreaterThanOrEqual(SONGS.length);
    for (const s of all) {
      expect(validateLesson(s), s.id).toEqual([]);
      expect(compileLesson(s, PATTERNS).events.length, s.id).toBeGreaterThan(0);
    }
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
  });

  it('keeps complete source-backed musical forms for the extended pieces', () => {
    const canon = catalogueVersions('canon-in-d');
    expect(canon.map((s) => s.bars.length)).toEqual([55, 55, 57]);
    const advancedCanon = canon[2]!;
    expect(advancedCanon.bars[0]!.rh).toEqual([{ note: 'r', beats: 4 }]);
    expect(advancedCanon.bars[1]!.rh).toEqual([{ note: 'r', beats: 4 }]);
    expect(advancedCanon.bars[2]!.rh!.map((n) => n.note)).toEqual(['F#5', 'E5', 'D5', 'C#5']);
    expect(advancedCanon.bars[56]!.section).toBe('Cadence');
    expect(advancedCanon.bars[56]!.chords[0]!.symbol).toBe('D');
    expect(advancedCanon.source.kind).toBe('public-domain');
    if (advancedCanon.source.kind === 'public-domain') {
      expect(advancedCanon.source.edition).toContain('Mus.ms. 16481/8');
      expect(advancedCanon.source.edition).not.toContain('Mutopia');
      expect(advancedCanon.source).toMatchObject({ editor: 'Max Seiffert', editorDied: 1948 });
    }

    const lullaby = catalogueVersions('brahms-lullaby');
    expect(lullaby.map((s) => s.bars.length)).toEqual([34, 34, 35]);
    const advanced = lullaby[2]!;
    expect(advanced.bars[18]!.section).toBe('Second verse');
    expect(advanced.bars.slice(18).map((b) => b.rh)).toEqual(
      advanced.bars.slice(1, 18).map((b) => b.rh),
    );
    expect(advanced.bars.slice(18).map((b) => b.chords)).toEqual(
      advanced.bars.slice(1, 18).map((b) => b.chords),
    );
  });

  // Computed from this year, so a piece cannot drift out of the rules unnoticed.
  it('ships only public-domain pieces that pass both rules this year, or credited originals', () => {
    const year = new Date().getFullYear();
    for (const s of [...SONGS, ...catalogueSongs()]) {
      if (s.source.kind === 'public-domain')
        expect(publicDomainIssues(s.source, year), s.id).toEqual([]);
      else expect(s.source, s.id).toMatchObject({ kind: 'original', author: expect.any(String) });
    }
  });
});
