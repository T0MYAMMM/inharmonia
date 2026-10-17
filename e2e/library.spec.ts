import { expect, test } from '@playwright/test';

test.describe('song library', () => {
  test('one card per piece, with filters for level, composer and title', async ({ page }) => {
    await page.goto('songs');
    const songs = page.getByTestId('songs');
    await expect(songs.getByTestId('piece-window-light')).toBeVisible();
    const card = songs.getByTestId('piece-morning-ferry');
    await expect(card.getByRole('link', { name: /^Easy/ })).toHaveAttribute(
      'href',
      /\/songs\/morning-ferry-easy$/,
    );
    await expect(card.getByRole('link', { name: /^Medium/ })).toBeVisible();
    await expect(card.getByRole('link', { name: /^Advanced/ })).toContainText('21 bars');
    await expect(card).toContainText('Original, by Inharmonia');
    // The written key on the card; a picked level shows the key that version plays in.
    const brahms = songs.getByTestId('piece-brahms-lullaby');
    await expect(brahms).toContainText('E♭ major, 3/4');

    await page.getByRole('radio', { name: 'Advanced' }).click();
    await expect(page).toHaveURL(/level=advanced/);
    await expect(brahms).toContainText('E♭ major, 3/4');
    await expect(songs.getByTestId('piece-senja-di-teras')).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Morning Ferry' })).toHaveAttribute(
      'href',
      /morning-ferry-advanced$/,
    );

    await page.getByRole('radio', { name: 'Easy' }).click();
    await expect(brahms).toContainText('F major, 3/4');
    await page.getByRole('radio', { name: 'Advanced' }).click();
    await page.getByTestId('songs-search').fill('ferry');
    await expect(songs.getByRole('listitem')).toHaveCount(1);
    await page.getByTestId('songs-search').fill('no such piece');
    await expect(page.getByTestId('songs-empty')).toBeVisible();
    await page.getByRole('link', { name: 'Show them all' }).click();
    await page.getByTestId('songs-composer').selectOption('Original pieces');
    await expect(songs.getByRole('listitem')).toHaveCount(4);
  });

  test('every version of every library piece opens and plays', async ({ page }) => {
    // Three versions per piece, so the sweep grows with the library.
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('songs');
    const hrefs = await page
      .getByTestId('songs')
      .locator('[data-testid^="level-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
    expect(hrefs.length).toBeGreaterThanOrEqual(24);
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
    await page.goto('songs/lanterns-at-dusk-easy');
    await expect(page.getByRole('heading', { name: 'Lanterns at Dusk', level: 1 })).toBeVisible();
    await expect(page.getByTestId('song-credit')).toHaveText('Original, by Inharmonia');
    const levels = page.getByTestId('song-levels');
    await expect(levels.getByRole('link', { name: 'Easy' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('A minor, 3/4, 16 bars: bars 1–16 of the original')).toBeVisible();
    await levels.getByRole('link', { name: 'Advanced' }).click();
    await expect(page).toHaveURL(/lanterns-at-dusk-advanced$/);
    await expect(page.getByText('A minor, 3/4, 20 bars: bars 1–20 of the original')).toBeVisible();
    await expect(page.getByTestId('song-edition')).toHaveCount(0);
  });
});
