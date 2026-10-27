import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { audio } from '@/app/services';
import { MIX, mixVelocity } from '@config/mix';
import { getProgression } from '@/content/progressions';
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  parseProgressionText,
  progressionToText,
} from '@/core/content/progressionText';
import { MAJOR_KEYS, MINOR_KEYS } from '@/core/content/realize';
import type { Progression } from '@/core/content/types';
import {
  formatChord,
  prettyAccidentals,
  prettyNumeral,
  type NotationSystem,
} from '@/core/notation';
import { romanToChord, voiceChord, type Mode } from '@/core/theory';
import { useSettings } from '@/state/settings';
import { useUserProgressions } from '@/state/userProgressions';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { TextArea } from '@/ui/TextArea';
import { TextInput } from '@/ui/TextInput';
import { NotFoundPage } from '../not-found/NotFoundPage';
import songStyles from '../song/SongPage.module.css';
import styles from './progressions.module.css';

const PALETTE: Record<Mode, string[]> = {
  major: [
    'I',
    'ii',
    'iii',
    'IV',
    'V',
    'vi',
    'vii°',
    'Imaj7',
    'ii7',
    'V7',
    'IVmaj7',
    'iv',
    'bVII',
    'V7/V',
  ],
  minor: [
    'i',
    'ii°',
    'bIII',
    'iv',
    'v',
    'bVI',
    'bVII',
    'V',
    'i7',
    'iiø7',
    'iv7',
    'V7',
    'bVImaj7',
    'bII',
  ],
};

const MODES = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
] as const satisfies readonly { value: Mode; label: string }[];

interface Initial {
  name: string;
  description: string;
  mode: Mode;
  text: string;
}

function initialFrom(p: Progression | undefined, copy: boolean): Initial {
  if (!p) return { name: '', description: '', mode: 'major', text: '' };
  return {
    name: copy ? `${p.name} (my version)`.slice(0, MAX_NAME) : p.name,
    description: p.description ?? '',
    mode: p.mode,
    text: progressionToText(p.steps),
  };
}

/**
 * Write a progression as Roman numerals, hear its chords in any key, and save
 * it in this browser. Used for new progressions, copies of built-ins
 * (`?from=<id>`) and editing saved ones (`/progressions/:id/edit`).
 */
export function ProgressionBuilderPage() {
  const { progressionId } = useParams();
  const [params] = useSearchParams();
  const editing = useUserProgressions((s) => (progressionId ? s.get(progressionId) : undefined));
  const source = progressionId
    ? editing
    : (getProgression(params.get('from') ?? '') ??
      useUserProgressions.getState().get(params.get('from') ?? ''));
  if (progressionId && !editing) return <NotFoundPage />;
  return (
    <Builder
      key={progressionId ?? 'new'}
      initial={initialFrom(source, !progressionId)}
      editId={progressionId}
    />
  );
}

