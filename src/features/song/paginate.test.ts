import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

const xs = Array.from({ length: 13 }, (_, i) => i);

describe('paginate', () => {
  it('slices a page and counts the pages', () => {
    expect(paginate(xs, 1, 9)).toEqual({ items: [0, 1, 2, 3, 4, 5, 6, 7, 8], page: 1, pages: 2 });
    expect(paginate(xs, 2, 9)).toEqual({ items: [9, 10, 11, 12], page: 2, pages: 2 });
  });

  it('clamps a page out of range, or not a number, to one that exists', () => {
    expect(paginate(xs, 7, 9).page).toBe(2);
    expect(paginate(xs, 0, 9).page).toBe(1);
    expect(paginate(xs, NaN, 9).page).toBe(1);
    expect(paginate(xs, 1.8, 9).page).toBe(1);
  });

  it('gives an empty list one empty page', () => {
    expect(paginate([], 3, 9)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
