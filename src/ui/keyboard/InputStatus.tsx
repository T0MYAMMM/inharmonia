import { useId, useRef, useState } from 'react';
import { connectMidi, midi } from '@/app/services';
import { useActiveInput, useMidiState, useTouchOnly } from '@/app/hooks';
import { computerKeyMap, inputLabel, OCTAVE_KEYS } from '@/core/input';
import { useSettings } from '@/state/settings';
import { Field } from '../Field';
import { Select } from '../Select';
import { useDismiss } from '../useDismiss';
import { isBlack, keyName } from './layout';
import styles from './KeyboardDock.module.css';

/**
 * The dock's input line, the same on every page: which way of playing is in
 * use, and a button that opens How to play, which says how to use each one
 * and how to switch. A touch-only device gets tap guidance, not a map of
 * computer keys it has no way to press.
 */
export function InputStatus({ octaveShift }: { octaveShift: number }) {
  const input = useActiveInput();
  const touchOnly = useTouchOnly();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  useDismiss(rootRef, open, {
    onOutside: () => setOpen(false),
    onEscape: () => {
      setOpen(false);
      buttonRef.current?.focus();
    },
  });

  return (
    <span className={styles.inputLine} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className={styles.inputButton}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((o) => !o)}
        data-testid="input-status"
      >
        <span className={styles.inputDot} data-on={input.kind === 'midi' || undefined} />
        {inputLabel(input)}
        <span className="visually-hidden">, how to play</span>
      </button>
      <div
        id={popoverId}
        className={styles.howTo}
        role="group"
        aria-label="How to play"
        hidden={!open}
        data-testid="how-to-play"
      >
        <p className={styles.howToTitle}>How to play</p>
        <section className={styles.howToPart}>
          <h3>On screen</h3>
          <p>
            {touchOnly
              ? 'Tap the keys. Swipe the keyboard sideways to reach more of them.'
              : 'Click the keys, or drag along them to run from note to note. On a touch screen, tap them.'}
          </p>
        </section>
        {touchOnly ? null : <ComputerKeysPart octaveShift={octaveShift} />}
        <MidiPart />
      </div>
    </span>
  );
}

/** The computer keys, read from computerKeys.ts: the row they sit on, and the notes they play now. */
function ComputerKeysPart({ octaveShift }: { octaveShift: number }) {
  const map = computerKeyMap(octaveShift);
  return (
    <section className={styles.howToPart}>
      <h3>Computer keys</h3>
      <ol className={styles.keyMap} aria-label="Computer keys and their notes">
        {map.map((k) => (
          <li key={k.label} data-black={isBlack(k.midi) || undefined}>
            <kbd>{k.label}</kbd>
            <span>{keyName(k.midi)}</span>
          </li>
        ))}
      </ol>
      <p>
        <kbd>{OCTAVE_KEYS.down.label}</kbd> and <kbd>{OCTAVE_KEYS.up.label}</kbd> move them down and
        up an octave.
      </p>
    </section>
  );
}

/** Connect a MIDI keyboard, pick among several, or say why there is none. */
function MidiPart() {
  const m = useMidiState();
  const set = useSettings((s) => s.set);
  let body;
  if (m.status === 'unsupported')
    body = <p>This browser can't use MIDI keyboards. Chrome and Edge can.</p>;
  else if (m.status === 'denied')
    body = <p>MIDI is blocked for this site. Allow it in the browser's site settings.</p>;
  else if (m.status !== 'ready')
    body = (
      <button
        type="button"
        className={styles.midiButton}
        onClick={() => void connectMidi()}
        disabled={m.status === 'requesting'}
      >
        Connect MIDI
      </button>
    );
  else if (m.devices.length === 0)
    body = <p>No MIDI keyboard found yet. Plug one in and it is used straight away.</p>;
  else
    body = (
      <Field label="Input">
        <Select
          size="small"
          value={m.selected}
          onChange={(e) => {
            midi.select(e.target.value);
            set({ midiInput: e.target.value });
          }}
        >
          <option value="all">All inputs</option>
          {m.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
    );
  return (
    <section className={styles.howToPart}>
      <h3>MIDI keyboard</h3>
      {body}
    </section>
  );
}
