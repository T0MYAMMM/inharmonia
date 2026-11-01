import { cleanHandoff, HANDOFF_VERSION, type Handoff, type HandoffKind } from '@/core/handoff';
import {
  readVersioned,
  sessionStore,
  writeVersioned,
  type KeyValueStore,
} from '@/core/persistence/storage';

/**
 * Handoffs between rooms, kept for this tab in session storage, one for each
 * kind of landing page, and named in the landing page's address by an id:
 * "/studio?sent=k3x9q". A reload opens the same thing again: the address
 * keeps its id, and session storage outlives a reload, even through GitHub
 * Pages' 404 page, which loses history state. An address without an id is
 * the page as usual; one whose handoff has since been replaced by a newer
 * one says so. Nothing of what was sent is ever in the address.
 */
const keyOf = (kind: HandoffKind) => `handoff:${kind}`;

interface Slot {
  id: string;
  /** Applied already: what was sent stays for the way back, and is not applied again. */
  used: boolean;
  handoff: unknown;
}

const isSlot = (x: unknown): x is Slot =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as Slot).id === 'string' &&
  typeof (x as Slot).used === 'boolean';

const newId = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

/** Keep a handoff for the page it goes to, replacing the last of its kind; returns its id. */
export function leave(handoff: Handoff, store: KeyValueStore = sessionStore): string {
  const id = newId();
  writeVersioned<Slot>(store, keyOf(handoff.kind), HANDOFF_VERSION, { id, used: false, handoff });
  return id;
}

export type Arrival<K extends HandoffKind> =
  | { status: 'none' }
  | { status: 'ok'; handoff: Extract<Handoff, { kind: K }>; used: boolean }
  /** Replaced by a newer one, or this tab never had it. */
  | { status: 'gone' }
  /** There, but not something this version can read. */
  | { status: 'unreadable' };

/** The handoff an address names, checked; `none` when it names none. */
export function arrive<K extends HandoffKind>(
  kind: K,
  id: string | null,
  store: KeyValueStore = sessionStore,
): Arrival<K> {
  if (!id) return { status: 'none' };
  const slot = readVersioned<Slot | null>(store, keyOf(kind), {
    version: HANDOFF_VERSION,
    fallback: null,
    validate: (x): x is Slot | null => x === null || isSlot(x),
  });
  if (!slot || slot.id !== id) return { status: 'gone' };
  const handoff = cleanHandoff(slot.handoff, kind);
  return handoff
    ? { status: 'ok', handoff: handoff as Extract<Handoff, { kind: K }>, used: slot.used }
    : { status: 'unreadable' };
}

/** Mark a handoff applied, so a reload keeps the way back and does not apply it again. */
export function markUsed(kind: HandoffKind, id: string, store: KeyValueStore = sessionStore) {
  const raw = store.get(keyOf(kind));
  if (!raw) return;
  try {
    const doc = JSON.parse(raw) as { version: number; state: Slot };
    if (!isSlot(doc.state) || doc.state.id !== id || doc.state.used) return;
    writeVersioned<Slot>(store, keyOf(kind), doc.version, { ...doc.state, used: true });
  } catch {
    /* nothing to mark */
  }
}
