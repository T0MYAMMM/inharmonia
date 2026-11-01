import { useSyncExternalStore } from 'react';
import { LIBRARY_LIMITS } from '@config/library';
import { CATALOGUE_FILE, parseIndex, type CatalogueEntry } from '@/core/library/catalogue';

/**
 * The song catalogue's index, fetched from next to the app when a page that
 * lists or offers catalogue songs first asks for it (never from Home), and
 * the one fetch every catalogue file goes through: same origin, a size cap,
 * and every failure named for plain copy.
 */

/** Why something from the catalogue didn't arrive or wasn't kept. */
export type LibraryProblem =
  | 'offline'
  | 'network'
  | 'http'
  | 'address'
  | 'too-large'
  | 'changed'
  | 'unreadable'
  | 'quota'
  | 'unavailable';

export class LibraryError extends Error {
  constructor(readonly problem: LibraryProblem) {
    super(problem);
    this.name = 'LibraryError';
  }
}

/** What the reader is told about each problem: what happened, and what to do. */
export const LIBRARY_MESSAGES: Record<LibraryProblem, string> = {
  offline: "You're offline. Downloads need a connection.",
  network: "Inharmonia couldn't be reached. Check your connection, then try again.",
  http: "The song couldn't be fetched just now. Try again in a little while.",
  address: "This song's address isn't one Inharmonia downloads from, so nothing was fetched.",
  'too-large': 'This song is larger than a catalogue song may be, so nothing was saved.',
  changed: 'This song is being updated. Try again in a few minutes.',
  unreadable: "This song's file couldn't be read, so nothing was saved.",
  quota: 'Not enough room on this device. Remove a song you no longer play, then try again.',
  unavailable:
    'This browser is not letting Inharmonia store songs (site data may be blocked, or this is a private window).',
};

/** The problem behind any error from the catalogue, for its message. */
export const problemOf = (e: unknown): LibraryProblem =>
  e instanceof LibraryError ? e.problem : 'unreadable';

/**
 * The address of a file in the catalogue folder: a plain file name, and the
 * same origin as the app, or it is refused before anything is fetched.
 */
export function libraryUrl(
  file: string,
  base: string = import.meta.env.BASE_URL,
  here: string = location.href,
): URL {
  if (!CATALOGUE_FILE.test(file)) throw new LibraryError('address');
  const url = new URL(`${base}library/${file}`, here);
  if (url.origin !== new URL(here).origin) throw new LibraryError('address');
  return url;
}

/** A catalogue file's bytes, if it arrives whole from the same origin and within `max`. */
export async function fetchLibraryFile(
  url: URL,
  max: number,
  cache: RequestCache,
): Promise<Uint8Array<ArrayBuffer>> {
  let res: Response;
  try {
    res = await fetch(url, { cache, credentials: 'same-origin' });
  } catch {
    throw new LibraryError(navigator.onLine === false ? 'offline' : 'network');
  }
  if (res.url && new URL(res.url).origin !== url.origin) throw new LibraryError('address');
  if (!res.ok) throw new LibraryError('http');
  if (Number(res.headers.get('content-length')) > max) throw new LibraryError('too-large');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    throw new LibraryError(navigator.onLine === false ? 'offline' : 'network');
  }
  if (bytes.length > max) throw new LibraryError('too-large');
  return bytes;
}

/** Fetch and read the catalogue's index. */
export async function fetchCatalogue(cache: RequestCache = 'no-cache'): Promise<CatalogueEntry[]> {
  const bytes = await fetchLibraryFile(libraryUrl('index.json'), LIBRARY_LIMITS.indexBytes, cache);
  const entries = parseIndex(new TextDecoder().decode(bytes));
  if (!entries) throw new LibraryError('unreadable');
  return entries;
}

export interface CatalogueState {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  /** By title, as the index lists them. */
  entries: readonly CatalogueEntry[];
  problem: LibraryProblem | null;
}

const IDLE: CatalogueState = { status: 'idle', entries: [], problem: null };
let state: CatalogueState = IDLE;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: CatalogueState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Load the index, once per visit; again only after it failed. */
export function loadCatalogue(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve();
  loading ??= (async () => {
    set({ ...state, status: 'loading', problem: null });
    try {
      set({ status: 'ready', entries: await fetchCatalogue(), problem: null });
    } catch (e) {
      set({ status: 'failed', entries: [], problem: problemOf(e) });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export const catalogue = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    if (state.status === 'idle') void loadCatalogue();
    return () => listeners.delete(l);
  },
  get snapshot(): CatalogueState {
    return state;
  },
};

/** The catalogue for React; fetches the index the first time a page asks. */
export function useCatalogue(): CatalogueState {
  return useSyncExternalStore(catalogue.subscribe, () => catalogue.snapshot);
}

/** Tests: forget the index. */
export function resetCatalogueForTests(): void {
  state = IDLE;
  loading = null;
}
