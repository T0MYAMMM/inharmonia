import { expect, test } from '@playwright/test';

test.describe('song library', () => {
  test('every card is the same height, versions or not', async ({ page }) => {
    await page.goto('songs');
    const cards = page.getByTestId('songs').locator(':scope > li > div');
    await expect(cards.first()).toBeVisible();
    const heights = await cards.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    expect(heights.length).toBeGreaterThanOrEqual(3);
    expect(new Set(heights).size).toBe(1);
  });

  test('one card per piece, with filters for level, composer and title', async ({ page }) => {
    await page.goto('songs');
    const songs = page.getByTestId('songs');
    await expect(songs.getByTestId('piece-twinkle-twinkle')).toBeVisible();
    const card = songs.getByTestId('piece-ode-to-joy');
    await expect(card.getByRole('link', { name: /^Easy/ })).toHaveAttribute(
      'href',
      /\/songs\/ode-to-joy-easy$/,
    );
    await expect(card.getByRole('link', { name: /^Medium/ })).toBeVisible();
    await expect(card.getByRole('link', { name: /^Advanced/ })).toContainText('24 bars');
    await expect(card).toContainText('Ludwig van Beethoven, first published 1826');
    // The written key on the card; a picked level shows the key that version plays in.
    await expect(card).toContainText('D major, 4/4');

    await page.getByRole('radio', { name: 'Advanced' }).click();
    await expect(page).toHaveURL(/level=advanced/);
    await expect(card).toContainText('D major, 4/4');
    await expect(card.getByRole('link', { name: 'Ode to Joy' })).toHaveAttribute(
      'href',
      /ode-to-joy-advanced$/,
    );

    await page.getByRole('radio', { name: 'Easy' }).click();
    await expect(card).toContainText('C major, 4/4');
    await page.getByRole('radio', { name: 'Advanced' }).click();
    await page.getByTestId('songs-search').fill('joy');
    await expect(songs.getByRole('listitem')).toHaveCount(1);
    await page.getByTestId('songs-search').fill('no such piece');
    await expect(page.getByTestId('songs-empty')).toBeVisible();
    await page.getByRole('link', { name: 'Show them all' }).click();
    await page.getByTestId('songs-composer').selectOption('Ludwig van Beethoven');
    await expect(songs.getByRole('listitem')).toHaveCount(2);
  });

  test('the built-in pieces fit one page, with no pager', async ({ page }) => {
    await page.goto('songs');
    await expect(page.getByTestId('songs').getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('navigation', { name: 'Song pages' })).toHaveCount(0);
    await page.goto('songs?page=99');
    await expect(page.getByTestId('songs').getByRole('listitem')).toHaveCount(3);
  });

  test('every version of every built-in piece opens and plays', async ({ page }) => {
    // Catalogue songs are swept by the unit tests, so this stays the same size.
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('songs');
    const hrefs: string[] = [];
    for (;;) {
      hrefs.push(
        ...(await page
          .getByTestId('songs')
          .locator('[data-testid^="level-"]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('href')!))),
      );
      // One page has no pager; the last page's Next is disabled.
      const next = page.getByTestId('songs-next');
      if ((await next.count()) === 0 || (await next.isDisabled())) break;
      await next.click();
    }
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
    await expect(page.getByTestId('song-credit')).toHaveText(
      'Ludwig van Beethoven, first published 1826',
    );
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
