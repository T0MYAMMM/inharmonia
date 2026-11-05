import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { downloadSong } from './helpers';

const MINUET = 'songs/minuet-in-g-easy';

/** Progress kept for these song ids, practised a week ago. */
async function seedProgress(page: Page, ids: string[]) {
  await page.goto('');
  await page.evaluate((songIds) => {
    const lastPracticed = new Date(Date.now() - 7 * 86400000).toISOString();
    const exercises = Object.fromEntries(
      songIds.map((id) => [id, { attempts: 2, bestAccuracy: 0.8, bestTempo: null, lastPracticed }]),
    );
    localStorage.setItem(
      'inharmonia:progress',
      JSON.stringify({ version: 1, state: { exercises, days: [] } }),
    );
  }, ids);
}

test.describe('catalogue songs', () => {
  // So page.route sees every request, not the service worker's cache.
  test.use({ serviceWorkers: 'block' });

  test('a link to one offers the download, then plays it in place', async ({ page }) => {
    await page.goto(MINUET);
    await expect(page.getByRole('heading', { name: 'Minuet in G', level: 1 })).toBeVisible();
    await expect(page.getByTestId('song-credit')).toHaveText('Christian Petzold, 1894 edition');
    await expect(page.getByText('G major, 3/4, 16 bars')).toBeVisible();
    await expect(page.getByTestId('download-offer')).toContainText(
      /not on this device yet\. Download it once \(\d+ KB, every version\)/,
    );
    await expect(page.getByTestId('play')).toHaveCount(0);

    await page.getByRole('button', { name: 'Download Minuet in G' }).click();
    await expect(page.getByTestId('play')).toBeFocused();
    await expect(page.getByTestId('download-status')).toHaveText(
      'Minuet in G is on this device now, and plays offline too.',
    );
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Pause');
    await expect(page.getByTestId('status-line')).toContainText(/Bar \d+ of 16/);
    await page.getByTestId('play').click();

    // Kept: every version plays from this device, with no download.
    await page.reload();
    await expect(page.getByTestId('play')).toBeVisible();
    await page.getByTestId('song-levels').getByRole('link', { name: 'Advanced' }).click();
    await expect(page).toHaveURL(/minuet-in-g-advanced$/);
    await expect(page.getByText('G major, 3/4, 32 bars: bars 1–32 of the original')).toBeVisible();
    await expect(page.getByTestId('song-download')).toHaveCount(0);
  });

  test('a download that fails says why, and keeps nothing', async ({ page }) => {
    await page.route('**/library/minuet-in-g.json', (route) => route.fulfill({ status: 500 }));
    await page.goto(MINUET);
    await page.getByRole('button', { name: 'Download Minuet in G' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\w/ })).toHaveText(
      "The song couldn't be fetched just now. Try again in a little while.",
    );
    await expect(page.getByRole('button', { name: 'Download Minuet in G' })).toBeEnabled();
    await page.unroute('**/library/minuet-in-g.json');
    await page.reload();
    await expect(page.getByTestId('song-download')).toBeVisible();
  });

  test('a file that is not the one the index lists is asked for twice, then refused', async ({
    page,
  }) => {
    const asked: (string | null)[] = [];
    await page.route('**/library/minuet-in-g.json', async (route) => {
      asked.push(route.request().headers()['cache-control'] ?? null);
      const response = await route.fetch();
      const body = (await response.text()).replace('"title": "Minuet in G"', '"title": "Minuet"');
      await route.fulfill({ response, body });
    });
    await page.goto(MINUET);
    await page.getByRole('button', { name: 'Download Minuet in G' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\w/ })).toHaveText(
      'This song is being updated. Try again in a few minutes.',
    );
    expect(asked).toHaveLength(2);
    await expect(page.getByTestId('play')).toHaveCount(0);
  });

  test('a retired piece says it is gone; an unknown song is not found', async ({ page }) => {
    for (const id of ['senja-di-teras', 'window-light-easy']) {
      await page.goto(`songs/${id}`);
      await expect(
        page.getByRole('heading', { name: 'This piece is no longer in Inharmonia.', level: 1 }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Find another in Songs' }).click();
      await expect(page.getByRole('heading', { name: 'Songs', level: 1 })).toBeVisible();
    }
    await page.goto('songs/no-such-song');
    await expect(page.getByRole('heading', { name: 'Nothing here.', level: 1 })).toBeVisible();
  });

  test('Progress keeps a catalogue song not on this device, and links to its download', async ({
    page,
  }) => {
    await seedProgress(page, ['minuet-in-g-easy', 'senja-di-teras', 'ode-to-joy-easy']);
    await page.goto('progress');
    const minuet = page.getByRole('row', { name: /Minuet in G, Easy/ });
    await expect(minuet).toContainText('Song, not downloaded');
    await expect(page.getByRole('row', { name: /Ode to Joy, Easy/ })).toContainText('Song');
    // A retired piece's progress stays hidden.
    await expect(page.getByRole('row', { name: /Senja/ })).toHaveCount(0);
    await minuet.getByRole('link', { name: 'Minuet in G, Easy' }).click();
    await expect(page.getByRole('button', { name: 'Download Minuet in G' })).toBeVisible();
    await page.getByRole('button', { name: 'Download Minuet in G' }).click();
    await expect(page.getByTestId('play')).toBeFocused();
    await page.goto('progress');
    await expect(page.getByRole('row', { name: /Minuet in G, Easy/ })).not.toContainText(
      'not downloaded',
    );
  });
});

