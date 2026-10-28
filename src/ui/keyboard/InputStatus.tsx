import { connectMidi } from '@/app/services';
import { useActiveInput, useMidiState } from '@/app/hooks';
import { inputLabel } from '@/core/input';
import styles from './KeyboardDock.module.css';

/**
 * The dock's input line, the same on every page: which way of playing is in
 * use, and the way to connect a MIDI keyboard where the browser has Web MIDI.
 */
export function InputStatus() {
  const input = useActiveInput();
  const m = useMidiState();
  return (
    <span className={styles.inputLine}>
      <span className={styles.input} data-testid="input-status">
        <span className={styles.inputDot} data-on={input.kind === 'midi' || undefined} />
        {inputLabel(input)}
      </span>
      {m.status === 'idle' || m.status === 'requesting' ? (
        <button
          type="button"
          className={styles.midiButton}
          onClick={() => void connectMidi()}
          disabled={m.status === 'requesting'}
        >
          Connect MIDI
        </button>
      ) : m.status === 'denied' ? (
        <span>MIDI blocked in site settings</span>
      ) : null}
    </span>
  );
}
