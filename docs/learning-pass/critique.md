# Learning-experience critique (Phase 1)

Base: `origin/main` at `7f89a9f`, worktree `uiux/learning-pass`. Method: RYUX Critique (Design Read,
fact check, category walk), read-only. The audit (`docs/ui-audit.md`) is not redone; its guards are
taken as rules. Severity here follows the brief: **1 blocks a task, 2 hurts the task, 3 minor,
4 polish.**

## What was reviewed and how

- Production build (`npm run build`), served with `vite preview` on port 4199.
- Captures with Playwright (Chromium): 1280×800 (mouse), 820×1180 (touch, iPad), 360×780 (touch,
  Pixel 7), light and dark, plus a reduced-motion set at 1280 and 360. Touch captures grow the
  viewport to the page for the full-page shot, as the audit did, so `pointer: coarse` holds.
- State made through the UI: Minuet in G downloaded; a chord chart ("Harbour lights", three
  sections, a note); a song of your own from a MIDI file ("Evening tune"); then the practice loop
  driven key by key (a wrong press, a right press, a partial chord), play-along with its count-in,
  the drill with a wrong note and Show me, a wrong ear-training answer, a bad import, a file that
  is not MIDI, a chart with unreadable chords, and the How to play popover.
- Screens: Home (first visit and after), Songs (with and without songs of your own), Song (Listen,
  Practice right hand, left hand, Follow Along), Chords, Drill (settings and a round), Chords you
  know (empty), Progressions, Progression ii–V–I (Listen, Practice, Play-along), Builder, Fills,
  Fill (Listen, Practice, Speed-up), Ear training, Progress (empty), Studio, My song, Chart
  (Listen, Practice), About.
- Measured per screen: the h1, Play's position, scroll offset, every live region's text, the
  dock's input label, the lit keys and their layers, the status line.
- Curated captures: `docs/screenshots/learning-pass/before/` (66 files). The whole set (334 +
  64 files) and `notes.json` with the measurements are in the session scratchpad.
- Not tested: a real MIDI device (connect, disconnect, sustain), iOS Safari and its silent
  switch, a screen reader end to end, Lighthouse (Phase 4), not angka rendering (the notation
  setting was left on Letters), the Studio take editor and the MIDI editor beyond their landing.

## Design Read

| Dimension      | Rating                                | Reason                                                                                                                                                                                                      |
| -------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clarity        | Adequate                              | Every detail page says its task in one lede; Home gives a beginner seven equal rooms and a welcome whose action is below the fold on a phone.                                                               |
| Hierarchy      | Adequate                              | Play leads every player (guard holds at 360×780 on all five pages), but on phones the score, the status line and the counts sit under the dock, and the progression's Edit/Send to/Export come before Play. |
| Coherence      | Strong                                | One header, one dock, one colour grammar (amber target, dusk chord, red wrong); the tokens hold in dark mode.                                                                                               |
| Density        | Strong on desktop, Adequate on phones | Calm, Linear-like spacing; on a phone the two-row nav and header take the top 40% of the first screen.                                                                                                      |
| Confidence     | Weak in Practice                      | A wrong press leaves a 260 ms flash; a partial chord says nothing; the first Play swaps instruments without a word.                                                                                         |
| Efficiency     | Adequate                              | Practice needs no setup; Ear training's two pickers cost two folds on a phone before Play.                                                                                                                  |
| Specificity    | Strong                                | Pencil drawings per room, the dock, the bar cards: nothing could be another app's.                                                                                                                          |
| Recoverability | Strong for data, Weak in the loop     | Start over, Cancel, an import preview and chart issues before Save; but a miss never says what was expected.                                                                                                |
| Accessibility  | Adequate                              | 44 px, 4.5:1, mounted live regions; the practice region announces the wrong things (C-01), the on-screen keys are hidden from assistive tech (open question).                                               |

## Findings

Each finding: severity · where · what · evidence (capture; file:line) · what it rests on
(**Known** = in the code today; **Design assumption** = a judgment; **Unconfirmed capability** =
not provable here; **Fact** = from a source) · fix.

### C-01 · severity 1 · Song and chart practice · the feedback loop does not say what happened

A wrong press flashes the key red for 260 ms (`src/state/keyLights.ts:21`) and the polite live
region says "Not that one. 1 missed." (`src/features/song/SongController.ts:525-531`) without
naming the expected note. A right press sets no announcement at all (`SongController.ts:532-545`),
so the stale "Not that one. 1 missed." stays in the region after the hit (measured: the region's
text is unchanged after the hit at 1280 and 360, light and dark). Switching hands keeps it too
(`SongController.ts:171-177`). On a phone the only persistent trace, "0 hits, 1 miss", sits below
the dock, out of the first screen.

