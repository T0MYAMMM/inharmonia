# Inharmonia file format

Inharmonia exports and imports songs, chord charts and progressions as plain JSON. You can read
the files, edit them by hand, and keep them in git. The schema is in
[`inharmonia.schema.json`](inharmonia.schema.json), and there is one small example per kind in
[`examples/`](examples). Every example is invented content.

## The envelope

```json
{
  "format": "inharmonia",
  "version": 2,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "items": [],
  "assets": []
}
```

- Every item has a `kind` (`"song"`, `"chart"` or `"progression"`), an `id`, a `title`, a
  `source` and its data. Songs and charts you made also have `updated`.
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

## Kinds

- **song**: key, meter, tempo (`default`, `min`, `max`), left-hand pattern id, and bars. Each bar
  has `chords` (`symbol`, `beats`, optional `voicing`) and `melody` (`note` or `"r"`, `beats`,
  and `tie: true` to hold into the next note). An optional `section` on a bar starts a titled
  section.
- **chart**: key, tempo, meter (3/4 or 4/4), `sections`, `form` and `notes`, plus a separate
  `view` (`transpose`, `simplify`, `style`, `showFunction`). Importing restores exactly what you
  saw. Each section has an `id`, the `label` as you wrote it ("Bait 2"), a `type` used for logic
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
- Version 1 files (the old progressions export and the old Studio songs export) are upgraded as
  they are read.
