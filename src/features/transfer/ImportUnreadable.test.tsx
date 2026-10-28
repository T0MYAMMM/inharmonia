import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as Format from '@/core/format';
import { ImportControls } from './Import';

vi.mock('@/core/format', async (original) => ({
  ...(await original<typeof Format>()),
  parseFile: () => {
    throw new Error('something gave way');
  },
}));

describe('ImportControls, when reading a file throws', () => {
  it('opens the preview and says so, rather than doing nothing', async () => {
    const showModal = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      value: showModal,
      configurable: true,
    });
    render(<ImportControls>{(buttons) => <div data-testid="area">{buttons}</div>}</ImportControls>);
    fireEvent.drop(screen.getByTestId('area').parentElement!, {
      dataTransfer: {
        files: [new File(['{}'], 'inharmonia.json', { type: 'application/json' })],
        items: [{ kind: 'file' }],
      },
    });
    await waitFor(() => expect(showModal).toHaveBeenCalledOnce());
    expect(screen.getByTestId('import-preview')).toHaveTextContent(
      "This file couldn't be read: something gave way",
    );
    expect(screen.getByTestId('import-confirm')).toBeDisabled();
    delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  });
});
