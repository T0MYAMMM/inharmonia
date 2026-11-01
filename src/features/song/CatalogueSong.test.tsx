import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@/core/content/types';
import { generatePiece, parsePiece, pieceFile } from '@/core/library';
import { indexEntry, stringifyIndex, type CatalogueEntry } from '@/core/library/catalogue';
import { LIBRARY_MESSAGES, resetCatalogueForTests } from '@/state/catalogue';
import { downloadPiece, resetReadingForTests } from '@/state/download';
import { resetDownloadsForTests } from '@/state/downloads';
import { OFFLINE } from './CatalogueSong';
import { SongPage } from './SongPage';

// The player itself is tested elsewhere; here it only has to appear, with Play.
vi.mock('./SongView', () => ({
  SongView: (p: { lesson: Lesson; actions?: ReactNode; notice?: ReactNode }) => (
    <>
      <h1>{p.lesson.title}</h1>
      <p data-testid="playing">{p.lesson.id}</p>
      {p.actions}
      {p.notice}
      <button type="button" data-testid="play">
        Play
      </button>
    </>
  ),
}));

// An invented piece, by an invented composer, written for these tests.
const SOURCE = (tempo: number) => `title: Harbour Tune
piece: harbour-tune
added: 2026-01-02
source: original
author: Ayu Lestari
key: Bb major
meter: 3/4
tempo: ${tempo}
summary: An invented tune for the tests.
figure: waltz
[A] main 1-2
melody: | Bb4h. | D5h. |
chords: | Bb | F |
`;

function published(tempo = 90): { text: string; entry: CatalogueEntry } {
  const src = parsePiece(SOURCE(tempo));
  const text = pieceFile(src);
  return {
    text,
    entry: indexEntry({
      piece: 'harbour-tune',
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      songs: Object.values(generatePiece(src).versions),
    }),
  };
}

/** The server: the index and the piece's file, or a status for either. */
function serve(files: Record<string, string | number | (() => never)>) {
  const fetch = vi.fn(async (url: URL) => {
    const file = files[String(url).split('/').pop()!];
    if (typeof file === 'function') return file();
    if (file === undefined || typeof file === 'number')
      return new Response('', { status: typeof file === 'number' ? file : 404 });
    return new Response(file);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function open(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/songs/${id}`]}>
      <main>
        <Routes>
          <Route path="songs/:songId" element={<SongPage />} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
}

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

describe('a song page for a catalogue song', () => {
  it('offers the download, then plays it in place with focus on Play', async () => {
    const { text, entry } = published();
    serve({ 'index.json': stringifyIndex([entry]), 'harbour-tune.json': text });
    open('harbour-tune-easy');
    expect(await screen.findByRole('heading', { name: 'Harbour Tune', level: 1 })).toBeVisible();
    expect(screen.getByTestId('song-credit')).toHaveTextContent('Original, by Ayu Lestari');
    expect(screen.getByTestId('download-offer')).toHaveTextContent(
      /not on this device yet\. Download it once \(\d+ KB, every version\)/,
    );
    const versions = screen.getByRole('navigation', { name: 'Versions' });
    expect(versions).toHaveTextContent('EasyMediumAdvanced');
    expect(screen.getByRole('link', { name: 'Easy' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('button', { name: 'Download Harbour Tune' }));
    expect(await screen.findByTestId('playing')).toHaveTextContent('harbour-tune-easy');
    await waitFor(() => expect(screen.getByTestId('play')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Harbour Tune is on this device now, and plays offline too.',
    );
    expect(screen.queryByRole('button', { name: /Update/ })).toBeNull();
  });

  it('offline, says Download waits for a connection, and offers it again when back', async () => {
    const { entry } = published();
    const fetch = serve({ 'index.json': stringifyIndex([entry]) });
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    open('harbour-tune-easy');
    const download = await screen.findByRole('button', { name: 'Download Harbour Tune' });
    expect(download).toBeDisabled();
    expect(screen.getByTestId('download-offline')).toHaveTextContent(OFFLINE);
    expect(download).toHaveAccessibleDescription(OFFLINE);

    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(download).toBeEnabled();
    expect(screen.queryByTestId('download-offline')).toBeNull();
    // Back online, it waits to be asked: nothing but the index was fetched.
    expect(fetch.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual(['index.json']);
    expect(screen.queryByTestId('playing')).toBeNull();
  });

  it('says why a download failed, keeps the offer, and stores nothing', async () => {
    const { entry } = published();
    serve({ 'index.json': stringifyIndex([entry]), 'harbour-tune.json': 500 });
    open('harbour-tune-medium');
    await userEvent.click(await screen.findByRole('button', { name: 'Download Harbour Tune' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LIBRARY_MESSAGES.http);
    expect(screen.getByRole('button', { name: 'Download Harbour Tune' })).toBeEnabled();
    expect(screen.queryByTestId('playing')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('plays a downloaded song, and offers an update when the catalogue has a new file', async () => {
    const old = published(90);
    serve({ 'harbour-tune.json': old.text });
    await act(() => downloadPiece(old.entry));
    const next = published(100);
    serve({ 'index.json': stringifyIndex([next.entry]), 'harbour-tune.json': next.text });
    open('harbour-tune-advanced');
    expect(await screen.findByTestId('playing')).toHaveTextContent('harbour-tune-advanced');
    await userEvent.click(await screen.findByRole('button', { name: 'Update Harbour Tune' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Harbour Tune is up to date.'),
    );
    expect(screen.queryByRole('button', { name: /Update/ })).toBeNull();
  });

  it('plays a downloaded song offline, and says so calmly for one that is not here', async () => {
    const { text, entry } = published();
    serve({ 'harbour-tune.json': text });
    await act(() => downloadPiece(entry));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const offline = () => {
      throw new TypeError('Failed to fetch');
    };
    serve({ 'index.json': offline });
    const page = open('harbour-tune-easy');
    expect(await screen.findByTestId('playing')).toHaveTextContent('harbour-tune-easy');
    page.unmount();

    open('another-tune-easy');
    expect(
      await screen.findByRole('heading', { name: "This song isn't on this device.", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText(new RegExp(LIBRARY_MESSAGES.offline))).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('says a retired piece is gone, and an id nowhere is not found', async () => {
    serve({ 'index.json': stringifyIndex([]) });
    const retired = open('window-light-easy');
    expect(
      screen.getByRole('heading', { name: 'This piece is no longer in Inharmonia.', level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find another in Songs' })).toHaveAttribute(
      'href',
      '/songs',
    );
    retired.unmount();
    open('no-such-song');
    expect(await screen.findByRole('heading', { name: 'Nothing here.', level: 1 })).toBeVisible();
  });
});
