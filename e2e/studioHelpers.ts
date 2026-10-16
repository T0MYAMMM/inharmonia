import type { Page } from '@playwright/test';

/** Studio settings for short, fast takes: 4 bars at 120 bpm, no extra latency. */
export async function fastTakes(page: Page) {
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
export async function fakeMic(page: Page) {
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

/** Set the melody the fake microphone sings next: [startBeat, beats, midi]. */
export async function sing(page: Page, melody: [number, number, number][]) {
  await page.evaluate((m) => {
    (window as unknown as { __melody: [number, number, number][] }).__melody = m;
  }, melody);
}
