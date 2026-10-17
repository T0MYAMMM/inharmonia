import { useEffect, useMemo, useRef, useState } from 'react';
import { Chord } from 'tonal';
import { audio, connectMidi, getTransport, lights, midi, notes } from '@/app/services';
import { useAudioState, useHeldNotes, useMidiState } from '@/app/hooks';
import { startVisualLoop } from '@/app/transportVisuals';
import { formatChord, formatNote, spellInKey } from '@/core/notation';
import { isWebMidiSupported } from '@/core/input';
import type { TransportState } from '@/core/audio';
import { useSettings } from '@/state/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { NoteLabel } from '@/ui/NoteLabel';
import { ProgressTrack } from '@/ui/ProgressTrack';
import { setProgress } from '@/ui/progress';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { VolumeSlider } from '@/ui/VolumeSlider';
import { KeyboardDock } from '@/ui/keyboard';
import { buildDemo, DEMO_BEATS_PER_BAR, DEMO_CHORDS, DEMO_KEY, DEMO_LENGTH } from './demo';
import page from '../page.module.css';
import styles from './KeyboardSandboxPage.module.css';

const STATUS_TEXT = {
  locked: 'Press any key to start the sound',
  starting: 'Starting audio',
  synth: 'Playing a simple synth while the piano loads',
  ready: 'Piano ready',
  error: 'Piano samples could not load, using the synth',
} as const;

const ms = (s: number) => `${Math.round(s * 1000)} ms`;

export function KeyboardSandboxPage() {
  return (
    <>
      <div className={page.hero}>
        <h1>Keyboard sandbox</h1>
        <p className={page.lede}>
          Play with the mouse, a touch screen, your computer keyboard or a MIDI keyboard. The sound
          starts on your first press.
        </p>
      </div>
      <div className={page.grid}>
        <SoundCard />
        <NowPlayingCard />
        <MidiCard />
        <TimingCard />
      </div>
      <KeyboardDock />
    </>
  );
}

function SoundCard() {
  const a = useAudioState();
  const [latency, setLatency] = useState(() => audio.latencyInfo());
  useEffect(() => {
    if (a.status === 'locked') return;
    const id = setInterval(() => setLatency(audio.latencyInfo()), 500);
    return () => clearInterval(id);
  }, [a.status]);

  return (
    <Card title="Sound">
      <div className={styles.stack}>
        <div>
          <div className={styles.statusRow} role="status" aria-live="polite">
            <span className={styles.pip} data-status={a.status} aria-hidden="true" />
            {STATUS_TEXT[a.status]}
          </div>
          {a.status === 'synth' && a.samplesTotal > 0 ? (
            <p className={styles.meta}>
              Loading piano, {a.samplesLoaded} of {a.samplesTotal}
            </p>
          ) : null}
          {a.status !== 'locked' ? (
            <p className={styles.meta} data-testid="latency">
              Output latency {ms(latency.base + latency.output)} (base {ms(latency.base)}, device{' '}
              {ms(latency.output)}), {Math.round(latency.sampleRate / 100) / 10} kHz
            </p>
          ) : null}
        </div>
        <VolumeSlider />
      </div>
    </Card>
  );
}

