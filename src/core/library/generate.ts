import { simplifyChord } from '../charts/simplify';
import { nearestShift, transposeChord, transposeNote } from '../charts/transpose';
import { validateLesson } from '../content/compile';
import {
  DEFAULT_RULES,
  LESSON_SCHEMA_VERSION,
  NO_CHORD,
  type Bar,
  type ChordSpec,
  type ContentSource,
  type Lesson,
  type NoteSpec,
  type SongLevel,
} from '../content/types';
import { chroma, noteToMidi, type Mode } from '../theory';
import type { PieceSource, SourceBar, SourceSection } from './source';

/** Keys an Easy version may use, in order of preference. */
export const EASY_KEYS: Record<Mode, readonly string[]> = {
  major: ['C', 'G', 'F'],
  minor: ['A', 'E', 'D'],
};

/** Medium left hand when the source names none: a simple pattern for the meter. */
const MEDIUM_FIGURE: Record<number, string> = { 2: 'stride', 3: 'waltz', 4: 'root-fifth' };

/** Easy melodies sit between C4 and C6 where they can. */
const EASY_RANGE: [number, number] = [60, 84];

/** A bar where Easy dropped notes, written in the source's note names, for review by ear. */
export interface EasyChange {
  /** 1-based bar of the Easy version. */
  bar: number;
  section: string;
  /** The bar before and after, as source notes ("E4e D#4e E4q …"). */
  before: string;
  after: string;
}

