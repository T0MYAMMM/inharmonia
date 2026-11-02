import { composerName } from '@/core/content/credit';
import type { Lesson, SongLevel } from '@/core/content/types';

export { creditLine } from '@/core/content/credit';

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

/** Who to file a piece under in the composer filter. */
export function composerOf(l: Lesson): string {
  return composerName(l.source);
}
