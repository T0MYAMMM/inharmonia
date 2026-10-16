import { Scale } from 'tonal';
import { MIX, type Mix } from '@config/mix';
import { sortTimeline, type TimelineEvent } from '../audio/timeline';
import type { CompiledLesson } from './compile';
import {
  chroma,
  normalizeAccidentals,
  parseChord,
  romanToChord,
  spellAt,
  transposePc,
  voiceChord,
  type Mode,
  type SpelledNote,
} from '../theory';
import type { FillPitch, FillSpec, Hand } from './types';

/** A chord change to put a fill on, as Roman numerals. */
export interface FillChange {
  from: string;
  to: string;
}

/** Common changes to try fills on, per mode. The first few suit most fills. */
export const FILL_CHANGES: Record<Mode, readonly FillChange[]> = {
  major: [
    { from: 'V7', to: 'I' },
    { from: 'I', to: 'IV' },
    { from: 'IV', to: 'V' },
    { from: 'ii7', to: 'V7' },
    { from: 'I', to: 'vi' },
    { from: 'vi', to: 'IV' },
    { from: 'IV', to: 'I' },
    { from: 'iii7', to: 'vi7' },
    { from: 'I', to: 'V7' },
    { from: 'V7/V', to: 'V7' },
  ],
  minor: [
    { from: 'V7', to: 'i' },
    { from: 'i', to: 'iv' },
    { from: 'iv', to: 'V7' },
    { from: 'i', to: 'bVI' },
    { from: 'bVI', to: 'bVII' },
    { from: 'bVII', to: 'i' },
    { from: 'iiø7', to: 'V7' },
  ],
};

export const changeKey = (c: FillChange): string => `${c.from}>${c.to}`;

/** Notes struck together, on the exercise timeline. */
export interface RealizedHit {
  id: string;
  /** Beat in the two-bar exercise (the change is at beat 4). */
  beat: number;
  dur: number;
  notes: SpelledNote[];
  velocity: number;
  /** The hit on the chord change, when a fill lands there. */
  landing: boolean;
}

export interface FillContext {
  /** Tonic, e.g. "Eb". */
  key: string;
  mode: Mode;
  /** Chord symbols either side of the change. */
  from: string;
  to: string;
}

/** Lowest MIDI note of the register a hand's roots are placed in (one octave up from here). */
const REGISTER: Record<Hand, number> = { rh: 60, lh: 36 };
/** Where the change sits in the two-bar exercise. */
export const CHANGE_BEAT = 4;
export const EXERCISE_BEATS = 8;

const SEMIS_INTERVAL = [
  '1P',
  '2m',
  '2M',
  '3m',
  '3M',
  '4P',
  '4A',
  '5P',
  '6m',
  '6M',
  '7m',
  '7M',
  '8P',
] as const;

/** Spell a pitch moved by semitones: down-steps as sharps below, up-steps as flats above. */
function shiftPc(pc: string, semis: number): string {
  const n = Math.abs(semis) % 12;
  if (n === 0) return pc;
  const iv = SEMIS_INTERVAL[n]!;
  return transposePc(pc, semis < 0 ? `-${iv}` : iv);
}

interface Ladder {
  pcs: readonly string[];
  /** Every note of the scale from MIDI 21 to 108, ascending. */
  notes: { pc: string; midi: number }[];
}

const ladders = new Map<string, Ladder>();

function ladder(key: string, mode: Mode, scale: 'key' | 'pentatonic'): Ladder {
  const id = `${key}:${mode}:${scale}`;
  const hit = ladders.get(id);
  if (hit) return hit;
  const name =
    scale === 'pentatonic'
      ? `${key} ${mode === 'minor' ? 'minor' : 'major'} pentatonic`
      : `${key} ${mode === 'minor' ? 'minor' : 'major'}`;
  const pcs = Scale.get(name).notes.map(normalizeAccidentals);
  if (!pcs.length) throw new Error(`Unknown scale "${name}"`);
  const notes: Ladder['notes'] = [];
  for (let midi = 21; midi <= 108; midi++) {
    const pc = pcs.find((p) => chroma(p) === midi % 12);
    if (pc) notes.push({ pc, midi });
  }
  const out = { pcs, notes };
  ladders.set(id, out);
  return out;
}