function NowPlayingCard() {
  const held = useHeldNotes();
  const notation = useSettings((s) => s.notation);
  const accidentalStyle = useSettings((s) => s.accidentalStyle);
  const set = useSettings((s) => s.set);
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => notes.subscribe((e) => e.type === 'on' && setLast(e.midi)), []);

  const angka = notation === 'angka';
  const fmt = (m: number) =>
    formatNote(m, DEMO_KEY, { system: notation, accidentalStyle, showOctave: !angka });
  const chord = useMemo(() => {
    if (held.length < 3) return null;
    const pcs = held.map((m) => spellInKey(m, DEMO_KEY).name.replace(/-?\d+$/, ''));
    const found = Chord.detect(pcs)[0];
    return found
      ? formatChord(found.replace(/M$/, '').replace('M7', 'maj7'), DEMO_KEY, notation)
      : null;
  }, [held, notation]);

  return (
    <Card title="What you are playing">
      <div className={styles.stack}>
        <div className={styles.now} aria-live="polite">
          <span className={styles.big} data-testid="last-note">
            {last === null ? (
              '–'
            ) : (
              <NoteLabel label={fmt(last)} angka={angka} accidentalStyle={accidentalStyle} />
            )}
          </span>
          {chord ? <span className={styles.chordName}>{chord}</span> : null}
        </div>
        <div className={styles.held} role="group" aria-label="Held notes">
          {held.map((m) => (
            <span key={m} className={styles.chip}>
              <NoteLabel label={fmt(m)} angka={angka} accidentalStyle={accidentalStyle} />
            </span>
          ))}
        </div>
        <p className={styles.meta}>
          Labels are relative to C major{angka ? ', do = C' : ''}. Change note names at the top of
          the page.
        </p>
        {angka ? (
          <Toggle
            pressed={accidentalStyle === 'suffix'}
            onChange={(p) => set({ accidentalStyle: p ? 'suffix' : 'slash' })}
          >
            Show ♯ and ♭ instead of slashes
          </Toggle>
        ) : null}
      </div>
    </Card>
  );
}

