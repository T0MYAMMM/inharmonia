import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { PATTERNS } from '@/content/patterns';
import { PROGRESSIONS } from '@/content/progressions';
import {
  CHART_STYLES,
  chartProgressions,
  chordsToProgression,
  playChord,
  shiftLabel,
  userChartLesson,
  viewKey,
  type SectionHarmony,
  type UserChart,
} from '@/core/charts';
import { MAX_NAME } from '@/core/content/progressionText';
import { compileLesson } from '@/core/content/compile';
import { sentTitle } from '@/core/handoff';
import { compiledToMidi } from '@/core/midi/adapters';
import { keyName, prettyAccidentals } from '@/core/notation';
import { deleteChart, getChart, saveChart, useMySongs } from '@/state/mySongs';
import { exportItems } from '@/state/transfer';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import { Toggle } from '@/ui/Toggle';
import { PrivateBadge } from '../mysongs/PrivateBadge';
import mine from '../mysongs/mysongs.module.css';
import { PageHeader } from '../PageHeader';
import { LessonPlayer } from '../song/LessonPlayer';
import { ExportMenu } from '../transfer/Export';
import { LEVEL_WORDS, NOTES, nothingToSend, sentToStudio } from '../sendTo/names';
import { ArrivalNote, SendToMenu, type SendToItem } from '../sendTo/SendToMenu';
import { useHere, useSend } from '../sendTo/useHandoff';
import { LearnPanel } from './LearnPanel';
import { PANEL_ID, progressionLink, songProgressions } from './progressionWords';
import { ProgressionsPanel } from './ProgressionsPanel';
import styles from './charts.module.css';

