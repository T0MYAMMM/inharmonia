import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseMidi, writeMidi, type MidiProject } from '../src/core/midi/smf';
import { openMidiFileMenu, openMidiMore } from './studioHelpers';

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
  await openMidiFileMenu(page);
  await page.getByTestId('midi-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mid$/);
  const result = parseMidi(new Uint8Array(await readFile((await download.path())!)));
  expect(result.tracks).toHaveLength(2);
  expect(result.tracks[0]!.notes).toHaveLength(3);
  expect(result.tracks[1]!.notes[0]!.velocity).toBe(115);
  expect(result.tracks[0]!.notes.some((n) => n.velocity === 55)).toBe(true);
  await openMidiMore(page);
  await page.getByTestId('midi-save-song').click();
  await expect(page.getByRole('link', { name: /Open saved song in My songs/ })).toBeVisible();
  await page.getByRole('link', { name: /Open saved song in My songs/ }).click();
  await expect(page.getByRole('heading', { name: 'test-arrangement', level: 1 })).toBeVisible();
  await page.getByTestId('export-menu').click();
  await expect(page.getByTestId('my-song-midi-export')).toBeVisible();
});

test('Studio opens a MIDI file dropped on its card, and says when a file is not MIDI', async ({
  page,
}) => {
  await page.goto('studio');
  const card = page.getByTestId('studio-open-card');
  const drop = async (name: string, type: string, bytes: number[]) => {
    const dataTransfer = await page.evaluateHandle(
      (file) => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
        return data;
      },
      { name, type, bytes },
    );
    await card.dispatchEvent('dragover', { dataTransfer });
    await expect(card).toHaveAttribute('data-over', 'true');
    await card.dispatchEvent('drop', { dataTransfer });
  };
  await drop('notes.json', 'application/json', [...Buffer.from('{}')]);
  await expect(card.getByRole('status')).toHaveText(
    "That isn't a MIDI file. Choose a .mid or .midi file.",
  );
  await expect(card).not.toHaveAttribute('data-over');
  await drop('arrangement.mid', 'audio/midi', [...writeMidi(sample)]);
  await expect(page.getByRole('heading', { name: 'MIDI piano-roll editor' })).toBeVisible();
  await expect(page.getByTestId('midi-track')).toHaveCount(2);
});

