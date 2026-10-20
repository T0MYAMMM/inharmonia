import { expect, test, type Page } from '@playwright/test';
import { openSettings } from './helpers';

const SONG = 'songs/senja-di-teras';

async function open(page: Page) {
  await page.goto(SONG);
  await expect(page.getByRole('heading', { name: 'Senja di Teras' })).toBeVisible();
}

const lit = (page: Page, layer: string) =>
  page.$$eval(`[data-layers~="${layer}"]`, (els) =>
    els.map((e) => Number((e as HTMLElement).dataset.midi)),
  );

test.describe('song player', () => {
  test('lists the song and opens it', async ({ page }) => {
    await page.goto('songs');
    await page.getByRole('link', { name: /Senja di Teras/ }).click();
    await expect(page.getByTestId('status-line')).toHaveText('Bar 1 of 16, Dmaj7');
    await expect(page.getByRole('heading', { name: 'Verse' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chorus' })).toBeVisible();
  });

  test('score view follows a single measure with zoom, navigation and overview', async ({
    page,
  }) => {
    await open(page);
    const score = page.locator('[data-score-view]');
    await expect(score).toHaveAttribute('data-score-view', 'overview');
    await expect(score.locator('[data-bar]')).toHaveCount(16);

    await page.getByRole('radio', { name: 'Follow Along' }).click();
    await expect(score).toHaveAttribute('data-score-view', 'follow');
    await expect(score.locator('[data-bar]')).toHaveCount(1);
    const slot = score.locator('[data-note-slot]').first();
    const before = await slot.evaluate((el) => el.getBoundingClientRect().width);
    await page.getByRole('slider', { name: 'Note size' }).press('ArrowRight');
    await expect(page.getByText('Note size: 125%')).toBeVisible();
    const after = await slot.evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeGreaterThan(before);

    await page.getByRole('button', { name: 'Next bar' }).click();
    await expect(page.getByTestId('status-line')).toContainText('Bar 2 of 16');
    await expect(score.locator('[data-bar="1"]')).toBeVisible();
    await page.getByRole('combobox', { name: 'Jump to section' }).selectOption('8');
    await expect(page.getByTestId('status-line')).toContainText('Bar 9 of 16');

    await page.getByRole('radio', { name: 'Overview' }).click();
    await expect(score.locator('[data-bar]')).toHaveCount(16);
  });

  test('Falling Notes plays in sync with the transport and survives mode changes', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('radio', { name: 'Falling Notes' }).click();
    const roll = page.getByTestId('falling-notes');
    await expect(roll).toBeVisible();
    await expect(roll.getByRole('img', { name: /Falling piano notes/ })).toBeVisible();
    // The ONE piano must remain sticky at the bottom of the page in every mode.
    const dock = page.locator('[data-dock]');
    await expect(dock).toHaveCount(1);
    await expect(dock).toHaveAttribute('data-falling', 'true');
    expect(await dock.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
    await expect(page.getByTestId('falling-score-hint')).toBeVisible();
    await expect(page.getByTestId('keyboard')).toHaveCount(1);
    const shared = dock.locator('[data-keyboard-scroller]');
    await expect(shared.getByTestId('keyboard-roll')).toBeVisible();
    await expect(shared.getByTestId('keyboard')).toBeVisible();
    await expect(shared.getByTestId('falling-notes')).toBeVisible();
    const alignment = await shared.evaluate((element) => {
      const rollElement = element.querySelector<HTMLElement>('[data-testid="keyboard-roll"]');
      const board = element.querySelector<HTMLElement>('[data-testid="keyboard"]');
      const key = board?.querySelector<HTMLElement>('[data-midi="60"]');
      if (!rollElement || !board || !key) return null;
      const rollRect = rollElement.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const keyRect = key.getBoundingClientRect();
      return {
        leftDifference: Math.abs(rollRect.left - boardRect.left),
        widthDifference: Math.abs(rollRect.width - boardRect.width),
        keyIsInsideRoll: keyRect.left >= rollRect.left && keyRect.right <= rollRect.right,
      };
    });
    expect(alignment).not.toBeNull();
    expect(alignment!.leftDifference).toBeLessThan(2);
    expect(alignment!.widthDifference).toBeLessThan(2);
    expect(alignment!.keyIsInsideRoll).toBe(true);
    await expect(page.locator('[data-score-view]')).toHaveAttribute('data-score-view', 'falling');

    await page.getByTestId('falling-hand').selectOption('lh');
    await page.getByTestId('falling-lookahead').selectOption('8');
    await expect(page.getByTestId('falling-hand')).toHaveValue('lh');

    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Pause');
    await expect.poll(async () => (await lit(page, 'lh')).length).toBeGreaterThan(0);
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Play');

    await page.getByRole('radio', { name: 'Practice', exact: true }).click();
    await expect(dock).toHaveAttribute('data-falling', 'true');
    await page.locator('[data-midi="69"]').click(); // Senja starts on A4; the same piano is playable.
    await expect(page.getByTestId('counts')).toHaveText('1 hit, 0 misses');
    await expect(page.getByTestId('play')).toBeDisabled();
    await page.getByRole('radio', { name: 'Overview' }).click();
    await expect(page.locator('[data-score-view]')).toHaveAttribute('data-score-view', 'overview');
    await expect(page.getByTestId('keyboard')).toHaveCount(1);
    await expect(dock).not.toHaveAttribute('data-falling');
    expect(await dock.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
  });

  test('listen: plays, lights the sounding hand notes, pauses', async ({ page }) => {
    await open(page);
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Pause');
    // Senja uses a sustained arpeggio: the chord tones enter one by one.\n    await expect.poll(async () => (await lit(page, 'lh')).length).toBeGreaterThan(0);\n    await expect.poll(async () => (await lit(page, 'lh')).length).toBeGreaterThan(1);
    await expect.poll(async () => (await lit(page, 'rh')).length).toBe(1);
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Play');
    await expect(page.locator('[data-state="active"]')).toHaveCount(1); // stays marked when paused
    await expect.poll(() => lit(page, 'lh')).toEqual([]); // nothing lit when not playing
  });

  test('listen: arrangement change lights real block-chord notes', async ({ page }) => {
    await open(page);
    await page.getByTestId('song-arrangement').locator('summary').click();
    await page.getByTestId('song-pattern').selectOption('block');
    await page.getByTestId('play').click();
    await expect.poll(() => lit(page, 'lh')).toEqual([38, 45, 49, 54]);
  });

  test('listen: Space toggles play only when the page itself has focus', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard shortcut');
    await open(page);
    await page.locator('body').click({ position: { x: 2, y: 300 } });
    await page.keyboard.press('Space');
    await expect(page.getByTestId('play')).toHaveText('Pause');
    await page.getByRole('radio', { name: 'Listen' }).focus();
    await page.keyboard.press('Space'); // on a control: the control handles it, playback keeps going
    await expect(page.getByTestId('play')).toHaveText('Pause');
  });

  test('listen: a bar starts playback from that bar, by click or keyboard', async ({ page }) => {
    await open(page);
    await page.locator('[data-bar="4"]').click();
    await expect(page.getByTestId('status-line')).toContainText('Bar 5 of 16');
    await page.locator('[data-bar="12"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('status-line')).toContainText('Bar 13 of 16');
  });

  test('practice: waits for the right note, counts hits and misses', async ({ page, isMobile }) => {
    await open(page);
    await page.getByRole('radio', { name: 'Practice' }).click();
    await expect(page.getByTestId('play')).toBeDisabled();
    const hands = page.getByRole('radiogroup', { name: 'Practice hand' });
    await expect(hands.getByRole('radio', { name: 'Right hand' })).toBeChecked();
    await expect(hands.getByRole('radio', { name: 'Left hand' })).not.toHaveAttribute(
      'aria-disabled',
    );
    await expect(
      page.getByText('Play the melody. The left hand rolls in on each new chord.'),
    ).toBeVisible();
    await expect.poll(() => lit(page, 'target')).toEqual([69]); // A4
    const counts = page.getByTestId('counts');
    const pressKey = async (midi: number) => {
      const key = page.locator(`[data-midi="${midi}"]`);
      await key.scrollIntoViewIfNeeded();
      const box = (await key.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);
      await page.mouse.down();
      await page.mouse.up();
    };
    await pressKey(60); // wrong
    await expect(counts).toHaveText('0 hits, 1 miss');
    await expect.poll(() => lit(page, 'target')).toEqual([69]);
    await pressKey(69); // A4, right
    await expect(counts).toHaveText('1 hit, 1 miss');
    await expect.poll(() => lit(page, 'target')).toEqual([66]); // F#4
    await expect(page.locator('[data-state="done"]')).toHaveCount(1);
    if (!isMobile) {
      await page.keyboard.press('t'); // F#4 on the computer keyboard
      await expect(counts).toHaveText('2 hits, 1 miss');
    }
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(counts).toHaveText('0 hits, 0 misses');
  });

  test('practice: clicking a bar moves the target there', async ({ page }) => {
    await open(page);
    await page.getByRole('radio', { name: 'Practice' }).click();
    await page.locator('[data-bar="8"]').click();
    await expect(page.locator('[data-state="target"]')).toHaveAttribute('data-chip', 'rh-8-0');
    await expect(page.getByTestId('status-line')).toHaveText('Bar 9 of 16, Gmaj7');
  });

  test('not angka shows the do header and digits', async ({ page }) => {
    await open(page);
    await openSettings(page);
    await page.getByRole('radio', { name: 'Not angka' }).click();
    await expect(page.getByText('do = D')).toBeVisible();
    await expect(page.locator('[data-chip="rh-0-0"]')).toHaveText('5'); // A4 in D
  });
});
