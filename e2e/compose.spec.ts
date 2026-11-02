import { expect, test, type Page } from '@playwright/test';
import { writeMidi } from '../src/core/midi/smf';
import { openMidiMore } from './studioHelpers';

const RIGHTS =
  'You own this arrangement, or it is public domain, and you allow Inharmonia to distribute it free in the app; you keep your copyright.';

/** An invented tune, made in Studio from a MIDI file and saved to Your songs. */
async function makeInStudio(page: Page, title: string) {
  await page.goto('studio');
  await page.getByTestId('studio-import-midi').setInputFiles({
    name: `${title}.mid`,
    mimeType: 'audio/midi',
    buffer: Buffer.from(
      writeMidi({
        title,
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
            notes: [67, 71, 74, 72, 71, 69, 67, 67].map((midi, i) => ({
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
  await expect(page.getByRole('link', { name: /Open saved song in Your songs/ })).toBeVisible();
}

test.describe('composing for the catalogue', () => {
  test('is not linked from the app', async ({ page }) => {
    for (const route of ['', 'songs', 'studio']) {
      await page.goto(route);
      await expect(page.locator('a[href$="/compose"]')).toHaveCount(0);
    }
  });

  test('puts a Studio song together as a catalogue file, which imports to listen to', async ({
    page,
  }) => {
    await makeInStudio(page, 'Ferry tune');
    await page.goto('compose');
    await expect(
      page.getByRole('heading', { name: 'Compose for the catalogue', level: 1 }),
    ).toBeVisible();
    const download = page.getByRole('button', { name: /^Download/ });
    await expect(download).toBeDisabled();
    await expect(page.getByTestId('compose-issues')).toContainText(
      'Pick a song for at least one version.',
    );

    await page.getByTestId('compose-medium').selectOption({ label: 'Ferry tune: C major, 2 bars' });
    await page.getByTestId('compose-title').fill('Evening Ferry');
    await expect(page.getByTestId('compose-piece')).toHaveValue('evening-ferry');
    await page.getByTestId('compose-summary').fill('A slow tune for the crossing home.');
    await page.getByTestId('compose-author').fill('Ayu Lestari');
    await page.getByRole('checkbox', { name: RIGHTS }).check();
    await expect(
      page.getByText('Ready: it passes the same checks the catalogue runs.'),
    ).toBeVisible();

    const saving = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download evening-ferry.json' }).click();
    const file = await saving;
    expect(file.suggestedFilename()).toBe('evening-ferry.json');
    await expect(page.getByRole('status').filter({ hasText: 'Downloaded' })).toHaveText(
      'Downloaded evening-ferry.json.',
    );

    // Listen first: it comes in through Import, like any file.
    await page.goto('songs');
    await page.getByTestId('import-file').setInputFiles(await file.path());
    await expect(page.getByTestId('import-preview').getByTestId('import-summary')).toHaveText(
      '1 item in this file: 1 new.',
    );
    await page.getByTestId('import-preview').getByTestId('import-confirm').click();
    await expect(page.getByTestId('my-songs')).toContainText('Evening Ferry');
  });
});
