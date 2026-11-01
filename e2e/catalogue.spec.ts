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
    await expect(page.getByTestId('song-credit')).toHaveText(
      'Christian Petzold, first published 1894',
    );
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

test.describe('catalogue songs offline', () => {
  test('a downloaded song and a built-in play offline; a link to another fails calmly', async ({
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
    await page.goto('songs/brahms-lullaby-easy');
    await expect(
      page.getByRole('heading', { name: "This song isn't on this device.", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("You're offline. Downloads need a connection.")).toBeVisible();
    await context.setOffline(false);
  });
});
