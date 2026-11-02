import { LIBRARY_LIMITS, RETIRED_PIECES } from '@config/library';
import { publicDomainIssues } from '../content/publicDomain';
import { SONG_LEVELS, type ContentSource, type Lesson } from '../content/types';
import { describeError, type ParsedFile } from '../format/read';
import { isRetired, PIECE_ID, type CatalogueEntry } from './catalogue';

/**
 * The rules a catalogue song's file must pass. They run in
 * `npm run songs -- --check` (CI) and again on every download, so a file that
 * reaches someone's device has passed them twice. Pure: no fetch, no storage.
 */

const sameSource = (a: ContentSource, b: ContentSource) => JSON.stringify(a) === JSON.stringify(b);

/** Why a piece's credit can't go in the catalogue, if it can't. */
function sourceIssues(src: ContentSource, year: number): string[] {
  if (src.kind === 'original' && src.author?.trim()) return [];
  if (src.kind === 'public-domain')
    return publicDomainIssues(src, year).map((i) => `public domain: ${i}`);
  return [
    'needs a credit: an original piece with its author, or a public-domain piece with its proof',
  ];
}

/**
 * Everything that keeps a file out of the catalogue, as plain lines; empty
 * when it may go in. `piece` is the id its file name gives it and `year` the
 * year the public-domain rules are checked for.
 */
export function catalogueIssues(
  parsed: ParsedFile | { fatal: string },
  opts: { piece: string; year: number; retired?: readonly string[] },
): string[] {
  if ('fatal' in parsed) return [parsed.fatal];
  const out = parsed.errors.map(describeError);
  const { piece } = opts;
  if (!PIECE_ID.test(piece))
    out.push(`"${piece}" is not a piece id (lowercase letters, digits, dashes)`);
  if (isRetired(piece, opts.retired)) out.push(`${piece} is a retired piece; choose another id`);
  if (parsed.recordings.size) out.push('has a recording; a catalogue song has none');
  const songs: Lesson[] = [];
  for (const item of parsed.items) {
    if (item.value.kind !== 'song') {
      out.push(`Item ${item.index} is a ${item.kind}, not a song`);
      continue;
    }
    const lesson = item.value.lesson;
    songs.push(lesson);
    if (!lesson.level) out.push(`Item ${item.index} (${item.title}) needs a level`);
    else if (item.id !== `${piece}-${lesson.level}`)
      out.push(`Item ${item.index} (${item.title}): its id should be ${piece}-${lesson.level}`);
    if (lesson.piece !== piece)
      out.push(`Item ${item.index} (${item.title}): its piece should be ${piece}`);
  }
  const broken = new Set(parsed.errors.flatMap((e) => (e.item ? [e.item] : []))).size;
  const count = parsed.items.length + broken;
  if (count < 1 || count > 3) out.push(`needs 1 to 3 songs, not ${count}`);
  const levels = songs.flatMap((s) => (s.level ? [s.level] : []));
  for (const level of SONG_LEVELS)
    if (levels.filter((l) => l === level).length > 1)
      out.push(`has more than one ${level} version`);
  const first = songs[0];
  if (first) {
    if (songs.some((s) => s.title !== first.title)) out.push('every version needs the same title');
    if (songs.some((s) => !sameSource(s.source, first.source)))
      out.push('every version needs the same credit');
    out.push(...sourceIssues(first.source, opts.year));
  }
  return out;
}

/** Pieces listed twice, or retired, across indexes; empty when every piece id is fine. */
export function indexIssues(
  entries: readonly Pick<CatalogueEntry, 'piece'>[],
  retired: readonly string[] = RETIRED_PIECES,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { piece } of entries) {
    if (seen.has(piece)) out.push(`${piece} is listed twice`);
    if (isRetired(piece, retired)) out.push(`${piece} is a retired piece`);
    seen.add(piece);
  }
  return out;
}

/** Why a file is too large for the catalogue, if it is. */
export function sizeIssues(bytes: number, max: number = LIBRARY_LIMITS.fileBytes): string[] {
  return bytes > max ? [`is ${bytes} bytes, over the ${max} a catalogue song may be`] : [];
}