test.describe('the catalogue on the Songs page', () => {
  test.use({ serviceWorkers: 'block' });

  test('a card downloads its piece into Your songs, and says it is on this device', async ({
    page,
  }) => {
    await page.goto('songs');
    const card = page.getByTestId('songs').getByTestId('piece-minuet-in-g');
    await card.getByRole('button', { name: 'Download Minuet in G' }).click();
    await expect(card.getByTestId('on-device')).toHaveText('On this device');
    await expect(card.getByRole('link', { name: 'Minuet in G', exact: true })).toBeFocused();
    await expect(page.getByTestId('songs-status')).toHaveText(
      'Minuet in G is on this device now, in Your songs.',
    );
    const yours = page.getByTestId('your-songs');
    await expect(yours.getByRole('article')).toHaveCount(4);
    await yours
      .getByTestId('piece-minuet-in-g')
      .getByRole('link', { name: /^Advanced/ })
      .click();
    await expect(page.getByTestId('play')).toBeVisible();
  });

  test('a card says why a download failed, in its own alert', async ({ page }) => {
    await page.route('**/library/canon-in-d.json', (route) => route.abort('internetdisconnected'));
    await page.goto('songs');
    const card = page.getByTestId('songs').getByTestId('piece-canon-in-d');
    await card.getByRole('button', { name: 'Download Canon in D' }).click();
    await expect(card.getByRole('alert')).toHaveText(
      "Inharmonia couldn't be reached. Check your connection, then try again.",
    );
    await expect(page.getByTestId('your-songs').getByRole('article')).toHaveCount(3);
  });

  test('Update when the catalogue has a newer file; Remove asks first and keeps progress', async ({
    page,
  }) => {
    await downloadSong(page, 'minuet-in-g-easy');
    // Practised, so Progress has it.
    await page.evaluate(() => {
      localStorage.setItem(
        'inharmonia:progress',
        JSON.stringify({
          version: 1,
          state: {
            exercises: {
              'minuet-in-g-easy': {
                attempts: 1,
                bestAccuracy: 0.9,
                bestTempo: null,
                lastPracticed: new Date().toISOString(),
              },
            },
            days: [],
          },
        }),
      );
    });

    // A newer Minuet in the catalogue: a new date in the file, and its hash in the index.
    const original = await (await page.request.get('library/minuet-in-g.json')).text();
    const newer = original.replace(
      /"exportedAt": "[^"]+"/,
      '"exportedAt": "2026-11-01T00:00:00.000Z"',
    );
    const sha256 = createHash('sha256').update(newer, 'utf8').digest('hex');
    await page.route('**/library/minuet-in-g.json', (route) => route.fulfill({ body: newer }));
    await page.route('**/library/index.json', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /("piece":"minuet-in-g","file":"minuet-in-g.json","bytes":)\d+,"sha256":"[0-9a-f]+"/,
        `$1${Buffer.byteLength(newer, 'utf8')},"sha256":"${sha256}"`,
      );
      await route.fulfill({ response, body });
    });

    await page.goto('songs');
    const kept = page.getByTestId('your-songs').getByTestId('piece-minuet-in-g');
    await expect(kept).toContainText('Easy16 bars, best 90%');
    await expect(
      page.getByTestId('songs').getByRole('button', { name: 'Update Minuet in G' }),
    ).toBeVisible();
    await kept.getByRole('button', { name: 'Update Minuet in G' }).click();
    await expect(page.getByTestId('songs-status')).toHaveText('Minuet in G is up to date.');
    await expect(kept.getByRole('button', { name: /Update/ })).toHaveCount(0);
    await expect(page.getByTestId('songs').getByTestId('piece-minuet-in-g')).toContainText(
      'On this device',
    );

    await kept.getByRole('button', { name: 'Remove Minuet in G' }).click();
    await kept.getByRole('button', { name: 'Remove Minuet in G from this device?' }).click();
    await expect(page.getByTestId('songs-status')).toHaveText(
      'Minuet in G is no longer on this device. Your progress on it is kept.',
    );
    await expect(page.getByRole('heading', { name: 'Your songs', level: 2 })).toBeFocused();
    await expect(page.getByTestId('your-songs').getByRole('article')).toHaveCount(3);
    await expect(
      page.getByTestId('songs').getByRole('button', { name: 'Download Minuet in G' }),
    ).toBeVisible();
    await page.goto('progress');
    await expect(page.getByRole('row', { name: /Minuet in G, Easy/ })).toContainText(
      'Song, not downloaded',
    );
  });

  test('pages of nine, with previous and next, and filters start again on page one', async ({
    page,
  }) => {
    // A catalogue of twelve: the six there are, and six more made from them.
    await page.route('**/library/index.json', async (route) => {
      const response = await route.fetch();
      const lines = (await response.text()).split('\n');
      const songs = lines.slice(1, -2).map((l) => l.replace(/,$/, ''));
      const more = songs.map((l) =>
        l
          .replaceAll('"piece":"', '"piece":"more-')
          .replaceAll(/"(id|file)":"([a-z0-9-]+)/g, '"$1":"more-$2')
          .replace(/"title":"/, '"title":"Another '),
      );
      const body = `${lines[0]}\n${[...songs, ...more].join(',\n')}\n]}\n`;
      await route.fulfill({ response, body });
    });
    await page.goto('songs');
    const items = page.getByTestId('songs').getByRole('listitem');
    const prev = page.getByRole('button', { name: 'Previous page' });
    const next = page.getByRole('button', { name: 'Next page' });
    await expect(items).toHaveCount(9);
    await expect(page.getByTestId('songs-page')).toHaveText('Page 1 of 2');
    await expect(prev).toBeDisabled();

    await next.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('songs-page')).toHaveText('Page 2 of 2');
    await expect(items).toHaveCount(3);
    await expect(next).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('songs-page')).toHaveText('Page 2 of 2');

    await page.getByTestId('songs-search').fill('another');
    await expect(page).not.toHaveURL(/page=/);
    await expect(items).toHaveCount(6);
    await expect(page.getByRole('navigation', { name: 'Song pages' })).toHaveCount(0);

    await page.goto('songs?page=99');
    await expect(page.getByTestId('songs-page')).toHaveText('Page 2 of 2');
  });

  test('the catalogue out of reach says so, and Your songs still play', async ({ page }) => {
    await page.route('**/library/index.json', (route) => route.abort('internetdisconnected'));
    await page.goto('songs');
    await expect(page.getByTestId('catalogue-unreachable')).toContainText(
      "The catalogue couldn't be reached.",
    );
    await expect(page.getByTestId('your-songs').getByRole('article')).toHaveCount(3);
    await page.unroute('**/library/index.json');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('songs').getByRole('article')).toHaveCount(6);
  });
});

