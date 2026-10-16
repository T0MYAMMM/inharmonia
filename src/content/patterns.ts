import type { PatternSpec, PatternStep } from '@/core/content/types';

/**
 * Left-hand comping patterns. Voices point into the chord's voicing (0 = lowest,
 * negative from the top), 'all' plays the whole voicing, and 'root' / 'fifth'
 * are bass notes below it. Accented steps use the accent level in config/mix.ts.
 * Every pattern restarts on each chord and stops at the chord change.
 */
const step = (
  at: number,
  dur: number | 'chord',
  voices: PatternStep['voices'],
  accent = false,
): PatternStep => ({
  at,
  dur,
  voices,
  ...(accent ? { accent: true } : {}),
});

export const ARPEGGIO_8THS: PatternSpec = {
  id: 'arpeggio-8ths',
  name: 'Broken chord',
  description:
    'Up and back through the voicing in 8ths, each note held. The Senja di Teras left hand.',
  cycleBeats: 4,
  // 1-2-3-4-3-2-3-4, each note held until the chord changes (pedal feel).
  steps: [0, 1, 2, 3, 2, 1, 2, 3].map((v, i) => step(i * 0.5, 'chord', [v], i === 0)),
};

export const BLOCK: PatternSpec = {
  id: 'block',
  name: 'Block chords',
  description: 'The whole chord on every beat.',
  cycleBeats: 1,
  steps: [step(0, 0.9, ['all'])],
};

export const ALBERTI: PatternSpec = {
  id: 'alberti',
  name: 'Alberti bass',
  description: 'Low, high, middle, high in 8ths: the classical broken-chord accompaniment.',
  cycleBeats: 2,
  steps: [step(0, 0.5, [0], true), step(0.5, 0.5, [-1]), step(1, 0.5, [1]), step(1.5, 0.5, [-1])],
};

export const ROOT_FIFTH: PatternSpec = {
  id: 'root-fifth',
  name: 'Root and fifth',
  description: 'Root on beat 1, fifth on beat 3, under a held chord.',
  cycleBeats: 4,
  steps: [step(0, 2, ['root'], true), step(0, 'chord', ['all']), step(2, 2, ['fifth'], true)],
};

export const STRIDE: PatternSpec = {
  id: 'stride',
  name: 'Stride basics',
  description: 'Bass note, chord, bass note, chord: the oom-pah of stride piano.',
  cycleBeats: 4,
  steps: [
    step(0, 0.9, ['root'], true),
    step(1, 0.8, ['all']),
    step(2, 0.9, ['fifth'], true),
    step(3, 0.8, ['all']),
  ],
};

export const BALLAD_8THS: PatternSpec = {
  id: 'ballad-8ths',
  name: 'Ballad 8ths',
  description: 'A held bass note with soft repeated chords in 8ths.',
  cycleBeats: 4,
  steps: [
    step(0, 'chord', ['root'], true),
    ...Array.from({ length: 8 }, (_, i) => step(i * 0.5, 0.45, ['all'])),
  ],
};

export const POP_16THS: PatternSpec = {
  id: 'pop-16ths',
  name: 'Pop 16ths',
  description: 'Syncopated chord stabs on a 16th-note grid over root bass on 1 and 3.',
  cycleBeats: 4,
  steps: [
    step(0, 2, ['root'], true),
    step(0, 0.5, ['all']),
    step(0.75, 0.5, ['all']),
    step(1.5, 0.5, ['all']),
    step(2, 2, ['root'], true),
    step(2.5, 0.5, ['all']),
    step(3.25, 0.5, ['all']),
  ],
};

export const BOSSA: PatternSpec = {
  id: 'bossa',
  name: 'Bossa',
  description: 'Root and fifth in the bass with off-beat chords, in a gentle bossa feel.',
  cycleBeats: 4,
  steps: [
    step(0, 1.5, ['root'], true),
    step(0, 0.75, ['all']),
    step(1.5, 0.5, ['fifth'], true),
    step(1.5, 0.75, ['all']),
    step(2, 1.5, ['root'], true),
    step(3, 0.75, ['all']),
    step(3.5, 0.5, ['fifth'], true),
  ],
};

export const WALTZ: PatternSpec = {
  id: 'waltz',
  name: 'Waltz',
  description: 'Bass on 1, chord on 2 and 3, in 3/4.',
  beatsPerBar: 3,
  cycleBeats: 3,
  steps: [step(0, 0.95, ['root'], true), step(1, 0.85, ['all']), step(2, 0.85, ['all'])],
};

export const HELD: PatternSpec = {
  id: 'held',
  name: 'Held chords',
  description: 'Each chord once, held for its full length.',
  cycleBeats: 64,
  steps: [step(0, 'chord', ['all'], true)],
};

/** Chord charts: the triad in the right hand, the root (or slash bass) in the left, held. */
export const TRIAD_ROOT: PatternSpec = {
  id: 'triad-root',
  name: 'Right-hand triad, left-hand root',
  description: 'The chord in the right hand and its root in the left, held for each chord.',
  cycleBeats: 64,
  steps: [step(0, 'chord', ['root'], true), step(0, 'chord', ['all'])],
};

/** In display order. */
export const PATTERN_LIST: readonly PatternSpec[] = [
  HELD,
  BLOCK,
  ARPEGGIO_8THS,
  ALBERTI,
  ROOT_FIFTH,
  STRIDE,
  BALLAD_8THS,
  POP_16THS,
  BOSSA,
  WALTZ,
  TRIAD_ROOT,
];

export const PATTERNS: Readonly<Record<string, PatternSpec>> = Object.fromEntries(
  PATTERN_LIST.map((p) => [p.id, p]),
);
