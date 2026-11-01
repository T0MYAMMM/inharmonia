import { LIBRARY_LIMITS } from '@config/library';
import type { Lesson } from '../content/types';
import { buildFile, songItem, stringifyFile } from '../format/write';
import { parseFile, type ImportContext } from '../format/read';
import { CATALOGUE_FILE, indexEntry, stringifyIndex, type CatalogueEntry } from './catalogue';
import { generatePiece, type EasyChange } from './generate';
import { pieceFile } from './index';
import { catalogueIssues, indexIssues, sizeIssues } from './rules';
import { parsePiece } from './source';

/**
 * Everything `npm run songs` writes, worked out from what is in the repo:
 * the built-in songs (bundled), the catalogue songs (downloaded on request),
 * and an index of each. Pure: the caller reads and writes the files, and
 * gives the hash and gzip, so the script and the tests build the same thing.
 */

/** Built-in songs and their index, bundled with the app. */
export const BUILT_IN_DIR = 'src/content/songs';
/** Catalogue songs and their index, served next to the app. */
export const CATALOGUE_DIR = 'public/library';
export const INDEX_FILE = 'index.json';

export interface LibraryInput {
  /** The `.piece` sources, by file name ("ode-to-joy.piece"). */
  sources: Readonly<Record<string, string>>;
  /** Files in the catalogue folder other than its index, by file name. */
  catalogue: Readonly<Record<string, string>>;
  /** Pieces that are built in rather than in the catalogue. */
  builtIns: readonly string[];
  /** The year the public-domain rules are checked for. */
  year: number;
  ctx: ImportContext;
  sha256: (text: string) => string;
  gzipBytes: (text: string) => number;
}

export interface LibraryOutput {
  /** Every file to write, by its path from the repo root. */
  files: Map<string, string>;
  /** Anything that keeps the library from building, one plain line each. */
  issues: string[];
  /** Pieces from a source: how far Easy moved, and the bars where it dropped notes. */
  generated: { piece: string; easyShift: number; easyChanges: EasyChange[] }[];
}

const bytesOf = (text: string) => new TextEncoder().encode(text).length;

/**
 * A composer's file, written the way the app writes one, so a hand-edited or
 * Studio-made file reads the same in review: versions Easy to Advanced, fields
 * in order, nothing the reader drops. Its own date is kept, so this is stable.
 */
function normalise(text: string, ctx: ImportContext): string | null {
  const parsed = parseFile(text, ctx);
  if ('fatal' in parsed || parsed.errors.length) return null;
  const songs = parsed.items.flatMap((i) => (i.value.kind === 'song' ? [i.value.lesson] : []));
  if (songs.length !== parsed.items.length) return null;
  const rank = (l: Lesson) => ['easy', 'medium', 'advanced'].indexOf(l.level ?? '');
  const items = [...songs]
    .sort((a, b) => rank(a) - rank(b))
    .map((l) => songItem({ id: l.id, source: l.source, lesson: l, voicings: true }));
  let date: unknown;
  try {
    date = (JSON.parse(text) as { exportedAt?: unknown }).exportedAt;
  } catch {
    date = null;
  }
  const when = typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : 0;
  return stringifyFile(buildFile(items, [], new Date(when)));
}

export function buildLibrary(input: LibraryInput): LibraryOutput {
  const files = new Map<string, string>();
  const issues: string[] = [];
  const generated: LibraryOutput['generated'] = [];
  const builtIn: CatalogueEntry[] = [];
  const catalogue: CatalogueEntry[] = [];
  const fromSource = new Set<string>();

  /** Check one song file and list it in its index. */
  const add = (piece: string, dir: string, text: string) => {
    const path = `${dir}/${piece}.json`;
    files.set(path, text);
    const bytes = bytesOf(text);
    const parsed = parseFile(text, input.ctx);
    const problems = [
      ...sizeIssues(bytes),
      ...catalogueIssues(parsed, { piece, year: input.year }),
    ];
    issues.push(...problems.map((p) => `${path}: ${p}`));
    if (problems.length || 'fatal' in parsed) return;
    const songs = parsed.items.flatMap((i) => (i.value.kind === 'song' ? [i.value.lesson] : []));
    const entry = indexEntry({ piece, bytes, sha256: input.sha256(text), songs });
    (dir === BUILT_IN_DIR ? builtIn : catalogue).push(entry);
  };

  for (const [name, text] of Object.entries(input.sources).sort(([a], [b]) => a.localeCompare(b))) {
    let src;
    try {
      src = parsePiece(text);
    } catch (e) {
      issues.push(`${BUILT_IN_DIR}/sources/${name}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const piece = src.meta.piece;
    if (name !== `${piece}.piece`)
      issues.push(`${BUILT_IN_DIR}/sources/${name}: should be named ${piece}.piece`);
    fromSource.add(piece);
    const { easyShift, easyChanges } = generatePiece(src);
    generated.push({ piece, easyShift, easyChanges });
    add(piece, input.builtIns.includes(piece) ? BUILT_IN_DIR : CATALOGUE_DIR, pieceFile(src));
  }

  // A composer's file, with no source: checked, then written the app's way.
  for (const [name, text] of Object.entries(input.catalogue).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!CATALOGUE_FILE.test(name)) {
      issues.push(`${CATALOGUE_DIR}/${name}: a catalogue file is named <piece>.json`);
      continue;
    }
    const piece = name.slice(0, -'.json'.length);
    if (input.builtIns.includes(piece))
      issues.push(`${CATALOGUE_DIR}/${name}: ${piece} is built in, so it has no catalogue file`);
    // A piece with a source is built from it, over whatever its file says.
    else if (!fromSource.has(piece)) add(piece, CATALOGUE_DIR, normalise(text, input.ctx) ?? text);
  }

  for (const piece of input.builtIns)
    if (!fromSource.has(piece))
      issues.push(`${piece} is built in, so it needs ${BUILT_IN_DIR}/sources/${piece}.piece`);

  const byTitle = (a: CatalogueEntry, b: CatalogueEntry) =>
    a.title.localeCompare(b.title) || a.piece.localeCompare(b.piece);
  issues.push(...indexIssues([...builtIn, ...catalogue]));
  for (const [dir, entries] of [
    [BUILT_IN_DIR, builtIn],
    [CATALOGUE_DIR, catalogue],
  ] as const) {
    const text = stringifyIndex([...entries].sort(byTitle));
    const gz = input.gzipBytes(text);
    if (gz > LIBRARY_LIMITS.indexGzipBytes)
      issues.push(
        `${dir}/${INDEX_FILE}: ${gz} bytes gzipped, over ${LIBRARY_LIMITS.indexGzipBytes}: time to split the index`,
      );
    files.set(`${dir}/${INDEX_FILE}`, text);
  }
  return { files, issues, generated };
}
