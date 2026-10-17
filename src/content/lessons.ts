import { parseFile, type ImportContext } from '@/core/format';
import type { Lesson } from '@/core/content/types';
import { PATTERNS } from './patterns';

/**
 * Built-in songs live in src/content/songs/*.json, in the same readable format
 * as exports, and load through the same reader. Library pieces are generated
 * from src/content/songs/sources/*.piece by `npm run songs`.
 */
const FILES = import.meta.glob('./songs/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CONTEXT: ImportContext = {
  patterns: new Set(Object.keys(PATTERNS)),
  fallbackPattern: 'arpeggio-8ths',
};

/** Read every built-in song file. A broken file is a bug in the repo, so it throws. */
export function loadSongFiles(files: Readonly<Record<string, string>>): Lesson[] {
  const out: Lesson[] = [];
  for (const [path, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const parsed = parseFile(text, CONTEXT);
    if ('fatal' in parsed) throw new Error(`${path}: ${parsed.fatal}`);
    if (parsed.errors.length)
      throw new Error(
        `${path}: ${parsed.errors.map((e) => `${e.field ?? ''} ${e.message}`).join('; ')}`,
      );
    for (const item of parsed.items)
      if (item.value.kind === 'song') out.push({ ...item.value.lesson, id: item.id });
  }
  return out;
}

const ALL = loadSongFiles(FILES);

/** Songs available in the song player: Senja di Teras first, then the library by title. */
export const SONGS: readonly Lesson[] = [
  ...ALL.filter((s) => s.id === 'senja-di-teras'),
  ...ALL.filter((s) => s.id !== 'senja-di-teras').sort(
    (a, b) => a.title.localeCompare(b.title) || levelRank(a) - levelRank(b),
  ),
];

function levelRank(l: Lesson): number {
  return l.level === 'easy' ? 0 : l.level === 'medium' ? 1 : l.level === 'advanced' ? 2 : 3;
}

export function getSong(id: string): Lesson | undefined {
  return SONGS.find((s) => s.id === id);
}

/** The versions of a library piece, Easy to Advanced. */
export function versionsOf(piece: string): Lesson[] {
  return SONGS.filter((s) => s.piece === piece);
}
