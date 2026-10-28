import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computerKeyMap, type ActiveInput, type MidiSnapshot } from '@/core/input';
import { keyName } from './layout';
import { InputStatus } from './InputStatus';

const fake = vi.hoisted(() => ({
  input: { kind: 'keys' } as ActiveInput,
  touchOnly: false,
  midi: { status: 'idle', devices: [], selected: 'all', sustain: false } as MidiSnapshot,
  connectMidi: vi.fn(),
  select: vi.fn(),
}));
vi.mock('@/app/hooks', () => ({
  useActiveInput: () => fake.input,
  useTouchOnly: () => fake.touchOnly,
  useMidiState: () => fake.midi,
}));
vi.mock('@/app/services', () => ({
  connectMidi: fake.connectMidi,
  midi: { select: fake.select },
}));

beforeEach(() => {
  fake.input = { kind: 'keys' };
  fake.touchOnly = false;
  fake.midi = { status: 'idle', devices: [], selected: 'all', sustain: false };
  vi.clearAllMocks();
});

describe('InputStatus', () => {
  it('names the input in use and opens How to play from it', async () => {
    const user = userEvent.setup();
    render(<InputStatus octaveShift={0} />);
    const button = screen.getByRole('button', { name: 'Computer keys, how to play' });
    const popover = screen.getByTestId('how-to-play');
    expect(popover).not.toBeVisible();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(popover).toBeVisible();
    await user.keyboard('{Escape}');
    expect(popover).not.toBeVisible();
    expect(button).toHaveFocus();
  });

  it('shows every computer key and its note, from the key map, at the octave in use', async () => {
    const user = userEvent.setup();
    render(<InputStatus octaveShift={-1} />);
    await user.click(screen.getByTestId('input-status'));
    const items = within(screen.getByRole('list', { name: 'Computer keys and their notes' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual(computerKeyMap(-1).map((k) => `${k.label}${keyName(k.midi)}`));
    expect(items[0]).toBe('AC3');
    expect(screen.getByText(/move them down and up an octave/)).toBeVisible();
  });

  it('gives a touch-only device tap guidance and no computer keys', async () => {
    const user = userEvent.setup();
    fake.touchOnly = true;
    fake.input = { kind: 'screen', touch: true };
    render(<InputStatus octaveShift={0} />);
    await user.click(screen.getByRole('button', { name: 'Tap the keys, how to play' }));
    expect(screen.getByText(/^Tap the keys\./)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Computer keys' })).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('connects MIDI, and picks among several inputs', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<InputStatus octaveShift={0} />);
    await user.click(screen.getByTestId('input-status'));
    await user.click(screen.getByRole('button', { name: 'Connect MIDI' }));
    expect(fake.connectMidi).toHaveBeenCalledOnce();

    fake.midi = {
      status: 'ready',
      devices: [
        { id: 'a', name: 'Keystation 49' },
        { id: 'b', name: 'Pads' },
      ],
      selected: 'all',
      sustain: false,
    };
    fake.input = { kind: 'midi', device: '2 MIDI inputs', sustain: false };
    rerender(<InputStatus octaveShift={0} />);
    expect(screen.getByTestId('input-status')).toHaveTextContent('MIDI: 2 MIDI inputs');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Input' }), 'b');
    expect(fake.select).toHaveBeenCalledWith('b');
  });
});