/** Walk `steps` scale notes from `from` (which may itself be off the scale). */
function walk(l: Ladder, from: { pc: string; midi: number }, steps: number) {
  if (steps === 0) return from;
  if (steps > 0) {
    const above = l.notes.filter((n) => n.midi > from.midi);
    const n = above[steps - 1];
    if (!n) throw new Error('Run goes off the top of the keyboard');
    return n;
  }
  const below = l.notes.filter((n) => n.midi < from.midi);
  const n = below[below.length + steps];
  if (!n) throw new Error('Run goes off the bottom of the keyboard');
  return n;
}

/** The pitch of one fill note in a context. */
export function realizePitch(
  p: FillPitch,
  ctx: FillContext,
  hand: Hand,
  scale: 'key' | 'pentatonic' = 'key',
): SpelledNote {
  const lo = REGISTER[hand];
  const rootPc =
    p.ref === 'key'
      ? normalizeAccidentals(ctx.key)
      : parseChord(p.ref === 'from' ? ctx.from : ctx.to).root;
  const rootMidi = lo + ((chroma(rootPc) - lo + 120) % 12);
  let pc = rootPc;
  let midi = rootMidi;
  if (p.tone && p.tone !== 'root') {
    if (p.ref === 'key') throw new Error('Chord tones need a chord: use "from" or "to"');
    const info = parseChord(p.ref === 'from' ? ctx.from : ctx.to);
    const tone = info.tones[p.tone === 'third' ? 1 : 2];
    if (!tone) throw new Error(`${info.symbol} has no ${p.tone}`);
    pc = normalizeAccidentals(tone);
    midi = rootMidi + ((chroma(pc) - chroma(rootPc) + 12) % 12);
  }
  if (p.step) ({ pc, midi } = walk(ladder(ctx.key, ctx.mode, scale), { pc, midi }, p.step));
  if (p.semis) {
    pc = shiftPc(pc, p.semis);
    midi += p.semis;
  }
  if (p.octave) midi += 12 * p.octave;
  if (midi < 21 || midi > 108) throw new Error('Note off the keyboard');
  return spellAt(pc, midi);
}

/** Where the fill starts in the two-bar exercise. */
export function fillStartBeat(fill: FillSpec): number {
  return fill.anchor === 'into-next' ? CHANGE_BEAT - fill.beats : 0;
}

/** The fill's notes in a context, on the exercise timeline. */
export function realizeFill(fill: FillSpec, ctx: FillContext, mix: Mix = MIX): RealizedHit[] {
  const start = fillStartBeat(fill);
  return fill.hits.map((h, i) => {
    const beat = start + h.at;
    const landing = fill.anchor === 'into-next' && Math.abs(h.at - fill.beats) < 1e-9;
    const notes = h.notes
      .map((p) => realizePitch(p, ctx, fill.hand, fill.scale))
      .sort((a, b) => a.midi - b.midi);
    return {
      id: `fill-${i}`,
      beat,
      dur: h.dur,
      notes,
      velocity: h.velocity ?? (landing ? mix.fills.landingVelocity : mix.fills.velocity),
      landing,
    };
  });
}

/** Problems that would make a fill wrong in a context; empty when it plays. */
export function fillIssues(fill: FillSpec, ctx: FillContext): string[] {
  const issues: string[] = [];
  if (fill.beats <= 0 || fill.beats > 4) issues.push('Fills last up to one bar.');
  let last = -Infinity;
  for (const [i, h] of fill.hits.entries()) {
    const where = `Hit ${i + 1}`;
    if (!h.notes.length) issues.push(`${where} has no notes.`);
    if (h.at < last - 1e-9) issues.push(`${where} is out of order.`);
    last = h.at;
    const limit = fill.anchor === 'into-next' ? fill.beats : fill.beats - 1e-9;
    if (h.at < 0 || h.at > limit + 1e-9) issues.push(`${where} is outside the fill.`);
    if (h.dur <= 0) issues.push(`${where} has no length.`);
  }
  try {
    const hits = realizeFill(fill, ctx);
    for (const h of hits)
      if (h.beat + h.dur > EXERCISE_BEATS + 1e-9) issues.push(`${h.id} rings past the exercise.`);
  } catch (err) {
    issues.push(err instanceof Error ? err.message : String(err));
  }
  return issues;
}

