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
    content/            the lesson content format (types)
    persistence/        safe localStorage and versioned documents with migrations
  state/                Zustand stores (settings) and fine-grained key highlights
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
- `lhPattern` names a left-hand pattern; a bar with its own `lh` overrides it.
- Content must be original, generic theory material, or public domain (published before 1929,
  marked with `source: { kind: 'public-domain', ... }`). Do not transcribe copyrighted songs.

The compiler that turns lessons into a transport timeline, and the lesson registry, arrive in
phase 2.

## Audio notes

- Audio starts only from a user gesture. The AudioContext is created synchronously inside the
  first `pointerdown` or `keydown`, which is what iOS Safari requires. Notes pressed while Tone.js
  is still loading are played as soon as it is ready.
- **iOS silent switch:** on iPhone, Web Audio is muted when the ring/silent switch is set to
  silent. If you hear nothing on iOS, check the switch.
- A simple synth plays until the piano samples finish loading (about 1.6 MB), then the piano
  takes over.
- Samples are Ogg Vorbis where supported (no encoder delay, so attacks are exactly on time) and
  MP3 elsewhere.

## Credits

- Piano: **Salamander Grand Piano V3** by Alexander Holm, licensed
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The subset (one sample every minor
  third, A0 to C8) comes from the [Tone.js audio repository](https://github.com/Tonejs/audio). It
  was trimmed of leading silence, cut to 8 seconds with a fade-out, and re-encoded. See
  `public/samples/salamander/v1/LICENSE.txt`.
- Font: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque), SIL Open
  Font License, self-hosted through Fontsource.
- [Tone.js](https://tonejs.github.io/) and [Tonal](https://github.com/tonaljs/tonal), MIT.
