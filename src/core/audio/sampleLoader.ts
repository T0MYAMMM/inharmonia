import { mp3TrimWindow, readMp3GaplessInfo } from './mp3Gapless';
import type { SampleFormat } from './samples';

/** The parts of BaseAudioContext the loader needs (injectable for tests). */
export interface DecodingContext {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
}

/**
 * Fetch and decode one sample. For MP3, remove encoder padding if the browser's
 * decoder left it in, so the attack lands on frame 0 like the Ogg version.
 */
export async function loadSample(
  ctx: DecodingContext,
  url: string,
  format: SampleFormat,
  fetcher: (url: string) => Promise<Response> = (u) => fetch(u),
): Promise<AudioBuffer> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Sample ${url}: HTTP ${res.status}`);
  const data = await res.arrayBuffer();
  // decodeAudioData detaches the ArrayBuffer, so read the header first.
  const info =
    format === 'mp3'
      ? readMp3GaplessInfo(new Uint8Array(data, 0, Math.min(data.byteLength, 4096)))
      : null;
  const decoded = await ctx.decodeAudioData(data);
  if (!info) return decoded;
  const { start, length } = mp3TrimWindow(info, decoded.length, decoded.sampleRate);
  if (start === 0 && length === decoded.length) return decoded;
  return sliceBuffer(ctx, decoded, start, length);
}

export function sliceBuffer(
  ctx: DecodingContext,
  buf: AudioBuffer,
  start: number,
  length: number,
): AudioBuffer {
  const out = ctx.createBuffer(buf.numberOfChannels, Math.max(1, length), buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.copyToChannel(buf.getChannelData(ch).subarray(start, start + length), ch);
  }
  return out;
}
