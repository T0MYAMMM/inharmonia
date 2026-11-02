import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');

/** The hue of each room, as the design names them (OKLCH degrees). */
const ROOM_HUES = {
  songs: 336, // orchid
  chords: 150, // sage
  progressions: 318, // lilac
  fills: 180, // seafoam
  ear: 296, // heather
  studio: 205, // lagoon
  progress: 115, // moss
} as const;

type Linear = [number, number, number];

/** The custom properties set in the `:root…` block with exactly this selector. */
function block(selector: string): Map<string, string> {
  const found = [...CSS.matchAll(/(:root[^{]*?)\s*\{([^}]*)\}/g)].find(
    (m) => m[1]!.trim() === selector,
  );
  if (!found) throw new Error(`no block ${selector}`);
  const props = new Map<string, string>();
  for (const d of found[2]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) props.set(d[1]!, d[2]!.trim());
  return props;
}

const THEMES = {
  light: block(':root'),
  dark: block(":root[data-theme='dark']"),
};

function oklch(value: string): { l: number; c: number; h: number } {
  const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!m) throw new Error(`not oklch(L C h): ${value}`);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
}

/** OKLCH to linear sRGB (Björn Ottosson's matrices, as CSS Color 4 uses). */
function oklchToLinear({ l, c, h }: { l: number; c: number; h: number }): Linear {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** "#rrggbb" as gamma-encoded sRGB channels, 0 to 1. */
function hex(value: string): Linear {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!m) throw new Error(`not #rrggbb: ${value}`);
  return [m[1]!, m[2]!, m[3]!].map((x) => parseInt(x, 16) / 255) as Linear;
}

/** `color-mix(in srgb, a p%, b)`: mixed in gamma-encoded sRGB, then made linear. */
const mixLinear = (a: Linear, b: Linear, p: number): Linear =>
  a.map((x, i) => toLinear(x * p + b[i]! * (1 - p))) as Linear;

const luminance = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG 2 contrast ratio. */
function contrast(a: Linear, b: Linear): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** OKLCH hue of a hex colour. */
function hueOf(value: string): number {
  const [r, g, b] = hex(value).map(toLinear) as Linear;
  const L = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const M = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const S = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * L - 2.428592205 * M + 0.4505937099 * S;
  const bb = 0.0259040371 * L + 0.7827717662 * M - 0.808675766 * S;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('room colours', () => {
  it('match between the dark theme and the dark system preference', () => {
    const media = block(":root:not([data-theme='light'])");
    for (const [name, value] of THEMES.dark)
      if (name.startsWith('--room-')) expect(media.get(name), name).toBe(value);
  });

  for (const [theme, props] of Object.entries(THEMES)) {
    describe(theme, () => {
      for (const [room, hue] of Object.entries(ROOM_HUES)) {
        const token = (role: string) => {
          const value = props.get(`--room-${room}-${role}`);
          if (!value) throw new Error(`--room-${room}-${role} is not set in ${theme}`);
          return oklch(value);
        };

        it(`${room}: tint, line and deep share the room's hue and stay in sRGB`, () => {
          for (const role of ['tint', 'line', 'deep']) {
            expect(token(role).h, role).toBe(hue);
            for (const channel of oklchToLinear(token(role))) {
              expect(channel).toBeGreaterThan(-0.001);
              expect(channel).toBeLessThan(1.001);
            }
          }
          expect(token('tint').c).toBeLessThanOrEqual(0.026);
        });

        it(`${room}: line is at least 3:1 and deep at least 4.5:1 on the tint`, () => {
          const tint = oklchToLinear(token('tint'));
          expect(contrast(oklchToLinear(token('line')), tint)).toBeGreaterThanOrEqual(3);
          expect(contrast(oklchToLinear(token('deep')), tint)).toBeGreaterThanOrEqual(4.5);
        });

        it(`${room}: is never amber or dusk`, () => {
          for (const meaning of ['--amber', '--dusk'])
            expect(hueGap(hue, hueOf(props.get(meaning)!)), meaning).toBeGreaterThanOrEqual(40);
        });
      }

      it('pencil is at least 3:1 on the surface and the background', () => {
        const ink = hex(props.get('--ink')!);
        const surface = hex(props.get('--surface')!);
        const pencil = mixLinear(ink, surface, 0.56);
        expect(block(':root').get('--pencil')).toBe(
          'color-mix(in srgb, var(--ink) 56%, var(--surface))',
        );
        expect(contrast(pencil, surface.map(toLinear) as Linear)).toBeGreaterThanOrEqual(3);
        expect(
          contrast(pencil, hex(props.get('--bg')!).map(toLinear) as Linear),
        ).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
