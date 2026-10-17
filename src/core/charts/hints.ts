import { pitchClassName, type SpelledNote } from '../theory';

export interface NoteMove {
  from: SpelledNote;
  to: SpelledNote;
  /** Signed semitones, up is positive. */
  semitones: number;
}

export interface VoicingChange {
  /** Notes of the next voicing already held. */
  stays: SpelledNote[];
  /** Notes that move, each from a note of the previous voicing. */
  moves: NoteMove[];
  /** Notes with nothing to move from (the next chord has more notes). */
  adds: SpelledNote[];
  /** Notes let go (the next chord has fewer notes). */
  lifts: SpelledNote[];
  /** Total semitones moved. */
  distance: number;
  /** "keep C and E, move G up 2 semitones to A". */
  text: string;
}

const pc = (n: SpelledNote) => pitchClassName(n.name);

const list = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const moveText = (m: NoteMove) => {
  const n = Math.abs(m.semitones);
  return `${pc(m.from)} ${m.semitones > 0 ? 'up' : 'down'} ${n} semitone${n === 1 ? '' : 's'} to ${pc(m.to)}`;
};

/**
 * What the hand does between two voicings: which notes stay, which move and
 * how far. Notes that move are paired in pitch order, which is how a hand
 * shifts between neighbouring inversions.
 */
export function describeChange(
  previous: readonly SpelledNote[],
  next: readonly SpelledNote[],
): VoicingChange {
  const held = new Set(previous.map((n) => n.midi));
  const stays = next.filter((n) => held.has(n.midi));
  const kept = new Set(stays.map((n) => n.midi));
  const from = previous.filter((n) => !kept.has(n.midi)).sort((a, b) => a.midi - b.midi);
  const to = next.filter((n) => !kept.has(n.midi)).sort((a, b) => a.midi - b.midi);
  const pairs = Math.min(from.length, to.length);
  // Drop the unpaired notes from whichever end leaves the shortest moves.
  let offFrom = 0;
  let offTo = 0;
  if (from.length !== to.length) {
    let best = Infinity;
    const extra = Math.abs(from.length - to.length);
    for (let k = 0; k <= extra; k++) {
      const a = from.length > to.length ? k : 0;
      const b = to.length > from.length ? k : 0;
      let cost = 0;
      for (let i = 0; i < pairs; i++) cost += Math.abs(to[i + b]!.midi - from[i + a]!.midi);
      if (cost < best) [best, offFrom, offTo] = [cost, a, b];
    }
  }
  const moves: NoteMove[] = [];
  for (let i = 0; i < pairs; i++) {
    const f = from[i + offFrom]!;
    const t = to[i + offTo]!;
    moves.push({ from: f, to: t, semitones: t.midi - f.midi });
  }
  const used = (xs: SpelledNote[], off: number) => xs.slice(off, off + pairs);
  const adds = to.filter((n) => !used(to, offTo).includes(n));
  const lifts = from.filter((n) => !used(from, offFrom).includes(n));
  const distance = moves.reduce((s, m) => s + Math.abs(m.semitones), 0);

  const parts: string[] = [];
  if (stays.length && (moves.length || adds.length || lifts.length))
    parts.push(`keep ${list(stays.map(pc))}`);
  if (moves.length) parts.push(`move ${list(moves.map(moveText))}`);
  if (adds.length) parts.push(`add ${list(adds.map(pc))}`);
  if (lifts.length) parts.push(`lift ${list(lifts.map(pc))}`);
  const text = parts.length ? parts.join(', ') : 'same notes: hold them';
  return { stays, moves, adds, lifts, distance, text };
}
