import { expect, test, type Page } from '@playwright/test';

// Invented progressions only.
async function typedChart(page: Page, title: string, key: string, bars: string) {
  await page.goto('songs/charts/new');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('chart-title').fill(title);
  await page.getByTestId('chart-key').selectOption({ label: key });
  await page.getByTestId('add-section').selectOption('Verse');
  await page.getByTestId('edit-text-0').click();
  await page.getByTestId('bars-text').fill(bars);
  await page.getByTestId('bars-apply').click();
  await page.getByTestId('chart-save').click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

async function markKnown(page: Page, kind: string, roots: string[]) {
  await page.goto('chords/known');
  await page
    .getByRole('group', { name: 'Chord kind' })
    .getByRole('button', { name: kind, exact: true })
    .click();
  for (const root of roots) {
    const suffix = kind === 'Minor' ? 'm' : '';
    await page.getByTestId(`known-${root}${suffix}`).click();
    await page.getByRole('radio', { name: 'I know it' }).click();
  }
}

test.describe('making a chart playable', () => {
  test('find an easier key, simplify, change style; the chart stays as written', async ({
    page,
  }) => {
    await markKnown(page, 'Major', ['C', 'G', 'F']);
    await markKnown(page, 'Minor', ['A']);
    await expect(page.getByTestId('known-count')).toHaveText('4 chords known');

    await typedChart(
      page,
      'Loop in E',
      'E major',
      '| E | B/D# | C#m7 | Aadd9 |\n| E | Bsus4 B | A | E |',
    );
    await expect(page.getByTestId('known-summary')).toContainText('You know 0 of the');

    await page.getByRole('radio', { name: 'Basic' }).click();
    await page.getByTestId('find-key').click();
    const best = page.getByTestId('key-option-0');
    await expect(best).toContainText('C major');
    await expect(best).toContainText('4 semitones lower');
    await expect(best).toContainText('C G Am F');
    await expect(best).toContainText('You know every chord.');
    await page.getByTestId('use-key-0').click();

    await expect(
      page.getByText('C major (written in E major, 4 semitones lower), 4/4'),
    ).toBeVisible();
    await expect(page.getByTestId('known-summary')).toContainText('You know 4 of the 4 chords');
    await expect(page.locator('[data-bar="1"]')).toContainText('Bar 2 of 8, G.');
    await expect(page.locator('[data-bar="1"]').getByTestId('original-chord')).toHaveText('G/B');

    await page.getByRole('radio', { name: 'Simplified' }).click();
    await expect(page.locator('[data-bar="2"]')).toContainText('Am7');
    await expect(page.locator('[data-bar="3"]').getByTestId('original-chord')).toHaveText('Fadd9');
    await page.getByRole('radio', { name: 'Original' }).click();
    await expect(page.locator('[data-bar="1"]')).toContainText('Bar 2 of 8, G/B.');
    await expect(page.locator('[data-bar="1"]').getByTestId('original-chord')).toHaveCount(0);

    await page.getByTestId('style').selectOption('held');
    await page.reload();
    await expect(page.getByTestId('style')).toHaveValue('held');
    await expect(page.getByTestId('transpose')).toHaveValue('-4');

    // The export keeps the chart as entered and the view beside it.
    const download = page.waitForEvent('download');
    await page.getByTestId('export-download').click();
    const file = await download;
    let text = '';
    for await (const chunk of await file.createReadStream()) text += chunk;
    const item = JSON.parse(text).items[0];
    expect(item.chart.key).toEqual({ tonic: 'E', mode: 'major' });
    expect(item.chart.sections[0].bars.slice(0, 4)).toEqual(['E', 'B/D#', 'C#m7', 'Aadd9']);
    expect(item.view).toEqual({
      transpose: -4,
      simplify: 'original',
      style: 'held',
      showFunction: false,
    });
  });

  test('says how the hand moves into each chord, and marks it on the keyboard', async ({
    page,
  }) => {
    await typedChart(page, 'Loop in C', 'C major', '| C | G/B | Am | F |');
    await page.getByRole('radio', { name: 'Practice' }).click();
    // Play the first chord to move on to the second.
    for (const k of ['a', 'd', 'g']) await page.keyboard.down(k);
    await expect(page.getByTestId('voicing-hint')).toHaveText(
      'C → G/B: keep G, move C down 1 semitone to B and E down 2 semitones to D.',
    );
    for (const k of ['a', 'd', 'g']) await page.keyboard.up(k);
    const keyboard = page.getByTestId('keyboard');
    await expect(keyboard.locator('[data-layers~="stay"]')).toHaveCount(1);
    await expect(keyboard.locator('[data-layers~="moveTo"]')).toHaveCount(2);
  });
});

test.describe('chords you know', () => {
  test('a clean play counts; a wrong note or Show me does not; marks win', async ({ page }) => {
    await page.goto('chords/known');
    await page.getByTestId('known-C').click();
    await expect(page.getByTestId('known-status')).toHaveText('Not known yet.');

    const play = async (keys: string[]) => {
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(250);
      for (const k of keys) await page.keyboard.up(k);
    };
    await play(['a', 'd', 'g']);
    await expect(page.getByTestId('known-status')).toHaveText(
      'Learning: 1 of 3 clean plays, on 1 of 2 days.',
    );
    await expect(page.getByTestId('known-C')).toContainText('1/3');

    await page.keyboard.down('w');
    await page.keyboard.up('w');
    await play(['a', 'd', 'g']);
    await expect(page.getByTestId('known-feedback')).toContainText('after a wrong note');
    await page.getByRole('button', { name: 'Show me' }).click();
    await play(['a', 'd', 'g']);
    await expect(page.getByTestId('known-feedback')).toContainText("don't count");
    await expect(page.getByTestId('known-C')).toContainText('1/3');

    await page.getByRole('radio', { name: 'I know it' }).click();
    await expect(page.getByTestId('known-status')).toHaveText('Known: you marked it.');
    await expect(page.getByTestId('known-C')).toContainText('known');
    await page.reload();
    await expect(page.getByTestId('known-count')).toHaveText('1 chord known');
    await page.getByRole('radio', { name: 'From my plays' }).click();
    await expect(page.getByTestId('known-count')).toHaveText('0 chords known');
  });
});
