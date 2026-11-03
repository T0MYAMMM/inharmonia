import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBars, withLyric, type ChartBar } from '@/core/charts';
import { TapTiming } from './TapTiming';

// The clock taps are read on, moved by hand, and a metronome that only says where its beat is.
const t = vi.hoisted(() => ({ clock: 0, stops: 0 }));
vi.mock('./tapSource', () => ({
  tapNow: () => t.clock,
  startMetronome: vi.fn((bpm: number, beatsPerBar: number) => ({
    grid: { downbeat: t.clock + (beatsPerBar * 60) / bpm, period: 60 / bpm },
    stop: () => t.stops++,
  })),
}));
const { startMetronome } = await import('./tapSource');

/** Bars as `C:4 | G:2 D:2` for short expectations. */
const show = (bars: ChartBar[]) =>
  bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' ')).join(' | ');

// An invented section, with invented words on two bars.
const section = () => {
  const bars = parseBars('| C | G | Am | F |', 4).bars;
  bars[1] = withLyric(bars[1]!, 'over the hill');
  return bars;
};

function renderTap(bars = section(), tempo = 120) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <TapTiming
      label="Verse"
      bars={bars}
      beatsPerBar={4}
      tempo={tempo}
      onApply={onApply}
      onCancel={onCancel}
    />,
  );
  return { onApply, onCancel, ...view };
}

const said = () => screen.getByTestId('tap-said').textContent;
/** Move the clock and let a frame run. */
const at = async (seconds: number) => {
  t.clock = seconds;
  await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
};

beforeEach(() => {
  t.clock = 100;
  t.stops = 0;
  vi.mocked(startMetronome).mockClear();
});

