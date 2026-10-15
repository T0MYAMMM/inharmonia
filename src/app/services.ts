import { AudioEngine } from '@/core/audio/engine';
import { Transport, WorkerTicker } from '@/core/audio';
import { ComputerKeys, NoteStream, WebMidiInput } from '@/core/input';
import { KeyLights, PRESS_FLASH_MS } from '@/state/keyLights';
import { useSettings } from '@/state/settings';

/**
 * App-wide singletons. Everything here is plain TypeScript; React components
 * reach them through hooks in `app/hooks.ts`.
 */
export const audio = new AudioEngine(import.meta.env.BASE_URL);
export const notes = new NoteStream();
export const lights = new KeyLights();
export const midi = new WebMidiInput(notes);
export const keys = new ComputerKeys(notes);

let transport: Transport | null = null;

/** The shared transport, created on first use. */
export function getTransport(): Transport {
  transport ??= new Transport({
    clock: audio.clock(),
    ticker: new WorkerTicker(),
    sink: audio.sink(),
  });
  return transport;
}

// ---- input → sound and lights -----------------------------------------------

const sustained = new Set<number>();
let sustainDown = false;

notes.subscribe((e) => {
  if (e.type === 'on') {
    void audio.unlock();
    sustained.delete(e.midi);
    audio.noteOn(e.midi, e.velocity);
    lights.set(e.midi, 'held', true);
    lights.flash(e.midi, 'press', PRESS_FLASH_MS);
  } else {
    lights.set(e.midi, 'held', false);
    if (sustainDown) sustained.add(e.midi);
    else audio.noteOff(e.midi);
  }
});

midi.subscribe((s) => {
  if (s.sustain === sustainDown) return;
  sustainDown = s.sustain;
  if (!sustainDown) {
    for (const m of sustained) if (!notes.isHeld(m)) audio.noteOff(m);
    sustained.clear();
  }
});

/** Connect MIDI from a user action and remember it, so it reconnects on the next visit. */
export async function connectMidi(): Promise<void> {
  await midi.enable();
  if (midi.state.status === 'ready') {
    const { midiInput, set } = useSettings.getState();
    set({ midiEnabled: true });
    if (midiInput !== 'all') midi.select(midiInput);
  }
}

/** Reconnect MIDI on load if the player connected it before (no prompt once permission is granted). */
export function installMidiAutoConnect(): void {
  if (useSettings.getState().midiEnabled) void connectMidi();
}

/** Start audio on the first gesture anywhere, so the first note is not lost to loading. */
export function installAudioUnlock(target: Window = window): () => void {
  const unlock = () => {
    void audio.unlock();
    target.removeEventListener('pointerdown', unlock, true);
    target.removeEventListener('keydown', unlock, true);
  };
  target.addEventListener('pointerdown', unlock, true);
  target.addEventListener('keydown', unlock, true);
  return unlock;
}
