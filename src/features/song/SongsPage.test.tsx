import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePiece, parsePiece, pieceFile } from '@/core/library';
import { indexEntry, stringifyIndex, type CatalogueEntry } from '@/core/library/catalogue';
import { LIBRARY_MESSAGES, resetCatalogueForTests } from '@/state/catalogue';
import { downloadPiece, resetReadingForTests } from '@/state/download';
import { resetDownloadsForTests } from '@/state/downloads';
import { resetForTests as resetMySongs } from '@/state/mySongs';
import { SongsPage } from './SongsPage';

// Invented pieces, by invented composers, written for these tests.
const SOURCE = (title: string, piece: string, author: string, tempo = 90) => `title: ${title}
piece: ${piece}
added: 2026-01-02
source: original
author: ${author}
key: G major
meter: 4/4
tempo: ${tempo}
summary: An invented tune for the tests.
figure: arpeggio-8ths
[A] main 1-2
melody: | G4h B4h | D5w |
chords: | G | D |
`;

function published(title: string, piece: string, author: string, tempo = 90) {
  const src = parsePiece(SOURCE(title, piece, author, tempo));
  const text = pieceFile(src);
  const entry: CatalogueEntry = indexEntry({
    piece,
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    songs: Object.values(generatePiece(src).versions),
  });
  return { text, entry };
}

const HARBOUR = published('Harbour Tune', 'harbour-tune', 'Ayu Lestari');
const LANTERN = published('Lantern Song', 'lantern-song', 'Budi Santoso');

function serve(files: Record<string, string | number>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      const file = files[String(url).split('/').pop()!];
      if (file === undefined || typeof file === 'number')
        return new Response('', { status: typeof file === 'number' ? file : 404 });
      return new Response(file);
    }),
  );
}

const open = () =>
  render(
    <MemoryRouter initialEntries={['/songs']}>
      <SongsPage />
    </MemoryRouter>,
  );

const section = (name: string) =>
  screen.getByRole('heading', { name, level: 2 }).closest('section')!;

beforeEach(() => {
  resetDownloadsForTests();
  resetReadingForTests();
  resetCatalogueForTests();
  resetMySongs();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Songs page', () => {
  it('has your songs, then a way into Studio, then the catalogue', async () => {
    serve({ 'index.json': stringifyIndex([HARBOUR.entry, LANTERN.entry]) });
    open();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Your songs',
      'Make your own Beta',
      'Catalogue',
    ]);
    const yours = section('Your songs');
    expect(
      within(yours)
        .getAllByRole('article')
        .map((a) => within(a).getByRole('heading', { level: 3 }).textContent),
    ).toEqual(['Für Elise', 'Ode to Joy', 'Twinkle, Twinkle, Little Star']);
    expect(within(yours).getByRole('heading', { name: 'Made by you', level: 3 })).toBeVisible();
    expect(
      within(section('Make your own Beta')).getByRole('link', { name: 'Open Studio' }),
    ).toHaveAttribute('href', '/studio');
    const catalogue = section('Catalogue');
    expect(await within(catalogue).findAllByRole('article')).toHaveLength(2);
    expect(within(catalogue).getByRole('button', { name: 'Download Harbour Tune' })).toBeVisible();
    expect(within(catalogue).getByRole('combobox')).toHaveTextContent(
      'EveryoneAyu LestariBudi Santoso',
    );
  });

  it('downloads from a card into Your songs, and removes after asking', async () => {
    serve({
      'index.json': stringifyIndex([HARBOUR.entry, LANTERN.entry]),
      'harbour-tune.json': HARBOUR.text,
    });
    open();
    const catalogue = section('Catalogue');
    await userEvent.click(
      await within(catalogue).findByRole('button', { name: 'Download Harbour Tune' }),
    );
    const status = screen.getByTestId('songs-status');
    await waitFor(() =>
      expect(status).toHaveTextContent('Harbour Tune is on this device now, in Your songs.'),
    );
    const card = within(catalogue).getByTestId('piece-harbour-tune');
    expect(within(card).getByText('On this device')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Harbour Tune' })).toHaveFocus();
    const yours = section('Your songs');
    const kept = await within(yours).findByTestId('piece-harbour-tune');

    await userEvent.click(within(kept).getByRole('button', { name: 'Remove Harbour Tune' }));
    // Asked first: still here.
    expect(within(yours).getByTestId('piece-harbour-tune')).toBeVisible();
    await userEvent.click(
      within(kept).getByRole('button', { name: 'Remove Harbour Tune from this device?' }),
    );
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Harbour Tune is no longer on this device. Your progress on it is kept.',
      ),
    );
    expect(within(yours).queryByTestId('piece-harbour-tune')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Your songs', level: 2 })).toHaveFocus();
    expect(within(catalogue).getByRole('button', { name: 'Download Harbour Tune' })).toBeVisible();
  });

  it("says in a card's own alert why its download failed", async () => {
    serve({
      'index.json': stringifyIndex([HARBOUR.entry, LANTERN.entry]),
      'harbour-tune.json': 503,
    });
    open();
    const card = await within(section('Catalogue')).findByTestId('piece-harbour-tune');
    expect(within(card).getByRole('alert')).toBeEmptyDOMElement();
    await userEvent.click(within(card).getByRole('button', { name: 'Download Harbour Tune' }));
    expect(await within(card).findByText(LIBRARY_MESSAGES.http)).toBeVisible();
    expect(within(section('Catalogue')).getByTestId('piece-lantern-song')).not.toHaveTextContent(
      LIBRARY_MESSAGES.http,
    );
  });

  it('offers an update on both cards when the catalogue has a newer file', async () => {
    serve({ 'harbour-tune.json': HARBOUR.text });
    await act(() => downloadPiece(HARBOUR.entry));
    const newer = published('Harbour Tune', 'harbour-tune', 'Ayu Lestari', 100);
    serve({ 'index.json': stringifyIndex([newer.entry]), 'harbour-tune.json': newer.text });
    open();
    const kept = await within(section('Your songs')).findByTestId('piece-harbour-tune');
    const listed = within(section('Catalogue')).getByTestId('piece-harbour-tune');
    expect(
      await within(listed).findByRole('button', { name: 'Update Harbour Tune' }),
    ).toBeVisible();
    await userEvent.click(within(kept).getByRole('button', { name: 'Update Harbour Tune' }));
    await waitFor(() =>
      expect(screen.getByTestId('songs-status')).toHaveTextContent('Harbour Tune is up to date.'),
    );
    expect(within(listed).getByText('On this device')).toBeVisible();
    expect(within(kept).queryByRole('button', { name: /Update/ })).toBeNull();
  });

  it('says when the catalogue is out of reach, or when downloads need a connection', async () => {
    serve({ 'index.json': 500 });
    const first = open();
    expect(await screen.findByTestId('catalogue-unreachable')).toHaveTextContent(
      `The catalogue couldn't be reached. ${LIBRARY_MESSAGES.http}`,
    );
    expect(within(section('Your songs')).getAllByRole('article')).toHaveLength(3);
    serve({ 'index.json': stringifyIndex([HARBOUR.entry]) });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await within(section('Catalogue')).findAllByRole('article')).toHaveLength(1);
    first.unmount();

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    open();
    expect(screen.getByTestId('catalogue-offline')).toHaveTextContent(LIBRARY_MESSAGES.offline);
    expect(within(section('Catalogue')).getAllByRole('article')).toHaveLength(1);
  });
});
