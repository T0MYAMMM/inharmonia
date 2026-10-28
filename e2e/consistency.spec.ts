import { expect, test, type Page } from '@playwright/test';

/** One of each kind of page, index and detail, that needs no saved data. */
const ROUTES = [
  '',
  'songs',
  'songs/senja-di-teras',
  'songs/charts/new',
  'chords',
  'chords/drill',
  'chords/known',
  'progressions',
  'progressions/new',
  'progressions/ii-v-i',
  'fills',
  'fills/step-up',
  'ear',
  'progress',
  'studio',
  'keyboard',
  'about',
  'no-such-page',
];

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe('page shell', () => {
  test('every page has one h1 and no sideways scroll', async ({ page }) => {
    test.slow();
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }), route).toHaveCount(1);
      expect(await sidewaysScroll(page), route).toBeLessThanOrEqual(0);
    }
  });

  test("Studio's MIDI editor has its own h1, and the way back is the crumb", async ({ page }) => {
    await page.goto('studio');
    await page.getByTestId('studio-new-midi').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('MIDI piano-roll editor');
    await page.getByRole('button', { name: 'Back to Studio' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Studio/);
  });
});

/** Visible controls in main and the dock smaller than 44px tall, with what they say. */
const smallControls = (page: Page) =>
  page
    .locator(
      'main button, main select, main input:not([type=file]):not([type=checkbox]), main summary, [data-dock] button',
    )
    .evaluateAll((els) =>
      els
        .map((el) => {
          // A number input fills its box, and the whole box takes the tap.
          const box =
            el instanceof HTMLInputElement && el.type === 'number' ? el.parentElement! : el;
          const r = box.getBoundingClientRect();
          // A Segmented option and the crumb reach past their edges with an ::after.
          const after = getComputedStyle(box, '::after');
          const reach =
            after.content !== 'none' && after.position === 'absolute'
              ? -(parseFloat(after.top) || 0) - (parseFloat(after.bottom) || 0)
              : 0;
          const name = el.getAttribute('aria-label') ?? el.textContent ?? '';
          const height = r.height > 0 ? Math.round(r.height + reach) : 0;
          return { name: name.trim().slice(0, 30), height };
        })
        .filter((c) => c.height > 0 && c.height < 44),
    );

test.describe('touch', () => {
  test('controls are 44px tall on a touch screen', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'pointer: coarse sizes');
    for (const route of [
      'songs/senja-di-teras',
      'chords',
      'progressions/ii-v-i',
      'fills/step-up',
    ]) {
      await page.goto(route);
      expect(await smallControls(page), route).toEqual([]);
    }
    await page.goto('studio');
    await page.getByTestId('studio-new-midi').click();
    await expect(page.getByTestId('midi-track-mute')).toBeVisible();
    expect(await smallControls(page), 'MIDI editor').toEqual([]);
  });
});

test.describe('input', () => {
  test('the dock says which input is in use, and How to play explains each', async ({
    page,
    isMobile,
  }) => {
    await page.goto('keyboard');
    const status = page.getByTestId('input-status');
    const howTo = page.getByTestId('how-to-play');
    if (isMobile) {
      await expect(status).toHaveText(/Tap the keys/);
      await status.click();
      await expect(howTo).toBeVisible();
      await expect(howTo).toContainText('Tap the keys.');
      // No computer keys on a device that has none.
      await expect(howTo.getByRole('list')).toHaveCount(0);
      await expect(howTo.getByRole('heading', { name: 'MIDI keyboard' })).toBeVisible();
    } else {
      await expect(status).toHaveText(/Computer keys/);
      const key = page.locator('[data-midi="64"]');
      const box = (await key.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
      await expect(status).toHaveText(/Click the keys/);
      await page.keyboard.press('a');
      await expect(status).toHaveText(/Computer keys/);
      await status.click();
      const keys = howTo.getByRole('list', { name: 'Computer keys and their notes' });
      await expect(keys.getByRole('listitem')).toHaveCount(18);
      await expect(keys.getByRole('listitem').first()).toHaveText('AC4');
      await expect(howTo.getByRole('heading', { name: 'MIDI keyboard' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(howTo).toBeHidden();
      await expect(status).toBeFocused();
    }
  });
});
