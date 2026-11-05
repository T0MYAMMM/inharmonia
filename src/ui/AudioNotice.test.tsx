import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioSnapshot } from '@/core/audio';
import type { MidiSnapshot } from '@/core/input';
import { AudioNotice } from './AudioNotice';
import { audioNotice, midiNotice, NOTICE_MS } from './noticeWords';

const fake = vi.hoisted(() => {
  const listeners = new Set<(s: MidiSnapshot) => void>();
  const midi = {
    state: { status: 'idle', devices: [], selected: 'all', sustain: false } as MidiSnapshot,
    subscribe(l: (s: MidiSnapshot) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** The MIDI store's own event: a new snapshot. */
    emit(s: MidiSnapshot) {
      midi.state = s;
      for (const l of listeners) l(s);
    },
  };
  return {
    audio: {
      status: 'locked',
      samplesLoaded: 0,
      samplesTotal: 0,
      instrument: 'none',
    } as AudioSnapshot,
    online: true,
    midi,
    touchOnly: false,
  };
});
vi.mock('@/app/hooks', () => ({
  useAudioState: () => fake.audio,
  useOnline: () => fake.online,
  useTouchOnly: () => fake.touchOnly,
}));
vi.mock('@/app/services', () => ({ midi: fake.midi }));

const ready = (devices: { id: string; name: string }[]): MidiSnapshot => ({
  status: 'ready',
  devices,
  selected: 'all',
  sustain: false,
});

beforeEach(() => {
  fake.audio = { status: 'locked', samplesLoaded: 0, samplesTotal: 0, instrument: 'none' };
  fake.online = true;
  fake.midi.state = { status: 'idle', devices: [], selected: 'all', sustain: false };
  fake.touchOnly = false;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('audioNotice', () => {
  it('says what the sound is doing, and nothing before the first gesture', () => {
    expect(audioNotice('locked', true)).toBe('');
    expect(audioNotice('starting', true)).toBe('Starting the sound.');
    expect(audioNotice('synth', true)).toBe('Loading the piano, a simple synth plays for now.');
    expect(audioNotice('ready', true)).toBe('Piano ready.');
    expect(audioNotice('error', true)).toBe("The piano couldn't load, so a simple synth plays.");
    expect(audioNotice('error', false)).toBe(
      "Offline and the piano isn't saved yet, so a simple synth plays.",
    );
  });
});

describe('midiNotice', () => {
  it('names a keyboard that came, says what to do when one went, and ignores the first listing', () => {
    const k = { id: 'k1', name: 'Keystation 49' };
    expect(midiNotice({ ...ready([]), status: 'requesting' }, ready([k]), false)).toBeNull();
    expect(midiNotice(ready([]), ready([k]), false)).toBe(
      'MIDI keyboard connected: Keystation 49.',
    );
    expect(midiNotice(ready([k]), ready([]), false)).toBe(
      'MIDI keyboard disconnected. Use the computer keys, or plug it back in.',
    );
    expect(midiNotice(ready([k]), ready([]), true)).toBe(
      'MIDI keyboard disconnected. Tap the keys, or plug it back in.',
    );
    expect(midiNotice(ready([k]), ready([k]), false)).toBeNull();
  });
});

describe('AudioNotice', () => {
  it('is a mounted polite region that follows the sound, and lets "Piano ready" go after a while', () => {
    const { rerender } = render(<AudioNotice />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('');
    fake.audio = { ...fake.audio, status: 'synth', instrument: 'synth', samplesTotal: 12 };
    rerender(<AudioNotice />);
    expect(notice).toHaveTextContent('Loading the piano, a simple synth plays for now.');
    fake.audio = { ...fake.audio, status: 'ready', instrument: 'piano' };
    rerender(<AudioNotice />);
    expect(notice).toHaveTextContent('Piano ready.');
    act(() => vi.advanceTimersByTime(NOTICE_MS.ready));
    expect(notice).toHaveTextContent('');
  });

  it('gives a MIDI keyboard coming or going the line for a moment, then the sound again', () => {
    fake.audio = { status: 'synth', samplesLoaded: 0, samplesTotal: 12, instrument: 'synth' };
    fake.midi.state = ready([]);
    const { rerender } = render(<AudioNotice />);
    act(() => fake.midi.emit(ready([{ id: 'k1', name: 'Keystation 49' }])));
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('MIDI keyboard connected: Keystation 49.');
    act(() => vi.advanceTimersByTime(NOTICE_MS.midi));
    expect(notice).toHaveTextContent('Loading the piano, a simple synth plays for now.');
    fake.touchOnly = true;
    rerender(<AudioNotice />);
    act(() => fake.midi.emit(ready([])));
    expect(notice).toHaveTextContent(
      'MIDI keyboard disconnected. Tap the keys, or plug it back in.',
    );
  });

  it('says nothing about MIDI where there is no dock', () => {
    fake.midi.state = ready([]);
    render(<AudioNotice midi={false} />);
    act(() => fake.midi.emit(ready([{ id: 'k1', name: 'Keystation 49' }])));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
