import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WaysIn } from './WaysIn';

const drop = (target: HTMLElement, file: File) =>
  fireEvent.drop(target, { dataTransfer: { files: [file], items: [{ kind: 'file' }] } });

function renderWays() {
  render(<WaysIn onSing={vi.fn()} onNew={vi.fn()} onOpen={vi.fn()} />);
  return screen.getByTestId('studio-open-card');
}

describe('WaysIn', () => {
  it('keeps its live regions in the page before there is anything to say', () => {
    const card = renderWays();
    expect(within(card).getByRole('status')).toBeEmptyDOMElement();
    expect(within(card).getByRole('alert')).toBeEmptyDOMElement();
  });

  it('says in the same status that a dropped file is not MIDI', () => {
    const card = renderWays();
    const status = within(card).getByRole('status');
    drop(card, new File(['{}'], 'notes.json', { type: 'application/json' }));
    expect(status).toHaveTextContent("That isn't a MIDI file.");
  });

  it('says in the same alert that a .mid file could not be read', async () => {
    const card = renderWays();
    const alert = within(card).getByRole('alert');
    drop(card, new File(['not midi at all'], 'broken.mid', { type: 'audio/midi' }));
    expect(await within(alert).findByText(/./)).toBeInTheDocument();
    expect(within(card).getByRole('alert')).toBe(alert);
  });
});
