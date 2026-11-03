from __future__ import annotations

import dataclasses
import json
from functools import cache
from typing import Any

import numpy as np
import pytest

from chord_align.chart import read_chart
from chord_align.pipeline import Result, run
from chord_align.renders import ALL_RENDERS, RenderSpec, by_name
from chord_align.report import build_report
from chord_align.suggest import (
    CLEAR,
    HIGH_CLEAR,
    MARGIN,
    Heard,
    Playing,
    Suggestion,
    agrees,
    corrected,
    decide,
    hear,
    suggestions_file,
    vocabulary,
)
from chord_align.symbols import parse_symbol
from chord_align.synth import chart_file, render
from chord_align.tonality import template

from .conftest import check_output, scored


def _heard(symbol: str) -> Heard:
    return next(h for h in vocabulary() if h.chord.symbol == symbol)


def _playing(
    symbol: str, *, margin: float = 0.3, clarity: float = 0.9, ok: bool = False, beats: int = 4
) -> Playing:
    return Playing(_heard(symbol), margin, clarity, ok, beats)


def test_the_vocabulary_is_triads_then_sevenths_sus_and_power_chords() -> None:
    names = {h.suffix for h in vocabulary()}
    assert names == {"", "m", "7", "maj7", "m7", "sus2", "sus4", "5"}
    assert len(vocabulary()) == 12 * 8
    assert all(h.rank == 0 for h in vocabulary() if h.suffix in ("", "m"))


@pytest.mark.parametrize(
    ("heard", "chart", "ok"),
    [
        ("Cmaj7", "C", True),  # holds the chart's chord
        ("C5", "C", True),  # inside it
        ("C", "Am7", True),
        ("Em", "Cmaj7", True),
        ("Absus4", "Db", True),  # Ab Db Eb: a Db with an added 9th
        ("Bbsus4", "Bbm", True),
        ("Cm", "C", False),
        ("E", "A", False),
        ("Am", "C", False),
        ("Dsus4", "C", False),
    ],
)
def test_agreement(heard: str, chart: str, ok: bool) -> None:
    assert agrees(_heard(heard), parse_symbol(chart)) is ok


def test_the_simpler_chord_is_heard_unless_the_richer_wins_clearly() -> None:
    triad = template(parse_symbol("C"))
    assert hear(triad, None)[0].chord.symbol == "C"
    seventh = template(parse_symbol("Cmaj7"))
    assert hear(seventh, None)[0].chord.symbol == "Cmaj7"
    # A faint major seventh over a C triad is still C.
    faint = triad + 0.15 * np.eye(12)[11]
    assert hear(faint / np.linalg.norm(faint), None)[0].chord.symbol == "C"


def test_two_playings_that_agree_on_another_chord_are_a_suggestion() -> None:
    found = decide([_playing("Am"), _playing("Am")], times=2, beats_per_bar=4)
    assert found is not None and found[0].chord.symbol == "Am"


def test_one_playing_of_several_is_not_enough() -> None:
    playings = [_playing("Am"), _playing("C", ok=True, margin=0), _playing("C", ok=True, margin=0)]
    assert decide(playings, times=3, beats_per_bar=4) is None
    # Two of five against three that agree: still the chart's chord.
    playings = [_playing("Am"), _playing("Am")] + [_playing("C", ok=True, margin=0)] * 3
    assert decide(playings, times=5, beats_per_bar=4) is None


def test_a_section_played_once_needs_a_clear_full_bar() -> None:
    assert decide([_playing("Am", clarity=HIGH_CLEAR)], times=1, beats_per_bar=4) is not None
    assert decide([_playing("Am", clarity=HIGH_CLEAR - 0.05)], times=1, beats_per_bar=4) is None
    assert decide([_playing("Am", beats=2)], times=1, beats_per_bar=4) is None
    # Played twice, heard once: not the only playing.
    assert decide([_playing("Am")], times=2, beats_per_bar=4) is None


def test_small_margins_and_unclear_playings_do_not_count() -> None:
    assert decide([_playing("Am", margin=MARGIN - 0.01)] * 2, times=2, beats_per_bar=4) is None
    assert decide([_playing("Am", clarity=CLEAR - 0.01)] * 2, times=2, beats_per_bar=4) is None


