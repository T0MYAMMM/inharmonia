export type InputSource = 'pointer' | 'keys' | 'midi' | 'auto';

export interface NoteInputEvent {
  type: 'on' | 'off';
  midi: number;
  /** 0..1 */
  velocity: number;
  source: InputSource;
  /** performance.now() when the event happened. */
  at: number;
}

type Listener = (e: NoteInputEvent) => void;

/**
 * One stream for every way of playing a note: pointer, computer keys and MIDI.
 * Tracks which notes are held, counting per source so that holding the same
 * note on two devices and releasing one keeps it held.
 */
export class NoteStream {
  private listeners = new Set<Listener>();
  private holds = new Map<number, Map<InputSource, number>>();
  private pressedAt = new Map<number, number>();

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  noteOn(midi: number, velocity: number, source: InputSource, at = performance.now()): void {
    const bySource = this.holds.get(midi) ?? new Map<InputSource, number>();
    const wasHeld = this.holds.has(midi);
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    this.holds.set(midi, bySource);
    if (wasHeld) return; // already sounding from another source
    this.pressedAt.set(midi, at);
    this.emit({ type: 'on', midi, velocity, source, at });
  }

  noteOff(midi: number, source: InputSource, at = performance.now()): void {
    const bySource = this.holds.get(midi);
    const count = bySource?.get(source);
    if (!bySource || !count) return;
    if (count > 1) bySource.set(source, count - 1);
    else bySource.delete(source);
    if (bySource.size > 0) return;
    this.holds.delete(midi);
    this.pressedAt.delete(midi);
    this.emit({ type: 'off', midi, velocity: 0, source, at });
  }

  /** Release everything held by one source (blur, device unplugged) or all sources. */
  releaseAll(source?: InputSource): void {
    for (const [midi, bySource] of [...this.holds]) {
      for (const s of [...bySource.keys()]) {
        if (source && s !== source) continue;
        bySource.set(s, 1);
        this.noteOff(midi, s);
      }
    }
  }

  isHeld(midi: number): boolean {
    return this.holds.has(midi);
  }

  /** Held notes, lowest first. */
  held(): number[] {
    return [...this.holds.keys()].sort((a, b) => a - b);
  }

  /** Held notes with the time each was pressed. */
  heldWithTimes(): { midi: number; at: number }[] {
    return this.held().map((midi) => ({ midi, at: this.pressedAt.get(midi) ?? 0 }));
  }

  private emit(e: NoteInputEvent): void {
    for (const l of this.listeners) l(e);
  }
}