describe('tap timing with the metronome', () => {
  it('times the chords from taps on Space, with undo', async () => {
    const user = userEvent.setup();
    const { onApply } = renderTap();
    expect(screen.getByText(/4 chords, 3 changes/)).toBeInTheDocument();
    await user.click(screen.getByTestId('tap-start'));
    expect(startMetronome).toHaveBeenCalledWith(120, 4, 33);
    expect(said()).toBe('Counting in. First chord C.');
    expect(screen.getByTestId('tap-current')).toHaveTextContent('C');
    expect(screen.getByTestId('tap-next')).toHaveTextContent('G');
    expect(screen.getByTestId('tap-count')).toHaveTextContent('Counting in');
    expect(screen.getByTestId('tap-button')).toHaveFocus();

    // Beat 0 is at 102 s, a beat every half second.
    await at(102.1);
    expect(screen.getByTestId('tap-count')).toHaveTextContent('Bar 1, change 0 of 3');
    await at(102 + 6 * 0.5 + 0.07);
    await user.keyboard(' ');
    expect(screen.getByTestId('tap-current')).toHaveTextContent('G');
    expect(said()).toBe('Chord 2 of 4, G.');
    // A tap too many, undone.
    await user.keyboard(' ');
    expect(screen.getByTestId('tap-current')).toHaveTextContent('Am');
    await user.keyboard('{Backspace}');
    expect(screen.getByTestId('tap-current')).toHaveTextContent('G');
    expect(said()).toBe('Undone. Chord 2 of 4, G.');

    await at(102 + 8 * 0.5 - 0.06);
    await user.keyboard(' ');
    await at(102 + 11 * 0.5 + 0.08);
    await user.keyboard(' ');
    // All changes in: the sound stops and the bars are shown.
    expect(t.stops).toBe(1);
    expect(said()).toBe('Done. Here are the new bars.');
    expect(screen.getByTestId('tap-summary')).toHaveTextContent('Verse: 3 bars, was 4.');
    expect(screen.getByTestId('tap-summary')).toHaveFocus();
    expect(within(screen.getByTestId('tap-old')).getAllByRole('listitem')).toHaveLength(4);
    const fresh = within(screen.getByTestId('tap-new')).getAllByRole('listitem');
    expect(fresh.map((li) => li.textContent)).toEqual([
      '1C, 4 beats',
      '2C, 2 beatsG, 2 beatsover the hill',
      '3Am, 3 beatsF, 1 beat',
    ]);
    expect(screen.getByText('Lyrics move with their bars.')).toBeInTheDocument();

    await user.click(screen.getByTestId('tap-apply'));
    const bars = onApply.mock.calls[0]![0] as ChartBar[];
    expect(show(bars)).toBe('C:4 | C:2 G:2 | Am:3 F:1');
    expect(bars[1]!.lyric).toBe('over the hill');
  });

  it('taps with the Tap button too, and Esc stops early', async () => {
    const user = userEvent.setup();
    const { onApply } = renderTap();
    await user.click(screen.getByTestId('tap-start'));
    await at(102 + 2 * 0.5);
    fireEvent.pointerDown(screen.getByTestId('tap-button'), { button: 0 });
    expect(screen.getByTestId('tap-current')).toHaveTextContent('G');
    await user.keyboard('{Escape}');
    expect(said()).toBe('Stopped after 1 of 3 changes. The rest keep their lengths.');
    // G reached and kept at its 4 beats, Am too, F to the end of its bar.
    await user.click(screen.getByTestId('tap-apply'));
    expect(show(onApply.mock.calls[0]![0] as ChartBar[])).toBe('C:2 G:2 | G:2 Am:2 | Am:2 F:2');
  });

  it('goes back to the start when stopped before any change', async () => {
    const user = userEvent.setup();
    renderTap();
    await user.click(screen.getByTestId('tap-start'));
    await user.click(screen.getByTestId('tap-stop'));
    expect(said()).toBe('Stopped.');
    expect(screen.getByTestId('tap-start')).toBeInTheDocument();
    expect(t.stops).toBe(1);
  });

  it('restarts from the result, and discards', async () => {
    const user = userEvent.setup();
    const { onApply, onCancel } = renderTap();
    await user.click(screen.getByTestId('tap-start'));
    await at(103);
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('tap-summary')).toBeNull();
    await user.click(screen.getByTestId('tap-start'));
    await at(104);
    await user.keyboard(' ');
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('tap-restart'));
    expect(startMetronome).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('tap-current')).toHaveTextContent('C');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('tap-start')).toBeInTheDocument();
    await user.click(screen.getByTestId('tap-cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says when the new bars no longer fit in a section', async () => {
    const user = userEvent.setup();
    const { onApply } = renderTap(parseBars('| C | G |', 4).bars);
    await user.click(screen.getByTestId('tap-start'));
    await at(102 + 33 * 4 * 0.5 - 0.5);
    await user.keyboard(' ');
    expect(screen.getByTestId('tap-too-long')).toHaveTextContent('A section holds up to 32 bars.');
    expect(screen.getByTestId('tap-apply')).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows no moving beat marks with reduced motion', async () => {
    const user = userEvent.setup();
    const matchMedia = (q: string) =>
      ({
        matches: q.includes('reduced-motion'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      renderTap();
      await user.click(screen.getByTestId('tap-start'));
      await at(102.2);
      expect(screen.getByTestId('tap-count')).toHaveTextContent('Bar 1');
      expect(screen.getByTestId('tap-count').querySelector('[aria-hidden]')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('tap timing with a song file', () => {
  const media = { time: 0, play: vi.fn(), pause: vi.fn() };
  const created: string[] = [];
  const revoked: string[] = [];

  beforeEach(() => {
    media.time = 0;
    media.play.mockReset().mockResolvedValue(undefined);
    media.pause.mockReset();
    created.length = 0;
    revoked.length = 0;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(media.play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(media.pause);
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      get: () => media.time,
      set: (v: number) => (media.time = v),
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => {
        created.push(`blob:song-${created.length}`);
        return created.at(-1)!;
      },
      revokeObjectURL: (u: string) => revoked.push(u),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const pick = async (user: ReturnType<typeof userEvent.setup>, name = 'song.ogg') => {
    await user.click(screen.getByRole('radio', { name: 'A song file' }));
    await user.upload(screen.getByTestId('tap-file'), new File(['x'], name, { type: 'audio/ogg' }));
  };
  const tapAt = async (seconds: number) => {
    media.time = seconds;
    fireEvent.pointerDown(screen.getByTestId('tap-button'), { button: 0 });
    await act(() => Promise.resolve());
  };

  it('sets the beat from two bars of taps, then times the chords on the song clock', async () => {
    const user = userEvent.setup();
    const { onApply, unmount } = renderTap();
    await pick(user);
    expect(screen.getByText('It stays on this device: never uploaded or kept.')).toBeVisible();
    const audio = document.querySelector('audio')!;
    expect(audio.src).toBe('blob:song-0');
    expect(audio.preservesPitch).toBe(true);
    expect(audio.playbackRate).toBe(1);
    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), { target: { value: '70' } });
    expect(audio.playbackRate).toBeCloseTo(0.7);

    await user.click(screen.getByTestId('tap-beat'));
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tap-button')).toHaveFocus();
    // 100 bpm, the section from 12 s, tapped a little off.
    const off = [0.04, -0.05, 0.03, 0.0, -0.04, 0.05, -0.02, 0.01];
    for (let i = 0; i < 8; i++) {
      await tapAt(12 + i * 0.6 + off[i]!);
      if (i === 2) expect(said()).toBe('Beat 3 of 8.');
    }
    expect(said()).toBe('About 100 bpm. Now tap the chords.');
    expect(screen.getByTestId('tap-tempo')).toHaveTextContent('About 100 bpm.');
    expect(media.pause).toHaveBeenCalled();

    await user.click(screen.getByTestId('tap-chords'));
    // From a bar before the first downbeat.
    expect(media.time).toBeCloseTo(12 - 2.4, 1);
    await tapAt(12 + 4 * 0.6 + 0.06);
    await tapAt(12 + 6 * 0.6 - 0.07);
    await tapAt(12 + 12 * 0.6 + 0.02);
    await user.click(screen.getByTestId('tap-apply'));
    expect(show(onApply.mock.calls[0]![0] as ChartBar[])).toBe('C:4 | G:2 Am:2 | Am:4 | F:4');

    // Never kept: let go on leaving.
    unmount();
    expect(revoked).toEqual(['blob:song-0']);
  });

  it('asks again when the beat taps were not steady, and lets go of a file replaced', async () => {
    const user = userEvent.setup();
    renderTap();
    await pick(user);
    await user.click(screen.getByTestId('tap-beat'));
    for (const s of [1, 1.5, 2.6, 2.7, 3.9, 4, 5.2, 5.3]) await tapAt(s);
    expect(said()).toBe('Those taps were not a steady beat. Tap the beat again.');
    expect(screen.queryByTestId('tap-chords')).toBeNull();
    // Undo and redo while tapping the beat.
    await user.click(screen.getByTestId('tap-beat'));
    await tapAt(1);
    await tapAt(1.4);
    await user.keyboard('{Backspace}');
    expect(screen.getByTestId('tap-beats')).toHaveTextContent('1 / 8');
    await user.keyboard('{Escape}');
    await pick(user, 'other.ogg');
    expect(revoked).toEqual(['blob:song-0']);
    expect(document.querySelector('audio')!.src).toBe('blob:song-1');
  });
});
