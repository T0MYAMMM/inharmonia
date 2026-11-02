# Composing for Inharmonia

How a song gets into Inharmonia's catalogue, from Studio to the pull request, and what review
checks on the way.

## 1. Who it's for

Composers the owner has invited to add songs. The catalogue is small on purpose and every song
is reviewed. There are no accounts and no backend: a song arrives as a file, and a pull request
adds it.

You need a browser with Inharmonia open, and either a GitHub account or a way to send the owner
a file. You don't need to code or to install anything.

## 2. What a catalogue song is

One JSON file in the app's own [file format](format/README.md), at
`public/library/<piece>.json`:

- **One to three versions** of one piece: Easy, Medium and Advanced. One is enough. Each
  version's id is the piece id and its level (`evening-ferry-easy`).
- **One title, one summary and one credit** for all of them. The credit is either your own
  piece, with your name as its composer, or a public-domain piece with the proof the rules need
  (see [Rights](#10-rights)).
- **Songs only**: no charts, progressions or recordings. A file is at most 512 kB.

People find it in the catalogue on the Songs page, download it once, and from then on it plays
offline on their device like the built-in songs. Downloads are checked against the catalogue's
index (size and SHA-256) and the same rules review uses, so only the file you sent can arrive.

The piece id is permanent: it names the file and every version's progress on people's devices.
Use lowercase letters, digits and dashes, like `evening-ferry`. Ids of pieces that left
Inharmonia (`config/library.ts`, `RETIRED_PIECES`) are never used again.

## 3. Studio

Make each version as its own song in [Studio](../README.md#studio) and save it to Your songs:

- **Sing or hum** a melody, fix the notes and chords in the editor, then Save.
- **Compose in MIDI** on the piano roll, or **open a MIDI file**. A MIDI song keeps every
  track, so playback is your arrangement, and the score shows its top line to practise.

Studio songs are up to 32 bars when written in its editor, and up to 512 bars from MIDI, in
2/4, 3/4 or 4/4. Give each version the playing it is for: Easy with fewer, longer notes in an
easy key, Advanced with the full piece.

## 4. `/compose`

Open `/compose` in Inharmonia (it is not linked from the app: type it after the app's address,
as in `…/inharmonia/compose`).

1. **The versions:** pick a song from Your songs for Easy, Medium and Advanced, at least one.
2. **About it:** the title, the piece id (made from the title until you change it) and a
   one-line summary for the card, up to 140 characters. If the id is already in Inharmonia, the
   page says so: your file would replace that piece.
3. **Credit:** your own piece, with your name; or public domain, with the composer (blank for a
   traditional tune), the year they died, the year the piece was first published, the early
   edition the notes come from, and its editor if it names one.
4. **The rights:** tick the line (see [The PR checklist](#6-the-pr-checklist)).

The page runs the same checks CI and every download run, as you type, and lists what is
missing in plain words. When nothing is, **Download `<piece>.json`** saves the file.

## 5. Listen first

Before sending it, open Songs and, under **Made by you**, use **Import file** with the file you
downloaded. Each version arrives as a song of yours: play it through at each level, in Listen
and in Practice, on a phone too if you can. Change it in Studio and put the file together again
until it is right.

## 6. The PR checklist

Open a pull request on [T0MYAMMM/inharmonia](https://github.com/T0MYAMMM/inharmonia) that adds
your file as `public/library/<piece>.json`, then run `npm run songs` and commit what it writes
(the catalogue's index, and your file put in the app's order). If you can't run npm, say so in
the pull request; the owner runs it.

**No GitHub?** Send the file to the owner instead, with the answers below. The owner opens the
pull request for you, and credits you as the composer.

Copy this into the pull request and tick each line:

```
- [ ] You own this arrangement, or it is public domain, and you allow Inharmonia to distribute it free in the app; you keep your copyright.
- [ ] I listened to every version through Import, in Listen and in Practice.
- [ ] The piece id is new, or this replaces my own earlier version of it (say which).
- [ ] Public domain only: the edition the notes come from, and where to see it.
```

## 7. What review checks

**CI**, on every pull request:

- `npm run songs -- --check`: the file reads cleanly and is written the app's way; it holds
  songs only, one to three versions, each level once, each id `<piece>-<level>`; one title and
  one credit, an original with its composer or public domain proved for this year; not a
  retired id or one listed twice; at most 512 kB; and the index is up to date and under 50 kB
  gzipped.
- The unit tests compile every version of every catalogue song.
- The e2e tests download a catalogue song, play it, and refuse a file that doesn't match the
  index.

**The owner**, by hand: the credit and the rights; for public domain, the edition and the
dates; and listening to every version through Import. Then the owner merges, and the song is
in the catalogue on the next deploy.

## 8. Changing or withdrawing a song

- **Changing:** put the new versions together in `/compose` under the same piece id and send
  the new file the same way. Merged, its index entry gets a new SHA-256, and anyone who
  downloaded the song sees **Update** on its card and its page. Updates are never automatic.
- **Withdrawing:** ask the owner, in a pull request or by message. The file and its index entry
  are removed and its id goes into `RETIRED_PIECES`, so the id is never used again and an old
  link says the piece is no longer in Inharmonia. Copies already downloaded stay on those
  devices until their owners remove them.

## 9. Arranging a public-domain piece as a `.piece`

Public-domain pieces can also be written as text, the way the built-in pieces are: one
`src/content/songs/sources/<piece>.piece` in the [piece source format](format/source.md). Write
the notes as the early edition has them; the generator makes Easy, Medium and Advanced from
them. `npm run songs` writes the piece to `public/library/<piece>.json`, or to
`src/content/songs/` for one of the few built-in pieces named in `config/library.ts`, and prints
the bars where Easy merged notes, to check by ear.

## 10. Rights

**Your own piece:** you keep the copyright. By sending it you allow Inharmonia to distribute it
free in the app: a non-exclusive licence, so you can publish it anywhere else too. Any paid
terms would come later, separately, and only with your agreement.

**Public domain:** the app is used from Indonesia and around the world, so a piece goes in only
if both rules hold, computed from the current year (`src/core/content/publicDomain.ts`):

- everyone whose work it uses (composer, arranger, and an editor whose own additions are used)
  died at least 70 full years ago;
- the piece was first published at least 96 years ago.

Take the notes from an early or first edition, never from a modern edition's additions or a
published simplification, and name that edition in the credit.
