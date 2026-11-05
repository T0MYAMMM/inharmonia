# Inharmonia

A calm practice room for piano harmony: chords, inversions, voicings, progressions, comping
patterns and fills, learned hands-on at the keys. React 18 + TypeScript + Vite, no backend.

## Setup

Requires Node 20.19+ (see `.nvmrc`).

```sh
npm install
npm run dev          # http://localhost:5173/inharmonia/
```

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                          |
| `npm run build`     | Typecheck and build to `dist/`                      |
| `npm run preview`   | Serve the production build                          |
| `npm test`          | Unit and component tests (Vitest + Testing Library) |
| `npm run test:e2e`  | Playwright smoke tests, desktop and 360 px mobile   |
| `npm run lint`      | ESLint                                              |
| `npm run format`    | Prettier (write); `format:check` to verify          |
| `npm run typecheck` | TypeScript, strict                                  |
| `npm run songs`     | Build the song library; `-- --check` to verify      |
| `npm run check`     | Lint, format check, typecheck, songs check, tests   |

Playwright needs a Chromium build: run `npx playwright install chromium` once (CI does this
itself).

## Deployment

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`. In the
repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once.

The base path lives in one place, `config/site.ts` (`BASE_PATH = '/inharmonia/'`). Vite's
`base`, the router `basename` and the Pages `404.html` fallback all derive from it. To host at a
domain root, set it to `'/'`.

GitHub Pages has no SPA rewrites, so the build emits a `404.html` that turns the requested path
into a query string and redirects to the app, and `index.html` restores the URL before the router
reads it. Deep links like `/inharmonia/about` work.

### Offline and install

The production build is a PWA (`vite-plugin-pwa`, configured in `vite.config.ts`). The service
worker precaches the app (every room's code, Tone.js included), its styles, the self-hosted fonts,
the icons and the library's index. The piano samples wait for a room that plays (one with a
keyboard, Ear training, the progression builder or Studio): once one has opened, the worker is
installed and the page is idle, `src/app/sampleWarm.ts` caches them in the one format this browser
plays (about 1.5 MB of Ogg, or 1.7 MB of MP3), unless the browser asks to save data. A visit that
stays out of those rooms fetches no samples, which matters on metered mobile data. The worker reads
them cache-first, and the piano caches them as it plays, too. After the first visit, everything
works offline, including deep links, which fall back to `index.html`; the piano needs a room that
plays to have been opened once online, and plays the synth until then. Catalogue songs are not
precached: each works offline once it is downloaded (see [Song library](#song-library)). The worker
updates itself in the background (`registerType: 'autoUpdate'`). The manifest and icons in
`public/icons/` make it installable, and its scope and start URL follow `BASE_PATH`.
`src/app/pwa.ts` registers the worker in production only, and the footer says "Ready to use
offline" once it is.

## Folder overview

```
config/site.ts          base path, shared by Vite, the router and the 404 fallback
config/library.ts       the built-in pieces, retired piece ids, and the catalogue's size caps
public/samples/         piano samples, one versioned folder (salamander/v1)
public/library/         the song catalogue: one file per piece, and its index (npm run songs)
src/
  core/                 framework-agnostic TypeScript; no React here
    theory/             chords from symbols, inversions, voicings, Roman numerals, voice leading
    audio/              tempo map, swing, lookahead transport, Tone.js engine, sample list
    input/              unified note stream: pointer, computer keys, Web MIDI
    notation/           letter names, Roman numerals, not angka formatting
    content/            the lesson content format, compiler, progression realizer, text parser, fills
    transcription/      voice to notes: pitch frames, segmentation, key, quantization, fixtures, eval
    songs/              your songs: the editable draft, edits and undo, kept recordings
    charts/             chord charts: symbols, section names, bar syntax, paste parser, chord timing
                        from lyrics (fixtures, eval, vectors), key, compile
    format/             the readable JSON file format for export, import and transfer
    library/            pieces: the .piece format, the Easy/Medium/Advanced generator, the catalogue
                        index and its rules, and the build behind npm run songs
    persistence/        safe localStorage and versioned documents with migrations
  state/                Zustand stores (settings, progress, your progressions), review, key highlights,
                        Your songs and downloaded catalogue songs in IndexedDB, the catalogue index
  app/                  router, layout, theme, singletons (services.ts) and hooks
  ui/                   design-system components and the keyboard dock
  features/             one folder per page
  styles/               tokens.css (palette, light and dark) and global.css
e2e/                    Playwright tests
docs/format/            the file format (JSON Schema, notes, one example per kind), the song index and
                        the piece source format
docs/composing.md       how a composer's song gets into the catalogue
scripts/                build-songs.ts (npm run songs), the transcription eval and the chord timing eval
docs/screenshots/       screenshots attached to each phase's pull request
```

### How the pieces talk

- `app/services.ts` owns one `AudioEngine`, one `NoteStream`, one `KeyLights` and a shared
  `Transport`. Every input source (pointer, computer keys, MIDI) feeds the `NoteStream`; a single
  subscriber plays the note and lights the key.
- The `Transport` is a lookahead scheduler. A worker ticks every 25 ms; each tick schedules
  everything due in the next 100 ms on the audio clock. Times come from a piecewise tempo map, so
  a tempo change mid-playback takes effect at the scheduling horizon with no drift. Loops,
  start-from-bar, pause and resume, per-hand mute, metronome, count-in and swing are all part of
  the transport and covered by tests with a fake clock.
- Tone.js is only used for the audio context, the sampler and the synth fallback. It is loaded on
  the first user gesture. Its context runs with `lookAhead: 0` because the transport does the
  lookahead itself, and live notes play at `Tone.immediate()`.
- Visuals that follow playback run on `requestAnimationFrame` and read the transport's beat at
  `currentTime − outputLatency`, so the lights match what you hear. Keys subscribe to `KeyLights`
  one by one and update their `data-layers` attribute directly; the keyboard never re-renders
  while playing.

### Colour meaning

Amber is the right hand or the target note. Dusk blue is the left hand or chord tones. Red is a
wrong press. These colours are never decorative.

### Notation

The note-name setting and the Light/Dark/Auto theme both live in the **Display** menu at the
right of the header, at every width. The note-name setting has three systems:

- **Letters**: notes as letters, spelled for the key (F♯ in D major, B♭ in F), chords as symbols.
- **Roman**: notes as letters, chords as Roman numerals (iii7, V⁶, ♭VII).
- **Not angka**: Indonesian numbered notation, do-based. Minor keys use the relative major's do,
  so A minor shows "do = C" and the tonic is 6. The undotted octave starts at the do nearest
  middle C (ties go up). Chromatic notes get a slash through the digit (forward for raised,
  backslash for lowered), drawn with CSS; a setting switches to a ♯/♭ suffix. Chords stay as
  letter symbols, the way Indonesian songbooks print them.

Roman numerals are always read against the major scale of the tonic, with explicit accidentals,
in every mode. In A minor, `i ♭VII ♭VI V` is Am G F E.

## Adding a lesson

Lessons use the format in `src/core/content/types.ts`. A lesson is plain JSON-compatible data:

```ts
import { DEFAULT_RULES, LESSON_SCHEMA_VERSION, type Lesson } from '@/core/content/types';

