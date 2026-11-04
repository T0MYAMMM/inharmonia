import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { emptyChart, parseBars, withLyric, type ChordChart } from '@/core/charts';
import { AddLyrics } from './AddLyrics';

// An invented chart and invented words.
const chart = (): ChordChart => ({
  ...emptyChart('Harbour lights'),
  sections: [
    {
      id: 'v',
      label: 'Verse',
      type: 'verse',
      repeat: 1,
      bars: parseBars('| C | G | Am | F |', 4).bars,
    },
    {
      id: 'i',
      label: 'Interlude',
      type: 'interlude',
      repeat: 1,
      bars: parseBars('| Dm | E |', 4).bars,
    },
  ],
  form: ['v', 'i', 'v'],
});

// Two semitones up, verse 1 and verse 2.
const SHEET = [
  '[Verse]',
  'D              A',
  'paper lanterns drift along',
  'Bm             G',
  'over water slow and long',
  'a line with no chords over it',
  '[Verse 2]',
  'D              A',
  'morning gulls above the pier',
  'Bm             G',
  'calling out the year is here',
].join('\n');

function renderPanel(initial = chart()) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(<AddLyrics chart={initial} newId={() => 'v2'} onApply={onApply} onCancel={onCancel} />);
  // Typed text with brackets is slow to type and means something to user-event: set it.
  const paste = (text: string) =>
    fireEvent.change(screen.getByRole('textbox', { name: 'Chord sheet with lyrics' }), {
      target: { value: text },
    });
  return { onApply, onCancel, paste };
}

describe('AddLyrics', () => {
  it('reads the sheet and previews each section’s bars with their words', async () => {
    const user = userEvent.setup();
    const { paste } = renderPanel();
    const box = screen.getByRole('textbox', { name: 'Chord sheet with lyrics' });
    expect(box).toHaveFocus();
    expect(box).toHaveAccessibleDescription(
      'Kept with the bars they sit under, on this device only. The pasted text is not saved.',
    );
    const status = screen.getByTestId('lyrics-summary');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toBeEmptyDOMElement();
    paste(SHEET);
    await user.click(screen.getByTestId('lyrics-read'));

    expect(screen.getByTestId('lyrics-summary')).toBe(status);
    expect(status).toHaveTextContent('Lyrics for 8 of 10 bars · sheet is 2 semitones up');
    expect(screen.getByRole('heading', { name: 'What each bar would get' })).toHaveFocus();
    expect(screen.getByText('Verse 2 is Verse again, with its own words.')).toBeVisible();
    expect(screen.getByText('Words on line 6 found no chord and are left out.')).toBeVisible();
    expect(screen.getByText('No words for Interlude.')).toBeVisible();

    const verse = screen.getByRole('region', { name: 'Verse with lyrics' });
    expect(verse).toHaveTextContent('4 of 4 chords matched');
    expect(
      within(verse)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1Cpaper lanterns', '2Gdrift along', '3Amover water slow', '4Fand long']);
    const copy = screen.getByRole('region', { name: 'Verse 2 with lyrics' });
    expect(copy).toHaveTextContent('A copy of Verse. 4 of 4 chords matched');
    const bridge = screen.getByRole('region', { name: 'Interlude with lyrics' });
    expect(
      within(bridge)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1DmNo wordsNot matched', '2ENo wordsNot matched']);
  });

  it('applies the words and the copy, the chords as they were', async () => {
    const user = userEvent.setup();
    const { onApply, paste } = renderPanel();
    paste(SHEET);
    await user.click(screen.getByTestId('lyrics-read'));
    await user.click(screen.getByTestId('lyrics-apply'));
    const parts = onApply.mock.calls[0]![0] as Pick<ChordChart, 'sections' | 'form'>;
    expect(parts.form).toEqual(['v', 'i', 'v2']);
    expect(parts.sections.map((s) => s.label)).toEqual(['Verse', 'Verse 2', 'Interlude']);
    expect(parts.sections[1]!.bars.map((b) => b.lyric)).toEqual([
      'morning gulls',
      'above the pier',
      'calling out the',
      'year is here',
    ]);
    expect(parts.sections.map((s) => s.bars.map((b) => b.chords))).toEqual([
      chart().sections[0]!.bars.map((b) => b.chords),
      chart().sections[0]!.bars.map((b) => b.chords),
      chart().sections[1]!.bars.map((b) => b.chords),
    ]);
  });

  it('goes back to the text as it was, and Cancel closes', async () => {
    const user = userEvent.setup();
    const { onCancel, paste } = renderPanel();
    paste(SHEET);
    await user.click(screen.getByTestId('lyrics-read'));
    await user.click(screen.getByTestId('lyrics-back'));
    const box = screen.getByRole('textbox', { name: 'Chord sheet with lyrics' });
    expect(box).toHaveValue(SHEET);
    expect(box).toHaveFocus();
    expect(screen.getByTestId('lyrics-summary')).toBeEmptyDOMElement();
    await user.click(screen.getByTestId('lyrics-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('asks before replacing the lyrics a chart has', async () => {
    const user = userEvent.setup();
    const sung = chart();
    sung.sections[0]!.bars[0] = withLyric(sung.sections[0]!.bars[0]!, 'words typed before');
    const { onApply, paste } = renderPanel(sung);
    paste(SHEET);
    await user.click(screen.getByTestId('lyrics-read'));
    await user.click(screen.getByTestId('lyrics-apply'));
    const ask = screen.getByRole('group', {
      name: 'This chart has lyrics. Replace them with these?',
    });
    expect(within(ask).getByRole('button', { name: 'Replace them' })).toHaveFocus();
    await user.click(within(ask).getByRole('button', { name: 'Keep them' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByTestId('lyrics-apply')).toHaveFocus();
    await user.click(screen.getByTestId('lyrics-apply'));
    await user.click(screen.getByTestId('lyrics-replace'));
    const parts = onApply.mock.calls[0]![0] as Pick<ChordChart, 'sections'>;
    expect(parts.sections[0]!.bars[0]!.lyric).toBe('paper lanterns');
  });

  it('says when a sheet has no lyrics, and offers nothing to apply', async () => {
    const user = userEvent.setup();
    const { paste } = renderPanel();
    paste('| C | G | Am | F |');
    await user.click(screen.getByTestId('lyrics-read'));
    expect(screen.getByTestId('lyrics-summary')).toHaveTextContent(
      'No lyrics found under the chords: nothing would change.',
    );
    expect(screen.getByTestId('lyrics-apply')).toBeDisabled();
  });

  it('shows the words as text, never as markup', async () => {
    const user = userEvent.setup();
    const { paste } = renderPanel();
    paste('C              G\n<img src=x onerror="alert(1)"> drift along');
    await user.click(screen.getByTestId('lyrics-read'));
    expect(screen.getByTestId('lyrics-preview')).toHaveTextContent('<img src=x');
    expect(document.querySelector('img')).toBeNull();
  });
});
