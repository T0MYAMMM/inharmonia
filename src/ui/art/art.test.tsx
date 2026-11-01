import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { FILLS } from '@/content/fills';
import { SONGS } from '@/content/lessons';
import { PROGRESSIONS } from '@/content/progressions';
import type { Lesson } from '@/core/content/types';
import { CardArt } from './CardArt';
import { ChordWave } from './ChordWave';
import { FillRun } from './FillRun';
import { MidiFilePage } from './MidiFilePage';
import { MiniKeys } from './MiniKeys';
import { TWINKLE } from './previews';
import { SongRoll } from './SongRoll';
import type { SongPreview } from './songPreview';
import { KeysSpot, MetronomeSpot, RestSpot } from './spots';
import { StaffBars } from './StaffBars';
import { SungToNotes } from './SungToNotes';
import { VoiceLines } from './VoiceLines';
import { WeekDots } from './WeekDots';

/**
 * A built-in song's preview, cut as the song catalogue's index cuts it: from
 * the first bar that sounds, a pickup plus two bars (or two bars), at most 24
 * notes. Every version is checked, not only the one the index shows.
 */
function previewOf(song: Lesson): SongPreview {
  const sounds = (i: number) => (song.bars[i]?.rh ?? []).some((n) => n.note !== 'r');
  const first = Math.max(
    0,
    song.bars.findIndex((_, i) => sounds(i)),
  );
  const pickup = song.bars[first]?.rh?.[0]?.note === 'r' ? 1 : 0;
  let left = 24;
  const bars = song.bars.slice(first, first + 2 + pickup).map((bar) =>
    (bar.rh ?? [])
      .slice(0, Math.max(left, 0))
      .map((n) => (left--, `${n.note}:${n.beats}${n.tie ? '~' : ''}`))
      .join(' '),
  );
  return { meter: song.meter, bars };
}

/** The drawing's root: an svg on its own, hidden from assistive tech. */
function drawn(ui: ReactElement): SVGSVGElement {
  const { container } = render(ui);
  const root = container.firstElementChild;
  expect(root?.tagName.toLowerCase()).toBe('svg');
  return root as SVGSVGElement;
}

const WEEK = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key, i) => ({ key, practised: i % 2 === 0 }));

const EVERY_DRAWING: [string, ReactElement][] = [
  ['MiniKeys', <MiniKeys notes={[60, 64, 67, 71]} below={1} octaves={3} />],
  ['VoiceLines', <VoiceLines numerals={['ii7', 'V7', 'Imaj7', 'Imaj7']} mode="major" />],
  ['FillRun', <FillRun fill={FILLS[0]!} />],
  ['ChordWave', <ChordWave notes={[60, 64, 67]} />],
  ['WeekDots', <WeekDots days={WEEK} />],
  ['StaffBars', <StaffBars preview={TWINKLE} />],
  ['SongRoll', <SongRoll preview={TWINKLE} />],
  ['SungToNotes', <SungToNotes preview={TWINKLE} />],
  ['MidiFilePage', <MidiFilePage preview={TWINKLE} />],
  ['RestSpot', <RestSpot />],
  ['MetronomeSpot', <MetronomeSpot />],
  ['KeysSpot', <KeysSpot />],
];

describe('drawings', () => {
  it.each(EVERY_DRAWING)('%s is aria-hidden at its root and never focusable', (_, ui) => {
    const svg = drawn(ui);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg.querySelector('[aria-hidden="false"], a, [tabindex]')).toBeNull();
  });

  it('the card panel is aria-hidden too', () => {
    const { container } = render(
      <CardArt>
        <WeekDots days={WEEK} />
      </CardArt>,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(FILLS.map((f) => [f.id, f] as const))('fill %s draws its run', (_, fill) => {
    const svg = drawn(<FillRun fill={fill} />);
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(1);
  });

  it.each(PROGRESSIONS.map((p) => [p.id, p] as const))(
    'progression %s draws its voices',
    (_, p) => {
      const svg = drawn(<VoiceLines numerals={p.steps.map((s) => s.numeral)} mode={p.mode} />);
      expect(svg.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3 * p.steps.length);
    },
  );

  it('a numeral it cannot read draws nothing, without throwing', () => {
    const { container } = render(<VoiceLines numerals={['ii7', 'nonsense']} mode="major" />);
    expect(container.firstElementChild).toBeNull();
  });

  it.each(SONGS.map((s) => [s.id, s] as const))('song %s draws its first bars', (_, song) => {
    const preview = previewOf(song);
    const staff = drawn(<StaffBars preview={preview} />);
    expect(staff.querySelectorAll('ellipse').length).toBeGreaterThan(0);
    // Studio's drawings read the same shape.
    drawn(<SongRoll preview={preview} />);
    drawn(<SungToNotes preview={preview} />);
  });

  it("draws Twinkle's first two bars on Home's Songs card", () => {
    const svg = drawn(<StaffBars preview={TWINKLE} />);
    expect(svg.querySelectorAll('ellipse')).toHaveLength(7);
    expect(svg.querySelector('text')).toHaveTextContent('4');
  });
});

const SRC = resolve(__dirname, '../..');
const files = (dir: string, ext: RegExp) =>
  (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => ext.test(f))
    .map((f) => join(dir, f));
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('colour in the drawings', () => {
  it('never uses amber or dusk, which mean a hand or a target note', () => {
    for (const file of files(__dirname, /\.(css|tsx?)$/)) {
      if (file.endsWith('.test.tsx') || file.endsWith('.test.ts')) continue;
      const text = file.endsWith('.css')
        ? withoutComments(readFileSync(file, 'utf8'))
        : readFileSync(file, 'utf8');
      expect(text, relative(SRC, file)).not.toMatch(/--(on-)?(amber|dusk|focus)/);
      if (file.endsWith('.css')) expect(text, relative(SRC, file)).not.toMatch(/amber|dusk/i);
    }
  });

  it('room colours are read only by the drawings and the room wash', () => {
    for (const file of files(SRC, /\.css$/)) {
      const name = relative(SRC, file);
      if (name.startsWith('ui/art/') || name === 'styles/tokens.css') continue;
      expect(withoutComments(readFileSync(file, 'utf8')), name).not.toMatch(/--(room|art)-/);
    }
  });
});
