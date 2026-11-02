import { BUILT_IN_ENTRIES } from '@/content/builtInIndex';
import { FILLS, getFill } from '@/content/fills';
import { getProgression, PROGRESSIONS } from '@/content/progressions';
import type { Progression, SongLevel } from '@/core/content/types';
import type { CatalogueEntry } from '@/core/library/catalogue';
import { CHORD_EAR_LEVELS, NOTE_EAR_LEVELS, PROGRESSION_EAR_LEVELS } from '@/core/practice/ear';
import { CHORD_DRILL_ID } from '../chords/drillId';

/** Ear-training exercises by the id used in progress ids, "ear:<exercise>:<level>". */
const EAR_EXERCISES = {
  notes: { name: 'Note names', levels: NOTE_EAR_LEVELS },
  chords: { name: 'Chord quality', levels: CHORD_EAR_LEVELS },
  progressions: { name: 'Progressions', levels: PROGRESSION_EAR_LEVELS },
} as const;

export interface ExerciseInfo {
  id: string;
  title: string;
  /** What kind of practice, in a word or two: "Song", "Fill, speed-up". */
  kind: string;
  href: string;
}

/** A song by its id, as an index lists it, and whether it is on this device. */
export interface SongRef {
  id: string;
  title: string;
  level: SongLevel;
  onDevice: boolean;
}

export type SongLookup = (id: string) => SongRef | undefined;

/**
 * Songs by id, from index entries: those on this device (built in or
 * downloaded) and, where a page has it, the catalogue's, for a song that was
 * removed or never downloaded.
 */
export function songLookup(
  onDevice: readonly CatalogueEntry[],
  catalogue: readonly CatalogueEntry[] = [],
): SongLookup {
  const songs = new Map<string, SongRef>();
  for (const [entries, here] of [
    [catalogue, false],
    [onDevice, true],
  ] as const)
    for (const e of entries)
      for (const l of e.levels)
        songs.set(l.id, { id: l.id, title: e.title, level: l.level, onDevice: here });
  return (id) => songs.get(id);
}

/** The built-in songs, which are always on this device. */
export const BUILT_IN_SONGS: SongLookup = songLookup(BUILT_IN_ENTRIES);

/**
 * What an exercise id in the progress store refers to, or null when it no
 * longer exists (a deleted progression, a retired piece, an exercise from an
 * older version). A catalogue song not on this device is still described,
 * when `songs` knows the catalogue, and its link offers the download.
 */
export function describeExercise(
  id: string,
  mine: readonly Progression[] = [],
  songs: SongLookup = BUILT_IN_SONGS,
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
    const ear = EAR_EXERCISES[parts[1] as keyof typeof EAR_EXERCISES];
    const level = ear?.levels.find((l) => l.id === parts[2]);
    if (!ear || !level) return null;
    return {
      id,
      title: `${ear.name}: ${level.name}`,
      kind: 'Ear training',
      href: `/ear?exercise=${parts[1]}&level=${level.id}`,
    };
  }
  const song = songs(id);
  if (song)
    return {
      id,
      title: songTitle(song),
      kind: song.onDevice ? 'Song' : 'Song, not downloaded',
      href: `/songs/${song.id}`,
    };
  return null;
}

/** The first song to try: Twinkle, Easy, the song Home's welcome starts with. */
export const FIRST_SONG = 'twinkle-twinkle-easy';

/** Good first steps, in order, for "try something new". */
export function starterExercises(): ExerciseInfo[] {
  const firstFill = FILLS.find((f) => f.level === 1)!;
  const list: ExerciseInfo[] = [
    // Twinkle first; the other built-in pieces come in at the end, Easy versions.
    songStep(BUILT_IN_SONGS(FIRST_SONG)!),
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
    ...BUILT_IN_ENTRIES.flatMap((e) => e.levels)
      .filter((l) => l.level === 'easy' && l.id !== FIRST_SONG)
      .map((l) => songStep(BUILT_IN_SONGS(l.id)!)),
  ];
  return list;
}

const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', advanced: 'Advanced' } as const;

/** "Ode to Joy, Easy". */
export function songTitle(s: Pick<SongRef, 'title' | 'level'>): string {
  return `${s.title}, ${LEVEL_NAMES[s.level]}`;
}

const songStep = (s: SongRef): ExerciseInfo => ({
  id: s.id,
  title: songTitle(s),
  kind: 'Song',
  href: `/songs/${s.id}`,
});

/** The first starter not tried yet. */
export function nextNew(tried: (id: string) => boolean): ExerciseInfo | null {
  return starterExercises().find((e) => !tried(e.id)) ?? null;
}
