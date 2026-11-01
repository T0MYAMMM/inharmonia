# P7 release: lazy rooms, the song catalogue and room colour together

The `release/p7` branch with perf/lazy-load, feat/library-lazy and feat/visual-rooms merged, and
the glue commits on top. Each page in the light and dark themes, at 1280×900 (desktop) and
360×780 (a phone: touch, `pointer: coarse`, one device pixel per CSS pixel). A fresh browser with
nothing saved. Whole pages are cut at 1400px (desktop) and 2000px (phone).

| Page                                             | Shows                                                                                                                                | Files                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Home                                             | The welcome, and the rooms, each drawn from what it holds. The Songs room draws Twinkle's opening from the built-in index.           | `home-{light,dark}-{1280,360}.png`           |
| `/songs`                                         | Your songs, Make your own and the Catalogue. Every song card opens with its first bars on a staff, across the card's top on a phone. | `songs-{light,dark}-{1280,360}.png`          |
| A song page, `/songs/twinkle-twinkle-easy`       | The first screen. At 1280 Play is clear of the keyboard dock. At 360 Play is still behind it (see below).                            | `song-{light,dark}-{1280,360}.png`           |
| A catalogue deep link, `/songs/minuet-in-g-easy` | A song in the catalogue but not on this device, with Download. The first screen.                                                     | `catalogue-link-{light,dark}-{1280,360}.png` |
| `/compose`                                       | The form for composers. It isn't linked from the app.                                                                                | `compose-{light,dark}-{1280,360}.png`        |
| `/fills`                                         | The fills in their room's colour, each card drawing its run.                                                                         | `fills-{light,dark}-{1280,360}.png`          |

At 360×780, Play on a song page sits behind the keyboard dock. That happens on main too. The
dock is 219px tall there, and on the welcome song Play ends at 810px while the dock starts at
561px. `e2e/layout.spec.ts` checks Play against the dock's top edge on a song, the welcome song,
a fill, a progression and a chord chart. Those tests are marked `test.fail` until the layout is
fixed.
