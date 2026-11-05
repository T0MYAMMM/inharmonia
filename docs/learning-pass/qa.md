# QA (Phase 4)

Build: the `uiux/learning-pass` branch after the polish commit, `npm run build`, served with
`vite preview`. Captures: the same Playwright scripts as Phase 1, at 1280×800, 820×1180 and
360×780, light and dark, plus reduced motion at 1280 and 360, with the same seeded state (Minuet in G
downloaded, a chart, a song of your own) and the same driven states (a wrong press, a right press, a
partial chord, play-along's count-in, the drill, a wrong ear answer, the errors). After-captures:
`docs/screenshots/learning-pass/after/`.

## Motion, verified in the browser

Read with `document.getAnimations()` and the computed styles on the live build, at 1280, with and
without `prefers-reduced-motion: reduce`:

| State                         | Motion                                                                       | Reduced motion                                   |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Song practice, a note target  | one `target-pulse` on the target chip, 1200 ms (from `--pulse-ms`), infinite | nothing animates; the chip's animation is `none` |
| Song practice, a chord target | one `chord-pulse` on the chord, 1200 ms, infinite                            | nothing animates                                 |
| Song listen, playing          | no CSS animation: the lights and chips follow the transport on frames        | the same                                         |
| Fill practice, a target       | one `target-pulse` on the hit, 1200 ms                                       | nothing animates                                 |
| Chords, a hovered button      | five transitions (background, border, colour, transform)                     | none: the global rule cuts them to 0.001 ms      |

Scroll behaviour computes to `auto` everywhere; the smooth scrolls are asked for in code and fall
back to `auto` or `instant` under reduced motion (`Keyboard.tsx`, `Score.tsx`, `SongsPage.tsx`).
Nothing new animates: the dock's feedback line, its action and its notice appear and disappear as
state.

## Before and after, measured

Play's position on a 360×780 phone with the page at its top (top–bottom, px), from the capture
scripts' measurements:

| Page                           | Before  | After   |
| ------------------------------ | ------- | ------- |
| Song (Minuet in G, Easy)       | 420–464 | 420–464 |
| Progression (ii–V–I)           | 480–524 | 368–412 |
| Ear training (chord quality)   | 666–710 | 493–537 |
| Fill (Stepping up to the root) | 474–518 | 474–518 |
| Chart (Harbour lights)         | 458–502 | 458–502 |
| Song of your own               | 422–466 | 422–466 |

Home on a phone: the way in ("Start with Twinkle, Twinkle") was about 1,900 px down; it is now in
the first screen, at the top of the welcome card (`e2e/layout.spec.ts` guards it).

The practice loop, read from the live regions and the dock line (1280 and 360, light and dark,
reduced motion):

| State                                   | Before                                                            | After                                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A wrong press (D due)                   | live: "Not that one. 1 missed."; nothing on screen but the counts | dock line and live: "Not quite: play D, the amber key."; the red flash as before                                                                  |
| A right press                           | live unchanged (the miss text stayed)                             | "D. Next: G."; then "G. Next: A."                                                                                                                 |
| A second wrong press                    | "Not that one. 2 missed."                                         | "Not quite: play D, the amber key. 2 missed."                                                                                                     |
| One chord tone held, left-hand practice | nothing                                                           | "2 more notes." then "One more note."                                                                                                             |
| Hand changed, mode changed              | the old text stayed                                               | cleared                                                                                                                                           |
| After the first Play                    | nothing                                                           | "Loading the piano, a simple synth plays for now." then "Piano ready." for four seconds, then nothing (`audio-loading`, `audio-playing` captures) |
| Playing on a phone, bar 2               | Pause off screen, nothing in reach                                | "Pause" in the dock's legend row (`audio-playing-360-light-top.png`)                                                                              |
| Practice on a phone                     | Overview: 10 of 16 bars without chips                             | Follow along, bar 1 with every note and beat numbers; "Hear it" in the dock once the panel has scrolled away                                      |

Screens whose measurements did not change: Chords, the drill, Chords you know, Progressions,
the builder, Fills, Progress, Studio, Songs, My song, Chart, About (47 of 215 measured screens
changed, all of them in the ways above or by the new live text).

## Verified in the browser (Playwright, the production build)

- The primary task on every changed screen, as a user would do it: the song practice loop (a wrong
  press, the right press, Start over, back to Listen), left-hand practice with a partial chord,
  Pause from the dock on a phone and Play again, Follow along opening and closing with the mode,
  the audio notice after the first Play and its going quiet, the ear quiz through a wrong answer,
  Home's way in on a touch-only phone, the ear pickers' fold opening and switching level, the
  progression's Send to and Make a copy from their new place on a phone.
- One failure path per changed flow: a bad import, a file that is not MIDI, a chart with chords
  that cannot be read (all unchanged and still plain).
- The audit's guards, every run: one h1 per route, no sideways scroll, no control under 44 px on
  the phone (the dock's new button and the folded summary included), Play in the first screen
  and above the dock on the song, the fill, the progression, the chart and a song of your own; now
  also Home's way in, Ear training and the progression's action row.
- Captures at 1280, 820 and 360, light and dark, reduced motion at 1280 and 360:
  `docs/screenshots/learning-pass/after/` (66 files), beside the before set.

## Not verified

- A real MIDI keyboard connecting and disconnecting: the notice's words and timing are unit-tested
  with a fake MIDI store; no device was available.
- A screen reader end to end: the live regions' text was read from the DOM, not heard.
- iOS Safari and its silent switch.
- Not angka: the e2e for the song page still checks the do header and digits (`song.spec.ts`);
  the practice words in not angka were not captured (the name comes from the same `formatNote`).

## RYUX scan, source

`npx @ryuxdsgn/design-intelligence scan src`: 428 files, 4 fail, 6 warn, none from this pass.
The four fails are `<img>` without `alt` in three test files (fixtures, not the product). The
warnings are older: `.main:focus { outline: none }` on the main landmark (programmatic focus on
navigation, not a control); a clickable span in the chord sequence's bar strip; one-off colours in
the falling-notes canvas (`FallingNotes.tsx`: right hand `#F2B65B`, left hand `#A9A0EB`, which is
not dusk) and in the keyboard's key gradients; 9 and 10 px text in the Studio editors. The
falling-notes colours deserve a pass of their own: they are the one place the colour meaning is
not read from the tokens.

## RYUX scan, live pages

`npx @ryuxdsgn/design-intelligence scan <url>` at 320, 390 and 1280 px on Home, a song, Chords,
the drill, a progression, a fill, Ear training, Progress and Studio: 0 fails on every page. The
warnings, all older than this pass and checked against the captures:

- The footer's Keyboard and About links (22 px) and the crumb links (19 px) under a mouse; on
  touch every control is 44 px by the token override, which the e2e guard measures.
- The Beta badge's 10.9 px text and the keyboard's octave labels (11.2 px): badges and key labels,
  not body text.
- Reported text overlaps that are a fixed layer over the page (the dock's legend over the
  arrangement details, the sticky settings over the score at 390) or an inline link that wraps
  inside its list item on Home ("Listen, then play." and the Twinkle link): the captures show them
  apart.

## Lighthouse

Lighthouse 12.8.2, mobile and desktop presets, against `vite preview` of the production build on
this machine (WSL, uncompressed files, Chromium attached over its debugging port), on the after
build and on an untouched build of `origin/main` served the same way, back to back. Accessibility,
best practices and SEO: 100 on every page, both builds, both presets. Performance:

| Page                           | Mobile, main | Mobile, after | Desktop, main | Desktop, after |
| ------------------------------ | ------------ | ------------- | ------------- | -------------- |
| Home                           | 87           | 87            | 98            | 99             |
| Songs                          | 83           | 83            | 99            | 99             |
| Song (Ode to Joy, Easy)        | 83           | 83            | 99            | 99             |
| Chords                         | 83           | 84            | 99            | 99             |
| Chord drill                    | 87           | 87            | 99            | 99             |
| Progressions                   | 84           | 84            | 99            | 99             |
| Progression (ii–V–I)           | 84           | 83            | 99            | 99             |
| Fills                          | 89           | 89            | 100           | 100            |
| Fill (Stepping up to the root) | 88           | 88            | 99            | 99             |
| Ear training                   | 89           | 89            | 92            | 92             |
| Progress                       | 90           | 90            | 92            | 92             |
| Studio                         | 78           | 79            | 98            | 98             |
| About                          | 90           | 90            | 100           | 100            |

The pass changes no score by more than a point. The mobile numbers sit below the README's 96 on
both builds here: the preview serves files uncompressed and the machine was the same one running
the captures, so the absolute values are this environment's, not the site's; the README's figures
are the owner's measurements of the deployed site.

## Findings not fixed, and why

- C-11, the count-in hidden under the dock at 1280×800 in play-along: not in the ten picked; the
  fix (the count in the Play button's place) is small and waits for a decision.
- C-12, the chord card before the pickers on a phone's Chords page: not picked.
- C-16, "Not a Standard MIDI File." without a next step, and the chart's issues list far from its
  bar: not picked.
- The falling-notes canvas draws its hands in its own colours (`FallingNotes.tsx`), not the
  tokens: found by the RYUX source scan, outside this pass's scope, worth its own small commit.
- The on-screen keys stay hidden from assistive technology (`aria-hidden`): a design question for
  the owner, not a change made here.

## Theory and credit

No wrong spelling, numeral or credit was found. Two notes: the chart's numeral for A7 in C reads
VI7 by the README's rule (read against the tonic's major scale), where a teacher might say V7/ii;
and the credit line's year is the edition's, now worded as such ("1894 edition") after the
assessment in Phase 1. Whether 1894 is the earliest print of BWV Anh. 114 was not checked beyond
the piece's own source file.

## Delivery gate

```
PRODUCT        PASS          · every changed screen keeps one task and one primary action; no fact invented; the credit's year is now said as what it is · evidence Strong (captures of every changed state)
UX             PASS          · the loop says what was expected, what was played and what comes next; the way in, Play and the answers are in a phone's first screen on Home, the progression and Ear training
CONTENT        PASS          · terms explained once where they first appear; sentence case; no open rule shown on screen (none exist)
UI             PASS          · nothing new coloured: ink words, a muted notice, the ink primary; the tokens hold in dark mode
DESIGN SYSTEM  PASS          · one new component (AudioNotice) and one hook (useOffscreen), both reused; the pulse reads its token
ACCESSIBILITY  PASS          · live regions mounted and polite, their words plain and specific; 44 px targets on touch, measured; not heard with a screen reader (see Not verified)
RESPONSIVE     PASS          · 1280, 820 and 360 captured; the width-specific behaviour (dock action, Follow along, the ear fold, the progression's row) is under 600 px only and guarded
EDGE CASES     PASS          · loading, synth fallback, error and offline wording for the sound; MIDI coming and going; the empty and error states unchanged and checked
CODE QUALITY   PASS          · lint, format, typecheck, songs check, 1325 unit tests, 421 e2e tests green before every commit
VISUAL QA      PASS          · Playwright captures at three widths, two themes, reduced motion; motion read from document.getAnimations
ANTI-SLOP      PASS          · no numbers, urgency or decoration added; the streak removed
FINAL          PASS          · with the Not verified list above standing
```
