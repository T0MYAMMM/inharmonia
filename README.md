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
| `npm run check`     | Lint, format check, typecheck and unit tests        |

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
worker precaches the app, the self-hosted fonts and every piano sample in both formats, about
4 MB in all. After the first visit, everything works offline, including deep links, which fall
back to `index.html`. It updates itself in the background (`registerType: 'autoUpdate'`). The
manifest and icons in `public/icons/` make it installable, and its scope and start URL follow
`BASE_PATH`. `src/app/pwa.ts` registers the worker in production only, and the footer says
"Ready to use offline" once it is.

## Folder overview

```
config/site.ts          base path, shared by Vite, the router and the 404 fallback
public/samples/         piano samples, one versioned folder (salamander/v1)
src/
  core/                 framework-agnostic TypeScript; no React here
    theory/             chords from symbols, inversions, voicings, Roman numerals, voice leading
    audio/              tempo map, swing, lookahead transport, Tone.js engine, sample list
    input/              unified note stream: pointer, computer keys, Web MIDI
    notation/           letter names, Roman numerals, not angka formatting
    content/            the lesson content format, compiler, progression realizer, text parser, fills
    persistence/        safe localStorage and versioned documents with migrations
  state/                Zustand stores (settings, progress, your progressions), review, key highlights
  app/                  router, layout, theme, singletons (services.ts) and hooks
  ui/                   design-system components and the keyboard dock
  features/             one folder per page
  styles/               tokens.css (palette, light and dark) and global.css
e2e/                    Playwright tests
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

The global note-name setting has three systems:

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
- A chord's `voicing` is either explicit notes or a style (`close`, `open`, `drop2`, `shell`,
  `rootless`) with an optional inversion.
- `lhPattern` names a left-hand pattern from `src/content/patterns.ts`; a bar with its own `lh`
  overrides it. Pattern steps pick voices from the chord's voicing by index (negative counts
  from the top), `'all'` for the whole voicing, or `'root'` / `'fifth'` for a bass note below it.
  Patterns restart on each chord and stop at the chord change.
- `section` on a bar starts a titled section in the score ("Verse", "Chorus").
- Content must be original, generic theory material, or public domain (published before 1929,
  marked with `source: { kind: 'public-domain', ... }`). Do not transcribe copyrighted songs.

Then:

1. Put the file in `src/content/songs/` and add it to `SONGS` in `src/content/lessons.ts`. It
   appears on the Songs page and plays at `/songs/<id>`.
2. Add a test that `validateLesson(myLesson)` returns `[]` (see
   `src/core/content/compile.test.ts`). It checks bar lengths, chord symbols and note names.

`compileLesson` (`src/core/content/compile.ts`) turns a lesson into bars, chords with resolved
voicings, and one timeline for the transport. Melody notes sound for 95% of their written length
so repeated notes re-strike cleanly.

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

**Export** downloads `inharmonia-progressions.json`; **Import** merges a file like it, giving
imported entries fresh ids, skipping ones already saved, and listing anything it rejected with
the reason.

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

- Audio starts only from a user gesture. The AudioContext is created synchronously inside the
  first `pointerdown` or `keydown`, which is what iOS Safari requires. Notes pressed while Tone.js
  is still loading are played as soon as it is ready.
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
