# chord-align

Chord charts typed from a lyric sheet know the chords but not how long each one lasts. Given a
recording of the song, chord-align lines the chart's chords up with the music, then writes the
chart back with:

- each chord's length in beats, with bars rebuilt to fit;
- the tempo;
- the key that sounds, if you ask for it.

It runs on your computer and never goes online. The audio stays where it is: the only things
taken from it are timings and a key. The tool is not part of the web app or its build.

## Install

You need Python 3.11 or later and, for anything other than WAV or FLAC, `ffmpeg`.

Install `ffmpeg`:

```sh
sudo apt install ffmpeg      # Debian, Ubuntu
brew install ffmpeg          # macOS
winget install ffmpeg        # Windows
```

Make a virtual environment in this folder and install the pinned packages:

```sh
cd tools/chord-align
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
python -m pip install -e .         # adds the chord-align command
```

## Use

Export the chart from its page in Inharmonia (Export), then run:

```sh
chord-align "Sore di Taman.m4a" sore-di-taman.json
```

This writes `sore-di-taman.aligned.json` and a report, `sore-di-taman.aligned.md`, next to the
chart. Import the `.json` back into Inharmonia.

| Option                 | What it does                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--item <id>`          | Which chart in the file to align. By default, the first chart.                                                                                                             |
| `--out <file.json>`    | Where to write the chart.                                                                                                                                                  |
| `--report <file.md>`   | Where to write the report.                                                                                                                                                 |
| `--set-key`            | Also set the key. With no transposition, the chart takes the sounding key. If the recording is transposed (a capo), the key stays and the chart's view transposes instead. |
| `--min-confidence <n>` | Sections below this confidence (0 to 1, default 0.5) keep their bars. `0` writes every section.                                                                            |
| `-v`                   | Log each step.                                                                                                                                                             |

`python -m chord_align` works the same as `chord-align`.

Only the chart's bars and tempo change, plus its key or transpose when you pass `--set-key`.
Chord symbols, section names, the form, your notes, lyrics and other items in the file stay as
they were.

### The report

- The tempo, and the tempo the chart had before.
- The transposition in semitones, the sounding key, and the chart's key.
- For each section: how many times it is played, its confidence, the alignment cost, and the
  beats it gives each chord.
- Places where one playing of a section disagrees with the others.
- Lengths changed to make whole bars, and anything left alone (with the reason).

Confidence is the share of beats where the chart's chord matches the music at least as well as
any common chord does. Cost is per beat: 0 is a perfect match, 1 is none.

## How it works

1. **The form, written out.** Each section is played `repeat` times, in form order. A chord
   repeated across bars counts as one long chord.
2. **Beats and chroma.** librosa finds the beats, starting from the chart's tempo. For each beat
   it takes the pitch classes heard in the harmonic part of the sound (constant-Q chroma, after
   separating harmonic from percussive).
3. **Transposition.** The chart's chords are tried at all 12 shifts, and the best fit wins. This
   catches capo recordings and charts written in another key. The sounding key comes from
   Krumhansl–Kessler key profiles.
4. **Alignment.** An explicit-duration Viterbi search. Each chord, in order, takes at least one
   beat, and unlabelled audio is allowed before the first chord and after the last. A weak prior
   from the chart's own lengths settles chords that sound alike. A second pass leans on the
   playings of each section whose edges can be heard.
5. **Bars.** The downbeat is placed where the most chord changes land. Each section takes the
   median length of each chord over all its playings. Then the bars are rebuilt: a chord that
   crosses a barline is split and its symbol repeated, and every bar adds up to the meter.

## Tests and evaluation

The tests use synthesised audio only: known charts played by a simple synth (chords, a bass note,
a kick on each beat, light noise). They cover tempos from 70 to 140, 3/4 and 4/4, uneven lengths,
capo renders, a silent intro, heavy noise and a chart that does not match its recording. No recordings are kept
in the repo.

```sh
ruff check . && ruff format --check .
python -m pytest
chord-align eval                   # prints the metrics for each render
```

On a clean render the bar is 90% of beats labelled correctly, bars exactly right, and tempo
within 2%. `check-output.ts` runs the app's own reader on an output, so every file the tool writes
is proven to import. From the repo root:

```sh
npx tsx --tsconfig tsconfig.app.json tools/chord-align/check-output.ts out.json
```

## Limits

- **Live versions.** An extra chorus, a longer intro or a skipped bridge breaks the match with
  the chart's form. Edit the form to match the recording first.
- **Tempo drift and rubato.** Lengths are counted in beats, so a steady drift is fine. Free time,
  pauses and big tempo changes confuse the beat tracker. The tempo written is the average.
- **A chord sequence that does not match.** Sections the recording does not support get a low
  confidence. The report says so at the top, and those sections keep their bars (unless you pass
  `--min-confidence 0`). Low confidence is always reported, never hidden.
- **Whole beats, one meter.** Lengths are whole beats. A pickup, a bar of 2/4 inside a 4/4 song
  or a meter change can't be written. They show in the report as "started off a downbeat" or as a
  change made to fill whole bars.
- **Lyrics.** A section with lyrics keeps its bars if its number of bars would change, so no line
  ends up under the wrong bar.
- **Chords the tool doesn't know** are matched on their root and fifth only, and listed in the
  report.
- **Half or double time.** The beat level is chosen to fit the chart's lengths. If the chart
  counts in half notes, the tempo comes out doubled.
