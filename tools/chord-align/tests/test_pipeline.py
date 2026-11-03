"""Synthesised renders, aligned end to end. Each render is aligned once per session."""

from __future__ import annotations

import numpy as np
import pytest

from chord_align.chart import Section
from chord_align.evaluate import BEAT_ACCURACY, TEMPO_TOLERANCE
from chord_align.pipeline import MIN_CONFIDENCE, rhythm_cost, skip_reason, tempo_cost
from chord_align.renders import ALL_RENDERS, BAND_RENDERS, RENDERS
from chord_align.report import agreement, bar_rows, build_report

from .conftest import scored

MATCHING = [r.name for r in ALL_RENDERS if not r.mismatched]
WRONG = [r.name for r in ALL_RENDERS if r.mismatched]


@pytest.mark.slow
@pytest.mark.parametrize("name", MATCHING)
def test_render_meets_the_bar(name: str) -> None:
    score, _ = scored(name)
    assert score.beat_accuracy >= BEAT_ACCURACY
    assert score.tempo_error <= TEMPO_TOLERANCE
    assert score.shift_ok
    assert score.form_ok
    if score.exact_required:
        assert score.bars_exact
    assert score.passed


@pytest.mark.slow
@pytest.mark.parametrize("name", WRONG)
def test_wrong_chart_is_reported_and_left_alone(name: str) -> None:
    score, result = scored(name)
    assert score.confidence < MIN_CONFIDENCE
    assert all(s.bars is None and s.skipped for s in result.sections)
    report = build_report(result)
    assert "**Low confidence**" in report
    out = result.output()["items"][0]["chart"]
    assert out["sections"][0]["bars"] == list(
        next(r for r in ALL_RENDERS if r.name == name).sections[0].guess
    )


def test_renders_cover_the_brief() -> None:
    tempos = [r.tempo for r in RENDERS]
    assert min(tempos) == 70 and max(tempos) == 140
    assert {r.meter for r in RENDERS} == {3, 4}
    assert {r.meter for r in BAND_RENDERS} == {3, 4}
    assert any(r.transpose for r in RENDERS) and any(r.transpose for r in BAND_RENDERS)
    assert any(r.intro_seconds for r in RENDERS) and any(r.intro_seconds for r in BAND_RENDERS)
    truths = [bar for r in RENDERS for s in r.sections for bar in s.truth]
    assert "C . . Em" in truths  # 3+1
    assert "G D" in truths  # 2+2
    assert any(s.truth[:2] == ("D", "D Bm") for r in RENDERS for s in r.sections)  # 6 beats across a barline
    band = [r for r in BAND_RENDERS if not r.mismatched]
    assert all(r.band and r.drift == 0.03 and r.rubato and r.reverb > 0 for r in BAND_RENDERS)
    assert {r.form_change[0] for r in band if r.form_change} == {"twice", "left out"}
    assert any(r.exact and all(len(g.split()) == 2 for s in r.sections for g in s.guess[:1]) for r in band)


@pytest.mark.slow
def test_lengths_written_at_half_the_truth_are_doubled_not_the_tempo_halved() -> None:
    # The chart writes "Ab Db" (2+2); the recording plays each chord a bar at 84 bpm.
    score, result = scored("band-x2-84")
    assert result.tempo == 84
    assert result.grid == "tracked"
    verse = next(s for s in result.sections if s.section_id == "verse")
    assert verse.bars == ["Ab", "Db", "Ab", "Eb"]
    assert score.bars_exact
    # Even when the chart's tempo is halved as well (42), the song's 84 is found.
    score, result = scored("band-x2-tempo42")
    assert result.tempo == 84
    assert score.bars_exact


@pytest.mark.slow
def test_form_changes_are_found_and_reported() -> None:
    _, extra = scored("band-extra-100")
    assert [x.split(" (")[0] for x in extra.played_twice] == ["Chorus"]
    assert "seems to play Chorus (time 2) twice in a row" in build_report(extra)
    _, missing = scored("band-missing-92")
    assert [x.split(" (")[0] for x in missing.left_out] == ["Bridge"]
    bridge = next(s for s in missing.sections if s.section_id == "bridge")
    assert bridge.bars is None and bridge.skipped == "not found in the recording"
    assert "seems to leave out Bridge (time 1)" in build_report(missing)


@pytest.mark.slow
def test_capo_is_found_and_the_key_is_kept() -> None:
    _, result = scored("capo-84")
    assert result.shift == 2
    assert result.key is None and result.transpose is None
    out = result.output()["items"][0]
    assert out["chart"]["key"] == {"tonic": "C", "mode": "major"}
    assert out["chart"]["notes"] == "Keep the second chorus soft."


@pytest.mark.slow
def test_set_key_on_a_capo_recording_transposes_the_view() -> None:
    _, result = scored("intro-90")
    result.transpose, result.key = -3, None  # what --set-key does for a shift of 9
    out = result.output()["items"][0]
    assert out["view"]["transpose"] == -3
    assert out["chart"]["key"] == {"tonic": "A", "mode": "minor"}
    report = build_report(result)
    assert "-3 semitones" in report
    assert "F# minor" in report


@pytest.mark.slow
def test_report_covers_what_the_brief_asks() -> None:
    _, result = scored("waltz-120")
    report = build_report(result)
    for heading in [
        "## Summary",
        "## Form",
        "## Sections",
        "## Playings that disagree",
        "## Skipped",
        "## What the recording seems to play",
    ]:
        assert heading in report
    assert "Tempo: 120 bpm" in report
    assert "Transposition: +0 semitones" in report
    assert "Sounding key (estimated): F major" in report
    assert "| Bait | 4× |" in report
    assert "half-odd" not in report and "tracked tempo" not in report


@pytest.mark.slow
def test_what_the_recording_plays_tells_a_wrong_chart_from_a_right_one() -> None:
    _, right = scored("band-84")
    agree, judged, _ = agreement(bar_rows(right))
    assert agree / judged > 0.8
    _, wrong = scored("band-mismatch-90")
    agree, judged, uncovered = agreement(bar_rows(wrong))
    assert agree / judged < 0.6
    assert uncovered > 0
    assert "have no chart chord at all" in build_report(wrong)


@pytest.mark.slow
def test_beats_are_labelled_in_order() -> None:
    _, result = scored("nc-110")
    labels = [x for x in result.labels() if x is not None]
    assert labels[0] == "Eb"
    assert "N.C." in labels


def test_musical_priors_know_nothing_of_the_chart() -> None:
    assert tempo_cost(60) == tempo_cost(100) == tempo_cost(160) == 0
    assert tempo_cost(42) > 0 and tempo_cost(168) > 0
    assert tempo_cost(42) > tempo_cost(168)
    assert rhythm_cost(np.array([2, 4, 8])) == 0
    assert rhythm_cost(np.array([1, 1, 2])) > 0
    assert rhythm_cost(np.array([16, 16])) > 0


def test_skip_reasons() -> None:
    section = Section("v", "Verse", 1, [[]] * 4, has_lyrics=True)
    assert skip_reason(section, ["C"] * 4, 0.9, 0.6) is None
    assert "low confidence" in (skip_reason(section, ["C"] * 4, 0.3, 0.6) or "")
    assert "lyrics" in (skip_reason(section, ["C"] * 5, 0.9, 0.6) or "")
    assert "over 32" in (skip_reason(section, ["C"] * 33, 0.9, 0.6) or "")
    plain = Section("v", "Verse", 1, [[]] * 4)
    assert skip_reason(plain, ["C"] * 5, 0.9, 0.6) is None
