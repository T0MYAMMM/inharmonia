import { expect, test, type Page } from '@playwright/test';
import { writeMidi } from '../src/core/midi/smf';
import { openMidiMore } from './studioHelpers';

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

  test('/chords with a sequence and a bar chosen has no control under 44px', async ({ page }) => {
    await page.goto('chords');
    const field = page.getByRole('textbox', { name: 'Type chords' });
    await field.fill('| C | Am | F G | G7 |');
    await field.press('Enter');
    await page.locator('[data-bar="2"]').click();
    await expect(page.getByTestId('bar-editor')).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    const bars = await page
      .locator('[data-bar]')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  });

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

/**
 * A chord chart with three sections and a note, as a player would have one:
 * enough progressions in it that their line in the header runs to two lines
 * on a phone.
 */
async function makeChart(page: Page) {
  await page.goto('songs/charts/new');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('chart-title').fill('Harbour lights');
  await page.getByTestId('chart-notes').fill('Slow down in the last chorus.');
  const sections = [
    ['Verse', '| C | G | Am | F |\n| C | G | Am | F |'],
    ['Chorus', '| Am | F | C | G |'],
    ['Bridge', '| Dm7 | G7 | Cmaj7 | A7 |\n| Dm7 | G7 | C | N.C. |'],
  ] as const;
  for (const [i, [label, bars]] of sections.entries()) {
    await page.getByTestId('add-section').selectOption(label);
    await page.getByTestId(`edit-text-${i}`).click();
    await page.getByTestId('bars-text').fill(bars);
    await page.getByTestId('bars-apply').click();
  }
  await page.getByTestId('chart-save').click();
  await expect(page.getByRole('heading', { name: 'Harbour lights', level: 1 })).toBeVisible();
}

/** A song of your own, from a MIDI file opened in Studio and saved. */
async function makeMySong(page: Page) {
  await page.goto('studio');
  await page.getByTestId('studio-import-midi').setInputFiles({
    name: 'Evening tune.mid',
    mimeType: 'audio/midi',
    buffer: Buffer.from(
      writeMidi({
        title: 'Evening tune',
        ppq: 480,
        tempo: 90,
        meter: { beats: 4, unit: 4 },
        tempos: [{ beat: 0, bpm: 90 }],
        meters: [{ beat: 0, numerator: 4, denominator: 4 }],
        tracks: [
          {
            id: 'melody',
            name: 'Melody',
            channel: 0,
            program: 0,
            muted: false,
            notes: [60, 64, 67, 72, 67, 64, 65, 69].map((midi, i) => ({
              id: `n${i}`,
              midi,
              startBeat: i,
              beats: 1,
              velocity: 90,
            })),
          },
        ],
      }),
    ),
  });
  await openMidiMore(page);
  await page.getByTestId('midi-save-song').click();
  await page.getByRole('link', { name: /Open saved song in My songs/ }).click();
  await expect(page.getByRole('heading', { name: 'Evening tune', level: 1 })).toBeVisible();
}

test.describe('Play on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'a 360x780 phone is the mobile project');

  /** Play's whole button inside the first screen, once the page has settled. */
  async function playInFirstScreen(page: Page) {
    const play = page.getByTestId('play');
    await expect(play).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Long enough for anything that would scroll the page on load to have done it.
    await page.waitForTimeout(1500);
    const box = await play.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: window.innerHeight, scrolled: window.scrollY };
    });
    expect(box.scrolled, 'the page scrolled by itself').toBe(0);
    expect(box.top, 'Play is above the screen').toBeGreaterThanOrEqual(0);
    expect(box.bottom, `Play ends ${Math.round(box.bottom)}px down`).toBeLessThanOrEqual(
      box.height,
    );
  }

  for (const [name, route] of [
    ['a song', 'songs/minuet-in-g-easy'],
    ['a fill', 'fills/step-up'],
    ['a progression', 'progressions/ii-v-i'],
  ] as const) {
    test(`on ${name}, Play is in the first screen`, async ({ page }) => {
      await page.goto(route);
      await playInFirstScreen(page);
    });
  }

  test('on a chord chart, Play is in the first screen', async ({ page }) => {
    await makeChart(page);
    await page.reload();
    // The progressions found take two lines here; Play is still in view.
    await expect(page.getByTestId('chart-found')).toHaveText(
      'Progressions in it: I–V–vi–IV, vi–IV–I–V, ii–V–I. By section ↓',
    );
    const lines = await page.getByTestId('chart-found').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.bottom))).size;
    });
    expect(lines).toBe(2);
    await playInFirstScreen(page);
  });

  test('on a song of your own, Play is in the first screen', async ({ page }) => {
    await makeMySong(page);
    await page.reload();
    await playInFirstScreen(page);
  });
});
