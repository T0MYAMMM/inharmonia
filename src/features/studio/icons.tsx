/** Small line icons for the MIDI editor, drawn in the current text colour. */

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
