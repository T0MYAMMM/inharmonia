import { useId, useState } from 'react';
import {
  defaultLineBars,
  formatBars,
  LIMITS,
  lineBars,
  NO_CHORD,
  parseSheet,
  sheetToChart,
  type ChartBar,
  type ChordChart,
  type LineBars,
  type ParsedSheet,
  type PastedLine,
} from '@/core/charts';
import { prettyChord } from '@/core/notation';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Segmented, type SegmentedOption } from '@/ui/Segmented';
import { TextArea } from '@/ui/TextArea';
import styles from './charts.module.css';

export interface PasteSheetProps {
  beatsPerBar: number;
  /** The chart already has sections, so offer to add instead of replace. */
  hasSections: boolean;
  newId: () => string;
  onUse: (parts: Pick<ChordChart, 'sections' | 'form'>, mode: 'replace' | 'add') => void;
  onCancel: () => void;
}

const ESTIMATED: SegmentedOption<LineBars>[] = [
  { value: 'estimated', label: 'Estimated' },
  { value: 'one', label: '1 a bar' },
  { value: 'two', label: '2 a bar' },
];
const AS_TYPED = ESTIMATED.slice(1);

/** Half and Double change the speed every estimated line is read at. */
const SCALES = [
  { value: 'half', label: 'Half' },
  { value: 'as', label: 'As estimated' },
  { value: 'double', label: 'Double' },
] as const satisfies readonly SegmentedOption<string>[];
type Scale = (typeof SCALES)[number]['value'];
const SCALE: Record<Scale, number> = { half: 0.5, as: 1, double: 2 };

/**
 * Paste a chord sheet and review what was read, line by line, next to what you
 * pasted, as the bars it will make. Where words sit under the chords, each
 * chord's length is estimated from them; any line can be read one or two
 * chords a bar instead. Lyrics are dropped once read, and only chords and
 * section names are kept, unless you tick Keep lyrics: then the words go on
 * the bars where they start, on this device. The box starts unticked every
 * time. The pasted text lives only on this screen and is never saved.
 */
