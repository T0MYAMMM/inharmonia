import { previewNotes, type SongPreview } from './songPreview';

/** A melody note on the staff, in quarter notes. */
export interface StaffNote {
  /** Start, in quarter notes from the start of the first bar. */
  at: number;
  /** Length in quarter notes. */
  q: number;
  /** Diatonic step: the letter plus seven per octave, C0 = 0. */
  step: number;
  tie: boolean;
}

export interface StaffLayout {
  width: number;
  height: number;
  meter: SongPreview['meter'];
  /** The five lines' y, top to bottom, and where they end on the right. */
  lines: number[];
  linesEnd: number;
  /** The time signature's centre x, and its two figures' y. */
  sig: { x: number; top: number; bottom: number };
  heads: { cx: number; cy: number; hollow: boolean }[];
  /** Short lines: ledger lines, stems, flags and ties, as SVG paths. */
  strokes: string[];
  beams: { x: number; y: number; width: number }[];
  dots: { cx: number; cy: number }[];
  barlines: number[];
}

const LETTERS = 'CDEFGAB';
const E4 = 2 + 4 * 7; // the bottom line
const B4 = 6 + 4 * 7; // the middle line
const HEIGHT = 44;
const GAP = 6; // between staff lines
const TOP = 10; // the top line, F5
const BOTTOM = TOP + 4 * GAP;
const STEM = 3 * GAP;
const SIG = 18; // the time signature's width
const EPS = 1e-6;

