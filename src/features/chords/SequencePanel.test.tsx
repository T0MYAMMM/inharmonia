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
  /** Each bar's name, as "Bar 1: C", "Bar 3: F, G". */
  const bars = () =>
    screen.queryByRole('listbox', { name: 'Bars' })
      ? within(screen.getByRole('listbox', { name: 'Bars' }))
          .getAllByRole('option')
          .map((o) => o.getAttribute('aria-label')!)
      : [];
  const status = () => screen.getByTestId('sequence-status').textContent!.trim();
  return { store, playback, user, view, field, bars, status };
}

describe('SequencePanel: typing chords', () => {
  it('adds a line of chords on Enter, a bar each, and says so', async () => {
    const { user, field, bars, status, store } = setup();
    await user.type(field, 'C Am F G{Enter}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am', 'Bar 3: F', 'Bar 4: G']);
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
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am', 'Bar 3: F, G']);
    expect(status()).toBe('Added C, Am, F G as bars 1 to 3.');
  });

  it('takes lower case, commas and dashes, and keeps C-7 a chord', async () => {
    const { user, field, bars } = setup();
    await user.type(field, 'am, f - c-7 g{Enter}');
    expect(bars()).toEqual(['Bar 1: Am', 'Bar 2: F', 'Bar 3: C-7', 'Bar 4: G']);
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
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Dm', 'Bar 3: F']);
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
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: G', 'Bar 3: Am', 'Bar 4: F']);
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
    const current = screen.getAllByRole('option')[2]!;
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
    expect(bars()).toEqual(['Bar 1: C, G', 'Bar 2: Am']);
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
    expect(again.bars()).toEqual(['Bar 1: Dm', 'Bar 2: G7', 'Bar 3: C']);
  });
});