export const myLesson: Lesson = {
  id: 'my-lesson',
  schemaVersion: LESSON_SCHEMA_VERSION,
  title: 'My lesson',
  kind: 'song',
  source: { kind: 'original', author: 'You' },
  key: { tonic: 'D', mode: 'major' },
  meter: { beats: 4, unit: 4 },
  tempo: { default: 76, min: 50, max: 110 },
  lhPattern: 'arpeggio-8ths',
  rules: DEFAULT_RULES, // right hand waits, left hand plays itself
  bars: [
    {
      chords: [{ symbol: 'Dmaj7', beats: 4, voicing: { notes: ['D2', 'A2', 'C#3', 'F#3'] } }],
      rh: [
        { note: 'A4', beats: 1 },
        { note: 'F#4', beats: 0.5 },
        { note: 'E4', beats: 0.5 },
        { note: 'F#4', beats: 2 },
      ],
    },
  ],
};
```

- `rh` beats in each bar should add up to the bar length. Use `"r"` for a rest.
- `tie: true` on a note ties it to the next note of the same hand, which must be the same
  pitch: the next one in the bar, or the first of the next bar (a note held over the barline
  is written as two tied notes). The pair sounds as one held note, practice waits only for the
  first, and the score draws a tie arc between the two chips, split at the bar edge when it
  crosses a barline.
- A chord's `voicing` is either explicit notes or a style (`close`, `open`, `drop2`, `shell`,
  `rootless`) with an optional inversion.
- `lhPattern` names a left-hand pattern from `src/content/patterns.ts`; a bar with its own `lh`
  overrides it. Pattern steps pick voices from the chord's voicing by index (negative counts
  from the top), `'all'` for the whole voicing, or `'root'` / `'fifth'` for a bass note below it.
  Patterns restart on each chord and stop at the chord change.
- `section` on a bar starts a titled section in the score ("Verse", "Chorus").
- `lhFigure` gives a piece its own left-hand figure (a pattern written into the lesson), used
  instead of `lhPattern`.
- Content must be original, generic theory material, or public domain under both rules in
  [Song library](#song-library). Do not transcribe copyrighted songs.

Songs are not written as TypeScript: they are JSON files in the export format, read by the same
reader as imports. The few built-in songs are bundled from `src/content/songs/`
(`src/content/lessons.ts`); every other song is in the catalogue, downloaded on request.
Arranged pieces are written as `.piece` sources, and composers make theirs in Studio; both are
described next.

`compileLesson` (`src/core/content/compile.ts`) turns a lesson into bars, chords with resolved
voicings, and one timeline for the transport. Melody notes sound for 95% of their written length
so repeated notes re-strike cleanly; a tied chain sounds for its whole length, released like its
last note.

## Song library

The Songs page has three parts:

- **Your songs:** the songs on this device, which play offline. The built-in pieces (Twinkle,
  Twinkle, Little Star; Ode to Joy; Für Elise, named in `config/library.ts`) come with the app,
  then the catalogue songs you downloaded, by title, then **Made by you** (see
  [Your songs](#your-songs)). A downloaded song has **Update** when the catalogue has a newer
  file, and **Remove**, which asks first and keeps your progress.
- **Make your own:** the way into Studio.
- **Catalogue:** every other song, to download. It filters by level and composer, searches by
  title or composer, and pages nine at a time. Each card has **Download**, **Update** or "On
  this device".

One card component (`SongCard`) draws every piece from its index entry, so the page loads no
song to list them. Each card opens with the piece's first bars on a staff, drawn from the entry's
preview (`StaffBars` in `src/ui/art`). Each piece comes in up to three versions; each song page
names its version, links to the others, and says which bars of the original it covers. Home's
welcome and the first starter on Progress open Twinkle, Easy: it starts on C, stays on the white
keys and uses six notes within a sixth.

### The catalogue

- **Files.** Each catalogue song is one file in the export format at
  `public/library/<piece>.json`, served next to the app, with `public/library/index.json`
  listing them ([the song index](docs/format/README.md#the-song-index)). The built-in songs have
  an index too, `src/content/songs/index.json`, bundled for Home and the Songs page.
- **Downloading** (`src/state/download.ts`) checks the file at the boundary, in order: a plain
  file name on the app's own origin; the size cap (512 kB); its SHA-256 against the index, asked
  once more with `cache: 'reload'` if it differs, since GitHub Pages caches for ten minutes; the
  reader; and the catalogue rules. Only then is it stored, in its own IndexedDB database,
  `inharmonia-library` (`src/state/downloads.ts`), apart from your songs, as the file it came
  as, read again when played. The browser is asked to keep it. Each failure has plain words:
  offline, unreachable, a failed request, being updated, unreadable, no room on the device,
  storage blocked.
- **Links.** `/songs/:id` looks for the song built in, then downloaded, then in the catalogue.
  A catalogue song not on this device shows its title, credit, versions and size, and
  **Download**; the player then appears in place with focus on Play. A retired piece's link
  (`RETIRED_PIECES`: Senja di Teras, Lanterns at Dusk, Morning Ferry, Window Light) says "This
  piece is no longer in Inharmonia."
- **Progress** keeps every song's progress by its id, wherever the song is. Home names the songs
  on this device; the Progress page also reads the catalogue's index, so a song removed from
  this device stays listed as "Song, not downloaded", linking to its download. A retired piece's
  progress stays hidden.
- **Offline**, the built-in and downloaded songs play. The catalogue still lists, from the
  index the service worker keeps, and says downloads need a connection. A catalogue song's link
  still shows the song, with **Download** off and "You're offline. This song downloads when
  you're back online."; it comes back on when the browser does, and never starts by itself.
- **Updates** are never automatic: a new SHA-256 in the index shows **Update** on the song's
  card and page.

### Building the library

- **`npm run songs`** (`scripts/build-songs.ts`, around the pure `src/core/library/build.ts`)
  builds each `src/content/songs/sources/*.piece` into `src/content/songs/<piece>.json` (built
  in) or `public/library/<piece>.json` (the catalogue), checks each composer's file in
  `public/library/` and writes it the app's way, writes both indexes, and prints the bars where
  Easy merged notes, to check by ear.
- **`npm run songs -- --check`**, in CI and `npm run check`, writes nothing and fails on a stale
  file, anything the reader refuses, any catalogue rule (`src/core/library/rules.ts`: songs
  only, one to three versions with ids `<piece>-<level>`, one title and one credit, an original
  with its composer or public domain proved for this year), a misnamed file, a retired or
  duplicate id, a song file over 512 kB, a stray song file among the built-ins, or an index over
  50 kB gzipped.
- **Tests** compile every version of every song, built in and in the catalogue; e2e plays the
  nine built-in versions.

### Arranged pieces

- **Sources** are written in a compact text format, one per piece, in
  `src/content/songs/sources/*.piece` ([docs/format/source.md](docs/format/source.md)).
- **The generator** (`src/core/library/generate.ts`) uses the chord-chart tools from phase 8:
  - _Easy:_ the main theme in the nearest easy key (C, G or F; A, E or D minor), each beat
    playing the note sounding at its start (bars marked `easy-keep` stay as written), triads,
    and one held bass note per chord.
  - _Medium:_ the main theme as written, chords up to sevenths with any slash bass kept in the
    left hand, and a simple pattern for the meter.
  - _Advanced:_ the fuller piece as written, original chords, and the piece's own left-hand
    figure, or the left hand written out where the source gives it.
- **Public domain, proved.** The app is public and used from Indonesia, so a public-domain piece
  ships only if everyone whose work it uses died at least 70 full years ago (Indonesia, EU)
  **and** it was first published at least 96 years ago (US). Each source records `composer`,
  `composerDied`, `firstPublished` and the early `edition` the notes were taken from, plus the
  edition's `editor` and `editorDied` and any arranger. An editor counts toward life + 70 only
  if their own additions are used, which they normally are not: only the original notes are
  taken. The catalogue rules check every piece against both rules, computed from the current
  year (`src/core/content/publicDomain.ts`). Notes come only from early editions, never from
  modern editorial additions or published simplifications.
- **Meters.** Songs can be in 2/4, 3/4, 4/4 or 3/8 (`SONG_METERS` in
  `src/core/content/types.ts`). Beats count the written beat, so a 3/8 bar has three
  eighth-note beats and its tempo counts eighths; Für Elise is the first piece in 3/8.

### Composers

Composers the owner invites make their songs in Studio, put the versions together at
`/compose` (not linked from the app; checked live by the same rules), listen through Import,
and add the file by pull request, or send it to the owner, who opens one. Composers keep their
copyright and allow Inharmonia to distribute their pieces free in the app. A MIDI song made in
Studio carries its piece, level, summary and credit in the file. The whole process, with the
pull request checklist: [docs/composing.md](docs/composing.md).

## Song player

`/songs/:id` has two modes, driven by `src/features/song/SongController.ts` (plain TypeScript,
tested with a fake clock):

- **Listen:** Play/Pause resumes where it stopped; Restart goes to bar 1. Loop is on by default;
  with it off, playback stops after the last beat. Tempo, loop and the melody and left-hand
  toggles all work mid-playback. The sounding melody note lights amber and the current chord's
  voicing dusk. Click a bar, or press Enter or Space on it, to play from there. Space toggles
  play when nothing else has focus.
- **Practice:** waits for each target (`src/core/practice/waitSession.ts`), with a hand selector:
  - _Right hand:_ each melody note. When a note starts a new chord, the left-hand voicing rolls
    in.
  - _Left hand:_ each chord, recognised from the notes you hold, in any octave or inversion. The
    melody of that chord plays along.
  - _Both hands:_ each melody note, and on a note that starts a new chord, that chord held too.

  A right note counts a hit and moves on. A note in neither hand's part counts a miss and
  flashes red. Clicking a bar moves the target there; "Start over" resets. Finished attempts are
  saved locally (`src/state/progress.ts`) for the progress view.

The keyboard dock shows F♯1 to G5 when every note of the lesson fits there with a tone to spare.
A lesson that reaches further gets a range at least as wide, centred on its notes and ending on
white keys (`dockRangeFor` in `src/ui/keyboard/layout.ts`).

## Chords and drills

- `/chords` is the chord library: pick a root and one of 18 qualities to see the formula, the
  interval names and the spelled notes. Switch voicing style (close, open, drop 2, shell,
  rootless) and inversion, hear it block or broken, and play it back: the page says when the
  notes you hold make the chord. The selection lives in the URL, so a chord can be linked.
- `/chords/drill` runs rounds of ten prompts ("E♭ major 7th, second inversion"). Choose the
  qualities, naturals or all 12 roots, inversions on or off, and how strict to be:
  - _Any voicing:_ all the chord tones, any octave, doublings allowed.
  - _Right bass:_ as above, with the asked-for note at the bottom.
  - _Exact notes:_ exactly the written voicing, starting from the given lowest note.

  Wrong notes flash red and spoil the "clean" score for that chord. "Show me" lights the chord,
  "Hear it" plays it, "Skip" moves on. Each round's result is saved locally.

- `/chords/known` is your known-chords profile: the common chords (major, minor, 7, m7, maj7,
  sus4, dim on all 12 roots) with **I know it**, **Not yet** or **From my plays** for each, and a
  "play it" check. A chord counts as known after 3 clean plays (no wrong note first, no "Show
  me") on at least 2 different days; clean answers in chord drills count too. A mark you set by
  hand always wins. Spellings share one entry (A♯m7 is B♭m7, CM7 is Cmaj7) and a slash bass is
  ignored, since the right hand plays the same shape. Saved on this device only
  (`src/state/knownChords.ts`, rules in `src/core/charts/known.ts`).

Chord recognition (`src/core/practice/chordMatch.ts`) compares the held notes with the target at
the chosen strictness. A match must hold steady briefly before it counts, so rolling a chord or
brushing a wrong key is judged on the final shape. Timed modes can also require all tones within
a press window (used from phase 4).

**MIDI:** the keyboard dock has a "Connect MIDI" button on every page. Once connected, MIDI
reconnects on the next visit, and the dock shows the device and the sustain pedal.

## Progressions and comping

`/progressions` lists common progressions written as Roman numerals (`src/content/progressions.ts`):
I–V–vi–IV, ii–V–I, I–vi–ii–V, vi–IV–I–V, the 12-bar blues, i–♭VII–♭VI–V, IV–V–iii–vi, the circle
of fifths, and three ballad progressions common in Indonesian pop, all generic theory material.

Each one opens in the progression trainer, with its key, pattern, voicing style and voice
leading kept in the URL (`/progressions/ii-v-i?key=Bb&pattern=stride&voicing=drop2&smooth=1`):

- `realizeProgression` (`src/core/content/realize.ts`) turns numerals into chords in the key and
  gives each a voicing: root position every time, or with smooth voice leading the inversion
  nearest the last chord. The pattern sets the meter, so the waltz turns each bar into 3/4.
- Comping patterns (`src/content/patterns.ts`): held chords, block chords, broken chord, Alberti
  bass, root and fifth, stride basics, ballad 8ths, pop 16ths, bossa and waltz. Any pattern fits
  any progression.
- **Listen** plays the pattern. **Practice** waits for each chord, in any octave or inversion.
  **Play-along** keeps time with a one-bar count-in (on by default) and scores each chord change
  as on time (within 150 ms), early, late or missed (`src/core/practice/playAlong.ts`). It shows
  the coming chord on the keyboard, with the pattern as optional backing. Each run's result and
  tempo are saved locally.

The song player and the progression trainer share one player (`src/features/song/LessonPlayer.tsx`
over `SongController`), so changing the key or pattern keeps the mode and tempo.

### Your own progressions

`/progressions/new` writes a progression in Roman numerals, one bar per word. Bars are separated
by spaces, new lines or `|`, and a comma splits a bar into two or four equal parts:

```
Imaj7 vi7 | ii7,V7 | V7/V | V7sus4,V7
```

Accidentals can be typed as `b` and `#` or `♭` and `♯`; `°`/`o`, `ø`, `maj7`, `sus4` and secondary
dominants (`V7/V`) all work. Every numeral is checked as you type, in every key of the mode and
every voicing style, and the preview plays each chord in any key. Any built-in progression has a
"Make a copy to edit" link.

Saved progressions live in this browser under `inharmonia:user-progressions`, as a versioned
list (`src/state/userProgressions.ts`). Ids start with `mine-`, so they never collide with
built-ins. Entries are validated again on load (`progressionIssues` in
`src/core/content/progressionText.ts`); anything that fails is dropped rather than breaking the
page. Limits: 32 bars, 100 progressions, 60-character names.

**Export**, **Import file** and **Paste JSON** use the shared file format described in
[Export and import](#export-and-import). Each progression page also has **Download .json** and
**Copy as JSON**.

## Fills and runs

`/fills` lists 17 original fills in eight groups: passing tones, chromatic approach, scale runs,
grace notes, octaves, pentatonic, gospel sixths and turnarounds (`src/content/fills.ts`).

Each fill is written against the chord change, not in a key. A note names where it starts and
how it moves:

- `ref`: the root of the chord before the change (`from`), after it (`to`), or the key's tonic
  (`key`).
- `tone`: start on that chord's third or fifth instead of its root.
- `step`: walk that many notes along the key's scale, or its pentatonic (`scale: 'pentatonic'`).
- `semis` and `octave`: then shift chromatically, or by octaves.

So `{ ref: 'to', semis: -1 }` is "a half step under the next root" in every key and between
any two chords. `into-next` fills end on the change, landing on it if they have a hit at
`at === beats`; `over-current` fills sit inside the bar before it. Right-hand roots are placed in
C4–B4 and left-hand roots in C2–B2. Half steps below are spelled as sharps and half steps above
as flats (G♯ into A, B♭ above A). `realizeFill` and `compileFillExercise` are in
`src/core/content/fills.ts`, and a test plays every fill in every key on every change.

The trainer (`/fills/:id?key=Eb&change=IV>I`) loops two bars: the chord before the change, with
the fill, then the chord after it, held in the other hand.

- **Listen** plays it at any tempo.
- **Practice** waits for each note, in any octave unless you turn on **Exact octave**. A double
  stop can be played together or one note at a time. The chords come in as you reach them.
- **Speed-up** counts in one bar, then scores every time round. A repetition is clean when every
  note lands within 150 ms and nothing extra is played. After a set number of clean ones in a
  row (2–5, default 3) the tempo rises by a step (+2, +5 or +10, default +5), from the start
  tempo up to the goal. The best tempo reached is saved with your progress.

The progression trainer has a **Fill** picker. It puts a right-hand fill on every chord change
that has room for it (`withFills`), over the comping, and lights it in Listen.

## Ear training

`/ear` has two exercises, each with levels (`src/core/practice/ear.ts`).

- **Chord quality**: a random root, voiced around middle C, in one of the level's qualities:
  major or minor; the four triads; five sevenths; or a mixed set. Answer with a click or a
  number key. A wrong answer lets you hear both qualities on the same root.
- **Progressions**: four chords in a random major key, smoothly voiced. The first is always I;
  name the other three from I, IV and V, then add vi, then all six diatonic chords. Neighbouring
  chords always differ. After checking, **Hear yours** plays what you answered.

Each finished round of ten is saved to progress as `ear:chords:<level>` or
`ear:progressions:<level>`.

## Progress

Finished practice is saved locally (`src/state/progress.ts`): attempts, best accuracy, best tempo
for timed modes, last practised, and the days you practised.

`/progress` shows your streak, the last seven days and everything you've practised. It also
suggests what to look at today (`src/state/review.ts`):

- An exercise comes back after a gap that depends on how it went: the next day under 70%, after
  two days under 90%, and otherwise after a week, growing to three weeks with repeats.
- Overdue exercises come first, weakest first on ties.
- Each suggestion links straight to the exercise, and one "new" suggestion comes from a starter
  list (`src/features/progress/catalog.ts`).
- Ids that no longer resolve, such as a deleted progression, are left out.
- **Clear progress** forgets everything after a confirmation.

The home page shows a first-visit welcome until it is dismissed or something is practised, and
then a "Today" card with the top suggestion.

## Studio

`/studio` turns a sung or hummed melody into notes on the beat grid, suggests chords for it,
lets you fix anything in an editor, and saves the result to Your songs on this device.

**Recording.** Pick a tempo (50–140 bpm), a meter (4/4, 3/4 or 2/4) and up to 32 bars, turn
on the microphone, and record. One bar of count-in plays first, and the click keeps going
through the take. The microphone opens with echo cancellation, noise suppression and automatic
gain control all off, because each of them bends pitch or timing. An AudioWorklet
(`capture/capture.worklet.js`) passes raw blocks to a Web Worker that tracks pitch live for the
level meter and trace. The full take is analysed in that worker when you stop.

**Pipeline** (`src/core/transcription`, plain TypeScript with no DOM, so it runs in Node too):

1. **Pitch frames**: every 10 ms, a window of about 43 ms through the McLeod pitch method
   ([pitchy](https://github.com/ianprime0509/pitchy)), behind a `PitchTracker` interface. Each
   frame keeps its pitch, clarity and level.
2. **Notes** (`segment.ts`, tuned in `SEGMENT_CONFIG`): voiced frames by clarity and level,
   octave jumps folded, a median filter, short gaps bridged. Notes split first on energy dips
   (re-attacks on the same pitch), then on pitch changes judged on a vibrato-smoothed curve, with
   onsets walked back over glides. Anything shorter than 0.1 s is merged into its neighbour.
3. **Key**: Krumhansl–Schmuckler correlation of the duration-weighted pitch-class profile. The
   top two are offered, and any of the 24 keys can be picked instead.
4. **Grid** (`quantize.ts`): snap to 1/4, 1/8 or 1/16, with optional triplets, following slow
   tempo drift. A monophonic line is kept and small gaps are closed. Notes further off the grid
   than the tolerance are marked uncertain (dashed). The melody is moved by whole octaves to
   fit the piano range, and every note is spelled in the chosen key.

Slow 6/8 and 12/8 feels can be recorded in 4/4 with the triplet grid for now. `TakeTiming.meter`
is a `{ beats, unit }` object, so real compound meters can be added without migrating saved
songs. `Transcriber` and `ChordEstimator` interfaces (`interfaces.ts`) leave room for other
engines later.

**Timing.** Notes are placed relative to the first beat, corrected for the delay between the
click leaving the speakers and the microphone hearing it. **Calibrate** plays ten clicks; clap
on each one. The median offset is saved when at least five claps line up within 40 ms of each
other. Until then, an estimate from the browser's reported output and input latency is used.

**When it goes wrong**, the page says what happened and what to do: microphone blocked (with
the steps for your browser), missing, busy, or on an insecure page; a take that is too quiet,
too noisy (measured during the count-in), or has no steady pitch; and claps that could not be
lined up.

**Chords** (`src/core/transcription/harmonize.ts`). Three suggestions, each from its own set
of chords:

- **Simple**: I, IV and V (i, iv and V in minor), one per bar.
- **In the key**: every chord of the key, one per bar.
- **Colourful**: sevenths, secondary dominants (V7/V, V7/vi, V7/ii) and a borrowed chord or two,
  up to two a bar where the meter splits evenly.

Each is the best path through a hidden-Markov model, found with Viterbi:

- The states are the style's chords, one per segment (a bar or half bar).
- The emission score is how well a chord holds the melody notes sounding over it. Notes are
  weighted by length and beat (the downbeat counts most). Notes outside the chord cost less
  when they are short, or move by step into and out of themselves (passing and neighbour tones).
- The transitions favour functional motion (tonic → subdominant → dominant → tonic) and roots
  falling a fifth. Secondary dominants are favoured only when they resolve. Changing chord
  mid-bar costs something.
- A path is rewarded for starting and ending on the tonic.

The search keeps the 8 best paths per style. If a style's best path repeats an earlier
suggestion, the next best is used, preferring one with the same ending, so the three always
differ. Every suggestion says what it is, how much of the melody sits on chord notes and how it
ends. Each chord has a reason in plain words, and every segment keeps ranked alternatives
(max-marginals), ready for the editor. The weights are in `HARMONY_WEIGHTS`. The same model is
available behind the `ChordEstimator` interface (`MelodyHarmonizer`).

**Try it.** Pick a suggestion and a left-hand pattern, then **Edit and save**, or just **Try it
with the chords**. The draft (`draftLesson`) is an ordinary song with `source: { kind: 'user' }`:

- rests fill the gaps
- notes held over a barline are split there and tied
- left-hand voicings are voice-led between E2 and B3, clear of the melody

It opens in the song player, with Listen and Practice, and the back button returns with every
setting as you left it. Practising your songs is not recorded in your progress.

### The editor

The editor (`src/features/studio/SongEditor.tsx`) works on a `SongDraft`
(`src/core/songs/draft.ts`): notes on the beat grid, the chords, the key, tempo, meter and
left-hand pattern. Every edit is a pure function and goes on an undo history (Ctrl+Z, and
Shift+Ctrl+Z to redo).

- **Piano roll.** Drag a note to move it (in time and pitch), or drag its right edge to change
  its length. Tap an empty spot to add a note. The melody stays one note at a time: an edited
  note takes the place of what it covers and trims what it overlaps. The grid is 1/4, 1/8 or
  1/16.
- **Keyboard.** Notes are focusable, one tab stop for the whole roll. The arrows move the
  selected note by a grid step or a semitone; Shift with the arrows changes its length or moves
  it an octave. [ and ] pick the previous or next note, and Delete removes it. Every change is
  announced.
- **Chord lane.** Each chord is a menu: the harmonizer's ranked alternatives for that spot
  first, then every other chord of the key. **Suggest chords again** re-harmonizes the edited
  melody in any style.
- **Pitch line.** Your sung pitch is drawn over the notes, moved by the same octaves as the
  melody, so you can see where they differ.
- **A/B.** **Play** runs the edited song with your take in sync from the same beat. **A: your
  take** and **B: the notes** switch between them mid-playback, and **Play chords** adds or
  removes the left hand (`EditorPlayback.ts`).

## Your songs

**Save to Your songs** stores the song in IndexedDB (`src/state/mySongs.ts`, using `idb`). The
Songs page lists them under **Made by you**, the last group of Your songs, with a **Private**
badge, and each opens at `/songs/mine/:id` in the song player, with **Edit**
(`/studio/edit/:id`) and **Delete**.

- **Private by design.** Your songs and recordings stay in this browser on this device. They
  are never uploaded and never committed to the repository, and there are no share links.
  Every song is marked `source: { kind: 'user' }`.
- **Recordings are optional.** **Keep the recording of my take** is off by default and shows its
  size. A kept recording is stored as 16-bit audio with its pitch line, so A/B and the pitch line
  work again when you edit later. The song page shows its size and has **Delete the recording**.
- **Ids.** New songs get `mine-song-…` ids and charts `mine-chart-…`. Songs saved before
  phase 8 keep their `user-…` ids. The database is at version 2 (a `charts` store was added);
  each version has its own upgrade step, so an older database opens without losing anything.
- **Backup.** See [Export and import](#export-and-import). Recordings go into a file only when
  you tick **Include recordings**, and a chart's lyrics only when you tick **Include lyrics**.
- **One list.** Studio songs and chord charts share the list, newest first, tagged **Studio** or
  **Chart**. Once you have both kinds, **All / Studio / Charts** filters it.
- The browser is asked to keep the data (`navigator.storage.persist`). Where storage is blocked
  (some private windows), the page says so.

### Evaluating transcription

`npm run eval:transcription` runs the pipeline over 16 synthesized fixtures
(`fixtures.ts`): original melodies rendered in code with vibrato, glides, noise, tempo drift, a
low voice, triplets, sixteenths, legato repeats and loose timing. It prints onset F1 (50 ms),
pitch accuracy, mean onset error, key (top one and top two) and grid accuracy per fixture.
Currently every fixture scores 100% on onsets, pitch and grid, with a mean onset error of
15 ms. The key is right on 15 of 16 and in the top two on all of them. The unit tests assert the
same fixtures with thresholds, so a regression fails `npm run check`.

No fixture, test, doc or screenshot uses audio or notes from existing songs.

### Evaluating chord timing

`npm run eval:timing` reads 25 chord sheets (`src/core/charts/timing.fixtures.ts`) the way a paste
does and compares each line's bars with the bars the song really has. They are public-domain songs
(traditional, or words published before 1929) in 4/4 and 3/4, from hymns in half notes to
quarter- and eighth-note songs with 2-bar lines and a chord every 2 beats, plus two Indonesian
songs written for the set, all with the sloppiness of pasted sheets: chords nudged a column or
two, tabs mixed with spaces, a lone chord at the start of a line, words before the first chord,
chords over blank space. The set is split: 19 **tune** sheets set the constants in `timing.ts`; 6
**test** sheets were written down before the constants were last set and never used to set them.
For each half it prints, per song and overall, for the estimate and for one chord a bar: beat
accuracy (beats with the right chord; a wrong bar count costs), bar-count match, a scale-free
score (the right chord at the same place in the line, both stretched to one length, so a line read
at double length still scores) and the lines read at twice or half their bars. A last row scores
each song at its best of Half, as estimated and Double: what one click in the review gets back.

|                           | beats |  bars | scale-free | ×2 lines |
| ------------------------- | ----: | ----: | ---------: | -------: |
| tune, estimated           | 78.6% | 84.0% |      92.4% | 13 of 81 |
| tune, one chord a bar     | 49.9% | 19.8% |      88.2% | 29 of 81 |
| tune, with Half or Double | 84.5% | 92.6% |      92.1% |  6 of 81 |
| test, estimated           | 59.2% | 66.7% |      91.7% |  8 of 24 |
| test, one chord a bar     | 61.7% | 54.2% |      96.9% |  8 of 24 |
| test, with Half or Double | 88.9% | 95.8% |      89.6% |  1 of 24 |

Whether a line is 2 bars of quarter notes or 4 of half notes can't be read from its words, so most
misses are whole songs read at double or half length (Saints, Red River Valley and Old Smoky at
half; She'll Be Coming 'Round the Mountain at double), which Half or Double puts right.
`-- --only tune` (or `test`) prints one half, `-- --lines` every line's bars, and
`-- --write-vectors` rewrites `timing.vectors.json` after a deliberate change. The unit tests pin
these numbers.

## Chord charts

A chord chart is a song you already know, written as its chords so you can learn to accompany
yourself. **New chord chart** on the Songs page opens `/songs/charts/new`. A chart has a title,
key, meter (4/4 or 3/4), tempo, free-text notes for yourself, sections (Intro, Verse, Chorus and
so on, each with up to 32 bars) and a form: the order the sections are played in, so a chorus is
entered once and played as often as it comes back.

- **Grid editor.** Click a bar to set its chords (up to four, with their beats), mark it `N.C.`,
  copy it after itself or delete it. **Edit as text** takes a whole section in bar syntax.
  Unreadable chords are outlined with a dashed line and block saving until fixed.
- **Bar syntax** (`src/core/charts/syntax.ts`):

  ```
  | C | G/B | Am7 F | C . . G | N.C. | % | x2
  ```

  `|` separates bars; chords in a bar split it evenly (`Am7 F` is two beats each); a dot adds a
  beat to the chord before it (`C . . G` is three beats then one); `%` repeats the previous bar;
  `N.C.` is no chord; a trailing `xN` repeats its line; `||`, `|:` and `:|` are read as bar lines.
  Common spellings are accepted and normalized: `CΔ7` and `CMA7` become `Cmaj7`, `Cø` becomes
  `Cm7b5`, `C7(b9)` becomes `C7b9`, `C6/9` becomes `C69`.

- **Paste a chord sheet** (`src/core/charts/paste.ts`). Chords over lyrics, inline `[C]` chords,
  bar lines and section names all work. Section names are matched case-insensitively, with or
  without a colon, numbered or repeated (`Verse 2`, `Reff 2x`, `[Chorus]`), in English and
  Indonesian: Intro/Int., Verse/Bait, Pre-chorus/Pre-Reff, Chorus/Reff/Ref, Post-chorus, Bridge,
  Interlude/Musik, Solo, Hook, Breakdown, Tag, Outro/Ending/Coda. The label is kept as you
  wrote it and mapped to a section kind. A line counts as chords when at least 60% of its words
  are chords (bar marks, `%`, `x2`, `N.C.`, brackets and dashes are not counted) and it has two
  chords or chord-like spacing, so a one-word lyric such as "A" stays a lyric. A review table
  shows how every line was read before anything is used. The notes field is never filled from a
  pasted sheet. There is no URL import and nothing is fetched: charts are typed or pasted by you.
- **Bar lengths from the lyrics** (`src/core/charts/timing.ts`). A sheet has no bar lines, but the
  column a chord sits over says where in the words it changes. For a line of chords with a lyric
  line right under it (or inline chords in words), each chord's length is estimated from the
  syllables up to the next chord (English and Indonesian are counted by their own rules). A song
  is sung at one speed, so one speed (beats a syllable) is chosen for the whole sheet, and each
  line gets the whole number of bars (usually 2 or 4) that fits it, the chords whole beats on a
  2-beat grid; `rebar.ts` packs them into bars, splitting a chord across a bar line where it must.
  Words are read for this in passing and dropped unless you keep them. The review table shows the
  bars each line makes, with a choice per line of **Estimated**, **1 a bar** or **2 a bar** (lines
  with words start on Estimated), and says "Bar lengths are estimated from the lyrics. Check them
  by ear." Whether a line is 2 bars of quarter notes or 4 of half notes can't be told from its
  words, so **Half** and **Double** under the table read every estimated line at half or double
  the speed in one click. A line with no words under it gets a bar a chord, as before; bar lines
  keep their bars. A chord alone at the start of a line, over a line of words, is read as a line
  of chords (not a one-word lyric such as "A" in a run of words).
  The steps are written out at the top of `timing.ts` for other implementations, which can check
  themselves against `timing.vectors.json`.
- **Lyrics only if you ask, and only here.** By default lyric lines are dropped as the sheet is
  read; only their count is kept, for the notice "Lyrics removed from N lines". Tick **Keep
  lyrics** (unticked every time) to keep each lyric line on the bars it sat under: the line is
  cut at the chords right above it, each cut moved back to the start of its word, the words go
  on the bar where they start, and a line with no chords right above it is left out. In the editor, a bar's **Lyrics** field holds its
  words, one line, up to 120 characters; Enter goes on to the next bar.
- **Lyrics from a sheet** (`src/core/charts/attachLyrics.ts`). **Add lyrics**, beside **Paste a
  chord sheet** in the editor, puts the words of a pasted sheet (chords over lyrics) onto a chart
  that already has its chords and lengths, such as one aligned to a recording. The chords are
  never changed: the sheet's chords are matched to the chart's, in order, by a global alignment
  that allows chords missing on either side (a sheet without the instrumental, a repeat it skips),
  scores a 7th or add9 on the sheet as close to the chart's triad, and tries all 12 keys, so a
  sheet written for a capo still fits. Each chord's words go on the bar where the matched chart
  chord starts. A section played twice with other words the second time (verse 1 and verse 2)
  becomes two sections with the same bars; a chorus written once is used each time it plays. A
  preview shows every section's bars with the words they would get, bars it could not match, and
  "Lyrics for 14 of 16 bars · sheet is 2 semitones up". **Apply** puts them in the chart (asking
  first if it has lyrics), and **Save** keeps them. The same rules as **Keep lyrics** apply, and
  the pasted text is not kept.
  - Lyrics are kept only in this browser's storage on this device. They are never uploaded, never
    in a share link, and never sent to Studio, Chords or Progressions by **Send to**.
  - Like everything stored here, they can be lost with the browser's site data: clearing it, or
    Safari removing it after 7 days without a visit when the app isn't installed. To keep a copy,
    export the chart with **Include lyrics** ticked.
  - They are text only, shown as text, never as markup.
- **Key suggestion** (`key.ts`) scores all 24 keys by how many chords fit, weighting the first
  and last chord of each section, and offers the best two as one-click choices.
- **Playing it.** A chart compiles to an ordinary lesson (`compile.ts`): voice-led triads in the
  right hand (G3 to E5), root or slash bass in the left. Its page (`/songs/charts/:id`) has
  Listen, left-hand Practice and Play-along, a **Show function** toggle for Roman numerals and,
  when it has lyrics, **Show lyrics** (both kept with the chart), **Edit**, export and **Delete**.
  With lyrics shown, each bar's words sit under its chords and the playing bar's are in ink, so
  they follow the music. Charts are private like Studio songs: stored in IndexedDB,
  `source: { kind: 'user' }`, no share links, no upload.
- **Limits.** 24 sections, 32 bars per section, 40 form entries, 400 bars once the form is
  played out, 120 characters of lyrics a bar.

### Making a chart playable

The **Make it playable** panel on a chart's page changes how it is shown and played, never the
chart itself: key, simplify level and style are view settings saved beside it (and in its
export).

- **Transpose** (`transpose.ts`) to any key. Chords move by the interval between the tonics, so
  each keeps its function and is spelled for the new key: V in C (G) becomes B♭ in E♭, and IV in
  G♭ is C♭, while a borrowed ♭VI in E♭ reads B rather than C♭. Roman numerals follow the new key.
- **Find an easier key** (`easyKey.ts`) scores every key from 6 semitones down to 5 up and shows
  the best three, each with its chords, the ones new to you, and how far it moves ("4 semitones
  lower"), so you can pick by ear and voice. The score weighs the share of the song on chords you
  know (from the known-chords profile), black keys in the voicings, chord complexity at the
  current simplify level, and the size of the move (`EASY_KEY_WEIGHTS`).
- **Simplify** (`simplify.ts`), switchable at any time:
  - _Original:_ every chord as written.
  - _Simplified:_ extensions down to sevenths (Cmaj9 → Cmaj7, G13 → G7), sus to the plain chord,
    add9 and 6/9 down to the triad and sixth. A slash chord shows its main chord, and the left
    hand keeps the slash bass in styles that have one.
  - _Basic:_ triads only; diminished stays diminished, and the slash bass goes.

  The chord as written stays under a simplified one in small text, so you learn the real chord.

- **Accompaniment styles**, each a pattern applied to the chart: triad and root (the default),
  block chords in both hands on beats 1 and 3, root and fifth under a held triad, broken chords,
  and right hand only.
- **Smooth voicings.** The right hand stays between G3 and E5 and each chord takes the inversion
  that moves least from the one before. On the chart page the player says how the hand moves into
  the current chord ("C → G: keep G, move C down 1 semitone to B and E down 2 semitones to D"),
  and the keyboard marks it with shapes rather than colours: a dot on notes that stay, a ring on
  notes to move to (`hints.ts`).

## Export and import

Songs, chord charts and progressions share one readable JSON format
([docs/format](docs/format/README.md), with a JSON Schema at
`docs/format/inharmonia.schema.json` and one invented example per kind). It holds note names,
chord symbols, numerals, beats and keys as `{ "tonic", "mode" }`: nothing derived, no MIDI
numbers. Files are pretty-printed with a fixed key order, so exporting, importing and exporting
again gives the same bytes. A chart is stored as written, with its view settings beside it.

- **Export** one item from its page (**Download .json**, **Copy as JSON**), or everything or a
  selection from a list. One item is saved as `inharmonia-<kind>-<slug>.json`, several as
  `inharmonia-export-<date>.json`. Built-in songs and progressions can be exported too, with
  their original source. A song made from a MIDI file is written as its whole MIDI project,
  every track, and comes back from it.
- **Lyrics are left out** of every export unless you tick **Include lyrics** (in a chart's Export
  menu, or in the export dialog when a chosen chart has some). It starts unticked every time,
  and what was saved says when lyrics were left out.
- **Import** by **Import file**, by dropping a file on the list, or by **Paste JSON**. A preview
  lists what is new and what is already here (**Skip**, **Replace** or **Keep both**, which gives
  a fresh id) and any problem by item and field. A file with problems saves nothing. Files from
  before phase 8 (the old progressions and songs exports) are upgraded on the way in.
- **Nothing is trusted as is.** Only known fields are read and the rest are dropped, so no stray
  text can come in: chart notes come only from the notes field, and lyrics only from a chart
  section's `lyrics`, as text, one line a bar. Every item is checked and rebuilt; a Studio song's
  lesson is rebuilt from its draft, and a MIDI song's from its project. Imported items are
  private and stored under `mine-…` ids, and their source is kept as written. The preview says
  which charts bring lyrics, and when **Replace** would drop the lyrics a chart here has.

## Accessibility and Lighthouse

Every control is reachable by keyboard, practice feedback is announced through polite live
regions, and motion respects `prefers-reduced-motion`. Muted text and small dusk text meet
4.5:1 contrast in both themes. Dusk keeps its prototype value for keys and large text, with a
slightly darker `--dusk-text` for small text in light mode.

Lighthouse 12 against the production build, every main page, mobile and desktop presets:
accessibility, best practices and SEO all 100; performance 96–99 on mobile and 100 on desktop.

## Tuning the mix

Every playback level is in `config/mix.ts`, in the `MIX` object:

- `melody`: velocity, legato (how much of its length a note sounds), channel gain in dB.
- `leftHand`: accent velocity (first note of each chord), other velocity, channel gain.
- `live`: gain for what you play yourself.
- `practice`: the chord roll and "Hear it" levels and timing.
- `chords`: "Hear it" in the chord library and drills.
- `fills`: fill notes and the slightly louder landing note (on the playing hand's gain).
- `metronome`: click levels and gain.

Content never hard-codes levels: patterns mark accented steps, and the compiler and audio
engine read the numbers from `MIX`. Gains multiply velocities (the sampler treats velocity as
linear gain) and are capped at full scale.

## Audio notes

- Notes sustain while held. Every way a release can be lost ends them: `pointercancel` and
  lost pointer capture on the keyboard, window blur and a hidden page for computer keys, and a
  MIDI device disconnecting (its notes and its sustain pedal are released).

- Audio starts only from a user gesture, and only in a room that plays: one with a keyboard, Ear
  training, the progression builder and Studio. There the AudioContext is created synchronously
  inside the first `pointerup`, `touchend`, `click` or `keydown` (a touch's `pointerdown` doesn't
  count as one), which is what iOS Safari requires, and Tone.js and the piano load then. A gesture
  on a link or in a nav, and Tab, Shift, Ctrl, Alt, Meta or Escape, don't count: leaving the room or
  moving focus doesn't load the piano. Every Play button also starts it itself. Notes pressed while
  Tone.js is still loading are played as soon as it is ready; notes and clicks scheduled in that
  time, like the first beat of a first Play, are held and played on time, or at once if a little
  late.
- **iOS silent switch:** on iPhone, Web Audio is muted when the ring/silent switch is set to
  silent. If you hear nothing on iOS, check the switch.
- A simple synth plays until the piano samples finish loading (about 1.6 MB), then the piano
  takes over.
- The sample format is chosen with `canPlayType`: Ogg Vorbis when the browser reports support,
  MP3 otherwise (for example older Safari and iOS).
- MP3 files start with encoder padding (1105 samples, about 25 ms at 44.1 kHz). Chromium reads
  the gapless info in the file's Info header and trims it; other decoders may not. The loader
  (`core/audio/sampleLoader.ts`) reads that header itself and trims the decoded buffer only when
  its length shows the padding is still there, so MP3 and Ogg attacks land on the same frame in
  every browser.

## Credits

- Piano: **Salamander Grand Piano V3** by Alexander Holm, licensed
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The subset (one sample every minor
  third, A0 to C8) comes from the [Tone.js audio repository](https://github.com/Tonejs/audio). It
  was trimmed of leading silence, cut to 8 seconds with a fade-out, and re-encoded. See
  `public/samples/salamander/v1/LICENSE.txt`.
- Font: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque), SIL Open
  Font License, self-hosted through Fontsource.
- [Tone.js](https://tonejs.github.io/) and [Tonal](https://github.com/tonaljs/tonal), MIT.
- [Vite PWA](https://vite-pwa-org.netlify.app/) and Workbox, MIT.
- [pitchy](https://github.com/ianprime0509/pitchy) and fft.js, MIT.
- [idb](https://github.com/jakearchibald/idb), ISC. Tests use
  [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB), Apache-2.0.
- The settings (gear) icon is the `settings` icon from [Lucide](https://lucide.dev/), ISC,
  copyright Lucide Contributors.
