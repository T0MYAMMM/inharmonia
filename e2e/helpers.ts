import type { Page } from '@playwright/test';

/** On small screens the note-name and theme controls sit behind a "Display" button. */
export async function openDisplaySettings(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Display' });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
}
