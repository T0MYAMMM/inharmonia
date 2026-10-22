import type { CompiledBar } from '@/core/content/compile';

/**
 * Overview density: 1–4 notes fit in a normal card, 5–8 get two columns,
 * 9+ show a rhythm summary instead of unreadably narrow labels.
 */
export function barDensity(bar: Pick<CompiledBar, 'rh'>): 'normal' | 'wide' | 'dense' {
  const count = bar.rh.filter((note) => note.note !== null).length;
  return count >= 9 ? 'dense' : count >= 5 ? 'wide' : 'normal';
}
