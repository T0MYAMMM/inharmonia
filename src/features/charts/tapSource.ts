import { Transport, WorkerTicker } from '@/core/audio';
import { gridFromTempo, type BeatGrid } from '@/core/charts';
import { audio } from '@/app/services';

/** The clock taps are read on when no song file plays: seconds, `performance.now()`. */
export const tapNow = () => performance.now() / 1000;

/** Gap between pressing Start and the count-in's first click, seconds. */
const START_DELAY = 0.06;

export interface Metronome {
  /** The beat on the `tapNow` clock, beat 0 the first downbeat after the count-in. */
  grid: BeatGrid;
  stop(): void;
}

/**
 * Clicks at the chart's tempo, a bar to count in, for `bars` bars. Its own
 * transport, so a player elsewhere keeps its settings. Call from a gesture:
 * it starts audio, and Tone loads then, if it has not yet.
 */
export function startMetronome(bpm: number, beatsPerBar: number, bars: number): Metronome {
  void audio.unlock();
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
  const startedAt = tapNow();
  transport.play(0, { countInBars: 1 });
  // What you hear is the click plus the output's latency.
  const countIn = (beatsPerBar * 60) / bpm;
  return {
    grid: gridFromTempo(bpm, startedAt + START_DELAY + countIn + audio.outputLatency()),
    stop: () => transport.dispose(),
  };
}
