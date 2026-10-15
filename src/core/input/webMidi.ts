import type { NoteStream } from './noteStream';

export interface MidiDevice {
  id: string;
  name: string;
}

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied';

export interface MidiSnapshot {
  status: MidiStatus;
  devices: MidiDevice[];
  /** Selected input id, or 'all'. */
  selected: string;
  sustain: boolean;
}

/** Parsed channel message, or null for anything we ignore. */
export type MidiMessage =
  | { type: 'on'; note: number; velocity: number }
  | { type: 'off'; note: number }
  | { type: 'sustain'; down: boolean };

export function parseMidiMessage(data: ArrayLike<number>): MidiMessage | null {
  const status = data[0];
  if (status === undefined) return null;
  const cmd = status & 0xf0;
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;
  if (cmd === 0x90 && d2 > 0) return { type: 'on', note: d1, velocity: d2 / 127 };
  if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) return { type: 'off', note: d1 };
  if (cmd === 0xb0 && d1 === 64) return { type: 'sustain', down: d2 >= 64 };
  return null;
}

export function isWebMidiSupported(nav: Navigator = navigator): boolean {
  return (
    typeof (nav as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess === 'function'
  );
}

type Listener = (s: MidiSnapshot) => void;

/**
 * Optional Web MIDI input. Nothing happens until `enable()` is called from a
 * user action (browsers may show a permission prompt). Hot-plugging updates the
 * device list; unplugging releases that device's notes.
 */
export class WebMidiInput {
  private access: MIDIAccess | null = null;
  private listeners = new Set<Listener>();
  private snap: MidiSnapshot;
  private bound = new Map<string, MIDIInput>();
  private heldByDevice = new Map<string, Set<number>>();
  private sustainByDevice = new Set<string>();

  constructor(private readonly stream: NoteStream) {
    this.snap = {
      status: isWebMidiSupported() ? 'idle' : 'unsupported',
      devices: [],
      selected: 'all',
      sustain: false,
    };
  }

  get state(): MidiSnapshot {
    return this.snap;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(patch: Partial<MidiSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l(this.snap);
  }

  async enable(): Promise<void> {
    if (this.snap.status === 'unsupported' || this.access) return;
    this.set({ status: 'requesting' });
    try {
      this.useAccess(await navigator.requestMIDIAccess({ sysex: false }));
    } catch {
      this.set({ status: 'denied' });
    }
  }

  select(id: string): void {
    this.set({ selected: id });
    this.refresh();
  }

  private refresh(): void {
    if (!this.access) return;
    const inputs = [...this.access.inputs.values()].filter((i) => i.state === 'connected');
    this.set({ devices: inputs.map((i) => ({ id: i.id, name: i.name ?? 'MIDI input' })) });
    const wanted = new Set(
      inputs
        .filter((i) => this.snap.selected === 'all' || i.id === this.snap.selected)
        .map((i) => i.id),
    );
    for (const [id, input] of this.bound) {
      if (!wanted.has(id)) {
        input.onmidimessage = null;
        this.bound.delete(id);
        this.releaseDevice(id);
      }
    }
    for (const input of inputs) {
      if (!wanted.has(input.id) || this.bound.has(input.id)) continue;
      input.onmidimessage = (e) => e.data && this.handle(input.id, e.data);
      this.bound.set(input.id, input);
    }
  }

  /** A device went away (unplugged, deselected): its note-offs and pedal-up will never arrive. */
  private releaseDevice(id: string) {
    for (const n of this.heldByDevice.get(id) ?? []) this.stream.noteOff(n, 'midi');
    this.heldByDevice.delete(id);
    if (this.sustainByDevice.delete(id)) this.set({ sustain: this.sustainByDevice.size > 0 });
  }

  /** Exposed for tests. */
  handle(deviceId: string, data: ArrayLike<number>): void {
    const msg = parseMidiMessage(data);
    if (!msg) return;
    const held = this.heldByDevice.get(deviceId) ?? new Set<number>();
    this.heldByDevice.set(deviceId, held);
    if (msg.type === 'on') {
      if (held.has(msg.note)) this.stream.noteOff(msg.note, 'midi');
      held.add(msg.note);
      this.stream.noteOn(msg.note, msg.velocity, 'midi');
    } else if (msg.type === 'off') {
      if (!held.delete(msg.note)) return;
      this.stream.noteOff(msg.note, 'midi');
    } else {
      if (msg.down) this.sustainByDevice.add(deviceId);
      else this.sustainByDevice.delete(deviceId);
      this.set({ sustain: this.sustainByDevice.size > 0 });
    }
  }

  /** Exposed for tests: install a MIDIAccess without the permission prompt. */
  useAccess(access: MIDIAccess): void {
    this.access = access;
    access.onstatechange = () => this.refresh();
    this.set({ status: 'ready' });
    this.refresh();
  }

  dispose(): void {
    for (const input of this.bound.values()) input.onmidimessage = null;
    for (const id of [...this.heldByDevice.keys()]) this.releaseDevice(id);
    this.bound.clear();
    if (this.access) this.access.onstatechange = null;
  }
}
