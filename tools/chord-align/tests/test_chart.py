from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from chord_align.chart import (
    ChartError,
    Chord,
    bars_from_lengths,
    even_beats,
    expand_form,
    format_bar,
    load_file,
    parse_bar,
    read_chart,
    write_chart,
    written_bars,
)


def test_reads_the_first_chart(chart_data: dict[str, Any]) -> None:
    chart = read_chart(chart_data)
    assert chart.item_id == "first-chart"
    assert chart.meter == 4
    assert chart.tempo == 84
    assert [s.id for s in chart.sections] == ["intro", "verse", "chorus"]
    assert chart.section("verse").has_lyrics


def test_reads_a_chart_by_id(chart_data: dict[str, Any]) -> None:
    chart = read_chart(chart_data, "waltz")
    assert chart.item_index == 1
    assert chart.meter == 3
    assert chart.key_tonic == "F#"


def test_missing_item_id(chart_data: dict[str, Any]) -> None:
    with pytest.raises(ChartError, match='has no chart with id "nope"'):
        read_chart(chart_data, "nope")


def test_bar_syntax() -> None:
    assert parse_bar("Am F", 4, "") == [Chord("Am", 2), Chord("F", 2)]
    assert parse_bar("C . . G", 4, "") == [Chord("C", 3), Chord("G", 1)]
    assert parse_bar("N.C.", 4, "") == [Chord("N.C.", 4)]
    assert parse_bar("Bb C .", 3, "") == [Chord("Bb", 1), Chord("C", 2)]
    assert parse_bar("A B C D", 3, "") == [Chord(s, b) for s, b in zip("ABCD", [1, 1, 0.5, 0.5], strict=True)]


def test_dots_glued_to_a_chord() -> None:
    assert parse_bar("C.. G", 4, "") == [Chord("C", 3), Chord("G", 1)]


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("", "empty"),
        (". C", "dots add beats"),
        ("C D E F G", "up to 4"),
        ("C . G", "lasts 3 beats"),
        ("Hx", "not a chord"),
    ],
)
def test_bad_bars(text: str, message: str) -> None:
    with pytest.raises(ChartError, match=message):
        parse_bar(text, 4, "bar")


def test_format_round_trip() -> None:
    for text, meter in [("C", 4), ("Am F", 4), ("C . . G", 4), ("C G", 3), ("Bb C .", 3), ("A B C D", 4)]:
        assert format_bar(parse_bar(text, meter, ""), meter) == text


def test_even_beats_matches_the_app() -> None:
    assert even_beats(3, 4) == [2, 1, 1]
    assert even_beats(4, 3) == [1, 1, 0.5, 0.5]


def test_expand_form_merges_repeated_chords_and_counts_occurrences(chart_data: dict[str, Any]) -> None:
    chart = read_chart(chart_data)
    events = expand_form(chart)
    verse = [e for e in events if e.section_id == "verse"]
    # Am F | C . . G | Am | Am  → Am F C G Am(8), played 2 × 2 times.
    assert [e.symbol for e in verse[:5]] == ["Am", "F", "C", "G", "Am"]
    assert verse[4].chart_beats == 8
    assert sorted({e.occurrence for e in verse}) == [0, 1, 2, 3]
    assert len(events) == 4 + 4 * 5 + 2 * 5


def test_bars_from_lengths_splits_across_barlines() -> None:
    bars = bars_from_lengths(["Am", "F", "G", "C"], [2, 6, 4, 4], 4)
    assert written_bars(bars, 4) == ["Am F", "F", "G", "C"]
    bars = bars_from_lengths(["C", "G"], [3, 5], 4)
    assert written_bars(bars, 4) == ["C . . G", "G"]
    bars = bars_from_lengths(["F", "Bb", "C"], [4, 1, 1], 3)
    assert written_bars(bars, 3) == ["F", "F Bb C"]
    for bar in bars_from_lengths(["A", "B", "C"], [5, 2, 5], 4):
        assert sum(c.beats for c in bar) == 4


def test_bars_from_lengths_needs_whole_bars() -> None:
    with pytest.raises(ValueError):
        bars_from_lengths(["C"], [3], 4)
    with pytest.raises(ValueError):
        bars_from_lengths(["C", "G"], [4, 0], 4)


