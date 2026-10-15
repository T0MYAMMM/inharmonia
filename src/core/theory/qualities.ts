/**
 * Chord qualities offered in the chord library, in teaching order.
 * `suffix` is what follows the root in a chord symbol (parsed by `parseChord`).
 */
export interface ChordQuality {
  id: string;
  suffix: string;
  name: string;
}

export const CHORD_QUALITIES: readonly ChordQuality[] = [
  { id: 'major', suffix: '', name: 'Major' },
  { id: 'minor', suffix: 'm', name: 'Minor' },
  { id: 'dim', suffix: 'dim', name: 'Diminished' },
  { id: 'aug', suffix: 'aug', name: 'Augmented' },
  { id: 'sus2', suffix: 'sus2', name: 'Suspended 2nd' },
  { id: 'sus4', suffix: 'sus4', name: 'Suspended 4th' },
  { id: '6', suffix: '6', name: 'Major 6th' },
  { id: 'maj7', suffix: 'maj7', name: 'Major 7th' },
  { id: '7', suffix: '7', name: 'Dominant 7th' },
  { id: 'm7', suffix: 'm7', name: 'Minor 7th' },
  { id: 'm7b5', suffix: 'm7b5', name: 'Half-diminished' },
  { id: 'dim7', suffix: 'dim7', name: 'Diminished 7th' },
  { id: 'add9', suffix: 'add9', name: 'Add 9' },
  { id: '9', suffix: '9', name: 'Dominant 9th' },
  { id: 'maj9', suffix: 'maj9', name: 'Major 9th' },
  { id: 'm9', suffix: 'm9', name: 'Minor 9th' },
  { id: '11', suffix: '11', name: 'Dominant 11th' },
  { id: '13', suffix: '13', name: 'Dominant 13th' },
];
