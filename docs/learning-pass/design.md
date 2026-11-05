# Design Direction: the learning pass (Phase 2)

Context: the practice loop and the first visit, on the song, chart, progression, fill, chords,
ear-training, Home and Progress screens. What exists is in `critique.md` (Phase 1). pen.dev is not
installed, so each change is described against the before-captures in
`docs/screenshots/learning-pass/before/`.

Design intent: a beginner at the keys always knows the next note, hears what went wrong in plain
words, and can reach Play or Pause without scrolling. Nothing new is coloured: amber stays the
target, dusk the chord tones, red the wrong press, ink the primary action.

Liveliness: energy 1, rhythm 1, motion L1 (state changes only; no new animation). References are
for principles only: wait-for-the-right-note as in Flowkey and Simply Piano (the target stays lit
until it is played; a wrong key is told, not punished), calm density as in Linear.

## 1. Song, chart, progression and song-of-your-own player: the words of practice

Before (`practice-wrong-after-360-light.png`, `practice-right-360-light.png`): a wrong press flashes
the key red for 260 ms; the hidden live region says "Not that one. 1 missed."; a right press says
nothing and leaves the miss text in the region; a partial chord says nothing; the counts sit below
the dock on a phone.

After:

- One feedback line in the dock's legend row, in ink at weight 600, right after the two swatches,
  on its own line under 600 px: visible wherever the keys are. The same words go to the existing
  polite live region. The counts stay in the status line (one fact, one place).
- The words, from the controller:
  - miss on a note: "Not quite: play D, the amber key."
  - miss on a chord: "Not quite: play G, the ringed keys."
  - miss in both hands with the chord due: "Not quite: play D with G."
  - hit: "D. Next: G." (a chord target: "G. Next: C.")
  - partial chord: "One more note." or "2 more notes."; in both hands, when the melody note is not
    down yet: "Now the melody note, D."; when the chord is short: "Hold G with it: 2 more notes."
  - the last note: "Finished: 16 hits, 1 miss." (as now); Start over: "Back to the first note."
  - changing hand or mode clears the line.
- Note names come from `formatNote` in the chosen notation (letters, Roman or not angka): the
  visible line uses the label text ("F♯"), the live region the spoken form ("F sharp").
- Play-along shows its timing word ("On time", "Late") in the same line, as it already announces.
- The 260 ms red flash stays; the words carry what the flash cannot.

States: Listen shows no line. Practice before the first press shows nothing (the amber key and the
score say what to play). Reduced motion: no change, the line is state.

## 2. Keyboard dock on a phone: the primary action within reach

Before (`audio-playing-360-light-top.png`): after Play, the page follows the bar and Pause scrolls
off; under 600 px the panel is static.

After: when the panel's Play button has left the viewport and the width is under 600 px, the dock's
legend row ends with one primary button before the input label: "Pause" or "Play" in Listen,
"Stop" or "Play" in Play-along, "Hear it" in Practice. It is the panel's own primary action, moved
within reach; it is never shown while the panel's Play is on screen, so there is never a second
primary on one screen. 44 px on touch, from the Button tokens. It appears and disappears with no
animation. On desktop the panel is sticky, so the button never shows.

Decision receipt. Options: (a) this button; (b) stop following the bar in Overview on phones; (c)
a sticky panel on phones. Evidence: the measurement (Play at −520 px) and SHELL-5's decision
against a sticky panel. Choice (a), confidence High: it keeps the score following and keeps one
focal point. Trade-off: 44 px more dock while playing on a phone. Test: the mobile e2e plays,
waits for bar 2 and finds Pause in the dock.

## 3. Score on a phone: Practice opens Follow Along

Before (`song-practice-360-light-full.png`): in Overview, bars with five or more notes hide their
chips; 10 of 16 bars in Minuet in G Easy.

After: switching to Practice on a width under 600 px switches a song's score to Follow Along (one
bar, every note, beat numbers, Previous and Next). Leaving Practice returns to the view that was
there before. If the player picks another view during practice, it is kept. Listen keeps
Overview. Charts and progressions have no views and no change.

Decision receipt. Options: (a) Follow Along in Practice on phones; (b) render the practised bar's
chips in Overview. Choice (a), confidence High: it is one rule, uses what exists, and shows beat
numbers. Trade-off: the whole-piece map is a tap away in Practice on a phone.

## 4. Keyboard dock: audio and MIDI state

Before (`audio-loading-1280-light-top.png`): nothing says the synth plays while the piano loads, that
the piano failed, or that a MIDI keyboard came or went.

After: a muted notice line in the dock's legend (own line under 600 px), with a mounted polite
live region:

