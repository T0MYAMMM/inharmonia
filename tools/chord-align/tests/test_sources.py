from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from chord_align.chart import ChartError, read_chart
from chord_align.sources import (
    BRIDGE,
    bridge_command,
    collect,
    convert,
    kind_of,
    load_one,
    load_sources,
    split_title,
    without_lyrics,
)

from .conftest import FIXTURES, check_output, require_node

# Made up for the tests: words that must never reach an output.
LYRICS = ("walking", "morning", "lantern", "river")
SHEET = """[Verse]
C        G           Am        F
Walking under morning light, a lantern by the river
C           G          F
Morning comes and walking goes

[Chorus]
[F]Lantern [G]light, [C]river
| Am | F G | C |
"""


def _research(tmp_path: Path, **fields: Any) -> Path:
    song = {
        "title": "Lagu Contoh",
        "artist": "Band Contoh",
        "originalKey": "D# minor",
        "meter": "3/4",
        "bpm": 72,
        "chart": "[Intro]\n| Ebm | B |\n\n[Reff]\n| Ebm B | Gbm Db | x2\n",
        **fields,
    }
    path = tmp_path / "lagu-contoh.json"
    path.write_text(json.dumps(song), encoding="utf-8")
    return path


def test_kinds(tmp_path: Path, chart_data: dict[str, Any]) -> None:
    assert kind_of(FIXTURES / "chart.json") == "inharmonia"
    assert kind_of(_research(tmp_path)) == "research"
    sheet = tmp_path / "s.txt"
    sheet.write_text(SHEET, encoding="utf-8")
    assert kind_of(sheet) == "sheet"
    other = tmp_path / "x.json"
    other.write_text('{"songs": []}', encoding="utf-8")
    with pytest.raises(ChartError, match="neither"):
        kind_of(other)
    with pytest.raises(ChartError, match=r"a \.txt sheet"):
        kind_of(tmp_path / "song.pdf")


def test_bridge_runs_the_app_reader_with_an_argument_list() -> None:
    try:
        cmd = bridge_command(Path("out.json"), [Path("a; rm -rf ~.txt")])
    except ChartError:
        pytest.skip("no npx here")
    assert cmd[1:4] == ["tsx", "--tsconfig", "tsconfig.app.json"]
    assert cmd[4] == str(BRIDGE)
    assert cmd[-1] == "a; rm -rf ~.txt"


def test_a_pasted_sheet_becomes_a_valid_file_with_no_lyrics(tmp_path: Path) -> None:
    require_node()
    sheet = tmp_path / "Sore di Taman.txt"
    sheet.write_text(SHEET, encoding="utf-8")
    charts, skipped = convert([sheet])
    assert skipped == []
    assert len(charts) == 1
    source = charts[0]
    assert source.title == "Sore di Taman"
    assert source.artist is None
    out = tmp_path / "out.json"
    out.write_text(json.dumps(source.data), encoding="utf-8")
    text = out.read_text(encoding="utf-8").lower()
    assert not any(word in text for word in LYRICS)
    checked = check_output(out)
    assert checked.returncode == 0, checked.stderr
    chart = read_chart(source.data, source.item_id)
    assert [s.label for s in chart.sections] == ["Verse", "Chorus"]
    assert chart.key_tonic == "C" and chart.key_mode == "major"
    # The lyric timing: C over "Walking under" is shorter than a bar of its own.
    verse = chart.sections[0]
    assert [c.symbol for c in verse.merged()][:4] == ["C", "G", "Am", "F"]
    assert sum(c.beats for c in verse.merged()) % 4 == 0
    assert not verse.has_lyrics


def test_a_research_json_becomes_a_valid_file_spelt_the_apps_way(tmp_path: Path) -> None:
    require_node()
    path = _research(tmp_path)
    charts, skipped = convert([path])
    assert skipped == []
    source = charts[0]
    assert (source.title, source.artist) == ("Lagu Contoh", "Band Contoh")
    assert source.item_id == "research-lagu-contoh-band-contoh"
    chart = read_chart(source.data, source.item_id)
    assert (chart.key_tonic, chart.key_mode) == ("Eb", "minor")
    assert chart.meter == 3
    assert chart.tempo == 72
    item = source.data["items"][0]
    assert item["title"] == "Lagu Contoh (Band Contoh)"
    reff = item["chart"]["sections"][1]
    assert reff["bars"] == ["Ebm B", "Gbm Db", "Ebm B", "Gbm Db"]
    out = tmp_path / "out.json"
    out.write_text(json.dumps(source.data), encoding="utf-8")
    checked = check_output(out)
    assert checked.returncode == 0, checked.stderr


def test_load_one_reads_a_sheet_before_any_audio(tmp_path: Path) -> None:
    require_node()
    data, item = load_one(_research(tmp_path, bpm=None, meter="4/4", originalKey="unknown"))
    chart = read_chart(data, item)
    assert chart.meter == 4
    assert chart.tempo == 80  # the app's default for a new chart
    assert chart.key_tonic == "Eb" and chart.key_mode == "minor"  # guessed from the chords


def test_load_sources_mixes_kinds_and_says_what_it_skipped(tmp_path: Path) -> None:
    require_node()
    folder = tmp_path / "charts"
    (folder / "nested").mkdir(parents=True)
    _research(folder / "nested")
    export = (FIXTURES / "chart.json").read_text(encoding="utf-8")
    (folder / "export.json").write_text(export, encoding="utf-8")
    (folder / "index.json").write_text("[]", encoding="utf-8")
    (folder / "broken.json").write_text("{", encoding="utf-8")
    (folder / "empty.txt").write_text("just words, no chords at all here\n", encoding="utf-8")
    (folder / "song.aligned.json").write_text("{}", encoding="utf-8")
    files = collect(folder)
    assert sorted(p.name for p in files) == ["broken.json", "empty.txt", "export.json", "lagu-contoh.json"]
    charts, skipped = load_sources(files)
    assert sorted(c.title for c in charts) == ["First chart", "Lagu Contoh", "Waltz"]
    assert sorted(p.name for p, _ in skipped) == ["broken.json", "empty.txt"]
    assert dict((p.name, why) for p, why in skipped)["empty.txt"] == "no chords found"


def test_split_title() -> None:
    assert split_title("Laskar Pelangi (Nidji)") == ("Laskar Pelangi", "Nidji")
    assert split_title("Sore di Taman") == ("Sore di Taman", None)
    assert split_title("(Intro)") == ("(Intro)", None)


def test_without_lyrics_leaves_the_file_as_it_was(chart_data: dict[str, Any]) -> None:
    chart_data["items"][0]["chart"]["sections"][0]["lyrics"] = ["la"] * len(
        chart_data["items"][0]["chart"]["sections"][0]["bars"]
    )
    clean = without_lyrics(chart_data)
    assert "lyrics" in chart_data["items"][0]["chart"]["sections"][0]
    assert all("lyrics" not in s for s in clean["items"][0]["chart"]["sections"])
