import { expect, test, type Page } from '@playwright/test';

/** The page shell's background, where a room's wash would be. */
const wash = (page: Page) =>
  page
    .locator('main')
    .locator('xpath=..')
    .evaluate((el) => getComputedStyle(el).backgroundImage);

/** Whether the visible h1 has the room's line above it. */
const line = (page: Page) =>
  page
    .getByRole('heading', { level: 1 })
    .evaluate((h1) => getComputedStyle(h1, '::before').content !== 'none');

test.describe('room colour', () => {
  for (const route of ['songs', 'progressions', 'fills', 'studio', 'progress']) {
    test(`/${route} opens in its room's wash, with the line above its title`, async ({ page }) => {
      await page.goto(route);
      expect(await wash(page)).toContain('linear-gradient');
      expect(await line(page)).toBe(true);
    });
  }

  for (const route of ['chords', 'ear']) {
    test(`/${route}, a practice surface from the start, gets only the line`, async ({ page }) => {
      await page.goto(route);
      expect(await wash(page)).toBe('none');
      expect(await line(page)).toBe(true);
    });
  }

  for (const route of ['', 'fills/step-up', 'progressions/ii-v-i', 'about', 'no-such-page']) {
    test(`/${route} has neither`, async ({ page }) => {
      await page.goto(route);
      expect(await wash(page)).toBe('none');
      expect(await line(page)).toBe(false);
    });
  }

  test("Studio's MIDI editor leaves the wash and the line behind", async ({ page }) => {
    await page.goto('studio');
    await page.getByTestId('studio-new-midi').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('MIDI piano-roll editor');
    expect(await wash(page)).toBe('none');
    expect(await line(page)).toBe(false);
    await page.getByRole('button', { name: 'Back to Studio' }).click();
    expect(await wash(page)).toContain('linear-gradient');
  });
});
