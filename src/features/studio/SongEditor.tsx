import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { audio, getTransport } from '@/app/services';
import { PATTERNS } from '@/content/patterns';
import { compileLesson } from '@/core/content/compile';
import type { Lesson } from '@/core/content/types';
import {
  addNote,
  commit,
  deleteNote,
  formatBytes,
  historyOf,
  makeUserSong,
  redo,
  setChord,
  toLesson,
  transposeMelody,
  undo,
  updateUserSong,
  type History,
  type SongDraft,
  type UserRecording,
  type UserSong,
} from '@/core/songs';
import {
  candidatesFor,
  harmonize,
  HARMONY_STYLES,
  type HarmonyStyleId,
} from '@/core/transcription';
import { newSongId, saveSong } from '@/state/mySongs';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Toggle } from '@/ui/Toggle';
import { EditorPlayback, type EditorTakeAudio, type HearSource } from './EditorPlayback';
import { EditorRoll } from './EditorRoll';
import { BEAT_PX, describeNote, type ChordOption, type EditorTrace } from './editorModel';
import { patternIdsFor } from './patternChoices';
import styles from './editor.module.css';

const STEPS = [
  { value: '1', label: '1/4' },
  { value: '0.5', label: '1/8' },
  { value: '0.25', label: '1/16' },
] as const;

const HEAR = [
  { value: 'take', label: 'A: your take' },
  { value: 'notes', label: 'B: the notes' },
] as const satisfies readonly { value: HearSource; label: string }[];

export interface SongEditorProps {
  initial: SongDraft;
  /** The saved song being edited, or null for a new one. */
  song: UserSong | null;
  /** The take, when its audio is at hand (a new take, or a kept recording). */
  take: { audio: EditorTakeAudio; trace: EditorTrace } | null;
  /** A recording is already kept for this song. */
  hasKeptRecording: boolean;
  /** Builds the recording to keep from the new take (absent when there is none). */
  makeRecording?: (songId: string) => UserRecording;
  /** Size the recording would take, for the keep checkbox. */
  recordingBytes: number;
  onSaved: (song: UserSong) => void;
  /** Open the current draft in the song player. */
  onTry?: (lesson: Lesson) => void;
}

