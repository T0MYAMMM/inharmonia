import {
  cleanSequence,
  EMPTY_SEQUENCE,
  SEQUENCE_VERSION,
  type ChordSequence,
  type SequenceBars,
} from '@/core/charts';
import {
  readVersioned,
  storage,
  writeVersioned,
  type KeyValueStore,
} from '@/core/persistence/storage';

/**
 * The chord sequence on the Chords page, kept on this device: one working
 * sequence, its settings included. Undo history and the bar you chose are
 * for the visit only.
 */
const KEY = 'chord-sequence';

/** The saved sequence, cleaned; empty when there is none or it cannot be read. */
export function loadSequence(store: KeyValueStore = storage): ChordSequence {
  const raw = readVersioned<unknown>(store, KEY, {
    version: SEQUENCE_VERSION,
    fallback: null,
    validate: (x): x is unknown => x !== null,
  });
  return cleanSequence(raw) ?? EMPTY_SEQUENCE;
}

export function saveSequence(seq: ChordSequence, store: KeyValueStore = storage): void {
  writeVersioned(store, KEY, SEQUENCE_VERSION, seq);
}

/**
 * The sequence that chords sent from another page took the place of, kept
 * on this device until it is brought back, put aside, or another one takes
 * its place: one, and only its chords and meter.
 */
const BACKUP_KEY = 'chord-sequence-before';

/** The sequence last replaced, cleaned; null when there is none, or none with bars. */
export function loadBackup(store: KeyValueStore = storage): SequenceBars | null {
  const raw = readVersioned<unknown>(store, BACKUP_KEY, {
    version: SEQUENCE_VERSION,
    fallback: null,
    validate: (x): x is unknown => x !== null,
  });
  const seq = cleanSequence(raw);
  return seq?.bars.length ? { meter: seq.meter, bars: seq.bars } : null;
}

export function saveBackup(seq: SequenceBars, store: KeyValueStore = storage): void {
  writeVersioned<SequenceBars>(store, BACKUP_KEY, SEQUENCE_VERSION, {
    meter: seq.meter,
    bars: seq.bars,
  });
}

export function clearBackup(store: KeyValueStore = storage): void {
  store.remove(BACKUP_KEY);
}
