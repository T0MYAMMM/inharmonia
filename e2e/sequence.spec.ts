import { expect, test, type Page } from '@playwright/test';

const lit = (page: Page, layer: string) =>
  page.$$eval(`[data-layers~="${layer}"]`, (els) =>
    els.map((e) => Number((e as HTMLElement).dataset.midi)),
  );

/** Each bar's chords, as "C", "F G". */
const bars = (page: Page) =>
  page
    .getByTestId('sequence-bars')
    .locator('[data-bar]')
    .evaluateAll((els) =>
      els.map((e) => [...e.querySelectorAll('[data-symbol]')].map((s) => s.textContent).join(' ')),
    );

async function typeChords(page: Page, text: string) {
  const field = page.getByRole('textbox', { name: 'Type chords' });
  await field.fill(text);
  await field.press('Enter');
}

/** Right hand only, so the lit keys are each chord's voicing, and the fastest tempo. */
async function quick(page: Page) {
  await page.getByTestId('sequence-style').selectOption('held');
  const tempo = page.getByRole('slider', { name: 'Tempo' });
  await tempo.focus();
  await tempo.press('End');
  await expect(tempo).toHaveValue('200');
}

test.describe('chord sequence', () => {
  test('type chords in a line and hear them, the bar playing marked', async ({ page }) => {
    await page.goto('chords?root=Eb&quality=maj7');
    await expect.poll(() => lit(page, 'lh')).toEqual([63, 67, 70, 74]);
    await expect(page.getByTestId('sequence-play')).toBeDisabled();
    await typeChords(page, 'C Am F G');
    await expect.poll(() => bars(page)).toEqual(['C', 'Am', 'F', 'G']);
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in C major');
    await quick(page);

    await page.getByTestId('sequence-play').click();
    await expect(page.getByTestId('sequence-play')).toHaveAccessibleName('Stop');
    await expect(page.getByTestId('sequence-position')).toHaveText('Bar 1 of 4');
    await expect(page.locator('[data-bar="0"]')).toHaveAttribute('aria-current', 'true');
    // The sequence lights its chord; the builder's E♭maj7 waits.
    await expect.poll(() => lit(page, 'lh')).toEqual([60, 64, 67]);
    await expect(page.locator('[data-bar="1"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('sequence-position')).toHaveText('Bar 2 of 4');

    await page.getByTestId('sequence-play').click();
    await expect(page.getByTestId('sequence-play')).toHaveAccessibleName('Play');
    await expect(page.locator('[aria-current="true"][data-bar]')).toHaveCount(0);
    await expect.poll(() => lit(page, 'lh')).toEqual([63, 67, 70, 74]);
  });

  test('without the loop, it plays once and stops', async ({ page }) => {
    await page.goto('chords');
    await typeChords(page, 'C');
    await quick(page);
    await page.getByRole('button', { name: 'Loop' }).click();
    await page.getByTestId('sequence-play').click();
    await expect(page.getByTestId('sequence-play')).toHaveAccessibleName('Stop');
    // One bar of 4/4 at 200 bpm is 1.2 seconds.
    await expect(page.getByTestId('sequence-play')).toHaveAccessibleName('Play', { timeout: 5000 });
  });

  test('a chord it cannot read is shown inline, and nothing is added', async ({ page }) => {
    await page.goto('chords');
    const field = page.getByRole('textbox', { name: 'Type chords' });
    await typeChords(page, 'C Hm F G');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const error = 'Bar 2: "Hm" is not a chord. Nothing was added.';
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    await expect(field).toHaveAccessibleDescription(new RegExp(error.replace(/[.]/g, '\\.')));
    await expect(page.getByTestId('sequence-empty')).toBeVisible();
    await field.fill('C Bm F G');
    await expect(field).not.toHaveAttribute('aria-invalid');
    await field.press('Enter');
    await expect.poll(() => bars(page)).toEqual(['C', 'Bm', 'F', 'G']);
    await expect(field).toHaveValue('');
  });

  test('a whole line in bar syntax, and the forgiving forms', async ({ page }) => {
    await page.goto('chords');
    await typeChords(page, '| C | Am | F G |');
    await expect.poll(() => bars(page)).toEqual(['C', 'Am', 'F G']);
    await typeChords(page, 'dm, g7 - c-7');
    await expect.poll(() => bars(page)).toEqual(['C', 'Am', 'F G', 'Dm', 'G7', 'C-7']);
  });

  test('an empty sequence offers one example to hear', async ({ page }) => {
    await page.goto('chords');
    await expect(page.getByTestId('sequence-empty')).toContainText('No chords yet');
    await page.getByRole('button', { name: 'Try C G Am F' }).click();
    await expect.poll(() => bars(page)).toEqual(['C', 'G', 'Am', 'F']);
    await expect(page.getByTestId('sequence-play')).toBeEnabled();
  });

  test('survives a reload, with its settings', async ({ page }) => {
    await page.goto('chords');
    await typeChords(page, '| C G | Am |');
    await page.getByRole('radio', { name: '3/4' }).click();
    await page.getByTestId('sequence-style').selectOption('arpeggio-8ths');
    await page.getByRole('button', { name: 'Loop' }).click();
    const tempo = page.getByRole('slider', { name: 'Tempo' });
    await tempo.focus();
    await tempo.press('ArrowRight');
    await page.reload();
    await expect.poll(() => bars(page)).toEqual(['C G', 'Am']);
    await expect(page.getByRole('radio', { name: '3/4' })).toBeChecked();
    await expect(page.getByTestId('sequence-style')).toHaveValue('arpeggio-8ths');
    await expect(page.getByRole('button', { name: 'Loop' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(tempo).toHaveValue('81');
  });
});
