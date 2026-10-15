/** Audio-clock time source in seconds (AudioContext.currentTime in the app, a fake in tests). */
export interface Clock {
  now(): number;
}

/** Periodic callback driver. The app uses a Web Worker so background tabs keep ticking. */
export interface Ticker {
  start(callback: () => void, intervalMs: number): void;
  stop(): void;
}

export class IntervalTicker implements Ticker {
  private id: ReturnType<typeof setInterval> | null = null;
  start(callback: () => void, intervalMs: number): void {
    this.stop();
    this.id = setInterval(callback, intervalMs);
  }
  stop(): void {
    if (this.id !== null) clearInterval(this.id);
    this.id = null;
  }
}

/**
 * Ticks from a dedicated worker. Main-thread timers are throttled to ~1 Hz in
 * background tabs, which would starve a lookahead scheduler; worker timers are not.
 */
export class WorkerTicker implements Ticker {
  private worker: Worker | null = null;
  private fallback = new IntervalTicker();

  start(callback: () => void, intervalMs: number): void {
    this.stop();
    try {
      this.worker = new Worker(new URL('./tickWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = callback;
      this.worker.postMessage({ type: 'start', intervalMs });
    } catch {
      this.worker = null;
      this.fallback.start(callback, intervalMs);
    }
  }

  stop(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    this.fallback.stop();
  }
}

/** Manually advanced clock and ticker for tests. */
export class FakeClock implements Clock, Ticker {
  time = 0;
  private callback: (() => void) | null = null;
  private interval = 25;
  now(): number {
    return this.time;
  }
  start(callback: () => void, intervalMs: number): void {
    this.callback = callback;
    this.interval = intervalMs;
  }
  stop(): void {
    this.callback = null;
  }
  get running(): boolean {
    return this.callback !== null;
  }
  /** Advance time in ticker-sized steps, ticking after each step. */
  advance(seconds: number): void {
    const step = this.interval / 1000;
    const target = this.time + seconds;
    while (this.time + step <= target + 1e-12) {
      this.time += step;
      this.callback?.();
    }
    if (this.time < target) {
      this.time = target;
      this.callback?.();
    }
  }
}
