/** Library pieces shown per page: three full rows on a wide screen. */
export const SONGS_PER_PAGE = 9;

export interface Paged<T> {
  items: T[];
  /** The page shown, 1-based, clamped to the pages there are. */
  page: number;
  pages: number;
}

/**
 * One page of a list. A page outside the range (or not a number) shows the
 * nearest page that exists; an empty list is one empty page.
 */
export function paginate<T>(all: readonly T[], page: number, size = SONGS_PER_PAGE): Paged<T> {
  const pages = Math.max(1, Math.ceil(all.length / size));
  const p = Number.isFinite(page) ? Math.min(pages, Math.max(1, Math.floor(page))) : 1;
  return { items: all.slice((p - 1) * size, p * size), page: p, pages };
}
