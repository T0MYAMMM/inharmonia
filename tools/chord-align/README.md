# chord-align

Chord charts typed from a lyric sheet know the chords but not how long each one lasts. Given a
recording of the song, chord-align lines the chart's chords up with the music, then writes the
chart back with:

- each chord's length in beats, with bars rebuilt to fit;
- the tempo;
- the key that sounds, if you ask for it.

Where the recording clearly plays another chord than the chart, it suggests the change, and
leaves the chart's chord in place unless you ask. It can do a whole folder of songs at once.

It runs on your computer and never goes online. The audio stays where it is: the only things
taken from it are timings, a key, and (in the report) the chords it seems to play. The tool is
not part of the web app or its build.

## Install

You need Python 3.11 or later and, for anything other than WAV or FLAC, `ffmpeg`. To read a
chord sheet (`.txt`) or a research JSON, you also need Node and the repo's packages
(`npm ci` at the repo root): the tool reads them with the app's own Paste reader.

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

This writes `sore-di-taman.aligned.json`, a report, `sore-di-taman.aligned.md`, and the suggested
chord changes, `sore-di-taman.aligned.suggestions.json`, next to the chart. Import the `.json`
back into Inharmonia.

The recording can be mp4, m4a, mp3, wav, flac or webm (anything ffmpeg reads); from a video only
the sound is read. The chart can also be:

- **a chord sheet as `.txt`**, pasted from a chord site: chords over lyrics, inline `[C]` chords,
  or bar lines. It is read exactly as Inharmonia's Paste reads it, each line's lengths estimated
  from the lyrics under it, and the lyrics are dropped as it is read. The title is the file name,
  and the key the one the chart editor would suggest.
- **a research JSON**: a `chart` string in chart syntax with `title`, `artist`, `originalKey`,
  `meter` and `bpm`, as in `research/chords-id`. No `bpm` reads as 90.

