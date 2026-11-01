import { describe, expect, it } from 'vitest';
import type { ProgressionMatch, SectionHarmony } from '@/core/charts';
import { progressionLink, songProgressions, whereFound } from './progressionWords';

const match = (patch: Partial<ProgressionMatch>): ProgressionMatch => ({
  id: 'ii-v-i',
  name: 'ii–V–I',
  whole: false,
  spans: [{ from: 1, to: 3, times: 1 }],
  ...patch,
});
const G = { tonic: 'G', mode: 'major' } as const;

describe('saying where a progression is', () => {
  it('names the places, and how many times round', () => {
    expect(whereFound(match({}))).toBe('bars 1–3');
    expect(
      whereFound(
        match({
          spans: [
            { from: 1, to: 3, times: 1 },
            { from: 5, to: 7, times: 1 },
          ],
        }),
      ),
    ).toBe('bars 1–3 and 5–7');
    expect(whereFound(match({ spans: [{ from: 2, to: 2, times: 1 }] }))).toBe('bar 2');
    expect(
      whereFound(
        match({
          spans: [
            { from: 1, to: 4, times: 1 },
            { from: 6, to: 13, times: 2 },
          ],
        }),
      ),
    ).toBe('bars 1–4; bars 6–13, twice');
  });

  it('says a whole-section loop, where it starts, and a key it reads in', () => {
    expect(whereFound(match({ whole: true, spans: [{ from: 1, to: 8, times: 2 }] }))).toBe(
      'the whole section, twice',
    );
    expect(
      whereFound(
        match({
          whole: true,
          startsOn: 'bVI',
          readIn: { tonic: 'Eb', mode: 'major' },
          spans: [{ from: 1, to: 4, times: 3 }],
        }),
      ),
    ).toBe('the whole section, 3 times, started on ♭VI, read in E♭ major');
  });

  it("links to the progression's page in the key it was found in", () => {
    expect(progressionLink(match({}), G)).toBe('/progressions/ii-v-i?key=G');
    expect(progressionLink(match({ readIn: { tonic: 'F#', mode: 'minor' } }), G)).toBe(
      '/progressions/ii-v-i?key=F%23',
    );
  });
});

describe('the progressions to name for a song', () => {
  const section = (matches: ProgressionMatch[]): SectionHarmony => ({
    id: 's',
    label: 'Verse',
    bars: [],
    matches,
  });

  it('names each once, by the name that starts where the section does', () => {
    const loop = match({ id: 'i-v-vi-iv', name: 'I–V–vi–IV', whole: true });
    const turned = match({ id: 'vi-iv-i-v', name: 'vi–IV–I–V', whole: true, startsOn: 'I' });
    expect(
      songProgressions([section([loop, turned]), section([loop]), section([match({})])]).map(
        (m) => m.id,
      ),
    ).toEqual(['i-v-vi-iv', 'ii-v-i']);
  });

  it('names a loop found only started elsewhere by its first name', () => {
    const a = match({ id: 'i-v-vi-iv', whole: true, startsOn: 'IV' });
    const b = match({ id: 'vi-iv-i-v', whole: true, startsOn: 'IV' });
    expect(songProgressions([section([a, b])]).map((m) => m.id)).toEqual(['i-v-vi-iv']);
  });
});