test('MIDI Studio supports composing without using the microphone', async ({ page }) => {
  await page.goto('studio');
  await page.getByTestId('studio-new-midi').click();
  await expect(page.getByTestId('midi-track')).toHaveCount(1);
  await expect(page.getByTestId('midi-play')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Track' })).toBeVisible();
  await page.getByRole('button', { name: '+ Track' }).click();
  await expect(page.getByTestId('midi-track')).toHaveCount(2);
  await page.getByRole('button', { name: 'Back to Studio' }).click();
  await expect(page.getByTestId('enable-mic')).toBeVisible();
});

test('MIDI header: every control shares its row with another', async ({ page, isMobile }) => {
  await page.goto('studio');
  await page.getByTestId('studio-new-midi').click();
  await expect(page.getByTestId('midi-play')).toBeVisible();
  for (const width of isMobile ? [360] : [1280, 820]) {
    if (!isMobile) await page.setViewportSize({ width, height: 900 });
    // On a phone the settings are folded into one line.
    for (const id of isMobile ? ['midi-header'] : ['midi-header', 'midi-settings']) {
      const perRow = await page.getByTestId(id).evaluate((root) => {
        const centres = [...root.querySelectorAll('button, input, select')]
          .map((el) => el.getBoundingClientRect())
          .filter((box) => box.width > 0)
          .map((box) => box.top + box.height / 2)
          .sort((a, b) => a - b);
        // Controls whose centres are within 8px of each other share a row.
        const rows: number[][] = [];
        for (const c of centres) {
          const row = rows.at(-1);
          if (row && c - row[0]! < 8) row.push(c);
          else rows.push([c]);
        }
        return rows.map((r) => r.length);
      });
      expect(perRow.length).toBeGreaterThan(0);
      expect(
        perRow.every((n) => n > 1),
        `${id} at ${width}px has ${perRow.join(', ')} controls per row`,
      ).toBe(true);
    }
  }
});

test('MIDI menus work from the keyboard', async ({ page }) => {
  await page.goto('studio');
  await page.getByTestId('studio-new-midi').click();
  await expect(page.getByTestId('midi-play')).toBeVisible();
  const more = page.getByTestId('midi-more');
  const button = (await more.isVisible()) ? more : page.getByTestId('midi-file-menu');
  await button.focus();
  await page.keyboard.press('Enter');
  const items = page.getByRole('menu').getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).toBeFocused();
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
  await page.getByRole('slider', { name: 'Vertical zoom' }).fill('40');
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

test('a song saved from a MIDI file comes back from its export with every track', async ({
  page,
}) => {
  // 72 bars, more than a written song may have, played in a little unevenly.
  const late = (i: number) => (i * 7) % 5;
  const long: MidiProject = {
    ...sample,
    title: 'Evening ferry',
    tracks: [
      {
        ...sample.tracks[0]!,
        notes: Array.from({ length: 144 }, (_, i) => ({
          id: `m${i}`,
          midi: [72, 74, 76, 79][i % 4]!,
          startBeat: i * 2 + late(i) / 480,
          beats: 1.75,
          velocity: 90,
        })),
      },
      {
        ...sample.tracks[1]!,
        notes: Array.from({ length: 72 }, (_, i) => ({
          id: `b${i}`,
          midi: 48,
          startBeat: i * 4,
          beats: 3.9,
          velocity: 100 + (i % 20),
        })),
      },
    ],
  };
  await page.goto('studio');
  await page.getByTestId('studio-import-midi').setInputFiles({
    name: 'Evening ferry.mid',
    mimeType: 'audio/midi',
    buffer: Buffer.from(writeMidi(long)),
  });
  await expect(page.getByTestId('midi-track')).toHaveCount(2);
  await page.getByRole('button', { name: 'Mute Bass' }).click();
  await openMidiMore(page);
  await page.getByTestId('midi-save-song').click();
  await expect(page.getByRole('link', { name: /Open saved song in My songs/ })).toBeVisible();

  await page.goto('songs');
  await page.getByTestId('export-open').click();
  const dialog = page.getByTestId('export-dialog');
  const download = page.waitForEvent('download');
  await dialog.getByTestId('export-download').click();
  const path = (await (await download).path())!;
  const text = await readFile(path, 'utf8');
  const doc = JSON.parse(text);
  expect(doc.version).toBe(3);
  expect(doc.items[0].song.midi.tracks.map((t: { name: string }) => t.name)).toEqual([
    'Lead',
    'Bass',
  ]);
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Read it back as a copy beside the one already here.
  const preview = page.getByTestId('import-preview');
  await page.getByTestId('import-file').setInputFiles(path);
  await expect(preview.getByTestId('import-summary')).toHaveText(
    '1 item in this file: 0 new, 1 already here.',
  );
  await expect(preview.getByTestId('import-errors')).toHaveCount(0);
  await preview.getByTestId('import-choice-1').selectOption('copy');
  await preview.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-result')).toHaveText('Imported: 1 added.');
  const copies = page.getByTestId('my-songs').getByRole('link', { name: /Evening ferry/ });
  await expect(copies).toHaveCount(2);

  for (const i of [0, 1]) {
    await page.goto('songs');
    await copies.nth(i).click();
    await expect(page.getByRole('heading', { name: 'Evening ferry', level: 1 })).toBeVisible();
    await expect(page.getByText(/4\/4, 72 bars/)).toBeVisible();
    await page.getByRole('link', { name: 'Edit in Studio' }).click();
    await expect(page.getByTestId('midi-track')).toHaveText([
      /Lead\s*144 notes/,
      /Bass\s*72 notes/,
    ]);
    await expect(page.getByRole('button', { name: 'Unmute Bass' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
});
