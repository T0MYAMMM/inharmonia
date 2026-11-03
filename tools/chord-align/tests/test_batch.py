from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import soundfile as sf

from chord_align.audio import AUDIO_SUFFIXES
from chord_align.batch import (
    COMBINED,
    SUMMARY,
    ManifestError,
    audio_in,
    combined,
    match_all,
    match_name,
    rank,
    read_manifest,
    slug,
    songs,
    words,
)
from chord_align.cli import main
from chord_align.renders import by_name
from chord_align.sources import ChartSource
from chord_align.synth import chart_file, render

from .conftest import check_output, require_node


def _chart(title: str, artist: str | None = None, item_id: str | None = None) -> ChartSource:
    return ChartSource(Path(f"/charts/{slug(title)}.json"), item_id or slug(title), title, artist, {})


LASKAR = _chart("Laskar Pelangi", "Nidji")
KISAH = _chart("Kisah Romantis", "Glenn Fredly")
CHARTS = [LASKAR, KISAH, _chart("Januari", "Glenn Fredly"), _chart("Sang Mantan", "Nidji")]


def test_words_and_slugs() -> None:
    assert words("NIDJI - Laskar Pelangi (Official Music Video)") == [
        "nidji",
        "laskar",
        "pelangi",
        "official",
        "music",
        "video",
    ]
    assert words("e_au_Ari_Lesmana_-_Sesi_Potret") == ["e", "au", "ari", "lesmana", "sesi", "potret"]
    assert words("Café Ünïcode") == ["cafe", "unicode"]
    assert slug("Laskar Pelangi (Nidji)") == "laskar-pelangi-nidji"


@pytest.mark.parametrize(
    ("name", "chart"),
    [
        ("NIDJI - Laskar Pelangi (Official Music Video).mp4", LASKAR),
        ("Laskar Pelangi - Nada Asli Nidji (Capo 1).m4a", LASKAR),
        ("LASKAR PELANGI - NIDJI Ft. INDOMUSIKTEAM #PETIK.mp4", LASKAR),
        ("Kisah Romantis - Naik 1-2 (Capo 1).m4a", KISAH),
        ("Glenn Fredly - Kisah Romantis (2005) _ Cover Akustik.mp4", KISAH),
        ("kisah romantis (Lyrics).mp3", KISAH),
    ],
)
def test_file_names_find_their_chart(name: str, chart: ChartSource) -> None:
    m = match_name(Path(name), CHARTS)
    assert m.chart is chart
    assert m.how == "name"


def test_a_name_with_no_chart_title_is_not_guessed() -> None:
    m = match_name(Path("semangka.mp3"), CHARTS)
    assert m.chart is None
    assert "no chart's title" in m.how
    # "Laskar" alone is not the title.
    assert match_name(Path("Laskar.mp3"), CHARTS).chart is None


def test_two_charts_with_one_title_need_the_artist() -> None:
    twin = _chart("Laskar Pelangi", "Band Lain", "laskar-2")
    m = match_name(Path("Laskar Pelangi (Live).mp3"), [LASKAR, twin])
    assert m.chart is None
    assert "Laskar Pelangi (Band Lain) or Laskar Pelangi (Nidji)" in m.how
    assert match_name(Path("Band Lain - Laskar Pelangi.mp3"), [LASKAR, twin]).chart is twin


def test_the_longest_title_wins_and_a_short_one_needs_the_artist() -> None:
    cinta = _chart("Cinta")
    sejati = _chart("Cinta Sejati")
    assert match_name(Path("Cinta Sejati (MV).mp3"), [cinta, sejati]).chart is sejati
    aku = _chart("Aku", "Chrisye")
    assert match_name(Path("Aku dan Kamu.mp3"), [aku]).chart is None
    assert match_name(Path("Chrisye - Aku.mp3"), [aku]).chart is aku


def test_official_and_mv_rank_above_covers() -> None:
    mv = rank("NIDJI - Laskar Pelangi (Official Music Video)", "Nidji")
    asli = rank("Laskar Pelangi - Nada Asli Nidji (Capo 1)", "Nidji")
    petik = rank("LASKAR PELANGI - NIDJI Ft. INDOMUSIKTEAM #PETIK", "Nidji")
    cover = rank("Glenn Fredly - Kisah Romantis (2005) _ Cover Akustik", "Glenn Fredly")
    assert mv > petik > asli
    assert mv > cover
    assert rank("Song (Official Audio)") > rank("Song")


def test_several_recordings_of_one_song_prefer_the_official_one() -> None:
    files = [
        Path("Laskar Pelangi - Nada Asli Nidji (Capo 1).m4a"),
        Path("NIDJI - Laskar Pelangi (Official Music Video).mp4"),
        Path("LASKAR PELANGI - NIDJI Ft. INDOMUSIKTEAM #PETIK.mp4"),
        Path("Kisah Romantis - Naik 1-2 (Capo 1).m4a"),
    ]
    found = songs([match_name(f, CHARTS) for f in files])
    assert [s.chart.title for s in found] == ["Kisah Romantis", "Laskar Pelangi"]
    laskar = found[1]
    assert laskar.used.audio.name == "NIDJI - Laskar Pelangi (Official Music Video).mp4"
    assert [m.audio.name for m in laskar.recordings[1:]] == [
        "LASKAR PELANGI - NIDJI Ft. INDOMUSIKTEAM #PETIK.mp4",
        "Laskar Pelangi - Nada Asli Nidji (Capo 1).m4a",
    ]