function Builder({ initial, editId }: { initial: Initial; editId: string | undefined }) {
  const navigate = useNavigate();
  const save = useUserProgressions((s) => s.save);
  const remove = useUserProgressions((s) => s.remove);
  const notation = useSettings((s) => s.notation);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [text, setText] = useState(initial.text);
  const [previewKey, setPreviewKey] = useState('C');
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errorsRef = useRef<HTMLDivElement | null>(null);
  const ids = { errors: useId(), name: useId(), chords: useId() };

  const keys: readonly string[] = mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  const key = keys.includes(previewKey) ? previewKey : 'C';
  const parsed = parseProgressionText(text, mode);
  // Before the first save, only flag what's typed; "add a chord" waits for Save.
  const chordIssues = submitted || text.trim() ? parsed.issues : [];
  const nameIssue = submitted && !name.trim() ? 'Give it a name.' : null;
  const issues = [...(nameIssue ? [nameIssue] : []), ...chordIssues.map((i) => i.message)];
  const badBars = new Set(chordIssues.map((i) => i.bar));

  const insert = (numeral: string) =>
    setText((t) => `${t.trimEnd()}${t.trim() ? ' ' : ''}${numeral}`);

  const play = (numeral: string) => {
    let notes;
    try {
      notes = voiceChord(romanToChord(numeral, key, mode), { style: 'close', floor: 'C3' });
    } catch {
      return;
    }
    void audio.unlock();
    const { velocity, lengthSec } = MIX.chords;
    const t0 = audio.now() + 0.01;
    for (const n of notes) audio.playAt(n.midi, t0, lengthSec, mixVelocity('lh', velocity));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (!name.trim() || parsed.issues.length) {
      requestAnimationFrame(() => errorsRef.current?.focus());
      return;
    }
    try {
      const saved = save(
        { name, mode, steps: parsed.steps, ...(description.trim() ? { description } : {}) },
        editId,
      );
      void navigate(`/progressions/${saved.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      requestAnimationFrame(() => errorsRef.current?.focus());
    }
  };

  const onDelete = () => {
    if (!editId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    void navigate('/progressions', { replace: true });
    remove(editId);
  };

  const keyLabel = (k: string) => `${prettyAccidentals(k)}${mode === 'minor' ? ' minor' : ''}`;
  const allIssues = saveError ? [...issues, saveError] : issues;

  return (
    <>
      <div className={songStyles.header}>
        <p className={songStyles.meta}>
          <Link to="/progressions">Progressions</Link>
        </p>
        <h1>{editId ? 'Edit progression' : 'New progression'}</h1>
        <p className={songStyles.meta}>Saved in this browser only.</p>
      </div>

      <form className={styles.builder} onSubmit={onSubmit} noValidate>
        <Field label="Name" id={ids.name}>
          <TextInput
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameIssue ? true : undefined}
            autoComplete="off"
          />
        </Field>

        <Segmented
          label="Mode"
          value={mode}
          options={MODES}
          onChange={(m) => setMode(m)}
          className={styles.start}
        />

        <Field
          label="Chords"
          id={ids.chords}
          hint="Roman numerals, one bar each. Split a bar with a comma: ii7,V7. Write ♭ as b and ♯ as #."
        >
          <TextArea
            className={styles.chords}
            value={text}
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setText(e.target.value)}
            aria-describedby={ids.errors}
            aria-invalid={chordIssues.length ? true : undefined}
            placeholder={mode === 'minor' ? 'i bVII bVI V7' : 'I vi ii7,V7 I'}
          />
        </Field>

        <div className={styles.palette} role="group" aria-label="Add a chord">
          {PALETTE[mode].map((n) => (
            <Button key={n} size="small" onClick={() => insert(n)} aria-label={`Add ${n}`}>
              {prettyNumeral(n)}
            </Button>
          ))}
        </div>

        <div
          id={ids.errors}
          ref={errorsRef}
          tabIndex={-1}
          className={styles.issues}
          aria-live="polite"
        >
          {allIssues.length ? (
            <ul>
              {allIssues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <section className={styles.preview} aria-label="Preview">
          <div className={styles.previewHead}>
            <h2 className={styles.previewTitle}>Preview</h2>
            <Field label="In" inline>
              <Select
                value={key}
                onChange={(e) => setPreviewKey(e.target.value)}
                data-testid="preview-key"
              >
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {keyLabel(k)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {parsed.bars.length ? (
            <ol className={styles.previewBars}>
              {parsed.bars.map((bar, i) => (
                <li
                  key={i}
                  className={styles.previewBar}
                  data-invalid={badBars.has(i + 1) || undefined}
                >
                  <span className={styles.previewNumber} aria-hidden="true">
                    {i + 1}
                  </span>
                  {bar.map((numeral, j) => (
                    <PreviewChord
                      key={j}
                      numeral={numeral}
                      tonic={key}
                      mode={mode}
                      notation={notation}
                      onPlay={play}
                    />
                  ))}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.help}>
              Type numerals above or tap them in. Tap a chord here to hear it.
            </p>
          )}
        </section>

        <Field label="Note (optional)">
          <TextInput
            value={description}
            maxLength={MAX_DESCRIPTION}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Where you heard it, or what it's for"
            autoComplete="off"
          />
        </Field>

        <div className={styles.actions}>
          <Button type="submit" variant="primary">
            Save
          </Button>
          <Link to={editId ? `/progressions/${editId}` : '/progressions'} className={styles.cancel}>
            Cancel
          </Link>
          <span className={songStyles.spacer} />
          {editId ? (
            <Button variant="ghost" onClick={onDelete} onBlur={() => setConfirmDelete(false)}>
              {confirmDelete ? 'Delete for good?' : 'Delete'}
            </Button>
          ) : null}
        </div>
      </form>
    </>
  );
}

function PreviewChord({
  numeral,
  tonic,
  mode,
  notation,
  onPlay,
}: {
  numeral: string;
  tonic: string;
  mode: Mode;
  notation: NotationSystem;
  onPlay: (numeral: string) => void;
}) {
  let symbol: string | null;
  try {
    symbol = romanToChord(numeral, tonic, mode);
  } catch {
    symbol = null;
  }
  if (!symbol)
    return (
      <span className={styles.previewChord} data-invalid>
        <span className={styles.previewSymbol}>?</span>
        <span className={styles.previewNumeral}>{numeral || '·'}</span>
      </span>
    );
  const label = formatChord(symbol, { tonic, mode }, notation === 'roman' ? 'letter' : notation);
  return (
    <button
      type="button"
      className={styles.previewChord}
      onClick={() => onPlay(numeral)}
      aria-label={`Play ${prettyNumeral(numeral)}, ${label}`}
    >
      <span className={styles.previewSymbol}>{label}</span>
      <span className={styles.previewNumeral}>{prettyNumeral(numeral)}</span>
    </button>
  );
}
