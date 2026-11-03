"""The known charts that tests and ``chord-align eval`` render and align.

They cover tempos from 70 to 140, 3/4 and 4/4, uneven lengths (2+2, 3+1, a
6-beat chord across a barline), capo renders, a silent intro, N.C., a render
under heavy noise, and a chart that does not match its render at all.
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
                ("Bdim", "E", "F#m", "Bb", "Dbaug", "E", "F#m", "Bb"),
                repeat=2,
            ),
        ),
        form=("verse",),
    ),
)


def by_name(name: str) -> RenderSpec:
    """The render with this name."""
    return next(r for r in RENDERS if r.name == name)
