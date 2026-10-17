import type { ContentSource, Lesson, SongLevel } from '@/core/content/types';
import { TRADITIONAL } from '@/core/content/publicDomain';

export const LEVEL_NAMES: Record<SongLevel, string> = {
  easy: 'Easy',
  medium: 'Medium',
  advanced: 'Advanced',
};

/** What each version is, in one line. */
export const LEVEL_NOTES: Record<SongLevel, string> = {
  easy: 'Main theme in an easy key, short notes merged into the beat, triads, one held bass note.',
  medium: 'Main theme as written, chords up to sevenths, a simple left-hand pattern.',
  advanced: "The fuller piece as written, original chords, and the piece's own left-hand figure.",
};

/** "Ludwig van Beethoven, first published 1826", "Traditional, first published 1761", "Original, by Inharmonia". */
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

/** Who to file a piece under in the composer filter. */
export function composerOf(l: Lesson): string {
  if (l.source.kind === 'public-domain') return l.source.composer;
  return 'Original pieces';
}
