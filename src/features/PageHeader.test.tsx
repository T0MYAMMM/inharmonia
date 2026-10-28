import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('puts the way up, the title, the lede and the actions in that order', () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader
          crumb={{ to: '/songs', label: 'Songs' }}
          title="Harbour lights"
          lede="C major, 4/4, 20 bars"
          actions={<button type="button">Edit</button>}
        />
      </MemoryRouter>,
    );
    const header = container.querySelector('header')!;
    const parts = [
      screen.getByRole('link', { name: 'Songs' }),
      screen.getByRole('heading', { level: 1, name: 'Harbour lights' }),
      screen.getByText('C major, 4/4, 20 bars'),
      screen.getByRole('button', { name: 'Edit' }),
    ];
    for (const part of parts) expect(header).toContainElement(part);
    for (let i = 1; i < parts.length; i++)
      expect(parts[i - 1]!.compareDocumentPosition(parts[i]!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    expect(screen.getByRole('link', { name: 'Songs' })).toHaveAttribute('href', '/songs');
  });

  it('leaves out what it is not given, and always has one h1', () => {
    const { container } = render(<PageHeader title="Progress" />);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(container.querySelector('header')!.children).toHaveLength(1);
  });

  it('starts the lede with its tags', () => {
    render(<PageHeader title="Harbour lights" tags={<span>Private</span>} lede="C major" />);
    expect(screen.getByText('Private').closest('p')).toHaveTextContent('PrivateC major');
  });

  it('takes a button for a view on the same page, named by its label alone', async () => {
    const onClick = vi.fn();
    render(
      <PageHeader
        crumb={{ onClick, label: 'Back to Studio', testId: 'back' }}
        title="MIDI piano-roll editor"
      />,
    );
    const back = screen.getByRole('button', { name: 'Back to Studio' });
    expect(back).toHaveAttribute('data-testid', 'back');
    await userEvent.setup().click(back);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
