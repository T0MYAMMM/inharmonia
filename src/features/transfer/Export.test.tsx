import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExportResult } from '@/state/transfer';
import { ExportDialog, ExportMenu } from './Export';

const result: ExportResult = {
  text: '{}',
  fileName: 'inharmonia-song.json',
  items: 1,
  recordings: 0,
  lyrics: { included: 0, leftOut: 0 },
};

/** What exportItems says of one chart with lyrics: left out, or included when asked. */
const chartBuild = () =>
  vi.fn(async (include: boolean) => ({
    ...result,
    fileName: 'inharmonia-chart-harbour-lights.json',
    lyrics: include ? { included: 1, leftOut: 0 } : { included: 0, leftOut: 1 },
  }));

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

describe('Include lyrics', () => {
  it('is offered for a chart with lyrics, unticked each time the menu opens', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    const build = chartBuild();
    render(<ExportMenu build={build} lyrics />);
    const menu = screen.getByRole('button', { name: 'Export' });
    await user.click(menu);
    const tick = screen.getByRole('menuitemcheckbox', { name: 'Include lyrics' });
    expect(tick).toHaveAttribute('aria-checked', 'false');
    expect(tick).toHaveAccessibleDescription('Left out: lyrics stay on this device.');
    await user.click(screen.getByRole('menuitem', { name: 'Download .json' }));
    expect(build).toHaveBeenLastCalledWith(false);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved inharmonia-chart-harbour-lights.json. Lyrics left out.',
    );

    await user.click(menu);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Include lyrics' }));
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Include lyrics' }),
    ).toHaveAccessibleDescription('In the file: keep it to yourself.');
    await user.click(screen.getByRole('menuitem', { name: 'Download .json' }));
    expect(build).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved inharmonia-chart-harbour-lights.json, with lyrics.',
    );

    // Opened again, by click or by key: left out again.
    await user.click(menu);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Include lyrics' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await user.keyboard('{End} {Escape}{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Include lyrics' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    vi.unstubAllGlobals();
  });

  it('is not offered when there are no lyrics', async () => {
    const user = userEvent.setup();
    render(<ExportMenu build={async () => result} />);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.queryByRole('menuitemcheckbox')).toBeNull();
  });

  it('is a box in the export dialog when a chosen chart has lyrics, off each time it opens', async () => {
    const user = userEvent.setup();
    // jsdom has no showModal: one that opens the dialog.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
      configurable: true,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const build = vi.fn(async (_keys: ReadonlySet<string>, _rec: boolean, lyrics: boolean) => ({
      ...result,
      items: 2,
      lyrics: lyrics ? { included: 1, leftOut: 0 } : { included: 0, leftOut: 1 },
    }));
    render(
      <ExportDialog
        candidates={[
          { key: 'a', kind: 'chart', title: 'Harbour lights', lyrics: true },
          { key: 'b', kind: 'chart', title: 'No words' },
        ]}
        build={build}
      />,
    );
    await user.click(screen.getByTestId('export-open'));
    const box = screen.getByRole('checkbox', { name: 'Include lyrics (1 chart)' });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      'Left out unless you tick this: lyrics stay on this device.',
    );
    await user.click(screen.getByTestId('export-copy'));
    expect(build.mock.calls.at(-1)![2]).toBe(false);
    expect(screen.getByTestId('export-status')).toHaveTextContent(
      'Copied 2 items as JSON. Lyrics left out of 1 chart.',
    );
    await user.click(box);
    await user.click(screen.getByTestId('export-copy'));
    expect(build.mock.calls.at(-1)![2]).toBe(true);
    expect(screen.getByTestId('export-status')).toHaveTextContent(
      'Copied 2 items as JSON. Lyrics included for 1 chart.',
    );
    // Without the chart that has them, there is nothing to include.
    await user.click(screen.getByRole('checkbox', { name: /Harbour lights/ }));
    expect(screen.queryByRole('checkbox', { name: /Include lyrics/ })).toBeNull();
    await user.click(screen.getByTestId('export-open'));
    expect(screen.getByRole('checkbox', { name: 'Include lyrics (1 chart)' })).not.toBeChecked();
    vi.unstubAllGlobals();
    delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  });
});
