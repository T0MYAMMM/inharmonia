import type { Transport } from '@/core/audio';
import type { AudioEngine } from '@/core/audio/engine';
import { activeEventMidis } from '@/core/audio/timeline';
import type { CompiledLesson } from '@/core/content/compile';
import { barAt } from '@/core/practice';
import type { KeyLights } from '@/state/keyLights';

export interface SequenceSnapshot {
  playing: boolean;
  /** The bar under the playhead while playing; null when stopped. */
  bar: number | null;
}

export interface SequencePlayerServices {
  transport: Transport;
  audio: AudioEngine;
  lights: KeyLights;
}

/**
 * Plays a chord sequence on the shared transport, from bar 1, looped or
 * once. While it plays it lights the notes that sound (chord tones, dusk)
 * and follows the bar. Stopped, it leaves the key lights alone, so the
 * chord builder on the same page can show its chord. A new sequence swaps
 * in while it plays and is heard from the next note. Plain TypeScript.
 */
export class SequencePlayer {
  private compiled: CompiledLesson | null = null;
  private tempo = 80;
  private loop = true;
  private snap: SequenceSnapshot = { playing: false, bar: null };
  private listeners = new Set<() => void>();
  private raf = 0;
  private offEnd: (() => void) | null = null;

  constructor(private readonly s: SequencePlayerServices) {}

  get snapshot(): SequenceSnapshot {
    return this.snap;
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<SequenceSnapshot>): void {
    if (Object.entries(patch).every(([k, v]) => this.snap[k as keyof SequenceSnapshot] === v))
      return;
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  /**
   * The sequence to play, or null when it is empty (which stops it). While
   * playing, the change is heard at once; it starts again from bar 1 when
   * the bars under the playhead are gone, or the meter moved them.
   */
  load(compiled: CompiledLesson | null): void {
    const before = this.compiled;
    this.compiled = compiled;
    if (!this.snap.playing) return;
    if (!compiled) return this.stop();
    const t = this.s.transport;
    const beat = t.beatAt();
    t.setTimeline(compiled.events, compiled.lengthBeats);
    t.setBeatsPerBar(compiled.beatsPerBar);
    this.applyLoop();
    if (beat >= compiled.lengthBeats || before?.beatsPerBar !== compiled.beatsPerBar)
      t.play(0, { countInBars: 0 });
  }

  setTempo(bpm: number): void {
    this.tempo = bpm;
    if (this.snap.playing) this.s.transport.setTempo(bpm);
  }

  setLoop(on: boolean): void {
    this.loop = on;
    if (this.snap.playing) this.applyLoop();
  }

  private applyLoop(): void {
    const c = this.compiled;
    this.s.transport.setLoop(this.loop && c ? { start: 0, end: c.lengthBeats } : null);
  }

  play(): void {
    const c = this.compiled;
    if (!c || this.snap.playing) return;
    void this.s.audio.unlock();
    const t = this.s.transport;
    t.stop();
    t.setTimeline(c.events, c.lengthBeats);
    t.setBeatsPerBar(c.beatsPerBar);
    t.setTempo(this.tempo);
    t.setSwing(0);
    // Other players leave these as you set them there; here every chord sounds, with no click.
    t.setMetronome(false, 0);
    t.setMuted('rh', false);
    t.setMuted('lh', false);
    this.applyLoop();
    this.offEnd = t.onEnd(() => this.stop());
    t.play(0, { countInBars: 0 });
    this.set({ playing: true, bar: 0 });
    const frame = () => {
      this.renderFrame();
      if (this.snap.playing) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Stop, and put out the lights it lit. Does nothing when already stopped. */
  stop(): void {
    if (!this.snap.playing) return;
    cancelAnimationFrame(this.raf);
    this.offEnd?.();
    this.offEnd = null;
    const t = this.s.transport;
    if (t.state !== 'stopped') t.stop();
    this.s.lights.clear('lh');
    this.set({ playing: false, bar: null });
  }

  detach(): void {
    this.stop();
    this.listeners.clear();
  }

  /** One visual frame while playing: the sounding notes and the bar. Public for tests. */
  renderFrame(): void {
    const c = this.compiled;
    const t = this.s.transport;
    if (!this.snap.playing) return;
    if (!c || t.state !== 'playing') return this.stop();
    const beat = t.beatAt(this.s.audio.now() - this.s.audio.outputLatency());
    if (beat < 0) return;
    this.s.lights.setExactly(
      'lh',
      activeEventMidis(c.events, 'lh', beat, (b) => t.performanceBeat(b)),
    );
    this.set({ bar: barAt(c, beat) });
  }
}
