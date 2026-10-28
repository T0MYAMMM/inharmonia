import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Send to: what plays on one page, sent to another room, and the way back.
 * Charts and sequences are made through the UI, as a player would.
 */

/** A chart of three sections: a pop loop twice, its turn from vi, and a bridge with a ii–V–I. */
async function makeChart(page: Page, title = 'Harbour lights') {
  await page.goto('songs/charts/new');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('chart-title').fill(title);
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
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

async function typeChords(page: Page, text: string) {
  const field = page.getByRole('textbox', { name: 'Type chords' });
  await field.fill(text);
  await field.press('Enter');
}

/** Open a Send to menu (the page's, or one inside `scope`) and choose a room. */
async function sendTo(page: Page, room: string, scope: Locator | Page = page.locator('header')) {
  await scope.getByRole('button', { name: /^Send to/ }).click();
  await page.getByRole('menuitem', { name: room }).click();
}

const studioTitle = (page: Page) => page.getByRole('textbox', { name: 'Title' });

test.describe('Send to Studio', () => {
  test('a chart opens as it plays, keeps through a reload, and goes back', async ({ page }) => {
    await makeChart(page);
    await page.getByTestId('transpose').selectOption('-5');
    const chartUrl = page.url();
    await sendTo(page, 'Studio');

    await expect(page).toHaveURL(/\/studio\?sent=[a-z0-9]{6}$/);
    await expect(
      page.getByRole('heading', { name: 'MIDI piano-roll editor', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('sent-said')).toHaveText(
      'Sent from your chart Harbour lights: G major, chords as written, the Triad and root accompaniment. Save keeps a copy in My songs; the chart stays as it is.',
    );
    await expect(studioTitle(page)).toHaveValue('Harbour lights (chart, G major)');
    await expect(page.getByTestId('midi-track')).toHaveCount(1);
    await expect(page.getByTestId('midi-track')).toContainText('Chords');
    const notes = await page.getByTestId('midi-track').textContent();

    // A reload, and a reload the way GitHub Pages' 404 page brings it back.
    await page.reload();
    await expect(studioTitle(page)).toHaveValue('Harbour lights (chart, G major)');
    const sent = new URL(page.url()).searchParams.get('sent')!;
    await page.goto(`?/studio&sent=${sent}`);
    await expect(page).toHaveURL(new RegExp(`/studio\\?sent=${sent}$`));
    await expect(studioTitle(page)).toHaveValue('Harbour lights (chart, G major)');
    await expect(page.getByTestId('midi-track')).toHaveText(notes!);

    await page.getByTestId('sent-back').click();
    await expect(page).toHaveURL(chartUrl);
    await expect(page.getByRole('heading', { name: 'Harbour lights', level: 1 })).toBeVisible();
  });

  test('a progression opens in the key and pattern it plays in', async ({ page }) => {
    await page.goto('progressions/ii-v-i?key=G&pattern=block');
    await sendTo(page, 'Studio');
    await expect(studioTitle(page)).toHaveValue('ii–V–I (progression, G major)');
    await expect(page.getByTestId('sent-said')).toContainText(
      'Sent from the progression ii–V–I: G major, the Block chords pattern, Close voicing, smooth voice leading, twice through.',
    );
    await expect(page.getByTestId('midi-track')).toContainText('Chords');
    await page.getByTestId('sent-back').click();
    await expect(page).toHaveURL(/\/progressions\/ii-v-i\?key=G&pattern=block$/);
    await expect(page.getByTestId('key')).toHaveValue('G');
  });

  test('a song opens with the arrangement chosen on its page', async ({ page }) => {
    await page.goto('songs/minuet-in-g-easy?pattern=waltz');
    await sendTo(page, 'Studio');
    await expect(studioTitle(page)).toHaveValue('Minuet in G (song, Easy)');
    await expect(page.getByTestId('sent-said')).toHaveText(
      'Sent from the song Minuet in G: G major, the Easy version, with the arrangement chosen here. Save keeps a copy in My songs; the song stays as it is.',
    );
    await expect(page.getByTestId('midi-track')).toHaveCount(2);
    await page.getByTestId('sent-back').click();
    await expect(page).toHaveURL(/\/songs\/minuet-in-g-easy\?pattern=waltz$/);
  });

  test('the chord sequence opens once through; with no chords there is nothing to send', async ({
    page,
  }) => {
    await page.goto('chords');
    const sequence = page.getByTestId('sequence');
    await expect(sequence.getByRole('button', { name: /^Send to/ })).toHaveCount(0);
    await typeChords(page, 'N.C. N.C.');
    await sequence.getByRole('button', { name: /^Send to/ }).click();
    const studio = page.getByRole('menuitem', { name: 'Studio' });
    await expect(studio).toHaveAttribute('aria-disabled', 'true');
    await expect(studio).toHaveAccessibleDescription('Every bar is N.C.: nothing to send');
    await expect(studio).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/chords$/);
    await expect(studio).toBeVisible();
    await page.keyboard.press('Escape');

    await sequence.getByRole('button', { name: 'Clear' }).click();
    await typeChords(page, 'C Am F G');
    await sendTo(page, 'Studio', sequence);
    await expect(studioTitle(page)).toHaveValue('Chord sequence (C major)');
    await expect(page.getByTestId('sent-said')).toContainText(
      'Sent from your chord sequence: 4 bars in C major, the Triad and root accompaniment, once through.',
    );
    await page.getByTestId('sent-back').click();
    await expect(page).toHaveURL(/\/chords$/);
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in C major');
  });

  test('says so when what was sent is gone or cannot be read, and opens Studio as usual', async ({
    page,
  }) => {
    await page.goto('studio?sent=nope00');
    await expect(page.getByTestId('sent-problem')).toHaveText(
      'What was sent here is no longer available: it lasts until the next thing is sent.',
    );
    await expect(page.getByTestId('studio-new-midi')).toBeVisible();

    await page.goto('progressions/ii-v-i');
    await sendTo(page, 'Studio');
    await expect(studioTitle(page)).toHaveValue('ii–V–I (progression, C major)');
    await page.evaluate(() => {
      const key = 'inharmonia:handoff:studio';
      const doc = JSON.parse(sessionStorage.getItem(key)!);
      doc.state.handoff.project.tracks = 'none';
      sessionStorage.setItem(key, JSON.stringify(doc));
    });
    await page.reload();
    await expect(page.getByTestId('sent-problem')).toHaveText(
      'What was sent here could not be read, so nothing was opened.',
    );
    await expect(page.getByTestId('midi-header')).toHaveCount(0);
  });

  test('a title with markup in it stays text all the way', async ({ page }) => {
    const title = '<img src=x onerror="window.pwned=1">';
    await page.goto('songs/charts/new');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('chart-title').fill(title);
    await page.getByTestId('add-section').selectOption('Verse');
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await sendTo(page, 'Studio');
    await expect(studioTitle(page)).toHaveValue(`${title} (chart, C major)`);
    await expect(page.getByTestId('sent-back')).toHaveText(`← ${title}`);
    await expect(page.getByTestId('sent-said')).toContainText(`your chart ${title}:`);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBe(
      undefined,
    );
    await expect(page.locator('main img')).toHaveCount(0);
  });
});
