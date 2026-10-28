/** Snap steps in beats (quarter notes), named like the song editor's grid. */
export const SNAPS = [
  { beats: 1, label: '1/4' },
  { beats: 0.5, label: '1/8' },
  { beats: 0.25, label: '1/16' },
  { beats: 0.125, label: '1/32' },
  { beats: 0, label: 'Off' },
] as const;

/** Horizontal zoom, pixels per beat, and vertical zoom, pixels per pitch row. */
export const ZOOM_RANGE = { min: 20, max: 240, initial: 56 } as const;
export const ROW_RANGE = { min: 12, max: 44, initial: 22 } as const;
