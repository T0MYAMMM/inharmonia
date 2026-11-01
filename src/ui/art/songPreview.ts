/**
 * A song's first bars, as the song catalogue's index carries them. The shape
 * is written here, not imported, so the drawings depend on no content code.
 */
export interface SongPreview {
  meter: { beats: number; unit: number };
  /** Melody only, one string per bar: "<note>:<beats>" or "r:<beats>", "~" after a tied note. Beats in the meter's unit. */
  bars: string[];
}

/** One event of a preview bar. */
export interface PreviewEvent {
  /** Spelled note with octave ("F#4"), or null for a rest. */
  note: string | null;
  /** Length in the meter's unit. */
  beats: number;
  /** Tied to the next note, which sounds as one with it. */
  tie: boolean;
}

/** A sounding note on one timeline across the bars. */
export interface PreviewNote {
  note: string;
  /** Start, in the meter's unit from the start of the first bar. */
  at: number;
  beats: number;
  tie: boolean;
}

// "C4:1", "Bb4:1.5~", "F#5~:0.5" or "r:2". The tie may follow the note or the beats.
const TOKEN = /^(r|[A-G](?:##|bb|#|b)?-?\d)(~?):(\d+(?:\.\d+)?|\.\d+)(~?)$/;

/** One bar's string as events, or null if any of it can't be read. */
export function parseBar(text: string): PreviewEvent[] | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const out: PreviewEvent[] = [];
  for (const token of tokens) {
    const m = TOKEN.exec(token);
    if (!m) return null;
    const beats = Number(m[3]);
    if (!(beats > 0) || !Number.isFinite(beats)) return null;
    const rest = m[1] === 'r';
    out.push({ note: rest ? null : m[1]!, beats, tie: !rest && Boolean(m[2] || m[4]) });
  }
  return out;
}

/** A meter a drawing can use: whole beats, and a unit that is a power of two. */
export function isMeter(meter: SongPreview['meter']): boolean {
  return (
    Number.isInteger(meter.beats) &&
    meter.beats >= 1 &&
    meter.beats <= 16 &&
    [1, 2, 4, 8, 16].includes(meter.unit)
  );
}

/**
 * The preview's sounding notes on one timeline, each bar starting a full bar
 * after the last. Null if the meter or any bar can't be read: a drawing then
 * shows nothing rather than something wrong.
 */
export function previewNotes(preview: SongPreview): PreviewNote[] | null {
  if (!isMeter(preview.meter)) return null;
  const notes: PreviewNote[] = [];
  for (const [i, text] of preview.bars.entries()) {
    const events = parseBar(text);
    if (!events) return null;
    let at = i * preview.meter.beats;
    for (const e of events) {
      if (e.note) notes.push({ note: e.note, at, beats: e.beats, tie: e.tie });
      at += e.beats;
    }
  }
  return notes;
}
