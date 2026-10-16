/** Left-hand patterns that suit each meter; the first is the default. */
const PATTERN_IDS: Record<number, string[]> = {
  4: ['arpeggio-8ths', 'ballad-8ths', 'block', 'root-fifth', 'held'],
  3: ['waltz', 'held'],
  2: ['arpeggio-8ths', 'block', 'root-fifth', 'held'],
};

export function patternIdsFor(beatsPerBar: number): string[] {
  return PATTERN_IDS[beatsPerBar] ?? PATTERN_IDS[4]!;
}
