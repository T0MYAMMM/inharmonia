import { useState } from 'react';
import { Link } from 'react-router';
import { keyName, prettyAccidentals } from '@/core/notation';
import { formatBytes } from '@/core/songs';
import { expandForm } from '@/core/charts';
import { useMySongs } from '@/state/mySongs';
import { exportItems } from '@/state/transfer';
import { Segmented } from '@/ui/Segmented';
import { buttonClass } from '@/ui/buttonClass';
import list from '../song/SongsPage.module.css';
import { ExportDialog } from '../transfer/Export';
import { ImportControls } from '../transfer/Import';
import { PrivateBadge } from './PrivateBadge';
import styles from './mysongs.module.css';

type Filter = 'all' | 'studio' | 'charts';

/** Songs from Studio and chord charts, newest first, with export, import and filters. */
export function MySongsSection() {
  const { status, songs, charts, recordings } = useMySongs();
  const [filter, setFilter] = useState<Filter>('all');
  const both = songs.length > 0 && charts.length > 0;
  const shown = both ? filter : 'all';
  const entries = [
    ...(shown !== 'charts'
      ? songs.map((s) => ({ kind: 'song' as const, updatedAt: s.updatedAt, song: s }))
      : []),
    ...(shown !== 'studio'
      ? charts.map((c) => ({ kind: 'chart' as const, updatedAt: c.updatedAt, chart: c }))
      : []),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  const candidates = [
    ...songs.map((s) => ({
      key: s.id,
      kind: 'song' as const,
      title: s.lesson.title,
      ...(recordings[s.id] ? { recordingBytes: recordings[s.id] } : {}),
    })),
    ...charts.map((c) => ({ key: c.id, kind: 'chart' as const, title: c.chart.title })),
  ];

  return (
    <ImportControls>
      {(importButtons) => (
        <section className={styles.section} aria-labelledby="my-songs-title">
          <div className={styles.sectionHead}>
            <h2 id="my-songs-title" className={styles.sectionTitle}>
              My songs
            </h2>
            <div className={styles.actions}>
              <Link
                to="/songs/charts/new"
                className={buttonClass('primary', 'small')}
                data-testid="new-chart"
              >
                New chord chart
              </Link>
              <ExportDialog
                candidates={candidates}
                build={(keys, includeRecordings) =>
                  exportItems({
                    songs: songs.filter((s) => keys.has(s.id)),
                    charts: charts.filter((c) => keys.has(c.id)),
                    includeRecordings,
                  })
                }
              />
              {importButtons}
            </div>
          </div>
          <p className={styles.note}>
            Songs from Studio and your chord charts stay in this browser on this device. They are
            never uploaded or shared. Export them to a file to back them up or move them; drop an
            export here to bring it in.
          </p>
          {both ? (
            <Segmented
              label="Show"
              value={filter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'studio', label: 'Studio' },
                { value: 'charts', label: 'Charts' },
              ]}
              onChange={setFilter}
            />
          ) : null}
          {status === 'unavailable' ? (
            <p className={styles.note}>
              This browser is not letting Inharmonia store songs (site data may be blocked, or this
              is a private window).
            </p>
          ) : status === 'ready' && entries.length === 0 ? (
            <p className={styles.note}>
              Nothing yet. <Link to="/studio">Sing one in Studio</Link> or{' '}
              <Link to="/songs/charts/new">write a chord chart</Link>.
            </p>
          ) : (
            <ul className={list.list} data-testid="my-songs">
              {entries.map((e) =>
                e.kind === 'song' ? (
                  <li key={e.song.id}>
                    <Link to={`/songs/mine/${e.song.id}`} className={list.card}>
                      <span className={list.title}>{e.song.lesson.title}</span>
                      <span className={styles.tags}>
                        <PrivateBadge />
                        <span className={styles.badge}>Studio</span>
                      </span>
                      <span className={list.meta}>
                        {prettyAccidentals(keyName(e.song.lesson.key))}, {e.song.lesson.bars.length}{' '}
                        bars
                      </span>
                      {recordings[e.song.id] ? (
                        <span className={list.meta}>
                          Recording kept, {formatBytes(recordings[e.song.id]!)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ) : (
                  <li key={e.chart.id}>
                    <Link to={`/songs/charts/${e.chart.id}`} className={list.card}>
                      <span className={list.title}>{e.chart.chart.title}</span>
                      <span className={styles.tags}>
                        <PrivateBadge />
                        <span className={styles.badge}>Chart</span>
                      </span>
                      <span className={list.meta}>
                        {prettyAccidentals(keyName(e.chart.chart.key))},{' '}
                        {expandForm(e.chart.chart).length} bars,{' '}
                        {e.chart.chart.sections.map((s) => s.label).join(' · ')}
                      </span>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      )}
    </ImportControls>
  );
}
