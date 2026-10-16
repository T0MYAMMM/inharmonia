import { expect, test, type Page } from '@playwright/test';

const lit = (page: Page, layer: string) =>
  page.$$eval(`[data-layers~="${layer}"]`, (els) =>
    els.map((e) => Number((e as HTMLElement).dataset.midi)),
  );

/** Tap a key on the on-screen piano. */
const tap = (page: Page, midi: number) => page.locator(`[data-midi="${midi}"]`).click();

test.describe('fills', () => {
  test('lists fills by kind and opens one in a key and change from the URL', async ({ page }) => {
    await page.goto('fills');
    await expect(page.getByRole('heading', { name: 'Gospel sixths' })).toBeVisible();
    await page.getByRole('link', { name: /Rising sixths/ }).click();
    await expect(page.getByRole('heading', { name: 'Rising sixths' })).toBeVisible();
    await page.goto('fills/step-up?key=F&change=I>IV');
    await expect(page.getByTestId('status-line')).toHaveText('Bar 1 of 2, F');
    const fill = page.getByRole('list', { name: 'The fill' });
    await expect(fill.getByRole('listitem')).toHaveCount(3);
    await expect(fill.getByRole('listitem').last()).toHaveAccessibleName(
      /B flat, on 1, the landing/,
    );
  });

  test('listen plays the fill over the chords and lights it', async ({ page }) => {
    await page.goto('fills/step-up?key=C&change=V7>I');
    await page.getByTestId('play').click();
    await expect.poll(() => lit(page, 'rh'), { timeout: 8000 }).toEqual([57]); // A3
    await expect.poll(() => lit(page, 'lh')).toEqual([55, 59, 62, 65]); // G7
    await page.getByTestId('play').click();
  });

  test('practice waits for each note, in any octave', async ({ page }) => {
    await page.goto('fills/step-up?key=C&change=V7>I');
    await page.getByRole('radio', { name: 'Practice' }).click();
    await expect.poll(() => lit(page, 'target')).toEqual([57]);
    await tap(page, 69); // A4 counts for A3
    await expect.poll(() => lit(page, 'target')).toEqual([59]);
    await tap(page, 62); // wrong
    await expect(page.getByTestId('counts')).toHaveText('1 missed this time through');
    await tap(page, 71);
    await tap(page, 72);
    await expect(page.getByTestId('counts')).toHaveText('1 missed this time through, 1 done');
  });

  test('practice takes a double stop one note at a time', async ({ page }) => {
    await page.goto('fills/rising-sixths?key=C&change=IV>I');
    await page.getByRole('radio', { name: 'Practice' }).click();
    await expect.poll(() => lit(page, 'target')).toEqual([57, 65]); // A3 + F4
    await tap(page, 57);
    await expect.poll(() => lit(page, 'target')).toEqual([57, 65]);
    await tap(page, 65);
    await expect.poll(() => lit(page, 'target')).toEqual([59, 67]); // B3 + G4
  });

  test('speed-up counts in and can be stopped', async ({ page }) => {
    await page.goto('fills/enclosure');
    await page.getByRole('radio', { name: 'Speed-up' }).click();
    await expect(page.getByTestId('speed-status')).toContainText('60 bpm');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('status-line')).toContainText('Count-in');
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('a fill slots into a progression', async ({ page }) => {
    await page.goto('progressions/ii-v-i?key=C&smooth=0&pattern=held&fill=step-up');
    await expect(page.getByTestId('fill')).toHaveValue('step-up');
    await page.getByTestId('play').click();
    await expect.poll(() => lit(page, 'rh'), { timeout: 8000 }).toEqual([64]); // E4, into G7
    await page.getByTestId('play').click();
  });
});
