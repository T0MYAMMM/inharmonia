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
