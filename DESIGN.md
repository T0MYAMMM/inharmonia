# DESIGN.md

Core rules for Inharmonia, extracted from the code. Detail lives where it is enforced: `src/styles/tokens.css`
(with `tokens.test.ts`), `README.md` and `docs/ui-audit.md`. Agents read those only when a rule here points there.

<!-- ryux-context:start -->

- **Product**: Inharmonia, a calm practice room for piano harmony: chords, inversions, voicings, progressions, comping and fills, learned hands-on at the keys. React 18, TypeScript, Vite, PWA, no backend.
- **Work**: improving the learning experience of an existing, audited UI (docs/ui-audit.md: 102 findings, 98 fixed).
- **Audience**: people learning piano harmony at a keyboard, from beginners up; used from Indonesia (not angka notation) and in English. Not confirmed by research: inferred from the content and notation systems.
- **Market**: English UI; Indonesian notation and section names supported. No currency, no payments.
- **Constraints**: no third-party request, analytics or font CDN; no new UI library; React 18 only; samples load only in rooms that play; Lighthouse accessibility, best practices and SEO 100, performance 96+ on mobile.
- **Design intent**: calm, hands-on, one focal point per screen (the keys or the score, and Play). No streaks as pressure, badges, confetti or gamified urgency.
- **UI direction**: calm, plain, ink on paper. Colour carries meaning, never decoration.
- **Voice and tone**: plain, calm, sentence case, second person, no exclamation marks (inferred from existing copy, e.g. "You're offline. This song downloads when you're back online.").
- **Motion direction**: quiet. Playback visuals follow the transport on requestAnimationFrame; everything else is a short state transition; reduced motion removes the rest.

<!-- ryux-context:end -->

## Identity

- A practice room, not a game or a feed. Every screen serves one task at the keys; text explains, it does not sell.
- Rooms, in nav order: Songs, Chords, Progressions, Fills, Ear training, Studio (beta), Progress. Home, About and Keyboard sit outside them (`src/ui/art/rooms.ts`).
- Primary action is ink (`--primary: var(--ink)`): Play, Save, Start, Hear it. One primary per screen.

## Colour meaning (tokens.css, checked by tokens.test.ts)

- **Amber** = the right hand, or the target note. **Dusk** = the left hand, or chord tones. **Red (`--wrong`)** = a wrong press. Never decorative; never a third use.
- Ink, muted, line, surface, bg are the only neutrals. **Pencil** (`--pencil`, `--pencil-faint`) is for drawings whose colour means nothing; at least 3:1 on surface and bg.
- **Room tints** (`--room-<room>-tint/line/deep`) are read only by `src/ui/art` (rooms.css): a drawing's panel, its lines, its notes, and the wash on a card-index page. Never a keyboard, a score or a practice tile. Hues stay 40° or more from amber and dusk.
- Focus ring and selection are dusk on purpose: a named state, not decoration (audit COLOR-7).
- No colour outside tokens.css. Position (the current bar) is an ink ring, not dusk (audit COLOR-5). Voicing hints are shapes (dot, ring), not colours.

## Type and layout

- Bricolage Grotesque Variable, self-hosted through Fontsource; system-ui fallback. Body 16/24. Headings 800, tight tracking; `h1` clamp(2.25rem, 6vw, 3.75rem).
- One `PageHeader` on every page: crumb, `h1`, lede, actions (audit SHELL-1). Text measure `--text-width` 44rem; content max 1120px.
- Spacing scale `--space-1..7` (4 to 48px); breakpoints 600 / 760 / 960 only; control heights 40/32, both 44 on `pointer: coarse`.

## Notation

- Three systems in the Display menu: **Letters** (spelled for the key), **Roman** (chords as numerals, always read against the tonic's major scale with explicit accidentals, in every mode), **Not angka** (do-based; minor keys use the relative major's do; chromatic notes slashed). Chords stay as letter symbols in not angka. Source: `src/core/notation`, README "Notation".
- Spellings, numerals, voicings, titles and credits come from `src/core/theory`, `src/content` and the song sources. Never invent a credit or a licence; public domain is proved per piece (`src/core/content/publicDomain.ts`).

## Motion

- Playback visuals (key lights, score chips, falling notes) follow the transport on `requestAnimationFrame`, read at `currentTime − outputLatency` (`src/app/transportVisuals.ts`). They are not CSS animations and do not stop under reduced motion: they are the music.
- Everything else is a short transition on `--ease-out`: controls 140ms (transform 80ms), keys 60 to 90ms linear, score chips 90ms / 200ms. The target pulse (`target-pulse`, `chord-pulse`, 1.2s ease-in-out, infinite) is the only looping animation.
- `prefers-reduced-motion: reduce`: global.css cuts every animation and transition to 0.001ms; Score and fills set the pulses to `animation: none`; smooth scrolling becomes `auto`. No motion token is added without a reduced-motion rule.

## Accessibility bar

- Every control reachable by keyboard; 44px targets on touch; 4.5:1 for text (muted and small dusk included) in both themes.
- Practice feedback goes through polite live regions that stay mounted (audit A11Y-1). Feedback never relies on colour alone.
- One `h1` per page, no sideways scroll, Play fully in the first screen at 360×780 with the page at its top (`e2e/layout.spec.ts`).
- Lighthouse: accessibility, best practices, SEO 100; performance 96+ on mobile (README; measured by hand, not in CI).

## Privacy and offline

- Songs, charts, recordings, lyrics and progress stay in this browser. Nothing is uploaded; there are no share links; a pasted or read sheet sends nothing (README "Chord charts", "Your songs").
- No third-party request of any kind. The service worker precaches the app; piano samples load only after a room that plays has opened, and the synth plays until they arrive. Downloads of catalogue songs never start by themselves.

## Audit guards (fixed rules, docs/ui-audit.md)

- Keep every fixed finding fixed: one header component, token-driven control heights, Segmented that wraps rather than scrolls, grouped player rows, live regions mounted, no decorative amber or dusk, breakpoints on scale.
- Deferred on purpose: SONGS-2 (equal card heights), CODE-2, FILL-4, MIDI-6. Do not reopen without a decision.

## Open questions

- Audience and skill level are inferred from content; no user research is recorded.
- Lighthouse scores are a README claim with no CI guard.
- Decided (learning pass, 2026-11-06): no streak. Progress and Home count the days practised of
  the last seven; nothing counts a run.
- Decided (learning pass): a term (voicing, inversion, comping, quality, clean) is explained in one
  line on the screen where it first appears, under the control that uses it (the Segmented's
  `describedBy` note) or in the page's lede.
- Decided (learning pass): practice feedback is words, not colour alone: what was expected and
  where it is, what was played and what comes next, on the dock's legend line and in the player's
  polite live region. The dock also says what the sound is doing and when a MIDI keyboard comes or
  goes, and carries the mode's primary action on a phone once the panel has scrolled away.
