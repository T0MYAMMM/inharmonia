# The piece source format

Library pieces are written once, in a small text format, in
`src/content/songs/sources/<piece>.piece`. `npm run songs` turns each source into
`src/content/songs/<piece>.json` (the [readable JSON format](README.md)) with three versions,
Easy, Medium and Advanced, and lists the bars where Easy merged notes so you can check them by
ear. A test fails if a JSON file is out of date with its source.

Write the notes as they are in the edition you work from. The Easy and Medium versions come
from the generator: don't write simplified versions by hand.

## An example

```
# Lines starting with # are comments.
title: Test Tune
piece: test-tune
added: 2026-01-02
source: original
author: Your name
key: D major
meter: 4/4
tempo: 100
summary: One sentence for the Songs page.
figure: Bass and roll | cycle 2 | 0 1 root! | 1 .5 0 | 1.5 .5 1
easy-keep: 3

[A] main 1-4
melody:
  | F#4q. E4e D4q E4q | F#4q A4q A4h~ |
  | A4e G4e F#4e E4e D4h | E4w |
chords: | D | A/C# Bm7 | Gmaj9 | A7sus4 |

[B] 5-6
melody: | D5h C#5q B4q | A4w |
chords: | G | D |
left: | G2h D3h | D2w |
```

## The header

One `name: value` per line, before the first section.

| Field             | Required         | Meaning                                                                                      |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `title`           | yes              | The title shown in the app.                                                                  |
| `piece`           | yes              | Short id, lowercase letters, digits and dashes; also the file name.                          |
| `added`           | yes              | The date the piece was added (`2026-10-17`); the JSON file's date.                           |
| `source`          | yes              | `original` or `public-domain`.                                                               |
| `author`          | original         | Who wrote an original piece.                                                                 |
| `composer`        | public-domain    | The composer, or `Traditional` for a genuinely anonymous tune.                               |
| `composer-died`   | public-domain    | Year of death; `unknown` only for `Traditional`.                                             |
| `first-published` | public-domain    | Year the piece was first published, in the form used.                                        |
| `edition`         | public-domain    | The early or first edition the notes were taken from.                                        |
| `contributor`     | when one is used | `role; name; year of death`, once per arranger or other contributor.                         |
| `key`             | yes              | `G major`, `A minor`, …                                                                      |
| `meter`           | yes              | `2/4`, `3/4` or `4/4`.                                                                       |
| `tempo`           | yes              | Beats per minute for Advanced; Medium plays at 90%, Easy at 80%.                             |
| `summary`         | no               | One sentence for the Songs page.                                                             |
| `figure`          | yes              | Advanced left hand: an app pattern id, or the piece's own figure.                            |
| `medium-figure`   | no               | Medium left hand pattern id (default: `stride` in 2/4, `waltz` in 3/4, `root-fifth` in 4/4). |
| `easy-key`        | no               | Easy key tonic, when the nearest easy key is wrong for the piece.                            |
| `easy-keep`       | no               | Bars of the Easy version (1-based, over the main sections) kept as written.                  |

### Public domain

A public-domain piece ships only if, counted from the current year, everyone whose work is used
(composer and any `contributor`) died at least 70 full years ago, **and** it was first published
at least 96 years ago. The library test checks this for every built-in piece every time it runs.

## Sections

`[Label]` starts a section, followed by optional flags:

- `main`: part of the main theme. Easy and Medium play only the main sections; Advanced plays them all.
- bar numbers in the original, like `1-16`, for the "covers bars 1–16" line.

Inside a section:

- `melody:` the right hand, bars between `|`. Every bar must fill the meter.
- `chords:` one entry per melody bar.
- `left:` (optional) the left hand written out, for Advanced, in place of the figure.

A line that starts with `|` (or with spaces) continues the line above, so long sections can take
several lines.

### Notes

A note is a name with an octave, then an optional length: `F#4q`, `Bb3e.`, `C5h`. `r` is a rest.
A length carries on to the next notes until it changes, so `C4q D4 E4 F4` is four quarters.

| Code | Length               | In 4/4 |
| ---- | -------------------- | ------ |
| `w`  | whole                | 4      |
| `h`  | half                 | 2      |
| `q`  | quarter              | 1      |
| `e`  | eighth               | 1/2    |
| `s`  | sixteenth            | 1/4    |
| `t`  | thirty-second        | 1/8    |
| `.`  | dotted (`..` double) | ×1.5   |
| `3`  | triplet              | ×2/3   |

`:1.5` gives a length in beats directly. A `~` at the end ties the note into the next note of the
same pitch, across a bar line too: `A4h~ | A4q …`.

### Chords

Chords in a bar split it evenly (`| G D |` in 4/4 is two beats each); `:beats` sets a length
(`| Am:2 E7:1 |` in 3/4). `%` repeats the bar before; `N.C.` is no chord. Chord spellings are
read as in chord charts (`CΔ7`, `Cø`, `C7(b9)` and so on).

### Figures

A piece's own left-hand figure is one line: a name, the cycle length in beats, then steps of
`<start> <length> <voices>`:

```
figure: Bass then chord | cycle 3 | 0 1 root! | 1 2 all
```

- `<start>` and `<length>` are in beats; a length of `chord` holds until the chord changes.
- `<voices>` are the chord's notes, lowest first: `0`, `1`, `2`, … (negative counts from the
  top), `all`, or `root` and `fifth` for bass notes below the chord. Join several with commas
  (`root,all`).
- `!` after the voices accents the step.

The figure restarts on each chord and stops at the chord change. The app's own patterns
(`arpeggio-8ths`, `alberti`, `waltz`, `stride`, `block`, `held` and others) can be named instead.

## What the generator makes

| Version  | Sections | Key                                           | Melody                                                                                                      | Chords                                                           | Left hand                        |
| -------- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Easy     | main     | nearest of C, G, F (major) or A, E, D (minor) | each beat plays the note sounding at its start, except `easy-keep` bars; moved by octaves to sit from C4 up | triads (Basic)                                                   | one held bass note per chord     |
| Medium   | main     | as written                                    | as written                                                                                                  | up to sevenths (Simplified); a slash bass stays in the left hand | `medium-figure`                  |
| Advanced | all      | as written                                    | as written                                                                                                  | as written                                                       | `figure`, or `left:` where given |

A simplified chord keeps the written one beside it, shown in small text in the player.
