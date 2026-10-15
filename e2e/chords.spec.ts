import { expect, test, type Page } from '@playwright/test';

const KEYS = [
  'a',
  'w',
  's',
  'e',
  'd',
  'f',
  't',
  'g',
  'y',
  'h',
  'u',
  'j',
  'k',
  'o',
  'l',
  'p',
  ';',
  "'",
];

/** Hold a chord on the computer keyboard, shifting octaves with Z/X so it fits the 18-key range. */
async function holdChord(page: Page, midis: number[]) {
  const shift = [0, -1, 1, -2, 2, -3].find((s) =>
    midis.every((m) => m - (60 + 12 * s) >= 0 && m - (60 + 12 * s) < 18),
  );
  if (shift === undefined) throw new Error(`Chord ${midis} does not fit the computer keys`);
  for (let i = 0; i < Math.abs(shift); i++) await page.keyboard.press(shift < 0 ? 'z' : 'x');
  const keys = midis.map((m) => KEYS[m - (60 + 12 * shift)]!);
  for (const k of keys) await page.keyboard.down(k);
  return async () => {
    for (const k of keys) await page.keyboard.up(k);
    for (let i = 0; i < Math.abs(shift); i++) await page.keyboard.press(shift < 0 ? 'x' : 'z');
  };
}

const lit = (page: Page, layer: string) =>
  page.$$eval(`[data-layers~="${layer}"]`, (els) =>
    els.map((e) => Number((e as HTMLElement).dataset.midi)),
  );

test.describe('chord library', () => {
  test('shows a chord, its formula and voicings, from the URL', async ({ page }) => {
    await page.goto('chords?root=Eb&quality=maj7');
    await expect(page.getByTestId('chord-symbol')).toHaveText('E♭maj7');
    await expect(page.getByText('major seventh')).toBeVisible();
    await expect(page.getByTestId('voicing-notes')).toHaveText('Root position: E♭4 G4 B♭4 D5');
    await expect.poll(() => lit(page, 'lh')).toEqual([63, 67, 70, 74]);
    await page.getByRole('radio', { name: '2nd' }).click();
    await expect(page.getByTestId('voicing-notes')).toHaveText('Second inversion: B♭3 D4 E♭4 G4');
    await page.getByRole('radio', { name: 'Drop 2' }).click();
    await expect(page.getByTestId('voicing-notes')).toHaveText('Root position: B♭3 E♭4 G4 D5');
    await page.getByRole('button', { name: 'G', exact: true }).click();
    await page.getByRole('button', { name: 'm7', exact: true }).click();
    await expect(page.getByTestId('chord-symbol')).toHaveText('Gm7');
  });

  test('recognises the chord when you play it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'computer keyboard input');
    await page.goto('chords?root=C&quality=major');
    const release = await holdChord(page, [64, 67, 72]); // first inversion, any voicing counts
    await expect(page.getByText("That's it.")).toBeVisible();
    await release();
  });
});

test.describe('chord drill', () => {
  test('plays a round: wrong note, right chord, skip', async ({ page, isMobile }) => {
    test.skip(isMobile, 'computer keyboard input');
    await page.goto('chords/drill');
    await page.getByTestId('start-drill').click();
    await expect(page.getByTestId('drill-prompt')).toContainText('Chord 1 of 10');
    await page.getByRole('button', { name: 'Show me' }).click();
    const target = await lit(page, 'chordTarget');
    expect(target.length).toBe(3);
    const release = await holdChord(page, target);
    await expect(page.getByTestId('drill-prompt')).toContainText('Chord 2 of 10');
    await release();
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByTestId('drill-summary')).toHaveText('1 of 10 clean');
    await page.getByRole('button', { name: 'Go again' }).click();
    await expect(page.getByTestId('drill-prompt')).toContainText('Chord 1 of 10');
  });

  test('settings persist and strictness explains itself', async ({ page }) => {
    await page.goto('chords/drill');
    await page.getByRole('radio', { name: 'Right bass' }).click();
    await expect(page.getByText('with the asked-for note at the bottom')).toBeVisible();
    await page.getByRole('button', { name: 'Dominant 7th' }).click();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Right bass' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Dominant 7th' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('song practice with chords', () => {
  test('left hand: play each chord', async ({ page, isMobile }) => {
    test.skip(isMobile, 'computer keyboard input');
    await page.goto('songs/senja-di-teras');
    await page.getByRole('radio', { name: 'Practice' }).click();
    await page
      .getByRole('radiogroup', { name: 'Practice hand' })
      .getByRole('radio', { name: 'Left hand' })
      .click();
    await expect(page.getByText('Play each chord, in any octave or inversion.')).toBeVisible();
    await expect.poll(() => lit(page, 'chordTarget')).toEqual([38, 45, 49, 54]);
    const release = await holdChord(page, [62, 66, 69, 73]); // Dmaj7: D4 F#4 A4 C#5
    await expect(page.getByTestId('counts')).toHaveText('1 hit, 0 misses');
    await release();
    await expect(page.getByTestId('status-line')).toHaveText('Bar 2 of 16, Bm7');
  });
});
