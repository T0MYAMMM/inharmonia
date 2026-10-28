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
      'C       GChords: C G',
      'la la la lyricLyrics kept: la la la | lyric',
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
    ).toEqual(['la la la', 'lyric']);

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
});
