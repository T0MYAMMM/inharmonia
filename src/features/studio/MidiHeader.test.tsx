import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MidiHeader, MidiSettings, type MidiHeaderProps } from './MidiHeader';

function headerProps(patch: Partial<MidiHeaderProps> = {}): MidiHeaderProps {
  return {
    title: 'Tune',
    onTitle: vi.fn(),
    canUndo: false,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    playing: false,
    onPlay: vi.fn(),
    showKeys: false,
    onShowKeys: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onDropFile: vi.fn(),
    onRefuse: vi.fn(),
    onExport: vi.fn(),
    onSave: vi.fn(),
    ...patch,
  };
}

describe('MidiHeader', () => {
  it('holds the title, history, playback, the File menu and Save', async () => {
    const user = userEvent.setup();
    const props = headerProps();
    render(<MidiHeader {...props} />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Tune');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(props.onRedo).toHaveBeenCalled();

    const keys = screen.getByRole('button', { name: 'Keyboard' });
    expect(keys).toHaveAttribute('aria-pressed', 'false');
    await user.click(keys);
    expect(props.onShowKeys).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'New MIDI',
      'Open MIDI file',
      'Export .mid',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Export .mid' }));
    expect(props.onExport).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save to My songs' }));
    expect(props.onSave).toHaveBeenCalled();
  });

  it('keeps Play as wide as Pause, and is named for what it does now', () => {
    const { rerender } = render(<MidiHeader {...headerProps()} />);
    const play = screen.getByTestId('midi-play');
    expect(play).toHaveAccessibleName('Play');
    // The other label stays in the button, hidden, holding its width.
    expect(play).toHaveTextContent('PlayPause');
    rerender(<MidiHeader {...headerProps({ playing: true })} />);
    expect(play).toHaveAccessibleName('Pause');
  });

  it('opens a MIDI file dropped on File, and refuses one that is not MIDI', () => {
    const props = headerProps();
    render(<MidiHeader {...props} />);
    const file = screen.getByRole('button', { name: 'File' });
    const drop = (f: File) =>
      fireEvent.drop(file, { dataTransfer: { files: [f], items: [{ kind: 'file' }] } });
    drop(new File(['{}'], 'notes.json', { type: 'application/json' }));
    expect(props.onRefuse).toHaveBeenCalled();
    const tune = new File(['MThd'], 'tune.mid', { type: 'audio/midi' });
    drop(tune);
    expect(props.onDropFile).toHaveBeenCalledWith(tune);
  });
});

describe('MidiSettings', () => {
  it('names the song settings and the two zooms', () => {
    render(
      <MidiSettings
        tempo={96}
        onTempo={vi.fn()}
        step={0.25}
        onStep={vi.fn()}
        zoom={56}
        onZoom={vi.fn()}
        row={22}
        onRow={vi.fn()}
        meter="3/4"
        notes={1}
      />,
    );
    expect(screen.getByRole('spinbutton', { name: 'Tempo' })).toHaveValue(96);
    const snap = screen.getByRole('combobox', { name: 'Snap' });
    expect(snap).toHaveDisplayValue('1/16');
    expect([...(snap as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      '1/4',
      '1/8',
      '1/16',
      '1/32',
      'Off',
    ]);
    expect(screen.getByText('3/4 · 1 note')).toBeInTheDocument();
    const view = screen.getByRole('group', { name: 'View' });
    expect(view).toContainElement(screen.getByRole('slider', { name: 'Horizontal zoom' }));
    expect(view).toContainElement(screen.getByRole('slider', { name: 'Vertical zoom' }));
  });
});

describe('below 760px', () => {
  // jsdom has no matchMedia: stand in one for a width under 760px.
  const compact = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 760px)' || query === '(max-width: 960px)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the title, Play and Keyboard, and puts the rest under More', async () => {
    compact();
    const user = userEvent.setup();
    const props = headerProps({ showKeys: true });
    render(<MidiHeader {...props} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Tune');
    ['Play', 'Keyboard', 'More'].forEach((name, i) =>
      expect(buttons[i]).toHaveAccessibleName(name),
    );
    expect(screen.getByRole('button', { name: 'Keyboard' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Undo',
      'Redo',
      'New MIDI',
      'Open MIDI file',
      'Export .mid',
      'Save to My songs',
    ]);
    expect(screen.getByRole('menuitem', { name: 'Undo' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Save to My songs' }));
    expect(props.onSave).toHaveBeenCalled();
  });

  it('folds the settings into one line that says what they are', async () => {
    compact();
    const user = userEvent.setup();
    render(
      <MidiSettings
        tempo={96}
        onTempo={vi.fn()}
        step={0.25}
        onStep={vi.fn()}
        zoom={56}
        onZoom={vi.fn()}
        row={22}
        onRow={vi.fn()}
        meter="3/4"
        notes={1}
      />,
    );
    const fold = screen.getByTestId('midi-settings');
    expect(fold.tagName).toBe('DETAILS');
    expect(fold).not.toHaveAttribute('open');
    await user.click(screen.getByText('Tempo 96 · Snap 1/16 · 3/4 · 1 note'));
    expect(fold).toHaveAttribute('open');
    expect(screen.getByRole('slider', { name: 'Vertical zoom' })).toBeVisible();
  });
});
