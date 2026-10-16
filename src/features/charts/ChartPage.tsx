import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PATTERNS } from '@/content/patterns';
import { userChartLesson, type UserChart } from '@/core/charts';
import { compileLesson } from '@/core/content/compile';
import { keyName, prettyAccidentals } from '@/core/notation';
import { deleteChart, getChart, saveChart, useMySongs } from '@/state/mySongs';
import { exportItems } from '@/state/transfer';
import { Button } from '@/ui/Button';
import { buttonClass } from '@/ui/buttonClass';
import { Toggle } from '@/ui/Toggle';
import { PrivateBadge } from '../mysongs/PrivateBadge';
import mine from '../mysongs/mysongs.module.css';
import { LessonPlayer } from '../song/LessonPlayer';
import songStyles from '../song/SongPage.module.css';
import { ExportButtons } from '../transfer/Export';
import styles from './charts.module.css';

/** A chord chart of yours in the player, with its notes, edit, export and delete. */
export function ChartPage() {
  const { chartId = '' } = useParams();
  const { charts, status } = useMySongs();
  const listed = charts.find((c) => c.id === chartId);
  const [loaded, setLoaded] = useState<{ id: string; chart: UserChart | null } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const navigate = useNavigate();

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

  if (record === undefined && status !== 'unavailable')
    return <p className={styles.note}>Loading…</p>;
  if (!record || !compiled)
    return (
      <div className={songStyles.header}>
        <h1>Chart not found</h1>
        <p className={styles.note}>
          It may have been deleted, or it was made in another browser. Use export and import to move
          charts.
        </p>
        <p>
          <Link to="/songs">Back to Songs</Link>
        </p>
      </div>
    );

  const { chart, view } = record;
  return (
    <>
      <div className={songStyles.header}>
        <p className={songStyles.meta}>
          <Link to="/songs">Songs</Link>
        </p>
        <h1>{chart.title}</h1>
        <span className={styles.tags}>
          <PrivateBadge />
          <span className={mine.badge}>Chart</span>
        </span>
        <p className={songStyles.meta}>
          {prettyAccidentals(keyName(chart.key))}, {chart.meter.beats}/{chart.meter.unit},{' '}
          {compiled.bars.length} bars, {chart.tempo} bpm
        </p>
        {chart.notes ? (
          <p className={styles.userNotes} data-testid="chart-notes-view">
            {chart.notes}
          </p>
        ) : null}
        <div className={mine.actions}>
          <Link
            to={`/songs/charts/${record.id}/edit`}
            className={buttonClass('secondary', 'small')}
          >
            Edit
          </Link>
          <Toggle
            pressed={view.showFunction}
            onChange={(v) => void saveChart({ ...record, view: { ...view, showFunction: v } })}
          >
            Show function
          </Toggle>
          <ExportButtons build={() => exportItems({ charts: [record] })} />
        </div>
      </div>
      <LessonPlayer
        key={record.id}
        compiled={compiled}
        variant="progression"
        showNumerals={view.showFunction}
      />
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
