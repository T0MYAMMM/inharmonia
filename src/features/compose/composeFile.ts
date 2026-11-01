import { PATTERNS } from '@/content/patterns';
import { SONG_LEVELS, type ContentSource, type SongLevel } from '@/core/content/types';
import { buildFile, songItem, stringifyFile } from '@/core/format/write';
import { FILE_LIMITS } from '@/core/format/types';
import { parseFile } from '@/core/format/read';
import { PIECE_ID } from '@/core/library/catalogue';
import { catalogueIssues, sizeIssues } from '@/core/library/rules';
import type { UserSong } from '@/core/songs/library';

/**
 * A catalogue song's file, put together from songs made in Studio: one per
 * version, under one title, piece id, summary and credit. Checked by the
 * same rules CI and every download run, so what this offers would pass.
 */

export type ComposeCredit =
  | { kind: 'original'; author: string }
  | {
      kind: 'public-domain';
      composer: string;
      /** A year, or blank for a traditional tune. */
      composerDied: string;
      firstPublished: string;
      edition: string;
      editor: string;
      editorDied: string;
    };

export interface ComposeForm {
  title: string;
  piece: string;
  summary: string;
  credit: ComposeCredit;
  /** The Studio song for each version; at least one. */
  songs: Partial<Record<SongLevel, UserSong>>;
}

export interface ComposedFile {
  fileName: string;
  /** Null while something is missing or a rule fails. */
  text: string | null;
  /** What to fix first, in plain lines; empty when the file is ready. */
  issues: string[];
}

const CONTEXT = {
  patterns: new Set(Object.keys(PATTERNS)),
  fallbackPattern: 'arpeggio-8ths',
};

const year = (s: string) => (/^\d{3,4}$/.test(s.trim()) ? Number(s.trim()) : null);

/** The credit as a source, and what the form still needs for it. */
function creditOf(c: ComposeCredit): { source: ContentSource; missing: string[] } {
  if (c.kind === 'original') {
    const author = c.author.trim();
    return {
      source: { kind: 'original', author },
      missing: author ? [] : ['Name the composer: the author of this piece.'],
    };
  }
  const composer = c.composer.trim() || 'Traditional';
  const died = year(c.composerDied);
  const published = year(c.firstPublished);
  const editor = c.editor.trim();
  const missing = [
    ...(c.composerDied.trim() && died === null
      ? ["The composer's year of death is a year, like 1827."]
      : []),
    ...(published === null ? ['Give the year the piece was first published, like 1826.'] : []),
    ...(c.edition.trim() ? [] : ['Name the early edition the notes come from.']),
    ...(editor && c.editorDied.trim() && year(c.editorDied) === null
      ? ["The editor's year of death is a year, like 1885."]
      : []),
  ];
  return {
    source: {
      kind: 'public-domain',
      composer,
      composerDied: died,
      firstPublished: published ?? 0,
      edition: c.edition.trim(),
      ...(editor ? { editor, editorDied: year(c.editorDied), editorAdditionsUsed: false } : {}),
    },
    missing,
  };
}

/** The file for the form, or what is missing from it, checked as CI checks it. */
export function composeFile(form: ComposeForm, now: Date = new Date()): ComposedFile {
  const piece = form.piece.trim();
  const title = form.title.trim();
  const summary = form.summary.trim();
  const fileName = `${piece || 'piece'}.json`;
  const levels = SONG_LEVELS.filter((l) => form.songs[l]);
  const { source, missing } = creditOf(form.credit);
  const issues = [
    ...(levels.length ? [] : ['Pick a song for at least one version.']),
    ...(title ? [] : ['Give it a title.']),
    ...(title.length > FILE_LIMITS.title
      ? [`Keep the title to ${FILE_LIMITS.title} characters.`]
      : []),
    ...(PIECE_ID.test(piece)
      ? []
      : ['Give it a piece id: lowercase letters, digits and dashes, like evening-ferry.']),
    ...(summary.length > FILE_LIMITS.summary
      ? [`Keep the summary to ${FILE_LIMITS.summary} characters.`]
      : []),
    ...missing,
  ];
  if (issues.length) return { fileName, text: null, issues };

  const items = levels.map((level) => {
    // The song's own summary (a MIDI song's says it came from a file) gives way to the form's.
    const { summary: _own, ...lesson } = form.songs[level]!.lesson;
    const id = `${piece}-${level}`;
    return songItem({
      id,
      source,
      lesson: {
        ...lesson,
        id,
        title,
        piece,
        level,
        ...(summary ? { summary } : {}),
        source,
      },
      voicings: false,
    });
  });
  const text = stringifyFile(buildFile(items, [], now));
  const rules = [
    ...sizeIssues(new TextEncoder().encode(text).length),
    ...catalogueIssues(parseFile(text, CONTEXT), { piece, year: now.getFullYear() }),
  ];
  return { fileName, text: rules.length ? null : text, issues: rules };
}
