import { buildFile, songItem, stringifyFile } from '../format/write';
import { SONG_LEVELS } from '../content/types';
import { generatePiece } from './generate';
import type { PieceSource } from './source';

export * from './source';
export * from './generate';

/** The JSON file for a piece: its Easy, Medium and Advanced versions, in the shared format. */
export function pieceFile(src: PieceSource): string {
  const { versions } = generatePiece(src);
  const items = SONG_LEVELS.map((level) =>
    songItem({
      id: versions[level].id,
      source: versions[level].source,
      lesson: versions[level],
      voicings: false,
    }),
  );
  return stringifyFile(buildFile(items, [], new Date(`${src.meta.added}T00:00:00.000Z`)));
}
