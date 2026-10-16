import { FILLS, getFill } from '@/content/fills';
import { getSong, SONGS } from '@/content/lessons';
import { getProgression, PROGRESSIONS } from '@/content/progressions';
import type { Progression } from '@/core/content/types';
import { CHORD_EAR_LEVELS, PROGRESSION_EAR_LEVELS } from '@/core/practice';
import { CHORD_DRILL_ID } from '../chords/drillId';

export interface ExerciseInfo {
  id: string;
  title: string;
  /** What kind of practice, in a word or two: "Song", "Fill, speed-up". */
  kind: string;
  href: string;
}

/**
 * What an exercise id in the progress store refers to, or null when it no
 * longer exists (a deleted progression, an exercise from an older version).
 */
export function describeExercise(
  id: string,
  mine: readonly Progression[] = [],
): ExerciseInfo | null {
  if (id === CHORD_DRILL_ID)
    return { id, title: 'Chord drill', kind: 'Chords', href: '/chords/drill' };
  const parts = id.split(':');
  if (parts[0] === 'progression' && parts[1]) {
    const p = getProgression(parts[1]) ?? mine.find((m) => m.id === parts[1]);
    if (!p) return null;
    const playAlong = parts[2] === 'play-along';
    return {
      id,
      title: p.name,
      kind: playAlong ? 'Progression, play-along' : 'Progression',
      href: `/progressions/${p.id}`,
    };
  }
  if (parts[0] === 'fill' && parts[1]) {
    const f = getFill(parts[1]);
    if (!f) return null;
    return {
      id,
      title: f.name,
      kind: parts[2] === 'speed' ? 'Fill, speed-up' : 'Fill',
      href: `/fills/${f.id}`,
    };
  }
  if (parts[0] === 'ear' && parts[2]) {
    const levels = parts[1] === 'chords' ? CHORD_EAR_LEVELS : PROGRESSION_EAR_LEVELS;
    const level = levels.find((l) => l.id === parts[2]);
    if (!level) return null;
    return {
      id,
      title: `${parts[1] === 'chords' ? 'Chord quality' : 'Progressions'}: ${level.name}`,
      kind: 'Ear training',
      href: `/ear?exercise=${parts[1]}&level=${level.id}`,
    };
  }
  const song = getSong(id);
  if (song) return { id, title: song.title, kind: 'Song', href: `/songs/${song.id}` };
  return null;
}

/** Good first steps, in order, for "try something new". */
export function starterExercises(): ExerciseInfo[] {
  const firstFill = FILLS.find((f) => f.level === 1)!;
  const list: ExerciseInfo[] = [
    ...SONGS.map((s) => ({ id: s.id, title: s.title, kind: 'Song', href: `/songs/${s.id}` })),
    { id: CHORD_DRILL_ID, title: 'Chord drill', kind: 'Chords', href: '/chords/drill' },
    {
      id: `progression:${PROGRESSIONS[0]!.id}`,
      title: PROGRESSIONS[0]!.name,
      kind: 'Progression',
      href: `/progressions/${PROGRESSIONS[0]!.id}`,
    },
    {
      id: 'ear:chords:major-minor',
      title: 'Chord quality: Major or minor',
      kind: 'Ear training',
      href: '/ear',
    },
    {
      id: `fill:${firstFill.id}`,
      title: firstFill.name,
      kind: 'Fill',
      href: `/fills/${firstFill.id}`,
    },
    ...FILLS.filter((f) => f.level === 1 && f !== firstFill).map((f) => ({
      id: `fill:${f.id}`,
      title: f.name,
      kind: 'Fill',
      href: `/fills/${f.id}`,
    })),
    ...PROGRESSIONS.slice(1).map((p) => ({
      id: `progression:${p.id}`,
      title: p.name,
      kind: 'Progression',
      href: `/progressions/${p.id}`,
    })),
  ];
  return list;
}

/** The first starter not tried yet. */
export function nextNew(tried: (id: string) => boolean): ExerciseInfo | null {
  return starterExercises().find((e) => !tried(e.id)) ?? null;
}
