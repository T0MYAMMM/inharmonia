import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasteSheet } from './PasteSheet';

describe('PasteSheet', () => {
  it('says what reading removed in a status that was there before', async () => {
    const user = userEvent.setup();
    render(
      <PasteSheet
        beatsPerBar={4}
        hasSections={false}
        newId={() => 'id'}
        onUse={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const status = screen.getByTestId('lyrics-notice');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toBeEmptyDOMElement();
    await user.type(screen.getByRole('textbox', { name: 'Chord sheet' }), 'C G{enter}la la la');
    await user.click(screen.getByTestId('paste-read'));
    expect(screen.getByTestId('lyrics-notice')).toBe(status);
    expect(status).toHaveTextContent('Lyrics removed from 1 line.');
  });
});
