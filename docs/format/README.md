# Inharmonia file format

Inharmonia exports and imports songs, chord charts and progressions as plain JSON. You can read
the files, edit them by hand, and keep them in git. The schema is in
[`inharmonia.schema.json`](inharmonia.schema.json), and there is one small example per kind in
[`examples/`](examples), plus a song made from a MIDI file (`midi-song.json`). Every example is
invented content.

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
  Studio's **Save to My songs** builds it. Such a song is 2/4, 3/4 or 4/4 and up to 512 bars.

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

- **progression**: `mode`, `meter`, and `steps` of `numeral` and `beats` (1, 2 or 4), with an
  optional `description`. Numerals are read against the major scale of the tonic.

## Importing

The app checks more than the schema can: that bars add up, chords and notes are real, form ids
exist, and limits hold. If anything is wrong, the preview names the item and the field, for
example `Item 2 (My chart), chart.sections[0].bars[3]: "Hx" is not a chord`, and nothing is
saved.

- Unknown fields are dropped. No text gets in except titles, section labels and a chart's
  `notes`.
- Everything you import becomes your own private content, stored under a `mine-…` id. The
  `source` is kept as written.
- Version 2 files are read as they are. Version 3 added a MIDI song's `midi`. A version 2 export
  of a song made from a MIDI file left its tracks out, so it is refused with a message saying
  so: export it again from where it was made.
- Version 1 files (the old progressions export and the old Studio songs export) are upgraded as
  they are read.
