import { expect, test, type Page } from '@playwright/test';

const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name' });

async function create(page: Page, name: string, chords: string) {
  await page.goto('progressions/new');
  await nameBox(page).fill(name);
  await page.getByLabel('Chords').fill(chords);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/progressions\/mine-/);
}

test.describe('progression builder', () => {
  test('writes, checks, saves, reloads and plays a progression', async ({ page }) => {
    await page.goto('progressions');
    await expect(page.getByText('Nothing saved yet.')).toBeVisible();
    await page.getByRole('link', { name: 'New progression' }).click();

    // Saving an empty form explains what's missing.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Give it a name.')).toBeVisible();
    await expect(page.getByText('Add at least one chord.')).toBeVisible();

    await nameBox(page).fill('Evening loop');
    await page.getByLabel('Chords').fill('Imaj7 vix ii7,V7');
    await expect(page.getByText(/Bar 2: "vix" isn't a numeral/)).toBeVisible();
    await page.getByLabel('Chords').fill('Imaj7 vi7 ii7,V7');
    await page.getByRole('button', { name: 'Add V7/V' }).click();
    await expect(page.getByLabel('Chords')).toHaveValue('Imaj7 vi7 ii7,V7 V7/V');
    await page.getByTestId('preview-key').selectOption('Eb');
    await expect(page.getByRole('button', { name: 'Play V7/V, F7' })).toBeVisible();
    await expect(page.getByText(/isn't a numeral/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/progressions\/mine-evening-loop-/);
    await expect(page.getByRole('heading', { name: 'Evening loop' })).toBeVisible();
    await expect(page.getByTestId('status-line')).toHaveText('Bar 1 of 8, Cmaj7');
    await expect(page.locator('[data-bar="3"]')).toContainText('D7');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Evening loop' })).toBeVisible();
    await page.goto('progressions');
    await expect(page.getByRole('link', { name: /Evening loop/ })).toBeVisible();
  });

  test('edits and deletes a saved progression', async ({ page }) => {
    await create(page, 'Draft', 'I IV');
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByLabel('Chords')).toHaveValue('I IV');
    await nameBox(page).fill('Two chords');
    await page.getByRole('radio', { name: 'Minor' }).click();
    await page.getByLabel('Chords').fill('i iv');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Two chords' })).toBeVisible();
    await expect(page.getByTestId('status-line')).toHaveText('Bar 1 of 4, Cm');

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete for good?' }).click();
    await expect(page).toHaveURL(/\/progressions$/);
    await expect(page.getByText('Nothing saved yet.')).toBeVisible();
  });

  test('copies a built-in progression to change it', async ({ page }) => {
    await page.goto('progressions/ii-v-i');
    await page.getByRole('link', { name: 'Make a copy to edit' }).click();
    await expect(nameBox(page)).toHaveValue('ii–V–I (my version)');
    await expect(page.getByLabel('Chords')).toHaveValue('ii7 V7 Imaj7 Imaj7');
    await page.getByLabel('Chords').fill('ii7 V7 Imaj7 VI7');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'ii–V–I (my version)' })).toBeVisible();
  });

  test('exports and imports progressions in the shared format', async ({ page }) => {
    await create(page, 'Keep me', 'I V');
    await page.goto('progressions');
    await page.getByTestId('export-open').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('export-dialog').getByTestId('export-download').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('inharmonia-progression-keep-me.json');
    const stream = await file.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk;
    const doc = JSON.parse(text);
    expect(doc).toMatchObject({ format: 'inharmonia', version: 2 });
    expect(doc.items.map((i: { kind: string; title: string }) => [i.kind, i.title])).toEqual([
      ['progression', 'Keep me'],
    ]);
    await page.getByTestId('export-dialog').getByRole('button', { name: 'Close' }).click();

    doc.items.push({
      ...doc.items[0],
      id: 'from-a-friend',
      title: 'From a friend',
      progression: { ...doc.items[0].progression, steps: [{ numeral: 'vi', beats: 4 }] },
    });
    await page.getByTestId('import-file').setInputFiles({
      name: 'progressions.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    const preview = page.getByTestId('import-preview');
    await expect(preview.getByTestId('import-summary')).toHaveText(
      '2 items in this file: 1 new, 1 already here.',
    );
    await preview.getByTestId('import-choice-1').selectOption('copy');
    await preview.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-result')).toHaveText('Imported: 2 added.');
    await expect(page.getByRole('link', { name: /From a friend/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Keep me/ })).toHaveCount(2);

    // A broken file names the item and field, and saves nothing.
    doc.items[0].progression.steps = [{ numeral: 'Q', beats: 4 }];
    await page.getByTestId('import-file').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await expect(preview.getByTestId('import-errors')).toContainText(
      'Item 1 (Keep me), progression:',
    );
    await expect(preview.getByTestId('import-confirm')).toBeDisabled();
  });
});
