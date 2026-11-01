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

// The volume setting applies everywhere, from the first note.
audio.setVolume(useSettings.getState().volumeDb);
useSettings.subscribe((s, prev) => {
  if (s.volumeDb !== prev.volumeDb) audio.setVolume(s.volumeDb);
});

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

/**
 * The gestures that can start audio. A touch's pointerdown is not a user
 * activation (its pointerup and touchend are), so a tap is caught on the way up.
 */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'] as const;

/** Keys that move focus or only modify another key: not a reason to start audio. */
const PASSING_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape']);

/**
 * A gesture on its way somewhere else: following a link, using a nav, moving
 * focus. Leaving a room that plays shouldn't load the piano.
 */
function isPassing(e: Event): boolean {
  if (e instanceof KeyboardEvent && PASSING_KEYS.has(e.key)) return true;
  return Boolean((e.target as Element | null)?.closest?.('a[href], nav'));
}

let arms = 0;
let armedOn: Window | null = null;

function onGesture(e: Event): void {
  // Stay armed for the next gesture.
  if (isPassing(e)) return;
  void audio.unlock();
  // Keep listening until the context is running: a gesture can create it
  // without the browser letting it start.
  const ctx = audio.context();
  if (!ctx || ctx.state === 'running') disarm();
}

function disarm(): void {
  if (!armedOn) return;
  for (const type of UNLOCK_EVENTS) armedOn.removeEventListener(type, onGesture, true);
  armedOn = null;
}

/**
 * Start audio on the next gesture anywhere on the page, so the first note is
 * not lost to loading. Called by the rooms that play, from an effect: Tone and
 * the piano load only there. Returns the cleanup; the listener goes when the
 * last room that armed it closes, or once audio is running.
 */
export function armAudio(target: Window = window): () => void {
  arms++;
  if (!armedOn && audio.context()?.state !== 'running') {
    armedOn = target;
    for (const type of UNLOCK_EVENTS) target.addEventListener(type, onGesture, true);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    arms--;
    if (arms === 0) disarm();
  };
}
