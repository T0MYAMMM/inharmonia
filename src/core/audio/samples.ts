/**
 * Salamander Grand Piano subset: one sample every minor third (C, D#, F#, A),
 * A0 to C8. Tone.Sampler pitch-shifts between them.
 * Files live under one versioned folder so they can be precached and cache-busted together.
 */
export const SAMPLE_VERSION = 'v1';
export const SAMPLE_DIR = `samples/salamander/${SAMPLE_VERSION}/`;

export type SampleFormat = 'ogg' | 'mp3';

export function sampleNotes(): string[] {
  const out = ['A0'];
  for (let oct = 1; oct <= 7; oct++) out.push(`C${oct}`, `D#${oct}`, `F#${oct}`, `A${oct}`);
  out.push('C8');
  return out;
}

/** File stem for a note: "D#4" → "Ds4". */
export function sampleFileStem(note: string): string {
  return note.replace('#', 's');
}

/** { "A0": "<base>samples/salamander/v1/A0.ogg", ... } */
export function sampleUrls(baseUrl: string, format: SampleFormat): Record<string, string> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return Object.fromEntries(
    sampleNotes().map((n) => [n, `${base}${SAMPLE_DIR}${sampleFileStem(n)}.${format}`]),
  );
}

/**
 * Pick the format the browser says it can decode, asked through `canPlayType`
 * (pass `(t) => new Audio().canPlayType(t)`). Ogg Vorbis first, MP3 otherwise:
 * Safari and iOS report Vorbis support per version, so this follows what each
 * device actually supports. MP3 encoder padding is compensated at load time
 * (see mp3Gapless.ts), so both formats line up exactly.
 */
export function pickSampleFormat(canPlayType: (type: string) => string): SampleFormat {
  if (canPlayType('audio/ogg; codecs="vorbis"')) return 'ogg';
  return 'mp3';
}
