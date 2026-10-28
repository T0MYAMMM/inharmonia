import { describe, expect, it } from 'vitest';
import { dropGap, dropIndex, type Box } from './barDrag';

/** Bars `w` wide and 60 tall, `perRow` to a row, 8 apart. */
function grid(count: number, perRow: number, w = 100): Box[] {
  return Array.from({ length: count }, (_, i) => {
    const left = (i % perRow) * (w + 8);
    const top = Math.floor(i / perRow) * 68;
    return { left, top, right: left + w, bottom: top + 60 };
  });
}

describe('where a dragged bar goes', () => {
  const four = grid(6, 4); // two rows: 0 1 2 3 / 4 5

  it('finds the gap before the first bar whose middle is right of the point', () => {
    expect(dropGap(four, 10, 30)).toBe(0);
    expect(dropGap(four, 60, 30)).toBe(1); // past bar 0's middle
    expect(dropGap(four, 150, 30)).toBe(1); // before bar 1's middle, at 158
    expect(dropGap(four, 420, 30)).toBe(4); // past the end of the first row
  });

  it('reads the second row, and past its last bar is the end', () => {
    expect(dropGap(four, 10, 100)).toBe(4);
    expect(dropGap(four, 170, 100)).toBe(6);
    expect(dropGap(four, 400, 100)).toBe(6);
  });

  it('takes the nearest row above, below or between the rows', () => {
    expect(dropGap(four, 10, -200)).toBe(0);
    expect(dropGap(four, 10, 900)).toBe(4);
    expect(dropGap(four, 10, 62)).toBe(0); // in the gap, nearer the first row
    expect(dropGap(four, 10, 67)).toBe(4); // nearer the second
  });

  it('works with two bars to a row, as on a phone', () => {
    const two = grid(5, 2, 136);
    expect(dropGap(two, 200, 140)).toBe(5); // right of bar 5's middle, row 3
    expect(dropGap(two, 10, 140)).toBe(4);
    expect(dropGap(two, 100, 70)).toBe(3);
  });

  it('is the start when there are no bars', () => {
    expect(dropGap([], 10, 10)).toBe(0);
  });

  it('turns a gap into where the bar ends up', () => {
    expect(dropIndex(0, 0)).toBe(0);
    expect(dropIndex(0, 1)).toBe(0); // its own gaps: no move
    expect(dropIndex(0, 4)).toBe(3);
    expect(dropIndex(3, 1)).toBe(1);
    expect(dropIndex(3, 6)).toBe(5);
  });
});
