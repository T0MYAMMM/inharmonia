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
import { KeyboardDock } from '@/ui/keyboard';
import { keyName } from '@/ui/keyboard/layout';
import { Button } from '@/ui/Button';
import { joinTinyRetriggers } from '@/core/midi/cleanup';
import { MidiRoll } from './MidiRoll';
import { PianoIcon, SpeakerIcon } from './icons';
import { KeyRecorder, moveNotes } from './rollEdit';
import { SeekBar } from './SeekBar';
import styles from './midiWorkspace.module.css';

const STEPS = [1, 0.5, 0.25, 0.125, 0];
/** Horizontal zoom, pixels per beat, and vertical zoom, pixels per pitch row. */
const ZOOM_RANGE = { min: 20, max: 240, initial: 56 } as const;
const ROW_RANGE = { min: 12, max: 44, initial: 22 } as const;
type NewNote = Omit<MidiNote, 'id'>;
const next = (p: MidiProject, trackId: string, fn: (notes: MidiNote[]) => MidiNote[]) => ({
  ...p,
  tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, notes: fn(t.notes) } : t)),
});

export interface MidiWorkspaceProps {
  initial?: MidiProject;
  song?: UserSong;
  onBack?: () => void;
}

/** Full multitrack editor, separate from the monophonic singing/transcription tool. */
export function MidiWorkspace({ initial, song, onBack }: MidiWorkspaceProps) {
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
  const save = async () => {
    try {
      const draft = midiToDraft(p);
      const now = Date.now();
      const row = saved ? updateUserSong(saved, draft, now) : makeUserSong(newSongId(), draft, now);
      await saveSong(row);
      setSaved(row);
      setStatus('Saved full MIDI and a representative practice score to My Songs.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save to My Songs.');
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
      <div className={styles.heading}>
        <h2>MIDI piano-roll editor</h2>
        <p>
          Open a .mid file or create one from scratch. Click empty space to draw, drag notes to move
          them and their right edge to resize them. Drag a box (or Shift-click) to select several
          notes and move them together, with the mouse or the arrow keys. MIDI is edited locally.
        </p>
      </div>
      <div className={styles.toolbar}>
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            ← Back to Studio
          </Button>
        ) : null}
        <label className={styles.filePicker}>
          Open .mid / .midi
          <input
            type="file"
            accept=".mid,.midi,audio/midi,audio/x-midi"
            data-testid="midi-file"
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <Button
          onClick={() => {
            stop();
            cursor.current = 0;
            setHistory(historyOf(blankMidiProject()));
            setTrackId('melody');
            setSelected(null);
            setSaved(null);
          }}
        >
          New
        </Button>
        <Button onClick={() => setHistory((h) => undo(h))} disabled={!history.past.length}>
          Undo
        </Button>
        <Button onClick={() => setHistory((h) => redo(h))} disabled={!history.future.length}>
          Redo
        </Button>
        <Button variant="primary" onClick={play} data-testid="midi-play">
          {playing ? 'Pause' : 'Play'}
        </Button>
        <button
          type="button"
          className={styles.pianoToggle}
          aria-pressed={showKeys}
          onClick={() => setShowKeys((v) => !v)}
          title="Play notes into the current track on an on-screen, computer or MIDI keyboard"
          data-testid="midi-keyboard-toggle"
        >
          <PianoIcon />
          {showKeys ? 'Hide keyboard' : 'Keyboard'}
        </button>
        <Button
          onClick={() => {
            try {
              downloadMidi(p);
              setStatus('Exported .mid file.');
            } catch (e) {
              setStatus(String(e));
            }
          }}
          data-testid="midi-export"
        >
          Export .mid
        </Button>
        <Button onClick={() => void save()} data-testid="midi-save-song">
          Save to My Songs
        </Button>
      </div>
      <div className={styles.toolbar}>
        <label>
          Title{' '}
          <input
            aria-label="MIDI title"
            value={p.title}
            maxLength={80}
            onChange={(e) => update({ ...p, title: e.target.value }, 'Renamed project.')}
          />
        </label>
        <label>
          Tempo (BPM){' '}
          <input
            type="number"
            min={20}
            max={300}
            aria-label="MIDI tempo"
            value={p.tempo}
            onChange={(e) => {
              const tempo = Math.max(20, Math.min(300, Number(e.target.value) || 120));
              update(
                {
                  ...p,
                  tempo,
                  tempos: [{ beat: 0, bpm: tempo }, ...p.tempos.filter((t) => t.beat > 0)],
                },
                'Tempo updated.',
              );
            }}
          />
        </label>
        <label>
          Snap{' '}
          <select
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            aria-label="Note snap"
          >
            {STEPS.map((value) => (
              <option value={value} key={value}>
                {value ? String(value) + ' beat' : 'Free'}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.zoomGroup}>
          <label>
            Zoom ↔{' '}
            <input
              type="range"
              min={ZOOM_RANGE.min}
              max={ZOOM_RANGE.max}
              step={4}
              value={zoom}
              aria-label="MIDI zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <label>
            Zoom ↕{' '}
            <input
              type="range"
              min={ROW_RANGE.min}
              max={ROW_RANGE.max}
              step={2}
              value={row}
              aria-label="MIDI row height"
              onChange={(e) => setRow(Number(e.target.value))}
            />
          </label>
        </div>
        <span className={styles.dim}>
          {p.meter.beats}/{p.meter.unit} · {p.tracks.reduce((n, tr) => n + tr.notes.length, 0)}{' '}
          notes
          {selection.length > 1 ? ` · ${selection.length} selected` : ''}
        </span>
      </div>
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
              <label>
                Track name{' '}
                <input
                  aria-label="Track name"
                  value={track.name}
                  onChange={(e) => setTrack((t) => ({ ...t, name: e.target.value }))}
                />
              </label>
              <label>
                Instrument (GM program){' '}
                <input
                  type="number"
                  aria-label="Track program"
                  min={0}
                  max={127}
                  value={track.program}
                  onChange={(e) =>
                    setTrack((t) => ({
                      ...t,
                      program: Math.max(0, Math.min(127, +e.target.value || 0)),
                    }))
                  }
                />
              </label>
              <label>
                Channel{' '}
                <input
                  type="number"
                  aria-label="Track channel"
                  min={1}
                  max={16}
                  value={track.channel + 1}
                  onChange={(e) =>
                    setTrack((t) => ({
                      ...t,
                      channel: Math.max(0, Math.min(15, (+e.target.value || 1) - 1)),
                    }))
                  }
                />
              </label>
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
            <label>
              Pitch{' '}
              <input
                type="number"
                min={0}
                max={127}
                aria-label="Note pitch"
                value={chosen.midi}
                onChange={(e) => notePatch(chosen.id, { midi: +e.target.value })}
              />
            </label>
            <label>
              Start (beats){' '}
              <input
                type="number"
                min={0}
                step={step || 0.01}
                aria-label="Note start"
                value={chosen.startBeat}
                onChange={(e) => notePatch(chosen.id, { startBeat: +e.target.value })}
              />
            </label>
            <label>
              Length (beats){' '}
              <input
                type="number"
                min={0.01}
                step={step || 0.01}
                aria-label="Note length"
                value={chosen.beats}
                onChange={(e) => notePatch(chosen.id, { beats: +e.target.value })}
              />
            </label>
            <label>
              Velocity {chosen.velocity}
              <input
                type="range"
                min={1}
                max={127}
                aria-label="Note velocity"
                value={chosen.velocity}
                onChange={(e) => notePatch(chosen.id, { velocity: +e.target.value })}
              />
            </label>
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
      <p role="status" data-testid="midi-status" className={styles.dim}>
        {status}
      </p>
      {saved ? (
        <p className={styles.dim}>
          <Link to={'/songs/mine/' + saved.id}>Open saved song in My Songs →</Link>
        </p>
      ) : null}
      <p className={styles.warning}>
        Import/export preserves MIDI notes, tracks, velocities, programs and tempo/meter markers.
        Audio preview uses InHarmonia's piano sound; MIDI controller automation, sustain-pedal data
        and pitch bends are not currently preserved. Saving as a practice Song produces a simplified
        score, but preserves the full MIDI notes for playback and export.
      </p>
    </section>
  );
}
