import type { AudioStatus } from '@/core/audio';
import type { MidiSnapshot } from '@/core/input';

/** How long a notice that marks a moment stays: the piano landing, a MIDI keyboard coming or going. */
export const NOTICE_MS = { ready: 4000, midi: 6000 } as const;

/** What the sound is doing, in a sentence, or nothing while there is nothing to say. */
export function audioNotice(status: AudioStatus, online: boolean): string {
  switch (status) {
    case 'starting':
      return 'Starting the sound.';
    case 'synth':
      return 'Loading the piano, a simple synth plays for now.';
    case 'ready':
      return 'Piano ready.';
    case 'error':
      return online
        ? "The piano couldn't load, so a simple synth plays."
        : "Offline and the piano isn't saved yet, so a simple synth plays.";
    default:
      return '';
  }
}

/**
 * A MIDI keyboard that came or went between two snapshots, in a sentence, or
 * null. The first listing after Connect MIDI is not an event: the input label
 * already names the keyboard.
 */
export function midiNotice(
  before: MidiSnapshot,
  after: MidiSnapshot,
  touchOnly: boolean,
): string | null {
  if (before.status !== 'ready' || after.status !== 'ready') return null;
  const was = new Set(before.devices.map((d) => d.id));
  const added = after.devices.find((d) => !was.has(d.id));
  if (added) return `MIDI keyboard connected: ${added.name}.`;
  const now = new Set(after.devices.map((d) => d.id));
  const gone = before.devices.find((d) => !now.has(d.id));
  if (gone)
    return `MIDI keyboard disconnected. ${touchOnly ? 'Tap the keys' : 'Use the computer keys'}, or plug it back in.`;
  return null;
}
