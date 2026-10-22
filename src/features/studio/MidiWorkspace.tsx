import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { audio, getTransport } from '@/app/services';
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
import { keyName } from '@/ui/keyboard/layout';
import { Button } from '@/ui/Button';
import { joinTinyRetriggers } from '@/core/midi/cleanup';
import { MidiRoll } from './MidiRoll';
import styles from './midiWorkspace.module.css';

const STEPS = [1, 0.5, 0.25, 0.125, 0];
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
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState(0.25);
  const [zoom, setZoom] = useState(42);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState<UserSong | null>(song ?? null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const t = getTransport();
  const playhead = useRef<SVGLineElement>(null);
  const nextId = useRef(1);
  const track = p.tracks.find((tr) => tr.id === trackId) ?? p.tracks[0];
  const chosen = track?.notes.find((n) => n.id === selected) ?? null;
  const update = (value: MidiProject, message: string) => {
    setHistory((h) => commit(h, value));
    setStatus(message);
    if (playing) {
      t.stop();
      setPlaying(false);
    }
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
    setPlaying(false);
  };
  const play = () => {
    if (playing) return stop();
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
    t.play(0, { countInBars: 0 });
    setPlaying(true);
  };
  useEffect(() => {
    const off = t.onEnd(() => setPlaying(false));
    return () => {
      off();
      t.stop();
    };
  }, [t]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      if (playing) {
        const beat = Math.max(0, t.beatAt(audio.now() - audio.outputLatency()));
        setPosition(Math.floor(beat * 4) / 4);
        if (playhead.current) {
          const x = 52 + beat * zoom;
          playhead.current.setAttribute('x1', String(x));
          playhead.current.setAttribute('x2', String(x));
        }
      } else if (playhead.current) {
        playhead.current.setAttribute('x1', '-10');
        playhead.current.setAttribute('x2', '-10');
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [t, playing, zoom]);
  const load = async (file?: File) => {
    if (!file) return;
    try {
      stop();
      const imported = parseMidi(await file.arrayBuffer(), file.name);
      setHistory(historyOf(imported));
      setTrackId(imported.tracks[0]?.id ?? '');
      setSelected(null);
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
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && track) {
      e.preventDefault();
      update(
        next(p, track.id, (notes) => notes.filter((n) => n.id !== selected)),
        'Deleted note.',
      );
      setSelected(null);
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
          Open a .mid file or create one from scratch. Drag notes to move, drag the right edge to
          resize, and click empty space to draw. MIDI is edited locally.
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
          {playing ? 'Stop' : 'Play'}
        </Button>
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
        <label>
          Zoom{' '}
          <input
            type="range"
            min={20}
            max={100}
            step={10}
            value={zoom}
            aria-label="MIDI zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <span className={styles.dim}>
          Bar {Math.floor(position / p.meter.beats) + 1} · {p.meter.beats}/{p.meter.unit} ·{' '}
          {p.tracks.reduce((n, tr) => n + tr.notes.length, 0)} notes
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
                aria-pressed={tr.muted}
                aria-label={'Mute ' + tr.name}
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
                {tr.muted ? 'Unmute' : 'Mute'}
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
        <MidiRoll
          project={p}
          trackId={track?.id ?? ''}
          selected={selected}
          step={step}
          zoom={zoom}
          playheadRef={playhead}
          onSelect={setSelected}
          onNote={notePatch}
          onAdd={addNote}
        />
      </div>
      <div className={styles.inspector}>
        <strong>{chosen ? 'Selected note · ' + keyName(chosen.midi) : 'Note inspector'}</strong>
        {chosen ? (
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
