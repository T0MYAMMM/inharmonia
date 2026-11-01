import { parseIndex, type CatalogueEntry } from '@/core/library/catalogue';
import TEXT from './songs/index.json?raw';

/**
 * The built-in songs as their index lists them (written by `npm run songs`):
 * titles, versions and previews, without the songs themselves, so Home and
 * the Songs page can name and show them without loading any. A broken index
 * is a bug in the repo, so it throws.
 */
export const BUILT_IN_ENTRIES: readonly CatalogueEntry[] = (() => {
  const entries = parseIndex(TEXT);
  if (!entries?.length) throw new Error('src/content/songs/index.json: not a song index');
  return entries;
})();
