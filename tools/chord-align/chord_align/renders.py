"""The known charts that tests and ``chord-align eval`` render and align.

Clean renders cover tempos from 70 to 140, 3/4 and 4/4, uneven lengths (2+2,
3+1, a 6-beat chord across a barline), capo renders, a silent intro, N.C., heavy
noise, and a chart that does not match its render at all.

Band renders (``band-*``) sound more like a recording: strummed guitar, a
walking bass, a melody with non-chord tones, syncopated drums, tempo drift of
±3%, a slowing at the end, reverb and noise. Among them: a capo recording, a
chart whose lengths are all half the truth (written 2+2, played 4+4), the same
with the chart's tempo halved too, a recording with one section more than the
chart, one with a section less, and a wrong chart.
"""

from __future__ import annotations

from .synth import RenderSpec, SectionSpec, guess_bars


def _section(sid: str, label: str, kind: str, truth: list[str], meter: int, repeat: int = 1) -> SectionSpec:
    return SectionSpec(sid, label, kind, tuple(truth), guess_bars(tuple(truth), meter), repeat)


RENDERS: tuple[RenderSpec, ...] = (
    RenderSpec(
        name="even-70",
        tempo=70,
        meter=4,
        sections=(
            _section("verse", "Verse", "verse", ["C", "G", "Am", "F"], 4),
            _section("chorus", "Chorus", "chorus", ["F", "G", "C", "C"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus"),
    ),
    RenderSpec(
        name="uneven-96",
        tempo=96,
        meter=4,
        key=("G", "major"),
        chart_tempo=90,
        sections=(
            _section("verse", "Verse", "verse", ["G D", "Em . . C", "G . . D", "Cadd9"], 4, repeat=2),
            _section("chorus", "Reff", "chorus", ["C . . D", "G", "Em7 . . D", "Csus2"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus"),
    ),
    RenderSpec(
        name="waltz-120",
        tempo=120,
        meter=3,
        key=("F", "major"),
        chart_tempo=112,
        sections=(
            _section("a", "Bait", "verse", ["F", "Bb C .", "Dm", "Gm . C", "F", "F"], 3, repeat=2),
            _section("b", "Reff", "chorus", ["Bb", "C", "Am Dm .", "Gm", "C7", "F"], 3),
        ),
        form=("a", "b", "a", "b"),
    ),
    RenderSpec(
        name="long-140",
        tempo=140,
        meter=4,
        key=("D", "major"),
        chart_tempo=132,
        sections=(
            _section("verse", "Verse", "verse", ["D", "D Bm", "Bm", "G A"], 4, repeat=2),
            _section("chorus", "Chorus", "chorus", ["Gmaj7", "A", "D . . F#m", "Bm", "G", "Asus4 A"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus"),
    ),
    RenderSpec(
        name="capo-84",
        tempo=84,
        meter=4,
        transpose=2,
        expected_shift=2,
        sections=(
            _section("verse", "Verse", "verse", ["C . . Em", "Am", "F G", "C"], 4, repeat=2),
            _section("chorus", "Chorus", "chorus", ["F", "G", "Em Am", "F . . G"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus"),
    ),
    RenderSpec(
        name="intro-90",
        tempo=90,
        meter=3,
        key=("A", "minor"),
        transpose=9,
        expected_shift=9,
        intro_seconds=3.0,
        sections=(
            _section("verse", "Verse", "verse", ["Am", "Am", "Dm E", "Am", "F", "G", "C E", "Am"], 3),
            _section("chorus", "Chorus", "chorus", ["F", "G . C", "Dm", "E7"], 3, repeat=2),
        ),
        form=("verse", "chorus", "verse", "chorus"),
    ),
    RenderSpec(
        name="nc-110",
        tempo=110,
        meter=4,
        key=("Eb", "major"),
        chart_tempo=100,
        sections=(
            _section("intro", "Intro", "intro", ["Eb", "Bb"], 4),
            _section("verse", "Verse", "verse", ["Eb . . Cm", "Ab", "Bb", "N.C."], 4, repeat=2),
            _section("chorus", "Chorus", "chorus", ["Abmaj7", "Bb", "Gm7 Cm7", "Fm7 . . Bb7"], 4),
        ),
        form=("intro", "verse", "chorus", "verse", "chorus"),
    ),
    RenderSpec(
        name="noisy-104",
        tempo=104,
        meter=4,
        key=("E", "minor"),
        noise=0.08,
        seed=3,
        sections=(
            _section("verse", "Verse", "verse", ["Em . . D", "C", "G D", "Em", "Em"], 4, repeat=2),
            _section("chorus", "Chorus", "chorus", ["C", "D . . Bm", "Em", "Am7 B7"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus"),
    ),
    RenderSpec(
        name="mismatch-100",
        tempo=100,
        meter=4,
        mismatched=True,
        sections=(
            SectionSpec(
                "verse",
                "Verse",
                "verse",
                ("C", "F", "G", "C", "Am", "F", "G", "C"),
                # No transposition turns these into the song's triads.
                ("Bdim", "Ebaug", "F#dim", "Abaug", "C#dim", "Ebaug", "F#dim", "Abaug"),
                repeat=2,
            ),
        ),
        form=("verse",),
    ),
)


_BAND = {"band": True, "drift": 0.03, "rubato": True, "reverb": 0.25, "noise": 0.01, "exact": False}


def _band_section(
    sid: str, label: str, kind: str, truth: list[str], meter: int, repeat: int = 1
) -> SectionSpec:
    return _section(sid, label, kind, truth, meter, repeat)


BAND_RENDERS: tuple[RenderSpec, ...] = (
    RenderSpec(
        name="band-84",
        tempo=84,
        meter=4,
        key=("G", "major"),
        chart_tempo=90,
        sections=(
            _band_section("verse", "Verse", "verse", ["G . . D", "Em7 C", "Am7", "D7"], 4, repeat=2),
            _band_section("chorus", "Chorus", "chorus", ["C", "G/B", "Am7 . . D", "G", "Cadd9", "D"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus"),
        seed=11,
        **_BAND,
    ),
    RenderSpec(
        name="band-waltz-96",
        tempo=96,
        meter=3,
        key=("D", "major"),
        chart_tempo=100,
        sections=(
            _band_section("a", "Bait", "verse", ["D", "D", "Bm . G", "A", "D", "F#m", "G A .", "D"], 3),
            _band_section("b", "Reff", "chorus", ["G", "A", "F#m Bm .", "Em", "A7", "D"], 3, repeat=2),
        ),
        form=("a", "b", "a", "b"),
        seed=12,
        **_BAND,
    ),
    RenderSpec(
        name="band-capo-66",
        tempo=66,
        meter=4,
        key=("C", "major"),
        transpose=1,
        expected_shift=1,
        intro_seconds=2.0,
        chart_tempo=70,
        sections=(
            _band_section("verse", "Bait", "verse", ["C", "Em", "Am . . G", "F", "Dm7", "G"], 4, repeat=2),
            _band_section("chorus", "Reff", "chorus", ["F G", "Em Am", "Dm7 G", "C"], 4, repeat=2),
        ),
        form=("verse", "chorus", "verse", "chorus"),
        seed=13,
        **_BAND,
    ),
    RenderSpec(
        name="band-x2-84",
        tempo=84,
        meter=4,
        key=("Ab", "major"),
        chart_tempo=80,
        sections=(
            # Played a bar each; the sheet wrote two chords a bar.
            SectionSpec("verse", "Bait", "verse", ("Ab", "Db", "Ab", "Eb"), ("Ab Db", "Ab Eb"), repeat=2),
            SectionSpec(
                "chorus", "Reff", "chorus", ("Gb", "Db", "Bbm", "Eb", "Ab", "Ab"), ("Gb Db", "Bbm Eb", "Ab")
            ),
        ),
        form=("verse", "chorus", "verse", "chorus"),
        seed=14,
        **(_BAND | {"exact": True}),
    ),
    RenderSpec(
        name="band-x2-tempo42",
        tempo=84,
        meter=4,
        key=("Ab", "major"),
        # The sheet halves every length and its tempo too: 42 where the song is at 84.
        chart_tempo=42,
        sections=(
            SectionSpec("verse", "Bait", "verse", ("Ab", "Db", "Ab", "Eb"), ("Ab Db", "Ab Eb"), repeat=2),
            SectionSpec(
                "chorus", "Reff", "chorus", ("Gb", "Db", "Bbm", "Eb", "Ab", "Ab"), ("Gb Db", "Bbm Eb", "Ab")
            ),
        ),
        form=("verse", "chorus", "verse", "chorus"),
        seed=18,
        **(_BAND | {"exact": True}),
    ),
    RenderSpec(
        name="band-extra-100",
        tempo=100,
        meter=4,
        key=("A", "minor"),
        sections=(
            _band_section("verse", "Verse", "verse", ["Am", "F", "C", "G"], 4),
            _band_section("chorus", "Chorus", "chorus", ["F G", "Em Am", "Dm", "E7"], 4),
            _band_section("outro", "Outro", "outro", ["Am", "Am"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus", "outro"),
        played_form=("verse", "chorus", "verse", "chorus", "chorus", "outro"),
        form_change=("twice", "Chorus"),
        seed=15,
        **_BAND,
    ),
    RenderSpec(
        name="band-missing-92",
        tempo=92,
        meter=4,
        key=("E", "major"),
        sections=(
            _band_section("verse", "Verse", "verse", ["E", "B", "C#m", "A"], 4),
            _band_section("chorus", "Chorus", "chorus", ["A B", "G#m C#m", "F#m", "B7"], 4),
            _band_section("bridge", "Bridge", "bridge", ["C#m", "G#m", "A", "B"], 4),
        ),
        form=("verse", "chorus", "verse", "chorus", "bridge", "chorus"),
        played_form=("verse", "chorus", "verse", "chorus", "chorus"),
        form_change=("left out", "Bridge"),
        seed=16,
        **_BAND,
    ),
    RenderSpec(
        name="band-mismatch-90",
        tempo=90,
        meter=4,
        mismatched=True,
        sections=(
            SectionSpec(
                "verse",
                "Verse",
                "verse",
                ("C", "Am", "F", "G", "C", "Em", "F", "G"),
                # The song's own chords in the wrong order: a chart that does not follow it.
                ("G", "F", "Em", "C", "G", "F", "Am", "C"),
                repeat=2,
            ),
        ),
        form=("verse",),
        seed=17,
        **_BAND,
    ),
)

ALL_RENDERS: tuple[RenderSpec, ...] = RENDERS + BAND_RENDERS


def by_name(name: str) -> RenderSpec:
    """The render with this name."""
    return next(r for r in ALL_RENDERS if r.name == name)
