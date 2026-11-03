import { expect, test, type Page } from '@playwright/test';

/**
 * Lyrics stay on this device: left out of every export unless Include lyrics
 * is ticked, and read back as text. Charts are made through the UI.
 */

// Invented words, with a word no other text in the app has, to look for.
const MARK = 'zebra';
const SHEET = [
  '[Verse]',
  'C          G          Am         F',
  `${MARK} lanterns drift past quiet harbours`,
].join('\n');

async function sungChart(page: Page, title: string) {
  await page.goto('songs/charts/new');
  await page.getByTestId('chart-title').fill(title);
  await page.getByTestId('paste-text').fill(SHEET);
  await page.getByTestId('keep-lyrics').check();
  await page.getByTestId('paste-read').click();
  // One chord a bar, so each chord's words fill a bar of their own.
  await page
    .getByRole('radiogroup', { name: 'Bar lengths, line 2' })
    .getByRole('radio', { name: '1 a bar' })
    .click();
  await page.getByTestId('paste-use').click();
  await page.getByTestId('chart-save').click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

async function saved(page: Page, click: () => Promise<void>) {
  const download = page.waitForEvent('download');
  await click();
  const file = await download;
  let text = '';
  for await (const chunk of await file.createReadStream()) text += chunk;
  return { name: file.suggestedFilename(), text };
}

async function pasteImport(page: Page, text: string) {
  await page.goto('songs');
  await page.getByTestId('import-paste').click();
  await page.getByTestId('import-text').fill(text);
  await page.getByTestId('import-read').click();
  return page.getByTestId('import-preview');
}

test.describe('lyrics in exports', () => {
  test('a chart leaves them out unless Include lyrics is ticked, and they come back as kept', async ({
    page,
  }) => {
    await sungChart(page, 'Quiet harbours');
    const exportJson = async () =>
      saved(page, async () => {
        await page.getByTestId('export-menu').click();
        await page.getByTestId('export-download').click();
      });

    await page.getByTestId('export-menu').click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Include lyrics' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');
    const plain = await exportJson();
    expect(plain.name).toBe('inharmonia-chart-quiet-harbours.json');
    expect(plain.text).not.toContain(MARK);
    expect(plain.text).not.toContain('"lyrics"');
    await expect(
      page.getByRole('status').filter({ hasText: 'inharmonia-chart-quiet-harbours' }),
    ).toHaveText('Saved inharmonia-chart-quiet-harbours.json. Lyrics left out.');

    const sung = await saved(page, async () => {
      await page.getByTestId('export-menu').click();
      await page.getByRole('menuitemcheckbox', { name: 'Include lyrics' }).click();
      await expect(
        page.getByRole('menuitemcheckbox', { name: 'Include lyrics' }),
      ).toHaveAccessibleDescription('In the file: keep it to yourself.');
      await page.getByTestId('export-download').click();
    });
    // Each chord's column falls inside a word: the word goes to that chord's bar.
    expect(JSON.parse(sung.text).items[0].chart.sections[0].lyrics).toEqual([
      MARK,
      'lanterns drift',
      'past quiet',
      'harbours',
    ]);
    await expect(
      page.getByRole('status').filter({ hasText: 'inharmonia-chart-quiet-harbours' }),
    ).toHaveText('Saved inharmonia-chart-quiet-harbours.json, with lyrics.');
    // Opened again, it starts left out.
    await page.getByTestId('export-menu').click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Include lyrics' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');

    // Read back beside the one here: kept, with its lyrics.
    let preview = await pasteImport(page, sung.text);
    await expect(preview.getByRole('listitem')).toContainText('Quiet harbours (with its lyrics)');
    await preview.getByTestId('import-choice-1').selectOption('copy');
    await expect(preview.getByTestId('import-drops-lyrics-1')).toHaveCount(0);
    await preview.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-result')).toHaveText('Imported: 1 added.');
    const copies = page.getByTestId('my-songs').getByRole('link', { name: /Quiet harbours/ });
    await expect(copies).toHaveCount(2);
    await copies.first().click();
    await expect(page.locator('[data-score-view]').getByTestId('bar-lyric')).toHaveText([
      MARK,
      'lanterns drift',
      'past quiet',
      'harbours',
    ]);

    // Replacing it with the file without them says what that loses.
    preview = await pasteImport(page, plain.text);
    await expect(preview.getByRole('listitem')).not.toContainText('with its lyrics');
    await expect(preview.getByTestId('import-drops-lyrics-1')).toHaveCount(0);
    await preview.getByTestId('import-choice-1').selectOption('replace');
    await expect(preview.getByTestId('import-drops-lyrics-1')).toHaveText(
      'Replacing drops the lyrics kept here.',
    );
    await preview.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Your songs export leaves them out unless Include lyrics is ticked', async ({ page }) => {
    await sungChart(page, 'Quiet harbours');
    await page.goto('songs/charts/new');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('chart-title').fill('No words');
    await page.getByTestId('add-section').selectOption('Verse');
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'No words', level: 1 })).toBeVisible();

    await page.goto('songs');
    await page.getByTestId('export-open').click();
    const dialog = page.getByTestId('export-dialog');
    const box = dialog.getByRole('checkbox', { name: 'Include lyrics (1 chart)' });
    await expect(box).not.toBeChecked();
    await expect(dialog).toContainText(
      'Left out unless you tick this: lyrics stay on this device.',
    );
    const plain = await saved(page, () => dialog.getByTestId('export-download').click());
    expect(plain.text).not.toContain(MARK);
    await expect(dialog.getByTestId('export-status')).toHaveText(
      /^Saved inharmonia-export-\d{4}-\d\d-\d\d\.json: 2 items\. Lyrics left out of 1 chart\.$/,
    );
    await box.check();
    const sung = await saved(page, () => dialog.getByTestId('export-download').click());
    expect(sung.text).toContain(MARK);
    await expect(dialog.getByTestId('export-status')).toHaveText(
      /: 2 items\. Lyrics included for 1 chart\.$/,
    );
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('export-open').click();
    await expect(box).not.toBeChecked();
  });

  test('lyrics with markup in them stay text through an export and an import', async ({ page }) => {
    const markup = '<img src=x onerror="window.pwned=1">';
    await page.goto('songs/charts/new');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('chart-title').fill('Markup words');
    await page.getByTestId('add-section').selectOption('Verse');
    await page.getByRole('textbox', { name: 'Lyrics' }).fill(markup);
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'Markup words', level: 1 })).toBeVisible();
    const sung = await saved(page, async () => {
      await page.getByTestId('export-menu').click();
      await page.getByRole('menuitemcheckbox', { name: 'Include lyrics' }).click();
      await page.getByTestId('export-download').click();
    });
    const preview = await pasteImport(page, sung.text);
    await preview.getByTestId('import-choice-1').selectOption('copy');
    await preview.getByTestId('import-confirm').click();
    await page
      .getByTestId('my-songs')
      .getByRole('link', { name: /Markup words/ })
      .first()
      .click();
    await expect(page.locator('[data-score-view]').getByTestId('bar-lyric')).toHaveText(markup);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBe(
      undefined,
    );
    await expect(page.locator('main img')).toHaveCount(0);
  });
});

