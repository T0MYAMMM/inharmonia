/**
 * The mix: every level the app plays at, in one place, for tuning by ear.
 *
 * Velocities are 0..1 and are what content is written with. Gains are in dB and
 * scale a whole channel on top of that. The sampler and the synth treat velocity
 * as linear gain, so a channel gain multiplies its velocities; the result is
 * capped at 1, so boost by lowering the other channels rather than raising one
 * past full.
 *
 * Melody and left-hand values come from the synth prototype; retune them
 * against the piano samples here.
 */
export interface Mix {
  /** Right hand: melodies, targets. */
  melody: {
    gainDb: number;
    velocity: number;
    /** Fraction of its written length a melody note sounds, so repeats re-strike cleanly. */
    legato: number;
  };
  /** Left hand: comping patterns and chords. */
  leftHand: {
    gainDb: number;
    /** First note of each chord segment. */
    accentVelocity: number;
    /** Every other pattern note. */
    velocity: number;
  };
  /** What you play yourself, on any input. */
  live: { gainDb: number };
  /** Practice mode feedback sounds. */
  practice: {
    /** Left-hand chord rolled in when a target starts a new chord (uses leftHand.gainDb). */
    rollRootVelocity: number;
    rollVelocity: number;
    rollGapSec: number;
    rollLengthSec: number;
    /** "Hear it" (uses melody.gainDb). */
    hearItVelocity: number;
    hearItLengthSec: number;
  };
  /** Chord library and drills: "Hear it" on a chord (uses leftHand.gainDb). */
  chords: { velocity: number; lengthSec: number; brokenGapSec: number };
  /** Fills and runs (use the playing hand's gain). The landing note is a touch louder. */
  fills: { velocity: number; landingVelocity: number };
  metronome: { gainDb: number; accentVelocity: number; velocity: number };
}

export const MIX: Mix = {
  melody: { gainDb: 0, velocity: 0.4, legato: 0.95 },
  leftHand: { gainDb: 0, accentVelocity: 0.26, velocity: 0.13 },
  live: { gainDb: 0 },
  practice: {
    rollRootVelocity: 0.3,
    rollVelocity: 0.17,
    rollGapSec: 0.035,
    rollLengthSec: 1.8,
    hearItVelocity: 0.5,
    hearItLengthSec: 0.55,
  },
  chords: { velocity: 0.32, lengthSec: 1.8, brokenGapSec: 0.22 },
  fills: { velocity: 0.4, landingVelocity: 0.46 },
  metronome: { gainDb: 0, accentVelocity: 0.9, velocity: 0.55 },
};

export type MixChannel = 'rh' | 'lh' | 'live' | 'metronome' | 'other';

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** Velocity after the channel's gain, capped to 0..1. */
export function mixVelocity(channel: MixChannel, velocity: number, mix: Mix = MIX): number {
  const db =
    channel === 'rh'
      ? mix.melody.gainDb
      : channel === 'lh'
        ? mix.leftHand.gainDb
        : channel === 'live'
          ? mix.live.gainDb
          : channel === 'metronome'
            ? mix.metronome.gainDb
            : 0;
  return Math.max(0, Math.min(1, velocity * dbToGain(db)));
}
