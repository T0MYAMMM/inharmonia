# P7 release: lazy rooms, the song catalogue and room colour together

The `release/p7` branch with perf/lazy-load, feat/library-lazy and feat/visual-rooms merged, and
the glue commits on top. Each page in the light and dark themes, at 1280×900 (desktop) and
360×780 (a phone: touch, `pointer: coarse`, one device pixel per CSS pixel). A fresh browser with
nothing saved. Whole pages are cut at 1400px (desktop) and 2000px (phone).

| Page                                             | Shows                                                                                                                                                                    | Files                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Home                                             | The welcome, and the rooms, each drawn from what it holds. The Songs room draws Twinkle's opening from the built-in index: three bars of 2/4.                            | `home-{light,dark}-{1280,360}.png`           |
| `/songs`                                         | Your songs, Make your own and the Catalogue. Every song card opens with its first bars on a staff (at least two bars and six beats), across the card's top on a phone.   | `songs-{light,dark}-{1280,360}.png`          |
| A song page, `/songs/twinkle-twinkle-easy`       | The first screen: Play first in the player, clear of the keyboard dock at both widths. The version's note and Send to / Export are under the player, out of this screen. | `song-{light,dark}-{1280,360}.png`           |
| A catalogue deep link, `/songs/minuet-in-g-easy` | A song in the catalogue but not on this device, with Download. The first screen.                                                                                         | `catalogue-link-{light,dark}-{1280,360}.png` |
| `/compose`                                       | The form for composers. It isn't linked from the app.                                                                                                                    | `compose-{light,dark}-{1280,360}.png`        |
| `/fills`                                         | The fills in their room's colour, each card drawing its run.                                                                                                             | `fills-{light,dark}-{1280,360}.png`          |

## Play before the rest of the player

`player-order/`: the first screen of a song (Twinkle, Easy), a fill (step-up), a progression
(ii–V–I) and a chord chart (an invented one, as `e2e/layout.spec.ts` makes it), light theme,
before and after the player's new order, at 1280 and 360. Before, Play sat behind the keyboard
dock at 360. After, Play comes first in the player, and the settings that shape the lesson come
last. On a song, the version's note and Send to / Export move under the player; on a chart, Edit,
Send to, Export and Show function do. On a fill, Play goes above the chord strip.

| Page        | Play ends at 360, before | After | The dock starts at |
| ----------- | ------------------------ | ----- | ------------------ |
| Song        | 810px                    | 526px | 561px              |
| Fill        | 753px                    | 518px | 561px              |
| Progression | 682px                    | 524px | 561px              |
| Chord chart | 718px                    | 502px | 561px              |

Files: `player-{song,fill,progression,chart}-{before,after}-light-{1280,360}.png`. The chart's
"before" is the release branch before the chart's actions moved, so Play there already comes first
in the player (614px): the chart's own header was what kept it behind the dock.
