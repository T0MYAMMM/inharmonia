import { describe, expect, it } from 'vitest';
import {
  freeFromDeath,
  freeFromPublication,
  publicDomainIssues,
  TRADITIONAL,
} from './publicDomain';
import type { PublicDomainSource } from './types';

// Invented people and editions: only the dates matter here.
const piece = (patch: Partial<PublicDomainSource> = {}): PublicDomainSource => ({
  kind: 'public-domain',
  composer: 'Invented Composer',
  composerDied: 1900,
  firstPublished: 1890,
  edition: 'Invented first edition, 1890',
  ...patch,
});

describe('public domain under both rules', () => {
  it('passes life + 70 only after 70 full years', () => {
    expect(freeFromDeath(1955)).toBe(2026);
    expect(publicDomainIssues(piece({ composerDied: 1955 }), 2026)).toEqual([]);
    expect(publicDomainIssues(piece({ composerDied: 1956 }), 2026)).toEqual([
      'Invented Composer (composer) died in 1956: public domain under life + 70 only from 2027',
    ]);
    expect(publicDomainIssues(piece({ composerDied: 1956 }), 2027)).toEqual([]);
  });

  it('passes the US rule only 96 years after first publication', () => {
    expect(freeFromPublication(1930)).toBe(2026);
    expect(publicDomainIssues(piece({ firstPublished: 1930 }), 2026)).toEqual([]);
    expect(publicDomainIssues(piece({ firstPublished: 1931 }), 2026)).toEqual([
      'first published in 1931: public domain in the US only from 2027',
    ]);
  });

  it('checks arrangers too, and needs both rules at once', () => {
    const arranged = piece({
      composerDied: 1800,
      firstPublished: 1950,
      contributors: [{ role: 'arranger', name: 'Invented Arranger', died: 1980 }],
    });
    expect(publicDomainIssues(arranged, 2026)).toEqual([
      'Invented Arranger (arranger) died in 1980: public domain under life + 70 only from 2051',
      'first published in 1950: public domain in the US only from 2046',
    ]);
  });

  it("checks an editor only when the editor's own additions are used", () => {
    const edited = piece({
      editor: 'Invented Editor',
      editorDied: 1980,
      editorAdditionsUsed: false,
    });
    expect(publicDomainIssues(edited, 2026)).toEqual([]);
    expect(publicDomainIssues({ ...edited, editorAdditionsUsed: true }, 2026)).toEqual([
      'Invented Editor (editor, additions used) died in 1980: public domain under life + 70 only from 2051',
    ]);
    expect(
      publicDomainIssues({ ...edited, editorDied: null, editorAdditionsUsed: true }, 2026),
    ).toEqual([
      "Invented Editor: the editor's additions are used, so their year of death is needed",
    ]);
  });

  it('lets only a traditional tune go without a death year, and needs an edition', () => {
    expect(publicDomainIssues(piece({ composer: TRADITIONAL, composerDied: null }), 2026)).toEqual(
      [],
    );
    expect(publicDomainIssues(piece({ composerDied: null }), 2026)).toEqual([
      'Invented Composer: a named composer needs a year of death',
    ]);
    expect(publicDomainIssues(piece({ edition: ' ' }), 2026)).toEqual([
      'needs the edition the notes were taken from',
    ]);
  });
});
