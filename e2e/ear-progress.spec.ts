import { expect, test } from '@playwright/test';

test.describe('ear training', () => {
  test('chord quality: answer, see the result, move on', async ({ page }) => {
    await page.goto('ear?exercise=chords&level=major-minor');
    await page.getByTestId('play').click();
    const options = page.getByRole('group', { name: 'What quality is it?' }).getByRole('button');
    await expect(options).toHaveCount(2);
    await options.first().click();
    await expect(page.getByTestId('feedback')).toContainText(/Yes: |It was /);
    await expect(page.getByTestId('round')).toContainText('of 1 right this round');
    await page.getByTestId('next').click();
    await expect(page.getByTestId('feedback')).toContainText('Press Play');
  });

  test('note names: one note, twelve names, and the octave told after', async ({ page }) => {
    await page.goto('ear?exercise=notes&level=all');
    const options = page.getByRole('group', { name: 'Which note is it?' }).getByRole('button');
    await expect(options).toHaveCount(12);
    await expect(options.nth(1)).toHaveText('C♯/D♭');
    await page.getByTestId('play').click();
    await options.first().click();
    await expect(page.getByTestId('feedback')).toContainText(/(Yes: |It was )[A-G]♯?[2-6]\./);
    await page.getByTestId('next').click();
    await expect(page.getByTestId('feedback')).toContainText('Press Play');
    await page.goto('ear?exercise=notes&level=naturals');
    await expect(
      page.getByRole('group', { name: 'Which note is it?' }).getByRole('button'),
    ).toHaveCount(7);
  });

  test('progressions: name three chords and check', async ({ page }) => {
    await page.goto('ear?exercise=progressions&level=primary');
    await expect(page.getByTestId('check')).toBeDisabled();
    for (const n of [2, 3, 4])
      await page
        .getByRole('radiogroup', { name: `Chord ${n}` })
        .getByRole('radio')
        .first()
        .click();
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText(/All four right|It was/);
    await expect(page.getByTestId('next')).toBeVisible();
  });

  test('a round of ten shows up in progress', async ({ page }) => {
    await page.goto('ear?exercise=chords&level=major-minor');
    for (let i = 0; i < 10; i++) {
      if (i) await page.getByTestId('next').click();
      await page
        .getByRole('group', { name: 'What quality is it?' })
        .getByRole('button')
        .first()
        .click();
    }
    await expect(page.getByTestId('round')).toContainText('Round done');
    await page.goto('progress');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chord quality: Major or minor' })).toBeVisible();
  });
});

test.describe('progress and home', () => {
  test('first visit: welcome and an empty progress page', async ({ page }) => {
    await page.goto('');
    await expect(page.getByRole('heading', { name: 'New here?' })).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByRole('heading', { name: 'New here?' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'New here?' })).toHaveCount(0);
    await page.goto('progress');
    await expect(page.getByText('Nothing practised yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Senja di Teras/ })).toBeVisible();
  });

  test('suggests what to review and can clear it all', async ({ page }) => {
    await page.goto('');
    await page.evaluate(() => {
      const old = new Date(Date.now() - 5 * 86400000).toISOString();
      localStorage.setItem(
        'inharmonia:progress',
        JSON.stringify({
          version: 1,
          state: {
            exercises: {
              'fill:enclosure:speed': {
                attempts: 2,
                bestAccuracy: 0.6,
                bestTempo: 75,
                lastPracticed: old,
              },
              'senja-di-teras': {
                attempts: 1,
                bestAccuracy: 1,
                bestTempo: null,
                lastPracticed: new Date().toISOString(),
              },
            },
            days: [],
          },
        }),
      );
    });
    await page.goto('progress');
    const today = page.getByRole('list').filter({ hasText: 'Enclosure' }).first();
    await expect(today.getByRole('link', { name: /Enclosure/ })).toContainText('Best 60%');
    await expect(page.getByRole('row', { name: /Enclosure/ })).toContainText('75 bpm');
    await page.goto('');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Enclosure/ })).toBeVisible();
    await page.goto('progress');
    await page.getByRole('button', { name: 'Clear progress' }).click();
    await page.getByRole('button', { name: 'Clear all progress for good?' }).click();
    await expect(page.getByText('Nothing practised yet.')).toBeVisible();
  });
});
