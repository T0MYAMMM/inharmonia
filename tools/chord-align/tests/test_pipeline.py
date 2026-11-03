"""Synthesised renders, aligned end to end. Each render is aligned once per session."""

from __future__ import annotations

import pytest

from chord_align.chart import Section
from chord_align.evaluate import BEAT_ACCURACY, TEMPO_TOLERANCE
from chord_align.pipeline import MIN_CONFIDENCE, skip_reason
from chord_align.renders import RENDERS
from chord_align.report import build_report

from .conftest import scored

CLEAN = [r.name for r in RENDERS if not r.mismatched]

pytestmark = pytest.mark.slow


@pytest.mark.parametrize("name", CLEAN)
def test_clean_render_meets_the_bar(name: str) -> None:
    score, _ = scored(name)
    assert score.beat_accuracy >= BEAT_ACCURACY
    assert score.bars_exact
    assert score.tempo_error <= TEMPO_TOLERANCE
    assert score.shift_ok


def test_renders_cover_the_brief() -> None:
    tempos = [r.tempo for r in RENDERS]
    assert min(tempos) == 70
    assert max(tempos) == 140
    assert {r.meter for r in RENDERS} == {3, 4}
    assert any(r.transpose for r in RENDERS)
    assert any(r.intro_seconds for r in RENDERS)
    truths = [bar for r in RENDERS for s in r.sections for bar in s.truth]
    assert "C . . Em" in truths  # 3+1
    assert "G D" in truths  # 2+2
    assert any(s.truth[:2] == ("D", "D Bm") for r in RENDERS for s in r.sections)  # 6 beats across a barline


def test_capo_is_found_and_the_key_is_kept() -> None:
    _, result = scored("capo-84")
    assert result.shift == 2
    assert result.key is None
    assert result.transpose is None
    out = result.output()["items"][0]
    assert out["chart"]["key"] == {"tonic": "C", "mode": "major"}
    assert out["chart"]["notes"] == "Keep the second chorus soft."


def test_set_key_on_a_capo_recording_transposes_the_view() -> None:
    _, result = scored("intro-90")
    result.transpose, result.key = -3, None  # what --set-key does for a shift of 9
    out = result.output()["items"][0]
    assert out["view"]["transpose"] == -3
    assert out["chart"]["key"] == {"tonic": "A", "mode": "minor"}
    report = build_report(result)
    assert "-3 semitones" in report
    assert "F# minor" in report


def test_mismatched_chart_is_reported_and_left_alone() -> None:
    score, result = scored("mismatch-100")
    assert score.confidence < MIN_CONFIDENCE
    assert all(s.bars is None and s.skipped for s in result.sections)
    report = build_report(result)
    assert "**Low confidence**" in report
    assert "low confidence" in report.split("## Skipped")[1]
    out = result.output()["items"][0]["chart"]
    assert out["sections"][0]["bars"][0] == "Bdim"


def test_report_covers_what_the_brief_asks(name: str = "waltz-120") -> None:
    _, result = scored(name)
    report = build_report(result)
    for heading in ["## Summary", "## Sections", "## Occurrences that disagree", "## Skipped"]:
        assert heading in report
    assert "Tempo: 120 bpm" in report
    assert "Transposition: +0 semitones" in report
    assert "Sounding key (estimated): F major" in report
    assert "| Bait | 4× |" in report


def test_beats_are_labelled_in_order() -> None:
    _, result = scored("nc-110")
    labels = [x for x in result.labels() if x is not None]
    assert labels[0] == "Eb"
    assert "N.C." in labels


def test_skip_reasons() -> None:
    section = Section("v", "Verse", 1, [[]] * 4, has_lyrics=True)
    assert skip_reason(section, ["C"] * 4, 0.9, 0.5) is None
    assert "low confidence" in (skip_reason(section, ["C"] * 4, 0.3, 0.5) or "")
    assert "lyrics" in (skip_reason(section, ["C"] * 5, 0.9, 0.5) or "")
    assert "over 32" in (skip_reason(section, ["C"] * 33, 0.9, 0.5) or "")
    plain = Section("v", "Verse", 1, [[]] * 4)
    assert skip_reason(plain, ["C"] * 5, 0.9, 0.5) is None