- Captures: `practice-wrong-flash-1280-light.png` (red C♯5 beside the amber D5),
  `practice-wrong-after-360-light.png` (nothing left on screen), `practice-right-360-light.png`
  (target moved to G, counts "1 hit, 1 miss" below the fold, live text still the miss).
- Known: `WaitSession.press` returns `expected` on a miss (`src/core/practice/waitSession.ts:37,
153-155`) and `formatNote` already renders a note in the chosen notation (Score chips). The
  drill has the words pattern (`src/features/chords/DrillController.ts:191, 205-210`).
- Fix: on a miss announce and show "Not quite: play D, the amber key" (chord target: "Not quite:
  play G major, the ringed keys"); on a hit "D. Next: G"; on the last note the existing
  "Finished…". Put the same words visibly in the status line beside the counts, so a player on a
  phone sees them; clear them on mode or hand change. No new colour; the target stays amber until
  pressed, as now.

### C-02 · severity 2 · Left-hand and both-hands practice · a partial chord gets no feedback

Holding one chord tone in left-hand practice, or the melody note without its chord in both-hands
practice, returns `progress` from the session (`waitSession.ts:116-141`) and the controller
returns without a word (`SongController.ts:532`).

- Capture: `practice-lh-partial-1280-light.png` (G3 held, three ringed dusk keys, "0 hits,
  0 misses", no text).
- Known: the result carries `missing`; the drill says "One more note." / "2 more notes."
  (`DrillController.ts:205-210`).
- Fix: reuse the drill's hint in the status line and live region: "One more note", "Hold the
  chord too: B and D".

### C-03 · severity 2 · Song on a phone · playback scrolls Pause away

When playback reaches bar 2 the score scrolls the page to the current bar
(`src/features/song/Score.tsx:514-538`); under 600 px the control panel is static
(`src/features/song/SongPage.module.css:72-77`), so Pause, Restart and the tempo leave the
screen. Measured after the first Play at 360: page at 940 px, Play's top at −520 px. The audit's
SONG-6 fixed only the load-time scroll.

- Capture: `audio-playing-360-light-top.png` (bar 2 lit, no transport in view).
- Design assumption: a phone player needs a transport within reach while playing.
- Fix options: (a) a 44 px Play/Pause in the dock's legend row on compact widths while a player
  is mounted (the dock already hosts controls in Full Screen); (b) on compact widths, follow the
  bar only in Follow Along; (c) make the panel sticky on phones (costs 180 px of a 780 px screen,
  which SHELL-5 rejected). Recommended: (a), with (b) as the cheap fallback.

### C-04 · severity 2 · Song practice on a phone · the target note is not in the score

In Overview, a bar with five or more melody notes hides its chips behind "5 notes · Use Follow
Along to see each note" (`Score.tsx:390-394`, `src/features/song/scoreLayout.ts:9`). In Minuet
in G Easy that is 10 of 16 bars, so for most of the piece the target is shown only on the dock.

- Capture: `song-practice-360-light-full.png`; `practice-follow-360-light.png` (Follow Along
  shows every chip with beat numbers).
- Known: Follow Along renders every note; the view is a local state in `Score`.
- Fix: in Practice under 600 px open Follow Along by default (Overview stays the default for
  Listen); or always render the current bar's chips in Overview while practising.

### C-05 · severity 2 · Every room that plays · the synth-to-piano swap and loading are silent

The first Play or key plays the synth while the piano loads, then the sound changes; the dock
shows only the input ("Computer keys"). The engine exposes the status and sample counts
(`src/core/audio/engine.ts:8-13, 152, 179, 182`); the words exist only on the hidden Keyboard
page (`src/features/dev/KeyboardSandboxPage.tsx:26-32`: "Playing a simple synth while the piano
loads", "Piano ready", "Piano samples could not load, using the synth").

- Capture: `audio-loading-1280-light-top.png` (150 ms after Play: Pause, lit keys, no status).
- Known.
- Fix: a muted line in the dock legend from `useAudioState`, in a mounted polite region:
  "Loading the piano, simple synth for now" → "Piano ready"; on error: "Simple synth (the piano
  could not load)". Rooms that do not play keep nothing.

### C-06 · severity 2 · Dock · a MIDI keyboard connecting or disconnecting is not announced

When the device list empties, the label falls back from "MIDI: X" to "Computer keys" or "Tap the
keys" (`src/core/input/active.ts:24-35`); the label is a button, not a live region, so nothing is
said, and a player whose keyboard stopped working gets no reason.

- Evidence: code only. Unconfirmed capability: no device to emulate here (Hypothesis, confidence
  Medium).
- Fix: a polite status from `midi.subscribe` device changes: "MIDI keyboard disconnected. Tap the
  keys, or plug it back in." / "MIDI: X connected."

### C-07 · severity 2 · Home, first visit on a phone · the first action is below the fold

The first screen holds the nav, the title, the lede and the top of the welcome card; "Start with
Twinkle, Twinkle" is about 1,900 px down, after three steps, the first of which gives the
computer-key map a touch-only phone cannot use (`src/features/home/HomePage.tsx:109-141`).

- Captures: `home-first-360-light-top.png`, `home-first-360-light-full.png`.
- Known: `useTouchOnly()` already decides this for the dock (`src/ui/keyboard/InputStatus.tsx`).
- Fix: the action directly under "New here?", the three steps as one short line each, and the
  "Find the keys" step written for the device: on touch, "Tap the piano at the foot of every
  practice page".

### C-08 · severity 2 · Terms · voicing, inversion, comping, quality, clean are never explained

First appearances: Home lede (`HomePage.tsx:101-103`), the Voicing style and Inversion controls
(`src/features/chords/ChordLibraryPage.tsx:247-258`, no note), the Comping toggle
(`src/features/song/LessonPlayer.tsx:259-261`), "Chord quality" (Ear), "0 clean so far"
(`src/features/chords/ChordDrillPage.tsx:168`). The chart's panel explains Roman numerals in one
line and the drill explains strictness under its control: the pattern (`describedBy` under a
Segmented) exists.

- Captures: `chords-1280-light-full.png`, `drill-round-1280-light-top.png`.
- Known (the pattern); Design assumption (the wording).
- Fix, one line each where the term first appears: voicing "the same chord with its notes spread
  differently"; inversion "which chord tone is at the bottom"; comping "the left hand's
  accompaniment pattern"; clean "no wrong note, no Show me"; quality "major, minor and the rest".

### C-09 · severity 3 · Progression page · three actions sit above Play

"Make a copy to edit", "Send to" and "Export" come before the player
(`src/features/progressions/ProgressionPage.tsx:230-250`); on a phone Play is the fourth cluster,
at 480–524 px. The song page already puts Send to and Export under the player
(`src/features/song/SongView.tsx:214-231`), as SHELL-5 decided.

- Capture: `progression-360-light-top.png`.
- Known. Fix: the three actions into `belowControls`.

### C-10 · severity 3 · Ear training on a phone · the pickers push Play and the answers down

Exercise and Level each wrap to two lines (`src/features/ear/EarPage.tsx:111-130`); Play sits at
666–710 px and the answer buttons are below the fold.

- Capture: `ear-360-light-top.png`.
- Design assumption. Fix: under 600 px, Exercise as a Select and Level on one line, or the card
  first and the pickers under it.

### C-11 · severity 3 · Play-along at 1280×800 · the count-in is hidden

In Play-along the extra note line pushes the status ("Count-in, 3") under the dock's top edge
(`playalong-countin-1280-light.png`, status at 607 px, dock from 605 px). Stop and the clicks are
the only cues. Observed at this height only.

- Design assumption. Fix: show the count in the Play button's place ("3", "2", "1") or in the
  dock legend while it runs.

### C-12 · severity 3 · Chords on a phone · the task's controls come after the big card

The first screen shows the chord card ("C", "C major"); the root and quality pickers, which are
the task, are below it (`chords-360-light-top.png`).

- Design assumption. Fix: under 600 px, pickers first, then the card and the voicing.

### C-13 · severity 4 · Credit line · "first published 1894" reads as the piece's date

`creditLine` prints the source's `firstPublished` (`src/core/content/credit.ts:8`), which the
README defines for the US public-domain rule (the edition's date). For a 1725 Notebook piece the
line "Christian Petzold, first published 1894" reads as if the piece were from 1894; the card's
summary ("The Notebook minuet long credited to Bach") and the Source line at the foot of the page
carry the truth.

- Fact: composer, edition and dates are in `src/content/songs/sources/minuet-in-g.piece`; the
  catalogue rules check them. Whether 1894 is the earliest print of BWV Anh. 114 is not verified
  here. No credit is invented.
- Fix: "Christian Petzold · from an 1894 edition" (keep the data as it is).

### C-14 · severity 4 · Copy · title case

"Follow Along", "Falling Notes", "Full Screen", "Exit Full Screen" (`Score.tsx:58-62`,
`src/ui/keyboard/KeyboardDock.tsx:161`). Fact. Fix: sentence case.

### C-15 · severity 4 · Motion · the pulse is not on its token

`--pulse-ms: 1.2s` exists (`tokens.css:140`) but the three pulses hard-code `1.2s ease-in-out`
(`Score.module.css:160, 266`; `fills.module.css:142`). Fact. Fix: use the token.

### C-16 · severity 4 · Errors · a message without a next step, and a list far from its bar

"Not a Standard MIDI File." says what, not what to do (`src/features/studio/WaysIn.tsx:33`); the
chart's issues list sits about 750 px under the bar it names at 1280
(`err-chart-1280-light-full.png`), though the dashed bar outline marks it. Fix: "Not a Standard
MIDI File. Choose a .mid exported from your DAW."; keep the list, it is fine.

### Decision needed · Progress · "days in a row" is a streak

Progress's first stat is "N days in a row" (`src/features/progress/ProgressPage.tsx:86`), Home
says "N days in a row" and the room card says "streak" (`HomePage.tsx:59, 152`). The brief rules
out streaks as pressure. See the options below.

## What works (keep it)

- Play first on every player; the guard holds at 360×780 on the song, fill, progression, chart
  and song of your own (measured 420–524 px).
- The dock: one input label, How to play written per device ("Tap the keys. Swipe the keyboard
  sideways…" on touch; the key map on a desktop), Connect MIDI in the same place everywhere.
- Colour meaning holds everywhere captured, light and dark: amber target with an inset ring,
  dusk chord tones, a dusk ring for a chord to play, red only on a wrong press; position is an
  ink ring; the drill's "correct" is a dusk ring plus "Yes."; ear training's right answer is an
  ink ring, the wrong one red with "It was Am, minor." and two Hear buttons to compare.
- Empty states say what to do next: Progress ("Somewhere to start", four cards), My songs
  ("Sing one in Studio or write a chord chart"), Chords you know ("0 chords known").
- Errors are plain and block nothing silently: "This is not JSON, so it cannot be an Inharmonia
  export." with Import disabled; 'Verse, bar 2: "H" is not a chord' with Save disabled and the
  bar outlined.
- The drill's hints are the model for the song: "That note is not in the chord.", "One more
  note.", "Right notes. Now put F at the bottom.", "Yes."
- Chart practice names the hand movement ("C → G: keep G, move…") and marks it with shapes.

## Fact check

| On screen                                                                                                                         | Source                                                                     | Status                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Minuet in G, Christian Petzold, G major, 3/4, 16 bars (bars 1–16 of the original), Easy/Medium/Advanced                           | `src/content/songs/sources/minuet-in-g.piece`, `public/library/index.json` | Sourced; "first published 1894" is the edition's date (C-13)                                                               |
| ii–V–I = ii7 – V7 – Imaj7 – Imaj7; in C: Dm7 G7 Cmaj7                                                                             | `src/content/progressions.ts:30-40`, `realizeProgression`                  | Correct                                                                                                                    |
| Chart numerals C=I, G=V, Am=vi, F=IV, Dm7=ii7, G7=V7, Cmaj7=Imaj7, A7=VI7                                                         | `src/core/charts/compile.ts:145`                                           | Consistent with the README's rule (read against the tonic's major scale); functionally V7/ii, which the rule does not name |
| C major: C E G, 1 3 5                                                                                                             | `src/core/theory`                                                          | Correct                                                                                                                    |
| Fill "Stepping up to the root", passing tones, level 1, right hand, G7 → C (V7 → I), hits A B C on 3, 4, 1                        | `src/content/fills.ts:30-40`                                               | Correct for the spec                                                                                                       |
| Catalogue credits: Amazing Grace 1835, Brahms' Lullaby 1868, Canon in D 1919, Jingle Bells 1857, Sonata facile 1805, Twinkle 1785 | the `.piece` sources, checked by `npm run songs -- --check`                | Sourced; the same "edition date" reading applies to Twinkle (Mozart's 1785 print)                                          |
| "nothing here is timed unless you ask it to be"                                                                                   | play-along, speed-up and ear rounds are opt-in                             | Correct                                                                                                                    |
| Salamander Grand Piano, Alexander Holm, CC BY 3.0                                                                                 | README credits, `public/samples/salamander/v1/LICENSE.txt`                 | Sourced                                                                                                                    |
| "Everything you do here stays in this browser", "Ready to use offline"                                                            | README, `src/app/pwa.ts`                                                   | Correct; the offline line appears only once the worker is ready                                                            |

No unsourced credit, licence or number was found on any captured screen. Not angka was not
rendered in this pass.

## Audio and input states

| State                                   | What the UI says                                                                                                          | Where                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Audio locked (no gesture yet)           | Nothing; Play and the keys start it                                                                                       | `services.ts` armAudio |
| Tone loading after the first gesture    | Nothing (notes pressed within 250 ms are held, then played: `engine.ts:184-190`)                                          | C-05                   |
| Synth while samples load                | Nothing; the sound changes when the piano lands                                                                           | C-05                   |
| Samples failed, synth stays             | Nothing                                                                                                                   | C-05                   |
| Offline, piano never cached             | Synth, nothing said                                                                                                       | C-05                   |
| Computer keys / click / tap             | "Computer keys", "Click the keys", "Tap the keys" + How to play                                                           | good                   |
| MIDI connected, pedal                   | "MIDI: name", ", pedal down"                                                                                              | good                   |
| MIDI unsupported / blocked / none found | In How to play: "This browser can't use MIDI keyboards…", "MIDI is blocked for this site…", "No MIDI keyboard found yet…" | good                   |
| MIDI disconnects mid-practice           | Label falls back silently; notes released                                                                                 | C-06                   |

## View × state matrix (practice surfaces)

| View                     | Empty             | Loading              | Error                                 | Happy                            | Feedback: wrong                              | Feedback: right             | Partial          |
| ------------------------ | ----------------- | -------------------- | ------------------------------------- | -------------------------------- | -------------------------------------------- | --------------------------- | ---------------- |
| Song practice            | n/a               | synth, unsaid (C-05) | n/a                                   | amber target + ring              | 260 ms red, "Not that one. N missed." (C-01) | none announced (C-01)       | none (C-02)      |
| Chart practice           | n/a               | same                 | n/a                                   | dusk ring chord + movement words | same as song                                 | same                        | none (C-02)      |
| Progression practice     | n/a               | same                 | n/a                                   | dusk ring chord                  | same                                         | same                        | none             |
| Play-along               | n/a               | same                 | n/a                                   | count-in, coming chord ringed    | red flash, "Early/Late/Missed"               | "On time"                   | n/a              |
| Fill practice / speed-up | n/a               | same                 | n/a                                   | amber target, chords roll in     | "Not that one." (no note named)              | "" / "Clean. 2 of 3."       | n/a              |
| Drill                    | settings          | same                 | n/a                                   | prompt card                      | "That note is not in the chord."             | "Yes, G major." + dusk ring | "One more note." |
| Chords you know          | "0 chords known"  | same                 | n/a                                   | symbol, notes, status            | "That's it, after a wrong note…"             | "Clean play. Counted."      | "Keep going."    |
| Ear training             | n/a               | n/a                  | n/a                                   | Play, options                    | red tint + "It was Am, minor." + Hear both   | ink ring + "Yes: …"         | n/a              |
| Songs / My songs         | "Nothing yet…"    | catalogue loading    | download problems in plain words      | cards                            | import: "This is not JSON…"                  | "Imported: 1 added."        | preview          |
| Studio ways in           | n/a               | n/a                  | "Not a Standard MIDI File." (C-16)    | three cards                      |                                              |                             |                  |
| Chart editor             | paste sheet first | n/a                  | 'bar 2: "H" is not a chord', Save off | grid                             |                                              | "Saved." on the chart       |                  |

## Motion inventory

CSS (every `transition` and `animation` in `src/`):

| Where                                                                          | What moves                                                                    | Duration, easing  | Reduced motion                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| Button                                                                         | background, border 140 ms; transform 80 ms                                    | `--ease-out`      | global: 0.001 ms                                  |
| Toggle, its dot                                                                | border, colour, background 140 ms                                             | `--ease-out`      | global                                            |
| Segmented option                                                               | background, colour 140 ms                                                     | `--ease-out`      | global                                            |
| Form controls (Control.module.css)                                             | border 140 ms                                                                 | `--ease-out`      | global                                            |
| Cards on Home, Songs, Progressions, Progress, Studio; chord pills; ear options | border 140–160 ms                                                             | `--ease-out`      | global; Studio suggestion also `transition: none` |
| Score bar                                                                      | border, box-shadow 140 ms                                                     | `--ease-out`      | global                                            |
| Score chip                                                                     | background 90 ms linear; opacity 200 ms                                       | `--ease-out`      | global                                            |
| Score target chip                                                              | `target-pulse` inset ring + 4 px amber halo, 1.2 s ease-in-out, infinite      | hard-coded (C-15) | `animation: none` (`Score.module.css:282-287`)    |
| Score target chord                                                             | `chord-pulse` dusk halo, 1.2 s, infinite                                      | hard-coded        | `animation: none`                                 |
| Fill hit                                                                       | background 90 ms; opacity 200 ms; `target-pulse` 1.2 s                        | hard-coded        | `animation: none` (`fills.module.css:157-161`)    |
| Keyboard key                                                                   | background 90 ms, transform 60 ms (held: 1 px down), box-shadow 90 ms, linear |                   | global                                            |
| MIDI header                                                                    | transform 140 ms                                                              | `--ease-out`      | global                                            |
| MIDI workspace                                                                 | filter 80 ms                                                                  | `--ease-out`      | global                                            |
| body                                                                           | background, colour 200 ms on theme change                                     | `--ease-out`      | global                                            |

JavaScript-driven:

| Where                                                                   | What                                                    | Reduced motion                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Key press flash                                                         | 160 ms (`PRESS_FLASH_MS`)                               | kept: it is state, not decoration                                                                |
| Wrong flash                                                             | 260 ms (`WRONG_FLASH_MS`)                               | kept                                                                                             |
| Transport visuals, song/fill controllers, falling notes, progress track | per frame on rAF, read at `currentTime − outputLatency` | kept: they are the music                                                                         |
| Smooth scrolls: keyboard focus, score strip, page follow, Songs list    | `behavior: smooth`                                      | `auto` / `instant` (`Keyboard.tsx:87-91`, `Score.tsx:314-318, 534-536`, `SongsPage.tsx:268-269`) |

The global rule (`global.css:109-118`) cuts every animation and transition to 0.001 ms and sets
scroll-behavior auto; the three pulses are also set to `none`. Nothing decorative is left under
reduced motion; the playback visuals follow the transport, as DESIGN.md says. The reduced-motion
captures are static and so prove only that nothing broke in layout, not that the pulses stopped;
the CSS does.

## Not verifiable from this source

- MIDI connect, disconnect and sustain (no device): C-06 is a code read.
- Whether the first tapped note is lost on a slow first visit: `engine.ts:184-190` drops a note
  pressed more than 250 ms before Tone finished loading; the e2e perf spec covers scheduled
  notes, not a live press. Hypothesis, low confidence.
- The on-screen keys are `aria-hidden` (`src/ui/keyboard/Keyboard.tsx:119`): a screen-reader user
  on a phone with no MIDI cannot play. A design decision from before this pass; listed as an open
  question, not a finding.
- Not angka chips, slashes and the "do = C" header: not rendered in this pass.

## Decisions for the owner

See the message for the options and recommendations: the streak wording, Pause on a phone, the
default practice view on a phone, and Home's welcome.

## RYUX delivery gate (critique scope)

```
PRODUCT        PASS          · one task per page; no invented facts on screen; one credit-line wording issue (C-13) · evidence Strong (every screen captured)
UX             FAIL          · the practice loop's feedback (C-01, C-02) and the phone transport (C-03)
CONTENT        FAIL          · terms unexplained (C-08); title case (C-14); credit wording (C-13)
UI             PASS          · one focal point on desktop; colour meaning holds light and dark
DESIGN SYSTEM  PASS          · tokens hold; one token drift (C-15)
ACCESSIBILITY  FAIL          · live regions say the wrong thing or nothing in practice (C-01, C-02, C-05, C-06)
RESPONSIVE     PASS          · no sideways scroll, Play in the first screen; phone findings are hierarchy (C-04, C-07, C-09, C-10, C-12)
EDGE CASES     PASS          · empty and error states present and plain; audio states unsaid (C-05)
CODE QUALITY   N/A           · no code changed
VISUAL QA      PASS          · Playwright, 1280/820/360, light/dark/reduced, states driven through the UI
ANTI-SLOP      PASS          · no fake numbers, urgency or decoration
FINAL          FAIL          · fix C-01 to C-05 before the loop can be called clear
```
