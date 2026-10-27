import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseMidi, writeMidi, type MidiProject } from '../src/core/midi/smf';

const sample: MidiProject = {
  title: 'MIDI Studio test',
  ppq: 480,
  tempo: 90,
  meter: { beats: 4, unit: 4 },
  tempos: [{ beat: 0, bpm: 90 }],
  meters: [{ beat: 0, numerator: 4, denominator: 4 }],
  tracks: [
    {
      id: 'piano',
      name: 'Lead',
      channel: 0,
      program: 0,
      muted: false,
      notes: [
        { id: 'one', midi: 72, startBeat: 0, beats: 1, velocity: 100 },
        { id: 'two', midi: 76, startBeat: 0, beats: 1, velocity: 75 },
        { id: 'three', midi: 79, startBeat: 1, beats: 1, velocity: 65 },
      ],
    },
    {
      id: 'bass',
      name: 'Bass',
      channel: 1,
      program: 32,
      muted: false,
      notes: [{ id: 'four', midi: 48, startBeat: 0, beats: 4, velocity: 115 }],
    },
  ],
};

test('MIDI Studio imports, edits polyphony and exports a standard MIDI file', async ({ page }) => {
  await page.goto('studio');
  await expect(page.getByTestId('studio-new-midi')).toBeVisible();
  await page.getByTestId('studio-import-midi').setInputFiles({
    name: 'test-arrangement.mid',
    mimeType: 'audio/midi',
    buffer: Buffer.from(writeMidi(sample)),
  });
  await expect(page.getByRole('heading', { name: 'MIDI piano-roll editor' })).toBeVisible();
  await expect(page.getByTestId('midi-track')).toHaveCount(2);
  await expect(page.getByTestId('midi-note')).toHaveCount(3);
  await page.getByTestId('midi-note').first().click();
  await page.getByRole('slider', { name: 'Note velocity' }).fill('55');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('midi-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mid$/);
  const result = parseMidi(new Uint8Array(await readFile((await download.path())!)));
  expect(result.tracks).toHaveLength(2);
  expect(result.tracks[0]!.notes).toHaveLength(3);
  expect(result.tracks[1]!.notes[0]!.velocity).toBe(115);
  expect(result.tracks[0]!.notes.some((n) => n.velocity === 55)).toBe(true);
  await page.getByTestId('midi-save-song').click();
  await expect(page.getByRole('link', { name: /Open saved song in My Songs/ })).toBeVisible();
  await page.getByRole('link', { name: /Open saved song in My Songs/ }).click();
  await expect(page.getByRole('heading', { name: 'test-arrangement', level: 1 })).toBeVisible();
  await expect(page.getByTestId('my-song-midi-export')).toBeVisible();
});

test('MIDI Studio supports composing without using the microphone', async ({ page }) => {
  await page.goto('studio');
  await page.getByTestId('studio-new-midi').click();
  await expect(page.getByTestId('midi-track')).toHaveCount(1);
  await expect(page.getByTestId('midi-play')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Track' })).toBeVisible();
  await page.getByRole('button', { name: '+ Track' }).click();
  await expect(page.getByTestId('midi-track')).toHaveCount(2);
  await page.getByRole('button', { name: '← Back to Studio' }).click();
  await expect(page.getByTestId('enable-mic')).toBeVisible();
});

test('MIDI piano roll: fixed headers, zooms, box select, hover, seeking and keyboard input', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Box selection and hover need a mouse.');
  await page.goto('studio');
  await page.getByTestId('studio-new-midi').click();
  const frame = page.getByTestId('midi-roll-frame');
  const f = (await frame.boundingBox())!;
  // Grid origin: past the 56 px pitch column and under the 28 px ruler.
  const gx = f.x + 56;
  const gy = f.y + 28;
  for (const [x, y] of [
    [40, 100],
    [100, 80],
    [300, 140],
  ])
    await page.mouse.click(gx + x, gy + y);
  const notes = page.getByTestId('midi-note');
  await expect(notes).toHaveCount(3);

  // Hover an empty cell, then a note.
  await page.mouse.move(gx + 500, gy + 200);
  await expect(page.getByTestId('midi-hover')).toContainText(/bar \d+, beat/);
  await notes.nth(1).hover();
  await expect(page.getByTestId('midi-hover')).toContainText('velocity 95');

  // Drag a box around the first two notes, then move them together.
  await page.mouse.move(gx + 20, gy + 50);
  await page.mouse.down();
  await page.mouse.move(gx + 150, gy + 130, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="midi-note"][data-selected]')).toHaveCount(2);
  await expect(page.getByText('2 notes selected')).toBeVisible();
  const xs = async () => notes.evaluateAll((els) => els.map((e) => Number(e.getAttribute('x'))));
  const before = await xs();
  const b = (await notes.nth(0).boundingBox())!;
  await page.mouse.move(b.x + 3, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 3 + 56, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  const after = await xs();
  expect(after[0]! - before[0]!).toBeCloseTo(56, 0);
  expect(after[1]! - before[1]!).toBeCloseTo(56, 0);
  expect(after[2]).toBe(before[2]);
  await page.getByRole('region', { name: 'MIDI Studio' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('midi-status')).toHaveText('Moved 2 notes.');

  // Vertical zoom makes rows taller; the pitch column and ruler stay in view when scrolling.
  const tall = async () => Number(await notes.first().getAttribute('height'));
  const short = await tall();
  await page.getByRole('slider', { name: 'MIDI row height' }).fill('40');
  expect(await tall()).toBeGreaterThan(short);
  await page.getByTestId('midi-roll').evaluate((el) => {
    el.scrollLeft = 400;
    el.scrollTop += 300;
  });
  const keys = (await page.getByTestId('midi-keys').boundingBox())!;
  const ruler = (await page.getByTestId('midi-ruler').boundingBox())!;
  expect(Math.abs(keys.x - f.x)).toBeLessThan(2);
  expect(Math.abs(ruler.y - f.y)).toBeLessThan(2);

  // The mute button is a speaker that shows when the track is muted.
  const mute = page.getByTestId('midi-track-mute');
  await expect(mute).toHaveAttribute('aria-label', 'Mute Piano · melody');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(mute).toHaveAttribute('aria-label', 'Unmute Piano · melody');
  await mute.click();

  // Click the progress bar to move the playhead.
  const seek = page.getByTestId('midi-seek');
  await seek.scrollIntoViewIfNeeded();
  const s = (await seek.boundingBox())!;
  await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
  await expect(seek).not.toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByTestId('midi-seek-where')).not.toHaveText('bar 1, beat 1');

  // Show the keyboard and play a note: it lands at the playhead.
  await page.getByTestId('midi-keyboard-toggle').click();
  await expect(page.getByTestId('midi-keyboard')).toBeVisible();
  await page.locator('body').focus();
  await page.keyboard.down('a');
  await page.keyboard.up('a');
  await expect(notes).toHaveCount(4);
  await expect(page.getByTestId('midi-status')).toHaveText('Added C4 from the keyboard.');
});

test('MIDI piano roll on touch: a tap draws a note, the keyboard toggles', async ({ page }) => {
  await page.goto('studio');
  await page.getByTestId('studio-new-midi').click();
  const f = (await page.getByTestId('midi-roll-frame').boundingBox())!;
  await page.getByTestId('midi-roll-empty').click({ position: { x: 60, y: 120 } });
  await expect(page.getByTestId('midi-note')).toHaveCount(1);
  expect(f.width).toBeGreaterThan(0);
  await page.getByTestId('midi-keyboard-toggle').click();
  await expect(page.getByTestId('midi-keyboard')).toBeVisible();
  await expect(page.getByTestId('midi-record-note')).toContainText('at the playhead');
  await page.getByTestId('midi-keyboard-toggle').click();
  await expect(page.getByTestId('midi-keyboard')).toHaveCount(0);
});
