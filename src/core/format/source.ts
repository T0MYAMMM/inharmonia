import type { ContentSource } from '../content/types';

// Kept apart from the reader so the app shell can clean a stored source
// without loading the whole file reader. The checks are the reader's own,
// copied so that neither file imports the other's internals.

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown, lo: number, hi: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;

/** A source as written, if it is one; anything else counts as the user's own. */
export function cleanSource(raw: unknown): ContentSource {
  if (!isObj(raw)) return { kind: 'user' };
  switch (raw.kind) {
    case 'original':
      return isStr(raw.author, 80) && raw.author
        ? { kind: 'original', author: raw.author }
        : { kind: 'original' };
    case 'generic':
      return { kind: 'generic' };
    case 'public-domain': {
      if (!isStr(raw.composer, 80) || !raw.composer) return { kind: 'user' };
      // Files from before the proof fields had only a year.
      const published = isNum(raw.firstPublished, 0, 3000)
        ? raw.firstPublished
        : isNum(raw.year, 0, 3000)
          ? raw.year
          : null;
      if (published === null) return { kind: 'user' };
      const contributors = Array.isArray(raw.contributors)
        ? raw.contributors.flatMap((c) =>
            isObj(c) && isStr(c.role, 40) && isStr(c.name, 80) && isNum(c.died, 0, 3000)
              ? [{ role: c.role, name: c.name, died: c.died }]
              : [],
          )
        : [];
      return {
        kind: 'public-domain',
        composer: raw.composer,
        composerDied: isNum(raw.composerDied, 0, 3000) ? raw.composerDied : null,
        firstPublished: published,
        edition: isStr(raw.edition, 300) ? raw.edition : '',
        ...(isStr(raw.editor, 80) && raw.editor
          ? {
              editor: raw.editor,
              editorDied: isNum(raw.editorDied, 0, 3000) ? raw.editorDied : null,
              editorAdditionsUsed: raw.editorAdditionsUsed === true,
            }
          : {}),
        ...(contributors.length ? { contributors } : {}),
      };
    }
    default:
      return { kind: 'user' };
  }
}