def test_write_changes_only_bars_tempo_and_asked_key(chart_data: dict[str, Any]) -> None:
    before = copy.deepcopy(chart_data)
    chart = read_chart(chart_data)
    out = write_chart(chart, section_bars={"chorus": ["F", "G . . C", "N.C."]}, tempo=91)
    raw = out["items"][0]["chart"]
    assert raw["tempo"] == 91
    assert raw["sections"][2]["bars"] == ["F", "G . . C", "N.C."]
    assert raw["sections"][1] == before["items"][0]["chart"]["sections"][1]
    assert raw["notes"] == "Slow down in the last chorus."
    assert raw["key"] == {"tonic": "C", "mode": "major"}
    assert out["items"][1] == before["items"][1]
    assert chart_data == before  # the input is not touched

    keyed = write_chart(chart, section_bars={}, tempo=84, key=("A", "minor"))
    assert keyed["items"][0]["chart"]["key"] == {"tonic": "A", "mode": "minor"}
    moved = write_chart(chart, section_bars={}, tempo=84, transpose=-3)
    assert moved["items"][0]["view"]["transpose"] == -3
    assert moved["items"][0]["view"]["style"] == "triad-root"


def _broken(chart_data: dict[str, Any], path: list[Any], value: Any) -> dict[str, Any]:
    data = copy.deepcopy(chart_data)
    target = data
    for p in path[:-1]:
        target = target[p]
    target[path[-1]] = value
    return data


CHART = ["items", 0, "chart"]


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        (["items", 0, "id"], "has spaces", "short id"),
        (["items", 0, "title"], "", "name up to 80"),
        ([*CHART, "tempo"], 300, "30 to 240"),
        ([*CHART, "meter"], {"beats": 6, "unit": 8}, "3/4 or 4/4"),
        ([*CHART, "key"], {"tonic": "H", "mode": "major"}, "not a major key"),
        ([*CHART, "key"], {"tonic": "Db", "mode": "minor"}, "not a minor key"),
        ([*CHART, "sections"], [], "1 to 24"),
        ([*CHART, "sections", 0, "repeat"], 9, "1 to 8"),
        ([*CHART, "sections", 0, "bars"], ["C | G"], "one bar"),
        ([*CHART, "sections", 0, "bars"], ["C"] * 33, "1 to 32"),
        ([*CHART, "sections", 1, "lyrics"], ["just one"], "per bar"),
        ([*CHART, "sections", 1, "id"], "intro", "share an id"),
        ([*CHART, "notes"], "x" * 501, "500"),
        ([*CHART, "form"], "intro", "section ids"),
        ([*CHART, "form"], ["nothing"], "plays no sections"),
        ([*CHART], None, "missing"),
    ],
)
def test_bad_charts_are_refused(
    chart_data: dict[str, Any], path: list[Any], value: Any, message: str
) -> None:
    with pytest.raises(ChartError, match=message):
        read_chart(_broken(chart_data, path, value))


def test_form_ids_that_name_nothing_are_skipped(chart_data: dict[str, Any]) -> None:
    chart = read_chart(_broken(chart_data, [*CHART, "form"], ["intro", "gone"]))
    assert chart.missing_form_ids == ["gone"]
    assert {e.section_id for e in expand_form(chart)} == {"intro"}


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("not json", "not JSON"),
        ('{"format": "other"}', "not an Inharmonia export"),
        ('{"format": "inharmonia", "version": 4, "items": []}', "2 to 3"),
        ('{"format": "inharmonia", "version": 3, "items": []}', "no items"),
    ],
)
def test_bad_files(tmp_path: Path, content: str, message: str) -> None:
    path = tmp_path / "f.json"
    path.write_text(content, encoding="utf-8")
    with pytest.raises(ChartError, match=message):
        load_file(path)


def test_file_without_a_chart(tmp_path: Path) -> None:
    path = tmp_path / "f.json"
    path.write_text(json.dumps({"format": "inharmonia", "version": 3, "items": [{"kind": "song"}]}))
    with pytest.raises(ChartError, match="has no chart"):
        read_chart(load_file(path))


def test_replace_symbols_counts_positions_as_merged_does() -> None:
    from chord_align.chart import replace_symbols

    bars = [parse_bar("C", 4, "a"), parse_bar("C G", 4, "b"), parse_bar("G Am", 4, "c")]
    # Positions: C (bars 1–2), G (bars 2–3), Am.
    out = replace_symbols(bars, {1: "G7", 2: "F"})
    assert written_bars(out, 4) == ["C", "C G7", "G7 F"]