/** The Studio editor: fix notes and chords, compare with your take, and save to My songs. */
export function SongEditor(props: SongEditorProps) {
  const notation = useSettings((s) => s.notation);
  const [history, setHistory] = useState<History<SongDraft>>(() => historyOf(props.initial));
  const [savedDraft, setSavedDraft] = useState<SongDraft | null>(props.song ? props.initial : null);
  const [song, setSong] = useState<UserSong | null>(props.song);
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState(0.5);
  const [showTrace, setShowTrace] = useState(true);
  const [keep, setKeep] = useState(props.hasKeptRecording);
  /** A recording is stored for the song right now. */
  const [kept, setKept] = useState(props.hasKeptRecording);
  const [said, setSaid] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [restyle, setRestyle] = useState<HarmonyStyleId>('diatonic');
  const [playback] = useState(() => new EditorPlayback({ transport: getTransport(), audio }));
  useSyncExternalStore(
    playback.subscribe,
    () => `${playback.playing}:${playback.source}:${playback.chords}`,
  );
  const playheadRef = useRef<SVGLineElement>(null);
  const draft = history.present;
  const dirty = draft !== savedDraft;
  const canKeep = !!props.makeRecording || kept;

  useEffect(() => () => playback.stop(), [playback]);

  // Move the playhead while playing.
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const b = playback.beat();
      const line = playheadRef.current;
      if (line) {
        const px = b === null ? -10 : b * BEAT_PX;
        line.setAttribute('x1', String(px));
        line.setAttribute('x2', String(px));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playback]);

  // Unsaved changes: ask before the page closes.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const change = (next: SongDraft, words: string) => {
    setHistory((h) => commit(h, next));
    setSaid(words);
    if (saving === 'saved') setSaving('idle');
  };

  const chordOptions = (i: number): { suggested: ChordOption[]; others: ChordOption[] } => {
    const c = draft.chords[i]!;
    const seen = new Set<string>([c.symbol]);
    const suggested: ChordOption[] = [
      { symbol: c.symbol, ...(c.numeral ? { numeral: c.numeral } : {}) },
    ];
    for (const seg of draft.alternatives ?? []) {
      if (seg.startBeat < c.startBeat - 1e-6 || seg.startBeat >= c.startBeat + c.beats - 1e-6)
        continue;
      for (const cand of seg.candidates) {
        if (seen.has(cand.symbol)) continue;
        seen.add(cand.symbol);
        suggested.push({ symbol: cand.symbol, ...(cand.numeral ? { numeral: cand.numeral } : {}) });
      }
    }
    const others: ChordOption[] = [];
    for (const style of HARMONY_STYLES)
      for (const cand of candidatesFor(style, draft.key)) {
        if (seen.has(cand.symbol)) continue;
        seen.add(cand.symbol);
        others.push({ symbol: cand.symbol, numeral: cand.numeral });
      }
    return { suggested, others };
  };

  const play = () => {
    if (playback.playing) return playback.stop();
    const compiled = compileLesson(toLesson(draft, 'editing'), PATTERNS);
    playback.play(compiled, props.take?.audio ?? null);
  };

  const add = () => {
    const sel = draft.notes.find((n) => n.id === selected);
    const at = sel ? sel.startBeat + sel.beats : 0;
    const { draft: next, id } = addNote(draft, {
      startBeat: at,
      beats: Math.max(step, 0.5),
      midi: sel?.midi ?? draft.notes[0]?.midi ?? 67,
    });
    const n = next.notes.find((m) => m.id === id)!;
    change(next, `Added ${describeNote(n, next, notation)}`);
    setSelected(id);
  };

  const remove = () => {
    const n = draft.notes.find((m) => m.id === selected);
    if (!n) return;
    const i = draft.notes.indexOf(n);
    change(deleteNote(draft, n.id), `Deleted ${describeNote(n, draft, notation)}`);
    setSelected((draft.notes[i + 1] ?? draft.notes[i - 1])?.id ?? null);
  };

  const suggestAgain = () => {
    const h = harmonize({
      notes: draft.notes,
      timing: { meter: draft.meter, bars: draft.bars },
      key: draft.key,
    }).find((x) => x.style === restyle);
    if (!h) return;
    change(
      {
        ...draft,
        chords: h.chords.map((c) => ({
          startBeat: c.startBeat,
          beats: c.beats,
          symbol: c.symbol,
          numeral: c.numeral,
        })),
        alternatives: h.segments,
      },
      `Chords: ${h.name}`,
    );
  };

  const save = async () => {
    setSaving('saving');
    try {
      const now = Date.now();
      const next = song ? updateUserSong(song, draft, now) : makeUserSong(newSongId(), draft, now);
      // Keep: store the new take (or leave a kept one alone). Not keeping: remove any kept one.
      const recording = keep ? (props.makeRecording?.(next.id) ?? undefined) : null;
      await saveSong(next, recording);
      setKept(keep);
      setSong(next);
      setSavedDraft(draft);
      setSaving('saved');
      setSaid(`Saved ${next.lesson.title} to My songs.`);
      props.onSaved(next);
    } catch {
      setSaving('failed');
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
    setSaid(e.shiftKey ? 'Redone' : 'Undone');
  };

  return (
    <div className={styles.editor} onKeyDown={onKeyDown}>
      <Field label="Title" className={styles.title}>
        <TextInput
          value={draft.title}
          maxLength={80}
          onChange={(e) =>
            setHistory((h) => ({ ...h, present: { ...h.present, title: e.target.value } }))
          }
          data-testid="song-title"
        />
      </Field>

      <div className={styles.toolbar} role="toolbar" aria-label="Edit">
        <Button size="small" onClick={() => setHistory(undo)} disabled={!history.past.length}>
          Undo
        </Button>
        <Button size="small" onClick={() => setHistory(redo)} disabled={!history.future.length}>
          Redo
        </Button>
        <Segmented
          label="Grid"
          value={String(step) as '1' | '0.5' | '0.25'}
          options={STEPS}
          onChange={(v) => setStep(Number(v))}
        />
        <Button size="small" onClick={add} data-testid="add-note">
          Add note
        </Button>
        <Button size="small" onClick={remove} disabled={!selected} data-testid="delete-note">
          Delete note
        </Button>
        <Button
          size="small"
          onClick={() => change(transposeMelody(draft, -12), 'Melody down an octave')}
        >
          Octave down
        </Button>
        <Button
          size="small"
          onClick={() => change(transposeMelody(draft, 12), 'Melody up an octave')}
        >
          Octave up
        </Button>
      </div>

      <div className={styles.toolbar}>
        <Button variant="primary" onClick={play} data-testid="editor-play">
          {playback.playing ? 'Stop' : 'Play'}
        </Button>
        {props.take ? (
          <Segmented
            label="Hear"
            value={playback.source}
            options={HEAR}
            onChange={(v) => playback.setSource(v)}
          />
        ) : null}
        <Toggle pressed={playback.chords} onChange={(v) => playback.setChords(v)}>
          Play chords
        </Toggle>
        {props.take ? (
          <Toggle pressed={showTrace} onChange={setShowTrace}>
            Pitch line
          </Toggle>
        ) : null}
      </div>

      <EditorRoll
        draft={draft}
        selectedId={selected}
        step={step}
        notation={notation}
        trace={props.take?.trace ?? null}
        showTrace={showTrace}
        playheadRef={playheadRef}
        chordOptions={chordOptions}
        onSelect={setSelected}
        onChange={change}
        onChordChange={(i, o) =>
          change(
            setChord(draft, i, o.symbol, o.numeral),
            `Chord in bar ${Math.floor(draft.chords[i]!.startBeat / draft.meter.beats) + 1}: ${o.symbol}`,
          )
        }
      />
      <p className={styles.help}>
        Drag a note to move it, or its right edge to change its length; tap an empty spot to add
        one. With the keyboard: arrows move the selected note, Shift with the arrows changes its
        length or octave, [ and ] pick the previous or next note, Delete removes it, and Ctrl+Z
        undoes.
      </p>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="editor-status">
        {said}
      </p>

      <div className={styles.toolbar}>
        <Field label="Style" inline>
          <Select
            size="small"
            value={restyle}
            onChange={(e) => setRestyle(e.target.value as HarmonyStyleId)}
          >
            {HARMONY_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button size="small" onClick={suggestAgain} data-testid="suggest-again">
          Suggest chords again
        </Button>
        <Field label="Left hand" inline>
          <Select
            size="small"
            value={draft.lhPattern}
            onChange={(e) => change({ ...draft, lhPattern: e.target.value }, 'Left hand changed')}
          >
            {patternIdsFor(draft.meter.beats).map((id) => (
              <option key={id} value={id}>
                {PATTERNS[id]!.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <section className={styles.save} aria-labelledby="save-title">
        <h2 id="save-title" className={styles.saveTitle}>
          {song ? 'Save changes' : 'Save to My songs'}
        </h2>
        <p className={styles.small}>
          Your songs stay in this browser on this device. They are never uploaded or shared. Use
          export on the Songs page to back them up.
        </p>
        {canKeep ? (
          <Checkbox checked={keep} onChange={setKeep} data-testid="keep-recording">
            Keep the recording of my take ({formatBytes(props.recordingBytes)}), to compare and see
            my pitch line later
          </Checkbox>
        ) : null}
        {kept && !keep ? (
          <p className={styles.small}>Saving now deletes the kept recording.</p>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={saving === 'saving' || (!!song && !dirty && keep === kept)}
            data-testid="save-song"
          >
            {saving === 'saving' ? 'Saving…' : song ? 'Save changes' : 'Save to My songs'}
          </Button>
          {props.onTry ? (
            <Button onClick={() => props.onTry!(toLesson(draft, `try-${song?.id ?? 'draft'}`))}>
              Try it in the player
            </Button>
          ) : null}
          <span role="status" className={styles.status} data-testid="save-status">
            {saving === 'saved' && song ? (
              <>
                Saved. <Link to={`/songs/mine/${song.id}`}>Open it in My songs</Link>
              </>
            ) : saving === 'failed' ? (
              'Could not save: this browser is not letting Inharmonia store data. Check that site data is allowed.'
            ) : dirty && song ? (
              'Unsaved changes'
            ) : null}
          </span>
        </div>
      </section>
    </div>
  );
}
