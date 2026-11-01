# UI audit: page shell, widths, controls, touch and input

Base: `f086b1e` on `feature/ui-consistency`; statuses as of `5cd16d8`.

Every finding has an id, a severity, a fix and a status: **Fixed** with the
commits that fixed it, or **Deferred** with the reason. Two findings came from
reviewing the screenshots after the fixes (SHELL-5, INPUT-6) and one from
writing the check that Play is in view on a phone (SONG-6).

| Severity | Findings | Fixed | Deferred                   |
| -------- | -------- | ----- | -------------------------- |
| High     | 12       | 12    | 0                          |
| Medium   | 44       | 43    | 1 (SONGS-2)                |
| Low      | 46       | 43    | 3 (CODE-2, FILL-4, MIDI-6) |
| All      | 102      | 98    | 4                          |

Guards: `e2e/layout.spec.ts` (`59b395c`, merged with the input checks in
`4f88fca`) checks one h1 and no sideways scroll on every route, the not-found
states and the MIDI editor; no control under 44px on the phone on a song,
Chords, a progression, Studio and the MIDI editor; the dock's input indicator
and How to play on both projects; and, on the phone (`998a8ad`), that the whole
Play button is in the first screen, with the page still at its top, on a song,
a fill, a progression, a chord chart and a song of your own.

Play on a 360x780 phone, measured as the button's top (and bottom) on the page:

| Page                           | Base `f086b1e` | `42b7fd6` | Now `5cd16d8` |
| ------------------------------ | -------------- | --------- | ------------- |
| Song (Minuet in G, Easy)       | 774–818        | 808–852   | 704–748       |
| Fill (Stepping up to the root) | 718–762        | 801–845   | 709–753       |
| Progression (ii–V–I)           | 515–559        | 619–663   | 586–630       |
| Chart (with a note)            | 1006–1050      | 1031–1075 | 566–610       |
| My song                        | 566–610        | 530–574   | 526–570       |

At the base and at `42b7fd6` every page with a score also scrolled itself 500
to 1,060px down on load (SONG-6), so Play was off the screen whatever its
position; the fill, which has no score, was the only one in view at the base.

Before and after screenshots: `docs/screenshots/ui-consistency/` (`7c60182`,
recaptured where these fixes reach in `5cd16d8`).

## How this was measured

- `npm run build`, then `vite preview`. Every route in `src/app/App.tsx` was
  captured at 1280px (mouse), 820px (touch) and 360px (touch, mobile), light
  theme.
- State was made through the UI, not faked: a chord chart pasted from a sheet
  (three sections, a note), a progression of your own, a song sung into Studio
  (saved without its recording), a MIDI song (a library piece exported as
  `.mid`, opened in Studio and saved), three chords marked as known, and a
  week of progress in localStorage.
- Each capture also measured the page: where the `h1` sits, the header's
  width and margins, the height of every control, every target under 44px on
  touch, where amber and dusk are computed, and which rows wrap.
- Chromium drops touch emulation during a full-page screenshot, so
  `pointer: coarse` stops matching; touch captures grow the viewport to the
  page instead. The before/after screenshots in Phase 2 are taken the same way.

Severity:

- **High**: broken or misleading layout on a main page, a control you can't
  see or reach, a page without an `h1`, or touch targets that fail on the
  practice surfaces.
- **Medium**: a visible break from the shell or the tokens on a main page, or
  an accessibility weakness.
- **Low**: polish, copy, dead code.

## Header patterns at the base

`h1` top is measured from the top of `<main>`, at 1280 / 360.

| Page                 | Route                             | Header                                                      | `h1` top     | Header width | Above the `h1`                                                           |
| -------------------- | --------------------------------- | ----------------------------------------------------------- | ------------ | ------------ | ------------------------------------------------------------------------ |
| Home                 | `/`                               | `page.hero`                                                 | 48 / 48      | 44rem        | —                                                                        |
| Songs                | `/songs`                          | `page.hero` + a second paragraph                            | 48 / 48      | 44rem        | —                                                                        |
| Song                 | `/songs/:id`                      | `SongPage .header`, 9 children                              | 72 / 64      | none (1120)  | "Songs" link                                                             |
| My song              | `/songs/mine/:id`                 | `SongPage .header`, two action rows                         | 72 / 64      | none         | "Songs" link                                                             |
| Chart                | `/songs/charts/:id`               | `SongPage .header`                                          | 72 / 64      | none         | "Songs" link                                                             |
| Chart editor         | `/songs/charts/new`, `…/:id/edit` | `SongPage .header`                                          | 72 / 64      | none         | "Songs" or "← Back to the chart"                                         |
| Chords               | `/chords`                         | `page.hero`, sub-page links inside the lede                 | 48 / 48      | 44rem        | —                                                                        |
| Chord drill          | `/chords/drill`                   | `page.hero`, "Back to chords" inside the lede               | 48 / 48      | 44rem        | —                                                                        |
| Chords you know      | `/chords/known`                   | `page.hero`, "Chord library" at the end of the lede         | 48 / 48      | 44rem        | —                                                                        |
| Progressions         | `/progressions`                   | `page.hero`                                                 | 48 / 48      | 44rem        | —                                                                        |
| Progression          | `/progressions/:id`               | `SongPage .header`                                          | **84 / 100** | none         | "Progressions · Make a copy to edit" **+ Download .json + Copy as JSON** |
| Progression builder  | `/progressions/new`, `…/:id/edit` | `SongPage .header`                                          | 72 / 64      | none         | "Progressions" link                                                      |
| Fills                | `/fills`                          | `page.hero`                                                 | 48 / 48      | 44rem        | —                                                                        |
| Fill                 | `/fills/:id`                      | `SongPage .header`                                          | 72 / 64      | none         | "Fills" link                                                             |
| Ear training         | `/ear`                            | `page.hero`                                                 | 48 / 48      | 44rem        | —                                                                        |
| Progress             | `/progress`                       | `page.hero`                                                 | 48 / 48      | 44rem        | —                                                                        |
| Studio               | `/studio`                         | `page.hero`, Beta badge inside the `h1`                     | 48 / 48      | 44rem        | —                                                                        |
| Studio, take editor  | `/studio` (in place)              | `SongPage .header`                                          | 84 / 76      | none         | ghost Button "← Back to the take"                                        |
| Studio, draft player | `/studio` (in place)              | `SongPage .header`                                          | 84 / 76      | none         | ghost Button "← Back to …"                                               |
| Studio, MIDI editor  | `/studio` (in place)              | **no `h1`**: an `h2` and a 3–7 line paragraph               | —            | —            | Back is inside the editor row                                            |
| Edit song            | `/studio/edit/:id`                | `SongPage .header`, then (MIDI) a second `h2` and paragraph | 72 / 64      | none         | "← Back to the song"                                                     |
| Keyboard             | `/keyboard`                       | `page.hero`                                                 | 48 / 48      | 44rem        | —                                                                        |
| About                | `/about`                          | `page.hero` inside `.prose`, inline `marginBottom: 0`       | 48 / 48      | 44rem        | —                                                                        |
| Not found            | `*`                               | `page.hero`                                                 | 48 / 48      | 44rem        | —                                                                        |

