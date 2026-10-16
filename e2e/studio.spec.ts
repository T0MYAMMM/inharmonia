import { expect, test, type Page } from '@playwright/test';

/** Studio settings for short, fast takes: 4 bars at 120 bpm, no extra latency. */
async function fastTakes(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'inharmonia:settings',
      JSON.stringify({
        version: 1,
        state: { studio: { tempo: 120, beatsPerBar: 4, bars: 4 }, inputLatencyMs: 0 },
      }),
    );
  });
}

/**
 * A fake microphone on the app's own AudioContext: an oscillator that sings
 * `window.__melody` (beat, beats, midi) on the beat once a take starts. The
 * melody is a plain arpeggio written for this test.
 */
async function fakeMic(page: Page) {
  await page.addInitScript(() => {
    type Note = [startBeat: number, beats: number, midi: number];
    const w = window as unknown as { __contexts: AudioContext[]; __melody?: Note[] };
    w.__contexts = [];
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(opts?: AudioContextOptions) {
        super(opts);
        w.__contexts.push(this);
      }
    };
    let sing: ((beat0: number, spb: number) => void) | null = null;
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = w.__contexts[w.__contexts.length - 1]!;
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(dest);
      osc.start();
      sing = (beat0, spb) => {
        for (const [start, beats, midi] of w.__melody ?? []) {
          const t = beat0 + start * spb;
          osc.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), t);
          gain.gain.setTargetAtTime(0.4, t, 0.005);
          gain.gain.setTargetAtTime(0, t + beats * spb * 0.92, 0.01);
        }
      };
      return dest.stream;
    };
    window.addEventListener('inharmonia:take-start', (e) => {
      const { beat0, tempo } = (e as CustomEvent<{ beat0: number; tempo: number }>).detail;
      sing?.(beat0, 60 / tempo);
    });
  });
}

async function refuseMic(page: Page, name: string) {
  await page.addInitScript((errorName) => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Refused in test', errorName);
    };
  }, name);
}

test.describe('studio', () => {
  test('is in the nav and linked from Songs', async ({ page }) => {
    await page.goto('songs');
    await page.getByRole('link', { name: 'Make your own in Studio' }).click();
    await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Studio' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('explains a blocked microphone', async ({ page }) => {
    await refuseMic(page, 'NotAllowedError');
    await page.goto('studio');
    await page.getByTestId('enable-mic').click();
    await expect(page.getByTestId('problem')).toContainText('The microphone is blocked');
    await expect(page.getByTestId('problem')).toContainText('reload');
  });

  test('explains a missing microphone', async ({ page }) => {
    await refuseMic(page, 'NotFoundError');
    await page.goto('studio');
    await page.getByTestId('enable-mic').click();
    await expect(page.getByTestId('problem')).toContainText('No microphone found');
  });

  test('a sung take becomes notes on the grid, in the key', async ({ page }) => {
    test.slow();
    await fastTakes(page);
    await fakeMic(page);
    await page.goto('studio');
    await page.getByTestId('enable-mic').click();
    await expect(page.getByTestId('record')).toBeEnabled();
    await page.evaluate(() => {
      (window as unknown as { __melody: [number, number, number][] }).__melody = [
        [0, 4, 60],
        [4, 4, 64],
        [8, 4, 67],
        [12, 4, 72],
      ];
    });
    await page.getByTestId('record').click();
    await expect(page.getByTestId('studio-status')).toContainText(/Count-in|Bar/);
    await expect(page.getByTestId('take-summary')).toContainText('4 notes in C major', {
      timeout: 20000,
    });
    await page.getByText('The notes as text').click();
    const list = page.getByTestId('note-list').getByRole('listitem');
    await expect(list).toHaveText([
      'C4, bar 1, beat 1, 4 beats',
      'E4, bar 2, beat 1, 4 beats',
      'G4, bar 3, beat 1, 4 beats',
      'C5, bar 4, beat 1, 4 beats',
    ]);
  });
});
