import { expect, test } from '@playwright/test';

test.describe('the Songs page', () => {
  test('has three parts: your songs, a way into Studio, and the catalogue', async ({ page }) => {
    await page.goto('songs');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Your songs',
      'Make your own Beta',
      'Catalogue',
    ]);
    const yours = page.getByTestId('your-songs');
    await expect(yours.getByRole('article')).toHaveCount(3);
    for (const piece of ['fur-elise', 'ode-to-joy', 'twinkle-twinkle'])
      await expect(yours.getByTestId(`piece-${piece}`)).toBeVisible();
    // Made by you closes Your songs, before Studio.
    await expect(page.getByRole('heading', { name: 'Made by you', level: 3 })).toBeVisible();
    await page.getByRole('link', { name: 'Open Studio' }).click();
    await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();
  });

  test('a card: its versions, its credit, the written key', async ({ page }) => {
    await page.goto('songs');
    const card = page.getByTestId('your-songs').getByTestId('piece-ode-to-joy');
    await expect(card.getByRole('heading', { name: 'Ode to Joy', level: 3 })).toBeVisible();
    await expect(card.getByRole('link', { name: /^Easy/ })).toHaveAttribute(
      'href',
      /\/songs\/ode-to-joy-easy$/,
    );
    await expect(card.getByRole('link', { name: /^Advanced/ })).toContainText('24 bars');
    await expect(card).toContainText('Ludwig van Beethoven, 1826 edition');
    await expect(card).toContainText('D major, 4/4');
  });

  test('every card in a list is the same height, whatever it holds', async ({ page }) => {
    await page.goto('songs');
    for (const list of ['your-songs', 'songs']) {
      const cards = page.getByTestId(list).locator(':scope > li > article');
      await expect(cards.first()).toBeVisible();
      const heights = await cards.evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().height)),
      );
      expect(heights.length, list).toBeGreaterThanOrEqual(3);
      expect(new Set(heights).size, list).toBe(1);
    }
  });

  test('the catalogue filters by level, composer and title', async ({ page }) => {
    await page.goto('songs');
    const songs = page.getByTestId('songs');
    await expect(songs.getByRole('article')).toHaveCount(6);
    // The written key on the card; a picked level shows the key that version plays in.
    const brahms = songs.getByTestId('piece-brahms-lullaby');
    await expect(brahms).toContainText('E♭ major, 3/4');
    await expect(
      brahms.getByRole('button', { name: "Download Brahms' Lullaby (Wiegenlied)" }),
    ).toBeVisible();

    await page.getByRole('radio', { name: 'Advanced' }).click();
    await expect(page).toHaveURL(/level=advanced/);
    await expect(brahms).toContainText('E♭ major, 3/4');
    await expect(brahms.getByRole('heading').getByRole('link')).toHaveAttribute(
      'href',
      /brahms-lullaby-advanced$/,
    );
    await page.getByRole('radio', { name: 'Easy' }).click();
    await expect(brahms).toContainText('F major, 3/4');

    await page.getByTestId('songs-search').fill('lullaby');
    await expect(songs.getByRole('listitem')).toHaveCount(1);
    await page.getByTestId('songs-search').fill('no such piece');
    await expect(page.getByTestId('songs-empty')).toBeVisible();
    await page.getByRole('link', { name: 'Show them all' }).click();
    await page.getByTestId('songs-composer').selectOption('Johann Pachelbel');
    await expect(songs.getByRole('listitem')).toHaveCount(1);
    await expect(songs.getByTestId('piece-canon-in-d')).toBeVisible();
    // Your songs are not filtered.
    await expect(page.getByTestId('your-songs').getByRole('article')).toHaveCount(3);
  });

  test('every version of every built-in piece opens and plays', async ({ page }) => {
    // Catalogue songs are swept by the unit tests, so this stays the same size.
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('songs');
    // The Songs page's code loads after the page itself: wait for it.
    const yours = page.getByTestId('your-songs').locator('[data-testid^="level-"]');
    await expect(yours.first()).toBeVisible();
    const hrefs = await yours.evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
    expect(hrefs).toHaveLength(9);
    for (const href of hrefs) {
      await page.goto(href.replace(/^\/inharmonia\//, ''));
      await expect(page.getByTestId('song-levels')).toBeVisible();
      await page.getByTestId('play').click();
      await expect(page.getByTestId('play')).toHaveText('Pause');
      await expect(page.getByTestId('status-line')).toContainText(/Bar \d+ of \d+/);
      await page.getByTestId('play').click();
    }
    expect(errors).toEqual([]);
  });

  test('a song page names its version and switches between them', async ({ page }) => {
    await page.goto('songs/ode-to-joy-easy');
    await expect(page.getByRole('heading', { name: 'Ode to Joy', level: 1 })).toBeVisible();
    await expect(page.getByTestId('song-credit')).toHaveText('Ludwig van Beethoven, 1826 edition');
    const levels = page.getByTestId('song-levels');
    await expect(levels.getByRole('link', { name: 'Easy' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByText('C major (written in D major), 4/4, 24 bars: bars 92–115 of the original'),
    ).toBeVisible();
    await levels.getByRole('link', { name: 'Advanced' }).click();
    await expect(page).toHaveURL(/ode-to-joy-advanced$/);
    await expect(
      page.getByText('D major, 4/4, 24 bars: bars 92–115 of the original'),
    ).toBeVisible();
    await expect(page.getByTestId('song-edition')).toContainText('Source: ');
  });
});
