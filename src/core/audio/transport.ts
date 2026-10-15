import type { Clock, Ticker } from './clock';
import { swingBeat } from './swing';
import { TempoMap } from './tempoMap';
import { firstIndexAtOrAfter, sortTimeline, type Channel, type TimelineEvent } from './timeline';

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface LoopRegion {
  start: number;
  end: number;
}

export interface TransportSink {
  /** Play a note at an audio time for a duration in seconds. */
  note(event: TimelineEvent, time: number, duration: number): void;
  /** Metronome click. `accent` is the first beat of a bar. */
  click(time: number, accent: boolean): void;
  /** Silence everything that is sounding or scheduled. */
  silence(): void;
}

export interface TransportOptions {
  clock: Clock;
  ticker: Ticker;
  sink: TransportSink;
  /** How far ahead to schedule, seconds. */
  lookahead?: number;
  /** Ticker interval, ms. */
  intervalMs?: number;
  /** Gap between pressing Play and the first beat, seconds. */
  startDelay?: number;
  bpm?: number;
  beatsPerBar?: number;
}

export interface PlayOptions {
  /** Count-in bars before `fromBeat`. Defaults to the transport count-in setting. */
  countInBars?: number;
}

type Listener = (t: Transport) => void;

const EPS = 1e-9;

/**
 * Lookahead scheduler: every tick it schedules everything that falls within the
 * next `lookahead` seconds on the audio clock. Times are computed from a tempo map,
 * so tempo changes, loops and swing never accumulate error.
 *
 * All beats are transport beats. Events on the timeline are in straight beats;
 * swing maps them to performance beats before they are converted to time.
 */
export class Transport {
  private readonly clock: Clock;
  private readonly ticker: Ticker;
  private readonly sink: TransportSink;
  private readonly lookahead: number;
  private readonly intervalMs: number;
  private readonly startDelay: number;

  private events: TimelineEvent[] = [];
  private length = 0;
  private map: TempoMap;
  private _bpm: number;
  private _state: TransportState = 'stopped';
  private _beatsPerBar: number;

  private loop: LoopRegion | null = null;
  private swing = 0;
  private metronome = false;
  private countInBars = 0;
  private muted = new Set<Channel>();

  /** Performance beat up to which everything has been scheduled. */
  private cursor = 0;
  private nextIndex = 0;
  /** Clicks are forced on below this beat (count-in). */
  private countInEnd = -Infinity;
  private endTime: number | null = null;
  private pausedAt = 0;
  private listeners = new Set<Listener>();
  private endListeners = new Set<Listener>();

  constructor(opts: TransportOptions) {
    this.clock = opts.clock;
    this.ticker = opts.ticker;
    this.sink = opts.sink;
    this.lookahead = opts.lookahead ?? 0.1;
    this.intervalMs = opts.intervalMs ?? 25;
    this.startDelay = opts.startDelay ?? 0.06;
    this._bpm = opts.bpm ?? 76;
    this._beatsPerBar = opts.beatsPerBar ?? 4;
    this.map = new TempoMap({ time: 0, beat: 0, bpm: this._bpm });
  }

  // ---- configuration -------------------------------------------------------

  setTimeline(events: readonly TimelineEvent[], lengthBeats: number): void {
    this.events = sortTimeline(events);
    this.length = lengthBeats;
    this.nextIndex = this.indexForPerformanceBeat(this.cursor);
  }

  get bpm(): number {
    return this._bpm;
  }

  get beatsPerBar(): number {
    return this._beatsPerBar;
  }

  setBeatsPerBar(n: number): void {
    this._beatsPerBar = n;
  }

  /**
   * Change tempo. While playing, the change takes effect at the scheduling
   * horizon: notes already handed to the audio clock keep their times, and the
   * map stays continuous, so playback never jumps or drifts.
   */
  setTempo(bpm: number): void {
    if (!(bpm > 0)) throw new Error(`Invalid tempo ${bpm}`);
    this._bpm = bpm;
    if (this._state === 'playing') {
      const at = Math.max(this.map.timeAt(this.cursor), this.clock.now());
      this.map.push({ time: at, beat: this.map.beatAt(at), bpm });
      if (this.endTime !== null) this.endTime = this.map.timeAt(this.length);
    }
    this.emit();
  }

  setLoop(region: LoopRegion | null): void {
    if (region && !(region.end > region.start)) throw new Error('Loop end must be after start');
    this.loop = region;
    if (region && this._state === 'playing') this.endTime = null;
    this.emit();
  }

  get loopRegion(): LoopRegion | null {
    return this.loop;
  }

  setSwing(amount: number): void {
    this.swing = Math.max(0, Math.min(1, amount));
  }

  get swingAmount(): number {
    return this.swing;
  }

  /** Metronome clicks on every beat; count-in clicks before playback. The two are independent. */
  setMetronome(on: boolean, countInBars = this.countInBars): void {
    this.metronome = on;
    this.countInBars = Math.max(0, Math.floor(countInBars));
  }

  setMuted(channel: Channel, muted: boolean): void {
    if (muted) this.muted.add(channel);
    else this.muted.delete(channel);
  }

  isMuted(channel: Channel): boolean {
    return this.muted.has(channel);
  }

  // ---- control -------------------------------------------------------------

  get state(): TransportState {
    return this._state;
  }

