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
