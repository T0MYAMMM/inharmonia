import { expect, test, type Page } from '@playwright/test';

/**
 * Tap timing, driven on an injected clock: Playwright's clock stands in for
 * performance.now(), which the metronome's beat is read on, so each tap lands
 * exactly where the test puts it.
 */

// An invented chart: one section, one chord a bar, the default 80 bpm.
async function newChart(page: Page) {
  await page.goto('songs/charts/new');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('chart-title').fill('Tide table');
  await page.getByTestId('add-section').selectOption('Verse');
  await page.getByTestId('edit-text-0').click();
  await page.getByTestId('bars-text').fill('| C | G | Am | F |');
  await page.getByTestId('bars-apply').click();
}

/** Seconds on the page's clock. */
const pageNow = (page: Page) => page.evaluate(() => performance.now() / 1000);

/** No sideways scroll, at any width. */
async function noSideways(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(scroll, 'the page scrolls sideways').toBeLessThanOrEqual(inner);
}

test.describe('tap timing', () => {
  test('tap along with the metronome, apply, save, and the chart keeps it', async ({
    page,
    isMobile,
  }) => {
    await page.clock.install();
    await newChart(page);
    await page.getByTestId('tap-open-0').click();
    await expect(page.getByRole('radio', { name: 'Metronome, 80 bpm' })).toBeChecked();
    await noSideways(page);

    // Hold the clock still, then start: beat 0 is a bar of count-in from now.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await page.getByTestId('tap-start').click();
    const start = await pageNow(page);
    const beat = 60 / 80;
    const downbeat = start + 0.06 + 4 * beat;
    await expect(page.getByTestId('tap-current')).toHaveText('C');
    await expect(page.getByTestId('tap-count')).toContainText('Counting in');
    await expect(page.getByTestId('tap-button')).toBeFocused();
    const tapBox = await page.getByTestId('tap-button').boundingBox();
    expect(tapBox!.height).toBeGreaterThanOrEqual(64);
    await noSideways(page);

    /** Run the clock to a beat, a little off it, and tap with Space. */
    const tapOn = async (b: number, off: number) => {
      const target = downbeat + b * beat + off;
      await page.clock.runFor(Math.round((target - (await pageNow(page))) * 1000));
      await page.keyboard.press('Space');
    };
    await tapOn(6, 0.07);
    await expect(page.getByTestId('tap-current')).toHaveText('G');
    await expect(page.getByTestId('tap-count')).toContainText('Bar 2, change 1 of 3');
    // One too many, taken back.
    await tapOn(7, 0);
    await expect(page.getByTestId('tap-current')).toHaveText('Am');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('tap-current')).toHaveText('G');
    await tapOn(8, -0.06);
    await tapOn(11, 0.05);

    await expect(page.getByTestId('tap-summary')).toHaveText('Verse: 3 bars, was 4.');
    await expect(page.getByTestId('tap-new').getByRole('listitem')).toHaveText([
      '1C, 4 beats',
      '2C, 2 beatsG, 2 beats',
      '3Am, 3 beatsF, 1 beat',
    ]);
    await expect(page.getByTestId('tap-old').getByRole('listitem')).toHaveCount(4);
    await noSideways(page);
    await page.getByTestId('tap-apply').click();
    await expect(page.getByTestId('tap-applied-0')).toHaveText(
      'New timing in place. Save to keep it.',
    );
    await expect(page.getByTestId('bar-0-1')).toHaveText('2CG');

    await page.clock.resume();
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'Tide table', level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/4\/4, 3 bars, 80 bpm/)).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(
      page.getByRole('list', { name: 'Bars of Verse' }).getByRole('listitem'),
    ).toHaveText(['1C', '2CG', '3AmF']);

    if (!isMobile) return;
    // On a phone, Play is still in the first screen of the chart.
    await page.goBack();
    const play = page.getByTestId('play');
    await expect(play).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    const box = await play.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: window.innerHeight, scrolled: window.scrollY };
    });
    expect(box.scrolled, 'the page scrolled by itself').toBe(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom, `Play ends ${Math.round(box.bottom)}px down`).toBeLessThanOrEqual(
      box.height,
    );
    await noSideways(page);
  });

  test('Esc stops early, and Discard leaves the bars as they were', async ({ page }) => {
    await page.clock.install();
    await newChart(page);
    await page.getByTestId('tap-open-0').click();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await page.getByTestId('tap-start').click();
    await page.clock.runFor(3060 + 2 * 750);
    await page.getByTestId('tap-button').dispatchEvent('pointerdown', { button: 0 });
    await expect(page.getByTestId('tap-current')).toHaveText('G');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tap-said')).toHaveText(
      'Stopped after 1 of 3 changes. The rest keep their lengths.',
    );
    await page.getByTestId('tap-discard').click();
    await expect(
      page.getByRole('list', { name: 'Bars of Verse' }).getByRole('listitem'),
    ).toHaveText(['1C', '2G', '3Am', '4F']);
  });

  test('a song file is offered, and nothing is uploaded', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await newChart(page);
    await page.getByTestId('tap-open-0').click();
    await page.getByRole('radio', { name: 'A song file' }).click();
    await expect(page.getByTestId('tap-file')).toHaveAttribute('accept', 'audio/*');
    const before = requests.length;
    await page.getByTestId('tap-file').setInputFiles({
      name: 'practice.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('RIFF....WAVE'),
    });
    await expect(page.getByTestId('tap-beat')).toBeVisible();
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
    expect(requests.slice(before).filter((u) => !u.startsWith('blob:'))).toEqual([]);
    await page.getByTestId('tap-cancel').click();
    await expect(page.locator('audio')).toHaveCount(0);
  });
});
