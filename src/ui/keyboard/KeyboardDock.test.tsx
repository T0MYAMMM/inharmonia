import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteStream } from '@/core/input';
import { KeyLights } from '@/state/keyLights';
import { KeyboardDock } from './KeyboardDock';

vi.mock('@/app/services', () => ({
  armAudio: () => () => undefined,
  audio: { unlock: vi.fn(async () => undefined) },
  lights: new KeyLights(),
  notes: new NoteStream(),
}));
vi.mock('@/app/hooks', () => ({
  useComputerKeys: () => 0,
  useActiveInput: () => ({ kind: 'keys' }),
  useTouchOnly: () => false,
  useMidiState: () => ({ status: 'idle', devices: [], selected: 'all', sustain: false }),
}));

describe('KeyboardDock', () => {
  it('shows the words of practice in the legend, where the keys are, only when there are some', () => {
    const { rerender } = render(<KeyboardDock showTarget />);
    expect(screen.queryByTestId('dock-feedback')).toBeNull();
    expect(screen.getByText('Right hand, target')).toBeInTheDocument();
    rerender(<KeyboardDock showTarget feedback="Not quite: play D, the amber key." />);
    expect(screen.getByTestId('dock-feedback')).toHaveTextContent(
      'Not quite: play D, the amber key.',
    );
    // The dock's line is for the eyes; the player's live region says it.
    expect(screen.getByTestId('dock-feedback')).not.toHaveAttribute('role');
  });
});
