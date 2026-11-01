/** The rooms, in the order the nav lists them. */
export const ROOMS = [
  'songs',
  'chords',
  'progressions',
  'fills',
  'ear',
  'studio',
  'progress',
] as const;

export type Room = (typeof ROOMS)[number];

/** Index pages whose content is cards: they open in their room's light. */
const WASHED: ReadonlySet<Room> = new Set(['songs', 'progressions', 'fills', 'studio', 'progress']);

export interface RoomPlace {
  /** The room a page is in, if any. */
  room: Room | null;
  /** The room's own page, not one inside it. */
  index: boolean;
  /** An index page that gets the wash of its room's tint. */
  wash: boolean;
}

const isRoom = (s: string | undefined): s is Room => (ROOMS as readonly string[]).includes(s ?? '');

/** Where a path is: "/fills" is the Fills index, "/fills/step-up" is in Fills, "/" is no room. */
export function roomOf(pathname: string): RoomPlace {
  const parts = pathname.split('/').filter(Boolean);
  const room = isRoom(parts[0]) ? parts[0] : null;
  const index = room !== null && parts.length === 1;
  return { room, index, wash: index && WASHED.has(room) };
}
