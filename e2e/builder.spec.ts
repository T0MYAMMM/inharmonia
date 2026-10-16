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

  test('exports and imports progressions', async ({ page }) => {
    await create(page, 'Keep me', 'I V');
    await page.goto('progressions');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const file = await download;
    const stream = await file.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk;
    const doc = JSON.parse(text);
    expect(doc.progressions.map((p: { name: string }) => p.name)).toEqual(['Keep me']);

    doc.progressions.push(
      { ...doc.progressions[0], name: 'From a friend', steps: [{ numeral: 'vi', beats: 4 }] },
      { ...doc.progressions[0], name: 'Broken', steps: [{ numeral: 'Q', beats: 4 }] },
    );
    await page.getByTestId('import-file').setInputFiles({
      name: 'progressions.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await expect(page.getByRole('status')).toContainText('Added 1 progression.');
    await expect(page.getByRole('status')).toContainText('1 was already saved.');
    await expect(page.getByRole('status')).toContainText('"Broken": Bar 1');
    await expect(page.getByRole('link', { name: /From a friend/ })).toBeVisible();
  });
});
