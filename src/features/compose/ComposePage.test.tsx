import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongDraft } from '@/core/songs/draft';
import { makeUserSong } from '@/core/songs/library';
import { resetCatalogueForTests } from '@/state/catalogue';
import { resetForTests, saveSong } from '@/state/mySongs';
import { ComposePage, RIGHTS } from './ComposePage';

/** An invented Studio song: four bars of a tune in G. */
const draft = (title: string): SongDraft => ({
  title,
  key: { tonic: 'G', mode: 'major' },
  tempo: 90,
  meter: { beats: 4, unit: 4 },
  bars: 4,
  notes: [67, 71, 74, 72].map((m, i) => ({ id: `n${i + 1}`, startBeat: i * 4, beats: 4, midi: m })),
  chords: [0, 1, 2, 3].map((i) => ({ startBeat: i * 4, beats: 4, symbol: i % 2 ? 'D' : 'G' })),
  lhPattern: 'arpeggio-8ths',
});

beforeEach(() => {
  resetForTests();
  resetCatalogueForTests();
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"format":"inharmonia-library","schema":1,"songs":[]}')),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter>
      <ComposePage />
    </MemoryRouter>,
  );

describe('/compose', () => {
  it('says to make the versions in Studio first when there are none', async () => {
    open();
    expect(await screen.findByText(/Nothing in Your songs yet/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Make each version in Studio' })).toHaveAttribute(
      'href',
      '/studio',
    );
    expect(screen.getByRole('button', { name: /^Download/ })).toBeDisabled();
  });

  it('puts the versions together, checks them live, and downloads the file', async () => {
    await saveSong(makeUserSong('mine-song-a', draft('Ferry, easy'), 1));
    await saveSong(makeUserSong('mine-song-b', draft('Ferry, full'), 2));
    let saved: Blob | null = null;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => {
        saved = b;
        return 'blob:x';
      },
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open();
    const issues = await screen.findByTestId('compose-issues');
    expect(issues).toHaveTextContent('Pick a song for at least one version.');
    expect(issues).toHaveTextContent('Confirm the rights, above.');

    await userEvent.selectOptions(await screen.findByTestId('compose-easy'), 'mine-song-a');
    await userEvent.selectOptions(screen.getByTestId('compose-advanced'), 'mine-song-b');
    await userEvent.type(screen.getByTestId('compose-title'), 'Evening Ferry');
    expect(screen.getByTestId('compose-piece')).toHaveValue('evening-ferry');
    await userEvent.type(screen.getByTestId('compose-author'), 'Ayu Lestari');
    await userEvent.click(screen.getByRole('checkbox', { name: RIGHTS }));
    expect(screen.queryByTestId('compose-issues')).toBeNull();
    expect(screen.getByText('Ready: it passes the same checks the catalogue runs.')).toBeVisible();

    const button = screen.getByRole('button', { name: 'Download evening-ferry.json' });
    await userEvent.click(button);
    expect(click).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Downloaded evening-ferry.json.');
    const file = JSON.parse(await saved!.text());
    expect(file.items.map((i: { id: string }) => i.id)).toEqual([
      'evening-ferry-easy',
      'evening-ferry-advanced',
    ]);
    expect(file.items[0].source).toEqual({ kind: 'original', author: 'Ayu Lestari' });

    // The id can be changed by hand; a retired one is refused by the catalogue's rule.
    await userEvent.clear(screen.getByTestId('compose-piece'));
    await userEvent.type(screen.getByTestId('compose-piece'), 'window-light');
    await waitFor(() =>
      expect(screen.getByTestId('compose-issues')).toHaveTextContent(
        'window-light is a retired piece; choose another id',
      ),
    );
    expect(screen.getByRole('button', { name: 'Download window-light.json' })).toBeDisabled();
  });

  it('tells a composer without GitHub to send the file to the owner', () => {
    open();
    expect(screen.getByText(/Send the file to the owner/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'composing for Inharmonia' })).toHaveAttribute(
      'href',
      expect.stringMatching(/docs\/composing\.md$/),
    );
  });
});
