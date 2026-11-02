import { describe, expect, it } from 'vitest';
import { parseBar, previewNotes, type SongPreview } from './songPreview';
import { beamGroups, layoutStaff, staffNotes, stepOf } from './staffLayout';

const four = { beats: 4, unit: 4 };

describe('preview bar strings', () => {
  it('reads notes, rests and their lengths', () => {
    expect(parseBar('r:2 G4:0.5 Bb4:.5 F#5:1')).toEqual([
      { note: null, beats: 2, tie: false },
      { note: 'G4', beats: 0.5, tie: false },
      { note: 'Bb4', beats: 0.5, tie: false },
      { note: 'F#5', beats: 1, tie: false },
    ]);
  });

  it('reads a tie after the note, written after the beats or the name', () => {
    expect(parseBar('G4:1~ G4:1 A4~:2')!.map((e) => e.tie)).toEqual([true, false, true]);
  });

  it('reads dotted values as written', () => {
    expect(parseBar('Bb4:1.5 G4:0.5 C5:0.75 D5:0.25')!.map((e) => e.beats)).toEqual([
      1.5, 0.5, 0.75, 0.25,
    ]);
  });

  it('refuses anything it cannot read', () => {
    for (const bad of ['H4:1', 'C4', 'C:1', 'C4:0', 'C4:-1', 'C4:1 ; drop', 'r:x', 'C4:1~~'])
      expect(parseBar(bad), bad).toBeNull();
  });

  it('puts each bar a full bar after the last, leaving rests out', () => {
    const notes = previewNotes({ meter: { beats: 3, unit: 4 }, bars: ['r:2 G4:1', 'A4:3'] });
    expect(notes).toEqual([
      { note: 'G4', at: 2, beats: 1, tie: false },
      { note: 'A4', at: 3, beats: 3, tie: false },
    ]);
  });

  it('gives up on a meter it cannot draw or a bar it cannot read', () => {
    expect(previewNotes({ meter: { beats: 4, unit: 3 }, bars: ['C4:4'] })).toBeNull();
    expect(previewNotes({ meter: { beats: 0, unit: 4 }, bars: ['C4:4'] })).toBeNull();
    expect(previewNotes({ meter: four, bars: ['C4:4', 'oops'] })).toBeNull();
    expect(layoutStaff({ meter: four, bars: ['r:4'] }, 240)).toBeNull();
  });
});

describe('the staff', () => {
  const preview = (meter: SongPreview['meter'], ...bars: string[]) => ({ meter, bars });

  it('places notes by letter and octave, ignoring accidentals', () => {
    expect(stepOf('C4')).toBe(28);
    expect(stepOf('F#4')).toBe(31);
    expect(stepOf('Bb4')).toBe(34);
  });

  it('moves the melody by octaves so its middle sits on the staff', () => {
    const low = staffNotes(preview(four, 'C3:1 E3:1 G3:1 C4:1'))!;
    const high = staffNotes(preview(four, 'C4:1 E4:1 G4:1 C5:1'))!;
    expect(low.map((n) => n.step)).toEqual(high.map((n) => n.step));
  });

  it('beams eighths per beat in x/4, and breaks a beam at a rest or a longer note', () => {
    const notes = staffNotes(preview(four, 'C5:0.5 D5:0.5 E5:0.5 F5:0.5 G5:1 r:0.5 A5:0.5'))!;
    expect(beamGroups(notes, four).map((g) => g.length)).toEqual([2, 2, 1, 1]);
  });

  it('beams the whole bar in x/8', () => {
    const six = { beats: 6, unit: 8 };
    const notes = staffNotes(preview(six, 'C5:1 D5:1 E5:1 F5:1 G5:1 A5:1', 'B5:3 A5:3'))!;
    expect(beamGroups(notes, six).map((g) => g.length)).toEqual([6, 1, 1]);
    const layout = layoutStaff(preview(six, 'C5:1 D5:1 E5:1 F5:1 G5:1 A5:1'), 240)!;
    expect(layout.beams).toHaveLength(1);
  });

  it('beams sixteenths twice and flags a lone eighth', () => {
    const beamed = layoutStaff(preview(four, 'C5:0.25 D5:0.25 E5:0.25 F5:0.25 G5:3'), 240)!;
    expect(beamed.beams).toHaveLength(2);
    const lone = layoutStaff(preview(four, 'C5:0.5 r:0.5 G5:3'), 240)!;
    expect(lone.beams).toHaveLength(0);
    expect(lone.strokes.filter((d) => d.includes('c2'))).toHaveLength(1);
  });

  it('dots a dotted note and draws a tie to the next', () => {
    const layout = layoutStaff(preview(four, 'Bb4:1.5 G4:0.5 G4:2~', 'G4:4'), 240)!;
    expect(layout.dots).toHaveLength(1);
    expect(layout.strokes.filter((d) => d.includes('Q'))).toHaveLength(1);
    expect(layout.heads.map((h) => h.hollow)).toEqual([false, false, true, true]);
  });

  it('starts at the pickup note, with no barline before it', () => {
    const layout = layoutStaff(
      preview({ beats: 3, unit: 4 }, 'r:2 G4:0.5 G4:0.5', 'Bb4:1.5 G4:0.5 G4:1', 'D5:3'),
      240,
    )!;
    const first = layout.heads[0]!.cx;
    expect(first).toBeLessThan(layout.barlines[0]!);
    expect(layout.barlines).toHaveLength(3);
    // The pickup takes a third of a bar, not a whole one.
    expect(layout.barlines[0]! - first).toBeLessThan(
      (layout.barlines[1]! - layout.barlines[0]!) / 2,
    );
  });

  it('keeps a barline clear of the next notehead', () => {
    const layout = layoutStaff(preview(four, 'C5:4', 'D5:4'), 240)!;
    expect(layout.heads[1]!.cx - layout.barlines[0]!).toBeGreaterThanOrEqual(6);
  });

  it('adds ledger lines below and above the staff', () => {
    const layout = layoutStaff(preview(four, 'A3:1 B4:1 B5:2'), 240)!;
    const ledgers = layout.strokes
      .map((d) => /^M[\d.]+ (-?[\d.]+)H/.exec(d))
      .filter((m) => m !== null)
      .map((m) => Number(m[1]));
    const [top, bottom] = [layout.lines[0]!, layout.lines.at(-1)!];
    expect(ledgers.filter((y) => y > bottom)).toHaveLength(2); // C4 and A3
    expect(ledgers.filter((y) => y < top)).toHaveLength(1); // A5, under B5
  });
});
