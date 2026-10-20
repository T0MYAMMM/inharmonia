import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compileLesson } from '@/core/content/compile';
import { DEFAULT_RULES, LESSON_SCHEMA_VERSION, type Lesson } from '@/core/content/types';
import { PATTERNS } from '@/content/patterns';
import { Score, type ScoreProps } from './Score';
import { barDensity } from './scoreLayout';

function lesson(level: 'easy' | 'advanced'): Lesson {
  const bar = (notes: number, section?: string) => ({
    ...(section ? { section } : {}),
    chords: [{ symbol: 'C', beats: 4 }],
    rh: Array.from({ length: notes }, (_, i) => ({
      note: i % 2 ? 'G4' : 'E4',
      beats: 4 / notes,
    })),
  });
  return {
    id: 'density-' + level,
    schemaVersion: LESSON_SCHEMA_VERSION,
    kind: 'song',
    title: 'Density test',
    source: { kind: 'original', author: 'Test' },
    piece: 'density-test',
    level,
    key: { tonic: 'C', mode: 'major' },
    meter: { beats: 4, unit: 4 },
    tempo: { default: 80, min: 40, max: 120 },
    lhPattern: 'held',
    rules: DEFAULT_RULES,
    bars: [bar(4, 'Opening'), bar(8, 'Variations'), bar(16)],
  };
}

function props(level: 'easy' | 'advanced', onSelectBar = vi.fn()): ScoreProps {
  return {
    compiled: compileLesson(lesson(level), PATTERNS),
    notation: 'letter',
    accidentalStyle: 'slash',
    mode: 'listen',
    currentBar: 0,
    activeChipId: null,
    targetChipId: null,
    targetChordId: null,
    targetBeat: 0,
    onSelectBar,
  };
}

describe('adaptive score layout', () => {
  it('spans medium-density bars and summarizes dense bars in Overview', () => {
    const p = props('easy');
    expect(p.compiled.bars.map(barDensity)).toEqual(['normal', 'wide', 'dense']);
    const { container } = render(<Score {...p} />);
    expect(container.firstElementChild).toHaveAttribute('data-score-view', 'overview');
    expect(container.querySelector('[data-bar="1"]')).toHaveAttribute('data-density', 'wide');
    expect(container.querySelector('[data-bar="2"]')).toHaveAttribute('data-density', 'dense');
    expect(screen.getByTestId('dense-summary')).toHaveTextContent('16 notes');
  });

  it('defaults dense Advanced songs to Follow Along with unsqueezed note widths', () => {
    const { container } = render(<Score {...props('advanced')} />);
    expect(container.firstElementChild).toHaveAttribute('data-score-view', 'follow');
    expect(container.querySelectorAll('[data-chip]')).toHaveLength(4);
    const firstSlot = container.querySelector('[data-note-slot]') as HTMLElement;
    expect(firstSlot.style.width).toBe('64px');
    fireEvent.change(screen.getByRole('slider', { name: 'Note size' }), {
      target: { value: '150' },
    });
    expect(firstSlot.style.width).toBe('96px');
  });

  it('switches modes without affecting transport and browses sections and measures', () => {
    const onSelectBar = vi.fn();
    const p = props('advanced', onSelectBar);
    const { container, rerender } = render(<Score {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next bar' }));
    expect(onSelectBar).toHaveBeenLastCalledWith(1);
    rerender(<Score {...p} currentBar={1} />);
    expect(container.querySelector('[data-bar="1"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-chip]')).toHaveLength(8);
    fireEvent.change(screen.getByRole('combobox', { name: 'Jump to section' }), {
      target: { value: '0' },
    });
    expect(onSelectBar).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole('radio', { name: 'Overview' }));
    expect(container.firstElementChild).toHaveAttribute('data-score-view', 'overview');
    expect(screen.getAllByTestId('dense-summary')).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Follow Along' }));
    expect(container.querySelectorAll('[data-chip]')).toHaveLength(8);
  });

  it('offers Falling Notes with hand focus and a selectable look-ahead without replaying the song', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try {
      const p = props('easy');
      const { container, rerender } = render(<Score {...p} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Falling Notes' }));
      expect(container.firstElementChild).toHaveAttribute('data-score-view', 'falling');
      expect(screen.getByTestId('falling-notes')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Falling piano notes/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next bar' })).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole('combobox', { name: 'Displayed hands' }), {
        target: { value: 'lh' },
      });
      expect(screen.getByRole('combobox', { name: 'Displayed hands' })).toHaveValue('lh');
      fireEvent.change(screen.getByRole('combobox', { name: 'Look ahead' }), {
        target: { value: '8' },
      });
      expect(screen.getByRole('combobox', { name: 'Look ahead' })).toHaveValue('8');

      rerender(<Score {...p} mode="practice" targetBeat={2} />);
      expect(screen.getByText(/notes wait at your current practice target/i)).toBeVisible();
      fireEvent.click(screen.getByRole('radio', { name: 'Overview' }));
      expect(container.firstElementChild).toHaveAttribute('data-score-view', 'overview');
    } finally {
      context.mockRestore();
    }
  });

  it('keeps score navigation out of progression drills', () => {
    const p = props('easy');
    const progression = {
      ...p.compiled,
      lesson: { ...p.compiled.lesson, kind: 'progression' as const },
    };
    const { container } = render(<Score {...p} compiled={progression} />);
    expect(container.firstElementChild).toHaveAttribute('data-score-view', 'overview');
    expect(screen.queryByTestId('score-tools')).not.toBeInTheDocument();
  });
});
