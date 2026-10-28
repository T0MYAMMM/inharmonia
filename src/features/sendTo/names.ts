import type { HandoffKind } from '@/core/handoff';
import type { SendToItem } from './SendToMenu';

/**
 * The way from one room to another, named once, here. Every page that can
 * send what it plays elsewhere has one menu, Send to, just before Export.
 * Its items are the rooms, named as the main menu names them, each with a
 * note saying what it will do from where you are.
 */
export const SEND_TO = 'Send to';

export const ROOMS = {
  studio: 'Studio',
  chords: 'Chords',
  progressions: 'Progressions',
  songs: 'Songs',
} as const;

export type Room = keyof typeof ROOMS;

/**
 * A song of your own already has its way into Studio, to edit it in
 * place; it says where it goes in the same words, and has no Send to.
 */
export const EDIT_IN_STUDIO = `Edit in ${ROOMS.studio}`;

/** The notes under the items. */
export const NOTES = {
  studio: 'Edit it on a piano roll, as it plays now',
  /** From a progression, in the key it plays in: "G major". */
  chordsInKey: (key: string) => `Replace the chord sequence, in ${key}`,
  chordsFromSection: (label: string) => `Replace the chord sequence with the ${label}`,
  progressionsFromSequence: 'Write it as Roman numerals, in a key you choose',
  progressionsFromSection: (label: string) => `Save the ${label} as my progression`,
  songsInKey: (key: string) => `Start a chart in ${key}`,
  songsFromSequence: 'Save it as a chart in My songs',
  nothing: 'Every bar is N.C.: nothing to send',
} as const;

/** An item for a sequence or a section with no chords in it: shown, but nothing to send. */
export const nothingToSend = (room: Room): SendToItem => ({
  room,
  note: NOTES.nothing,
  disabled: true,
  onSelect: () => undefined,
});

/** Where each kind of handoff lands. */
export const LANDING: Record<HandoffKind, string> = {
  studio: '/studio',
  progression: '/progressions/new',
  chart: '/songs/charts/new',
  chords: '/chords',
};

/** What a landing page says when the handoff its address names is not there. */
export const ARRIVAL = {
  gone: 'What was sent here is no longer available: it lasts until the next thing is sent.',
  unreadable: 'What was sent here could not be read, so nothing was opened.',
} as const;

/** The simplify levels as said in a sentence. */
export const LEVEL_WORDS = {
  original: 'chords as written',
  simplified: 'simplified chords',
  basic: 'basic chords',
} as const;

/** What Studio says was sent to it: from what, as what, and that the source stays. */
export const sentToStudio = (what: string, facts: string, source: string) =>
  `Sent from ${what}: ${facts}. Save keeps a copy in My songs; ${source} stays as it is.`;
