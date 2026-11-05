import { TRADITIONAL } from './publicDomain';
import type { ContentSource } from './types';

/**
 * "Ludwig van Beethoven, 1826 edition", "Traditional, 1761 edition", "Original, by Ayu Lestari".
 * The year is the edition the notes were taken from (the one the public-domain rule counts
 * from), not when the piece was written.
 */
export function creditLine(s: ContentSource): string {
  switch (s.kind) {
    case 'public-domain':
      return `${s.composer === TRADITIONAL ? 'Traditional' : s.composer}, ${s.firstPublished} edition`;
    case 'original':
      return `Original, by ${s.author ?? 'Inharmonia'}`;
    default:
      return '';
  }
}

/** Who to file a piece under when filtering by composer: the composer, or an original's author. */
export function composerName(s: ContentSource): string {
  switch (s.kind) {
    case 'public-domain':
      return s.composer;
    case 'original':
      return s.author ?? 'Inharmonia';
    default:
      return '';
  }
}
