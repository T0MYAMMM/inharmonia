/** Default keyboard range: F#1 to G5, as in the prototype. */
export const DOCK_RANGE: [number, number] = [30, 79];

const BLACK = new Set([1, 3, 6, 8, 10]);

export const isBlack = (midi: number) => BLACK.has(((midi % 12) + 12) % 12);

/** The piano: A0 to C8. */
export const PIANO_RANGE: [number, number] = [21, 108];

/**
 * The keyboard range for a piece: the default range when every note fits in it
 * (with a tone to spare), otherwise a range at least as wide, centred on the
 * notes, ending on white keys and kept within the piano.
 */
export function dockRangeFor(midis: Iterable<number>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of midis) {
    lo = Math.min(lo, m);
    hi = Math.max(hi, m);
  }
  if (lo > hi) return DOCK_RANGE;
  lo -= 2;
  hi += 2;
  if (lo >= DOCK_RANGE[0] && hi <= DOCK_RANGE[1]) return DOCK_RANGE;
  const width = Math.max(DOCK_RANGE[1] - DOCK_RANGE[0], hi - lo);
  lo -= Math.floor((width - (hi - lo)) / 2);
  hi = lo + width;
  if (lo < PIANO_RANGE[0]) [lo, hi] = [PIANO_RANGE[0], PIANO_RANGE[0] + width];
  if (hi > PIANO_RANGE[1]) [lo, hi] = [PIANO_RANGE[1] - width, PIANO_RANGE[1]];
  while (isBlack(lo) && lo > PIANO_RANGE[0]) lo--;
  while (isBlack(hi) && hi < PIANO_RANGE[1]) hi++;
  return [Math.max(PIANO_RANGE[0], lo), Math.min(PIANO_RANGE[1], hi)];
}

export interface KeyGeom {
  midi: number;
  black: boolean;
  /** Left edge in white-key widths from the keyboard's left edge. */
  x: number;
}

/**
 * Key positions for a range, in units of one white-key width. Black keys sit
 * centred on the boundary before the next white key. A range that starts on a
 * black key gets half a key of lead-in so that key is not cut off.
 */
export function layoutKeys(
  low: number,
  high: number,
  blackWidth = 0.6,
): { keys: KeyGeom[]; width: number } {
  const keys: KeyGeom[] = [];
  const lead = isBlack(low) ? blackWidth / 2 : 0;
  let whiteIndex = 0;
  for (let m = low; m <= high; m++) {
    if (isBlack(m)) keys.push({ midi: m, black: true, x: lead + whiteIndex - blackWidth / 2 });
    else keys.push({ midi: m, black: false, x: lead + whiteIndex++ });
  }
  const tail = isBlack(high) ? blackWidth / 2 : 0;
  return { keys, width: lead + whiteIndex + tail };
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function keyName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
