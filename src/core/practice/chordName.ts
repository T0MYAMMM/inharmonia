import { CHORD_QUALITIES, chroma, parseChord } from '../theory';
import { ALL_ROOTS } from './chordDrill';
import { matchChord, type ChordTarget } from './chordMatch';

interface Candidate {
  symbol: string;
  root: number;
  target: ChordTarget;
}

let table: Candidate[] | null = null;

/** Every quality the chord builder offers on every root, in teaching order, built once. */
function candidates(): Candidate[] {
  table ??= CHORD_QUALITIES.flatMap((q) =>
    ALL_ROOTS.map((r) => {
      const info = parseChord(`${r}${q.suffix}`);
      const root = chroma(info.root);
      return {
        symbol: info.symbol,
        root,
        target: { chromas: [...new Set(info.tones.map(chroma))], bassChroma: root, midis: [] },
      };
    }),
  );
  return table;
}

/**
 * The chord these notes make, in any octave and any inversion: every tone of
 * one of the chord builder's qualities, and nothing else. When more than one
 * fits (C6 and Am7 are the same four notes), the one whose root is the lowest
 * note wins, then the plainer quality. Roots are spelled as the builder
 * spells them (E♭, F♯). Null below three different notes, or when nothing fits.
 */
export function nameChord(midis: readonly number[]): string | null {
  const tones = new Set(midis.map(chroma)).size;
  if (tones < 3) return null;
  const fits = candidates().filter(
    (c) =>
      c.target.chromas.length === tones &&
      matchChord(midis, c.target, 'pitch-class').status === 'match',
  );
  if (!fits.length) return null;
  const bass = chroma(Math.min(...midis));
  return (fits.find((c) => c.root === bass) ?? fits[0]!).symbol;
}

/** A gesture's chord: its name (null when it is none) and the notes it was. */
export interface Played {
  symbol: string | null;
  notes: number[];
}

/**
 * The chord of a gesture, from the first key down until every key is up: the
 * most notes held at once. Rolling a chord in, or letting it go a note at a
 * time, still names the whole chord. Plain TypeScript.
 */
export class PlayedChord {
  private peak: number[] = [];
  private last: Played | null = null;

  /** Call with the held notes after every note on or off. */
  update(held: readonly number[]): void {
    if (held.length === 0) {
      if (this.peak.length) this.last = { symbol: nameChord(this.peak), notes: this.peak };
      this.peak = [];
    } else if (held.length >= this.peak.length) {
      this.peak = [...held];
    }
  }

  /** The chord being played now, or else the last one played; null before any. */
  get current(): Played | null {
    return this.peak.length ? { symbol: nameChord(this.peak), notes: this.peak } : this.last;
  }
}