function MidiCard() {
  const m = useMidiState();
  const selected = useSettings((s) => s.midiInput);
  const set = useSettings((s) => s.set);
  useEffect(() => {
    if (m.status === 'ready' && m.selected !== selected) midi.select(selected);
  }, [m.status, m.selected, selected]);

  let body;
  if (!isWebMidiSupported() || m.status === 'unsupported') {
    body = (
      <p className={page.muted}>
        This browser does not support MIDI keyboards. Chrome, Edge and Firefox do.
      </p>
    );
  } else if (m.status === 'denied') {
    body = (
      <p className={page.muted}>
        MIDI access was blocked. Allow it in the site settings and try again.
      </p>
    );
  } else if (m.status !== 'ready') {
    body = (
      <div className={styles.stack}>
        <p className={page.muted}>
          Plug in a MIDI keyboard, then connect it here. Everything also works without one.
        </p>
        <div>
          <Button onClick={() => void connectMidi()} disabled={m.status === 'requesting'}>
            Connect MIDI keyboard
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className={styles.stack}>
        {m.devices.length === 0 ? (
          <p className={page.muted}>
            No MIDI keyboard found yet. Plug one in and it will appear here.
          </p>
        ) : (
          <label className={styles.stack} style={{ gap: 6 }}>
            <span className={page.muted}>Input</span>
            <select
              className={styles.select}
              value={m.selected}
              onChange={(e) => {
                midi.select(e.target.value);
                set({ midiInput: e.target.value });
              }}
            >
              <option value="all">All inputs</option>
              {m.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {m.sustain ? <p className={styles.meta}>Sustain pedal down</p> : null}
      </div>
    );
  }
  return <Card title="MIDI keyboard">{body}</Card>;
}

function TimingCard() {
  const transport = getTransport();
  const events = useMemo(() => buildDemo(), []);
  const notation = useSettings((s) => s.notation);
  const metronome = useSettings((s) => s.metronome);
  const countInBars = useSettings((s) => s.countInBars);
  const set = useSettings((s) => s.set);
  const [state, setState] = useState<TransportState>(transport.state);
  const [tempo, setTempo] = useState(76);
  const [swing, setSwing] = useState(0);
  const [loop, setLoop] = useState(false);
  const [rhOn, setRhOn] = useState(true);
  const [lhOn, setLhOn] = useState(true);
  const [bar, setBar] = useState(0);
  const [countIn, setCountIn] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transport.setTimeline(events, DEMO_LENGTH);
    transport.setBeatsPerBar(DEMO_BEATS_PER_BAR);
    const off = transport.subscribe((t) => setState(t.state));
    return () => {
      off();
      transport.stop();
    };
  }, [transport, events]);

  useEffect(() => transport.setTempo(tempo), [transport, tempo]);
  useEffect(() => transport.setSwing(swing / 100), [transport, swing]);
  useEffect(
    () => transport.setMetronome(metronome, countInBars),
    [transport, metronome, countInBars],
  );
  useEffect(
    () => transport.setLoop(loop ? { start: 0, end: 2 * DEMO_BEATS_PER_BAR } : null),
    [transport, loop],
  );
  useEffect(() => transport.setMuted('rh', !rhOn), [transport, rhOn]);
  useEffect(() => transport.setMuted('lh', !lhOn), [transport, lhOn]);

  useEffect(
    () =>
      startVisualLoop({
        transport,
        events,
        lights,
        now: () => audio.now(),
        latency: () => audio.outputLatency(),
        onFrame: (f) => {
          const b = Math.max(0, f.beat);
          setProgress(progressRef.current, b / DEMO_LENGTH);
          setBar(Math.min(DEMO_CHORDS.length - 1, Math.floor(b / DEMO_BEATS_PER_BAR)));
          setCountIn(f.countIn === null ? null : Math.ceil(f.countIn));
        },
      }),
    [transport, events],
  );

  const playPause = () => {
    void audio.unlock();
    if (state === 'playing') transport.pause();
    else if (state === 'paused') transport.resume({ countInBars: 0 });
    else transport.play(0);
  };

  const chordLabel = formatChord(
    DEMO_CHORDS[bar]!,
    DEMO_KEY,
    notation === 'roman' ? 'roman' : 'letter',
  );

  return (
    <Card title="Timing check" className={page.wide}>
      <div className={styles.stack}>
        <p className={page.muted}>
          A short original exercise to check the scheduler. Move the tempo slider while it plays: it
          should change smoothly, without a hiccup.
        </p>
        <div className={styles.row}>
          <Button variant="primary" onClick={playPause} data-testid="play">
            {state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Play'}
          </Button>
          <Button
            onClick={() => {
              void audio.unlock();
              transport.play(0);
            }}
          >
            Start over
          </Button>
          <Toggle pressed={metronome} onChange={(v) => set({ metronome: v })}>
            Metronome
          </Toggle>
          <Toggle pressed={countInBars > 0} onChange={(v) => set({ countInBars: v ? 1 : 0 })}>
            Count-in
          </Toggle>
          <Toggle pressed={loop} onChange={setLoop}>
            Loop bars 1 to 2
          </Toggle>
          <Toggle pressed={rhOn} onChange={setRhOn} tone="amber">
            Right hand
          </Toggle>
          <Toggle pressed={lhOn} onChange={setLhOn} tone="dusk">
            Left hand
          </Toggle>
        </div>
        <div className={styles.controlsGrid}>
          <Slider
            label="Tempo"
            value={tempo}
            min={50}
            max={110}
            onChange={setTempo}
            format={(v) => `${v} bpm`}
          />
          <Slider
            label="Swing"
            value={swing}
            min={0}
            max={100}
            step={5}
            onChange={setSwing}
            format={(v) => `${v}%`}
          />
        </div>
        <ProgressTrack ref={progressRef} label="Playback position" />
        <p className={styles.statusLine} data-testid="status-line">
          {countIn !== null ? (
            <>Count-in, {countIn}</>
          ) : (
            <>
              Bar {bar + 1} of {DEMO_CHORDS.length},{' '}
              <span className={styles.chord}>{chordLabel}</span>
            </>
          )}
        </p>
        <p className="visually-hidden" role="status" aria-live="polite">
          {state === 'playing' ? 'Playing' : state === 'paused' ? 'Paused' : 'Stopped'}
        </p>
      </div>
    </Card>
  );
}
