/** A bar's box on the page. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where a dragged bar would go, as a gap between bars: 0 is before the
 * first, `boxes.length` after the last. The row is the one the point is in
 * (or the nearest), and within it the gap before the first bar whose middle
 * is right of the point. Boxes are in reading order, rows wrapping.
 */
export function dropGap(boxes: readonly Box[], x: number, y: number): number {
  if (boxes.length === 0) return 0;
  const rows: number[][] = [];
  boxes.forEach((b, i) => {
    const row = rows.at(-1);
    if (row && Math.abs(boxes[row[0]!]!.top - b.top) < 1) row.push(i);
    else rows.push([i]);
  });
  const distance = (row: number[]) => {
    const { top, bottom } = boxes[row[0]!]!;
    return y < top ? top - y : y > bottom ? y - bottom : 0;
  };
  const row = rows.reduce((best, r) => (distance(r) < distance(best) ? r : best));
  for (const i of row) {
    const b = boxes[i]!;
    if (x < (b.left + b.right) / 2) return i;
  }
  return row.at(-1)! + 1;
}

/** The index a bar dragged from `from` ends up at, dropped in `gap`. */
export function dropIndex(from: number, gap: number): number {
  return gap > from ? gap - 1 : gap;
}
