import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NoteStream } from '@/core/input';
import { formatNote } from '@/core/notation';
import { spelled } from '@/core/theory';
import { KeyLights } from '@/state/keyLights';
import { Keyboard } from './keyboard/Keyboard';
import { layoutKeys } from './keyboard/layout';
import { NoteLabel } from './NoteLabel';
import { Segmented } from './Segmented';
import { Toggle } from './Toggle';

describe('keyboard layout', () => {
  it('lays out F#1 to G5 with a half-key lead-in', () => {
    const { keys, width } = layoutKeys(30, 79);
    expect(keys).toHaveLength(50);
    expect(keys.filter((k) => !k.black)).toHaveLength(29);
    expect(keys[0]).toMatchObject({ midi: 30, black: true, x: 0 });
    expect(width).toBeCloseTo(29.3);
  });
});

describe('Keyboard', () => {
  it('renders every key and reflects light layers without re-rendering', () => {
    const lights = new KeyLights();
    const { container } = render(
      <Keyboard low={48} high={72} stream={new NoteStream()} lights={lights} />,
    );
    expect(container.querySelectorAll('[data-midi]')).toHaveLength(25);
    const c4 = container.querySelector<HTMLElement>('[data-midi="60"]')!;
    act(() => lights.set(60, 'rh', true));
    expect(c4.dataset.layers).toBe('rh');
    act(() => lights.set(60, 'target', true));
    expect(c4.dataset.layers).toBe('rh target');
    act(() => lights.clear());
    expect(c4.dataset.layers).toBeUndefined();
  });

  it('plays a note on pointer down', () => {
    const stream = new NoteStream();
    const { container } = render(
      <Keyboard low={48} high={72} stream={stream} lights={new KeyLights()} />,
    );
    const d4 = container.querySelector('[data-midi="62"]')!;
    d4.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3 }));
    expect(stream.held()).toEqual([62]);
  });

  it('shows computer-key hints for the shifted octave', () => {
    const { container } = render(
      <Keyboard
        low={36}
        high={72}
        stream={new NoteStream()}
        lights={new KeyLights()}
        octaveShift={-1}
      />,
    );
    expect(container.querySelector('[data-midi="48"]')!.textContent).toContain('A');
    expect(container.querySelector('[data-midi="60"]')!.textContent).not.toContain('A');
  });
});

describe('Segmented', () => {
  function Demo() {
    const [v, setV] = useState<'a' | 'b' | 'c'>('a');
    return (
      <Segmented
        label="Choice"
        value={v}
        onChange={setV}
        options={[
          { value: 'a', label: 'One' },
          { value: 'b', label: 'Two' },
          { value: 'c', label: 'Three' },
        ]}
      />
    );
  }

  it('is a radio group operable with arrow keys', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    expect(screen.getByRole('radiogroup', { name: 'Choice' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'One' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'One' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Two' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Two' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Three' })).toBeChecked();
  });
});

describe('Toggle', () => {
  it('reports pressed state', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [on, setOn] = useState(false);
      return (
        <Toggle pressed={on} onChange={setOn}>
          Metronome
        </Toggle>
      );
    }
    render(<Demo />);
    const t = screen.getByRole('button', { name: 'Metronome' });
    expect(t).toHaveAttribute('aria-pressed', 'false');
    await user.click(t);
    expect(t).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('NoteLabel', () => {
  const D = { tonic: 'D', mode: 'major' as const };
  it('renders not angka with an accessible name and octave dots', () => {
    const label = formatNote(spelled('E5'), D, { system: 'angka' });
    const { container } = render(<NoteLabel label={label} angka />);
    expect(screen.getByRole('img', { name: '2, one octave up' })).toBeInTheDocument();
    expect(container.querySelectorAll('.dot')).toHaveLength(1);
  });

  it('draws the chromatic slash or a suffix', () => {
    const label = formatNote(spelled('G#4'), D, { system: 'angka' });
    const { container, rerender } = render(<NoteLabel label={label} angka />);
    expect(container.querySelector('.raised')).not.toBeNull();
    expect(screen.getByRole('img', { name: '4 raised' })).toBeInTheDocument();
    rerender(<NoteLabel label={label} angka accidentalStyle="suffix" />);
    expect(container.textContent).toBe('4♯');
  });
});
