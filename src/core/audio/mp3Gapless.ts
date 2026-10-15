/**
 * MP3 gapless compensation.
 *
 * MP3 encoders prepend silence (the encoder delay, 576 frames for LAME/Lavc) and
 * the decoder adds 529 more, so an MP3 decoded naively starts about 25 ms late
 * at 44.1 kHz. Encoders record the exact delay and padding in the Xing/Info
 * header. Some browsers (Chromium) read it and return a trimmed buffer; others
 * return the padding. We parse the header ourselves and, only when the decoded
 * length shows the padding is still there, trim it, so MP3 and Ogg samples start
 * on the same frame everywhere.
 */

export interface Mp3GaplessInfo {
  sampleRate: number;
  samplesPerFrame: number;
  /** Number of audio frames in the stream, from the Xing/Info header. */
  frames: number;
  encoderDelay: number;
  encoderPadding: number;
  /** Real audio length in samples at `sampleRate`. */
  contentSamples: number;
}

/** Decoder delay of a standard MPEG layer III decoder, in samples. */
export const MP3_DECODER_DELAY = 529;

const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

function id3v2Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
  const size =
    ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  const hasFooter = (b[5]! & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

const u32 = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;

/** Read the gapless fields from an MP3 file's first frame, or null if absent. */
export function readMp3GaplessInfo(bytes: Uint8Array): Mp3GaplessInfo | null {
  let i = id3v2Size(bytes);
  // Find the first frame sync (11 set bits).
  while (i + 4 <= bytes.length && !(bytes[i] === 0xff && (bytes[i + 1]! & 0xe0) === 0xe0)) i++;
  if (i + 4 > bytes.length) return null;

  const version = (bytes[i + 1]! >> 3) & 0b11; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (bytes[i + 1]! >> 1) & 0b11; // 1 = layer III
  const rateIndex = (bytes[i + 2]! >> 2) & 0b11;
  const mono = ((bytes[i + 3]! >> 6) & 0b11) === 3;
  const sampleRate = SAMPLE_RATES[version]?.[rateIndex];
  if (layer !== 1 || !sampleRate) return null;

  const mpeg1 = version === 3;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  let p = i + 4 + sideInfo;
  const tag = String.fromCharCode(...bytes.subarray(p, p + 4));
  if (tag !== 'Xing' && tag !== 'Info') return null;

  const flags = u32(bytes, p + 4);
  p += 8;
  if (!(flags & 1)) return null; // no frame count, cannot know the content length
  const frames = u32(bytes, p);
  p += 4;
  if (flags & 2) p += 4; // byte count
  if (flags & 4) p += 100; // seek table
  if (flags & 8) p += 4; // quality
  // LAME-style extension: 9-byte encoder id, then delay/padding at offset 21 (12 bits each).
  if (p + 24 > bytes.length) return null;
  const d = p + 21;
  const encoderDelay = (bytes[d]! << 4) | (bytes[d + 1]! >> 4);
  const encoderPadding = ((bytes[d + 1]! & 0x0f) << 8) | bytes[d + 2]!;
  const contentSamples = frames * samplesPerFrame - encoderDelay - encoderPadding;
  if (contentSamples <= 0) return null;
  return { sampleRate, samplesPerFrame, frames, encoderDelay, encoderPadding, contentSamples };
}

/**
 * Where the real audio sits inside a decoded buffer, in decoded frames.
 * `decodedRate` may differ from the file's rate (decodeAudioData resamples to the context).
 *
 * - Decoded length ≈ content: the browser already trimmed; start at 0.
 * - Longer: it did not. The audio starts after the encoder plus decoder delay,
 *   and also after one more frame if the decoder output the Info frame as silence.
 */
export function mp3TrimWindow(
  info: Mp3GaplessInfo,
  decodedFrames: number,
  decodedRate: number,
): { start: number; length: number } {
  const scale = decodedRate / info.sampleRate;
  const content = Math.round(info.contentSamples * scale);
  const tolerance = Math.max(32, Math.round(decodedRate * 0.002));
  const excess = decodedFrames - content;
  if (excess <= tolerance) return { start: 0, length: decodedFrames };
  const lead = (info.encoderDelay + MP3_DECODER_DELAY) * scale;
  const leadWithInfoFrame = lead + info.samplesPerFrame * scale;
  const start = Math.round(excess >= leadWithInfoFrame - tolerance ? leadWithInfoFrame : lead);
  return { start, length: Math.max(0, Math.min(content, decodedFrames - start)) };
}
