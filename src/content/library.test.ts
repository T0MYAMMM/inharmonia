import { describe, expect, it } from 'vitest';
import { compileLesson, validateLesson } from '@/core/content/compile';
import { publicDomainIssues } from '@/core/content/publicDomain';
import { SONG_LEVELS } from '@/core/content/types';
import { parsePiece, pieceFile } from '@/core/library';
import { SONGS, versionsOf } from './lessons';
import { PATTERNS } from './patterns';

const SOURCES = import.meta.glob('./songs/sources/*.piece', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const FILES = import.meta.glob('./songs/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('the built-in song library', () => {
  it('has every source built into its JSON file (run npm run songs after editing one)', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(0);
    for (const [path, text] of Object.entries(SOURCES)) {
      const src = parsePiece(text);
      expect(path, 'file name matches the piece id').toBe(
        `./songs/sources/${src.meta.piece}.piece`,
      );
      expect(FILES[`./songs/${src.meta.piece}.json`], `${src.meta.piece}.json`).toBe(
        pieceFile(src),
      );
    }
  });

  it('plays every song, and gives every library piece its three versions', () => {
    for (const s of SONGS) {
      expect(validateLesson(s), s.id).toEqual([]);
      expect(compileLesson(s, PATTERNS).events.length, s.id).toBeGreaterThan(0);
    }
    const pieces = new Set(SONGS.flatMap((s) => (s.piece ? [s.piece] : [])));
    for (const p of pieces)
      expect(
        versionsOf(p).map((s) => s.level),
        p,
      ).toEqual([...SONG_LEVELS]);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });

  it('keeps complete source-backed musical forms for the extended pieces', () => {
    const canon = versionsOf('canon-in-d');
    expect(canon.map((s) => s.bars.length)).toEqual([55, 55, 57]);
    const advancedCanon = canon[2]!;
    expect(advancedCanon.bars[0]!.rh).toEqual([{ note: 'r', beats: 4 }]);
    expect(advancedCanon.bars[1]!.rh).toEqual([{ note: 'r', beats: 4 }]);
    expect(advancedCanon.bars[2]!.rh!.map((n) => n.note)).toEqual(['F#5', 'E5', 'D5', 'C#5']);
    expect(advancedCanon.bars[56]!.section).toBe('Cadence');
    expect(advancedCanon.bars[56]!.chords[0]!.symbol).toBe('D');
    expect(advancedCanon.source.kind).toBe('public-domain');
    if (advancedCanon.source.kind === 'public-domain')
      expect(advancedCanon.source.edition).toContain('Mutopia Project 2015, CC BY 4.0');

    const lullaby = versionsOf('brahms-lullaby');
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
  it('ships only public-domain pieces that pass both rules this year', () => {
    const year = new Date().getFullYear();
    for (const s of SONGS) {
      if (s.source.kind === 'public-domain')
        expect(publicDomainIssues(s.source, year), s.id).toEqual([]);
      else expect(['original', 'generic'], s.id).toContain(s.source.kind);
    }
  });
});