| State                    | Text                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| before the first gesture | nothing                                                                                                                                   |
| starting                 | "Starting the sound."                                                                                                                     |
| synth, samples loading   | "Loading the piano, a simple synth plays for now."                                                                                        |
| ready                    | "Piano ready." for four seconds, then nothing                                                                                             |
| error, online            | "The piano couldn't load, so a simple synth plays."                                                                                       |
| error, offline           | "Offline and the piano isn't saved yet, so a simple synth plays."                                                                         |
| MIDI device appears      | "MIDI keyboard connected: Keystation 49." for six seconds                                                                                 |
| MIDI device goes         | "MIDI keyboard disconnected. Tap the keys, or plug it back in." (touch) or "… Use the computer keys, or plug it back in." for six seconds |

A MIDI notice takes the line while it shows; the audio notice returns after. Ear training has no
dock, so its card gets the audio notice under the round line.

## 5. Home: the first visit

Before (`home-first-360-light-full.png`): "New here?", the keys drawing with computer-key letters,
three long steps, then the buttons about 1,900 px down on a phone.

After, in one order at every width: "New here?", then the two buttons ("Start with Twinkle,
Twinkle" primary, "Got it" ghost), then three one-line steps, then the drawing (right column on
desktop, under the steps on a phone). The first step is written for the device: on touch, "Find
the keys. Tap the piano at the foot of every practice page, or plug in a MIDI keyboard and connect
it there." On a desktop, "Find the keys. Click the piano at the foot of every practice page, or
use your computer keyboard: A to ' play C4 to F5. A MIDI keyboard connects there too." Both end
with "Try them on the keyboard page." The drawing shows the key letters only when a computer
keyboard is there to press.

Terms, explained on the screen where they first appear: the Chords card reads "How each chord is
built, and the ways to spread it over the keys: inversions and voicings. Then a drill." The
Progressions card reads "Chord progressions in any key, with a comping pattern, the left hand's
accompaniment, under them. Practise them, or play along in time." The Progress card reads "Your
best scores, your last seven days, and what to look at today." The Today card says "Practised 3
of the last 7 days." instead of the run.

## 6. Progress: the week, not the streak

Before: "4 · days in a row", "3 of 7 · days this week", "5 · exercises tried".

After: "3 of 7 · days practised, of the last seven" with the week dots, and "5 · exercises tried".
No run anywhere. Decision receipt: the owner chose it over keeping the count; evidence is the
brief's rule against streak pressure; trade-off: a regular player loses one number they may like;
test: none needed, copy.

## 7. Chords, drill, fills, progressions: one line per term

- Chords page, under Voicing style: "The same chord, its notes spread differently over the keys."
  Under Inversion: "Which chord tone sits at the bottom." Both as the muted note the drill already
  uses under How strict.
- Drill lede: "Ten chords a round. Play each one and hold it; take as long as you need. A chord is
  clean when you play it with no wrong note and no Show me."
- Fills speed-up note: "One bar to count in, then play the fill each time round. A time round is
  clean when every note lands on time and nothing extra is played; 3 clean in a row and it speeds
  up."
- Progressions lede: "Common chord progressions, written as Roman numerals: each names a chord by
  its place in the key, so a progression is the same in every key. Play them in any key, with any
  voicing and comping pattern, the left hand's accompaniment, then practise them or play along in
  time."
- The progression player's "Comping" toggle becomes "Accompaniment", the word the song arrangement
  and the chart already use for the same thing.
- Ear training, Chord quality card: "Quality is the chord's kind: major, minor and the rest. Press
  Play, then choose. Number keys answer too."

## 8. Progression page: Play first

Before (`progression-360-light-top.png`): Make a copy to edit, Send to and Export sit above Play.

After: the header holds the crumb, the title, the numerals and the description; the three actions
move under the player's controls, before the bar cards, in the song page's row style. Play rises
from 480 px to about 340 px on a phone.

## 9. Ear training on a phone: the pickers fold

Before (`ear-360-light-top.png`): Exercise and Level wrap to two lines each; Play at 666 px.

After: under 600 px the two pickers sit inside a folded line that reads "Chord quality · Major or
minor" (the progression page's fold), open on tap; the card with Play and the answers comes next,
about 250 px higher. Above 600 px nothing changes.

## 10. Polish

Sentence case: "Follow along", "Falling notes", "Full screen", "Exit full screen". The three
pulses read `--pulse-ms`. The credit line reads "Christian Petzold, 1894 edition": the year is the
edition the notes come from; `creditLine` changes, the two song indexes are rebuilt, and the tests
that quote it follow (done at build time: the ripple was six files).

## Responsive, states, assumptions

- Widths: 360, 820 and 1280 captured again in Phase 4; the only width-specific behaviour is the
  dock action and the Follow Along default, both under 600 px.
- Every new text sits in a mounted live region or a static line; nothing animates; nothing is
  colour alone.
- Design assumptions: the wording above; "Accompaniment" for the toggle; four and six seconds for
  the transient notices.
- Unconfirmed capabilities: MIDI connect and disconnect cannot be exercised here; the notice is
  unit-tested with a fake MIDI state.
- No new token, no new colour, no third-party request, no new dependency.
