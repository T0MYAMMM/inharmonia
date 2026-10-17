import { useSyncExternalStore } from 'react';
import { chordId, dayOf, isKnownEntry, withPlay, type KnownEntry } from '@/core/charts';
import {
  readVersioned,
  storage,
  writeVersioned,
  type KeyValueStore,
} from '@/core/persistence/storage';

/** The chords you can already play, kept on this device. */
export interface KnownChordsState {
  /** By chord id (`chordId`): one entry per chord shape, whatever its spelling. */
  chords: Record<string, KnownEntry>;
}

const KEY = 'known-chords';
const VERSION = 1;
const EMPTY: KnownChordsState = { chords: {} };

const isEntry = (x: unknown): x is KnownEntry =>
  typeof x === 'object' &&
  x !== null &&
  Array.isArray((x as KnownEntry).plays) &&
  (x as KnownEntry).plays.every((d) => typeof d === 'string') &&
  ((x as KnownEntry).manual === undefined || typeof (x as KnownEntry).manual === 'boolean');

const isState = (x: unknown): x is KnownChordsState =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as KnownChordsState).chords === 'object' &&
  (x as KnownChordsState).chords !== null &&
  Object.values((x as KnownChordsState).chords).every(isEntry);

let store: KeyValueStore = storage;
let state: KnownChordsState | null = null;
const listeners = new Set<() => void>();

function current(): KnownChordsState {
  state ??= readVersioned(store, KEY, { version: VERSION, fallback: EMPTY, validate: isState });
  return state;
}

function commit(next: KnownChordsState): void {
  state = next;
  writeVersioned(store, KEY, VERSION, next);
  for (const l of listeners) l();
}

function update(symbol: string, fn: (e: KnownEntry | undefined) => KnownEntry | null): void {
  const id = chordId(symbol);
  if (!id) return;
  const chords = { ...current().chords };
  const next = fn(chords[id]);
  if (next) chords[id] = next;
  else delete chords[id];
  commit({ chords });
}

/** Is this chord (any spelling, slash bass ignored) one you can play? */
export function isKnownChord(symbol: string, s: KnownChordsState = current()): boolean {
  const id = chordId(symbol);
  return id ? isKnownEntry(s.chords[id]) : false;
}

export function knownEntry(symbol: string): KnownEntry | undefined {
  const id = chordId(symbol);
  return id ? current().chords[id] : undefined;
}

/** Mark a chord by hand (true or false), or clear the mark (undefined) so plays decide again. */
export function setKnown(symbol: string, manual: boolean | undefined): void {
  update(symbol, (e) => {
    const plays = e?.plays ?? [];
    if (manual === undefined) return plays.length ? { plays } : null;
    return { manual, plays };
  });
}

/** A clean play (no wrong notes, no help) from a drill or the "play it" check. */
export function recordCleanPlay(symbol: string, now: Date = new Date()): void {
  update(symbol, (e) => withPlay(e, dayOf(now)));
}

export function knownChordsState(): KnownChordsState {
  return current();
}

export function subscribeKnownChords(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The profile, re-rendering when it changes. */
export function useKnownChords(): KnownChordsState {
  return useSyncExternalStore(subscribeKnownChords, current);
}

/** Tests: start over with a given store. */
export function resetKnownChordsForTests(s: KeyValueStore): void {
  store = s;
  state = null;
}