describe('SequencePanel: editing bars', () => {
  async function filled(text = '| C | Am | F G | G7 |') {
    const env = setup();
    await env.user.type(env.field, `${text}{Enter}`);
    return env;
  }
  const option = (i: number) => screen.getAllByRole('option')[i]!;

  it('chooses a bar by click, and adds new chords after it', async () => {
    const { user, bars, status, field } = await filled();
    await user.click(option(1));
    expect(option(1)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Bar 2' })).toBeInTheDocument();
    await user.type(field, 'E7 E7{Enter}');
    expect(bars()).toEqual([
      'Bar 1: C',
      'Bar 2: Am',
      'Bar 3: E7',
      'Bar 4: E7',
      'Bar 5: F, G',
      'Bar 6: G7',
    ]);
    expect(status()).toBe('Added E7, E7 as bars 3 to 4.');
    expect(option(3)).toHaveAttribute('aria-selected', 'true');
    await user.click(option(3));
    expect(screen.queryByTestId('bar-editor')).toBeNull();
  });

  it('splits a bar, changes and takes out its chords', async () => {
    const { user, bars, status } = await filled();
    await user.click(option(0));
    const editor = screen.getByTestId('bar-editor');
    await user.click(within(editor).getByRole('radio', { name: '3+1' }));
    expect(bars()[0]).toBe('Bar 1: C, C');
    expect(status()).toBe('Bar 1 is now C C, 3+1 beats.');
    const second = within(editor).getByRole('textbox', { name: 'Chord 2, 1 beat' });
    await user.clear(second);
    await user.type(second, 'g7{Enter}');
    expect(bars()[0]).toBe('Bar 1: C, G7');
    expect(status()).toBe('Bar 1 is now C G7.');
    await user.clear(second);
    await user.type(second, 'Hx{Enter}');
    expect(second).toHaveAccessibleDescription('Not a chord yet. Escape puts it back.');
    await user.keyboard('{Escape}');
    expect(second).toHaveValue('G7');
    await user.click(within(editor).getByRole('button', { name: 'Remove C from bar 1' }));
    expect(bars()[0]).toBe('Bar 1: G7');
    expect(status()).toBe('Took C out of bar 1: now G7.');
    expect(within(editor).getByRole('button', { name: 'Remove G7 from bar 1' })).toBeDisabled();
  });

  it('moves, copies and deletes the chosen bar with its buttons', async () => {
    const { user, bars, status } = await filled();
    await user.click(option(0));
    const editor = () => screen.getByTestId('bar-editor');
    expect(within(editor()).getByRole('button', { name: 'Move bar 1 left' })).toBeDisabled();
    await user.click(within(editor()).getByRole('button', { name: 'Move bar 1 right' }));
    expect(bars()).toEqual(['Bar 1: Am', 'Bar 2: C', 'Bar 3: F, G', 'Bar 4: G7']);
    expect(status()).toBe('Moved bar 1 to bar 2.');
    expect(option(1)).toHaveAttribute('aria-selected', 'true');
    await user.click(within(editor()).getByRole('button', { name: 'Copy bar 2 after it' }));
    expect(bars()).toEqual(['Bar 1: Am', 'Bar 2: C', 'Bar 3: C', 'Bar 4: F, G', 'Bar 5: G7']);
    expect(status()).toBe('Copied bar 2 to bar 3.');
    await user.click(within(editor()).getByRole('button', { name: 'Delete bar 3' }));
    expect(bars()).toEqual(['Bar 1: Am', 'Bar 2: C', 'Bar 3: F, G', 'Bar 4: G7']);
    expect(status()).toBe('Deleted bar 3, C.');
  });

  it('works from the keys: arrows choose, Shift moves, Delete deletes, Enter edits', async () => {
    const { user, bars, status } = await filled();
    await user.click(option(0));
    expect(option(0)).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(option(1)).toHaveFocus();
    expect(option(1)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: F, G', 'Bar 3: Am', 'Bar 4: G7']);
    expect(option(2)).toHaveFocus();
    expect(status()).toBe('Moved bar 2 to bar 3.');
    await user.keyboard('{End}');
    expect(option(3)).toHaveFocus();
    await user.keyboard('{Delete}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: F, G', 'Bar 3: Am']);
    expect(option(2)).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(screen.getByRole('textbox', { name: 'Chord 1, 4 beats' })).toHaveFocus();
    option(0).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('bar-editor')).toBeNull();
    // One tab stop for all the bars.
    expect(screen.getAllByRole('option').filter((o) => o.tabIndex === 0)).toHaveLength(1);
  });

  it('deleting the last bar goes back to typing chords', async () => {
    const { user, field } = await filled('C');
    await user.click(option(0));
    await user.keyboard('{Delete}');
    expect(screen.getByTestId('sequence-empty')).toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('undoes and redoes, by buttons and by Ctrl+Z, but leaves a text field its own', async () => {
    const { user, bars, status, field } = await filled('C Am');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(bars()).toEqual([]);
    expect(status()).toBe('Cleared 2 bars. Undo brings them back.');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am']);
    expect(status()).toBe('Undone: cleared 2 bars. Undo brings them back.');
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(bars()).toEqual([]);
    expect(status()).toBe('Redone: cleared 2 bars. Undo brings them back.');
    await user.click(document.body);
    await user.keyboard('{Control>}z{/Control}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am']);
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(bars()).toEqual([]);
    await user.keyboard('{Control>}y{/Control}');
    expect(bars()).toEqual([]);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am']);
    // In the text field, Ctrl+Z is the field's.
    await user.click(field);
    await user.keyboard('{Control>}z{/Control}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am']);
  });

  it('leaves Ctrl+Z to a select and to an open menu', async () => {
    const { user, bars } = await filled('C Am');
    screen.getByTestId('sequence-style').focus();
    await user.keyboard('{Control>}z{/Control}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am']);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    await user.click(document.body);
    await user.keyboard('{Control>}z{/Control}');
    expect(bars()).toEqual(['Bar 1: C', 'Bar 2: Am']);
    menu.remove();
    await user.keyboard('{Control>}z{/Control}');
    expect(bars()).toEqual([]);
  });
});

describe('SequencePanel: Roman numerals', () => {
  it("shows each chord's numeral in the key the chords suggest, and keeps the choice", async () => {
    const store = memoryStore();
    const { user, field, bars, view } = setup(store);
    await user.type(field, '| Am | F | C | G E7 |{Enter}');
    expect(screen.getByTestId('sequence-summary')).toHaveTextContent('4 bars in A minor');
    expect(bars()[3]).toBe('Bar 4: G, E7');
    await user.click(screen.getByRole('button', { name: 'Show function' }));
    expect(bars()).toEqual([
      'Bar 1: Am (i)',
      'Bar 2: F (♭VI)',
      'Bar 3: C (♭III)',
      'Bar 4: G (♭VII), E7 (V7)',
    ]);
    view.unmount();
    expect(setup(store).bars()[0]).toBe('Bar 1: Am (i)');
  });
});
