import type { Lesson } from '@/core/content/types';
import { SENJA_DI_TERAS } from './songs/senjaDiTeras';

/** Songs available in the song player, in display order. */
export const SONGS: readonly Lesson[] = [SENJA_DI_TERAS];

export function getSong(id: string): Lesson | undefined {
  return SONGS.find((s) => s.id === id);
}
