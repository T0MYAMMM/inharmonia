import { cleanSequence, EMPTY_SEQUENCE, SEQUENCE_VERSION, type ChordSequence } from '@/core/charts';
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
