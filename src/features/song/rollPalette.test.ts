import { describe, expect, it } from 'vitest';
import { rollPalette } from './rollPalette';

describe('rollPalette', () => {
  it('reads the lane colours from the tokens on the roll', () => {
    const style = {
      getPropertyValue: (name: string) =>
        ({
          '--roll-bg': ' #0b1018 ',
          '--roll-lane': '#1f2a3a',
          '--roll-beat': '#97a4b6',
          '--roll-rh': '#f2b04a',
          '--roll-lh': '#7fa6d6',
          '--roll-on-rh': '#121924',
          '--roll-on-lh': '#121924',
          '--roll-edge': '#d9e0e8',
        })[name] ?? '',
    };
    expect(rollPalette(style)).toEqual({
      bg: '#0b1018',
      lane: '#1f2a3a',
      beat: '#97a4b6',
      rh: '#f2b04a',
      lh: '#7fa6d6',
      onRh: '#121924',
      onLh: '#121924',
      edge: '#d9e0e8',
    });
  });

  it('falls back to the light tokens where the properties are not set', () => {
    const p = rollPalette({ getPropertyValue: () => '' });
    expect(p.rh).toBe('#e39b2d');
    expect(p.lh).toBe('#4e73a0');
    expect(p.bg).toBe('#1c2838');
  });
});
