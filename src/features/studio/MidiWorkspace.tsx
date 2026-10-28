import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { audio, getTransport, notes as noteInput } from '@/app/services';
import {
  commit,
  historyOf,
  midiToDraft,
  redo,
  undo,
  makeUserSong,
  updateUserSong,
  type UserSong,
} from '@/core/songs';
import { midiEvents } from '@/core/midi/adapters';
import { blankMidiProject } from '@/core/midi/adapters';
import {
  downloadMidi,
  parseMidi,
  projectEndBeat,
  type MidiNote,
  type MidiProject,
} from '@/core/midi/smf';
import { newSongId, saveSong } from '@/state/mySongs';
import { Field } from '@/ui/Field';
import { KeyboardDock } from '@/ui/keyboard';
import { keyName } from '@/ui/keyboard/layout';
import { Button } from '@/ui/Button';
import { joinTinyRetriggers } from '@/core/midi/cleanup';
import { NumberInput } from '@/ui/NumberInput';
import { RangeInput } from '@/ui/RangeInput';
import { TextInput } from '@/ui/TextInput';
import { MidiRoll } from './MidiRoll';
import { SpeakerIcon } from './icons';
import { KeyRecorder, moveNotes } from './rollEdit';
import { MIDI_ACCEPT, NOT_MIDI } from './midiFiles';
import { EditorHelp } from './EditorHeader';
import { MidiHeader, MidiSettings } from './MidiHeader';
import { ROW_RANGE, ZOOM_RANGE } from './midiSettings';
import { SeekBar } from './SeekBar';
import styles from './midiWorkspace.module.css';

type NewNote = Omit<MidiNote, 'id'>;
const next = (p: MidiProject, trackId: string, fn: (notes: MidiNote[]) => MidiNote[]) => ({
  ...p,
  tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, notes: fn(t.notes) } : t)),
});

export interface MidiWorkspaceProps {
  initial?: MidiProject;
  song?: UserSong;
}

/**
 * Full multitrack editor, separate from the monophonic singing/transcription
 * tool. The page around it gives it its heading and the way back.
 */
