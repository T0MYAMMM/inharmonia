import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_ENTRIES } from '@/content/builtInIndex';
import { FILLS } from '@/content/fills';
import { SONGS } from '@/content/lessons';
import { PROGRESSIONS } from '@/content/progressions';
import { parseIndex, previewOf } from '@/core/library/catalogue';
import { CardArt } from './CardArt';
import { ChordWave } from './ChordWave';
import { FillRun } from './FillRun';
import { MidiFilePage } from './MidiFilePage';
import { MiniKeys } from './MiniKeys';
import { TWINKLE } from './previews';
import { SongRoll } from './SongRoll';
import { KeysSpot, MetronomeSpot, RestSpot } from './spots';
import { StaffBars } from './StaffBars';
import { SungToNotes } from './SungToNotes';
import { VoiceLines } from './VoiceLines';
import { WeekDots } from './WeekDots';

/** The catalogue's index, as the app serves it next to itself. */
const CATALOGUE = parseIndex(
  readFileSync(resolve(__dirname, '../../../public/library/index.json'), 'utf8'),
)!;

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

  it.each(SONGS.map((s) => [s.id, s] as const))(
    'built-in song %s draws its first bars',
    (_, song) => {
      // Every version, cut as the index cuts the one it shows.
      const preview = previewOf(song.bars, song.meter);
      const staff = drawn(<StaffBars preview={preview} />);
      expect(staff.querySelectorAll('ellipse').length).toBeGreaterThan(0);
      // Studio's drawings read the same shape.
      drawn(<SongRoll preview={preview} />);
      drawn(<SungToNotes preview={preview} />);
    },
  );

  it.each([...BUILT_IN_ENTRIES, ...CATALOGUE].map((e) => [e.piece, e] as const))(
    "%s's index preview draws on its card",
    (_, entry) => {
      const staff = drawn(<StaffBars preview={entry.preview} />);
      expect(staff.querySelectorAll('ellipse').length).toBeGreaterThan(0);
    },
  );

  it('the catalogue has songs to draw', () => {
    expect(BUILT_IN_ENTRIES.length).toBeGreaterThan(0);
    expect(CATALOGUE.length).toBeGreaterThan(0);
  });

  it("draws Twinkle's opening bars from the built-in index, as Home's Songs card does", () => {
    const twinkle = BUILT_IN_ENTRIES.find((e) => e.piece === 'twinkle-twinkle')!;
    const svg = drawn(<StaffBars preview={twinkle.preview} />);
    expect(svg.querySelectorAll('ellipse')).toHaveLength(6);
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['2', '4']);
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