/** A chord chart of yours in the player, with its notes, edit, export and delete. */
export function ChartPage() {
  const { chartId = '' } = useParams();
  const { charts, status } = useMySongs();
  const listed = charts.find((c) => c.id === chartId);
  const [loaded, setLoaded] = useState<{ id: string; chart: UserChart | null } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const navigate = useNavigate();
  const send = useSend();
  const here = useHere();
  // Said once on arriving from a save ("Saved."), not again on a reload.
  const location = useLocation();
  const [saved] = useState(() => (location.state as { saved?: string } | null)?.saved ?? null);
  useEffect(() => {
    if (saved) void navigate(here, { replace: true, state: null });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listed) return;
    let live = true;
    getChart(chartId)
      .then((c) => live && setLoaded({ id: chartId, chart: c ?? null }))
      .catch(() => live && setLoaded({ id: chartId, chart: null }));
    return () => {
      live = false;
    };
  }, [chartId, listed]);

  const record = listed ?? (loaded?.id === chartId ? loaded.chart : undefined);
  const compiled = useMemo(
    () => (record ? compileLesson(userChartLesson(record), PATTERNS) : null),
    [record],
  );
  const sections = useMemo(
    () => (record ? chartProgressions(record.chart, record.view, PROGRESSIONS) : []),
    [record],
  );

  if (record === undefined && status !== 'unavailable')
    return <p className={styles.note}>Loading…</p>;
  if (!record || !compiled)
    return (
      <PageHeader
        crumb={{ to: '/songs', label: 'Songs' }}
        title="Chart not found"
        lede="It may have been deleted, or it was made in another browser. Use export and import to move charts."
      />
    );

  const { chart, view } = record;
  const playKey = viewKey(chart, view);
  const key = prettyAccidentals(keyName(playKey));
  const found = songProgressions(sections);
  const named = found.slice(0, found.length > 4 ? 3 : 4);
  const foundWords = found.length
    ? `Progressions in it: ${found.map((m) => m.name).join(', ')}.`
    : 'No library progressions in it.';
  const style = CHART_STYLES.find((x) => x.id === view.style)?.name ?? view.style;
  const from = { to: here, label: chart.title };
  const toStudio = () =>
    send({
      kind: 'studio',
      from,
      project: { ...compiledToMidi(compiled), title: sentTitle(chart.title, `chart, ${key}`) },
      said: sentToStudio(
        `your chart ${chart.title}`,
        `${key}, ${LEVEL_WORDS[view.simplify]}, the ${style} accompaniment`,
        'the chart',
      ),
    });
  /** A section's own Send to: its chords as written, in the key they play in. */
  const sectionTools = (s: SectionHarmony) => {
    const written = { ...view, simplify: 'original' as const };
    const bars = (chart.sections.find((x) => x.id === s.id)?.bars ?? []).map((b) => ({
      chords: b.chords.map((c) => ({ ...c, symbol: playChord(c.symbol, chart, written).symbol })),
    }));
    const draft = chordsToProgression(bars, chart.meter.beats, playKey);
    const name = `${chart.title}: ${s.label}`;
    const items: SendToItem[] = [
      draft.text
        ? {
            room: 'progressions',
            note: NOTES.progressionsFromSection(s.label),
            onSelect: () =>
              send({
                kind: 'progression',
                from,
                prefill: {
                  name: name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name,
                  mode: playKey.mode,
                  text: draft.text,
                  previewKey: playKey.tonic,
                },
                said: `From the ${s.label} of ${chart.title}, read in ${key}.`,
                notes: draft.notes,
              }),
          }
        : nothingToSend('progressions'),
    ];
    return <SendToMenu about={`the ${s.label}`} items={items} testId="section-send-to" />;
  };
  return (
    <>
      <PageHeader
        crumb={{ to: '/songs', label: 'Songs' }}
        title={chart.title}
        tags={
          <>
            <PrivateBadge />
            <span className={mine.badge}>Chart</span>
          </>
        }
        lede={
          <>
            <p>
              {prettyAccidentals(keyName(viewKey(chart, view)))}
              {view.transpose
                ? ` (written in ${prettyAccidentals(keyName(chart.key))}, ${shiftLabel(view.transpose)})`
                : ''}
              , {chart.meter.beats}/{chart.meter.unit}, {compiled.bars.length} bars, {chart.tempo}{' '}
              bpm
            </p>
            {chart.notes ? (
              <p className={styles.userNotes} data-testid="chart-notes-view">
                {chart.notes}
              </p>
            ) : null}
            <p className={styles.found} data-testid="chart-found">
              {named.length ? (
                <>
                  Progressions in it:{' '}
                  {named.map((m, i) => (
                    <Fragment key={m.id}>
                      {i ? ', ' : ''}
                      <Link to={progressionLink(m, playKey)}>{m.name}</Link>
                    </Fragment>
                  ))}
                  {found.length > named.length ? ` and ${found.length - named.length} more` : ''}
                  .{' '}
                </>
              ) : (
                'No library progressions in it. '
              )}
              <a href={`#${PANEL_ID}`}>
                By section<span aria-hidden="true"> ↓</span>
              </a>
            </p>
            {saved ? (
              <ArrivalNote
                text={saved}
                spoken={`${saved} ${foundWords}`}
                className={styles.saved}
                testId="chart-saved"
              />
            ) : null}
          </>
        }
        actions={
          <>
            <Link
              to={`/songs/charts/${record.id}/edit`}
              className={buttonClass('secondary', 'small')}
            >
              Edit
            </Link>
            <Toggle
              size="small"
              pressed={view.showFunction}
              onChange={(v) => void saveChart({ ...record, view: { ...view, showFunction: v } })}
            >
              Show function
            </Toggle>
            <SendToMenu items={[{ room: 'studio', note: NOTES.studio, onSelect: toStudio }]} />
            <ExportMenu build={() => exportItems({ charts: [record] })} />
          </>
        }
      />
      <LessonPlayer
        key={record.id}
        compiled={compiled}
        variant="progression"
        showNumerals={view.showFunction}
        voicingHints
        belowControls={
          // The key and how simple: worth setting, not needed before Play.
          <LearnPanel
            chart={chart}
            view={view}
            onChange={(v) => void saveChart({ ...record, view: v })}
          />
        }
      />
      <ProgressionsPanel sections={sections} viewKey={playKey} sectionTools={sectionTools} />
      <div className={mine.danger}>
        {confirm ? (
          <>
            <span>Delete “{chart.title}” for good? This cannot be undone.</span>
            <Button
              size="small"
              onClick={() => void deleteChart(record.id).then(() => navigate('/songs'))}
              data-testid="confirm-delete"
            >
              Delete
            </Button>
            <Button size="small" variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button
            size="small"
            variant="ghost"
            onClick={() => setConfirm(true)}
            data-testid="delete-chart"
          >
            Delete this chart
          </Button>
        )}
      </div>
    </>
  );
}
