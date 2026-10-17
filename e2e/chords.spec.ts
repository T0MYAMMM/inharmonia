import { expect, test, type Page } from '@playwright/test';
import { holdChord, holdChordAnyOctave } from './helpers';

const lit = (page: Page, layer: string) =>
  page.$$eval(`[data-layers~="${layer}"]`, (els) =>
    els.map((e) => Number((e as HTMLElement).dataset.midi)),
  );

test.describe('chord library', () => {
  test('shows a chord, its formula and voicings, from the URL', async ({ page }) => {
    await page.goto('chords?root=Eb&quality=maj7');
    await expect(page.getByTestId('chord-symbol')).toHaveText('E♭maj7');
    await expect(page.getByTitle('major seventh')).toContainText('7');
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

  test('the chord and how it is built keep one size, whatever the chord', async ({ page }) => {
    await page.goto('chords');
    const box = () =>
      page.evaluate(() => {
        const sym = document.querySelector('[data-testid="chord-symbol"]')!.closest('section')!;
        const built = sym.parentElement!.children[1]!;
        const slots = [...document.querySelector('[data-testid="chord-tones"]')!.children];
        const r = (e: Element) => e.getBoundingClientRect();
        return {
          symbol: [r(sym).width, r(sym).height].map(Math.round),
          built: [r(built).width, r(built).height].map(Math.round),
          slot: Math.round(r(slots[0]!).width),
          rows: new Set(slots.map((s) => Math.round(r(s).top))).size,
        };
      });
    // The shortest and longest symbols, and the fewest and most tones.
    const first = await box();
    for (const [root, quality] of [
      ['Db', 'add9'],
      ['C', 'maj9'],
      ['F#', '13'],
      ['Db', 'm7b5'],
      ['B', 'sus2'],
    ]) {
      await page.goto(`chords?root=${encodeURIComponent(root!)}&quality=${quality}`);
      expect(await box(), `${root}${quality}`).toEqual({ ...first, rows: 1 });
    }
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
    const release = await holdChordAnyOctave(page, target); // default strictness: any voicing
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
