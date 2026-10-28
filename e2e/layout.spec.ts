import { expect, test, type Page } from '@playwright/test';

/** Every route, and the not-found states of the pages that load a saved item. */
const ROUTES = [
  '',
  'songs',
  'songs/senja-di-teras',
  'songs/mine/no-such-song',
  'songs/charts/new',
  'songs/charts/no-such-chart',
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
  'studio/edit/no-such-song',
  'keyboard',
  'about',
  'no-such-page',
];

async function shell(page: Page) {
  // Studio keeps its landing in the page, hidden, while an editor is open.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

test.describe('page shell', () => {
  for (const route of ROUTES) {
    test(`/${route} has one h1 and no sideways scroll`, async ({ page }) => {
      await page.goto(route);
      await shell(page);
    });
  }

  test('the Studio MIDI editor has its own h1', async ({ page }) => {
    await page.goto('studio');
    await page.getByTestId('studio-new-midi').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('MIDI piano-roll editor');
    await shell(page);
  });
});

/**
 * Controls under 44px on a touch screen. A Segmented counts by its group,
 * whose options reach over its padding; the crumb reaches past its line the
 * same way. Links inside text are left out, as WCAG leaves them out.
 */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
    };
    const targets = [
      ...document.querySelectorAll<HTMLElement>(
        'button, select, summary, input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), [role=radiogroup], header a, footer a',
      ),
    ]
      .filter(visible)
      .filter((el) => el.getAttribute('role') !== 'radio')
      .filter((el) => !el.closest('[class*="crumb"]'))
      .filter((el) => !(el instanceof HTMLButtonElement && el.closest('[role=radiogroup]')));
    return targets
      .map((el) => {
        const r = el.getBoundingClientRect();
        const box = el.matches('input') ? el.parentElement!.getBoundingClientRect() : r;
        return {
          what: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`,
          w: Math.round(box.width),
          h: Math.round(Math.max(r.height, el.matches('input') ? box.height : 0)),
        };
      })
      .filter((t) => t.h < 44 || t.w < 44)
      .map((t) => `${t.what} ${t.w}x${t.h}`);
  });
}

test.describe('touch targets', () => {
  test.skip(({ isMobile }) => !isMobile, 'pointer: coarse is the phone project');

  for (const route of ['songs/senja-di-teras', 'chords', 'progressions/ii-v-i', 'studio']) {
    test(`/${route} has no control under 44px`, async ({ page }) => {
      await page.goto(route);
      expect(await smallTargets(page)).toEqual([]);
    });
  }

  test('the MIDI editor has no control under 44px', async ({ page }) => {
    await page.goto('studio');
    await page.getByTestId('studio-new-midi').click();
    await expect(page.getByTestId('midi-header')).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
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
