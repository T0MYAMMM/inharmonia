import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chroma, isValidChord, parseChord } from '../theory';
import { NO_CHORD, normalizeChord } from './symbols';

/**
 * The chord-align tool (tools/chord-align) reads chord symbols in Python. These
 * shared vectors are checked there and here, against the app's own reading, so
 * the two cannot drift apart.
 */
interface Vectors {
  chords: { symbol: string; pcs: number[]; bass: number | null }[];
  fallback: { symbol: string; pcs: number[] }[];
  noChord: string[];
}

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../../tools/chord-align/tests/vectors/chords.json'), 'utf8'),
) as Vectors;

describe('chord-align shared vectors', () => {
  it.each(vectors.chords)(
    '$symbol has the pitch classes the app reads',
    ({ symbol, pcs, bass }) => {
      const info = parseChord(symbol);
      const app = new Set(info.tones.map((t) => chroma(t)));
      if (info.bass) app.add(chroma(info.bass));
      expect([...app].sort((a, b) => a - b)).toEqual(pcs);
      expect(info.bass ? chroma(info.bass) : null).toBe(bass);
    },
  );

  it.each(vectors.fallback)(
    '$symbol is a chord the tool only knows by root and fifth',
    ({ symbol }) => {
      expect(isValidChord(symbol)).toBe(true);
    },
  );

  it.each(vectors.noChord)('%s reads as N.C.', (text) => {
    expect(normalizeChord(text)).toBe(NO_CHORD);
  });
});
