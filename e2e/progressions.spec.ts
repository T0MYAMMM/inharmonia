import { expect, test, type Page } from '@playwright/test';
import { holdChord } from './helpers';

const lit = (page: Page, layer: string) =>
  page.$$eval(`[data-layers~="${layer}"]`, (els) =>
    els.map((e) => Number((e as HTMLElement).dataset.midi)),
  );

test.describe('progression trainer', () => {
  test('lists progressions and opens one in a key from the URL', async ({ page }) => {
    await page.goto('progressions');
    await expect(page.getByRole('link', { name: /12-bar blues/ })).toBeVisible();
    await page.goto('progressions/ii-v-i?key=Bb&pattern=stride');
    await expect(page.getByRole('heading', { name: 'ii–V–I' })).toBeVisible();
    await expect(page.getByTestId('status-line')).toHaveText('Bar 1 of 8, Cm7');
    await expect(page.locator('[data-bar="1"]')).toContainText('F7');
    await expect(page.locator('[data-bar="1"]')).toContainText('V7');
    await expect(page.getByTestId('pattern')).toHaveValue('stride');
  });

  test('changing the key and pattern keeps the mode', async ({ page }) => {
    await page.goto('progressions/i-v-vi-iv');
    await page.getByRole('radio', { name: 'Practice' }).click();
    // On phones the settings fold into a summary line.
    const summary = page.locator('summary');
    if (await summary.isVisible()) await summary.click();
    await page.getByTestId('key').selectOption('G');
    await page.getByTestId('pattern').selectOption('waltz');
    await expect(page.getByRole('radio', { name: 'Practice' })).toBeChecked();
    await expect(page.getByTestId('status-line')).toHaveText('Bar 1 of 8, G');
    await expect(page).toHaveURL(/key=G/);
    await expect(page).toHaveURL(/pattern=waltz/);
  });

  test('listen plays the comping and lights the chord', async ({ page }) => {
    await page.goto('progressions/ii-v-i?key=C&smooth=0');
    await page.getByTestId('play').click();
    await expect.poll(() => lit(page, 'lh')).toEqual([50, 53, 57, 60]); // Dm7 root position from C3
    await page.getByTestId('play').click();
  });

  test('practice waits for each chord', async ({ page, isMobile }) => {
    test.skip(isMobile, 'computer keyboard input');
    await page.goto('progressions/ii-v-i?key=Bb&smooth=0');
    await page.getByRole('radio', { name: 'Practice' }).click();
    await expect.poll(() => lit(page, 'chordTarget')).toEqual([48, 51, 55, 58]);
    const release = await holdChord(page, [60, 63, 67, 70]); // Cm7 an octave up
    await expect(page.getByTestId('counts')).toHaveText('1 hit, 0 misses');
    await release();
    await expect(page.getByTestId('status-line')).toHaveText('Bar 2 of 8, F7');
  });

  test('play-along counts in, shows the chord to play, and scores a full run', async ({ page }) => {
    await page.goto('progressions/ii-v-i?key=C');
    await page.getByRole('radio', { name: 'Play-along' }).click();
    await expect(page.getByRole('button', { name: 'Count-in' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('slider', { name: 'Tempo' }).fill('160');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('status-line')).toContainText('Count-in');
    await expect.poll(async () => (await lit(page, 'chordTarget')).length).toBe(4);
    // Play nothing: every chord is missed, and the run ends with a summary.
    await expect(page.getByTestId('play-summary')).toHaveText(
      '0 of 8 on time, 8 missed at 160 bpm.',
      {
        timeout: 20_000,
      },
    );
    await expect(page.locator('[data-result="missed"]')).toHaveCount(8);
  });
});
