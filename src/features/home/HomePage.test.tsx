import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProgress, recordAttempt } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { HomePage } from './HomePage';

const fake = vi.hoisted(() => ({ touchOnly: false }));
vi.mock('@/app/hooks', () => ({ useTouchOnly: () => fake.touchOnly }));

const open = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

beforeEach(() => {
  fake.touchOnly = false;
  clearProgress();
  useSettings.getState().set({ welcomeDismissed: false });
});

describe('HomePage, the first visit', () => {
  it('puts the way in before the steps, and names the computer keys on a desktop', () => {
    const { container } = open();
    const start = screen.getByRole('link', { name: 'Start with Twinkle, Twinkle' });
    const steps = screen.getByText('Find the keys.').closest('ol')!;
    expect(start.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(steps).toHaveTextContent(
      "Click the piano at the foot of every practice page, or use your computer keyboard: A to ' play C4 to F5.",
    );
    expect(container.querySelectorAll('svg text').length).toBeGreaterThan(0);
  });

  it('on a touch-only phone, tells the player to tap the piano and draws the keys without letters', () => {
    fake.touchOnly = true;
    const { container } = open();
    expect(screen.getByText('Find the keys.').closest('li')).toHaveTextContent(
      'Tap the piano at the foot of every practice page, or plug in a MIDI keyboard and connect it there.',
    );
    expect(screen.queryByText(/computer keyboard/)).toBeNull();
    expect(container.querySelectorAll('svg text')).toHaveLength(0);
  });

  it('explains voicings, inversions and comping on the room cards', () => {
    open();
    expect(screen.getByText(/inversions and voicings/)).toBeInTheDocument();
    expect(screen.getByText(/the left hand's accompaniment/)).toBeInTheDocument();
    expect(screen.queryByText(/streak/)).toBeNull();
  });
});

describe('HomePage, after practising', () => {
  it('says how many of the last seven days were practised, never a run', () => {
    recordAttempt('twinkle-twinkle-easy', { hits: 6, misses: 0 });
    open();
    expect(screen.getByText(/Practised 1 of the last 7 days\./)).toBeInTheDocument();
    expect(screen.queryByText(/in a row/)).toBeNull();
    expect(screen.queryByText('New here?')).toBeNull();
  });
});
