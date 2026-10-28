/** Small line icons for Studio and its editors, drawn in the current text colour. */

export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? (
        <path
          d="M16 9l5 6M21 9l-5 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}

export function PianoIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 26 22" aria-hidden="true" focusable="false">
      <rect
        x="1.5"
        y="1.5"
        width="23"
        height="19"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8 2v18M13 2v18M18 2v18" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 2h4v10H6zM16 2h4v10h-4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/** Points down the page, at what a button leads to. */
export function ArrowDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 4v15M5.5 12.5 12 19l6.5-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Line({ d, size = 20 }: { d: string; size?: number }) {
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

export const UndoIcon = () => <Line d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />;
export const RedoIcon = () => <Line d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />;
export const ChevronDownIcon = () => <Line d="m6 9 6 6 6-6" size={16} />;
/** Wider or narrower beats. */
export const ZoomTimeIcon = () => <Line d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" size={18} />;
/** Taller or shorter pitch rows. */
export const ZoomPitchIcon = () => <Line d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" size={18} />;

/** More actions: three dots. */
export function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}
