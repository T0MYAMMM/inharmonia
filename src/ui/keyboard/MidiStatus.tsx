import { connectMidi } from '@/app/services';
import { useMidiState } from '@/app/hooks';
import styles from './KeyboardDock.module.css';

/** Compact MIDI status for the dock: connect, or show the device in use. Hidden without Web MIDI. */
export function MidiStatus() {
  const m = useMidiState();
  if (m.status === 'unsupported') return null;
  if (m.status === 'idle' || m.status === 'requesting') {
    return (
      <button
        type="button"
        className={styles.midiButton}
        onClick={() => void connectMidi()}
        disabled={m.status === 'requesting'}
      >
        Connect MIDI
      </button>
    );
  }
  if (m.status === 'denied')
    return <span className={styles.midi}>MIDI blocked in site settings</span>;
  const device =
    m.selected === 'all'
      ? m.devices.length === 1
        ? m.devices[0]!.name
        : m.devices.length > 1
          ? `${m.devices.length} MIDI inputs`
          : null
      : (m.devices.find((d) => d.id === m.selected)?.name ?? null);
  return (
    <span className={styles.midi} data-testid="midi-status">
      <span className={styles.midiDot} data-on={device ? true : undefined} aria-hidden="true" />
      {device ?? 'No MIDI keyboard found'}
      {m.sustain ? ', pedal down' : ''}
    </span>
  );
}
