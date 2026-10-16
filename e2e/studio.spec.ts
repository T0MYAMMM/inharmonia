import { expect, test, type Page } from '@playwright/test';
import { fakeMic, fastTakes } from './studioHelpers';

async function refuseMic(page: Page, name: string) {
  await page.addInitScript((errorName) => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Refused in test', errorName);
    };
  }, name);
}

test.describe('studio', () => {
  test('is in the nav and linked from Songs', async ({ page }) => {
    await page.goto('songs');
    await page.getByRole('link', { name: 'Make your own in Studio' }).click();
    await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Studio' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('explains a blocked microphone', async ({ page }) => {
    await refuseMic(page, 'NotAllowedError');
    await page.goto('studio');
    await page.getByTestId('enable-mic').click();
    await expect(page.getByTestId('problem')).toContainText('The microphone is blocked');
    await expect(page.getByTestId('problem')).toContainText('reload');
  });

  test('explains a missing microphone', async ({ page }) => {
    await refuseMic(page, 'NotFoundError');
    await page.goto('studio');
    await page.getByTestId('enable-mic').click();
    await expect(page.getByTestId('problem')).toContainText('No microphone found');
  });

  test('a sung take becomes notes on the grid, in the key', async ({ page }) => {
    test.slow();
    await fastTakes(page);
    await fakeMic(page);
    await page.goto('studio');
    await page.getByTestId('enable-mic').click();
    await expect(page.getByTestId('record')).toBeEnabled();
    await page.evaluate(() => {
      (window as unknown as { __melody: [number, number, number][] }).__melody = [
        [0, 4, 60],
        [4, 4, 64],
        [8, 4, 67],
        [12, 4, 72],
      ];
    });
    await page.getByTestId('record').click();
    await expect(page.getByTestId('studio-status')).toContainText(/Count-in|Bar/);
    await expect(page.getByTestId('take-summary')).toContainText('4 notes in C major', {
      timeout: 20000,
    });
    await page.getByText('The notes as text').click();
    const list = page.getByTestId('note-list').getByRole('listitem');
    await expect(list).toHaveText([
      'C4, bar 1, beat 1, 4 beats',
      'E4, bar 2, beat 1, 4 beats',
      'G4, bar 3, beat 1, 4 beats',
      'C5, bar 4, beat 1, 4 beats',
    ]);
  });

  test('suggests chords and plays the draft, with the tie held', async ({ page }) => {
    test.slow();
    await fastTakes(page);
    await fakeMic(page);
    await page.goto('studio');
    await page.getByTestId('enable-mic').click();
    await expect(page.getByTestId('record')).toBeEnabled();
    // An arpeggio written for this test; G4 is held over the first barline.
    await page.evaluate(() => {
      (window as unknown as { __melody: [number, number, number][] }).__melody = [
        [0, 1, 60],
        [1, 1, 64],
        [2, 3, 67],
        [5, 1, 69],
        [6, 1, 72],
        [7, 1, 69],
        [8, 1, 67],
        [9, 1, 71],
        [10, 1, 74],
        [11, 1, 71],
        [12, 4, 72],
      ];
    });
    await page.getByTestId('record').click();
    await expect(page.getByTestId('take-summary')).toContainText('11 notes in C major', {
      timeout: 20000,
    });

    const options = page.getByRole('radiogroup', { name: 'Chords' }).getByRole('radio');
    await expect(options).toHaveCount(3);
    await expect(options.first()).toBeChecked();
    await expect(page.getByTestId('suggestion-simple-chords')).toHaveText('C | F | G | C');
    await expect(page.getByTestId('suggestion-simple')).toContainText('V–I');
    await page.getByTestId('suggestion-diatonic').click();
    await expect(options.nth(1)).toBeChecked();
    await page.getByTestId('suggestion-simple').click();

    await page.getByTestId('try-draft').click();
    await expect(page.getByRole('heading', { name: 'Your draft', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Studio' })).toBeHidden();
    // Both halves of the tie are drawn: out of bar 1 and into bar 2.
    await expect(page.locator('[data-tie="rh-0-2"]')).toHaveCount(2);
    await expect(page.locator('[data-bar="1"] [data-tie="rh-0-2"][data-across]')).toHaveCount(1);

    // Practice waits for G4 once, then goes straight to A4.
    await page.getByRole('radio', { name: 'Practice' }).click();
    const target = () =>
      page.$$eval('[data-layers~="target"]', (els) =>
        els.map((e) => Number((e as HTMLElement).dataset.midi)),
      );
    const press = async (midi: number) => {
      const key = page.locator(`[data-midi="${midi}"]`);
      await key.scrollIntoViewIfNeeded();
      const box = (await key.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);
      await page.mouse.down();
      await page.mouse.up();
    };
    for (const midi of [60, 64, 67]) {
      await expect.poll(target).toEqual([midi]);
      await press(midi);
    }
    await expect.poll(target).toEqual([69]);
    await expect(page.getByTestId('counts')).toHaveText('3 hits, 0 misses');

    await page.getByTestId('back-from-try').click();
    await expect(page.getByTestId('take-summary')).toContainText('11 notes in C major');
    await expect(page.getByTestId('suggestion-simple-chords')).toHaveText('C | F | G | C');
  });
});
