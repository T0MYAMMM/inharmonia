import type { Lesson } from '@/core/content/types';
import { getSong } from '../lessons';

/**
 * Senja di Teras, an original piece written for Inharmonia: D major, 4/4,
 * verse and chorus with a broken-chord left hand. Its notes and hand-chosen
 * voicings live in senja-di-teras.json, read like any other built-in song.
 */
export const SENJA_DI_TERAS: Lesson = getSong('senja-di-teras')!;
