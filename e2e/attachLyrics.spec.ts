import { expect, test, type Page } from '@playwright/test';

/**
 * Add lyrics: the words of a pasted chord sheet put on a saved chart's bars,
 * its chords untouched. The chart, the sheet and every word are invented.
 */

/** A chart with its chords and lengths but no words: verse, chorus, verse, chorus. */
async function savedChart(page: Page, title: string) {
  await page.goto('songs/charts/new');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('chart-title').fill(title);
  await page.getByTestId('add-section').selectOption('Verse');
  await page.getByTestId('edit-text-0').click();
  await page.getByTestId('bars-text').fill('| C | G | Am | F |');
  await page.getByTestId('bars-apply').click();
  await page.getByTestId('add-section').selectOption('Chorus');
  await page.getByTestId('edit-text-1').click();
  await page.getByTestId('bars-text').fill('| F | G | C | C |');
  await page.getByTestId('bars-apply').click();
  await page.getByTestId('form-add').selectOption({ label: 'Verse' });
  await page.getByTestId('form-add').selectOption({ label: 'Chorus' });
  await page.getByTestId('chart-save').click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

// Written two semitones up (a capo on 2), with a second verse of its own words.
const SHEET = [
  '[Verse]',
  'D              A',
  'paper lanterns drift along',
  'Bm             G',
  'over water slow and long',
  '[Chorus]',
  'G          A          D',
  'carry me home on the tide',
  '',
  '[Verse 2]',
  'D              A',
  'morning gulls above the pier',
  'Bm             G',
  'calling out the year is here',
  '[Chorus]',
  'G          A          D',
  'carry me home on the tide',
].join('\n');

const PLAYED = [
  ...['paper lanterns', 'drift along', 'over water slow', 'and long'],
  ...['carry me', 'home on the', 'tide'],
  ...['morning gulls', 'above the pier', 'calling out the', 'year is here'],
  ...['carry me', 'home on the', 'tide'],
];

/** No sideways scroll, at any width. */
async function noSideways(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(scroll, 'the page scrolls sideways').toBeLessThanOrEqual(inner);
}

async function readSheet(page: Page) {
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByTestId('lyrics-open').click();
  await page.getByRole('textbox', { name: 'Chord sheet with lyrics' }).fill(SHEET);
  await page.getByTestId('lyrics-read').click();
}

test.describe('add lyrics from a sheet', () => {
  test('paste, preview, apply, save; the chart page shows them under the same chords', async ({
    page,
    isMobile,
  }) => {
    await savedChart(page, 'Lantern tide');
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await readSheet(page);

    await expect(page.getByTestId('lyrics-summary')).toHaveText(
      'Lyrics for 14 of 16 bars · sheet is 2 semitones up',
    );
    await expect(page.getByText('Verse 2 is Verse again, with its own words.')).toBeVisible();
    const verse2 = page.getByRole('region', { name: 'Verse 2 with lyrics' });
    await expect(verse2).toContainText('A copy of Verse. 4 of 4 chords matched');
    await expect(verse2.getByRole('listitem')).toHaveText([
      '1Cmorning gulls',
      '2Gabove the pier',
      '3Amcalling out the',
      '4Fyear is here',
    ]);
    await expect(
      page.getByRole('region', { name: 'Chorus with lyrics' }).getByRole('listitem'),
    ).toHaveText(['1Fcarry me', '2Ghome on the', '3Ctide', '4CNo words']);
    await noSideways(page);
    // Reading went nowhere.
    expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([]);

    await page.getByTestId('lyrics-apply').click();
    await expect(page.getByTestId('lyrics-added')).toHaveText(
      'Lyrics in place. Save to keep them.',
    );
    await expect(
      page.getByTestId('section-1').getByRole('textbox', { name: 'Section' }),
    ).toHaveValue('Verse 2');
    await expect(page.getByTestId('form').getByRole('listitem')).toHaveText([
      /^Verse/,
      /^Chorus/,
      /^Verse 2/,
      /^Chorus/,
    ]);
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'Lantern tide', level: 1 })).toBeVisible();
    await page.reload();

    await expect(page.getByRole('button', { name: 'Show lyrics' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const score = page.locator('[data-score-view]');
    await expect(score.getByTestId('bar-lyric')).toHaveText(PLAYED);
    // The chords are the chart's own, in its own key, 16 bars as before.
    await expect(page.getByText(/4\/4, 16 bars, 80 bpm/)).toBeVisible();
    await expect(page.locator('[data-bar="4"]')).toContainText('F');
    await expect(page.locator('[data-bar="8"]')).toContainText('C');
    await noSideways(page);

    if (!isMobile) return;
    // On a phone, Play is still in the first screen of the chart.
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
  });

  test('asks before replacing the lyrics a chart has, and Keep them keeps them', async ({
    page,
  }) => {
    await savedChart(page, 'Tide words');
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByTestId('bar-0-0').click();
    await page.getByRole('textbox', { name: 'Lyrics' }).fill('words typed by hand');
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'Tide words', level: 1 })).toBeVisible();

    await readSheet(page);
    await page.getByTestId('lyrics-apply').click();
    const ask = page.getByRole('group', {
      name: 'This chart has lyrics. Replace them with these?',
    });
    await expect(ask.getByRole('button', { name: 'Replace them' })).toBeFocused();
    await noSideways(page);
    await ask.getByRole('button', { name: 'Keep them' }).click();
    await expect(page.getByTestId('lyrics-apply')).toBeFocused();
    await page.getByTestId('lyrics-cancel').click();
    await expect(page.getByTestId('bar-0-0')).toHaveText('1Cwords typed by hand');

    await page.getByTestId('lyrics-open').click();
    await page.getByRole('textbox', { name: 'Chord sheet with lyrics' }).fill(SHEET);
    await page.getByTestId('lyrics-read').click();
    await page.getByTestId('lyrics-apply').click();
    await page.getByTestId('lyrics-replace').click();
    await expect(page.getByTestId('bar-0-0')).toHaveText('1Cpaper lanterns');
  });

  test('Back keeps the text and Cancel changes nothing', async ({ page }) => {
    await savedChart(page, 'Quiet pier');
    await readSheet(page);
    await page.getByTestId('lyrics-back').click();
    const box = page.getByRole('textbox', { name: 'Chord sheet with lyrics' });
    await expect(box).toHaveValue(SHEET);
    await expect(box).toBeFocused();
    await page.getByTestId('lyrics-cancel').click();
    await expect(page.getByTestId('add-lyrics')).toHaveCount(0);
    await expect(page.getByTestId('section-0').getByTestId('bar-lyric')).toHaveCount(0);
  });
});