| Option                 | What it does                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--item <id>`          | Which chart in the file to align. By default, the first chart.                                                                                                                                                        |
| `--out <file.json>`    | Where to write the chart.                                                                                                                                                                                             |
| `--report <file.md>`   | Where to write the report.                                                                                                                                                                                            |
| `--set-key`            | Also set the key. With no transposition, the chart takes the sounding key, but only when it fits clearly better than the chart's own. If the recording is transposed (a capo), the key stays and the view transposes. |
| `--lengths-trusted`    | The chart's lengths are real, not guesses from a sheet: use them as a guide for lengths and the beat level. Off by default.                                                                                           |
| `--min-confidence <n>` | Sections below this confidence (0 to 1, default 0.6) keep their bars. `0` writes every section.                                                                                                                       |
| `--apply-suggestions`  | Write the suggested chord changes into the chart, then align it again with them. Off by default: suggestions are only reported.                                                                                       |
| `-v`                   | Log each step.                                                                                                                                                                                                        |

`python -m chord_align` works the same as `chord-align`.

Only the chart's bars and tempo change, plus its key or transpose when you pass `--set-key`.
Chord symbols, section names, the form, your notes, lyrics and other items in the file stay as
they were. Chord symbols change only with `--apply-suggestions`.

### Many songs at once

```sh
chord-align batch ~/Music/songs research/chords-id --out aligned/
chord-align batch ~/Music/songs charts/ --out aligned/ --manifest pairs.csv
```

The first folder holds the recordings (not its subfolders). The second is a chart file or a
folder of them, searched all the way down: Inharmonia exports (every chart in them), research
JSON and `.txt` sheets. `index.json` files are skipped.

- **Matching.** A recording goes with the chart whose title is in its file name, word for word,
  whatever else the name holds: `NIDJI - Laskar Pelangi (Official Music Video).mp4`,
  `Laskar Pelangi - Nada Asli Nidji (Capo 1).m4a` and `laskar pelangi (lyrics).mp3` all find
  Laskar Pelangi. The longest title wins, and the artist's name settles two charts with one
  title. A one-word title of three letters or fewer needs the artist too. A recording that fits
  no chart, or two equally, is listed and left alone, never guessed.
- **A manifest** overrides the matching for the files it lists: a CSV with the header
  `audio,chart`. The audio is a file name in the recordings folder or a path. The chart is a
  chart's id, its file (relative to the charts folder), or its title, as `Laskar Pelangi` or
  `Laskar Pelangi (Nidji)`.
- **Several recordings of one song.** One is aligned: a manifest's first, then the most
  official-sounding name (official, MV, music video, original), with covers, karaoke, live,
  acoustic, capo and "nada asli" (a cover in the original key) last. The summary names the
  others.

It writes into `--out`:

- `aligned-charts.json`: every aligned chart in one file to import;
- for each song, `<song>.report.md` and `<song>.suggestions.json`;
- `summary.md`: a line per song (the recording used, tempo, key and transposition, confidence,
  sections written, suggestions, and what was skipped and why), then the recordings not matched
  and the chart files that could not be read.

Charts read in a batch have their lyrics taken out, so the combined file holds none. The other
options (`--set-key`, `--lengths-trusted`, `--min-confidence`, `--apply-suggestions`) apply to
every song.

### The report

- **Summary:** the tempo (and the chart's), the transposition in semitones, the sounding key and
  the chart's key, the confidence, and how much of the music the chart's chords cover.
- **Form:** a playing of a section the recording seems to leave out, or to play twice in a row.
- **Sections:** for each, how many times it is played, its confidence, the alignment cost, and the
  beats it gives each chord.
- **Playings that disagree**, lengths changed to make whole bars, and anything left alone (with the
  reason).
- **Suggested chord changes:** see below.
- **What the recording seems to play:** for every bar, the chord heard with no chart at all (the
  best of the 24 major and minor triads) beside the chart's chords as aligned, marked where they
  differ. Sections whose clear chords mostly differ are named, apart from those that are just hard
  to hear: a wrong chart reads differently from a difficult recording.

Confidence is the share of half bars where the chart's chord fits the music about as well as any
common chord. The same chord with a seventh or an added ninth counts in full. Music with clear
chords that the chart leaves unlabelled counts against it, beyond what an intro and outro take.

### Suggested chord changes

Each chord of each section is heard in every playing, on its own: the beats it was given,
pooled, against the 24 major and minor triads and their 7, maj7, m7, sus2, sus4 and power chord
(5). The simpler chord is heard unless a richer one fits clearly better, and the bass counts as
in the alignment. A heard chord agrees with the chart's when it holds it or sits inside it
(Cmaj7 or C5 with C, C with Am7). So does a sus chord that adds only a 2nd or a 4th to the
chart's chord: Absus4 is Ab Db Eb, a Db with an added 9th.

A change is suggested when the same other chord is heard, by a margin, in at least two
playings and in most of the clear ones, or, for a section played once, in that playing, clearly
and for a full bar. Chords heard in different playings pool when one holds the other (C and Am7).
The report lists each with the section, how often it is played, the bar, the chart's chord, the
suggested one, and the evidence: in how many playings it was heard, and the margin. The same goes
into `.suggestions.json`, which also says whether they were applied.

The chart keeps its chords unless you pass `--apply-suggestions`. Then the chart takes the
suggested chords and is aligned again with them, so they get their own lengths, and the report
says they were applied.

## How it works

The chart's chords and their order are trusted. Its lengths are not: they are mostly guesses (one
chord a bar, or two at 2+2), and they are what the tool is here to correct. So, by default, they
play no part in choosing the tempo or the lengths. They only break exact ties (see the limits).

1. **The form, written out.** Each section is played `repeat` times, in form order. A chord
   repeated across bars counts as one long chord.
2. **Beats and chroma.** librosa tracks the beats twice, once from the chart's tempo and once from a
   neutral 100 bpm, each only a starting guess. Chroma (constant-Q, log-compressed so a loud melody
   does not drown a quiet chord, on the harmonic part after separating harmonic from percussive)
   is taken per beat in two bands: from C3 up, where the chord is, and C1 to B2, for the bass note.
3. **Transposition.** The chart's chords are tried at all 12 shifts, and the three best are
   aligned in full. This catches capo recordings and charts written in another key.
4. **Beat level.** Each tracked grid, and half and double of it, is aligned with free lengths. The
   cheapest wins, with priors that know nothing of the chart: a tempo from 60 to 160 bpm, chords
   of 2 to 4 beats preferred (up to 8 still usual), and a small cost for leaving the tracker's own
   beat. So a ballad at 63 with a chord a bar reads as 63, not 126, and a chart that writes 2+2
   where the song plays 4+4 gets its lengths doubled, not its tempo halved. The report names the
   other octave. Of the two ways to halve a grid, the one on the stronger onsets is kept.
5. **Alignment.** An explicit-duration Viterbi search over beats: each chord takes at least one
   beat, with unlabelled audio allowed before the first chord and after the last. The path may
   leave out one playing of a section, or play one twice in a row, at a cost. A chord costs how far
   it falls short of the best common chord on that beat, plus a little when the bass plays none
   of its tones. A bass held under changing chords (a pedal) is not counted. A second pass leans on the playings of each section whose
   edges can be heard, and on chord changes falling on the downbeat.
6. **Bars.** The downbeat is placed where the most chord changes land. Each playing of a section is
   measured on that bar grid, from its nearest downbeat to the next playing's, so a first chord
   heard a beat early (a pickup, a push) does not shift the bars: they follow the same grid as the
   report's bar table. The song's last chord fades rather than changes, so it ends on the nearest
   downbeat, and never before the end of the bar it starts in. Each section takes the median
   length of each chord over its playings. Halfway medians go whichever way fills whole bars
   with the most changes on downbeats. The bars are rebuilt: a chord that crosses a barline
   is split and its symbol repeated, and every bar adds up to the meter.
7. **Key.** Krumhansl–Kessler profiles, fitted to the chroma and to the aligned chords together.
8. **Suggestions.** The alignment is run once more with each beat's cost capped. A chord the
   recording does not play then keeps its place, instead of being squeezed to a beat by its
   neighbours, and what is played there can be heard (see “Suggested chord changes”).

## Tests and evaluation

The tests use synthesised audio only, and no recordings are kept in the repo. Beyond the renders:

- **Your own files:** a `.txt` sheet and a research JSON become valid files through the app's
  reader, with no lyrics in them; hundreds of charts in one call.
- **Suggestions:** a render whose chart has one chord wrong gets it suggested, not written
  without the flag, and with the flag written and aligned again. No matching render gets a
  suggestion; both wrong charts do.
- **Batch:** file names to charts, the manifest, the official recording over a cover, recordings
  left unmatched, and two synthesised songs end to end, their combined file read by the app.

- **Clean renders:** chords struck on every beat, a bass note, a kick and light noise. They cover
  tempos from 70 to 140, 3/4 and 4/4, uneven lengths (2+2, 3+1, a 6-beat chord across a barline),
  capo renders, a silent intro, N.C., heavy noise, and a chart that does not match.
- **Band renders:** strummed guitar, a walking bass with approach notes, a melody with passing
  tones, syncopated drums, tempo drift of ±3%, a slowing at the end, reverb and noise. Among them:
  - a capo recording;
  - a chart written 2+2 where the song plays 4+4, and the same with the chart's tempo halved too;
  - a ballad at 63 with a chord a bar, whose chart says 126;
  - a beat of pickup, with the guitar pushing each change;
  - a quiet verse with an Ab held in the bass under changing chords;
  - a recording with a section more than the chart, and one with a section less;
  - a chart with the song's chords in the wrong order.

```sh
ruff check . && ruff format --check .
python -m pytest
chord-align eval                   # prints the metrics for each render
```

The bar for every matching render: 90% of beats labelled correctly, tempo within 2%, the
transposition found, and any change of form reported. Clean renders, the 2+2-for-4+4 renders, the
ballad, the pickup and the quiet verse must also rebuild every bar exactly. Wrong charts must come out below the confidence threshold,
with their bars left alone. `check-output.ts` runs the app's own reader on an output, so every file
the tool writes is proven to import. From the repo root:

```sh
npx tsx --tsconfig tsconfig.app.json tools/chord-align/check-output.ts out.json
```

## Limits

- **Live versions.** One playing left out, or one played twice in a row, is found and reported.
  Anything bigger (a new section, a long jam, sections in another order) breaks the match. It
  shows as low confidence, unlabelled music or disagreeing playings. Edit the form to match the
  recording first.
- **Tempo drift and rubato.** Lengths are counted in beats, so a steady drift is fine. Free time,
  pauses and big tempo changes confuse the beat tracker. The tempo written is the average.
- **A chord sequence that does not match.** Sections the recording does not support get a low
  confidence. The report says so at the top, and those sections keep their bars (unless you pass
  `--min-confidence 0`). Low confidence is always reported, never hidden. “What the recording seems
  to play” shows where.
- **Chords inside chords.** C sits inside Am7, and F inside Dm7. Where a chart has both side by
  side, only the bass tells them apart, and a walking bass or a pedal can blur the change by a
  beat or two.
- **Identical chords that meet,** like a verse ending on C and a chorus starting on C. The change
  can't be heard, so the split follows the playings where it can be, and failing that, the chart.
- **Whole beats, one meter.** Lengths are whole beats. A pickup, a bar of 2/4 inside a 4/4 song
  or a meter change can't be written. They show in the report as "started off a downbeat" or as a
  change made to fill whole bars.
- **Lyrics.** A section with lyrics keeps its bars if its number of bars would change, so no line
  ends up under the wrong bar.
- **Chords the tool doesn't know** are matched on their root and fifth only, and listed in the
  report.
- **Suggestions** are evidence, not answers. A wrong chord next to a chord that shares its notes
  can still lose most of its beats, and a playing shorter than two beats is not judged, so a
  wrong chart can get no suggestion: “What the recording seems to play” still shows it. Relative
  chords (Fm and Ab, Bbm and Db) differ by one note, so a suggestion between them needs the bass
  to agree. A sus chord's root can't be heard (Esus2 and Bsus4 are the same notes).
- **The chart's tempo** is the beat tracker's first starting guess (the second is 100 bpm), so
  a chart that says a very different tempo can change the beat level found.
- **Half or double time** is a judgement: the beat is kept between 60 and 160 bpm, with chords of 2
  to 4 beats, where the music allows. A ballad felt at 50 bpm comes out at 100, with every length
  doubled. The report names the other octave, so you can halve or double the lengths if the song
  is counted that way.
