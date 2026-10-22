/** Local SMF format 0/1 MIDI editing: notes, channels, programs, tempo and meter.
 * Unsupported expressive events (pedal, automation, lyrics, SysEx) are not retained. */
export interface MidiNote { id: string; startBeat: number; beats: number; midi: number; velocity: number }
export interface MidiTrack { id: string; name: string; channel: number; program: number; muted: boolean; notes: MidiNote[] }
export interface MidiTempo { beat: number; bpm: number }
export interface MidiMeter { beat: number; numerator: number; denominator: number }
export interface MidiProject {
  title: string;
  ppq: number;
  tempo: number;
  meter: { beats: number; unit: number };
  tempos: MidiTempo[];
  meters: MidiMeter[];
  tracks: MidiTrack[];
}
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_NOTES = 50000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const bpmSafe = (v: number) => clamp(Math.round(v * 100) / 100, 20, 300);
class Reader {
  at = 0;
  constructor(readonly data: Uint8Array) {}
  need(n: number) { if (n < 0 || this.at + n > this.data.length) throw new Error('Truncated MIDI data.'); }
  u8() { this.need(1); return this.data[this.at++]!; }
  u16() { return this.u8() * 256 + this.u8(); }
  u32() { return (this.u16() * 65536 + this.u16()) >>> 0; }
  str(n: number) { return String.fromCharCode(...this.bytes(n)); }
  bytes(n: number) { this.need(n); const a = this.data.subarray(this.at, this.at + n); this.at += n; return a; }
  vlq() {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('MIDI delta time is too large.');
  }
}
function readTrack(raw: Uint8Array, index: number, ppq: number, tempos: MidiTempo[], meters: MidiMeter[]) {
  const r = new Reader(raw);
  let tick = 0, running = -1, name = '', serial = 0;
  const programs = new Map<number, number>();
  const channels = new Map<number, MidiNote[]>();
  const active = new Map<string, { tick: number; velocity: number }[]>();
  const finish = (channel: number, midi: number, at: number) => {
    const queue = active.get(channel + ':' + midi);
    const first = queue?.shift();
    if (!first) return;
    const notes = channels.get(channel) ?? [];
    notes.push({ id: 'n' + (++serial), startBeat: first.tick / ppq,
      beats: Math.max(1 / ppq, (at - first.tick) / ppq), midi, velocity: first.velocity });
    channels.set(channel, notes);
  };
  while (r.at < raw.length) {
    tick += r.vlq();
    if (tick > 0x0fffffff) throw new Error('MIDI is too long.');
    const lead = r.u8();
    const status = lead & 0x80 ? lead : running;
    if (status < 0x80) throw new Error('Invalid MIDI running status.');
    if (lead & 0x80) running = status < 0xf0 ? status : -1;
    else r.at--;
    if (status === 0xff) {
      const type = r.u8(), bytes = r.bytes(r.vlq());
      if (type === 0x03 && !name) name = new TextDecoder().decode(bytes).slice(0, 80);
      if (type === 0x51 && bytes.length === 3) {
        const us = bytes[0]! * 65536 + bytes[1]! * 256 + bytes[2]!;
        if (us > 0) tempos.push({ beat: tick / ppq, bpm: 60000000 / us });
      }
      if (type === 0x58 && bytes.length >= 2 && bytes[1]! <= 7)
        meters.push({ beat: tick / ppq, numerator: bytes[0]!, denominator: 2 ** bytes[1]! });
      if (type === 0x2f) break;
    } else if (status === 0xf0 || status === 0xf7) r.bytes(r.vlq());
    else if (status >= 0xf0) throw new Error('Unsupported MIDI system status.');
    else {
      const kind = status & 0xf0, channel = status & 15;
      const a = r.u8(), b = kind === 0xc0 || kind === 0xd0 ? 0 : r.u8();
      if (a > 127 || b > 127) throw new Error('Invalid MIDI event data.');
      if (kind === 0x90 && b > 0) {
        const key = channel + ':' + a;
        const queue = active.get(key) ?? [];
        queue.push({ tick, velocity: b });
        active.set(key, queue);
      } else if (kind === 0x80 || (kind === 0x90 && b === 0)) finish(channel, a, tick);
      else if (kind === 0xc0) programs.set(channel, a);
    }
    if (serial > MAX_NOTES) throw new Error('MIDI has too many notes.');
  }
  for (const [key, queue] of active) {
    const [channel, midi] = key.split(':').map(Number);
    while (queue.length) finish(channel!, midi!, tick);
  }
  return [...channels.entries()].map(([channel, notes]): MidiTrack => ({
    id: 't' + index + 'c' + channel,
    name: name ? (channels.size > 1 ? name + ' channel ' + (channel + 1) : name) : 'Track ' + (index + 1),
    channel, program: programs.get(channel) ?? 0, muted: false,
    notes: notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi),
  }));
}
export function parseMidi(input: Uint8Array | ArrayBuffer, filename = 'Imported MIDI'): MidiProject {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (data.length < 14 || data.length > MAX_BYTES) throw new Error('MIDI file must be between 14 bytes and 10 MB.');
  const r = new Reader(data);
  if (r.str(4) !== 'MThd') throw new Error('Not a Standard MIDI File.');
  const size = r.u32();
  if (size < 6 || size > 256) throw new Error('Invalid MIDI header.');
  const format = r.u16(), count = r.u16(), ppq = r.u16();
  if (format > 1 || count < 1 || count > 96 || (format === 0 && count !== 1))
    throw new Error('Only MIDI format 0 and 1 are supported.');
  if (!ppq || ppq & 0x8000) throw new Error('SMPTE timing is not supported; use beat-based MIDI.');
  r.bytes(size - 6);
  const tempos: MidiTempo[] = [], meters: MidiMeter[] = [], tracks: MidiTrack[] = [];
  for (let i = 0; i < count; i++) {
    if (r.str(4) !== 'MTrk') throw new Error('Missing MIDI track chunk.');
    tracks.push(...readTrack(r.bytes(r.u32()), i, ppq, tempos, meters));
  }
  if (tracks.reduce((n, t) => n + t.notes.length, 0) > MAX_NOTES) throw new Error('MIDI exceeds 50,000 notes.');
  tempos.sort((a, b) => a.beat - b.beat);
  meters.sort((a, b) => a.beat - b.beat);
  const firstTempo = tempos.find((t) => t.beat === 0)?.bpm ?? 120;
  const firstMeter = meters.find((m) => m.beat === 0) ?? { numerator: 4, denominator: 4 };
  return {
    title: filename.replace(/\.midi?$/i, '').slice(0, 80), ppq,
    tempo: bpmSafe(firstTempo),
    meter: { beats: firstMeter.numerator, unit: firstMeter.denominator },
    tempos: tempos.length ? tempos : [{ beat: 0, bpm: 120 }],
    meters: meters.length ? meters : [{ beat: 0, numerator: 4, denominator: 4 }],
    tracks,
  };
}
type WriteEvent = { at: number; rank: number; bytes: number[] };
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function vlq(n: number): number[] {
  if (!Number.isFinite(n) || n < 0 || n > 0x0fffffff) throw new Error('Invalid MIDI timestamp.');
  const out = [n & 127];
  while ((n = Math.floor(n / 128))) out.unshift((n & 127) | 128);
  return out;
}
const tick = (beats: number, ppq: number) => Math.round(beats * ppq);
function chunk(type: string, bytes: number[]) {
  return [...[...type].map((c) => c.charCodeAt(0)), ...be32(bytes.length), ...bytes];
}
function trackBytes(events: WriteEvent[]) {
  events.sort((a, b) => a.at - b.at || a.rank - b.rank);
  const out: number[] = [];
  let current = 0;
  for (const e of events) { out.push(...vlq(e.at - current), ...e.bytes); current = e.at; }
  out.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', out);
}
const meta = (kind: number, data: number[]) => [0xff, kind, ...vlq(data.length), ...data];
export function writeMidi(project: MidiProject): Uint8Array {
  const ppq = Math.round(clamp(project.ppq || 480, 24, 9600));
  const conductor: WriteEvent[] = [];
  for (const t of project.tempos.length ? project.tempos : [{ beat: 0, bpm: project.tempo }]) {
    const us = Math.round(60000000 / bpmSafe(t.bpm));
    conductor.push({ at: tick(t.beat, ppq), rank: 0,
      bytes: meta(0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255]) });
  }
  for (const m of project.meters.length ? project.meters : [{ beat: 0, numerator: project.meter.beats, denominator: project.meter.unit }]) {
    const exp = Math.log2(m.denominator);
    if (!Number.isInteger(exp)) throw new Error('Invalid time-signature denominator.');
    conductor.push({ at: tick(m.beat, ppq), rank: 0, bytes: meta(0x58, [m.numerator, exp, 24, 8]) });
  }
  const result = [trackBytes(conductor)];
  for (const t of project.tracks) {
    const channel = clamp(Math.round(t.channel), 0, 15);
    const events: WriteEvent[] = [
      { at: 0, rank: 0, bytes: meta(3, [...new TextEncoder().encode(t.name.slice(0, 80))]) },
      { at: 0, rank: 1, bytes: [0xc0 | channel, clamp(Math.round(t.program), 0, 127)] },
    ];
    for (const n of t.notes) {
      const start = tick(n.startBeat, ppq), end = Math.max(start + 1, tick(n.startBeat + n.beats, ppq));
      const midi = clamp(Math.round(n.midi), 0, 127);
      events.push({ at: start, rank: 2, bytes: [0x90 | channel, midi, clamp(Math.round(n.velocity), 1, 127)] });
      events.push({ at: end, rank: 0, bytes: [0x80 | channel, midi, 0] });
    }
    result.push(trackBytes(events));
  }
  const bytes = Uint8Array.from(chunk('MThd', [...be16(1), ...be16(result.length), ...be16(ppq)]).concat(...result));
  if (bytes.length > MAX_BYTES) throw new Error('MIDI export exceeds 10 MB.');
  return bytes;
}
export function downloadMidi(project: MidiProject) {
  const blob = new Blob([Uint8Array.from(writeMidi(project))], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = (project.title.replace(/[\\/:*?"<>|]/g, '_') || 'inharmonia') + '.mid';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const projectEndBeat = (p: MidiProject) =>
  Math.max(4, ...p.tracks.flatMap((t) => t.notes.map((n) => n.startBeat + n.beats)));

/** Defensive validation of MIDI JSON transported through a saved-song file. */
export function cleanMidiProject(value: unknown): MidiProject | string {
  if (!value || typeof value !== 'object') return 'invalid MIDI project';
  const p = value as Partial<MidiProject>;
  const num = (v: unknown, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (typeof p.title !== 'string' || !num(p.ppq, 24, 9600) ||
      !num(p.tempo, 20, 300) || !p.meter ||
      !num(p.meter.beats, 1, 16) || ![2, 4, 8, 16].includes(p.meter.unit))
    return 'invalid MIDI metadata';
  if (!Array.isArray(p.tracks) || p.tracks.length > 96 || !Array.isArray(p.tempos) ||
      !Array.isArray(p.meters) || p.tempos.length > 256 || p.meters.length > 256)
    return 'invalid MIDI tracks or markers';
  const tracks: MidiTrack[] = [];
  let total = 0;
  for (const [i, t] of p.tracks.entries()) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.notes) ||
        !num(t.channel, 0, 15) || !num(t.program, 0, 127))
      return 'invalid MIDI track ' + (i + 1);
    total += t.notes.length;
    if (total > 50000) return 'too many MIDI notes';
    const notes: MidiNote[] = [];
    for (const [j, n] of t.notes.entries()) {
      if (!n || !num(n.startBeat, 0, 10000) || !num(n.beats, 0.0001, 10000) ||
          !num(n.midi, 0, 127) || !num(n.velocity, 1, 127))
        return 'invalid MIDI note ' + (j + 1);
      notes.push({ id: String(n.id ?? 'n' + j).slice(0, 64), startBeat: n.startBeat,
        beats: n.beats, midi: Math.round(n.midi), velocity: Math.round(n.velocity) });
    }
    tracks.push({ id: String(t.id ?? 't' + i).slice(0, 64),
      name: String(t.name ?? 'Track ' + (i + 1)).slice(0, 80),
      channel: Math.round(t.channel), program: Math.round(t.program),
      muted: Boolean(t.muted), notes });
  }
  const tempos: MidiTempo[] = [];
  for (const t of p.tempos) {
    if (!t || !num(t.beat, 0, 10000) || !num(t.bpm, 20, 300)) return 'invalid tempo event';
    tempos.push({ beat: t.beat, bpm: t.bpm });
  }
  const meters: MidiMeter[] = [];
  for (const m of p.meters) {
    if (!m || !num(m.beat, 0, 10000) || !num(m.numerator, 1, 16) ||
        ![2, 4, 8, 16].includes(m.denominator)) return 'invalid meter event';
    meters.push({ beat: m.beat, numerator: m.numerator, denominator: m.denominator });
  }
  return { title: p.title.slice(0, 80), ppq: p.ppq!, tempo: p.tempo!,
    meter: { beats: p.meter.beats, unit: p.meter.unit }, tempos, meters, tracks };
}
