import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProgress, recordAttempt } from '@/state/progress';
import { ProgressPage } from './ProgressPage';

const open = () =>
  render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  clearProgress();
  // The page lists the catalogue's songs too; here there is no catalogue to fetch.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
});

describe('ProgressPage', () => {
  it('offers somewhere to start before anything is practised', () => {
    open();
    expect(screen.getByText(/Nothing practised yet/)).toBeInTheDocument();
    expect(screen.getByText('Somewhere to start')).toBeInTheDocument();
  });

  it('counts the last seven days, with no run to keep alive', () => {
    recordAttempt('twinkle-twinkle-easy', { hits: 6, misses: 0 });
    open();
    expect(screen.getByText('1 of 7')).toBeInTheDocument();
    expect(screen.getByText('days practised, of the last seven')).toBeInTheDocument();
    expect(screen.queryByText(/in a row/)).toBeNull();
    expect(screen.getByRole('list', { name: 'The last seven days' })).toBeInTheDocument();
  });
});
