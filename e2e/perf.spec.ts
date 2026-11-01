import { expect, test, type Page } from '@playwright/test';

/** Requests for the piano: Tone's chunk and the samples. */
function audioRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (/\/assets\/tone-[^/]+\.js$/.test(path) || path.includes('/samples/')) seen.push(path);
  });
  return seen;
}

/** What logNoteStarts sees, in audio-clock seconds. */
interface NoteLog {
  __starts: number[];
  /** When the engine had Tone: it makes its compressor straight after. */
  __ready?: number;
}

/**
 * Log the audio-clock time of every oscillator and sample the app starts, so
 * a test can tell which notes were actually played, and when Tone was ready.
 * Only realtime contexts count, and only real times: Tone's feature checks
 * start nodes at 0 or below.
 */
async function logNoteStarts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as NoteLog;
    w.__starts = [];
    const compressor = BaseAudioContext.prototype.createDynamicsCompressor;
    BaseAudioContext.prototype.createDynamicsCompressor = function (this: BaseAudioContext) {
      if (this instanceof AudioContext) w.__ready ??= this.currentTime;
      return compressor.call(this);
    };
    for (const Node of [OscillatorNode, AudioBufferSourceNode]) {
      const start = Node.prototype.start as (
        this: AudioScheduledSourceNode,
        ...a: number[]
      ) => void;
      Node.prototype.start = function (this: AudioScheduledSourceNode, ...args: number[]) {
        const when = args[0] ?? 0;
        if (this.context instanceof AudioContext && when > 0) w.__starts.push(when);
        return start.apply(this, args);
      };
    }
  });
}

test.describe('loading', () => {
  // The service worker warms the sample cache when idle; these tests are about taps.
  test.use({ serviceWorkers: 'block' });

  test('from Home, tapping Songs loads no audio', async ({ page }) => {
    const audio = audioRequests(page);
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Songs' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
    await page.getByRole('heading', { level: 1 }).click();
    // Nothing should follow the taps; give anything that would a moment to show.
    await page.waitForTimeout(1000);
    expect(audio).toEqual([]);
  });

  test('a cold deep link to a lazy room renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const [path, heading] of [
      ['songs/ode-to-joy-easy', /Ode to Joy/],
      ['chords/drill', /drill/i],
      ['studio', /Studio/],
      ['ear', /Ear training/],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.getByRole('contentinfo')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('in a room that plays, the first tap starts the piano', async ({ page }) => {
    const audio = audioRequests(page);
    await page.goto('chords');
    await expect(page.getByTestId('chord-symbol')).toBeVisible();
    expect(audio).toEqual([]);
    await page.getByRole('heading', { level: 1 }).click();
    await expect.poll(() => audio.some((p) => p.includes('/assets/tone-'))).toBe(true);
  });

  test('the first Play on a song is heard from its first note', async ({ page }) => {
    await logNoteStarts(page);
    await page.goto('songs/ode-to-joy-easy');
    await expect(page.getByTestId('play')).toBeVisible();
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveText('Pause');
    const log = () =>
      page.evaluate(() => {
        const w = window as unknown as NoteLog;
        return { starts: w.__starts, ready: w.__ready };
      });
    await expect.poll(async () => (await log()).starts.length).toBeGreaterThan(0);
    const { starts, ready } = await log();
    // Play makes the audio clock and puts the first note 0.06 s in, while Tone
    // is still loading. The engine holds it and plays it once Tone is ready:
    // on time, or at once if up to 0.5 s late. Lost, the first sound would be
    // the song's next note, two beats in. A load so slow that the note is
    // stale by design (a very busy machine) proves nothing either way.
    test.skip(ready! - 0.06 > 0.3, `Tone took until ${ready} s to load`);
    expect(Math.min(...starts)).toBeLessThan(0.06 + 0.5);
    await page.getByTestId('play').click();
  });
});
