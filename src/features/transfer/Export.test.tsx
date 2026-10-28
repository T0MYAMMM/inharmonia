import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExportResult } from '@/state/transfer';
import { ExportMenu } from './Export';

const result: ExportResult = {
  text: '{}',
  fileName: 'inharmonia-song.json',
  items: 1,
  recordings: 0,
};

describe('ExportMenu', () => {
  it('offers the JSON, and the .mid when there is one', async () => {
    const user = userEvent.setup();
    const midi = vi.fn();
    render(
      <ExportMenu
        build={async () => result}
        midi={{ download: midi, testId: 'song-midi-export' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Download .json',
      'Copy as JSON',
      'Download .mid',
    ]);
    await user.click(screen.getByTestId('song-midi-export'));
    expect(midi).toHaveBeenCalledOnce();
  });

  it('says what a copy did in a status that is there from the start', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ExportMenu build={async () => result} />);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.queryByText('Download .mid')).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Copy as JSON' }));
    expect(writeText).toHaveBeenCalledWith('{}');
    expect(await screen.findByText('Copied as JSON')).toBe(status);
    vi.unstubAllGlobals();
  });
});