/** "F#4" as a diatonic step, ignoring the accidental (the drawing leaves the key out). */
export function stepOf(name: string): number {
  const m = /^([A-G])[#b]*(-?\d)$/.exec(name);
  if (!m) throw new Error(`Not a note with octave: "${name}"`);
  return LETTERS.indexOf(m[1]!) + Number(m[2]) * 7;
}

/** The preview's notes in quarter notes, moved by octaves so their middle sits near B4. */
export function staffNotes(preview: SongPreview): StaffNote[] | null {
  const notes = previewNotes(preview);
  if (!notes?.length) return null;
  const q = 4 / preview.meter.unit;
  const out = notes.map((n) => ({
    at: n.at * q,
    q: n.beats * q,
    step: stepOf(n.note),
    tie: n.tie,
  }));
  const sorted = out.map((n) => n.step).sort((a, b) => a - b);
  const shift = Math.round((B4 - sorted[Math.floor(sorted.length / 2)]!) / 7) * 7;
  for (const n of out) n.step += shift;
  return out;
}

/**
 * Notes that share a beam: shorter than a quarter, back to back, in the same
 * beat; in x/8 the whole bar is one beat. A rest or a longer note breaks it.
 */
export function beamGroups(
  notes: readonly StaffNote[],
  meter: SongPreview['meter'],
): StaffNote[][] {
  const beat = meter.unit === 8 ? (meter.beats * 4) / meter.unit : 1;
  const groups: StaffNote[][] = [];
  for (const n of notes) {
    const last = groups.at(-1);
    const prev = last?.at(-1);
    const joins =
      prev !== undefined &&
      n.q < 1 &&
      prev.q < 1 &&
      Math.abs(prev.at + prev.q - n.at) < EPS &&
      Math.floor(prev.at / beat + EPS) === Math.floor(n.at / beat + EPS);
    if (joins) last!.push(n);
    else groups.push([n]);
  }
  return groups;
}

/**
 * A song's first bars as a treble staff: spaced by time, not engraved. It
 * starts at the first note, so a pickup leaves no empty bar, and each barline
 * stands clear of the next bar's first notehead.
 */
export function layoutStaff(preview: SongPreview, width: number): StaffLayout | null {
  const notes = staffNotes(preview);
  if (!notes) return null;
  const { meter } = preview;
  const barQ = (meter.beats * 4) / meter.unit;
  const total = preview.bars.length * barQ;
  const start = notes[0]!.at;
  const X = (q: number) =>
    SIG + 8 + ((q - start) / Math.max(total - start, EPS)) * (width - SIG - 14);
  const y = (step: number) => BOTTOM - (step - E4) * (GAP / 2);

  const heads: StaffLayout['heads'] = [];
  const strokes: string[] = [];
  const beams: StaffLayout['beams'] = [];
  const dots: StaffLayout['dots'] = [];

  for (const n of notes) {
    const cx = X(n.at);
    const cy = y(n.step);
    heads.push({ cx, cy, hollow: n.q >= 2 - EPS });
    // Ledger lines below and above the staff.
    for (let st = E4 - 2; st >= n.step; st -= 2) strokes.push(ledger(cx, y(st)));
    for (let st = E4 + 10; st <= n.step; st += 2) strokes.push(ledger(cx, y(st)));
    // A dotted note: half as long again. On a line, the dot sits in the space above.
    if ([0.75, 1.5, 3, 6].some((d) => Math.abs(n.q - d) < EPS))
      dots.push({ cx: cx + 6.5, cy: cy - (n.step % 2 ? 0 : GAP / 2) });
  }

  for (const g of beamGroups(notes, meter)) {
    const up = g.reduce((sum, n) => sum + n.step, 0) / g.length < B4;
    const sx = (n: StaffNote) => X(n.at) + (up ? 3.4 : -3.4);
    if (g[0]!.q >= 4 - EPS) continue; // a whole note has no stem
    if (g.length === 1) {
      const n = g[0]!;
      const tip = y(n.step) + (up ? -STEM : STEM);
      strokes.push(`M${sx(n)} ${y(n.step)}V${tip}`);
      // A lone eighth gets a flag, a sixteenth two.
      const flags = n.q < 0.5 - EPS ? 2 : n.q < 1 - EPS ? 1 : 0;
      for (let f = 0; f < flags; f++) {
        const fy = tip + (up ? f * 4 : -f * 4);
        strokes.push(up ? `M${sx(n)} ${fy}c2 4 6.5 5 5 11` : `M${sx(n)} ${fy}c2 -4 6.5 -5 5 -11`);
      }
      continue;
    }
    // A flat beam over (or under) the group's furthest note; two for sixteenths.
    const ys = g.map((n) => y(n.step));
    const beamY = up ? Math.min(...ys) - STEM : Math.max(...ys) + STEM;
    for (const n of g) strokes.push(`M${sx(n)} ${y(n.step)}V${beamY}`);
    const x = sx(g[0]!);
    const w = sx(g.at(-1)!) - x;
    beams.push({ x, y: beamY - (up ? 0 : 2.8), width: w });
    if (g.every((n) => n.q < 0.5 - EPS)) beams.push({ x, y: beamY + (up ? 5 : -7.8), width: w });
  }

  // Ties: a shallow arc to the next note, away from the stems.
  notes.forEach((n, i) => {
    const next = notes[i + 1];
    if (!n.tie || !next) return;
    const below = n.step < B4;
    const yy = y(n.step) + (below ? 4 : -4);
    const x1 = X(n.at) + 2;
    const x2 = X(next.at) - 2;
    strokes.push(`M${x1} ${yy}Q${(x1 + x2) / 2} ${yy + (below ? 5 : -5)} ${x2} ${yy}`);
  });

  // Clear of the next bar's first notehead, so a barline never reads as its stem.
  const barlines = preview.bars.map((_, i) => X((i + 1) * barQ) - 7).filter((bx) => bx > SIG + 4);
  return {
    width,
    height: HEIGHT,
    meter,
    lines: [0, 1, 2, 3, 4].map((i) => TOP + i * GAP),
    linesEnd: barlines.at(-1) ?? width,
    sig: { x: SIG / 2, top: TOP + GAP, bottom: TOP + 3 * GAP },
    heads,
    strokes,
    beams,
    dots,
    barlines,
  };
}

const ledger = (cx: number, ly: number) => `M${cx - 5.5} ${ly}H${cx + 5.5}`;
