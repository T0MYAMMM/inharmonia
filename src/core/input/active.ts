import type { InputSource } from './noteStream';
import type { MidiSnapshot } from './webMidi';

/** The way of playing in use: a MIDI keyboard, the computer keys, or the keys on screen. */
export type ActiveInput =
  | { kind: 'midi'; device: string; sustain: boolean }
  | { kind: 'keys' }
  | { kind: 'screen'; touch: boolean };

/** The connected MIDI input's name, a count when there are several, or null when there is none. */
export function midiDeviceName(m: MidiSnapshot): string | null {
  if (m.status !== 'ready') return null;
  if (m.selected !== 'all') return m.devices.find((d) => d.id === m.selected)?.name ?? null;
  if (m.devices.length === 1) return m.devices[0]!.name;
  return m.devices.length > 1 ? `${m.devices.length} MIDI inputs` : null;
}

/**
 * Which input is active: the last one a note came from. Before any note, a
 * connected MIDI keyboard; otherwise the computer keys, unless the device is
 * touch only, where the keys on screen are the way to play.
 */
export function activeInput(
  last: InputSource | null,
  midi: MidiSnapshot,
  touchOnly: boolean,
): ActiveInput {
  const device = midiDeviceName(midi);
  const viaMidi = device ? { kind: 'midi' as const, device, sustain: midi.sustain } : null;
  if (last === 'midi' && viaMidi) return viaMidi;
  if (last === 'keys') return { kind: 'keys' };
  if (last === 'pointer') return { kind: 'screen', touch: touchOnly };
  if (viaMidi) return viaMidi;
  return touchOnly ? { kind: 'screen', touch: true } : { kind: 'keys' };
}

/** What the dock calls the input in use. */
export function inputLabel(input: ActiveInput): string {
  if (input.kind === 'midi') return `MIDI: ${input.device}${input.sustain ? ', pedal down' : ''}`;
  if (input.kind === 'keys') return 'Computer keys';
  return input.touch ? 'Tap the keys' : 'Click the keys';
}
