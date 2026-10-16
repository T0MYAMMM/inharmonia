import { expect, test, type Page } from '@playwright/test';
import { fakeMic, fastTakes, sing } from './studioHelpers';

/** An arpeggio written for this test: C E G E | F A C A | G B D B | C. */
const MELODY: [number, number, number][] = [
  [0, 1, 60],
  [1, 1, 64],
  [2, 1, 67],
  [3, 1, 64],
  [4, 1, 65],
  [5, 1, 69],
  [6, 1, 72],
  [7, 1, 69],
  [8, 1, 67],
  [9, 1, 71],
  [10, 1, 74],
  [11, 1, 71],
  [12, 4, 72],
];

async function recordAndEdit(page: Page) {
  await fastTakes(page);
  await fakeMic(page);
  await page.goto('studio');
  await page.getByTestId('enable-mic').click();
  await expect(page.getByTestId('record')).toBeEnabled();
  await sing(page, MELODY);
  await page.getByTestId('record').click();
  await expect(page.getByTestId('take-summary')).toContainText('13 notes in C major', {
    timeout: 20000,
  });
  await page.getByTestId('edit-draft').click();
  await expect(page.getByRole('heading', { name: 'Edit your song' })).toBeVisible();
}

test.describe('my songs', () => {
  test('edit a take, save it with its recording, find it again after a reload', async ({
    page,
    isMobile,
  }) => {
    test.slow();
    await recordAndEdit(page);
    const notes = page.locator('[data-note]');
    await expect(notes).toHaveCount(13);
    await expect(page.getByTestId('chord-0')).toHaveValue('C');

    // Keyboard editing: the first note up a tone, then undo one step.
    await notes.first().focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('editor-status')).toHaveText('Up: D4, bar 1, beat 1, 1 beat');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(notes.first()).toHaveAttribute('aria-label', 'D♭4, bar 1, beat 1, 1 beat');
    // Delete the last note, and change the second chord.
    await notes.last().focus();
    await page.keyboard.press('Delete');
    await expect(notes).toHaveCount(12);
    await page.getByTestId('chord-1').selectOption('Dm');

    if (!isMobile) {
      // Drag the second note (E4 on beat 2) one beat to the right.
      const second = notes.nth(1);
      await expect(second).toHaveAttribute('aria-label', 'E4, bar 1, beat 2, 1 beat');
      const box = (await second.boundingBox())!;
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 10 + 48, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect(page.getByTestId('editor-status')).toHaveText(
        'Moved: E4, bar 1, beat 3, 1 beat',
      );
      // It took the place of G4; undo puts G4 back.
      await expect(notes).toHaveCount(11);
      await page.keyboard.press('ControlOrMeta+z');
      await expect(notes).toHaveCount(12);
    }

    await page.getByTestId('song-title').fill('Arpeggio study');
    await expect(page.getByTestId('keep-recording')).not.toBeChecked();
    await page.getByTestId('keep-recording').check();
    await page.getByTestId('save-song').click();
    await page
      .getByTestId('save-status')
      .getByRole('link', { name: 'Open it in My songs' })
      .click();

    await expect(page.getByRole('heading', { name: 'Arpeggio study', level: 1 })).toBeVisible();
    await expect(page.getByText('Private', { exact: true })).toBeVisible();
    await expect(page.getByText(/Recording kept, [\d.]+ (MB|KB)/)).toBeVisible();
    await expect(page.locator('[data-bar="1"]')).toContainText('Dm');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Arpeggio study', level: 1 })).toBeVisible();
    await page.goto('songs');
    const mine = page.getByTestId('my-songs');
    await expect(mine.getByRole('link')).toHaveCount(1);
    await expect(mine).toContainText('Arpeggio study');
    await expect(mine).toContainText('Private');

    // Edit it again: the kept recording brings back A/B and the pitch line.
    await mine.getByRole('link').click();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Arpeggio study' })).toBeVisible();
    await expect(page.locator('[data-note]')).toHaveCount(12);
    await expect(page.getByRole('radio', { name: 'A: your take' })).toBeVisible();
    await expect(page.getByTestId('keep-recording')).toBeChecked();
  });

  test('export, delete, and import again; recordings stay behind', async ({ page }) => {
    test.slow();
    await recordAndEdit(page);
    await page.getByTestId('song-title').fill('Backup me');
    await page.getByTestId('keep-recording').check();
    await page.getByTestId('save-song').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    await page.goto('songs');
    const download = page.waitForEvent('download');
    await page.getByTestId('export-songs').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^inharmonia-my-songs-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await file.path();
    await expect(page.getByTestId('my-songs-status')).toContainText(
      'Exported 1 song. Recordings stay on this device.',
    );

    await page.getByTestId('my-songs').getByRole('link').click();
    await page.getByTestId('delete-recording').click();
    await expect(page.getByText('No recording kept.')).toBeVisible();
    await page.getByTestId('delete-song').click();
    await page.getByTestId('confirm-delete').click();
    await expect(page).toHaveURL(/\/songs$/);
    await expect(page.getByText('Nothing yet.')).toBeVisible();

    await page.getByTestId('import-songs').setInputFiles(path);
    await expect(page.getByTestId('my-songs-status')).toHaveText('Imported: 1 added.');
    await expect(page.getByTestId('my-songs')).toContainText('Backup me');
    await expect(page.getByTestId('my-songs')).not.toContainText('Recording kept');
    await page.getByTestId('import-songs').setInputFiles(path);
    await expect(page.getByTestId('my-songs-status')).toHaveText('Imported: 1 already here.');

    await page.getByTestId('import-songs').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello": 1}'),
    });
    await expect(page.getByTestId('my-songs-status')).toHaveText(
      'This file is not an Inharmonia export.',
    );
  });
});