test.describe('catalogue songs offline', () => {
  test('a downloaded song and a built-in play offline; a link to another waits to download', async ({
    page,
    context,
  }) => {
    await page.goto('');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await downloadSong(page, 'minuet-in-g-easy');
    await context.setOffline(true);
    for (const [id, bars] of [
      ['minuet-in-g-easy', 16],
      ['twinkle-twinkle-easy', 24],
    ] as const) {
      await page.goto(`songs/${id}`);
      await page.getByTestId('play').click();
      await expect(page.getByTestId('status-line')).toContainText(`of ${bars}`);
      await page.getByTestId('play').click();
    }
    // The catalogue's index is precached, so a link to a song not downloaded
    // still knows it; offline, Download waits for a connection.
    await page.goto('songs/brahms-lullaby-easy');
    await expect(
      page.getByRole('heading', { name: "Brahms' Lullaby (Wiegenlied)", level: 1 }),
    ).toBeVisible();
    const download = page.getByTestId('song-download');
    await expect(download).toBeDisabled();
    await expect(page.getByTestId('download-offline')).toHaveText(
      "You're offline. This song downloads when you're back online.",
    );
    // Back online, it is offered again, and waits to be asked.
    await context.setOffline(false);
    await expect(download).toBeEnabled();
    await expect(page.getByTestId('download-offline')).toHaveCount(0);
    await expect(page.getByTestId('play')).toHaveCount(0);
  });

  test('the catalogue lists offline, and says downloads need a connection', async ({
    page,
    context,
  }) => {
    await page.goto('');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto('songs');
    await expect(page.getByTestId('catalogue-offline')).toHaveText(
      "You're offline. Downloads need a connection.",
    );
    await expect(page.getByTestId('songs').getByRole('article')).toHaveCount(6);
    await expect(page.getByTestId('your-songs').getByRole('article')).toHaveCount(3);
    await context.setOffline(false);
  });
});