  play(fromBeat = 0, opts: PlayOptions = {}): void {
    this.halt();
    const countIn = (opts.countInBars ?? this.countInBars) * this._beatsPerBar;
    const startBeat = fromBeat - countIn;
    const startTime = this.clock.now() + this.startDelay;
    this.map = new TempoMap({ time: startTime, beat: startBeat, bpm: this._bpm });
    this.cursor = startBeat;
    this.countInEnd = countIn > 0 ? fromBeat : -Infinity;
    this.nextIndex = firstIndexAtOrAfter(this.events, fromBeat);
    this.endTime = null;
    this._state = 'playing';
    this.ticker.start(() => this.tick(), this.intervalMs);
    this.tick();
    this.emit();
  }

  pause(): void {
    if (this._state !== 'playing') return;
    const beat = this.beatAt();
    this.pausedAt = Math.max(beat, this.countInEnd === -Infinity ? beat : this.countInEnd);
    this.pausedAt = Math.max(0, this.pausedAt);
    this.halt();
    this._state = 'paused';
    this.emit();
  }

  resume(opts: PlayOptions = { countInBars: 0 }): void {
    if (this._state !== 'paused') return;
    this.play(this.pausedAt, opts);
  }

  stop(): void {
    this.halt();
    this.pausedAt = 0;
    this._state = 'stopped';
    this.emit();
  }

  /** Jump to a beat. Keeps playing if playing. */
  seek(beat: number): void {
    if (this._state === 'playing') this.play(beat, { countInBars: 0 });
    else {
      this.pausedAt = beat;
      if (this._state === 'stopped') this._state = 'paused';
      this.emit();
    }
  }

  /**
   * Current performance beat for visuals. Pass the audio time you want to show
   * (typically `now - outputLatency`). Negative or below the start during count-in.
   */
  beatAt(time = this.clock.now()): number {
    if (this._state !== 'playing') return this.pausedAt;
    return this.map.beatAt(time);
  }

  /** Map a straight timeline beat to the performance beat it sounds on. */
  performanceBeat(beat: number): number {
    return swingBeat(beat, this.swing);
  }

  /** Count-in beat remaining, or null when not counting in. */
  countInRemaining(time = this.clock.now()): number | null {
    if (this._state !== 'playing' || this.countInEnd === -Infinity) return null;
    const left = this.countInEnd - this.map.beatAt(time);
    return left > 0 ? left : null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEnd(listener: Listener): () => void {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  dispose(): void {
    this.halt();
    this.listeners.clear();
    this.endListeners.clear();
  }

  // ---- scheduling ----------------------------------------------------------

  private halt(): void {
    this.ticker.stop();
    if (this._state === 'playing') this.sink.silence();
  }

  private emit(): void {
    for (const l of this.listeners) l(this);
  }

  private indexForPerformanceBeat(perfBeat: number): number {
    let i = firstIndexAtOrAfter(this.events, Math.floor(perfBeat) - 1);
    while (i < this.events.length && this.performanceBeat(this.events[i]!.beat) < perfBeat - EPS)
      i++;
    return i;
  }

  /** One scheduler pass. Public for tests; the ticker calls it. */
  tick(): void {
    if (this._state !== 'playing') return;
    const now = this.clock.now();

    if (this.endTime !== null && now >= this.endTime) {
      this.halt();
      this._state = 'stopped';
      this.pausedAt = 0;
      this.emit();
      for (const l of this.endListeners) l(this);
      return;
    }

    const horizon = now + this.lookahead;
    // Bounded loop: a pathological tiny loop cannot hang the tab.
    for (let guard = 0; guard < 64 && this.endTime === null; guard++) {
      const horizonBeat = this.map.beatAt(horizon);
      if (horizonBeat <= this.cursor + EPS) break;

      const loop = this.loop && this.cursor < this.loop.end - EPS ? this.loop : null;
      const boundary = loop ? loop.end : this.length;
      const windowEnd = Math.min(horizonBeat, boundary);

      this.scheduleClicks(this.cursor, windowEnd, boundary);
      this.scheduleEvents(windowEnd, boundary);
      this.cursor = windowEnd;

      if (windowEnd < boundary - EPS) break;

      if (loop) {
        const wrapTime = this.map.timeAt(loop.end);
        this.map.push({ time: wrapTime, beat: loop.start, bpm: this._bpm });
        this.cursor = loop.start;
        this.countInEnd = -Infinity;
        this.nextIndex = this.indexForPerformanceBeat(loop.start);
      } else {
        this.endTime = this.map.timeAt(this.length);
      }
    }
    this.map.prune(now - 1);
  }

  private scheduleEvents(windowEnd: number, boundary: number): void {
    while (this.nextIndex < this.events.length) {
      const ev = this.events[this.nextIndex]!;
      const start = this.performanceBeat(ev.beat);
      if (start >= windowEnd - EPS) break;
      this.nextIndex++;
      if (start < this.cursor - EPS) continue;
      if (this.muted.has(ev.channel)) continue;
      const end = Math.min(this.performanceBeat(ev.beat + ev.dur), boundary);
      this.sink.note(ev, this.map.timeAt(start), this.map.duration(Math.max(0, end - start)));
    }
  }

  private scheduleClicks(from: number, to: number, boundary: number): void {
    for (let b = Math.ceil(from - EPS); b < to - EPS; b++) {
      if (b >= boundary - EPS) break;
      const inCountIn = b < this.countInEnd - EPS;
      if (!this.metronome && !inCountIn) continue;
      const accent = ((b % this._beatsPerBar) + this._beatsPerBar) % this._beatsPerBar === 0;
      this.sink.click(this.map.timeAt(b), accent);
    }
  }
}
