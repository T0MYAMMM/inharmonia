import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportControls } from './Import';

const drop = (target: HTMLElement, file: File) =>
  fireEvent.drop(target, { dataTransfer: { files: [file], items: [{ kind: 'file' }] } });

function renderImport() {
  render(<ImportControls>{(buttons) => <div data-testid="area">{buttons}</div>}</ImportControls>);
  return screen.getByTestId('area').parentElement!;
}

describe('ImportControls', () => {
  it('refuses a dropped file that is not an export, in its status', () => {
    const area = renderImport();
    drop(area, new File(['C G Am F'], 'chords.txt', { type: 'text/plain' }));
    expect(screen.getByTestId('import-result')).toHaveTextContent(
      "That isn't an Inharmonia export. Choose a .json file.",
    );
  });

  it('previews a dropped export', async () => {
    // jsdom has no showModal: stand in one for the preview dialog.
    const showModal = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      value: showModal,
      configurable: true,
    });
    const area = renderImport();
    drop(area, new File(['{}'], 'inharmonia.json', { type: 'application/json' }));
    await waitFor(() => expect(showModal).toHaveBeenCalledOnce());
    expect(screen.getByTestId('import-result')).toBeEmptyDOMElement();
    delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  });

  it('stays highlighted while a drag crosses its own contents', () => {
    const area = renderImport();
    fireEvent.dragOver(area, { dataTransfer: { items: [{ kind: 'file' }] } });
    expect(area).toHaveAttribute('data-over', 'true');
    const ontoChild = createEvent.dragLeave(area);
    Object.defineProperty(ontoChild, 'relatedTarget', { value: screen.getByTestId('area') });
    fireEvent(area, ontoChild);
    expect(area).toHaveAttribute('data-over', 'true');
    fireEvent.dragLeave(area);
    expect(area).not.toHaveAttribute('data-over');
  });
});
