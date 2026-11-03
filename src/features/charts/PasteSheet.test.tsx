import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasteSheet } from './PasteSheet';

const renderPaste = (onUse = vi.fn()) =>
  render(
    <PasteSheet
      beatsPerBar={4}
      hasSections={false}
      newId={() => 'id'}
      onUse={onUse}
      onCancel={vi.fn()}
    />,
  );

describe('PasteSheet', () => {
  it('says what reading removed in a status that was there before', async () => {
    const user = userEvent.setup();
    renderPaste();
    const status = screen.getByTestId('lyrics-notice');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toBeEmptyDOMElement();
    await user.type(screen.getByRole('textbox', { name: 'Chord sheet' }), 'C G{enter}la la la');
    await user.click(screen.getByTestId('paste-read'));
    expect(screen.getByTestId('lyrics-notice')).toBe(status);
    expect(status).toHaveTextContent('Lyrics removed from 1 line.');
  });

  it('keeps lyrics only when ticked, says where, and starts unticked every time', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    const { unmount } = renderPaste(onUse);
    const keep = screen.getByRole('checkbox', { name: 'Keep lyrics' });
    expect(keep).not.toBeChecked();
    expect(keep).toHaveAccessibleDescription('With the bars they sit under, on this device only.');
    await user.type(
      screen.getByRole('textbox', { name: 'Chord sheet' }),
      'C       G{enter}la la la lyric{enter}placeholder',
    );
    await user.click(keep);
    await user.click(screen.getByTestId('paste-read'));
    const status = screen.getByTestId('lyrics-notice');
    expect(status).toHaveTextContent(
      'Lyrics kept from 1 line, on this device only. 1 line left out: lyrics are kept only right under their chords.',
    );
    // The notice never repeats the words; the table shows how they will sit.
    expect(status).not.toHaveTextContent(/la la|placeholder/);
    const rows = within(screen.getByTestId('paste-review')).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'You pastedRead as',
      'C       GBars: | C | C G | G | G | (rough)Estimated1 a bar2 a bar',
      'la la la lyricLyrics kept: la la la | lyric | – | –',
      'placeholderLeft out: no chords right above it',
    ]);

    // Unticking reads the sheet again, as it always was.
    await user.click(keep);
    expect(status).toHaveTextContent(
      'Lyrics removed from 2 lines. Only chords and section names are kept.',
    );
    await user.click(keep);
    await user.click(screen.getByTestId('paste-use'));
    expect(
      onUse.mock.calls[0]![0].sections[0].bars.map((b: { lyric?: string }) => b.lyric),
    ).toEqual(['la la la', 'lyric', undefined, undefined]);

    unmount();
    renderPaste();
    expect(screen.getByRole('checkbox', { name: 'Keep lyrics' })).not.toBeChecked();
  });

  it('says in the row when words were cut to 120 characters a bar', async () => {
    const user = userEvent.setup();
    renderPaste();
    const long = Array.from({ length: 30 }, () => 'lyric').join(' ');
    await user.click(screen.getByRole('checkbox', { name: 'Keep lyrics' }));
    await user.type(screen.getByRole('textbox', { name: 'Chord sheet' }), `C   G{enter}${long}`);
    await user.click(screen.getByTestId('paste-read'));
    const row = within(screen.getByTestId('paste-review')).getAllByRole('row')[2]!;
    expect(row).toHaveTextContent(/\(cut to 120 characters a bar\)$/);
  });

  it('estimates bars from the lyrics, says so, and reads a line one or two a bar when asked', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    renderPaste(onUse);
    await user.type(
      screen.getByRole('textbox', { name: 'Chord sheet' }),
      'C          G{enter}la la la lyric line here, la la',
    );
    await user.click(screen.getByTestId('paste-read'));
    const group = screen.getByRole('radiogroup', { name: 'Bar lengths, line 1' });
    expect(within(group).getByRole('radio', { name: 'Estimated' })).toBeChecked();
    expect(screen.getByTestId('read-1')).toHaveTextContent(/^Bars: \| C \| C G \| G \| G \|/);
    expect(screen.getByTestId('estimate-note')).toHaveTextContent(
      'Bar lengths are estimated from the lyrics. Check them by ear.',
    );
    // The words were only read for timing.
    expect(screen.getByTestId('lyrics-notice')).toHaveTextContent('Lyrics removed from 1 line.');

    await user.click(within(group).getByRole('radio', { name: '1 a bar' }));
    expect(screen.getByTestId('read-1')).toHaveTextContent(/^Bars: \| C \| G \|/);
    expect(screen.queryByTestId('estimate-note')).toBeNull();
    await user.click(within(group).getByRole('radio', { name: '2 a bar' }));
    expect(screen.getByTestId('read-1')).toHaveTextContent(/^Bars: \| C G \|/);

    // Arrow keys move along the choices, like radios.
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(within(group).getByRole('radio', { name: 'Estimated' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Estimated' })).toHaveFocus();
    await user.click(screen.getByTestId('paste-use'));
    const bars = onUse.mock.calls[0]![0].sections[0].bars as { chords: { symbol: string }[] }[];
    expect(bars.map((b) => b.chords.map((c) => c.symbol).join(' '))).toEqual([
      'C',
      'C G',
      'G',
      'G',
    ]);
  });

  it('offers one or two a bar on a busy line with no lyrics, and nothing on a plain one', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    renderPaste(onUse);
    await user.type(
      screen.getByRole('textbox', { name: 'Chord sheet' }),
      'C G Am F C G Am F{enter}{enter}C   G   Am',
    );
    await user.click(screen.getByTestId('paste-read'));
    const group = screen.getByRole('radiogroup', { name: 'Bar lengths, line 1' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['1 a bar', '2 a bar']);
    expect(within(group).getByRole('radio', { name: '1 a bar' })).toBeChecked();
    expect(screen.queryByRole('radiogroup', { name: 'Bar lengths, line 3' })).toBeNull();
    expect(screen.queryByTestId('estimate-note')).toBeNull();
    await user.click(within(group).getByRole('radio', { name: '2 a bar' }));
    expect(screen.getByTestId('read-1')).toHaveTextContent('Bars: | C G | Am F | C G | Am F |');
    await user.click(screen.getByTestId('paste-use'));
    expect(onUse.mock.calls[0]![0].sections[0].bars).toHaveLength(7);
  });

  it('starts every line on its default again when the sheet is read again', async () => {
    const user = userEvent.setup();
    renderPaste();
    await user.type(
      screen.getByRole('textbox', { name: 'Chord sheet' }),
      'C       G{enter}la la la',
    );
    await user.click(screen.getByTestId('paste-read'));
    await user.click(screen.getByRole('radio', { name: '1 a bar' }));
    await user.click(screen.getByRole('button', { name: 'Back to the text' }));
    await user.click(screen.getByTestId('paste-read'));
    expect(screen.getByRole('radio', { name: 'Estimated' })).toBeChecked();
  });
});
