import { expect, test, type Page } from '@playwright/test';

// An invented chord sheet: made-up chords, placeholder lyric text, and one chord to fix.
const SHEET = [
  '[Intro]',
  'C   G   Am   F',
  '',
  'Bait:',
  'C      G      Am     Hx',
  'la la la lyric line here',
  'la la la la',
  '',
  'Reff 2x',
  'F    G    C    Am',
  'lyric line here la la',
  '',
  '[Reff]',
].join('\n');

async function readDownload(page: Page, click: () => Promise<void>) {
  const download = page.waitForEvent('download');
  await click();
  const file = await download;
  const stream = await file.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  return { name: file.suggestedFilename(), text };
}

test.describe('chord charts', () => {
  test('paste a sheet, fix it, save it, and see it again after a reload', async ({ page }) => {
    await page.goto('songs');
    await page.getByTestId('new-chart').click();
    await expect(page.getByRole('heading', { name: 'New chord chart', level: 1 })).toBeVisible();
    await page.getByTestId('chart-title').fill('Practice chart');
    await page.getByTestId('paste-text').fill(SHEET);
    await page.getByTestId('paste-read').click();

    await expect(page.getByTestId('lyrics-notice')).toHaveText(
      'Lyrics removed from 3 lines. Only chords and section names are kept. 1 chord could not be read: fix it in the grid before saving.',
    );
    const review = page.getByTestId('paste-review');
    await expect(review.getByRole('row').filter({ hasText: 'Lyrics removed' })).toHaveCount(3);
    await expect(review).toContainText('Section: Reff ×2');
    await expect(review).toContainText("Can't read: Hx");
    await page.getByTestId('paste-use').click();

    await expect(page.getByTestId('chart-issues')).toContainText(
      'Bait, bar 4: "Hx" is not a chord',
    );
    await expect(page.getByTestId('chart-save')).toBeDisabled();
    await page.getByTestId('bar-1-3').click();
    await page.getByTestId('bar-editor').getByTestId('chord-input-0').fill('F');
    await expect(page.getByTestId('chart-issues')).toHaveCount(0);
    await expect(page.getByTestId('key-suggestion')).toContainText('C major');
    await expect(page.getByTestId('form').getByRole('listitem')).toHaveText([
      /Intro/,
      /Bait/,
      /Reff ×2/,
      /Reff ×2/,
    ]);
    await page.getByTestId('chart-notes').fill('Slow down in the last chorus.');
    await page.getByTestId('chart-save').click();

    await expect(page.getByRole('heading', { name: 'Practice chart', level: 1 })).toBeVisible();
    await expect(page.getByText('Private', { exact: true })).toBeVisible();
    await expect(page.getByText('C major, 4/4, 24 bars, 80 bpm')).toBeVisible();
    await expect(page.getByTestId('chart-notes-view')).toHaveText('Slow down in the last chorus.');
    await expect(page.getByRole('heading', { name: 'Bait', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Show function' }).click();
    await expect(page.locator('[data-bar="2"]')).toContainText('vi');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Practice chart', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show function' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The export is readable, keeps the view, and has no lyric text in it.
    const { name, text } = await readDownload(page, async () => {
      await page.getByTestId('export-menu').click();
      await page.getByTestId('export-download').click();
    });
    expect(name).toBe('inharmonia-chart-practice-chart.json');
    const doc = JSON.parse(text);
    expect(
      doc.items[0].chart.sections.map((s: { label: string; bars: string[] }) => [
        s.label,
        s.bars.join(' | '),
      ]),
    ).toEqual([
      ['Intro', 'C | G | Am | F'],
      ['Bait', 'C | G | Am | F'],
      ['Reff', 'F | G | C | Am'],
    ]);
    expect(doc.items[0].view).toMatchObject({ showFunction: true });
    expect(text).not.toMatch(/la la|lyric/);

    // Paste it back as JSON and keep both.
    await page.goto('songs');
    await page.getByTestId('import-paste').click();
    await page.getByTestId('import-text').fill(text);
    await page.getByTestId('import-read').click();
    const preview = page.getByTestId('import-preview');
    await expect(preview.getByTestId('import-summary')).toHaveText(
      '1 item in this file: 0 new, 1 already here.',
    );
    await preview.getByTestId('import-choice-1').selectOption('copy');
    await preview.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-result')).toHaveText('Imported: 1 added.');
    await expect(
      page.getByTestId('my-songs').getByRole('link', { name: /Practice chart/ }),
    ).toHaveCount(2);
  });

  test('keep lyrics when pasting: kept on this device, and unticked every time', async ({
    page,
  }) => {
    await page.goto('songs/charts/new');
    const keep = page.getByRole('checkbox', { name: 'Keep lyrics' });
    await expect(keep).not.toBeChecked();
    await page.getByTestId('paste-text').fill(SHEET);
    await keep.check();
    await page.getByTestId('paste-read').click();
    await expect(page.getByTestId('lyrics-notice')).toHaveText(
      'Lyrics kept from 2 lines, on this device only. 1 line left out: lyrics are kept only right under their chords. 1 chord could not be read: fix it in the grid before saving.',
    );
    const review = page.getByTestId('paste-review');
    await expect(review.getByRole('row').filter({ hasText: 'Lyrics kept' })).toHaveText([
      /la la la lyric line here\s*Lyrics kept: la la \| la lyric \| line \| here/,
      /lyric line here la la\s*Lyrics kept: lyric \| line \| here \| la la/,
    ]);
    await expect(review.getByRole('row').filter({ hasText: 'Left out' })).toHaveText(
      /la la la la\s*Left out: no chords right above it/,
    );
    // Unticked, it reads as it always has.
    await keep.uncheck();
    await expect(page.getByTestId('lyrics-notice')).toHaveText(
      /^Lyrics removed from 3 lines\. Only chords and section names are kept\./,
    );
    // Back to the text and out: the next paste starts unticked.
    await page.getByRole('button', { name: 'Back to the text' }).click();
    await keep.check();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('paste-open').click();
    await expect(page.getByRole('checkbox', { name: 'Keep lyrics' })).not.toBeChecked();
  });

  test('type lyrics bar by bar; they are saved with the chart', async ({ page }) => {
    await page.goto('songs/charts/new');
    await expect(
      page.getByText('Lyrics are kept only if you ask, and only on this device.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('chart-title').fill('Typed words');
    await page.getByTestId('add-section').selectOption('Verse');
    await page.getByTestId('edit-text-0').click();
    await page.getByTestId('bars-text').fill('| C | G | Am | F |');
    await page.getByTestId('bars-apply').click();
    // A new section opens on its first bar.
    await expect(page.getByTestId('bar-0-0')).toHaveAttribute('aria-pressed', 'true');
    const lyrics = page.getByRole('textbox', { name: 'Lyrics' });
    await lyrics.fill('lanterns on the water');
    await lyrics.press('Enter');
    await expect(page.getByTestId('bar-0-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(lyrics).toBeFocused();
    await page.keyboard.type('slow boats');
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'Typed words', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByTestId('bar-0-0')).toContainText('lanterns on the water');
    await expect(page.getByTestId('bar-0-1')).toContainText('slow boats');
    await expect(page.getByTestId('bar-0-2').getByTestId('bar-lyric')).toHaveCount(0);
  });

  test('type bars in chart syntax', async ({ page }) => {
    await page.goto('songs/charts/new');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('add-section').selectOption('Verse');
    await page.getByTestId('edit-text-0').click();
    await page.getByTestId('bars-text').fill('| C | G/B | Am7 F |\n| C . . G | N.C. | x2');
    await page.getByTestId('bars-apply').click();
    await expect(page.getByTestId('section-0').getByRole('listitem')).toHaveCount(7);
    // A trailing x2 repeats its own line.
    await expect(page.getByTestId('bar-0-4')).toContainText('N.C.');
    await expect(page.getByTestId('bar-0-6')).toContainText('N.C.');
    await page.getByTestId('chart-title').fill('Typed chart');
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'Typed chart', level: 1 })).toBeVisible();
    await expect(page.getByText('C major, 4/4, 7 bars, 80 bpm')).toBeVisible();
  });
});