export function PasteSheet(props: PasteSheetProps) {
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  /** Lines read another way than their default, by line number. */
  const [chosen, setChosen] = useState<Map<number, LineBars>>(new Map());
  const [keep, setKeep] = useState(false);
  const [scale, setScale] = useState<Scale>('as');
  const noteId = useId();
  const pasted = text.split(/\r?\n/);
  const read = (keepLyrics: boolean, at: Scale = scale) =>
    setSheet(parseSheet(text, props.beatsPerBar, { keepLyrics, scale: SCALE[at] }));
  const howOf = (l: PastedLine) => chosen.get(l.n) ?? defaultLineBars(l);
  const estimated = sheet?.lines.some((l) => l.estimate && howOf(l) === 'estimated') ?? false;

  const use = (mode: 'replace' | 'add') => {
    if (!sheet) return;
    props.onUse(
      sheetToChart(sheet, { beatsPerBar: props.beatsPerBar, lineBars: chosen, newId: props.newId }),
      mode,
    );
  };
  const unknown = sheet?.lines.flatMap((l) => l.unknown) ?? [];
  // What reading the sheet removed or kept, and what it couldn't read.
  const notice = sheet
    ? [
        keep ? keptNotice(sheet) : removedNotice(sheet),
        unknown.length
          ? `${unknown.length} chord${unknown.length === 1 ? '' : 's'} could not be read: fix ${unknown.length === 1 ? 'it' : 'them'} in the grid before saving.`
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <section className={styles.card} aria-labelledby="paste-title">
      <h2 id="paste-title" className={styles.cardTitle}>
        Paste a chord sheet
      </h2>
      <p className={styles.note}>
        Chords over lyrics, [C]inline chords, bar lines (| C | G |) and section names (Verse, Reff,
        Bait 2, Chorus x2) all work. Where lyrics sit under the chords, each chord's length is
        estimated from them; other chords get a bar each. Lyrics are removed once read unless you
        keep them.
      </p>
      <div className={styles.keepLyrics}>
        <Checkbox
          checked={keep}
          onChange={(v) => {
            setKeep(v);
            if (sheet) read(v);
          }}
          aria-describedby={noteId}
          data-testid="keep-lyrics"
        >
          Keep lyrics
        </Checkbox>
        <span id={noteId} className={styles.checkNote}>
          With the bars they sit under, on this device only.
        </span>
      </div>
      {/* Always here, so what was removed is said as soon as the sheet is read. */}
      <p className={styles.notice} role="status" data-testid="lyrics-notice">
        {notice}
      </p>
      {!sheet ? (
        <>
          <TextArea
            mono
            className={styles.paste}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Chord sheet"
            placeholder={'[Verse]\nC        G\nlyric line here\nAm       F\nla la la'}
            data-testid="paste-text"
          />
          <div className={styles.row}>
            <Button
              variant="primary"
              disabled={!text.trim()}
              onClick={() => {
                read(keep, 'as');
                setScale('as');
                setChosen(new Map());
              }}
              data-testid="paste-read"
            >
              Read the sheet
            </Button>
            <Button variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <div
            className={styles.review}
            role="table"
            aria-label="What was read"
            data-testid="paste-review"
          >
            <div role="row" className={styles.reviewHead}>
              <span role="columnheader">You pasted</span>
              <span role="columnheader">Read as</span>
            </div>
            {sheet.lines
              .filter((l) => l.kind !== 'blank')
              .map((l) => (
                <div role="row" key={l.n} className={styles.reviewRow} data-kind={l.kind}>
                  <span role="cell" className={styles.pasted}>
                    {l.kind === 'lyric' && l.under === undefined ? (
                      <span className={styles.struck}>{pasted[l.n - 1]}</span>
                    ) : (
                      pasted[l.n - 1]
                    )}
                  </span>
                  <span role="cell" className={styles.detected} data-testid={`read-${l.n}`}>
                    {describeLine(l, sheet, keep, howOf, props.beatsPerBar)}
                    {l.unknown.length ? (
                      <span className={styles.unknown}> Can't read: {l.unknown.join(', ')}</span>
                    ) : null}
                    {l.estimate || (l.dense && !l.bars) ? (
                      <span className={styles.lineBars}>
                        <Segmented
                          label={`Bar lengths, line ${l.n}`}
                          value={howOf(l)}
                          options={l.estimate ? ESTIMATED : AS_TYPED}
                          onChange={(v) => setChosen((m) => new Map(m).set(l.n, v))}
                        />
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
          </div>
          {estimated ? (
            <div className={styles.estimate}>
              <p className={styles.note} data-testid="estimate-note">
                Bar lengths are estimated from the lyrics. Check them by ear. If every line is twice
                too long or too short, try Half or Double.
              </p>
              <Segmented
                label="Estimated lengths"
                value={scale}
                options={SCALES}
                onChange={(v) => {
                  setScale(v);
                  read(keep, v);
                }}
              />
            </div>
          ) : null}
          <div className={styles.row}>
            {props.hasSections ? (
              <>
                <Button variant="primary" onClick={() => use('add')} data-testid="paste-add">
                  Add to the chart
                </Button>
                <Button onClick={() => use('replace')} data-testid="paste-replace">
                  Replace the chart
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => use('replace')} data-testid="paste-use">
                Use these chords
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSheet(null)}>
              Back to the text
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

const lines = (n: number) => `${n} line${n === 1 ? '' : 's'}`;

/** Lyrics not kept: exactly what it has always said. */
function removedNotice(sheet: ParsedSheet): string {
  return sheet.lyricLines
    ? `Lyrics removed from ${lines(sheet.lyricLines)}. Only chords and section names are kept.`
    : 'No lyrics found. Only chords and section names are kept.';
}

/** Lyrics kept: how many lines, where they are kept, and what was left out. */
function keptNotice(sheet: ParsedSheet): string {
  const { keptLines: kept, lyricLines: left } = sheet;
  return [
    kept ? `Lyrics kept from ${lines(kept)}, on this device only.` : '',
    left ? `${lines(left)} left out: lyrics are kept only right under their chords.` : '',
    !kept && !left ? 'No lyrics found.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const CUT = ` (cut to ${LIMITS.lyric} characters a bar)`;

const pretty = (c: string) => (c === NO_CHORD ? c : prettyChord(c));

/** Bars as chart syntax, all on one line, chords as they are shown. */
function barText(bars: readonly ChartBar[], beatsPerBar: number): string {
  const shown = bars.map((b) => ({
    chords: b.chords.map((c) => ({ ...c, symbol: pretty(c.symbol) })),
  }));
  return formatBars(shown, beatsPerBar, Infinity);
}

function describeLine(
  l: PastedLine,
  sheet: ParsedSheet,
  keep: boolean,
  howOf: (l: PastedLine) => LineBars,
  beatsPerBar: number,
): string {
  const barsOf = (line: PastedLine) => lineBars(line, howOf(line), beatsPerBar);
  /** The bars a line makes, and whether their lengths are a rough guess. */
  const bars = (line: PastedLine) => {
    const rough = line.estimate?.confidence === 'rough' && howOf(line) === 'estimated';
    return `${barText(barsOf(line), beatsPerBar)}${rough ? ' (rough)' : ''}`;
  };
  /** A line's kept words, bar by bar, as they will sit in the chart. */
  const kept = (line: PastedLine) =>
    barsOf(line)
      .map((b) => b.lyric ?? '–')
      .join(' | ');
  switch (l.kind) {
    case 'header': {
      const s = l.section !== null ? sheet.sections[l.section] : null;
      const head = s ? `Section: ${s.label}${s.repeat > 1 ? ` ×${s.repeat}` : ''}` : 'Section';
      return l.chords.length ? `${head}, bars ${bars(l)}` : head;
    }
    case 'chords':
    case 'bars':
      return `Bars: ${bars(l)}`;
    case 'inline':
      if (l.words) return `Bars: ${bars(l)}. Lyrics kept: ${kept(l)}${l.cut ? CUT : ''}`;
      return `Bars: ${bars(l)}${l.lyricsRemoved ? ' (lyrics removed)' : ''}`;
    case 'lyric': {
      const above = sheet.lines.find((x) => x.n === l.under);
      if (above) return `Lyrics kept: ${kept(above)}${above.cut ? CUT : ''}`;
      return keep ? 'Left out: no chords right above it' : 'Lyrics removed';
    }
    default:
      return '';
  }
}
