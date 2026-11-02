import { TRADITIONAL } from './publicDomain';
import type { ContentSource } from './types';

/** "Ludwig van Beethoven, first published 1826", "Traditional, first published 1761", "Original, by Ayu Lestari". */
export function creditLine(s: ContentSource): string {
  switch (s.kind) {
    case 'public-domain':
      return `${s.composer === TRADITIONAL ? 'Traditional' : s.composer}, first published ${s.firstPublished}`;
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