def test_the_manifest_overrides_matching(tmp_path: Path) -> None:
    audio = tmp_path / "audio"
    audio.mkdir()
    for name in ("take-3.wav", "NIDJI - Laskar Pelangi (Official Music Video).wav", "x.wav"):
        (audio / name).write_bytes(b"")
    elsewhere = tmp_path / "elsewhere.wav"
    elsewhere.write_bytes(b"")
    manifest = tmp_path / "pairs.csv"
    manifest.write_text(
        "audio,chart\n"
        "take-3.wav,laskar-pelangi\n"  # by id
        f"{elsewhere},Kisah Romantis (Glenn Fredly)\n"  # by title, from outside the folder
        "x.wav,No Such Song\n",
        encoding="utf-8",
    )
    matches = match_all(
        audio_in(audio), CHARTS, read_manifest(manifest), audio_dir=audio, manifest_dir=tmp_path
    )
    found = {m.audio.name: m for m in matches}
    assert found["take-3.wav"].chart is LASKAR and found["take-3.wav"].how == "manifest"
    assert found["elsewhere.wav"].chart is KISAH
    assert found["x.wav"].chart is None and "No Such Song" in found["x.wav"].how
    # The manifest's take beats the official video found by name.
    laskar = next(s for s in songs(matches) if s.chart is LASKAR)
    assert laskar.used.audio.name == "take-3.wav"


def test_a_manifest_needs_its_header_and_both_columns(tmp_path: Path) -> None:
    bad = tmp_path / "bad.csv"
    bad.write_text("file,song\na.wav,b\n", encoding="utf-8")
    with pytest.raises(ManifestError, match="header audio,chart"):
        read_manifest(bad)
    bad.write_text("audio,chart\na.wav,\n", encoding="utf-8")
    with pytest.raises(ManifestError, match="line 2"):
        read_manifest(bad)


def test_audio_in_takes_recordings_only(tmp_path: Path) -> None:
    for name in ("a.mp4", "b.M4A", "c.webm", "notes.txt", "d.mid"):
        (tmp_path / name).write_bytes(b"")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "e.mp3").write_bytes(b"")
    assert [p.name for p in audio_in(tmp_path)] == ["a.mp4", "b.M4A", "c.webm"]


def test_combined_ids_are_unique() -> None:
    items = [{"id": "song", "kind": "chart"}, {"id": "song", "kind": "chart"}]
    data = combined(items)
    assert data["format"] == "inharmonia"
    assert [i["id"] for i in data["items"]] == ["song", "song-2"]


def _write_song(folder: Path, name: str, spec_name: str) -> dict[str, Any]:
    spec = by_name(spec_name)
    audio = render(spec)
    sf.write(folder / name, audio.y, audio.sr)
    return chart_file(spec)


@pytest.mark.slow
def test_a_batch_of_two_songs_end_to_end(tmp_path: Path) -> None:
    require_node()
    audio = tmp_path / "audio"
    charts = tmp_path / "charts"
    out = tmp_path / "out"
    audio.mkdir()
    charts.mkdir()
    even = _write_song(audio, "Band - Even 70 (Official Video).wav", "even-70")
    waltz = _write_song(audio, "waltz 120 (lyrics).flac", "waltz-120")
    # A cover of the first song, and a recording no chart matches.
    official = audio / "Band - Even 70 (Official Video).wav"
    (audio / "Even 70 - cover akustik.wav").write_bytes(official.read_bytes())
    (audio / "voice memo.wav").write_bytes(official.read_bytes())
    (charts / "even.json").write_text(json.dumps(even), encoding="utf-8")
    # The second chart as a research JSON, read through the app's reader.
    raw = waltz["items"][0]["chart"]
    by_id = {s["id"]: s for s in raw["sections"]}
    blocks = []
    for sid in raw["form"]:
        s = by_id[sid]
        times = f" x{s['repeat']}" if s["repeat"] > 1 else ""
        blocks.append(f"[{s['label']}]\n| " + " | ".join(s["bars"]) + f" |{times}")
    sheet = "\n\n".join(blocks)
    research = {"title": "Waltz 120", "artist": None, "originalKey": "F major", "meter": "3/4", "bpm": 112}
    (charts / "waltz-120.json").write_text(json.dumps({**research, "chart": sheet}), encoding="utf-8")

    assert main(["batch", str(audio), str(charts), "--out", str(out)]) == 0

    summary = (out / SUMMARY).read_text(encoding="utf-8")
    assert (
        "| [Even 70](even-70.report.md) | Band - Even 70 (Official Video).wav "
        "(preferred over Even 70 - cover akustik.wav) | 70 bpm |"
    ) in summary
    assert "| [Waltz 120](waltz-120.report.md) | waltz 120 (lyrics).flac | 120 bpm | F major; +0 |" in summary
    assert "- voice memo.wav: no chart's title is in its name." in summary
    assert "| Song | Recording used | Tempo | Key and transposition | Confidence |" in summary
    for name in ("even-70", "waltz-120"):
        assert (out / f"{name}.report.md").is_file()
        data = json.loads((out / f"{name}.suggestions.json").read_text(encoding="utf-8"))
        assert data["suggestions"] == [] and data["applied"] is False
    # One file to import, holding both charts, read by the app's own reader.
    checked = check_output(out / COMBINED)
    assert checked.returncode == 0, checked.stderr
    assert "imports (2 charts)" in checked.stdout
    items = json.loads((out / COMBINED).read_text(encoding="utf-8"))["items"]
    assert [i["chart"]["tempo"] for i in items] == [70, 120]
    assert items[0]["chart"]["sections"][0]["bars"] == list(by_name("even-70").sections[0].truth)
    # No audio is ever written to the outputs.
    assert not [p for p in out.iterdir() if p.suffix.lower() in AUDIO_SUFFIXES]
