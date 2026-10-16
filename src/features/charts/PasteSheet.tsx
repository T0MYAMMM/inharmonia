import { useState } from 'react';
import {
  NO_CHORD,
  parseSheet,
  sheetToChart,
  type ChordChart,
  type ParsedSheet,
} from '@/core/charts';
import { prettyChord } from '@/core/notation';
import { Button } from '@/ui/Button';
import styles from './charts.module.css';

export interface PasteSheetProps {
  beatsPerBar: number;
  /** The chart already has sections, so offer to add instead of replace. */
  hasSections: boolean;
  newId: () => string;
  onUse: (parts: Pick<ChordChart, 'sections' | 'form'>, mode: 'replace' | 'add') => void;
  onCancel: () => void;
}

/**
 * Paste a chord sheet and review what was read, line by line, next to what you
 * pasted. Lyrics are dropped on the spot; only chords and section names are kept.
 * The pasted text lives only on this screen and is never saved.
 */
export function PasteSheet(props: PasteSheetProps) {
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [two, setTwo] = useState<Set<number>>(new Set());
  const pasted = text.split(/\r?\n/);

  const use = (mode: 'replace' | 'add') => {
    if (!sheet) return;
    props.onUse(
      sheetToChart(sheet, { beatsPerBar: props.beatsPerBar, twoPerBar: two, newId: props.newId }),
      mode,
    );
  };
  const unknown = sheet?.lines.flatMap((l) => l.unknown) ?? [];

  return (
    <section className={styles.card} aria-labelledby="paste-title">
      <h2 id="paste-title" className={styles.cardTitle}>
        Paste a chord sheet
      </h2>
      <p className={styles.note}>
        Chords over lyrics, [C]inline chords, bar lines (| C | G |) and section names (Verse, Reff,
        Bait 2, Chorus x2) all work. Lyrics are removed straight away; only chords and section names
        are kept. A pasted sheet has no timing, so each chord becomes one bar until you change it.
      </p>
      {!sheet ? (
        <>
          <textarea
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
                setSheet(parseSheet(text, props.beatsPerBar));
                setTwo(new Set());
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
          <p className={styles.notice} role="status" data-testid="lyrics-notice">
            {sheet.lyricLines
              ? `Lyrics removed from ${sheet.lyricLines} line${sheet.lyricLines === 1 ? '' : 's'}. Only chords and section names are kept.`
              : 'No lyrics found. Only chords and section names are kept.'}
            {unknown.length
              ? ` ${unknown.length} chord${unknown.length === 1 ? '' : 's'} could not be read: fix ${unknown.length === 1 ? 'it' : 'them'} in the grid before saving.`
              : ''}
          </p>
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
                    {l.kind === 'lyric' ? (
                      <span className={styles.struck}>{pasted[l.n - 1]}</span>
                    ) : (
                      pasted[l.n - 1]
                    )}
                  </span>
                  <span role="cell" className={styles.detected}>
                    {describeLine(l, sheet)}
                    {l.unknown.length ? (
                      <span className={styles.unknown}> Can't read: {l.unknown.join(', ')}</span>
                    ) : null}
                    {l.dense ? (
                      <label className={styles.inlineCheck}>
                        <input
                          type="checkbox"
                          checked={two.has(l.n)}
                          onChange={(e) =>
                            setTwo((s) => {
                              const next = new Set(s);
                              if (e.target.checked) next.add(l.n);
                              else next.delete(l.n);
                              return next;
                            })
                          }
                          data-testid={`two-per-bar-${l.n}`}
                        />
                        Two chords a bar
                      </label>
                    ) : null}
                  </span>
                </div>
              ))}
          </div>
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

function describeLine(l: ParsedSheet['lines'][number], sheet: ParsedSheet): string {
  const chords = (cs: string[]) => cs.map((c) => (c === NO_CHORD ? c : prettyChord(c))).join(' ');
  switch (l.kind) {
    case 'header': {
      const s = l.section !== null ? sheet.sections[l.section] : null;
      const head = s ? `Section: ${s.label}${s.repeat > 1 ? ` ×${s.repeat}` : ''}` : 'Section';
      return l.chords.length ? `${head}, chords ${chords(l.chords)}` : head;
    }
    case 'chords':
    case 'bars':
      return `Chords: ${chords(l.chords)}`;
    case 'inline':
      return `Chords: ${chords(l.chords)}${l.lyricsRemoved ? ' (lyrics removed)' : ''}`;
    case 'lyric':
      return 'Lyrics removed';
    default:
      return '';
  }
}
