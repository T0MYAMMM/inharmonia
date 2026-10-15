import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MP3_DECODER_DELAY,
  mp3TrimWindow,
  readMp3GaplessInfo,
  type Mp3GaplessInfo,
} from './mp3Gapless';
import { loadSample, type DecodingContext } from './sampleLoader';
import { pickSampleFormat } from './samples';

const SAMPLE_DIR = resolve(process.cwd(), 'public/samples/salamander/v1');
const fileBytes = (name: string) => new Uint8Array(readFileSync(resolve(SAMPLE_DIR, name)));

const A4: Mp3GaplessInfo = {
  sampleRate: 44100,
  samplesPerFrame: 1152,
  frames: 308,
  encoderDelay: 576,
  encoderPadding: 1440,
  contentSamples: 352800,
};

describe('readMp3GaplessInfo', () => {
  it('reads delay and padding from a shipped sample, skipping the ID3 tag', () => {
    expect(readMp3GaplessInfo(fileBytes('A4.mp3'))).toEqual(A4);
  });

  it('finds gapless info in every shipped MP3', () => {
    for (const n of ['A0', 'C4', 'Ds4', 'Fs6', 'C8']) {
      const info = readMp3GaplessInfo(fileBytes(`${n}.mp3`));
      expect(info, n).not.toBeNull();
      expect(info!.encoderDelay, n).toBe(576);
      expect(info!.sampleRate, n).toBe(44100);
    }
  });

  it('returns null for non-MP3 data', () => {
    expect(readMp3GaplessInfo(fileBytes('A4.ogg'))).toBeNull();
    expect(readMp3GaplessInfo(new Uint8Array(16))).toBeNull();
  });
});

describe('mp3TrimWindow', () => {
  const lead = A4.encoderDelay + MP3_DECODER_DELAY; // 1105 frames ≈ 25.06 ms at 44.1 kHz

  it('does nothing when the browser already trimmed (Chromium)', () => {
    expect(mp3TrimWindow(A4, 352800, 44100)).toEqual({ start: 0, length: 352800 });
  });

  it('trims encoder plus decoder delay when padding was left in', () => {
    const untrimmed = A4.frames * A4.samplesPerFrame; // 354816
    expect(mp3TrimWindow(A4, untrimmed, 44100)).toEqual({ start: lead, length: 352800 });
    expect((lead / 44100) * 1000).toBeCloseTo(25.06, 1);
  });

  it('also skips the Info frame when a decoder output it as silence', () => {
    const withInfo = (A4.frames + 1) * A4.samplesPerFrame;
    expect(mp3TrimWindow(A4, withInfo, 44100)).toEqual({ start: lead + 1152, length: 352800 });
  });

  it('scales to the context sample rate', () => {
    const scale = 48000 / 44100;
    const untrimmed = Math.round(A4.frames * A4.samplesPerFrame * scale);
    expect(mp3TrimWindow(A4, Math.round(352800 * scale), 48000).start).toBe(0);
    const w = mp3TrimWindow(A4, untrimmed, 48000);
    expect(w.start).toBe(Math.round(lead * scale));
    expect(w.length).toBe(384000);
  });
});

describe('loadSample', () => {
  /** Minimal AudioBuffer stand-in: one channel whose sample i equals i. */
  function fakeBuffer(length: number, sampleRate: number): AudioBuffer {
    const data = Float32Array.from({ length }, (_, i) => i);
    return {
      length,
      sampleRate,
      numberOfChannels: 1,
      duration: length / sampleRate,
      getChannelData: () => data,
      copyToChannel: (src: Float32Array) => data.set(src),
      copyFromChannel: () => {},
    } as unknown as AudioBuffer;
  }

  function ctxDecodingTo(length: number): DecodingContext {
    return {
      decodeAudioData: vi.fn(async () => fakeBuffer(length, 44100)),
      createBuffer: (_c, len, rate) => fakeBuffer(len, rate),
    };
  }

  const respond = (bytes: Uint8Array) => async () =>
    new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 });

  it('trims an untrimmed MP3 decode so the first sample is the attack', async () => {
    const out = await loadSample(
      ctxDecodingTo(354816),
      'A4.mp3',
      'mp3',
      respond(fileBytes('A4.mp3')),
    );
    expect(out.length).toBe(352800);
    expect(out.getChannelData(0)[0]).toBe(1105); // starts where the padding ended
  });

  it('leaves an already-trimmed MP3 and Ogg alone', async () => {
    const mp3 = await loadSample(
      ctxDecodingTo(352800),
      'A4.mp3',
      'mp3',
      respond(fileBytes('A4.mp3')),
    );
    expect(mp3.getChannelData(0)[0]).toBe(0);
    const ogg = await loadSample(
      ctxDecodingTo(352960),
      'A4.ogg',
      'ogg',
      respond(fileBytes('A4.ogg')),
    );
    expect(ogg.length).toBe(352960);
  });

  it('fails loudly on HTTP errors', async () => {
    const ctx = ctxDecodingTo(1);
    await expect(
      loadSample(ctx, 'x.mp3', 'mp3', async () => new Response('', { status: 404 })),
    ).rejects.toThrow('404');
  });
});

describe('pickSampleFormat', () => {
  it('follows canPlayType', () => {
    expect(pickSampleFormat((t) => (t.includes('ogg') ? 'probably' : 'maybe'))).toBe('ogg');
    expect(pickSampleFormat((t) => (t.includes('ogg') ? 'maybe' : ''))).toBe('ogg');
    // Safari without Vorbis
    expect(pickSampleFormat((t) => (t.includes('mpeg') ? 'maybe' : ''))).toBe('mp3');
  });
});
