import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOffscreen } from './useOffscreen';

type Callback = (entries: { isIntersecting: boolean }[]) => void;
const observers: { callback: Callback; options: IntersectionObserverInit | undefined }[] = [];

class FakeObserver {
  constructor(callback: Callback, options?: IntersectionObserverInit) {
    observers.push({ callback, options });
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const off = useOffscreen(ref, '0px 0px -35% 0px');
  return <div ref={ref}>{off ? 'off' : 'on'}</div>;
}

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe('useOffscreen', () => {
  it('follows the element in and out of the viewport, with the margin given', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<Probe />);
    expect(screen.getByText('on')).toBeInTheDocument();
    expect(observers[0]!.options).toEqual({ rootMargin: '0px 0px -35% 0px' });
    act(() => observers[0]!.callback([{ isIntersecting: false }]));
    expect(screen.getByText('off')).toBeInTheDocument();
    act(() => observers[0]!.callback([{ isIntersecting: true }]));
    expect(screen.getByText('on')).toBeInTheDocument();
  });

  it('stays on where the browser has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe />);
    expect(screen.getByText('on')).toBeInTheDocument();
  });
});
