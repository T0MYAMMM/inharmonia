import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeMidi } from '../src/core/midi/smf';
import { openMidiMore } from './studioHelpers';
import { downloadSong } from './helpers';

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

/**
 * Open a Send to menu (the page's, or one inside `scope`) and choose a room.
 * The page's own sits in the header, or after the score on a phone's progression page.
 */
async function sendTo(
  page: Page,
  room: string,
  scope: Locator | Page = page.locator('header, [data-testid="progression-actions"]'),
) {
  await scope.getByRole('button', { name: /^Send to/ }).click();
  await page.getByRole('menuitem', { name: room }).click();
}

const studioTitle = (page: Page) => page.getByRole('textbox', { name: 'Title' });

test.describe('Send to Studio', () => {
  test('a chart opens as it plays, keeps through a reload, and goes back', async ({ page }) => {
    await makeChart(page);
    await page.getByTestId('transpose').selectOption('-5');
    const chartUrl = page.url();
    // On a chart, Send to sits under the player with Edit and Export.
    await sendTo(page, 'Studio', page.getByTestId('chart-actions'));

    await expect(page).toHaveURL(/\/studio\?sent=[a-z0-9]{6}$/);
    await expect(
      page.getByRole('heading', { name: 'MIDI piano-roll editor', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('sent-said')).toHaveText(
      'Sent from your chart Harbour lights: G major, chords as written, the Triad and root accompaniment. Save keeps a copy in Your songs; the chart stays as it is.',
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
    // A catalogue song, downloaded: its page is the same as a built-in's.
    await downloadSong(page, 'minuet-in-g-easy');
    await page.goto('songs/minuet-in-g-easy?pattern=waltz');
    // On a song page, Send to sits under the player, not in the header.
    await sendTo(page, 'Studio', page.locator('main'));
    await expect(studioTitle(page)).toHaveValue('Minuet in G (song, Easy)');
    await expect(page.getByTestId('sent-said')).toHaveText(
      'Sent from the song Minuet in G: G major, the Easy version, with the arrangement chosen here. Save keeps a copy in Your songs; the song stays as it is.',
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
    await sendTo(page, 'Studio', page.getByTestId('chart-actions'));
    await expect(studioTitle(page)).toHaveValue(`${title} (chart, C major)`);
    await expect(page.getByTestId('sent-back')).toHaveText(`← ${title}`);
    await expect(page.getByTestId('sent-said')).toContainText(`your chart ${title}:`);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBe(
      undefined,
    );
    await expect(page.locator('main img')).toHaveCount(0);
  });
});

test.describe('Progressions in this song', () => {
  test('a chart pasted and saved says which progressions it has, and links to them', async ({
    page,
  }) => {
    await page.goto('songs/charts/new');
    await page.getByTestId('chart-title').fill('Night bus');
    await page
      .getByTestId('paste-text')
      .fill(['[Verse]', 'Am F C G', 'Am F C G', '', '[Chorus]', 'F G C C', 'Dm G C'].join('\n'));
    await page.getByTestId('paste-read').click();
    await page.getByTestId('paste-use').click();
    await page.getByTestId('chart-save').click();

    await expect(page.getByRole('heading', { name: 'Night bus', level: 1 })).toBeVisible();
    await expect(page.getByTestId('chart-saved')).toHaveText('Saved.');
    await expect(page.getByTestId('chart-found')).toHaveText(
      'Progressions in it: vi–IV–I–V, ii–V–I. By section ↓',
    );
    const panel = page.getByTestId('chart-progressions');
    await expect(panel.getByRole('heading', { level: 3 })).toHaveText(['Verse', 'Chorus']);
    await expect(page.getByTestId('harmony-0').getByTestId('harmony-matches')).toHaveText(
      /vi–IV–I–V the whole section, twice\s*I–V–vi–IV the whole section, twice, started on vi/,
    );
    await expect(page.getByTestId('harmony-1').getByTestId('harmony-matches')).toHaveText(
      'ii–V–I bars 5–7',
    );

    // Said once: not again after a reload.
    await page.reload();
    await expect(page.getByTestId('chart-found')).toBeVisible();
    await expect(page.getByTestId('chart-saved')).toHaveCount(0);

    await page.getByTestId('chart-found').getByRole('link', { name: 'vi–IV–I–V' }).click();
    await expect(page).toHaveURL(/\/progressions\/vi-iv-i-v\?key=C$/);
    await expect(page.getByRole('heading', { name: 'vi–IV–I–V', level: 1 })).toBeVisible();
  });

  test('each section in numerals, in the key it plays in, with what was found', async ({
    page,
  }) => {
    await makeChart(page);
    await page.getByTestId('transpose').selectOption('-5');
    const panel = page.getByTestId('chart-progressions');
    await expect(panel.getByText('Roman numerals in G major', { exact: false })).toBeVisible();
    const verse = page.getByRole('list', { name: 'Verse, 8 bars' }).getByRole('listitem');
    await expect(verse).toHaveCount(8);
    await expect(verse.first()).toHaveAccessibleName('Bar 1: G (I)');
    const bridge = page.getByTestId('harmony-2');
    const bridgeBars = bridge.getByRole('list', { name: 'Bridge, 8 bars' }).getByRole('listitem');
    await expect(bridgeBars).toHaveCount(8);
    await expect(bridgeBars.nth(3)).toHaveAccessibleName('Bar 4: E7 (VI7)');
    await expect(bridgeBars.nth(7)).toHaveAccessibleName('Bar 8: N.C.');
    await expect(bridge.getByTestId('harmony-matches')).toHaveText('ii–V–I bars 1–3 and 5–7');
    await bridge.getByRole('link', { name: 'ii–V–I' }).click();
    await expect(page).toHaveURL(/\/progressions\/ii-v-i\?key=G$/);
    await expect(page.getByTestId('key')).toHaveValue('G');
  });

  test('By section goes to the panel', async ({ page }) => {
    await makeChart(page);
    await page.getByTestId('chart-found').getByRole('link', { name: 'By section' }).click();
    await expect(page.getByTestId('chart-progressions')).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Progressions in this song' })).toBeInViewport();
  });
});

test.describe('Send to Progressions', () => {
  test('the sequence goes to the builder, read in a key you choose', async ({ page }) => {
    await page.goto('chords');
    await typeChords(page, 'Am F C G N.C.');
    const sequence = page.getByTestId('sequence');
    const button = sequence.getByRole('button', { name: /^Send to/ });
    await sendTo(page, 'Progressions', sequence);

    const dialog = page.getByRole('dialog', { name: 'Send to Progressions' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('send-key')).toBeFocused();
    // The chords suggest A minor.
    await expect(dialog.getByTestId('send-key')).toHaveValue('A minor');
    await expect(dialog.getByTestId('send-numerals')).toHaveText('i ♭VI ♭III ♭VII');
    await expect(dialog.getByTestId('send-notes')).toHaveText(
      'N.C. in bar 5 is left out: a progression has no silent bars.',
    );
    // The sequence's undo waits while the dialog is open.
    await dialog.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('sequence-summary')).toHaveText('5 bars in A minor');
    // Escape leaves it, back on Send to; it opens again where it started.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    await sendTo(page, 'Progressions', sequence);
    await expect(dialog.getByTestId('send-key')).toHaveValue('A minor');
    await expect(dialog.getByRole('button', { name: 'A minor' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByTestId('send-key').selectOption('C major');
    await expect(dialog.getByTestId('send-numerals')).toHaveText('vi IV I V');
    await dialog.getByRole('button', { name: 'Open in the builder' }).click();

    await expect(page).toHaveURL(/\/progressions\/new\?sent=[a-z0-9]{6}$/);
    await expect(page.getByRole('heading', { name: 'New progression', level: 1 })).toBeVisible();
    await expect(page.getByTestId('sent-said')).toHaveText(
      'From your chord sequence, read in C major.',
    );
    await expect(page.getByTestId('sent-notes')).toHaveText(
      'N.C. in bar 5 is left out: a progression has no silent bars.',
    );
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('vi–IV–I–V');
    await expect(page.getByRole('radio', { name: 'Major' })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Chords' })).toHaveValue('vi IV I V');
    await expect(page.getByTestId('preview-key')).toHaveValue('C');
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Chords' })).toHaveValue('vi IV I V');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/progressions\/mine-/);
    await expect(page.getByRole('heading', { name: 'vi–IV–I–V', level: 1 })).toBeVisible();
  });

  test("a chart's section goes to the builder, with what was left out", async ({ page }) => {
    await makeChart(page);
    await page.getByTestId('transpose').selectOption('-5');
    const bridge = page.getByTestId('harmony-2');
    await expect(bridge.getByRole('button', { name: 'Send to the Bridge' })).toBeVisible();
    await sendTo(page, 'Progressions', bridge);

    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Harbour lights: Bridge');
    await expect(page.getByRole('textbox', { name: 'Chords' })).toHaveValue(
      'ii7 V7 Imaj7 VI7 ii7 V7 I',
    );
    await expect(page.getByTestId('preview-key')).toHaveValue('G');
    await expect(page.getByTestId('sent-said')).toHaveText(
      'From the Bridge of Harbour lights, read in G major.',
    );
    await expect(page.getByTestId('sent-notes')).toHaveText(
      'N.C. in bar 8 is left out: a progression has no silent bars.',
    );
    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Harbour lights', level: 1 })).toBeVisible();
    await expect(page.getByTestId('transpose')).toHaveValue('-5');
  });

  test('the builder says when what was sent is gone', async ({ page }) => {
    await page.goto('progressions/new?sent=nope00');
    await expect(page.getByTestId('sent-problem')).toHaveText(
      'What was sent here is no longer available: it lasts until the next thing is sent.',
    );
    await expect(page.getByRole('textbox', { name: 'Chords' })).toHaveValue('');
  });
});

test.describe('Send to Songs', () => {
  test('the sequence is saved as a chart in Your songs, as it plays, and opens', async ({
    page,
  }) => {
    await page.goto('chords');
    const sequence = page.getByTestId('sequence');
    await typeChords(page, '| C | Am | F G | Dm7 | G7 | C |');
    await page.getByTestId('sequence-style').selectOption('block-both');
    await sequence.getByRole('button', { name: 'Show function' }).click();
    await sendTo(page, 'Songs', sequence);

    const dialog = page.getByRole('dialog', { name: 'Send to Songs' });
    const title = dialog.getByRole('textbox', { name: 'Title' });
    await expect(title).toBeFocused();
    await expect(title).toHaveValue('C Am F G Dm7');
    await expect(dialog).toContainText('A new chart in Your songs: 6 bars in C major');
    await title.fill('  ');
    await dialog.getByRole('button', { name: 'Save the chart' }).click();
    await expect(title).toHaveAccessibleDescription(/Give it a title\./);
    await title.fill('Evening loop');
    await title.press('Enter');

    await expect(page).toHaveURL(/\/songs\/charts\/mine-chart-/);
    await expect(page.getByRole('heading', { name: 'Evening loop', level: 1 })).toBeVisible();
    await expect(page.getByTestId('chart-saved')).toHaveText('Saved from your chord sequence.');
    await expect(page.getByText('C major, 4/4, 6 bars, 80 bpm')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show function' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('style')).toHaveValue('block-both');
    await expect(
      page.getByTestId('chart-progressions').getByRole('heading', { level: 3 }),
    ).toHaveText('Sequence');
    await expect(page.getByTestId('chart-found')).toHaveText(
      'Progressions in it: I–vi–IV–V ballad, ii–V–I. By section ↓',
    );

    await page.goto('songs');
    await expect(page.getByRole('link', { name: /Evening loop/ })).toBeVisible();
  });
});

test.describe('Send to Chords, and a new chart from a progression', () => {
  const barNames = (page: Page) =>
    page
      .getByRole('listbox', { name: 'Bars' })
      .getByRole('option')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

  test('a progression replaces the chord sequence; Undo, and after a reload Bring back, restore it', async ({
    page,
  }) => {
    await page.goto('chords');
    await typeChords(page, 'C Am F G');
    await page.goto('progressions/ii-v-i?key=G');
    await sendTo(page, 'Chords');

    await expect(page).toHaveURL(/\/chords\?sent=[a-z0-9]{6}$/);
    await expect(page.getByTestId('sent-back')).toHaveText('← ii–V–I');
    await expect(page.getByTestId('sequence-notice')).toHaveText(
      'Replaced 4 bars with ii–V–I in G major.',
    );
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in G major');
    expect(await barNames(page)).toEqual([
      'Bar 1: Am7',
      'Bar 2: D7',
      'Bar 3: Gmaj7',
      'Bar 4: Gmaj7',
    ]);
    await expect(page.getByTestId('sequence-play')).toBeFocused();
    await expect(page.getByTestId('sequence')).toBeInViewport();
    const previous = page.getByRole('button', { name: /^Bring back the previous sequence/ });
    await expect(previous).toHaveText('Bring back the previous sequence (4 bars: C Am F G)');

    const sequence = page.getByTestId('sequence');
    await sequence.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in C major');
    await expect(previous).toHaveCount(0);
    await sequence.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in G major');

    // A reload applies nothing again, keeps the way back, and still offers the previous.
    await page.reload();
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in G major');
    await expect(page.getByTestId('sequence-notice')).toHaveCount(0);
    await expect(page.getByTestId('sent-back')).toHaveText('← ii–V–I');
    await previous.click();
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in C major');
    expect(await barNames(page)).toEqual(['Bar 1: C', 'Bar 2: Am', 'Bar 3: F', 'Bar 4: G']);
    await page.reload();
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in C major');
    await expect(previous).toHaveCount(0);

    await page.getByTestId('sent-back').click();
    await expect(page).toHaveURL(/\/progressions\/ii-v-i\?key=G$/);
  });

  test("a chart's section goes to the chord sequence in the key it plays in", async ({ page }) => {
    await makeChart(page);
    await page.getByTestId('transpose').selectOption('-5');
    await sendTo(page, 'Chords', page.getByTestId('harmony-2'));
    await expect(page.getByTestId('sequence-notice')).toHaveText(
      'Put the Bridge of Harbour lights in G major in the sequence.',
    );
    expect(await barNames(page)).toEqual([
      'Bar 1: Am7',
      'Bar 2: D7',
      'Bar 3: Gmaj7',
      'Bar 4: E7',
      'Bar 5: Am7',
      'Bar 6: D7',
      'Bar 7: G',
      'Bar 8: N.C.',
    ]);
    await page.getByTestId('sent-back').click();
    await expect(page.getByRole('heading', { name: 'Harbour lights', level: 1 })).toBeVisible();
  });

  test('a progression starts a new chart in its key, saved from the editor', async ({ page }) => {
    await page.goto('progressions/minor-descent?key=E');
    await sendTo(page, 'Songs');
    await expect(page).toHaveURL(/\/songs\/charts\/new\?sent=[a-z0-9]{6}$/);
    await expect(page.getByRole('heading', { name: 'New chord chart', level: 1 })).toBeVisible();
    await expect(page.getByTestId('sent-said')).toHaveText(
      'Started from i–♭VII–♭VI–V in E minor: one verse to build a song on.',
    );
    await expect(page.getByTestId('chart-title')).toHaveValue('i–♭VII–♭VI–V');
    await expect(page.getByTestId('chart-key')).toHaveValue('E minor');
    await expect(page.getByTestId('section-label-0')).toHaveValue('Verse');
    await expect(page.getByTestId('bar-0-3')).toContainText('B7');
    await page.reload();
    await expect(page.getByTestId('chart-title')).toHaveValue('i–♭VII–♭VI–V');

    await page.getByTestId('chart-title').fill('Rain on the river');
    await page.getByTestId('chart-save').click();
    await expect(page.getByRole('heading', { name: 'Rain on the river', level: 1 })).toBeVisible();
    await expect(page.getByTestId('chart-saved')).toHaveText('Saved.');
    await expect(page.getByTestId('chart-found')).toHaveText(
      'Progressions in it: i–♭VII–♭VI–V. By section ↓',
    );
  });

  test('Chords and the chart editor say when what was sent is gone', async ({ page }) => {
    await page.goto('chords?sent=nope00');
    await expect(page.getByTestId('sent-problem')).toHaveText(
      'What was sent here is no longer available: it lasts until the next thing is sent.',
    );
    await page.goto('songs/charts/new?sent=nope00');
    await expect(page.getByTestId('sent-problem')).toHaveText(
      'What was sent here is no longer available: it lasts until the next thing is sent.',
    );
    await expect(page.getByTestId('chart-title')).toHaveValue('');
  });
});

test.describe('A song of your own', () => {
  test('goes to Studio by Edit in Studio, and has no Send to', async ({ page }) => {
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
              notes: [60, 64, 67, 72].map((midi, i) => ({
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
    await page.getByRole('link', { name: /Open saved song in Your songs/ }).click();
    await expect(page.getByRole('heading', { name: 'Evening tune', level: 1 })).toBeVisible();

    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
    await expect(header.getByRole('button', { name: /^Send to/ })).toHaveCount(0);
    await header.getByRole('link', { name: 'Edit in Studio' }).click();
    await expect(page).toHaveURL(/\/studio\/edit\/mine-song-/);
    await expect(page.getByRole('heading', { name: 'Edit Evening tune', level: 1 })).toBeVisible();
  });
});
