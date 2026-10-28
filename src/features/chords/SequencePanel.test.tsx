import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { memoryStore, type KeyValueStore } from '@/core/persistence/storage';
import { loadSequence } from '@/state/sequence';
import { SequencePanel } from './SequencePanel';
import { useSequenceEditor } from './useSequenceEditor';
import type { SequencePlayback } from './useSequencePlayer';

function Harness({ store, playback }: { store: KeyValueStore; playback: SequencePlayback }) {
  const editor = useSequenceEditor(store);
  return <SequencePanel editor={editor} playback={playback} />;
}

function setup(store: KeyValueStore = memoryStore()) {
  const playback: SequencePlayback = { playing: false, bar: null, play: vi.fn(), stop: vi.fn() };
  const user = userEvent.setup();
  const view = render(<Harness store={store} playback={playback} />);
  const field = screen.getByRole('textbox', { name: 'Type chords' });
  /** Each bar's text, as "1 C", "3 F G". */
  const bars = () =>
    screen.queryByTestId('sequence-bars')
      ? within(screen.getByTestId('sequence-bars'))
          .getAllByRole('listitem')
          .map((li) => li.textContent!.replace(/^(\d+)/, '$1 '))
      : [];
  const status = () => screen.getByTestId('sequence-status').textContent!.trim();
  return { store, playback, user, view, field, bars, status };
}

describe('SequencePanel: typing chords', () => {
  it('adds a line of chords on Enter, a bar each, and says so', async () => {
    const { user, field, bars, status, store } = setup();
    await user.type(field, 'C Am F G{Enter}');
    expect(bars()).toEqual(['1 C', '2 Am', '3 F', '4 G']);
    expect(field).toHaveValue('');
    expect(status()).toBe('Added C, Am, F, G as bars 1 to 4.');
    expect(screen.getByTestId('sequence-summary')).toHaveTextContent('4 bars in C major');
    expect(loadSequence(store).bars).toHaveLength(4);
  });

  it('takes a whole line in bar syntax, pasted into an empty sequence', async () => {
    const { user, field, bars, status } = setup();
    await user.click(field);
    await user.paste('| C | Am | F G |');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(bars()).toEqual(['1 C', '2 Am', '3 FG']);
    expect(status()).toBe('Added C, Am, F G as bars 1 to 3.');
  });

  it('takes lower case, commas and dashes, and keeps C-7 a chord', async () => {
    const { user, field, bars } = setup();
    await user.type(field, 'am, f - c-7 g{Enter}');
    expect(bars()).toEqual(['1 Am', '2 F', '3 C-7', '4 G']);
  });

  it('shows what it cannot read inline, adds nothing, and clears as you fix it', async () => {
    const { user, field, bars, status } = setup();
    await user.type(field, 'C Hm F{Enter}');
    expect(bars()).toEqual([]);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/Bar 2: "Hm" is not a chord\. Nothing was added\./);
    expect(status()).toBe('Not added. Bar 2: "Hm" is not a chord. Nothing was added.');
    expect(field).toHaveValue('C Hm F');
    await user.clear(field);
    await user.type(field, 'C Dm F');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await user.keyboard('{Enter}');
    expect(bars()).toEqual(['1 C', '2 Dm', '3 F']);
  });

  it('does nothing with an empty field', async () => {
    const { user, field, status } = setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(field, '   {Enter}');
    expect(status()).toBe('');
  });

  it('says when a line will not fit', async () => {
    const { user, field, bars } = setup();
    await user.type(field, `${Array.from({ length: 33 }, () => 'C').join(' ')}{Enter}`);
    expect(bars()).toEqual([]);
    expect(field).toHaveAccessibleDescription(/That is 33 bars; there is room for 32 more/);
  });
});

describe('SequencePanel: an empty sequence', () => {
  it('offers one example that fills four bars', async () => {
    const { user, bars, status } = setup();
    expect(screen.getByTestId('sequence-empty')).toHaveTextContent('No chords yet');
    expect(screen.getByTestId('sequence-play')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Try C G Am F' }));
    expect(bars()).toEqual(['1 C', '2 G', '3 Am', '4 F']);
    expect(status()).toBe('Added C, G, Am, F as bars 1 to 4.');
    expect(screen.queryByTestId('sequence-empty')).toBeNull();
    expect(screen.getByTestId('sequence-play')).toBeEnabled();
  });
});

describe('SequencePanel: playing and settings', () => {
  it('plays and stops through the player, and marks the bar playing', async () => {
    const store = memoryStore();
    const first = setup(store);
    await first.user.click(screen.getByRole('button', { name: 'Try C G Am F' }));
    await first.user.click(screen.getByTestId('sequence-play'));
    expect(first.playback.play).toHaveBeenCalledOnce();
    first.view.unmount();

    const playing: SequencePlayback = { playing: true, bar: 2, play: vi.fn(), stop: vi.fn() };
    render(<Harness store={store} playback={playing} />);
    expect(screen.getByTestId('sequence-play')).toHaveAccessibleName('Stop');
    expect(screen.getByTestId('sequence-position')).toHaveTextContent('Bar 3 of 4');
    const current = within(screen.getByTestId('sequence-bars')).getAllByRole('listitem')[2]!;
    expect(current).toHaveAttribute('aria-current', 'true');
    await userEvent.setup().click(screen.getByTestId('sequence-play'));
    expect(playing.stop).toHaveBeenCalledOnce();
  });

  it('changes the meter, splitting bars evenly, and keeps every setting', async () => {
    const store = memoryStore();
    const { user, field, bars, status } = setup(store);
    await user.type(field, '| C G | Am |{Enter}');
    await user.click(screen.getByRole('radio', { name: '3/4' }));
    expect(status()).toBe('Meter 3/4: the chords in each bar split evenly.');
    await user.selectOptions(screen.getByTestId('sequence-style'), 'held');
    await user.click(screen.getByRole('button', { name: 'Loop' }));
    expect(bars()).toEqual(['1 CG', '2 Am']);
    expect(loadSequence(store)).toMatchObject({
      meter: { beats: 3 },
      bars: [
        {
          chords: [
            { symbol: 'C', beats: 2 },
            { symbol: 'G', beats: 1 },
          ],
        },
        { chords: [{ symbol: 'Am', beats: 3 }] },
      ],
      style: 'held',
      loop: false,
    });
  });

  it('comes back as it was left', async () => {
    const store = memoryStore();
    const first = setup(store);
    await first.user.type(first.field, 'Dm G7 C{Enter}');
    first.view.unmount();
    const again = setup(store);
    expect(again.bars()).toEqual(['1 Dm', '2 G7', '3 C']);
  });
});