export function MidiWorkspace({ initial, song }: MidiWorkspaceProps) {
  const [history, setHistory] = useState(() => historyOf(initial ?? blankMidiProject()));
  const p = history.present;
  const [trackId, setTrackId] = useState(p.tracks[0]?.id ?? '');
  const [selection, setSelection] = useState<string[]>([]);
  const [step, setStep] = useState(0.25);
  const [zoom, setZoom] = useState<number>(ZOOM_RANGE.initial);
  const [row, setRow] = useState<number>(ROW_RANGE.initial);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState<UserSong | null>(song ?? null);
  const [playing, setPlaying] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [pending, setPending] = useState<NewNote[]>([]);
  const t = getTransport();
  const nextId = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Where playback starts and step input lands, in beats, while stopped. */
  const cursor = useRef(0);
  const playingRef = useRef(false);
  const pendingRef = useRef<NewNote[]>([]);
  const recorder = useRef(new KeyRecorder());
  const track = p.tracks.find((tr) => tr.id === trackId) ?? p.tracks[0];
  // Refs for the keyboard listener and the transport's end callback.
  const trackRef = useRef(track?.id ?? '');
  const stepRef = useRef(step);
  useEffect(() => {
    trackRef.current = track?.id ?? '';
    stepRef.current = step;
  });
  const picked = new Set(selection);
  const chosen =
    selection.length === 1 ? (track?.notes.find((n) => n.id === selection[0]) ?? null) : null;
  const setSelected = (id: string | null) => setSelection(id ? [id] : []);
  /** The beat heard now while playing; the cursor otherwise. */
  const beatNow = useCallback(
    () =>
      playingRef.current
        ? Math.max(0, t.beatAt(audio.now() - audio.outputLatency()))
        : cursor.current,
    [t],
  );
  const withIds = (added: NewNote[]): MidiNote[] =>
    added.map((n) => ({ ...n, id: 'new-' + nextId.current++ }));
  /** Add recorded notes to the track the recording was made on, as one undo step. */
  const addNotes = (trackKey: string, added: NewNote[], message: string) => {
    if (!added.length) return;
    const notes = withIds(added);
    setHistory((h) =>
      commit(
        h,
        next(h.present, trackKey, (ns) => [...ns, ...notes]),
      ),
    );
    setStatus(message);
  };
  /**
   * Stop playback, keeping the playhead where it was. What was recorded from the
   * keyboard is added to the track, or handed back when the caller adds it itself.
   */
  const halt = (at?: number, keepRecorded = true): NewNote[] => {
    const beat = at ?? beatNow();
    t.stop();
    playingRef.current = false;
    setPlaying(false);
    cursor.current = Math.max(0, beat);
    const recorded = [...pendingRef.current, ...recorder.current.releaseAll(beat, stepRef.current)];
    pendingRef.current = [];
    setPending([]);
    if (keepRecorded)
      addNotes(
        trackRef.current,
        recorded,
        `Recorded ${recorded.length} note${recorded.length === 1 ? '' : 's'} from the keyboard.`,
      );
    return recorded;
  };
  const update = (value: MidiProject, message: string) => {
    // An edit stops playback; notes recorded so far go in with the edit.
    const recorded = playingRef.current ? halt(undefined, false) : [];
    const edited = recorded.length
      ? next(value, trackRef.current, (ns) => [...ns, ...withIds(recorded)])
      : value;
    setHistory((h) => commit(h, edited));
    setStatus(message);
  };
  const setTrack = (fn: (t: NonNullable<typeof track>) => NonNullable<typeof track>) => {
    update(
      { ...p, tracks: p.tracks.map((tr) => (tr.id === track?.id ? fn(tr) : tr)) },
      'Track changed.',
    );
  };
  const notePatch = (id: string, patch: Partial<MidiNote>) => {
    if (!track) return;
    update(
      next(p, track.id, (notes) =>
        notes.map((n) =>
          n.id !== id
            ? n
            : {
                ...n,
                ...patch,
                midi: Math.max(0, Math.min(127, Math.round(patch.midi ?? n.midi))),
                velocity: Math.max(1, Math.min(127, Math.round(patch.velocity ?? n.velocity))),
                startBeat: Math.max(0, patch.startBeat ?? n.startBeat),
                beats: Math.max(0.01, patch.beats ?? n.beats),
              },
        ),
      ),
      'Updated MIDI note.',
    );
  };
  const setTrackNotes = (notes: MidiNote[], message: string) => {
    if (!track) return;
    update(
      next(p, track.id, () => notes),
      message,
    );
  };
  const addNote = (midi: number, startBeat: number) => {
    if (!track) return;
    const id = 'new-' + nextId.current++;
    update(
      next(p, track.id, (notes) => [
        ...notes,
        {
          id,
          midi,
          startBeat,
          beats: step || 0.25,
          velocity: 95,
        },
      ]),
      'Added note.',
    );
    setSelected(id);
  };
  const stop = () => {
    t.stop();
    playingRef.current = false;
    setPlaying(false);
    pendingRef.current = [];
    setPending([]);
    recorder.current.releaseAll(0, 0);
  };
  const seek = (beat: number) => {
    cursor.current = Math.max(0, beat);
    if (playingRef.current) t.seek(cursor.current);
  };
  const play = () => {
    if (playingRef.current) return halt();
    void audio.unlock();
    const events = midiEvents({ ...p, tracks: p.tracks.filter((tr) => !tr.muted) });
    t.stop();
    t.setTimeline(events, projectEndBeat(p));
    t.setBeatsPerBar(p.meter.beats);
    t.setLoop(null);
    t.setTempo(p.tempo);
    t.setSwing(0);
    t.setMetronome(false, 0);
    t.setMuted('rh', false);
    t.setMuted('lh', false);
    // Play from the playhead; from the start once it has reached the end.
    const end = projectEndBeat(p);
    t.play(cursor.current >= end ? 0 : cursor.current, { countInBars: 0 });
    playingRef.current = true;
    setPlaying(true);
  };
  const haltRef = useRef(halt);
  useEffect(() => {
    haltRef.current = halt;
  });
  useEffect(() => {
    const off = t.onEnd(() => haltRef.current(0));
    return () => {
      off();
      t.stop();
    };
  }, [t]);

  // With the keyboard shown, what is played on it is written into the current track:
  // step by step at the playhead while stopped, or in time while playing.
  useEffect(() => {
    if (!showKeys) return;
    const rec = recorder.current;
    return noteInput.subscribe((e) => {
      if (playingRef.current) {
        const beat = Math.max(0, t.beatAt(audio.now() - audio.outputLatency()));
        if (e.type === 'on') rec.press(e.midi, e.velocity, beat);
        else {
          const done = rec.release(e.midi, beat, stepRef.current);
          if (done) {
            pendingRef.current = [...pendingRef.current, done];
            setPending(pendingRef.current);
          }
        }
        return;
      }
      if (e.type !== 'on') return;
      const { note, cursor: after } = rec.step(
        e.midi,
        e.velocity,
        e.at,
        cursor.current,
        stepRef.current || 0.25,
      );
      cursor.current = after;
      addNotes(trackRef.current, [note], `Added ${keyName(note.midi)} from the keyboard.`);
    });
    // addNotes only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKeys, t]);
  const load = async (file?: File) => {
    if (!file) return;
    try {
      stop();
      const imported = parseMidi(await file.arrayBuffer(), file.name);
      setHistory(historyOf(imported));
      setTrackId(imported.tracks[0]?.id ?? '');
      setSelected(null);
      cursor.current = 0;
      setSaved(null);
      setStatus('Opened ' + imported.tracks.length + ' tracks. Notes stay on this device.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open this MIDI file.');
    }
  };
  const startNew = () => {
    stop();
    cursor.current = 0;
    setHistory(historyOf(blankMidiProject()));
    setTrackId('melody');
    setSelected(null);
    setSaved(null);
  };
  const exportMidi = () => {
    try {
      downloadMidi(p);
      setStatus('Exported .mid file.');
    } catch (e) {
      setStatus(String(e));
    }
  };
  const save = async () => {
    try {
      const draft = midiToDraft(p);
      const now = Date.now();
      const row = saved ? updateUserSong(saved, draft, now) : makeUserSong(newSongId(), draft, now);
      await saveSong(row);
      setSaved(row);
      setStatus('Saved full MIDI and a representative practice score to My songs.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save to My songs.');
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      setHistory((h) => redo(h));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length && track) {
      e.preventDefault();
      update(
        next(p, track.id, (notes) => notes.filter((n) => !picked.has(n.id))),
        selection.length === 1 ? 'Deleted note.' : `Deleted ${selection.length} notes.`,
      );
      setSelection([]);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && track) {
      e.preventDefault();
      setSelection(track.notes.map((n) => n.id));
    } else if (e.key === 'Escape' && selection.length) {
      setSelection([]);
    } else if (e.key.startsWith('Arrow') && selection.length && track) {
      // Nudge the selection: a grid step left or right, a semitone (Shift: an octave) up or down.
      e.preventDefault();
      const by = step || 0.25;
      const octave = e.shiftKey ? 12 : 1;
      const [db, dm] =
        e.key === 'ArrowLeft'
          ? [-by, 0]
          : e.key === 'ArrowRight'
            ? [by, 0]
            : e.key === 'ArrowUp'
              ? [0, octave]
              : [0, -octave];
      setTrackNotes(
        moveNotes(track.notes, picked, db, dm),
        `Moved ${selection.length} note${selection.length === 1 ? '' : 's'}.`,
      );
    } else if (e.key === ' ' && e.target === e.currentTarget) {
      e.preventDefault();
      play();
    }
  };
  return (
    <section
      className={styles.workspace}
      aria-label="MIDI Studio"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <EditorHelp summary="How to edit">
        <ul>
          <li>
            Click an empty spot to draw a note. Drag a note to move it, or its right edge to change
            its length.
          </li>
          <li>Drag a box, or Shift-click, to select several notes and move them together.</li>
          <li>
            With the keyboard: the arrow keys move the selection (Shift for an octave), Delete
            removes it, Ctrl+A selects the whole track, Escape clears the selection, Ctrl+Z undoes
            and Space plays.
          </li>
        </ul>
      </EditorHelp>
      <MidiHeader
        title={p.title}
        onTitle={(title) => update({ ...p, title }, 'Renamed project.')}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => setHistory((h) => undo(h))}
        onRedo={() => setHistory((h) => redo(h))}
        playing={playing}
        onPlay={play}
        showKeys={showKeys}
        onShowKeys={setShowKeys}
        onNew={startNew}
        onOpen={() => fileRef.current?.click()}
        onDropFile={(file) => void load(file)}
        onRefuse={() => setStatus(NOT_MIDI)}
        onExport={exportMidi}
        onSave={() => void save()}
      />
      <MidiSettings
        tempo={p.tempo}
        onTempo={(tempo) =>
          update(
            {
              ...p,
              tempo,
              tempos: [{ beat: 0, bpm: tempo }, ...p.tempos.filter((t) => t.beat > 0)],
            },
            'Tempo updated.',
          )
        }
        step={step}
        onStep={setStep}
        zoom={zoom}
        onZoom={setZoom}
        row={row}
        onRow={setRow}
        meter={`${p.meter.beats}/${p.meter.unit}`}
        notes={p.tracks.reduce((n, tr) => n + tr.notes.length, 0)}
      />
      {/* The File menu's Open MIDI file opens this. */}
      <input
        ref={fileRef}
        type="file"
        accept={MIDI_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="midi-file"
        onChange={(e) => {
          void load(e.target.files?.[0]);
          // Let the same file be opened again.
          e.target.value = '';
        }}
      />
      {/* Under the header, so what Save (or any change) did is in view, even on a phone. */}
      <p className={styles.statusLine}>
        <span role="status" data-testid="midi-status">
          {status}
        </span>
        {saved ? <Link to={'/songs/mine/' + saved.id}>Open saved song in My songs →</Link> : null}
      </p>
      {p.tempos.length > 1 || p.meters.length > 1 ? (
        <p className={styles.warning}>
          This MIDI contains tempo or meter changes. Export preserves these markers; Studio playback
          uses the first tempo and meter until variable-tempo playback is added.
        </p>
      ) : null}
      <div className={styles.editGrid}>
        <aside className={styles.tracks} aria-label="MIDI tracks">
          <div className={styles.trackHeader}>
            <strong>Tracks</strong>
            <Button
              size="small"
              onClick={() => {
                const id = 'track-' + Date.now();
                update(
                  {
                    ...p,
                    tracks: [
                      ...p.tracks,
                      {
                        id,
                        name: 'New piano track',
                        channel: p.tracks.length % 16,
                        program: 0,
                        muted: false,
                        notes: [],
                      },
                    ],
                  },
                  'Added track.',
                );
                setTrackId(id);
              }}
            >
              + Track
            </Button>
          </div>
          {p.tracks.map((tr) => (
            <div key={tr.id} className={styles.track} data-active={tr.id === trackId || undefined}>
              <button
                type="button"
                onClick={() => {
                  setTrackId(tr.id);
                  setSelected(null);
                }}
                className={styles.trackPick}
                data-testid="midi-track"
              >
                <strong>{tr.name}</strong>
                <span>
                  {tr.notes.length} notes · ch {tr.channel + 1}
                </span>
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-pressed={tr.muted}
                aria-label={(tr.muted ? 'Unmute ' : 'Mute ') + tr.name}
                title={tr.muted ? 'Muted: click to hear this track' : 'Click to mute this track'}
                data-testid="midi-track-mute"
                onClick={() =>
                  update(
                    {
                      ...p,
                      tracks: p.tracks.map((a) => (a.id === tr.id ? { ...a, muted: !a.muted } : a)),
                    },
                    'Track mute changed.',
                  )
                }
              >
                <SpeakerIcon muted={tr.muted} />
              </button>
            </div>
          ))}
          {track ? (
            <div className={styles.trackInspector}>
              <Field label="Track name">
                <TextInput
                  size="small"
                  aria-label="Track name"
                  value={track.name}
                  onChange={(e) => setTrack((t) => ({ ...t, name: e.target.value }))}
                />
              </Field>
              <Field label="Instrument (GM program)">
                <NumberInput
                  size="small"
                  aria-label="Track program"
                  min={0}
                  max={127}
                  value={track.program}
                  onChange={(program) => setTrack((t) => ({ ...t, program }))}
                />
              </Field>
              <Field label="Channel">
                <NumberInput
                  size="small"
                  aria-label="Track channel"
                  min={1}
                  max={16}
                  value={track.channel + 1}
                  onChange={(channel) => setTrack((t) => ({ ...t, channel: channel - 1 }))}
                />
              </Field>
              <Button
                size="small"
                variant="ghost"
                disabled={p.tracks.length === 1}
                onClick={() => {
                  update(
                    { ...p, tracks: p.tracks.filter((t) => t.id !== track.id) },
                    'Deleted track.',
                  );
                  setTrackId(p.tracks.find((t) => t.id !== track.id)?.id ?? '');
                  setSelected(null);
                }}
              >
                Delete track
              </Button>
              <Button
                size="small"
                onClick={() => {
                  if (!step) return;
                  update(
                    next(p, track.id, (notes) =>
                      notes.map((n) => ({
                        ...n,
                        startBeat: Math.round(n.startBeat / step) * step,
                        beats: Math.max(step, Math.round(n.beats / step) * step),
                      })),
                    ),
                    'Quantized current track.',
                  );
                }}
              >
                Quantize track
              </Button>
              <Button
                size="small"
                variant="ghost"
                onClick={() => {
                  const repaired = joinTinyRetriggers(track);
                  update(
                    { ...p, tracks: p.tracks.map((t) => (t.id === track.id ? repaired : t)) },
                    'Joined tiny repeat fragments; Undo restores the originals.',
                  );
                }}
                data-testid="midi-join-fragments"
              >
                Join tiny repeated notes
              </Button>
            </div>
          ) : null}
        </aside>
        <div className={styles.rollColumn}>
          <MidiRoll
            project={p}
            trackId={track?.id ?? ''}
            selection={picked}
            step={step}
            zoom={zoom}
            row={row}
            getBeat={beatNow}
            follow={playing}
            pending={pending}
            onSelection={setSelection}
            onTrackNotes={setTrackNotes}
            onAdd={addNote}
            onSeek={seek}
          />
          <SeekBar
            getBeat={beatNow}
            endBeat={projectEndBeat(p)}
            beatsPerBar={p.meter.beats}
            bpm={p.tempo}
            onSeek={seek}
          />
        </div>
      </div>
      {showKeys ? (
        <div className={styles.inlineKeys} data-testid="midi-keyboard">
          <KeyboardDock />
        </div>
      ) : null}
      {showKeys ? (
        <p className={styles.recordNote} data-testid="midi-record-note">
          {playing
            ? `Recording into ${track?.name ?? 'the track'}: notes keep the timing you play, snapped to the grid.`
            : `Notes you play go into ${track?.name ?? 'the track'} at the playhead, one grid step each; press keys together for a chord. Press Play to record in time.`}
        </p>
      ) : null}
      <div className={styles.inspector}>
        <strong>
          {chosen
            ? 'Selected note · ' + keyName(chosen.midi)
            : selection.length > 1
              ? `${selection.length} notes selected`
              : 'Note inspector'}
        </strong>
        {selection.length > 1 && track ? (
          <div className={styles.toolbar}>
            <p className={styles.dim}>
              Drag any of them, or use the arrow keys (Shift for an octave), to move them together.
            </p>
            <Button
              onClick={() => {
                update(
                  next(p, track.id, (notes) => notes.filter((n) => !picked.has(n.id))),
                  `Deleted ${selection.length} notes.`,
                );
                setSelection([]);
              }}
              data-testid="midi-delete-selected"
            >
              Delete {selection.length} notes
            </Button>
            <Button variant="ghost" onClick={() => setSelection([])}>
              Clear selection
            </Button>
          </div>
        ) : chosen ? (
          <div className={styles.toolbar}>
            <Field label="Pitch">
              <NumberInput
                size="small"
                min={0}
                max={127}
                aria-label="Note pitch"
                value={chosen.midi}
                onChange={(midi) => notePatch(chosen.id, { midi })}
              />
            </Field>
            <Field label="Start (beats)">
              <NumberInput
                size="small"
                min={0}
                step={step || 0.01}
                aria-label="Note start"
                value={chosen.startBeat}
                onChange={(startBeat) => notePatch(chosen.id, { startBeat })}
              />
            </Field>
            <Field label="Length (beats)">
              <NumberInput
                size="small"
                min={0.01}
                step={step || 0.01}
                aria-label="Note length"
                value={chosen.beats}
                onChange={(beats) => notePatch(chosen.id, { beats })}
              />
            </Field>
            <Field label={<>Velocity {chosen.velocity}</>}>
              <RangeInput
                size="small"
                className={styles.range}
                min={1}
                max={127}
                aria-label="Note velocity"
                value={chosen.velocity}
                onChange={(velocity) => notePatch(chosen.id, { velocity })}
              />
            </Field>
            <Button
              onClick={() => {
                update(
                  next(p, track!.id, (notes) => notes.filter((n) => n.id !== chosen.id)),
                  'Deleted note.',
                );
                setSelected(null);
              }}
            >
              Delete note
            </Button>
          </div>
        ) : (
          <p>
            Select a note to edit pitch, start, length and velocity. All notes remain polyphonic.
          </p>
        )}
      </div>
      <EditorHelp summary="What a .mid keeps">
        <ul>
          <li>
            Notes, tracks, velocities, programs and tempo and meter markers come in and go out.
          </li>
          <li>Controller automation, sustain pedal and pitch bends are not kept yet.</li>
          <li>Playback here uses Inharmonia's piano for every track.</li>
          <li>
            Saved to My songs, it becomes a simpler practice score, and keeps every MIDI note for
            playing and export.
          </li>
        </ul>
      </EditorHelp>
    </section>
  );
}
