import { ArtSvg } from './ArtSvg';
import { RollMarks } from './SongRoll';
import type { SongPreview } from './songPreview';
import s from './art.module.css';

/** A .mid file coming in: a page with a folded corner, an arrow, and the roll it opens to. */
export function MidiFilePage({ preview }: { preview: SongPreview }) {
  return (
    <ArtSvg box={[160, 44]}>
      <path className={s.line} d="M3 3h20l9 9v29H3z M23 3v9h9" />
      <path className={s.thinLine} d="M9 22h14 M9 28h14 M9 34h9" />
      <path className={s.line} d="M40 22h12 M48 18l4 4-4 4" />
      <g transform="translate(62 0)">
        <RollMarks preview={{ ...preview, bars: preview.bars.slice(0, 1) }} width={96} />
      </g>
    </ArtSvg>
  );
}
