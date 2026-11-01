import type { ReactNode } from 'react';
import s from './art.module.css';

interface ArtSvgProps {
  /** The drawing's own coordinates. */
  box: readonly [width: number, height: number];
  /** The width it is drawn at, if not its own; the height follows. */
  width?: number;
  className?: string;
  children: ReactNode;
}

/** The root of every drawing: decorative, so hidden from assistive tech and never focusable. */
export function ArtSvg({ box: [w, h], width = w, className = s.art, children }: ArtSvgProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      width={width}
      height={(width * h) / w}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