def test_related_chords_heard_in_different_playings_pool() -> None:
    # Am7 once and C once: C sits inside Am7, so both say the chart's Dm is wrong.
    found = decide([_playing("Am7", margin=0.5), _playing("C", margin=0.4)], times=2, beats_per_bar=4)
    assert found is not None
    assert len(found[1]) == 2


def _with_wrong_chord(name: str, bar: int, wrong: str) -> RenderSpec:
    """A render whose chart has one chord wrong: the first chord of ``bar`` (0-based) of the first section."""
    spec = by_name(name)
    first = spec.sections[0]
    guess = list(first.guess)
    right = guess[bar].split()[0]
    guess[bar] = guess[bar].replace(right, wrong, 1)
    sections = (dataclasses.replace(first, guess=tuple(guess)), *spec.sections[1:])
    return dataclasses.replace(spec, sections=sections)


@cache
def _wrong_run(apply: bool) -> tuple[RenderSpec, Result]:
    spec = _with_wrong_chord("even-70", 2, "Dm")  # the render plays Am there
    audio = render(spec)
    return spec, run(read_chart(chart_file(spec)), audio.y, audio.sr, apply_suggestions=apply)


@pytest.mark.slow
def test_a_wrong_chord_is_suggested_and_not_applied_without_the_flag() -> None:
    _, result = _wrong_run(False)
    assert [(s.section, s.bar, s.chart, s.suggested) for s in result.suggestions] == [
        ("Verse", 3, "Dm", "Am")
    ]
    s = result.suggestions[0]
    assert (s.playings, s.heard_in) == (2, 2)
    assert s.margin >= MARGIN
    assert not s.applied
    out = result.output()["items"][0]["chart"]
    verse = next(x for x in out["sections"] if x["id"] == "verse")
    assert any("Dm" in bar for bar in verse["bars"])
    assert not any("Am" in bar for bar in verse["bars"])
    report = build_report(result)
    assert "## Suggested chord changes" in report
    assert "| Verse | 2× | 3 | Dm | Am | heard in 2 of 2 playings" in report
    assert "Not applied" in report
    data: dict[str, Any] = suggestions_file(result)
    assert data["applied"] is False
    assert data["suggestions"][0]["suggested"] == "Am"
    json.dumps(data)


@pytest.mark.slow
def test_with_the_flag_the_chord_is_written_and_aligned_again(tmp_path: Any) -> None:
    spec, result = _wrong_run(True)
    assert [s.applied for s in result.suggestions] == [True]
    out = result.output()
    verse = next(x for x in out["items"][0]["chart"]["sections"] if x["id"] == "verse")
    # Aligned again with Am, so its lengths are the true ones too.
    assert verse["bars"] == list(spec.sections[0].truth)
    report = build_report(result)
    assert "Applied (--apply-suggestions)" in report
    path = tmp_path / "applied.json"
    path.write_text(json.dumps(out), encoding="utf-8")
    checked = check_output(path)
    assert checked.returncode == 0, checked.stderr


def test_corrected_writes_the_chord_in_place_lengths_kept() -> None:
    spec = by_name("uneven-96")
    chart = read_chart(chart_file(spec))
    verse = chart.section("verse")
    merged = [c.symbol for c in verse.merged()]
    assert merged[:3] == ["G", "D", "Em"]
    s = Suggestion("verse", "Verse", 2, 2, "Em", "Em7", 2, 2, 0.2, 0.9)
    data = corrected(chart, [s])
    bars = next(x for x in data["items"][0]["chart"]["sections"] if x["id"] == "verse")["bars"]
    assert bars == ["G D", "Em7 C", "G D", "Cadd9"]
    # The original is untouched.
    assert chart.data["items"][0]["chart"]["sections"][0]["bars"][1] == "Em C"


@pytest.mark.slow
@pytest.mark.parametrize("name", [r.name for r in ALL_RENDERS if not r.mismatched])
def test_a_right_chart_gets_no_suggestions(name: str) -> None:
    _, result = scored(name)
    assert result.suggestions == []
    assert "None: wherever the chords can be heard clearly" in build_report(result)


@pytest.mark.slow
@pytest.mark.parametrize("name", [r.name for r in ALL_RENDERS if r.mismatched])
def test_a_wrong_chart_gets_suggestions(name: str) -> None:
    _, result = scored(name)
    assert result.suggestions
