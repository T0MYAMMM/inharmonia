import type { Page } from '@playwright/test';

/** The volume, note-name and theme controls sit behind the settings (gear) button. */
export async function openSettings(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Settings' });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}

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
export async function holdChord(page: Page, midis: number[]) {
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

/** For "any voicing" checks: fold the chord into one octave from C4 so it always fits the computer keys. */
export function holdChordAnyOctave(page: Page, midis: number[]) {
  const folded = [...new Set(midis.map((m) => 60 + (((m % 12) + 12) % 12)))].sort((a, b) => a - b);
  return holdChord(page, folded);
}
