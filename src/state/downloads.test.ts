import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexEntry, stringifyIndex, type CatalogueEntry } from '@/core/library/catalogue';
import { parsePiece, pieceFile, generatePiece } from '@/core/library';
import {
  catalogue,
  fetchCatalogue,
  LIBRARY_MESSAGES,
  libraryUrl,
  loadCatalogue,
  resetCatalogueForTests,
  type LibraryProblem,
} from './catalogue';
import { downloadPiece, findDownloaded, resetReadingForTests, songsOf } from './download';
import {
  downloads,
  hasUpdate,
  refreshDownloads,
  removePiece,
  resetDownloadsForTests,
} from './downloads';

// An invented piece, by an invented composer, written for these tests.
const SOURCE = (tempo = 90) => `title: Harbour Tune
piece: harbour-tune
added: 2026-01-02
source: original
author: Ayu Lestari
key: G major
meter: 4/4
tempo: ${tempo}
summary: An invented tune for the tests.
figure: arpeggio-8ths
[A] main 1-2
melody: | G4h B4h | D5w |
chords: | G | D |
`;

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

/** A piece's file and its index entry, as `npm run songs` would publish them. */
function published(tempo = 90): { text: string; entry: CatalogueEntry } {
  const src = parsePiece(SOURCE(tempo));
  const text = pieceFile(src);
  const songs = Object.values(generatePiece(src).versions);
  return {
    text,
    entry: indexEntry({ piece: 'harbour-tune', bytes: bytes(text), sha256: sha(text), songs }),
  };
}

type Reply =
  string | { status?: number; body?: string; headers?: Record<string, string>; url?: string };

