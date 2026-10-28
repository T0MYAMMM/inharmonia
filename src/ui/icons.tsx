/** A line icon in the current text colour, from one SVG path on a 24-unit grid. */
export function LineIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const UndoIcon = () => <LineIcon d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />;
export const RedoIcon = () => <LineIcon d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />;
