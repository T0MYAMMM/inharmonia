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

/** Each card's drawing panel: hidden from assistive tech, and on a phone, across the card's top. */
async function panels(page: Page) {
  return page.locator('main [class*="cardArt"]').evaluateAll((els) =>
    els.map((el) => {
      const card = el.parentElement!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        hidden: el.getAttribute('aria-hidden') === 'true',
        drawn: el.querySelector('svg[aria-hidden="true"]') !== null,
        height: Math.round(r.height),
        // The panel runs to the card's inner edges, inside its 1px border.
        flush: Math.abs(r.left - card.left - 1) < 1 && Math.abs(card.right - r.right - 1) < 1,
      };
    }),
  );
}

test.describe('drawings on cards', () => {
  const CARDS: [string, number][] = [['', 7]];

  for (const [route, count] of CARDS) {
    test(`/${route} draws each card, and keeps the page from scrolling sideways`, async ({
      page,
      isMobile,
    }) => {
      await page.goto(route);
      const found = await panels(page);
      expect(found).toHaveLength(count);
      for (const p of found) {
        expect(p.hidden && p.drawn).toBe(true);
        if (isMobile) expect(p).toMatchObject({ height: 64, flush: true });
        else expect(p.height).toBe(68);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
    });
  }

  test("Home's rooms include Studio, each card in its own room's colour", async ({ page }) => {
    await page.goto('');
    const rooms = page.locator('main a[data-room]');
    await expect(rooms).toHaveCount(7);
    expect(await rooms.evaluateAll((els) => els.map((e) => e.getAttribute('data-room')))).toEqual([
      'songs',
      'chords',
      'progressions',
      'fills',
      'ear',
      'studio',
      'progress',
    ]);
    await expect(page.getByRole('link', { name: /^Studio Beta Make a song/ })).toBeVisible();
  });
});