/** fetch, answering each request in turn; a function throws, as fetch does offline. */
function serve(...replies: (Reply | (() => never))[]) {
  const fetch = vi.fn(async (_url: URL, _init?: RequestInit) => {
    const next = replies.shift();
    if (next === undefined) throw new Error('unexpected fetch');
    if (typeof next === 'function') return next();
    const r = typeof next === 'string' ? { body: next } : next;
    const res = new Response(r.body ?? '', { status: r.status ?? 200, headers: r.headers });
    if (r.url) Object.defineProperty(res, 'url', { value: r.url });
    return res;
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const offline = () => {
  throw new TypeError('Failed to fetch');
};

async function problem(p: Promise<unknown>): Promise<LibraryProblem | 'none'> {
  try {
    await p;
    return 'none';
  } catch (e) {
    return (e as { problem: LibraryProblem }).problem;
  }
}

const stored = async () => {
  await refreshDownloads();
  return downloads.snapshot.pieces;
};

beforeEach(() => {
  resetDownloadsForTests();
  resetReadingForTests();
  resetCatalogueForTests();
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('downloading a catalogue song', () => {
  it('fetches the file from next to the app, checks it, and keeps it with its entry', async () => {
    const { text, entry } = published();
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });
    const fetch = serve(text);
    await downloadPiece(entry, new Date('2026-11-01T10:00:00Z'));

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      `${location.origin}${import.meta.env.BASE_URL}library/harbour-tune.json`,
    );
    expect(init).toMatchObject({ cache: 'no-cache', credentials: 'same-origin' });
    const pieces = downloads.snapshot.pieces;
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({
      piece: 'harbour-tune',
      sha256: entry.sha256,
      schema: 1,
      downloadedAt: Date.parse('2026-11-01T10:00:00Z'),
      entry,
      text,
    });
    expect(persist).toHaveBeenCalled();
    expect(songsOf(pieces[0]!).map((s) => s.id)).toEqual([
      'harbour-tune-easy',
      'harbour-tune-medium',
      'harbour-tune-advanced',
    ]);
    const found = findDownloaded(pieces, 'harbour-tune-medium')!;
    expect(found.song).toMatchObject({ title: 'Harbour Tune', level: 'medium' });
    expect(found.kept.piece).toBe('harbour-tune');
    expect(findDownloaded(pieces, 'harbour-tune-hard')).toBeUndefined();
    // Kept across a reload of the app.
    resetDownloadsForTests();
    expect((await stored()).map((p) => p.piece)).toEqual(['harbour-tune']);
  });

  it('refuses an address that is not a plain file name on this origin, before fetching', async () => {
    const fetch = serve();
    const { entry } = published();
    expect(await problem(downloadPiece({ ...entry, file: '../secret.json' }))).toBe('address');
    expect(
      await problem(downloadPiece({ ...entry, file: 'https://elsewhere.example/a.json' })),
    ).toBe('address');
    expect(fetch).not.toHaveBeenCalled();
    expect(() => libraryUrl('a.json', 'https://elsewhere.example/', location.href)).toThrow();
    expect(() => libraryUrl('a.json', '//elsewhere.example/', location.href)).toThrow();
    expect(
      String(libraryUrl('a.json', '/inharmonia/', 'https://me.example/inharmonia/songs')),
    ).toBe('https://me.example/inharmonia/library/a.json');
  });

  it('refuses a reply from another origin', async () => {
    const { text, entry } = published();
    serve({ body: text, url: 'https://elsewhere.example/library/harbour-tune.json' });
    expect(await problem(downloadPiece(entry))).toBe('address');
    expect(await stored()).toEqual([]);
  });

  it('refuses a file over the cap, by its header or by what arrived', async () => {
    const { entry } = published();
    serve({ body: 'x', headers: { 'content-length': '600000' } });
    expect(await problem(downloadPiece(entry))).toBe('too-large');
    serve('x'.repeat(512_001));
    expect(await problem(downloadPiece(entry))).toBe('too-large');
    expect(await stored()).toEqual([]);
  });

  it('asks again past every cache once when the hash differs, and keeps a match', async () => {
    const { text, entry } = published();
    const fetch = serve(published(100).text, text);
    await downloadPiece(entry);
    expect(fetch.mock.calls.map(([, init]) => init?.cache)).toEqual(['no-cache', 'reload']);
    expect((await stored()).map((p) => p.sha256)).toEqual([entry.sha256]);
  });

  it('says the song is being updated when the hash still differs, and keeps nothing', async () => {
    const { entry } = published();
    serve(published(100).text, published(110).text);
    expect(await problem(downloadPiece(entry))).toBe('changed');
    expect(await stored()).toEqual([]);
  });

  it('names a failed request, offline or not', async () => {
    const { entry } = published();
    serve({ status: 404 });
    expect(await problem(downloadPiece(entry))).toBe('http');
    serve({ status: 500 });
    expect(await problem(downloadPiece(entry))).toBe('http');
    serve(offline);
    expect(await problem(downloadPiece(entry))).toBe('network');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    serve(offline);
    expect(await problem(downloadPiece(entry))).toBe('offline');
    expect(await stored()).toEqual([]);
  });

  it('keeps nothing the reader or the catalogue rules refuse, even when the hash matches', async () => {
    const broken = 'not a song file';
    serve(broken);
    const entry = published().entry;
    expect(
      await problem(downloadPiece({ ...entry, bytes: bytes(broken), sha256: sha(broken) })),
    ).toBe('unreadable');
    // A readable file that names another piece than the index says.
    const { text } = published();
    serve(text);
    expect(
      await problem(
        downloadPiece({
          ...entry,
          piece: 'other-tune',
          file: 'other-tune.json',
          sha256: sha(text),
        }),
      ),
    ).toBe('unreadable');
    expect(await stored()).toEqual([]);
  });

  it('says when the device is full, and when storage is blocked', async () => {
    const { text, entry } = published();
    await refreshDownloads();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    serve(text);
    expect(await problem(downloadPiece(entry))).toBe('quota');
    vi.restoreAllMocks();
    expect(await stored()).toEqual([]);

    resetDownloadsForTests();
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    serve(text);
    expect(await problem(downloadPiece(entry))).toBe('unavailable');
    expect(downloads.snapshot.status).toBe('unavailable');
  });

  it('updates when the index has a new file, and removes a piece', async () => {
    const old = published();
    serve(old.text);
    await downloadPiece(old.entry);
    const kept = (await stored())[0]!;
    const next = published(100);
    expect(hasUpdate(kept, old.entry)).toBe(false);
    expect(hasUpdate(kept, next.entry)).toBe(true);
    expect(hasUpdate(kept, undefined)).toBe(false);

    serve(next.text);
    await downloadPiece(next.entry);
    const pieces = await stored();
    expect(pieces.map((p) => p.sha256)).toEqual([next.entry.sha256]);
    expect(songsOf(pieces[0]!).at(-1)!.tempo.default).toBe(100);

    await removePiece('harbour-tune');
    expect(downloads.snapshot.pieces).toEqual([]);
  });
});

describe('the catalogue index', () => {
  it('is fetched from next to the app and read entry by entry', async () => {
    const { entry } = published();
    const fetch = serve(stringifyIndex([entry]));
    expect(await fetchCatalogue()).toEqual([entry]);
    expect(String(fetch.mock.calls[0]![0])).toBe(
      `${location.origin}${import.meta.env.BASE_URL}library/index.json`,
    );
    serve('{"not":"an index"}');
    expect(await problem(fetchCatalogue())).toBe('unreadable');
  });

  it('loads once for the pages that ask, and says why it failed', async () => {
    const { entry } = published();
    serve(offline);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const stop = catalogue.subscribe(() => {});
    await loadCatalogue();
    expect(catalogue.snapshot).toMatchObject({ status: 'failed', problem: 'offline', entries: [] });
    vi.restoreAllMocks();
    const fetch = serve(stringifyIndex([entry]));
    await loadCatalogue();
    expect(catalogue.snapshot).toMatchObject({ status: 'ready', entries: [entry], problem: null });
    await loadCatalogue();
    expect(fetch).toHaveBeenCalledTimes(1);
    stop();
  });

  it('has plain words for every problem', () => {
    for (const [p, words] of Object.entries(LIBRARY_MESSAGES)) {
      expect(words, p).toMatch(/^[A-Z].*\.$/);
      expect(words, p).not.toMatch(/error|exception|IndexedDB|sha|hash/i);
    }
  });
});
