# Inharmonia file format

Inharmonia exports and imports songs, chord charts and progressions as plain JSON. You can read
the files, edit them by hand, and keep them in git. The schema is in
[`inharmonia.schema.json`](inharmonia.schema.json), and there is one small example per kind in
[`examples/`](examples), plus a song made from a MIDI file (`midi-song.json`) and a chart
exported with its lyrics (`chart-lyrics.json`). Every example is invented content.

## The envelope

```json
{
  "format": "inharmonia",
  "version": 3,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "items": [],
  "assets": []
}
```

- Every item has a `kind` (`"song"`, `"chart"` or `"progression"`), an `id`, a `title`, a
  `source` and its data. Songs and charts you made also have `updated`.
- `source` says where an item comes from: `{ "kind": "user" }` for your own,
  `{ "kind": "original", "author": … }`, `{ "kind": "generic" }` for theory material, or a
  public-domain piece with its proof: `composer`, `composerDied` (null only for a traditional
  tune), `firstPublished`, the `edition` the notes were taken from, and any `contributors`
  (`role`, `name`, `died`).
- `assets` is only present when you tick **Include recordings**. It holds kept Studio
  recordings as base64 at the end of the file, so the music stays readable at the top.
- Files are written with two-space indentation and the same key order every time, so they diff
  cleanly.

## Values

Every value is something you can read: note names (`"F#4"`, middle C is `C4`), chord symbols
(`"Gmaj7"`, `"F#m7b5"`, `"G/B"`, `"N.C."` for no chord), Roman numerals (`"ii7"`, `"bVII"`),
beats as numbers, and keys as `{ "tonic": "D", "mode": "major" }`. Nothing derived is written:
no MIDI numbers, compiled timelines or cached voicings. Explicit `voicing` lists appear only on
songs whose voicings were chosen by hand.

The one exception is a song made from a MIDI file. It is written as the MIDI project it is, so
its notes are MIDI numbers: `midi` is the pitch (60 is middle C), `velocity` is 1 to 127,
`channel` 0 to 15 and `program` the General MIDI instrument, 0 to 127.

## Kinds

- **song**: key, meter (2/4, 3/4, 4/4 or 3/8), tempo (`default`, `min`, `max`), left-hand pattern
  id, and bars. Beats count the meter's written beat: in 3/8 a beat is an eighth note, and the
  tempo counts eighths per minute. Each bar
  has `chords` (`symbol`, `beats`, optional `voicing`) and `melody` (`note` or `"r"`, `beats`,
  and `tie: true` to hold into the next note). An optional `section` on a bar starts a titled
  section, and an optional `left` lists left-hand notes written out for that bar. Library pieces
  also carry `piece` (which piece this is a version of), `level` (`easy`, `medium` or
  `advanced`), `covers` ("bars 1–16"), and may have an `lhFigure`: the piece's own left-hand
  figure, as `name`, `cycleBeats` and `steps` (`at`, `dur` in beats or `"chord"`, `voices`,
  optional `accent`). Library pieces are written in the compact [source format](source.md) and
  generated into this format.

  A song made from a MIDI file has only `midi`: the whole project, every track and note, as
  Studio keeps it. `title`, `ppq`, `tempo` (20 to 300 bpm), `meter`, `tempos` and `meters`
  (changes, by beat), and `tracks`, each with `id`, `name`, `channel`, `program`, `muted` and
  `notes` (`id`, `startBeat`, `beats`, `midi`, `velocity`). Beats are quarter notes from the
  start. The practice score is not written: it is rebuilt from the project on import, the way
  Studio's **Save to Your songs** builds it. Such a song is 2/4, 3/4 or 4/4 and up to 512 bars.
  A catalogue song made this way also has `piece`, `level` and `summary` before `midi`, and
  its credit is the item's `source`. Your own MIDI songs never have them: they are rebuilt as
  yours on import.

- **chart**: key, tempo, meter (3/4 or 4/4), `sections`, `form` and `notes`, plus a separate
  `view`: `transpose` (semitones, -11 to 11), `simplify` (`original`, `simplified` or `basic`),
  `style` (`triad-root`, `block-both`, `root-fifth`, `arpeggio-8ths` or `held` for right hand
  only), `showFunction` and `showLyrics`. The chart itself is always stored as written; the view only changes
  how it is shown and played. Importing restores exactly what you saw. Each section has an `id`, the `label` as you wrote it ("Bait 2"), a `type` used for logic
  (`verse`, `chorus`, …), `repeat`, and `bars`. Each bar is one string in chart syntax:
  - `"C"`: one chord for the whole bar
  - `"Am F"`: chords splitting the bar evenly
  - `"C . . G"`: each dot adds a beat, so C lasts 3 and G lasts 1
  - `"N.C."`: no chord

  `form` lists section ids in play order, so repeated sections are written once.

  A section may have `lyrics`: the words sung over each bar, one line per bar (`""` for none),
  up to 120 characters a bar. Lyrics are kept only on the device they were typed or pasted on,
  so a file has them only when it was exported with **Include lyrics** ticked, and then only
  for sections that have some.

- **progression**: `mode`, `meter`, and `steps` of `numeral` and `beats` (1, 2 or 4), with an
  optional `description`. Numerals are read against the major scale of the tonic.

## The song index

Each folder of song files has an `index.json` beside it, written by `npm run songs`:
`public/library/index.json` lists the catalogue, and `src/content/songs/index.json` the
built-in songs. The Songs page draws every card from these, so it loads no song to list them;
a download checks the file it fetched against its entry. JSON Schema:
[library-index.schema.json](library-index.schema.json).

```
{"format":"inharmonia-library","schema":1,"songs":[
{"piece":"minuet-in-g","file":"minuet-in-g.json","bytes":48029,"sha256":"…","title":"Minuet in G", …},
…
]}
```

One entry per line, so a diff shows the songs that changed. Each entry has the `piece` id, its
`file`, its size in `bytes` (UTF-8) and its `sha256`; the `title`, the `composer` (for the
filter) and the `credit` line; the written `key` (the Advanced version's) and the `meter`; an
optional `summary`; `levels`, each with its `level`, song `id` (`<piece>-<level>`), `bars` and
the `key` it plays in; and a `preview`.

The `preview` is the opening melody, for a drawing on a staff: `{ meter, bars }`, one string per
bar, each note `"<note>:<beats>"` or `"r:<beats>"`, with `~` after a note tied to the next, and
beats in the meter's unit (`"r:2 G4:0.5 G4:0.5"`). It starts at the first bar that sounds; when
that bar starts with a rest it is a pickup, and two more bars follow it, otherwise two bars are
taken. It comes from the Advanced version or the only one, and holds at most 24 notes and rests.

## Importing

The app checks more than the schema can: that bars add up, chords and notes are real, form ids
exist, and limits hold. If anything is wrong, the preview names the item and the field, for
example `Item 2 (My chart), chart.sections[0].bars[3]: "Hx" is not a chord`, and nothing is
saved.

- Unknown fields are dropped. No text gets in except titles, section labels, a chart's `notes`
  and, in a file exported with them, a chart's `lyrics`, which come in as text, one line a bar,
  and stay on the device they are imported on.
- Everything you import becomes your own private content, stored under a `mine-…` id. The
  `source` is kept as written.
- Version 2 files are read as they are. Version 3 added a MIDI song's `midi`. A version 2 export
  of a song made from a MIDI file left its tracks out, so it is refused with a message saying
  so: export it again from where it was made.
- Version 1 files (the old progressions export and the old Studio songs export) are upgraded as
  they are read.
