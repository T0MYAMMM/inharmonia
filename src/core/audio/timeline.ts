/** Who plays a note. Used for colour (amber = right hand, dusk = left hand) and per-hand mute. */
export type Channel = 'rh' | 'lh' | 'other';

/** One note on the transport timeline, in straight (unswung) beats. */
export interface TimelineEvent {
  id: string;
  beat: number;
  dur: number;
  midi: number;
  velocity: number;
  channel: Channel;
}

export function sortTimeline<T extends TimelineEvent>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

/** Index of the first event whose beat is ≥ `beat` (binary search on a sorted timeline). */
export function firstIndexAtOrAfter(events: readonly { beat: number }[], beat: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.beat < beat - 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Which keys have notes actively sounding in the transport at `performanceBeat`.
 * The source is the same sorted note-on/off timeline sent to the audio scheduler,
 * rather than a chord's theoretical voicing. Overlapping notes share one lit key.
 *
 * `warp` must be the transport's performanceBeat transform so swung notes
 * light on their audible onset and release (identity for straight playback).
 * A note is lit from its onset up to, but not including, its release.
 */
export function activeEventMidis(
  events: readonly TimelineEvent[],
  channel: Channel,
  performanceBeat: number,
  warp: (beat: number) => number = (beat) => beat,
): number[] {
  const active = new Set<number>();
  for (const event of events) {
    if (event.channel !== channel) continue;
    const start = warp(event.beat);
    // Events are sorted by beat; the swing warp is monotonic.
    if (start > performanceBeat) break;
    if (performanceBeat < warp(event.beat + event.dur)) active.add(event.midi);
  }
  return [...active].sort((a, b) => a - b);
}
