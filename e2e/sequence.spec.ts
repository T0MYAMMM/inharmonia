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

  test('Add to sequence adds the chord the builder shows', async ({ page }) => {
    await page.goto('chords?root=Eb&quality=maj7');
    await page.getByTestId('add-to-sequence').click();
    await page.getByRole('button', { name: 'A', exact: true }).click();
    await page.getByRole('button', { name: 'm7', exact: true }).click();
    await page.getByTestId('add-to-sequence').click();
    await expect.poll(() => bars(page)).toEqual(['E♭maj7', 'Am7']);
    await expect(page.getByTestId('sequence-status')).toHaveText('Added Am7 as bar 2.');
    await expect(page.getByTestId('sequence-summary')).toHaveText('2 bars in E♭ major');
  });

  test('a full sequence says so, and takes no more', async ({ page }) => {
    await page.goto('chords');
    await typeChords(page, 'C G Am F x8');
    await expect.poll(async () => (await bars(page)).length).toBe(32);
    await expect(page.getByTestId('sequence-full')).toHaveText(
      'The sequence is full at 32 bars: delete one to add more.',
    );
    await expect(page.getByTestId('add-to-sequence')).toBeDisabled();
    await typeChords(page, 'C');
    await expect(
      page.getByText('The sequence is full: it holds up to 32 bars. Nothing was added.', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('edit a bar: beats, chords, copy, move, delete; undo and redo', async ({ page }) => {
    await page.goto('chords');
    await typeChords(page, '| C | Am | F G | G7 |');
    const status = page.getByTestId('sequence-status');
    await page.locator('[data-bar="0"]').click();
    const editor = page.getByTestId('bar-editor');
    await expect(editor.getByRole('heading', { name: 'Bar 1' })).toBeVisible();
    await editor.getByRole('radio', { name: '2+2' }).click();
    const second = editor.getByRole('textbox', { name: 'Chord 2, 2 beats' });
    await second.fill('Em7');
    await second.press('Enter');
    await expect.poll(() => bars(page)).toEqual(['C Em7', 'Am', 'F G', 'G7']);
    await expect(status).toHaveText('Bar 1 is now C Em7.');
    await editor.getByRole('button', { name: 'Remove C from bar 1' }).click();
    await expect.poll(() => bars(page)).toEqual(['Em7', 'Am', 'F G', 'G7']);
    await editor.getByRole('button', { name: 'Copy bar 1 after it' }).click();
    await page.getByTestId('bar-editor').getByRole('button', { name: 'Move bar 2 right' }).click();
    await expect.poll(() => bars(page)).toEqual(['Em7', 'Am', 'Em7', 'F G', 'G7']);
    await expect(status).toHaveText('Moved bar 2 to bar 3.');
    await page.getByTestId('bar-editor').getByRole('button', { name: 'Delete bar 3' }).click();
    await expect.poll(() => bars(page)).toEqual(['Em7', 'Am', 'F G', 'G7']);
    await expect(status).toHaveText('Deleted bar 3, Em7.');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => bars(page)).toEqual(['Em7', 'Am', 'Em7', 'F G', 'G7']);
    await expect(status).toHaveText('Undone: deleted bar 3, Em7.');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect.poll(() => bars(page)).toEqual(['Em7', 'Am', 'F G', 'G7']);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByTestId('sequence-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => bars(page)).toEqual(['Em7', 'Am', 'F G', 'G7']);
  });

  test('new chords go after the chosen bar', async ({ page }) => {
    await page.goto('chords?root=D&quality=m7');
    await typeChords(page, 'C G');
    await page.locator('[data-bar="0"]').click();
    await page.getByTestId('add-to-sequence').click();
    await typeChords(page, 'E7');
    await expect.poll(() => bars(page)).toEqual(['C', 'Dm7', 'E7', 'G']);
    await expect(page.locator('[data-bar="2"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('keys: arrows choose, Shift moves, Delete removes, Ctrl+Z undoes', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard shortcuts');
    await page.goto('chords');
    await typeChords(page, 'C Am F G');
    const bar = (i: number) => page.locator(`[data-bar="${i}"]`);
    await page.getByRole('listbox', { name: 'Bars' }).getByRole('option').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(bar(1)).toBeFocused();
    await expect(bar(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => bars(page)).toEqual(['C', 'F', 'Am', 'G']);
    await expect(bar(2)).toBeFocused();
    await page.keyboard.press('Delete');
    await expect.poll(() => bars(page)).toEqual(['C', 'F', 'G']);
    await expect(bar(2)).toBeFocused();
    await page.keyboard.press('Control+z');
    await expect.poll(() => bars(page)).toEqual(['C', 'F', 'Am', 'G']);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => bars(page)).toEqual(['C', 'F', 'G']);
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Chord 1, 4 beats' })).toBeFocused();
    // In a chord field, Ctrl+Z is the field's own.
    await page.keyboard.press('Control+z');
    await expect.poll(() => bars(page)).toEqual(['C', 'F', 'G']);
  });

  test('drag a bar to a new place with the mouse; Escape cancels', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse');
    await page.goto('chords');
    await typeChords(page, 'C Am F G');
    await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="sequence-bars"]')!;
      window.scrollBy(0, strip.getBoundingClientRect().top - 200);
    });
    const centre = async (i: number, across = 0.5) => {
      const b = (await page.locator(`[data-bar="${i}"]`).boundingBox())!;
      return [b.x + b.width * across, b.y + b.height / 2] as const;
    };
    await page.mouse.move(...(await centre(0)));
    await page.mouse.down();
    await page.mouse.move(...(await centre(2, 0.75)), { steps: 8 });
    await expect(page.locator('[data-drop]')).toHaveCount(1);
    await expect(page.locator('[data-bar="0"]')).toHaveAttribute('data-dragging', 'true');
    await page.mouse.up();
    await expect.poll(() => bars(page)).toEqual(['Am', 'F', 'C', 'G']);
    await expect(page.getByTestId('sequence-status')).toHaveText('Moved bar 1 to bar 3.');
    await expect(page.locator('[data-bar="2"]')).toHaveAttribute('aria-selected', 'true');

    await page.mouse.move(...(await centre(3)));
    await page.mouse.down();
    await page.mouse.move(...(await centre(0, 0.25)), { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('[data-drop]')).toHaveCount(0);
    await expect.poll(() => bars(page)).toEqual(['Am', 'F', 'C', 'G']);
  });

  test('on touch, the chosen bar drags by its grip, and a bar itself does not', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'touch');
    await page.goto('chords');
    await typeChords(page, 'C Am F G');
    // Both rows of bars in view, clear of the keyboard dock.
    await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="sequence-bars"]')!;
      window.scrollBy(0, strip.getBoundingClientRect().top - 120);
    });
    const cdp = await page.context().newCDPSession(page);
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const swipe = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let k = 1; k <= 8; k++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: from.x + ((to.x - from.x) * k) / 8, y: from.y + ((to.y - from.y) * k) / 8 },
          ],
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const target = await box('[data-bar="3"]');
    const end = { x: target.x + target.width * 0.8, y: target.y + target.height / 2 };

    // A bar that is not chosen has no grip: dragging over it moves nothing.
    const first = await box('[data-bar="0"]');
    await swipe({ x: first.x + 20, y: first.y + first.height / 2 }, end);
    await expect.poll(() => bars(page)).toEqual(['C', 'Am', 'F', 'G']);

    await page.locator('[data-bar="0"]').tap();
    await expect(page.locator('[data-bar="0"]')).toHaveAttribute('aria-selected', 'true');
    const grip = await box('[data-bar="0"] [data-grip]');
    expect(grip.width).toBeGreaterThanOrEqual(44);
    expect(grip.height).toBeGreaterThanOrEqual(44);
    await swipe({ x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, end);
    await expect.poll(() => bars(page)).toEqual(['Am', 'F', 'G', 'C']);
    await expect(page.getByTestId('sequence-status')).toHaveText('Moved bar 1 to bar 4.');
  });

  test('Roman numerals under the chords, in the key they suggest', async ({ page }) => {
    await page.goto('chords');
    await typeChords(page, 'C Am F G');
    await expect(page.locator('[data-numeral]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show function' }).click();
    await expect(page.locator('[data-numeral]')).toHaveText(['I', 'vi', 'IV', 'V']);
    await expect(page.getByTestId('sequence-summary')).toHaveText('4 bars in C major');
    await page.reload();
    await expect(page.locator('[data-numeral]')).toHaveText(['I', 'vi', 'IV', 'V']);
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
