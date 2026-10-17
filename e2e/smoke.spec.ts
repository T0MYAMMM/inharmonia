import { expect, test } from '@playwright/test';
import { openSettings } from './helpers';

test.describe('smoke', () => {
  test('home page loads and links to the keyboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Keyboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard sandbox' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('deep links load directly', async ({ page }) => {
    await page.goto('about');
    await expect(page.getByRole('heading', { name: 'About Inharmonia' })).toBeVisible();
    await expect(page.getByText('Salamander Grand Piano')).toBeVisible();
  });

  test('theme toggle sets data-theme and persists', async ({ page }) => {
    await page.goto('./');
    await openSettings(page);
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openSettings(page);
    await page.getByRole('radio', { name: 'Auto' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });
});

test.describe('settings menu', () => {
  test('the gear holds the volume, and it persists', async ({ page }) => {
    await page.goto('./');
    await openSettings(page);
    const volume = page.getByRole('slider', { name: 'Volume' });
    await expect(volume).toHaveValue('0');
    await volume.fill('-6');
    await expect(page.getByRole('group', { name: 'Settings' })).toContainText('-6 dB');
    await page.reload();
    await openSettings(page);
    await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('-6');
  });

  test('Studio is marked beta', async ({ page }) => {
    await page.goto('studio');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Studio\s*Beta/);
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Studio Beta' }),
    ).toBeVisible();
  });
});

test.describe('keyboard sandbox', () => {
  test('touch screens get finger-sized keys', async ({ page, isMobile }) => {
    await page.goto('keyboard');
    const white = page.locator('[data-midi="60"]');
    const box = (await white.boundingBox())!;
    if (isMobile) {
      expect(box.width).toBeGreaterThanOrEqual(39);
      expect(box.height).toBeGreaterThanOrEqual(140);
    } else {
      expect(box.width).toBeLessThan(36);
    }
  });

  test('computer keys light the on-screen key and start the piano', async ({ page, isMobile }) => {
    test.skip(isMobile, 'computer keyboard input is a desktop feature');
    await page.goto('keyboard');
    const c4 = page.locator('[data-midi="60"]');
    await page.keyboard.down('a');
    await expect(c4).toHaveAttribute('data-layers', /held/);
    await page.keyboard.up('a');
    await expect(c4).not.toHaveAttribute('data-layers', /held/);
    await expect(page.getByTestId('last-note')).toHaveText('C4');
    await expect(page.getByText('Piano ready')).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press('z');
    await expect(page.getByTestId('keys-range')).toContainText('C3 to F4');
  });

  test('falls back to MP3 samples when Ogg is unsupported', async ({ page, isMobile }) => {
    test.skip(isMobile, 'same code path on both projects');
    await page.addInitScript(() => {
      const orig = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (t: string) {
        return t.includes('ogg') ? '' : orig.call(this, t);
      };
    });
    const formats = new Set<string>();
    page.on('request', (r) => {
      if (r.url().includes('/samples/')) formats.add(r.url().split('.').pop()!);
    });
    await page.goto('keyboard');
    await page.keyboard.press('a');
    await expect(page.getByText('Piano ready')).toBeVisible({ timeout: 20_000 });
    expect([...formats]).toEqual(['mp3']);
  });

  test('tapping a key plays it', async ({ page }) => {
    await page.goto('keyboard');
    const key = page.locator('[data-midi="64"]');
    await key.scrollIntoViewIfNeeded();
    const box = (await key.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
    await page.mouse.down();
    await expect(key).toHaveAttribute('data-layers', /held/);
    await page.mouse.up();
    await expect(page.getByTestId('last-note')).toHaveText('E4');
    await expect(key).not.toHaveAttribute('data-layers', /held/); // released, not stuck
  });

  test('the timing check plays and lights keys', async ({ page }) => {
    await page.goto('keyboard');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Pause');
    await expect(page.locator('[data-layers~="lh"]').first()).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('status-line')).toContainText('Bar 2 of 4', { timeout: 8000 });
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Resume');
  });
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByText('Ready to use offline.')).toBeVisible();
  await context.setOffline(true);
  await page.goto('fills/enclosure');
  await expect(page.getByRole('heading', { name: 'Enclosure' })).toBeVisible();
  const sample = await page.evaluate(async () => {
    const r = await fetch(`${location.origin}/inharmonia/samples/salamander/v1/C4.mp3`);
    return r.ok && (await r.arrayBuffer()).byteLength > 1000;
  });
  expect(sample).toBe(true);
  await context.setOffline(false);
});
