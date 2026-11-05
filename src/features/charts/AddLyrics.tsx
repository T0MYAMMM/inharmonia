import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  attachLyrics,
  hasLyrics,
  LIMITS,
  NO_CHORD,
  type AttachReport,
  type ChordChart,
} from '@/core/charts';
import { prettyChord } from '@/core/notation';
import { Button } from '@/ui/Button';
import { TextArea } from '@/ui/TextArea';
import styles from './charts.module.css';

export interface AddLyricsProps {
  chart: ChordChart;
  newId: () => string;
  /** The chart's sections and form with the words on them (and copies where verses differ). */
  onApply: (parts: Pick<ChordChart, 'sections' | 'form'>) => void;
  onCancel: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "and"-joined: "Intro", "Intro and Solo", "Intro, Solo and Outro". */
const listed = (xs: readonly (string | number)[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** "sheet in the same key", "sheet is 2 semitones up", "sheet is 1 semitone down". */
function sheetKeyWords(shift: number): string {
  if (shift === 0) return 'sheet in the same key';
  return `sheet is ${plural(Math.abs(shift), 'semitone')} ${shift > 0 ? 'up' : 'down'}`;
}

/** The summary line: "Lyrics for 38 of 42 bars · sheet is 2 semitones up". */
function lyricsSummary(report: AttachReport): string {
  if (report.noLyrics) return 'No lyrics found under the chords: nothing would change.';
  return `Lyrics for ${report.barsWithWords} of ${plural(report.bars, 'bar')} · ${sheetKeyWords(report.shift)}`;
}

/** What else to know before Apply, a sentence each. */
function reportNotes(report: AttachReport, labelOf: (id: string) => string): string[] {
  if (report.noLyrics) return [];
  const copies = report.sections.filter((s) => s.copyOf);
  return [
    report.events && report.matched / report.events < 0.5
      ? `Only ${report.matched} of ${plural(report.events, 'chord change')} matched. Is it the same song, in the same version?`
      : '',
    ...copies.map((s) => `${s.label} is ${labelOf(s.copyOf!)} again, with its own words.`),
    report.copiesSkipped
      ? `The chart has ${LIMITS.sections} sections, the most it can hold, so ${plural(report.copiesSkipped, 'set')} of other words ${report.copiesSkipped === 1 ? 'is' : 'are'} left out.`
      : '',
    ...report.repeatsDiffer.map(
      (l) => `${l} repeats with other words; the words of its first time are used.`,
    ),
    report.leftOut.length
      ? `Words on ${report.leftOut.length === 1 ? 'line' : 'lines'} ${listed(report.leftOut)} found no chord and are left out.`
      : '',
    report.noWords.length ? `No words for ${listed(report.noWords)}.` : '',
    report.cut ? `Some words were cut to ${LIMITS.lyric} characters a bar.` : '',
  ].filter(Boolean);
}

const pretty = (c: string) => (c === NO_CHORD ? c : prettyChord(c));

/**
 * Put the lyrics of a pasted chord sheet onto this chart's bars, without
 * touching its chords: the sheet's chords are matched to the chart's, in any
 * key, and each line's words go on the bars where its chords fall. A preview
 * shows every section's bars with the words they would get first. The pasted
 * text lives only in this panel and is never saved.
 */
export function AddLyrics({ chart, newId, onApply, onCancel }: AddLyricsProps) {
  const [text, setText] = useState('');
  /** The text as read; the preview follows the chart if it changes meanwhile. */
  const [read, setRead] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // Keep them hands focus back to Apply.
  const [keptBack, setKeptBack] = useState(false);
  const noteId = useId();
  const askId = useId();
  const textId = useId();
  const previewRef = useRef<HTMLHeadingElement>(null);
  const result = useMemo(
    () => (read === null ? null : attachLyrics(chart, read, { newId })),
    [chart, read, newId],
  );
  const reading = read !== null;
  useEffect(() => {
    if (reading) previewRef.current?.focus();
    else document.getElementById(textId)?.focus();
  }, [reading, textId]);

  const labelOf = (id: string) => chart.sections.find((s) => s.id === id)?.label ?? id;
  const apply = () => {
    if (!result) return;
    onApply({ sections: result.sections, form: result.form });
  };
  const shown = result?.report.sections.filter((s) => s.events > 0 || s.wordBars > 0) ?? [];

  return (
    <section className={styles.card} aria-labelledby="lyrics-title" data-testid="add-lyrics">
      <h2 id="lyrics-title" className={styles.cardTitle}>
        Add lyrics
      </h2>
      <p className={styles.note}>
        Paste a chord sheet with lyrics, chords over the words. Its chords are matched to this
        chart&rsquo;s, which stay as they are, and each line&rsquo;s words go on the bars where its
        chords fall.
      </p>
      <p id={noteId} className={styles.checkNote}>
        Kept with the bars they sit under, on this device only. The pasted text is not saved.
      </p>
      {/* Always here, so the summary is said as soon as the sheet is read. */}
      <p className={styles.notice} role="status" data-testid="lyrics-summary">
        {result ? lyricsSummary(result.report) : ''}
      </p>
      {!result ? (
        <>
          <TextArea
            id={textId}
            mono
            className={styles.paste}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Chord sheet with lyrics"
            aria-describedby={noteId}
            placeholder={'[Verse]\nC        G\nlyric line here\nAm       F\nla la la'}
            data-testid="lyrics-text"
          />
          <div className={styles.row}>
            <Button
              variant="primary"
              disabled={!text.trim()}
              onClick={() => setRead(text)}
              data-testid="lyrics-read"
            >
              Read the sheet
            </Button>
            <Button variant="ghost" onClick={onCancel} data-testid="lyrics-cancel">
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3 ref={previewRef} tabIndex={-1} className={styles.previewTitle}>
            What each bar would get
          </h3>
          {reportNotes(result.report, labelOf).map((n) => (
            <p key={n} className={styles.note}>
              {n}
            </p>
          ))}
          <div className={styles.preview} data-testid="lyrics-preview">
            {shown.map((info) => {
              const s = result.sections.find((x) => x.id === info.id)!;
              const unmatched = new Set(info.unmatchedBars);
              return (
                <section
                  key={s.id}
                  className={styles.previewSection}
                  aria-label={`${s.label} with lyrics`}
                  data-testid="lyrics-section"
                >
                  <div className={styles.previewHead}>
                    <h4 className={styles.previewLabel}>{s.label}</h4>
                    <span className={styles.note}>
                      {info.copyOf ? `A copy of ${labelOf(info.copyOf)}. ` : ''}
                      {info.events
                        ? `${info.matched} of ${plural(info.events, 'chord')} matched`
                        : 'Not played in the form'}
                    </span>
                  </div>
                  <ol className={styles.bars} aria-label={`Bars of ${s.label}`}>
                    {s.bars.map((b, bi) => (
                      <li key={bi}>
                        <div
                          className={styles.previewBar}
                          data-unmatched={unmatched.has(bi) || undefined}
                        >
                          <span className={styles.barNo}>{bi + 1}</span>
                          <span className={styles.barChords}>
                            {b.chords.map((c, ci) => (
                              <span key={ci} style={{ flexGrow: c.beats }}>
                                {pretty(c.symbol)}
                              </span>
                            ))}
                          </span>
                          <span className={styles.previewLyric} data-none={!b.lyric || undefined}>
                            {b.lyric ?? 'No words'}
                          </span>
                          {unmatched.has(bi) ? (
                            <span className={styles.unmatched}>Not matched</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
          {asking ? (
            <div className={styles.ask} role="group" aria-labelledby={askId}>
              <p id={askId} className={styles.notice}>
                This chart has lyrics. Replace them with these?
              </p>
              <div className={styles.row}>
                <Button variant="primary" onClick={apply} autoFocus data-testid="lyrics-replace">
                  Replace them
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAsking(false);
                    setKeptBack(true);
                  }}
                >
                  Keep them
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.row}>
              <Button
                variant="primary"
                disabled={result.report.noLyrics}
                onClick={() => (hasLyrics(chart) ? setAsking(true) : apply())}
                autoFocus={keptBack}
                data-testid="lyrics-apply"
              >
                Apply
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRead(null);
                  setKeptBack(false);
                }}
                data-testid="lyrics-back"
              >
                Back to the text
              </Button>
              <Button variant="ghost" onClick={onCancel} data-testid="lyrics-cancel">
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
