import { sortTimeline, type Channel, type TimelineEvent, type Transport } from '@/core/audio';
import type { KeyLights } from '@/state/keyLights';

export interface VisualFrame {
  /** Performance beat currently audible. */
  beat: number;
  /** Count-in beats left, or null. */
  countIn: number | null;
  playing: boolean;
}

/**
 * Drives key highlights and any per-frame visuals from the transport, on
 * requestAnimationFrame. The beat is read for the audio time that is reaching
 * the speakers now (currentTime minus output latency), so lights match sound.
 */
export function startVisualLoop(opts: {
  transport: Transport;
  events: readonly TimelineEvent[];
  lights: KeyLights;
  now: () => number;
  latency: () => number;
  onFrame?: (f: VisualFrame) => void;
}): () => void {
  let raf = 0;
  const events = sortTimeline(opts.events);
  const lit: Record<Channel, Set<number>> = { rh: new Set(), lh: new Set(), other: new Set() };

  const frame = () => {
    const { transport } = opts;
    const playing = transport.state === 'playing';
    const time = opts.now() - opts.latency();
    const beat = transport.beatAt(time);
    const next: Record<Channel, Set<number>> = { rh: new Set(), lh: new Set(), other: new Set() };
    if (playing) {
      for (const ev of events) {
        if (transport.isMuted(ev.channel)) continue;
        const s = transport.performanceBeat(ev.beat);
        if (s > beat) break;
        if (beat < transport.performanceBeat(ev.beat + ev.dur)) next[ev.channel].add(ev.midi);
      }
    }
    for (const ch of ['rh', 'lh'] as const) {
      if (!sameSet(lit[ch], next[ch])) {
        opts.lights.setExactly(ch, next[ch]);
        lit[ch] = next[ch];
      }
    }
    opts.onFrame?.({ beat, countIn: transport.countInRemaining(time), playing });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    opts.lights.clear('rh');
    opts.lights.clear('lh');
  };
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