`page.hero`: gap 12, margin 24 / 32, the same on a phone. `SongPage .header`:
gap 8, margin 16 / 24, then 8 / 16 under 600px. Neither sets the other's
spacing, so index and detail pages have different rhythm at every width.

## Content widths at the base

| Width                  | Where                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--content-max` 1120px | `<main>`; every page's content                                                                                      |
| `--text-width` 44rem   | `page.hero`, `page.prose` (About)                                                                                   |
| 46rem, hard-coded      | Ear training card, progression builder form, Home welcome                                                           |
| none                   | every `SongPage .header`: detail ledes run the full 1120px (the Fill description is one 116-character line at 1280) |

## Control heights at the base

At 1280 (mouse) a single row can mix four heights: Button 44, small Button
36, Toggle 36, chord pills 36, Select and TextInput 40, small ones 32,
Segmented 40 (its options 32). At 360 (touch) the same sizes apply: only the
Studio editors and the take setup override them.

Sub-44px targets on touch, across all pages (360px):

| Control                                        | Size    | Pages                                |
| ---------------------------------------------- | ------- | ------------------------------------ |
| Segmented option                               | 32 tall | 22 of 32 states                      |
| small Button (ghost and secondary)             | 36      | 15                                   |
| Toggle                                         | 36      | 12                                   |
| Select, TextInput, RangeInput                  | 40      | 13                                   |
| Dock "Connect MIDI"                            | 28      | every page with the dock             |
| Settings (gear)                                | 40 × 40 | every page                           |
| Nav links                                      | 39      | every page                           |
| Footer links                                   | 22      | every page                           |
| Chord pills (root, quality)                    | 36      | Chords, Chord drill, Chords you know |
| `<summary>` (arrangement, "The notes as text") | 24–36   | Song, Studio                         |
| Builder "Cancel" link                          | 24      | Progression builder                  |
| Chart form chips (earlier / later / remove)    | 26 × 26 | Chart editor                         |
| Chart section ↑ ↓                              | 37 × 36 | Chart editor                         |
| MIDI track mute                                | 34 × 34 | Studio MIDI, Edit song               |
| MIDI seek bar                                  | 22 tall | Studio MIDI, Edit song               |
| SongEditor chord selects                       | 32      | Studio take editor, Edit song        |

## Cross-page findings

### Shell

| Id      | Sev    | Finding                                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                                                                                                                                                                     | Status                                                                                                             |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SHELL-1 | High   | Two header patterns (`page.hero`, `SongPage .header`) and one page with none (Studio MIDI). The `h1` sits at 48, 72, 84 or 100px depending on the page.                                                                                                                                                                            | One `PageHeader` component: crumb, `h1`, lede, actions, in that order, with one set of spacing.                                                                                                                                                                                                                         | Fixed `ee5a309`, `833b4c2`, `5f99b59`, `4875211`, `324089d`, `e005dcb`, `509fd76`, `b390c8f`; guarded by `4f88fca` |
| SHELL-2 | Medium | Header rhythm differs: hero 24 / 32 at every width; detail header 16 / 24, then 8 / 16 on a phone.                                                                                                                                                                                                                                 | One margin pair: 16 / 32, then 8 / 24 under 600px.                                                                                                                                                                                                                                                                      | Fixed `ee5a309`                                                                                                    |
| SHELL-3 | Medium | Detail ledes have no measure; they run 1120px wide.                                                                                                                                                                                                                                                                                | Header text at `--text-width`; actions may use the full width.                                                                                                                                                                                                                                                          | Fixed `ee5a309`                                                                                                    |
| SHELL-4 | Medium | The line above the `h1` is used four ways: a link ("Songs"), a back link ("← Back to the chart"), a ghost Button (Studio), and a row of actions (Progression). Index pages put navigation inside the lede (Chords, Chord drill, Chords you know).                                                                                  | The crumb is only the way up or back, worded the same everywhere. Navigation to sub-pages goes in the actions row.                                                                                                                                                                                                      | Fixed `ee5a309`, `5f99b59`, `4875211`, `509fd76`                                                                   |
| SHELL-5 | Medium | Found in the screenshot review. On a 360x780 phone the shell moves Play down on detail pages: Song 774 to 808px, Fill 718 to 801, Progression 515 to 619 and Chart 1006 to 1031 (My song 566 to 530, up). The lede is 1.125rem, as on desktop, and versions and actions are 44px rows. Song and Fill now have Play below the fold. | Your decisions: anything not needed before Play goes below the player, and a 1rem lede under 600px. Song's source credit moves to the end of the page; Fill's description moves under its controls; Chart's Make it playable moves under the player's controls; and the page no longer scrolls itself on load (SONG-6). | Fixed `d1e9162`, `a51fea1`, `b338185`, `5fe4daa`, `24903c7`; guarded by `998a8ad`                                  |
| WIDTH-1 | Medium | 46rem is hard-coded three times and is neither content token.                                                                                                                                                                                                                                                                      | Use `--text-width` for single-column forms and cards.                                                                                                                                                                                                                                                                   | Fixed `3925cb0`                                                                                                    |
| CARD-1  | Low    | Card and section titles range from 1.05rem to 2rem: `Card` uses the page `h2` (1.5–2rem), Studio 1.25, charts 1.15, builder preview 1.1, editor save 1.05, My songs 1.5.                                                                                                                                                           | `Card`'s title style for every card title; page sections keep the `h2`.                                                                                                                                                                                                                                                 | Fixed `3925cb0`                                                                                                    |

### Controls and touch

| Id     | Sev    | Finding                                                                                                                                                                                                                                                                                                                                                        | Fix                                                                                                                                                         | Status                                                                                  |
| ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| CTRL-1 | High   | Touch targets under 44px on `pointer: coarse` on most pages (table above). Only `editorHeader`, `midiHeader` and the take setup override the tokens, each locally.                                                                                                                                                                                             | A global override in `tokens.css` (see "Touch override" below), with the components that don't read tokens moved onto them. Drop the three local overrides. | Fixed `63fe94a`, `cb13846`; guarded by `4f88fca`                                        |
| CTRL-2 | Medium | Mixed control heights in one row on desktop: Play 44 next to Loop 36 (every player), "Find an easier key" 36 next to a 40 Select (Chart), Triplets 36 next to 40 fields (Studio take).                                                                                                                                                                         | Buttons, Toggles and pills read `--control-height` / `--control-height-small` like the form controls do. Decision D2.                                       | Fixed `63fe94a`                                                                         |
| CTRL-3 | High   | Segmented clips its options at 360 with the scrollbar hidden, so options sit off-screen with no sign they exist: Ear training Exercise (328 of 365px shown) and Level (328 of 376), Chords Voicing style (278 of 371), Chord drill How strict (278 of 332), Progression Voicing (302 of 371), Chords you know Mark (278 of 306), Song Score view (328 of 339). | Segmented wraps instead of scrolling. A fixed corner radius (half the control height) keeps one line a pill and makes two lines a rounded box.              | Fixed `6212ef8`, `b35500e`                                                              |
| CTRL-4 | Medium | Segmented stretches to its grid parent's width, options left-aligned in a long empty pill: Chords Voicing style (726px for 357px of options) and Inversion (726 for 164), Chord drill How strict (1070 for 322), Songs "Show" in My songs (1120 for 195), Chart "Chords" (1086 for 246).                                                                       | `justify-self: start` on the group, so it hugs its options in grid and flex parents alike.                                                                  | Fixed `6212ef8`                                                                         |
| CTRL-5 | Low    | Segmented has no visible label where it sits among labelled fields: Songs Level, Progression Voicing, Fill Key mode, Ear training Exercise and Level. Studio already wraps it in `<Field group>`.                                                                                                                                                              | Wrap those in `Field group`.                                                                                                                                | Fixed `b35500e`                                                                         |
| NAV-1  | Medium | At 360 the site nav takes two rows (`<main>` starts at 164px) and its links are 39px tall; the gear is 40 × 40; footer links are 22px tall.                                                                                                                                                                                                                    | 44px targets on touch. The two-row nav itself is deferred: a nav redesign is outside this task.                                                             | Fixed `63fe94a`, `cb13846` (44px targets); the two-row nav is deferred, as planned (D8) |

### Colour

`tokens.css`: amber = right hand / the target note, dusk = left hand / chord
tones, never decorative.

| Id      | Sev    | Finding                                                                                                                                                                                                            | Fix                                                                                                                                                                                                                                                                                         | Status                                                  |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| COLOR-1 | Medium | The primary Button is amber on every page (Play, Save, Start, Hear it, New progression…). In Practice, "Hear it" is amber beside the amber target note.                                                            | Decision D1: an ink primary (recommended), or keep amber as a documented exception.                                                                                                                                                                                                         | Fixed `ab93b29`                                         |
| COLOR-2 | Medium | MIDI workspace (carried item a): active-track border, seek-bar fill and thumb, the recording note's background (`--amber-soft`), and in `MidiRoll` the box-select marquee, the hover cell and the hovered key row. | Ink edge for the active track (as Toggle and the File button do), ink seek fill and thumb, a neutral note (`--surface-sunk`, line border); marquee and hover in ink at low opacity. The active track's notes stay amber: they are the notes being placed, the other tracks are dusk ghosts. | Fixed `8360950`                                         |
| COLOR-3 | Low    | Beta badge: amber tint.                                                                                                                                                                                            | Neutral, like the Private badge.                                                                                                                                                                                                                                                            | Fixed `823882c`                                         |
| COLOR-4 | Low    | Dock "Full Screen" button: amber border on hover and focus.                                                                                                                                                        | Muted border on hover; the focus ring on focus.                                                                                                                                                                                                                                             | Fixed `823882c`                                         |
| COLOR-5 | Medium | Score: the current bar has a dusk ring. Position isn't a chord tone.                                                                                                                                               | Ink ring, like a selected bar in the chart editor and a chosen chord suggestion. Decision D7.                                                                                                                                                                                               | Fixed `823882c`                                         |
| COLOR-6 | Low    | Fills list: "Level 1, right hand, best 96 bpm" is dusk text.                                                                                                                                                       | Muted, like every other card meta.                                                                                                                                                                                                                                                          | Fixed `823882c`                                         |
| COLOR-7 | Low    | The focus ring (`--focus: var(--dusk)`) and `::selection` (`--dusk-soft`) use dusk.                                                                                                                                | Keep: a named token for a state that must show on every surface, not decoration. Documented here, no change.                                                                                                                                                                                | Fixed `0496f67`: kept, with the reason beside `--focus` |

### Accessibility

| Id     | Sev    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                   | Status          |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| A11Y-1 | Medium | Live regions mounted only when they have something to say, which some screen readers miss (carried item b). At `f086b1e` the "That isn't a MIDI file" `role="status"` in `WaysIn` is already kept mounted (since `cf3785c`), but its sibling `role="alert"` (a file that fails to parse) is mounted on error. Others: Studio problem (`role="alert"`) and warning (`role="status"`), Studio "Clap on the click" section (`aria-live`), chart editor save problem (`role="alert"`), chart paste "lyrics removed" notice (`role="status"`, mounted with the review). | Keep each region mounted and change its text; keep the visible box hidden while empty. A unit test per region that it exists before anything happens. | Fixed `0233b4d` |

### Breakpoints

The scale is 600 / 760 / 960. Off-scale `max-width` queries at the base:

| Id   | Sev    | Where                                                                                                                                                                | Today                                                               | Plan                                                                                                                                                  | Status                                                                                  |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| BP-1 | Low    | `charts.module.css` paste review                                                                                                                                     | 480                                                                 | 600: the two-column review becomes one column a little earlier.                                                                                       | Fixed `7ecb752`                                                                         |
| BP-2 | Medium | `chords.module.css` `.layout` (Chords)                                                                                                                               | 860                                                                 | 960, not 760: the three panels need the room (at 800px the chord symbol card would be ~150px wide).                                                   | Fixed `7ecb752`, with a comment                                                         |
| BP-3 | Low    | `chords.module.css` `.knownLayout` (Chords you know)                                                                                                                 | 860                                                                 | 760, as `tokens.css` says for side-by-side panels; check 780–860.                                                                                     | Fixed `7ecb752`                                                                         |
| BP-4 | Low    | `Score.module.css` bar padding and chip size                                                                                                                         | 400                                                                 | 600; check 390 and 412.                                                                                                                               | Fixed `7ecb752`                                                                         |
| BP-5 | Medium | `KeyboardDock.module.css` Full Screen layout (and the `max-height: 500px` variant)                                                                                   | 820                                                                 | 960, so iPad portrait keeps two rows; landscape phones (844–932px) move to two rows too. Check at 844 × 390; if it is worse, keep 820 with a comment. | Fixed `7ecb752`: 844x390 checked, three octaves of piano where there was one and a half |
| BP-6 | Low    | `page.module.css` `.grid4`                                                                                                                                           | 960, 520                                                            | Delete: `.grid4` is used nowhere.                                                                                                                     | Fixed `7ecb752`                                                                         |
| BP-7 | Low    | Media queries as strings in TS: `ProgressionPage` and `FillPage` (×2) use `'(max-width: 600px)'`; `MidiHeader` calls 760 "COMPACT", which `tokens.css` names medium. | Shared constants next to `useMediaQuery`, named as in `tokens.css`. | Fixed `7ecb752`                                                                                                                                       |

`max-height` and `pointer` queries are not widths and stay. After `7ecb752`
no `max-width` query is off the scale. Two choices to note: Chords uses the
wide breakpoint (960) where `tokens.css` gives side-by-side panels the medium
one, with the reason in a comment (BP-2); and Chords you know lays its seven
kinds out with a container query (`min-width: 32rem`), which measures its
column, not the window.

### Code and tests

| Id         | Sev    | Finding                                                                                                                                                                                                          | Fix                                                                                                                                       | Status                                                                                                                                          |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CODE-1     | Low    | Close on a press outside is written twice (Layout settings, Menu); Escape is handled differently in each (carried item f).                                                                                       | A small hook, used by Menu, the settings popover and the new "How to play" popover. Only worth it with that third user; without it, skip. | Fixed `39772d0`; the third user is How to play, `c8f8a07`                                                                                       |
| CODE-2     | Low    | Pages reach into another feature's CSS: Fill uses `SongPage.module.css` (row, spacer, note, tempo, statusLine, chord, counts) and `progressions.module.css`; Fills uses `progressions.module.css` for its cards. | The shell removes the header part. The rest is deferred: moving shared row and card styles is a separate refactor.                        | Deferred: the header part went with `.header` in `b390c8f`; moving the shared player rows and cards into shared CSS is a separate refactor (D8) |
| TEST-1     | Low    | `fills.test.ts` "every fill plays in every key on every change" takes ~1.2s alone and passed 5s in the baseline `npm run check` here (carried item g).                                                           | An explicit timeout with the reason; the check itself unchanged.                                                                          | Fixed `9bdb311`                                                                                                                                 |
| TRANSFER-1 | Medium | `Import.tsx` handles drops by hand (carried item d): it reads any dropped file, ignoring `accept`, and `over` flickers when the drag crosses a child.                                                            | `useFileDrop` with `accept`; a refused file says so in the existing `import-result` status.                                               | Fixed `9b2f946`                                                                                                                                 |

## Input: with or without a MIDI keyboard

Nothing is blocked on MIDI today: every practice page takes the on-screen
keys, the computer keys and MIDI through one note stream.

| Id      | Sev    | Finding                                                                                                                                                                                                    | Fix                                                                                                                                                                                                                        | Status                                           |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| INPUT-1 | High   | The dock only talks about MIDI ("Connect MIDI" or the device). On a phone nothing says to tap the keys; on a desktop the computer-key hint shows, but nothing says which input is in use or how to switch. | One indicator in the dock, the same on every page: "MIDI: ‹device›", "Computer keys" or "Tap the keys". Active = the last input used; before any note, a connected MIDI device, else computer keys with a mouse, else tap. | Fixed `b88755a`, `bd6e50a`; guarded by `4f88fca` |
| INPUT-2 | Medium | The computer-key map is written out three times: the dock hint, the Home welcome and About. `Z`/`X` live only inside `ComputerKeys.handleKeyDown`.                                                         | A "How to play" popover from the indicator, built from `KEY_CODE_OFFSETS` / `KEY_HINTS`, with the octave keys exported from `computerKeys.ts`. Home and About read the same values.                                        | Fixed `c8f8a07`; guarded by `4f88fca`            |
| INPUT-3 | Medium | Choosing among several MIDI inputs is only possible on `/keyboard` (linked from the footer).                                                                                                               | The popover holds Connect MIDI, the input picker and the blocked-in-settings message.                                                                                                                                      | Fixed `c8f8a07`                                  |
| INPUT-4 | Medium | `data-testid="midi-status"` is on two elements once MIDI access is granted and the MIDI editor shows the keyboard: the dock's device line and the editor's status line (which e2e uses).                   | The new indicator gets its own test id; the editor keeps `midi-status`. Decision D9.                                                                                                                                       | Fixed `b88755a`                                  |
| INPUT-5 | Medium | Dock "Connect MIDI" is 28px tall.                                                                                                                                                                          | Folded into the indicator, 44px on touch.                                                                                                                                                                                  | Fixed `63fe94a`, `c8f8a07`                       |
| INPUT-6 | Low    | Found in the screenshot review. In Practice at 360 the dock's new input button wrapped alone under "Right hand, target" and "Left hand": the empty spacer before it was a flex item and added a gap.       | Full Screen, the input and the key hint as one group at the legend's end, no spacer.                                                                                                                                       | Fixed `bd6e50a`                                  |

### Touch override

Proposed in `tokens.css`:

```css
@media (pointer: coarse) {
  :root {
    --control-height: 44px;
    --control-height-small: 44px;
  }
}
```

Safe for `--control-height` everywhere I found. Not safe on its own for
`--control-height-small`: the SongEditor chord lane is a fixed 40px
(`LANE_PX` in `EditorRoll.tsx`) with a small Select inside it at `top: 4px`, so
a 44px select would overlap the roll. The lane has to grow on touch in the same
commit. Segmented draws its options 8px shorter than the group; on touch each
option's hit area extends over the group's padding so the target is the full
44px without changing how it looks. Hybrid laptops report a fine primary
pointer, so they keep desktop sizes.

Done in `63fe94a`, as proposed: the chord lane's height is now the small
control height plus 8px (52px on touch) instead of the fixed `LANE_PX`, and
the three local overrides (`editorHeader`, `midiHeader`, the take setup) are
gone.

## Page by page

### Home `/`

| Id     | Sev | Finding                                                           | Fix      | Status          |
| ------ | --- | ----------------------------------------------------------------- | -------- | --------------- |
| HOME-1 | Low | The welcome copy hard-codes the key map ("A to ' play C4 to F5"). | INPUT-2. | Fixed `c8f8a07` |

### Songs `/songs`

| Id      | Sev    | Finding                                                                                                                                      | Fix                                                                                          | Status                                                                                                                                                                                                                                                                            |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SONGS-1 | Medium | The hero holds a second paragraph ("Make your own in Studio…").                                                                              | Lede plus a "Studio" link in the actions row.                                                | Fixed `ee5a309`                                                                                                                                                                                                                                                                   |
| SONGS-2 | Medium | `grid-auto-rows: 1fr` makes every card as tall as the tallest even in one column: at 360 Senja di Teras has a 128px gap above its last line. | Equal rows only when there is more than one column.                                          | Deferred: fixed in `3925cb0`, then undone in `5fb9187`: the library spec asserts on both projects that every card is the same height, versions or not, and the phone run failed. Letting a card be as tall as it needs in one column means changing that rule, a decision for you |
| SONGS-3 | Low    | Version links wrap one alone ("Advanced") when a best score widens "Easy" (Canon in D at 1280).                                              | Versions as a three-column grid inside the card.                                             | Fixed `b35500e`                                                                                                                                                                                                                                                                   |
| SONGS-4 | Medium | My songs "Show" Segmented stretched to 1120px.                                                                                               | CTRL-4.                                                                                      | Fixed `6212ef8`                                                                                                                                                                                                                                                                   |
| SONGS-5 | Low    | Filters: Level has no visible label beside labelled Composer and Search; at 820 Search wraps alone.                                          | CTRL-5; Search keeps the row at 820.                                                         | Fixed `b35500e`                                                                                                                                                                                                                                                                   |
| SONGS-6 | Low    | My songs actions wrap 2 + 2 at 360 ([New chord chart][Export] / [Import file][Paste JSON]).                                                  | Section head: title on one line, actions on the next, under 600px. Shared with Progressions. | Fixed `b35500e`: re-measured, My songs already wraps as two pairs under its title (the check counted the import pair as one item); Progressions now matches it                                                                                                                    |

### Song `/songs/:id`

| Id     | Sev    | Finding                                                                                                                                                                                                                                                                                                                                           | Fix                                                                                                                                                                                                | Status                                                                                               |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SONG-1 | High   | "Export .mid" is a ghost Button stretched across the header (a grid item), its label centred on a line of its own, at every width.                                                                                                                                                                                                                | Shell actions row; with D3 one Export menu.                                                                                                                                                        | Fixed `ee5a309`, `20e56b9`                                                                           |
| SONG-2 | Medium | Nine stacked header lines; on a 360 × 780 phone Play sits at 774px, at the fold.                                                                                                                                                                                                                                                                  | Credit, facts and versions in the lede, the level note under the versions, one Export; the source credit at the end of the page, after the score, as a small "Source" line; a 1rem lede on phones. | Fixed `ee5a309`, `20e56b9`, `a51fea1`, `d1e9162`, `24903c7`: Play at 704–748px; guarded by `998a8ad` |
| SONG-3 | High   | Player rows orphan on a phone: [Listen/Practice][Melody] then [Left hand] alone; [Play][Restart][Loop] then [Metronome] alone. Same on My song, Chart and Progression (Comping alone).                                                                                                                                                            | Hands as one group that wraps as a block; transport and options as two groups.                                                                                                                     | Fixed `be182a1`                                                                                      |
| SONG-4 | Low    | "Reset arrangement" wraps alone under five fields at 1280; sits beside them at 820.                                                                                                                                                                                                                                                               | Reset at the end of the note line, in the same place at every width.                                                                                                                               | Fixed `b35500e`                                                                                      |
| SONG-5 | Low    | The arrangement `<summary>` is 36px tall.                                                                                                                                                                                                                                                                                                         | 44px on touch.                                                                                                                                                                                     | Fixed `63fe94a`                                                                                      |
| SONG-6 | High   | Found while writing the Play check. The score keeps the current bar in view by scrolling the page, and did so when it first appeared: on a phone the first bar sits under the keyboard dock, so a song, a chart, a progression and a song of your own scrolled themselves 500 to 1,060px down on load, past the header and Play. In the base too. | Follow the bar only when the bar or the view changes, not when the score first appears.                                                                                                            | Fixed `24903c7` (with a unit test); guarded by `998a8ad`                                             |

### My song `/songs/mine/:id`

| Id       | Sev  | Finding                                                                                                                                 | Fix                                                                                                                                                                                | Status                     |
| -------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| MYSONG-1 | High | Two action rows ([Edit] "No recording kept." / [Export .mid][Download .json][Copy as JSON]); at 360 "Export .mid" is alone on its line. | One actions row: Edit, Export (D3), "Include the recording" beside Export when there is one. Recording size in the lede; "Delete the recording" with the other delete at the foot. | Fixed `833b4c2`, `20e56b9` |
| MYSONG-2 | Low  | The Private badge is a line of its own between the `h1` and the facts.                                                                  | Badges start the lede line.                                                                                                                                                        | Fixed `833b4c2`            |

### Chart `/songs/charts/:id`

| Id      | Sev    | Finding                                                                                                  | Fix                                                                                                                      | Status                                                   |
| ------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| CHART-1 | Medium | Actions mix three looks: Edit (small secondary link), Show function (Toggle), Download and Copy (ghost). | Shell actions row: Edit, Show function, Export (D3).                                                                     | Fixed `833b4c2`, `20e56b9`, `63fe94a`                    |
| CHART-2 | Medium | On a phone Play is 1006px down: "Make it playable" sits between the header and the player.               | Make it playable under the player's controls, before the score, at every width (a `belowControls` slot on LessonPlayer). | Fixed `5fe4daa`: Play at 566–610px; guarded by `998a8ad` |
| CHART-3 | Low    | "Chords" Segmented in Make it playable stretched to 1086px.                                              | CTRL-4.                                                                                                                  | Fixed `6212ef8`                                          |

### Chart editor `/songs/charts/new`, `/songs/charts/:id/edit`

| Id        | Sev    | Finding                                                                                                       | Fix                                   | Status          |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------- |
| CHARTED-1 | Medium | Form chip buttons (earlier / later / remove) are 26 × 26; section ↑ ↓ are 37 × 36.                            | 44px on touch.                        | Fixed `63fe94a` |
| CHARTED-2 | Low    | "The chords suggest [C major] or [F major] ." puts buttons inside a sentence; at 360 "F major ." wraps alone. | Label, then the key buttons as a row. | Fixed `b35500e` |
| CHARTED-3 | Low    | Title and section inputs don't fill the card at 360 (218px of 294).                                           | Full width under 600px.               | Fixed `b35500e` |
| CHARTED-4 | Low    | Crumb reads "Songs" for a new chart and "← Back to the chart" when editing.                                   | SHELL-4 wording.                      | Fixed `833b4c2` |

### Chords `/chords`

| Id       | Sev    | Finding                                                                      | Fix                    | Status                     |
| -------- | ------ | ---------------------------------------------------------------------------- | ---------------------- | -------------------------- |
| CHORDS-1 | Medium | "Drill chords · Chords you know" are links inside the lede.                  | Actions row.           | Fixed `5f99b59`            |
| CHORDS-2 | Medium | Voicing style and Inversion stretched at 1280; Voicing style clipped at 360. | CTRL-3, CTRL-4.        | Fixed `6212ef8`, `b35500e` |
| CHORDS-3 | Low    | Quality pills leave one alone at 1280 ("sus4", "dim7") in the 320px column.  | Pills on an even grid. | Fixed `b35500e`            |
| CHORDS-4 | Low    | "Voicing" card title 2rem beside "How it is built" at 0.95rem.               | CARD-1.                | Fixed `3925cb0`            |
| CHORDS-5 | Low    | 860px breakpoint.                                                            | BP-2.                  | Fixed `7ecb752`            |

### Chord drill `/chords/drill`

| Id      | Sev    | Finding                                             | Fix                                          | Status          |
| ------- | ------ | --------------------------------------------------- | -------------------------------------------- | --------------- |
| DRILL-1 | Medium | "Back to chords" inside the lede.                   | Crumb "← Chords".                            | Fixed `5f99b59` |
| DRILL-2 | Medium | How strict stretched at 1280, clipped at 360.       | CTRL-3, CTRL-4.                              | Fixed `6212ef8` |
| DRILL-3 | Low    | During a round at 360, "Change chords" wraps alone. | Ghost action on its own row, at every width. | Fixed `be182a1` |

### Chords you know `/chords/known`

| Id      | Sev    | Finding                                                  | Fix                                                                       | Status          |
| ------- | ------ | -------------------------------------------------------- | ------------------------------------------------------------------------- | --------------- |
| KNOWN-1 | Medium | Seven-line lede at 360 ending in a "Chord library" link. | Crumb "← Chords"; the counting rule moves to a note under the chord grid. | Fixed `5f99b59` |
| KNOWN-2 | Medium | Mark Segmented clipped at 360.                           | CTRL-3.                                                                   | Fixed `6212ef8` |
| KNOWN-3 | Low    | 860px breakpoint.                                        | BP-3.                                                                     | Fixed `7ecb752` |

### Progressions `/progressions`

| Id      | Sev | Finding                                     | Fix      | Status          |
| ------- | --- | ------------------------------------------- | -------- | --------------- |
| PROGS-1 | Low | "Yours" section head wraps unevenly at 360. | SONGS-6. | Fixed `b35500e` |

### Progression `/progressions/:id`

| Id     | Sev    | Finding                                                                                                                                    | Fix                                                              | Status                                |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------- |
| PROG-1 | High   | Edit or "Make a copy to edit" and the two export buttons sit in the crumb line; at 360 that line wraps to two and the `h1` drops to 100px. | Crumb "← Progressions"; actions row: Edit / Make a copy, Export. | Fixed `4875211`, `20e56b9`            |
| PROG-2 | Medium | "Smooth voice leading" wraps alone at 1280 after the Voicing Segmented.                                                                    | Settings as two rows: Key, Pattern, Fill / Voicing, Smooth.      | Fixed `b35500e`                       |
| PROG-3 | Medium | Voicing clipped at 360 inside the folded settings; Comping alone on its row.                                                               | CTRL-3, SONG-3.                                                  | Fixed `6212ef8`, `be182a1`, `b35500e` |

### Progression builder `/progressions/new`, `/progressions/:id/edit`

| Id      | Sev    | Finding                                                  | Fix                         | Status          |
| ------- | ------ | -------------------------------------------------------- | --------------------------- | --------------- |
| BUILD-1 | Low    | The numeral palette leaves "V7/V" alone at 1280 and 820. | Palette on an even grid.    | Fixed `b35500e` |
| BUILD-2 | Medium | "Cancel" is a 24px text link beside 44px buttons.        | A ghost Button-styled link. | Fixed `63fe94a` |
| BUILD-3 | Low    | Form width 46rem.                                        | WIDTH-1.                    | Fixed `3925cb0` |

### Fills `/fills`

| Id      | Sev | Finding            | Fix      | Status          |
| ------- | --- | ------------------ | -------- | --------------- |
| FILLS-1 | Low | Card meta in dusk. | COLOR-6. | Fixed `823882c` |

### Fill `/fills/:id`

| Id     | Sev    | Finding                                                                                         | Fix                                                                                     | Status                                                                                      |
| ------ | ------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| FILL-1 | Medium | The lede is one 116-character line at 1280.                                                     | SHELL-3.                                                                                | Fixed `324089d`                                                                             |
| FILL-2 | Low    | Key mode Segmented unlabelled beside Key and Change.                                            | CTRL-5.                                                                                 | Fixed `b35500e`                                                                             |
| FILL-3 | Medium | At 360 "Chords" is alone on its row; at 820 "Then faster by" wraps alone in the speed settings. | SONG-3 grouping; speed settings as a two-column grid.                                   | Fixed `be182a1`                                                                             |
| FILL-4 | Low    | The fill panel isn't sticky; the song player's is.                                              | Deferred: the fill strip is short, so a sticky panel would cover most of it on a phone. | Deferred: the fill strip is short, so a sticky panel would cover most of it on a phone (D8) |

### Ear training `/ear`

| Id    | Sev  | Finding                                                                                    | Fix      | Status          |
| ----- | ---- | ------------------------------------------------------------------------------------------ | -------- | --------------- |
| EAR-1 | High | Exercise and Level clipped at 360: "Progressions" and "Mixed" are off-screen with no sign. | CTRL-3.  | Fixed `6212ef8` |
| EAR-2 | Low  | Card width 46rem.                                                                          | WIDTH-1. | Fixed `3925cb0` |
| EAR-3 | Low  | Exercise and Level have no visible labels.                                                 | CTRL-5.  | Fixed `b35500e` |

### Progress `/progress`

No findings beyond the shell.

### Studio `/studio`

| Id       | Sev    | Finding                                                                                                 | Fix                                                                        | Status                                |
| -------- | ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| STUDIO-1 | High   | With the MIDI editor open there is no `h1`: the landing's is hidden and the editor starts with an `h2`. | Shell with `h1` "MIDI piano-roll editor" (the name e2e already looks for). | Fixed `509fd76`; guarded by `4f88fca` |
| STUDIO-2 | Medium | The take editor and draft player put a 36px ghost Button above the `h1`, unlike every other crumb.      | Shell crumb: same look as a link, a button underneath.                     | Fixed `509fd76`                       |
| STUDIO-3 | Medium | Take controls at 1280: Octave wraps alone; Triplets (36) sits beside 40px fields.                       | Two rows: key / grid; and CTRL-2.                                          | Fixed `b35500e`, `63fe94a`            |
| STUDIO-4 | Low    | Beta badge in amber.                                                                                    | COLOR-3.                                                                   | Fixed `823882c`                       |

### Studio take editor and Edit song (SongEditor)

| Id     | Sev    | Finding                                                                                                                                                                   | Fix                                                                                                                                              | Status                                                                                                                                            |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TAKE-1 | Medium | Without a take (a saved song with no kept recording) the listen row holds only "Play chords"; under 760px it is a full-width toggle on a row of its own (carried item e). | "Play chords" joins Play in the header's Playback group, with or without a take; the listen row then exists only with a take (Hear, Pitch line). | Fixed `692bd15`                                                                                                                                   |
| TAKE-2 | Medium | The help paragraph under the roll is 5–6 lines at 360.                                                                                                                    | A "How to edit" disclosure, as for MIDI-2.                                                                                                       | Fixed `509fd76`                                                                                                                                   |
| TAKE-3 | Low    | The title box is ~100px at 360 ("Arpeggio st").                                                                                                                           | Deferred: header parity with the MIDI editor is out of scope.                                                                                    | Fixed `692bd15`: planned as deferred (D8), but with Chords beside Play the tools wrap under the title, which now has the row to itself on a phone |

### Studio MIDI editor and Edit song (MidiWorkspace)

| Id     | Sev    | Finding                                                                                        | Fix                                                                                                                | Status                                                                                                             |
| ------ | ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| MIDI-1 | Medium | Decorative amber.                                                                              | COLOR-2.                                                                                                           | Fixed `8360950`                                                                                                    |
| MIDI-2 | Medium | The help paragraph is 7 lines at 360 (carried item c).                                         | One-line lede; the details in a "How to edit" disclosure as a list.                                                | Fixed `509fd76`                                                                                                    |
| MIDI-3 | High   | Track mute buttons 34 × 34; seek bar 22px tall; track inspector fields 32px.                   | 44px on touch: mute buttons on the Button `icon` size, the seek bar's hit area 44px, fields by the token override. | Fixed `63fe94a`; guarded by `4f88fca`                                                                              |
| MIDI-4 | Medium | On Edit song: `h1` "Edit Minuet sketch", then `h2` "MIDI piano-roll editor" and its paragraph. | The workspace drops its own heading; the page's shell names it.                                                    | Fixed `509fd76`                                                                                                    |
| MIDI-5 | Low    | The "Import/export preserves…" paragraph is 9 lines at 360.                                    | Into a "What a .mid keeps" disclosure.                                                                             | Fixed `509fd76`                                                                                                    |
| MIDI-6 | Low    | Workspace spacing in raw px (5, 6, 8, 10, 12) and its own 12px radius.                         | Spacing and radius tokens.                                                                                         | Deferred: a token pass over one file that changes nothing on screen at these sizes; left for a Studio-only cleanup |

### Keyboard `/keyboard`

| Id     | Sev | Finding                                                                  | Fix                        | Status          |
| ------ | --- | ------------------------------------------------------------------------ | -------------------------- | --------------- |
| KEYS-1 | Low | Card titles at 2rem ("What you are playing" wraps).                      | CARD-1.                    | Fixed `3925cb0` |
| KEYS-2 | Low | "Change note names at the top of the page": they are under the gear now. | "…in Settings (the gear)". | Fixed `3925cb0` |

### About `/about`

| Id      | Sev | Finding                                                                   | Fix             | Status                     |
| ------- | --- | ------------------------------------------------------------------------- | --------------- | -------------------------- |
| ABOUT-1 | Low | Inline `style={{ marginBottom: 0 }}` on the hero; the key map hard-coded. | Shell; INPUT-2. | Fixed `b390c8f`, `c8f8a07` |

### Not found `*`

No findings beyond the shell.

## Carried-over items

| Item                                      | Finding    | Status          |
| ----------------------------------------- | ---------- | --------------- |
| a. Decorative amber in the MIDI workspace | COLOR-2    | Fixed `8360950` |
| b. Live regions mounted only when shown   | A11Y-1     | Fixed `0233b4d` |
| c. MIDI help paragraph, 7 lines at 360    | MIDI-2     | Fixed `509fd76` |
| d. Import without `useFileDrop`           | TRANSFER-1 | Fixed `9b2f946` |
| e. SongEditor listen row without a take   | TAKE-1     | Fixed `692bd15` |
| f. Shared close-on-outside / Escape       | CODE-1     | Fixed `39772d0` |
| g. Fills test near its timeout            | TEST-1     | Fixed `9bdb311` |
