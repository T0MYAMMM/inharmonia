/**
 * The song library: which pieces come with the app, which are gone for good,
 * and how large a catalogue song and the catalogue's index may be.
 *
 * Every other arranged piece is in the catalogue: a file under
 * public/library/, downloaded when someone asks for it. `npm run songs`
 * writes both and checks them; see docs/composing.md.
 */

/** Bundled with the app, so they play from the first visit, offline too. */
export const BUILT_IN_PIECES: readonly string[] = ['twinkle-twinkle', 'ode-to-joy', 'fur-elise'];

/**
 * Pieces that were in Inharmonia and are no longer. Their ids are never used
 * again, so an old link says the piece is gone rather than finding another.
 */
export const RETIRED_PIECES: readonly string[] = [
  'senja-di-teras',
  'lanterns-at-dusk',
  'morning-ferry',
  'window-light',
];

export const LIBRARY_LIMITS = {
  /** A catalogue song's file, in bytes (Canon in D, the largest, is about 238 kB). */
  fileBytes: 512_000,
  /** The catalogue's index, gzipped: about 200 songs before it needs splitting. */
  indexGzipBytes: 50_000,
  /** The index as fetched, which may not be compressed on the way. */
  indexBytes: 1_000_000,
} as const;
