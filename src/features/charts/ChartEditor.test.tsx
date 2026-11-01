import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { emptyChart, parseBars, withLyric, type ChordChart } from '@/core/charts';
import { ChartEditor } from './ChartEditor';

// An invented chart, with invented words on its first two bars.
const chart = (): ChordChart => {
  const bars = parseBars('| C | G | Am F | F |', 4).bars;
  bars[0] = withLyric(bars[0]!, 'lanterns on the water');
  bars[1] = withLyric(bars[1]!, 'slow boats');
  return {
    ...emptyChart('Harbour lights'),
    sections: [{ id: 'v', label: 'Verse', type: 'verse', repeat: 1, bars }],
    form: ['v'],
  };
};

function renderEditor(initial = chart()) {
  const onSave = vi.fn();
  render(<ChartEditor initial={initial} saving={false} onSave={onSave} />);
  const saved = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByTestId('chart-save'));
    return onSave.mock.calls.at(-1)![0] as ChordChart;
  };
  const lyrics = (c: ChordChart) => c.sections[0]!.bars.map((b) => b.lyric ?? null);
  return { onSave, saved, lyrics };
}

describe('lyrics in the chart editor', () => {
  it("shows each bar's words under its chords, as text", () => {
    const c = chart();
    c.sections[0]!.bars[2] = withLyric(c.sections[0]!.bars[2]!, '<img src=x onerror="alert(1)">');
    renderEditor(c);
    expect(screen.getByTestId('bar-0-0')).toHaveTextContent('1Clanterns on the water');
    expect(screen.getByTestId('bar-0-2')).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(document.querySelector('img')).toBeNull();
    expect(within(screen.getByTestId('bar-0-3')).queryByTestId('bar-lyric')).toBeNull();
  });

  it('types them bar by bar, Enter going on to the next bar', async () => {
    const user = userEvent.setup();
    const { saved, lyrics } = renderEditor();
    await user.click(screen.getByTestId('bar-0-2'));
    const field = screen.getByRole('textbox', { name: 'Lyrics' });
    expect(field).toHaveAccessibleDescription(
      'Enter goes to the next bar. Kept on this device only.',
    );
    await user.type(field, '  coming   home {enter}');
    // Bar 4 is chosen, its lyrics ready to type.
    expect(screen.getByTestId('bar-0-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Lyrics' })).toHaveAccessibleDescription(
      'Kept on this device only.',
    );
    await user.type(screen.getByRole('textbox', { name: 'Lyrics' }), 'home again{enter}');
    // Saved evened out, one line each.
    expect(lyrics(await saved(user))).toEqual([
      'lanterns on the water',
      'slow boats',
      'coming home',
      'home again',
    ]);
  });

  it('keeps them through every change to the chords, and clears them when emptied', async () => {
    const user = userEvent.setup();
    const { saved, lyrics } = renderEditor();
    await user.click(screen.getByTestId('bar-0-0'));
    const editor = screen.getByTestId('bar-editor');
    await user.clear(within(editor).getByTestId('chord-input-0'));
    await user.type(within(editor).getByTestId('chord-input-0'), 'Cmaj7');
    await user.selectOptions(
      within(editor).getByRole('combobox', { name: 'Chords in the bar' }),
      '2',
    );
    await user.selectOptions(within(editor).getAllByRole('combobox', { name: 'Beats' })[0]!, '3');
    await user.selectOptions(within(editor).getAllByRole('combobox', { name: 'Beats' })[1]!, '1');
    await user.click(within(editor).getAllByRole('button', { name: 'N.C.' })[1]!);
    await user.click(screen.getByRole('radio', { name: '3/4' }));
    await user.click(screen.getByRole('radio', { name: '4/4' }));
    const after = await saved(user);
    expect(lyrics(after)).toEqual(['lanterns on the water', 'slow boats', null, null]);
    expect(after.sections[0]!.bars[0]!.chords.map((c) => c.symbol)).toEqual(['Cmaj7', 'N.C.']);

    await user.click(screen.getByTestId('bar-0-1'));
    await user.clear(screen.getByRole('textbox', { name: 'Lyrics' }));
    expect(lyrics(await saved(user))).toEqual(['lanterns on the water', null, null, null]);
  });

  it("copies a bar's chords, not its words", async () => {
    const user = userEvent.setup();
    const { saved, lyrics } = renderEditor();
    await user.click(screen.getByTestId('bar-0-0'));
    await user.click(screen.getByRole('button', { name: 'Copy after' }));
    const after = await saved(user);
    expect(lyrics(after)).toEqual(['lanterns on the water', null, 'slow boats', null, null]);
    expect(after.sections[0]!.bars[1]!.chords).toEqual(after.sections[0]!.bars[0]!.chords);
  });

  it('keeps them by bar number through Edit as text, and says which would go', async () => {
    const user = userEvent.setup();
    const { saved, lyrics } = renderEditor();
    await user.click(screen.getByTestId('edit-text-0'));
    const note = screen.getByTestId('bars-text-lyrics');
    expect(note).toHaveTextContent('Lyrics stay with their bar number.');
    const text = screen.getByRole('textbox', { name: 'Bars as text' });
    await user.clear(text);
    await user.type(text, '| Dm |');
    expect(note).toHaveTextContent(
      'Lyrics stay with their bar number. Bar 2 has lyrics; using 1 bar drops them.',
    );
    await user.clear(text);
    await user.type(text, '| F | Dm | G |');
    expect(note).toHaveTextContent(/^Lyrics stay with their bar number\.$/);
    await user.click(screen.getByTestId('bars-apply'));
    const after = await saved(user);
    expect(after.sections[0]!.bars.map((b) => b.chords[0]!.symbol)).toEqual(['F', 'Dm', 'G']);
    expect(lyrics(after)).toEqual(['lanterns on the water', 'slow boats', null]);
  });

  it('says nothing about lyrics in Edit as text when the section has none', async () => {
    const user = userEvent.setup();
    const c = chart();
    c.sections[0]!.bars = c.sections[0]!.bars.map((b) => withLyric(b, undefined));
    renderEditor(c);
    await user.click(screen.getByTestId('edit-text-0'));
    expect(screen.queryByTestId('bars-text-lyrics')).toBeNull();
  });
});
