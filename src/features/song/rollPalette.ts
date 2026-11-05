/**
 * The falling-notes lane's colours, read from the tokens on its element so the
 * canvas carries the same meaning as the keys: amber for the right hand, dusk
 * for the left, ink text on each. The lane itself is the keys' own black, in
 * both themes, so the hands' colours read on it.
 */
export interface RollPalette {
  bg: string;
  lane: string;
  beat: string;
  rh: string;
  lh: string;
  onRh: string;
  onLh: string;
  edge: string;
}

/** The roll's custom properties, as FallingNotes.module.css sets them, with fallbacks for a bare canvas. */
const VARS: Record<keyof RollPalette, [string, string]> = {
  bg: ['--roll-bg', '#1c2838'],
  lane: ['--roll-lane', '#2c3a4f'],
  beat: ['--roll-beat', '#57657a'],
  rh: ['--roll-rh', '#e39b2d'],
  lh: ['--roll-lh', '#4e73a0'],
  onRh: ['--roll-on-rh', '#1c2838'],
  onLh: ['--roll-on-lh', '#ffffff'],
  edge: ['--roll-edge', '#fbfcfd'],
};

/** Read the palette from an element's computed style (any object with getPropertyValue). */
export function rollPalette(style: { getPropertyValue(name: string): string }): RollPalette {
  const out = {} as RollPalette;
  for (const key of Object.keys(VARS) as (keyof RollPalette)[]) {
    const [name, fallback] = VARS[key];
    const value = style.getPropertyValue(name).trim();
    out[key] = value || fallback;
  }
  return out;
}
