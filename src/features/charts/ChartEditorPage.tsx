import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  DEFAULT_VIEW,
  emptyChart,
  makeUserChart,
  type ChordChart,
  type UserChart,
} from '@/core/charts';
import { getChart, newChartId, saveChart } from '@/state/mySongs';
import { PageHeader } from '../PageHeader';
import { ArrivalNote } from '../sendTo/SendToMenu';
import { useArrival } from '../sendTo/useHandoff';
import { ChartEditor } from './ChartEditor';
import styles from './charts.module.css';

/** New chord chart (/songs/charts/new) or edit one (/songs/charts/:id/edit). */
export function ChartEditorPage() {
  const { chartId } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{ id: string; chart: UserChart | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  // A new chart started from a progression: its chords to build on, and the way back.
  const arrival = useArrival('chart');
  const sent = !chartId && arrival.status === 'ok' ? arrival.handoff : null;

  useEffect(() => {
    if (!chartId) return;
    let live = true;
    getChart(chartId)
      .then((c) => live && setLoaded({ id: chartId, chart: c ?? null }))
      .catch(() => live && setLoaded({ id: chartId, chart: null }));
    return () => {
      live = false;
    };
  }, [chartId]);

  const existing = chartId && loaded?.id === chartId ? loaded.chart : null;
  if (chartId && (!loaded || loaded.id !== chartId)) return <p className={styles.note}>Loading…</p>;
  if (chartId && !existing)
    return <PageHeader crumb={{ to: '/songs', label: 'Songs' }} title="Chart not found" />;

  const save = async (chart: ChordChart) => {
    setSaving(true);
    setProblem('');
    try {
      const now = Date.now();
      const record = existing
        ? { ...existing, updatedAt: now, chart }
        : makeUserChart(newChartId(), chart, DEFAULT_VIEW, now);
      await saveChart(record);
      navigate(`/songs/charts/${record.id}`, { state: { saved: 'Saved.' } });
    } catch {
      setProblem('Could not save: this browser is not letting Inharmonia store data.');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        crumb={
          existing
            ? { to: `/songs/charts/${existing.id}`, label: existing.chart.title }
            : (sent?.from ?? { to: '/songs', label: 'Songs' })
        }
        title={existing ? `Edit ${existing.chart.title}` : 'New chord chart'}
        lede={
          <>
            <p>Type the chords bar by bar, or paste a chord sheet. Lyrics are never kept.</p>
            {sent ? <ArrivalNote text={sent.said} testId="sent-said" /> : null}
            {!chartId && arrival.problem ? (
              <p className={styles.notice} role="status" data-testid="sent-problem">
                {arrival.problem}
              </p>
            ) : null}
          </>
        }
      />
      <ChartEditor
        key={sent ? arrival.id : 'blank'}
        initial={existing?.chart ?? sent?.chart ?? emptyChart('')}
        saving={saving}
        onSave={(c) => void save(c)}
      />
      <div role="alert">{problem ? <p className={styles.issues}>{problem}</p> : null}</div>
    </>
  );
}
