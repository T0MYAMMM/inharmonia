import { useState } from 'react';
import {
  chordsToProgression,
  sequenceChart,
  sequenceKey,
  suggestKeys,
  type ChordSequence,
  type Key,
  type NumeralsDraft,
} from '@/core/charts';
import { MAJOR_KEYS, MINOR_KEYS } from '@/core/content/realize';
import { keyName, prettyAccidentals, prettyNumeral } from '@/core/notation';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Select } from '@/ui/Select';
import { SendDialog } from '../sendTo/SendDialog';
import dialog from '../sendTo/sendTo.module.css';

const KEYS: Key[] = [
  ...MAJOR_KEYS.map((tonic) => ({ tonic, mode: 'major' as const })),
  ...MINOR_KEYS.map((tonic) => ({ tonic, mode: 'minor' as const })),
];
const keyId = (k: Key) => `${k.tonic} ${k.mode}`;
const keyWords = (k: Key) => prettyAccidentals(keyName(k));

/** "I vi IV,V ii7", as the builder will show it, accidentals as signs. */
const prettyText = (text: string) =>
  text
    .split(' ')
    .map((word) => word.split(',').map(prettyNumeral).join(','))
    .join(' ');

/**
 * Before the sequence goes to the progression builder: the key its chords
 * are read in, the one they suggest to start with, the numerals they make
 * in it, and what does not come across.
 */
export function ToProgression({
  seq,
  open,
  onClose,
  onSend,
}: {
  seq: ChordSequence;
  open: boolean;
  onClose: () => void;
  onSend: (key: Key, draft: NumeralsDraft) => void;
}) {
  const [chosen, setChosen] = useState<Key | null>(null);
  const suggested = sequenceKey(seq.bars) ?? { tonic: 'C', mode: 'major' };
  const key = chosen ?? suggested;
  const draft = open ? chordsToProgression(seq.bars, seq.meter.beats, key) : null;
  const top = open ? suggestKeys(sequenceChart(seq).sections).slice(0, 2) : [];
  const close = () => {
    setChosen(null);
    onClose();
  };
  return (
    <SendDialog open={open} title="Send to Progressions" onClose={close} testId="send-progression">
      <p className={dialog.note}>
        A progression names each chord by its place in a key, as a Roman numeral. Read the chords
        in:
      </p>
      <Field label="Key">
        <Select
          value={keyId(key)}
          onChange={(e) => setChosen(KEYS.find((k) => keyId(k) === e.target.value) ?? null)}
          data-testid="send-key"
        >
          {KEYS.map((k) => (
            <option key={keyId(k)} value={keyId(k)}>
              {keyWords(k)}
              {keyId(k) === keyId(suggested) ? ' (suggested)' : ''}
            </option>
          ))}
        </Select>
      </Field>
      {top.length > 1 ? (
        <div className={dialog.row} role="group" aria-label="Keys the chords suggest">
          <span className={dialog.note}>The chords suggest</span>
          {top.map((k) => (
            <Button
              key={keyId(k)}
              size="small"
              variant={keyId(k) === keyId(key) ? 'secondary' : 'ghost'}
              aria-pressed={keyId(k) === keyId(key)}
              onClick={() => setChosen({ tonic: k.tonic, mode: k.mode })}
            >
              {keyWords(k)}
            </Button>
          ))}
        </div>
      ) : null}
      {draft?.text ? (
        <p className={dialog.numerals} data-testid="send-numerals">
          {prettyText(draft.text)}
        </p>
      ) : (
        <p className={dialog.problem}>There are no chords to write as numerals.</p>
      )}
      {draft?.notes.length ? (
        <ul className={dialog.notes} data-testid="send-notes">
          {draft.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div className={dialog.actions}>
        <Button
          variant="primary"
          disabled={!draft?.text}
          onClick={() => draft && onSend(key, draft)}
          data-testid="send-open"
        >
          Open in the builder
        </Button>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </SendDialog>
  );
}
