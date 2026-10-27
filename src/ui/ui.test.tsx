import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NoteStream } from '@/core/input';
import { formatNote } from '@/core/notation';
import { spelled } from '@/core/theory';
import { KeyLights } from '@/state/keyLights';
import { Checkbox, Radio } from './Checkbox';
import { Field } from './Field';
import { FilePicker } from './FilePicker';
import { Keyboard } from './keyboard/Keyboard';
import { DOCK_RANGE, dockRangeFor, isBlack, layoutKeys } from './keyboard/layout';
import { NoteLabel } from './NoteLabel';
import { NumberInput } from './NumberInput';
import { RangeInput } from './RangeInput';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { TextArea } from './TextArea';
import { TextInput } from './TextInput';
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

describe('dock range', () => {
  it('keeps the default range when the notes fit', () => {
    expect(dockRangeFor([35, 76])).toEqual(DOCK_RANGE);
    expect(dockRangeFor([])).toEqual(DOCK_RANGE);
  });

  it('grows to fit a high melody, at least as wide as the default, on white keys', () => {
    const [lo, hi] = dockRangeFor([43, 59, 64, 84]);
    expect(lo).toBeLessThanOrEqual(41);
    expect(hi).toBeGreaterThanOrEqual(86);
    expect(hi - lo).toBeGreaterThanOrEqual(DOCK_RANGE[1] - DOCK_RANGE[0]);
    expect(isBlack(lo) || isBlack(hi)).toBe(false);
  });

  it('widens past the default for a wide piece and stays on the piano', () => {
    expect(dockRangeFor([22, 106])).toEqual([21, 108]);
    const [lo, hi] = dockRangeFor([100, 104]);
    expect(hi).toBeLessThanOrEqual(108);
    expect(hi - lo).toBeGreaterThanOrEqual(49);
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

describe('Segmented with disabled options', () => {
  it('shows them as disabled, ignores clicks and skips them with arrow keys', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [v, setV] = useState<'rh' | 'lh' | 'both' | 'x'>('rh');
      return (
        <>
          <Segmented
            label="Hand"
            value={v}
            onChange={setV}
            describedBy="why"
            options={[
              { value: 'rh', label: 'Right' },
              { value: 'lh', label: 'Left', disabled: true },
              { value: 'both', label: 'Both', disabled: true },
              { value: 'x', label: 'Other' },
            ]}
          />
          <p id="why">Coming later</p>
        </>
      );
    }
    render(<Demo />);
    expect(screen.getByRole('radiogroup', { name: 'Hand' })).toHaveAccessibleDescription(
      'Coming later',
    );
    const left = screen.getByRole('radio', { name: 'Left' });
    expect(left).toHaveAttribute('aria-disabled', 'true');
    await user.click(left);
    expect(screen.getByRole('radio', { name: 'Right' })).toBeChecked();
    screen.getByRole('radio', { name: 'Right' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Other' })).toBeChecked();
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

describe('Field', () => {
  it('labels its control and describes it with the hint and error', () => {
    render(
      <Field label="Name" hint="Up to 40 letters" error="Name is empty">
        <TextInput value="" onChange={() => {}} aria-describedby="more" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAccessibleDescription('Up to 40 letters Name is empty');
    expect(input.getAttribute('aria-describedby')).toMatch(/-hint .*-error more$/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('leaves a control without a hint undescribed and valid', () => {
    render(
      <Field label="Key">
        <Select value="C" onChange={() => {}}>
          <option value="C">C</option>
        </Select>
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Key' });
    expect(select).not.toHaveAttribute('aria-describedby');
    expect(select).not.toHaveAttribute('aria-invalid');
  });

  it('keeps an id and aria-label the caller sets', () => {
    render(
      <Field label="Title" id="title">
        <TextInput aria-label="MIDI title" defaultValue="x" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'MIDI title' })).toHaveAttribute('id', 'title');
  });

  it('names a group around a control that is not an input', () => {
    render(
      <Field label="Meter" group hint="Beats in a bar">
        <button type="button">4/4</button>
      </Field>,
    );
    expect(screen.getByRole('group', { name: 'Meter' })).toHaveAccessibleDescription(
      'Beats in a bar',
    );
  });

  it('labels a textarea and a range', () => {
    render(
      <>
        <Field label="Notes">
          <TextArea defaultValue="" mono />
        </Field>
        <Field label="Zoom">
          <RangeInput value={2} min={1} max={4} onChange={() => {}} />
        </Field>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Zoom' })).toHaveValue('2');
  });
});

describe('Select', () => {
  it('is a native select: changes with the keyboard and by option', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [v, setV] = useState('a');
      return (
        <Field label="Pick">
          <Select value={v} onChange={(e) => setV(e.target.value)} data-testid="pick" size="small">
            <option value="a">A</option>
            <option value="b">B</option>
          </Select>
        </Field>
      );
    }
    render(<Demo />);
    const select = screen.getByTestId('pick');
    await user.selectOptions(select, 'b');
    expect(select).toHaveValue('b');
  });
});

describe('NumberInput', () => {
  function Demo({ onChange = () => {} }: { onChange?: (v: number) => void }) {
    const [v, setV] = useState(90);
    return (
      <Field label="Tempo">
        <NumberInput
          value={v}
          min={20}
          max={300}
          onChange={(n) => {
            setV(n);
            onChange(n);
          }}
        />
      </Field>
    );
  }

  it('shows its range and sends numbers in range as you type', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    render(<Demo onChange={(n) => seen.push(n)} />);
    expect(screen.getByText('20–300')).toBeInTheDocument();
    const input = screen.getByRole('spinbutton', { name: 'Tempo' });
    await user.clear(input);
    await user.type(input, '140');
    // "1" and "14" are below the range: not sent until blur.
    expect(seen).toEqual([140]);
    expect(input).toHaveValue(140);
  });

  it('clamps on blur and on Enter, and puts back a value that is not a number', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const input = screen.getByRole('spinbutton', { name: 'Tempo' });
    await user.clear(input);
    await user.type(input, '999');
    expect(input).toHaveValue(999);
    await user.tab();
    expect(input).toHaveValue(300);
    await user.clear(input);
    await user.type(input, '5{Enter}');
    expect(input).toHaveValue(20);
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(20);
  });

  it('passes its range to the native input', () => {
    render(<Demo />);
    const input = screen.getByRole('spinbutton', { name: 'Tempo' });
    expect(input).toHaveAttribute('min', '20');
    expect(input).toHaveAttribute('max', '300');
  });
});

describe('FilePicker', () => {
  const midi = new File(['MThd'], 'song.mid', { type: 'audio/midi' });

  it('is reached with Tab, named by its button, and shows the chosen file', async () => {
    const user = userEvent.setup();
    const got: File[][] = [];
    render(
      <>
        <button type="button">Before</button>
        <FilePicker accept=".mid,.midi" onFiles={(f) => got.push(f)} data-testid="file">
          Open MIDI file
        </FilePicker>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Before' }));
    await user.tab();
    const input = screen.getByTestId('file');
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleName('Open MIDI file');
    await user.upload(input, midi);
    expect(got).toEqual([[midi]]);
    expect(screen.getByText('song.mid')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('takes a dropped file that matches accept and ignores one that does not', () => {
    const got: File[][] = [];
    render(
      <FilePicker accept=".mid,audio/midi" onFiles={(f) => got.push(f)} buttonTestId="drop">
        Open
      </FilePicker>,
    );
    const target = screen.getByTestId('drop');
    const drop = (file: File) =>
      fireEvent.drop(target, {
        dataTransfer: { files: [file], items: [{ kind: 'file' }] },
      });
    fireEvent.dragOver(target, { dataTransfer: { files: [midi], items: [{ kind: 'file' }] } });
    expect(target).toHaveAttribute('data-over', 'true');
    drop(new File(['{}'], 'notes.json', { type: 'application/json' }));
    expect(got).toEqual([]);
    drop(midi);
    expect(got).toEqual([[midi]]);
    expect(target).not.toHaveAttribute('data-over');
  });

  it('leaves drops to the area around it when asked', () => {
    const got: File[][] = [];
    let dropped = 0;
    render(
      <div onDrop={() => dropped++}>
        <FilePicker onFiles={(f) => got.push(f)} acceptDrop={false} buttonTestId="drop">
          Open
        </FilePicker>
      </div>,
    );
    fireEvent.drop(screen.getByTestId('drop'), {
      dataTransfer: { files: [midi], items: [{ kind: 'file' }] },
    });
    expect(got).toEqual([]);
    expect(dropped).toBe(1);
  });
});

describe('Checkbox and Radio', () => {
  it('report checked state through their labels', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [on, setOn] = useState(false);
      const [pick, setPick] = useState('a');
      return (
        <>
          <Checkbox checked={on} onChange={setOn}>
            Include recordings
          </Checkbox>
          {['a', 'b'].map((v) => (
            <Radio
              key={v}
              name="r"
              checked={pick === v}
              onChange={() => setPick(v)}
              labelProps={{ 'data-testid': `card-${v}` }}
            >
              Option {v}
            </Radio>
          ))}
        </>
      );
    }
    render(<Demo />);
    await user.click(screen.getByText('Include recordings'));
    expect(screen.getByRole('checkbox', { name: 'Include recordings' })).toBeChecked();
    await user.click(screen.getByText('Option b'));
    expect(screen.getByRole('radio', { name: 'Option b' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Option a' })).not.toBeChecked();
    // labelProps land on the label, so a whole card can carry its test id.
    expect(screen.getByTestId('card-b').tagName).toBe('LABEL');
    expect(screen.getByTestId('card-b')).toContainElement(
      screen.getByRole('radio', { name: 'Option b' }),
    );
  });
});
