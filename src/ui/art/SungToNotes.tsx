import { ArtSvg } from './ArtSvg';
import { Pills } from './Pills';
import { pitchY, rollNotes } from './scale';
import type { SongPreview } from './songPreview';
import s from './art.module.css';

const H = 44;
const WIDTH = 190;
const SAMPLES = 120;

/**
 * A voice becoming notes: a sung line, gliding between notes with a slow
 * vibrato, over the notes Studio would write down for it. Draws the
 * preview's first full bar.
 */
export function SungToNotes({ preview }: { preview: SongPreview }) {
  const perBar = preview.meter.beats;
  const all = rollNotes(preview);
  if (!all) return null;
  // A pickup's bar is mostly rest: sing the first full bar instead.
  const bar = all[0]!.at > 0 && preview.bars.length > 1 ? 1 : 0;
  const mel = all
    .filter((n) => n.at >= bar * perBar && n.at < (bar + 1) * perBar)
    .map((n) => ({ ...n, at: n.at - bar * perBar }));
  if (!mel.length) return null;
  const X = (beat: number) => (beat / perBar) * WIDTH;
  const midis = mel.map((n) => n.midi);
  const y = pitchY(Math.min(...midis) - 1, Math.max(...midis) + 1, 10, H - 4);
  const points: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const beat = (i / SAMPLES) * perBar;
    const cur = mel.find((n) => beat >= n.at && beat < n.at + n.dur) ?? mel.at(-1)!;
    const next = mel[mel.indexOf(cur) + 1];
    // Glide into the next note over the last quarter of a beat; a gentle wobble while holding.
    const into = next ? Math.max(0, (beat - (cur.at + cur.dur - 0.25)) / 0.25) : 0;
    const eased = into * into * (3 - 2 * into);
    const m = cur.midi + (next ? (next.midi - cur.midi) * eased : 0);
    const held = Math.min(1, (beat - cur.at) / 0.4);
    const wobble = Math.sin((beat - cur.at) * 2 * Math.PI * 1.5) * 0.3 * held;
    points.push(`${X(beat).toFixed(1)} ${(y(m + wobble) - 7).toFixed(1)}`);
  }
  return (
    <ArtSvg box={[WIDTH, H]}>
      <Pills notes={mel} x={X} y={y} h={5} className={s.pill} />
      <path className={s.deepLine} d={`M${points.join('L')}`} />
    </ArtSvg>
  );
}