export interface FillExercise {
  fill: FillSpec;
  context: FillContext;
  change: FillChange;
  hits: RealizedHit[];
  /** The two chords, voiced in the other hand's register. */
  chords: {
    symbol: string;
    numeral: string;
    beat: number;
    beats: number;
    voicing: SpelledNote[];
  }[];
  /** Backing chords and the fill, for the transport. */
  events: TimelineEvent[];
  /** Lowest and highest notes of the fill, to centre the keyboard on. */
  range: [number, number];
}

/**
 * Two bars: the chord before the change with the fill, then the chord after
 * it with the landing. The chords are held in the other hand's register.
 */
export function compileFillExercise(
  fill: FillSpec,
  opts: { key: string; mode: Mode; change: FillChange; backing?: boolean },
  mix: Mix = MIX,
): FillExercise {
  const from = romanToChord(opts.change.from, opts.key, opts.mode);
  const to = romanToChord(opts.change.to, opts.key, opts.mode);
  const context: FillContext = { key: opts.key, mode: opts.mode, from, to };
  const hits = realizeFill(fill, context, mix);
  const backingHand: Hand = fill.hand === 'rh' ? 'lh' : 'rh';
  const floor = backingHand === 'lh' ? 'C3' : 'C4';
  const chords = [
    { symbol: from, numeral: opts.change.from, beat: 0 },
    { symbol: to, numeral: opts.change.to, beat: CHANGE_BEAT },
  ].map((c) => ({
    ...c,
    beats: CHANGE_BEAT,
    voicing: voiceChord(c.symbol, { style: 'close', floor }),
  }));
  const events: TimelineEvent[] = [];
  chords.forEach((c, ci) =>
    c.voicing.forEach((n, ni) =>
      events.push({
        id: `chord-${ci}-${ni}`,
        beat: c.beat,
        dur: c.beats,
        midi: n.midi,
        velocity: ni === 0 ? mix.leftHand.accentVelocity : mix.leftHand.velocity * 1.4,
        channel: backingHand,
      }),
    ),
  );
  for (const h of hits)
    h.notes.forEach((n, ni) =>
      events.push({
        id: `${h.id}-${ni}`,
        beat: h.beat,
        dur: h.dur * mix.melody.legato,
        midi: n.midi,
        velocity: h.velocity,
        channel: fill.hand,
      }),
    );
  events.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const played = hits.flatMap((h) => h.notes).map((n) => n.midi);
  return {
    fill,
    context,
    change: opts.change,
    hits,
    chords,
    events,
    range: [Math.min(...played), Math.max(...played)],
  };
}

/**
 * Put a right-hand fill on every chord change of a compiled progression, where
 * the chord before the change is long enough to hold it and the fill doesn't
 * start on the last one's landing. Nothing goes after the last chord.
 */
export function withFills(
  compiled: CompiledLesson,
  fill: FillSpec,
  key: { tonic: string; mode: Mode },
  mix: Mix = MIX,
): CompiledLesson {
  const events: TimelineEvent[] = [];
  const fills: NonNullable<CompiledLesson['fills']> = [];
  const chords = compiled.chords;
  let lastBeat = -Infinity;
  for (let i = 0; i + 1 < chords.length; i++) {
    const cur = chords[i]!;
    const next = chords[i + 1]!;
    if (cur.beats < fill.beats - 1e-9) continue;
    const hits = realizeFill(
      fill,
      { key: key.tonic, mode: key.mode, from: cur.symbol, to: next.symbol },
      mix,
    );
    // realizeFill lays the fill out on the two-bar exercise; move it to this change.
    const offset =
      fill.anchor === 'into-next'
        ? next.startBeat - CHANGE_BEAT
        : cur.startBeat - fillStartBeat(fill);
    // Don't start on top of the last fill's landing.
    if (hits[0] && hits[0].beat + offset < lastBeat + 1e-9) continue;
    lastBeat = (hits.at(-1)?.beat ?? 0) + offset;
    for (const h of hits) {
      const beat = h.beat + offset;
      const dur = Math.min(h.dur, next.startBeat + next.beats - beat);
      fills.push({ beat, dur, midis: h.notes.map((n) => n.midi) });
      h.notes.forEach((n, ni) =>
        events.push({
          id: `fill-${i}-${h.id}-${ni}`,
          beat,
          dur: dur * mix.melody.legato,
          midi: n.midi,
          velocity: h.velocity,
          channel: fill.hand,
        }),
      );
    }
  }
  return {
    ...compiled,
    events: sortTimeline([...compiled.events, ...events]),
    fills: fills.sort((a, b) => a.beat - b.beat),
  };
}
