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
