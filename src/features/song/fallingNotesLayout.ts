import type { TimelineEvent } from '@/core/audio/timeline';
import { layoutKeys, PIANO_RANGE } from '@/ui/keyboard/layout';

export type FallingHand = 'both' | 'rh' | 'lh';

export interface FallingNote {
  id: string;
  midi: number;
  hand: 'rh' | 'lh';
  /** Distance from the upper edge of the roll, from 0 (top) to 1 (strike line). */
  top: number;
  bottom: number;
  active: boolean;
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** An intentionally stable piano range across the lesson, not one that jumps on every note. */
export function fallingKeyRange(
  events: readonly TimelineEvent[],
  hand: FallingHand,
): [number, number] {
  const shown = events.filter(
    (event) => (hand === 'both' || event.channel === hand) && event.channel !== 'other',
  );
  if (shown.length === 0) return [48, 84];

  const min = Math.min(...shown.map((event) => event.midi));
  const max = Math.max(...shown.map((event) => event.midi));
  const middle = (min + max) / 2;
  const span = Math.max(25, max - min + 4);
  let lo = Math.floor(middle - span / 2);
  let hi = lo + span;
  if (lo < PIANO_RANGE[0]) {
    hi += PIANO_RANGE[0] - lo;
    lo = PIANO_RANGE[0];
  }
  if (hi > PIANO_RANGE[1]) {
    lo -= hi - PIANO_RANGE[1];
    hi = PIANO_RANGE[1];
  }
  // Stable, natural C-to-B keyboard boundaries where possible.
  lo = Math.max(PIANO_RANGE[0], Math.floor(lo / 12) * 12);
  hi = Math.min(PIANO_RANGE[1], Math.ceil((hi + 1) / 12) * 12 - 1);
  return [lo, hi];
}

/**
 * Project the transport's audible event timeline onto a top-to-bottom piano roll.
 * Using the exact same performance-beat warp as audio preserves swing, duration,
 * rests, overlapping notes, loops, tempo changes and generated fills.
 */
export function fallingNotesAt(
  events: readonly TimelineEvent[],
  performanceBeat: number,
  lookAheadBeats: number,
  hand: FallingHand,
  warp: (beat: number) => number = (beat) => beat,
): FallingNote[] {
  if (!(lookAheadBeats > 0)) return [];
  const shown: FallingNote[] = [];
  for (const event of events) {
    if (event.channel === 'other' || (hand !== 'both' && event.channel !== hand)) continue;
    const start = warp(event.beat) - performanceBeat;
    const end = warp(event.beat + event.dur) - performanceBeat;
    if (end <= 0 || start >= lookAheadBeats) continue;
    shown.push({
      id: event.id,
      midi: event.midi,
      hand: event.channel,
      top: clamp(1 - end / lookAheadBeats, 0, 1),
      bottom: clamp(1 - start / lookAheadBeats, 0, 1),
      active: start <= 0 && end > 0,
    });
  }
  return shown;
}

/** A shared pitch-to-x mapping for note rectangles and piano key graphics. */
export function fallingKeyPositions(low: number, high: number, whiteWidth: number) {
  const geometry = layoutKeys(low, high);
  return {
    width: geometry.width * whiteWidth,
    keys: geometry.keys.map((key) => ({
      ...key,
      x: key.x * whiteWidth,
      width: whiteWidth * (key.black ? 0.6 : 1),
    })),
  };
}
