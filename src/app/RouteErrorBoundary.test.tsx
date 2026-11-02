import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyPage } from './lazyPage';
import { RouteErrorBoundary } from './RouteErrorBoundary';

function Broken(): never {
  throw new Error('Failed to fetch dynamically imported module');
}

function renderAt(resetKey: string, page: React.ReactNode) {
  return render(
    <MemoryRouter>
      <RouteErrorBoundary resetKey={resetKey}>
        <Suspense fallback={<div aria-busy="true" data-testid="pending" />}>{page}</Suspense>
      </RouteErrorBoundary>
    </MemoryRouter>,
  );
}

describe('RouteErrorBoundary', () => {
  const reload = vi.fn();
  const original = window.location;
  // React and jsdom report caught render errors; these tests expect them.
  const quiet = (e: ErrorEvent) => e.preventDefault();

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.addEventListener('error', quiet);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });
  });

  afterEach(() => {
    window.removeEventListener('error', quiet);
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    vi.restoreAllMocks();
    reload.mockReset();
  });

  it('says the page did not load, as an alert, and reloads from its button', async () => {
    const user = userEvent.setup();
    renderAt('/songs', <Broken />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("This page didn't load.");
    expect(alert).toHaveTextContent('Check your connection, then reload.');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("This page didn't load.");
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('catches a lazy page whose code fails to load', async () => {
    const Page = lazyPage(
      () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      'Page',
    );
    renderAt('/chords', <Page />);
    expect(await screen.findByRole('alert')).toHaveTextContent("This page didn't load.");
  });

  it('gives the next page a fresh try', () => {
    const { rerender } = renderAt('/songs', <Broken />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <RouteErrorBoundary resetKey="/chords">
          <p>Chords</p>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Chords')).toBeInTheDocument();
  });
});

describe('lazyPage', () => {
  it('renders the named export once its module loads', async () => {
    const Page = lazyPage(async () => ({ HelloPage: () => <h1>Hello</h1> }), 'HelloPage');
    renderAt('/', <Page />);
    expect(screen.getByTestId('pending')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  });

  it('stays loading while a failed chunk reloads the page', async () => {
    // What Vite's import gives once vite:preloadError has been answered with a reload.
    const load = vi.fn(async () => undefined as unknown as { Page: () => null });
    const Page = lazyPage(load, 'Page');
    renderAt('/', <Page />);
    await waitFor(() => expect(load).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('pending')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