export interface GeneratedPiece {
  versions: Record<SongLevel, Lesson>;
  /** Semitones Easy moved from the written key. */
  easyShift: number;
  easyChanges: EasyChange[];
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** The easy key nearest the written one (or the source's choice) and the shift to it. */
export function easyKeyFor(src: PieceSource): { tonic: string; shift: number } {
  const { tonic, mode } = src.meta.key;
  const options = src.meta.easyKey ? [src.meta.easyKey] : EASY_KEYS[mode];
  let best = { tonic: options[0]!, shift: nearestShift(chroma(options[0]!) - chroma(tonic)) };
  for (const t of options) {
    const shift = nearestShift(chroma(t) - chroma(tonic));
    if (Math.abs(shift) < Math.abs(best.shift)) best = { tonic: t, shift };
  }
  return best;
}

const noteText = (ns: readonly NoteSpec[]) =>
  ns.map((n) => `${n.note}:${n.beats}${n.tie ? '~' : ''}`).join(' ');

/**
 * Easy rhythm: each beat plays the note sounding at its start, so notes shorter
 * than a beat merge into the beat they start or fall in and longer notes stay.
 * A note tied on into the next note (or bar) stays tied.
 */
export function mergeToBeats(notes: readonly NoteSpec[], beats: number): NoteSpec[] {
  const starts: number[] = [];
  let t = 0;
  for (const n of notes) {
    starts.push(t);
    t += n.beats;
  }
  const at = (b: number) =>
    notes.findIndex((n, i) => starts[i]! <= b + 1e-9 && b + 1e-9 < starts[i]! + n.beats);
  const out: { idx: number; beats: number }[] = [];
  for (let b = 0; b < beats; b++) {
    const idx = at(b);
    const last = out.at(-1);
    const prev = last ? notes[last.idx]! : null;
    // The same note, or a note tied on from the one before: one longer note.
    if (last && (last.idx === idx || (prev?.tie && notes[idx]?.note === prev.note)))
      last.beats += 1;
    else out.push({ idx, beats: 1 });
  }
  return out.map((g, i) => {
    const n = notes[g.idx]!;
    // Only the bar's final note can carry a tie into the next bar.
    const tie = i === out.length - 1 && notes.at(-1)!.tie && n.note === notes.at(-1)!.note;
    return { note: n.note, beats: g.beats, ...(tie ? { tie: true } : {}) };
  });
}

/** Move a whole melody by octaves until it sits in the easy range (if it can). */
function octaveFor(notes: readonly string[]): number {
  const midis = notes.filter((n) => n !== 'r').map(noteToMidi);
  if (!midis.length) return 0;
  let shift = 0;
  while (
    Math.min(...midis) + shift < EASY_RANGE[0] &&
    Math.max(...midis) + shift + 12 <= EASY_RANGE[1] + 4
  )
    shift += 12;
  while (
    Math.max(...midis) + shift > EASY_RANGE[1] &&
    Math.min(...midis) + shift - 12 >= EASY_RANGE[0] - 3
  )
    shift -= 12;
  return shift;
}

function covers(sections: readonly SourceSection[]): string | undefined {
  const ranges = sections.map((s) => s.original);
  if (ranges.some((r) => !r)) return undefined;
  const merged: [number, number][] = [];
  for (const r of ranges as string[]) {
    const [a, b = a] = r.split('-').map(Number) as [number, number?];
    const last = merged.at(-1);
    if (last && a === last[1] + 1) last[1] = b!;
    else merged.push([a, b!]);
  }
  return `bars ${merged.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')}`;
}

function chordsAt(
  chords: readonly ChordSpec[],
  level: SongLevel,
  move: (s: string) => string,
): ChordSpec[] {
  return chords.map((c) => {
    if (c.symbol === NO_CHORD) return { symbol: NO_CHORD, beats: c.beats };
    const moved = move(c.symbol);
    if (level === 'advanced') return { symbol: moved, beats: c.beats };
    const simple = simplifyChord(moved, level === 'easy' ? 'basic' : 'simplified');
    return {
      symbol: simple.symbol,
      beats: c.beats,
      ...(simple.bass ? { bass: simple.bass } : {}),
      ...(simple.symbol !== moved ? { original: moved } : {}),
    };
  });
}

function source(src: PieceSource): ContentSource {
  const s = src.meta.source;
  if (s.kind === 'original') return { kind: 'original', author: s.author };
  return {
    kind: 'public-domain',
    composer: s.composer,
    composerDied: s.composerDied,
    firstPublished: s.firstPublished,
    edition: s.edition,
    ...(s.contributors.length ? { contributors: s.contributors } : {}),
  };
}

/**
 * Easy, Medium and Advanced versions of a piece, all from its one source:
 * - Easy: the main theme in the nearest easy key, short notes merged into the
 *   beat (except bars marked `easy-keep`), triads, one held bass note per chord.
 * - Medium: the main theme as written, chords down to sevenths (slash bass kept
 *   in the left hand), a simple pattern for the meter.
 * - Advanced: every section as written, original chords, and the piece's own
 *   left-hand figure (or the left hand written out where the source has it).
 */
export function generatePiece(src: PieceSource): GeneratedPiece {
  const m = src.meta;
  const main = src.sections.filter((s) => s.main);
  const { tonic: easyTonic, shift } = easyKeyFor(src);
  const mode = m.key.mode;
  const moveChord = (s: string) => transposeChord(s, m.key.tonic, easyTonic, mode);
  const moveNote = (n: string) => transposeNote(n, m.key.tonic, easyTonic, shift, mode);
  const allMain = main.flatMap((s) => s.bars.flatMap((b) => b.melody.map((n) => moveNote(n.note))));
  const octave = octaveFor(allMain);
  const easyNote = (n: string) =>
    n === 'r' || octave === 0
      ? moveNote(n)
      : transposeNote(moveNote(n), easyTonic, easyTonic, octave, mode);

  const easyChanges: EasyChange[] = [];
  const keep = new Set(m.easyKeep);
  let easyBar = 0;
  const build = (
    sections: readonly SourceSection[],
    bar: (b: SourceBar, s: SourceSection) => Bar,
  ): Bar[] =>
    sections.flatMap((s) =>
      s.bars.map((b, i) => ({ ...bar(b, s), ...(i === 0 ? { section: s.label } : {}) })),
    );

  const easyBars = build(main, (b, s) => {
    easyBar += 1;
    const moved = b.melody.map((n) => ({ ...n, note: easyNote(n.note) }));
    const rh = keep.has(easyBar) ? moved : mergeToBeats(moved, m.meter.beats);
    const sounding = (ns: NoteSpec[]) => ns.filter((n) => n.note !== 'r').length;
    if (sounding(rh) < sounding(moved))
      easyChanges.push({
        bar: easyBar,
        section: s.label,
        before: noteText(b.melody),
        after: noteText(rh),
      });
    return { chords: chordsAt(b.chords, 'easy', moveChord), rh };
  });
  const mediumBars = build(main, (b) => ({
    chords: chordsAt(b.chords, 'medium', (x) => x),
    rh: b.melody.map((n) => ({ ...n })),
  }));
  const advancedBars = build(src.sections, (b) => ({
    chords: chordsAt(b.chords, 'advanced', (x) => x),
    rh: b.melody.map((n) => ({ ...n })),
    ...(b.left ? { lh: b.left.map((n) => ({ ...n })) } : {}),
  }));

  const t = m.tempo;
  const lesson = (
    level: SongLevel,
    bars: Bar[],
    key: { tonic: string; mode: Mode },
    tempo: number,
    left: { lhPattern: string; lhFigure?: Lesson['lhFigure'] },
    cover: string | undefined,
  ): Lesson => {
    const l: Lesson = {
      id: `${m.piece}-${level}`,
      schemaVersion: LESSON_SCHEMA_VERSION,
      title: m.title,
      ...(m.summary ? { summary: m.summary } : {}),
      kind: 'song',
      source: source(src),
      key,
      meter: { ...m.meter },
      tempo: { default: tempo, min: Math.max(30, round5(t * 0.4)), max: round5(t * 1.25) },
      lhPattern: left.lhPattern,
      ...(left.lhFigure ? { lhFigure: left.lhFigure } : {}),
      piece: m.piece,
      level,
      ...(cover ? { covers: cover } : {}),
      rules: DEFAULT_RULES,
      bars,
    };
    const issues = validateLesson(l);
    if (issues.length) throw new Error(`${m.piece} (${level}): ${issues[0]}`);
    return l;
  };

  const advancedLeft =
    typeof m.figure === 'string'
      ? { lhPattern: m.figure }
      : { lhPattern: MEDIUM_FIGURE[m.meter.beats] ?? 'held', lhFigure: m.figure };
  return {
    versions: {
      easy: lesson(
        'easy',
        easyBars,
        { tonic: easyTonic, mode },
        round5(t * 0.8),
        { lhPattern: 'bass-held' },
        covers(main),
      ),
      medium: lesson(
        'medium',
        mediumBars,
        { ...m.key },
        round5(t * 0.9),
        { lhPattern: m.mediumFigure ?? MEDIUM_FIGURE[m.meter.beats] ?? 'held' },
        covers(main),
      ),
      advanced: lesson(
        'advanced',
        advancedBars,
        { ...m.key },
        t,
        advancedLeft,
        covers(src.sections),
      ),
    },
    easyShift: shift,
    easyChanges,
  };
}
