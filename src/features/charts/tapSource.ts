import { Transport, WorkerTicker } from '@/core/audio';
import { gridFromTempo, type BeatGrid } from '@/core/charts';
import { audio } from '@/app/services';

/** The clock taps are read on when no song file plays: seconds, `performance.now()`. */
export const tapNow = () => performance.now() / 1000;

/** Gap between pressing Start and the count-in's first click, seconds. */
const START_DELAY = 0.06;

/** How long Start waits for audio to be running before it counts in anyway, ms. */
const READY_WAIT_MS = 1500;

export interface Metronome {
  /** The beat on the `tapNow` clock, beat 0 the first downbeat after the count-in. */
  grid: BeatGrid;
  stop(): void;
}

/**
 * Start audio, and Tone with it, ahead of the first count-in. Call from a
 * gesture, such as opening tap timing.
 */
export function warmAudio(): void {
  void audio.unlock();
}

/** Audio started and running, or the wait over: never holds Start for long. */
async function ready(): Promise<void> {
  const running = (async () => {
    await audio.unlock();
    const ctx = audio.context();
    if (ctx && ctx.state !== 'running') await ctx.resume();
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([running, new Promise((r) => (timer = setTimeout(r, READY_WAIT_MS)))]);
  clearTimeout(timer);
}

/**
 * Clicks at the chart's tempo, a bar to count in, for `bars` bars. Its own
 * transport, so a player elsewhere keeps its settings. Call from a gesture.
 * It waits for audio to be running, then reads the grid off the audio clock,
 * so the beat you tap to is the one you hear.
 */
export async function startMetronome(
  bpm: number,
  beatsPerBar: number,
  bars: number,
): Promise<Metronome> {
  await ready();
  const transport = new Transport({
    clock: audio.clock(),
    ticker: new WorkerTicker(),
    sink: audio.sink(),
    startDelay: START_DELAY,
    bpm,
    beatsPerBar,
  });
  transport.setTimeline([], bars * beatsPerBar);
  transport.setMetronome(true, 1);
  transport.play(0, { countInBars: 1 });
  const ahead = audio.unlocked
    ? transport.timeAtBeat(0) - audio.now()
    : START_DELAY + (beatsPerBar * 60) / bpm;
  // What you hear is the click plus the output's latency.
  return {
    grid: gridFromTempo(bpm, tapNow() + ahead + audio.outputLatency()),
    stop: () => transport.dispose(),
  };
}
