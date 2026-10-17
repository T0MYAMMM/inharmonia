import { Link, useSearchParams } from 'react-router';
import { SONGS } from '@/content/lessons';
import { SONG_LEVELS, type Lesson, type SongLevel } from '@/core/content/types';
import { keyName, prettyAccidentals } from '@/core/notation';
import { loadProgress } from '@/state/progress';
import { Segmented } from '@/ui/Segmented';
import { MySongsSection } from '../mysongs/MySongsSection';
import page from '../page.module.css';
import { composerOf, creditLine, LEVEL_NAMES } from './credit';
import styles from './SongsPage.module.css';

type LevelFilter = 'all' | SongLevel;

/** Songs grouped by piece: a library piece's versions share one card. */
function groups(songs: readonly Lesson[]): Lesson[][] {
  const out = new Map<string, Lesson[]>();
  for (const s of songs) {
    const key = s.piece ?? s.id;
    out.set(key, [...(out.get(key) ?? []), s]);
  }
  return [...out.values()];
}

const GROUPS = groups(SONGS);
const COMPOSERS = [...new Set(GROUPS.map((g) => composerOf(g[0]!)))].sort((a, b) =>
  a === 'Original pieces' ? -1 : b === 'Original pieces' ? 1 : a.localeCompare(b),
);

export function SongsPage() {
  const progress = loadProgress();
  const [params, setParams] = useSearchParams();
  const level = (SONG_LEVELS as readonly string[]).includes(params.get('level') ?? '')
    ? (params.get('level') as SongLevel)
    : 'all';
  const composer = COMPOSERS.includes(params.get('composer') ?? '') ? params.get('composer')! : '';
  const query = params.get('q') ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const q = query.trim().toLowerCase();
  const shown = GROUPS.filter((g) => {
    const first = g[0]!;
    if (level !== 'all' && !g.some((s) => s.level === level)) return false;
    if (composer && composerOf(first) !== composer) return false;
    if (q && !`${first.title} ${composerOf(first)}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <div className={page.hero}>
        <h1>Songs</h1>
        <p className={page.lede}>
          Listen through a piece, then practice it note by note at your own pace. Library pieces
          come in Easy, Medium and Advanced versions.
        </p>
        <p>
          <Link to="/studio">Make your own in Studio</Link>: sing or hum a melody and it is written
          down for you.
        </p>
      </div>
      <div className={styles.filters}>
        <Segmented<LevelFilter>
          label="Level"
          value={level}
          options={[
            { value: 'all', label: 'All' },
            ...SONG_LEVELS.map((l) => ({ value: l, label: LEVEL_NAMES[l] })),
          ]}
          onChange={(v) => set('level', v === 'all' ? '' : v)}
        />
        <label className={styles.field}>
          Composer
          <select
            className={styles.select}
            value={composer}
            onChange={(e) => set('composer', e.target.value)}
            data-testid="songs-composer"
          >
            <option value="">Everyone</option>
            {COMPOSERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Search
          <input
            className={styles.select}
            type="search"
            value={query}
            placeholder="Title or composer"
            onChange={(e) => set('q', e.target.value)}
            data-testid="songs-search"
          />
        </label>
      </div>
      {shown.length === 0 ? (
        <p className={styles.meta} data-testid="songs-empty">
          No songs match. <Link to="/songs">Show them all</Link>
        </p>
      ) : null}
      <ul className={styles.list} data-testid="songs">
        {shown.map((g) => {
          const first = g[0]!;
          const main = g.find((s) => s.level === (level === 'all' ? 'easy' : level)) ?? first;
          // The written key, unless a level is picked: then the key that version plays in.
          const keyed = (level === 'all' ? g.find((s) => s.level === 'advanced') : main) ?? first;
          return (
            <li key={first.piece ?? first.id} data-testid={`piece-${first.piece ?? first.id}`}>
              <div className={styles.card}>
                <Link to={`/songs/${main.id}`} className={styles.title}>
                  {first.title}
                </Link>
                <span className={styles.meta}>{creditLine(first.source)}</span>
                <span className={styles.meta}>
                  {prettyAccidentals(keyName(keyed.key))}, {first.meter.beats}/{first.meter.unit}
                </span>
                {first.summary ? <span className={styles.summary}>{first.summary}</span> : null}
                {first.level ? (
                  <span
                    className={styles.levels}
                    role="group"
                    aria-label={`${first.title} versions`}
                  >
                    {g.map((s) => {
                      const p = progress.exercises[s.id];
                      return (
                        <Link
                          key={s.id}
                          to={`/songs/${s.id}`}
                          className={styles.level}
                          data-current={s.level === level || undefined}
                          data-testid={`level-${s.id}`}
                        >
                          {LEVEL_NAMES[s.level!]}
                          <span className={styles.levelMeta}>
                            {s.bars.length} bars
                            {p ? `, best ${Math.round(p.bestAccuracy * 100)}%` : ''}
                          </span>
                        </Link>
                      );
                    })}
                  </span>
                ) : (
                  <span className={styles.meta}>
                    {first.bars.length} bars
                    {progress.exercises[first.id]
                      ? `, best accuracy ${Math.round(progress.exercises[first.id]!.bestAccuracy * 100)}%`
                      : ''}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <MySongsSection />
    </>
  );
}