/** Everything this tab keeps in session and local storage, where handoffs and the sequence live. */
const stored = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify(
      [sessionStorage, localStorage].map((s) =>
        Object.fromEntries(Object.keys(s).map((k) => [k, s.getItem(k)])),
      ),
    ),
  );

test.describe('Send to', () => {
  test('never carries lyrics, to any room', async ({ page }) => {
    await sungChart(page, 'Quiet harbours');
    const chartUrl = page.url();
    const arrive = async (heading: RegExp | string) => {
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      expect(await stored(page)).not.toContain(MARK);
      await expect(page.locator('main')).not.toContainText(MARK);
    };

    // The chart as it plays, to Studio: Send to is under the player.
    await page
      .getByTestId('chart-actions')
      .getByRole('button', { name: /^Send to/ })
      .click();
    await page.getByRole('menuitem', { name: 'Studio' }).click();
    await arrive('MIDI piano-roll editor');

    // The verse's chords, to the chord sequence.
    await page.goto(chartUrl);
    await page.getByRole('button', { name: 'Send to the Verse' }).click();
    await page.getByRole('menuitem', { name: 'Chords' }).click();
    await expect(page.getByTestId('sequence-notice')).toHaveText(
      'Put the Verse of Quiet harbours in C major in the sequence.',
    );
    await arrive('Chords');

    // And to the progression builder.
    await page.goto(chartUrl);
    await page.getByRole('button', { name: 'Send to the Verse' }).click();
    await page.getByRole('menuitem', { name: 'Progressions' }).click();
    await arrive('New progression');

    // The chart keeps them.
    await page.goto(chartUrl);
    await expect(page.locator('[data-score-view]').getByTestId('bar-lyric').first()).toHaveText(
      MARK,
    );
  });
});
