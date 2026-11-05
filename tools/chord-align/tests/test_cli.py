from __future__ import annotations

import json
from pathlib import Path

import pytest
import soundfile as sf

from chord_align.cli import default_out, main
from chord_align.renders import ALL_RENDERS, by_name
from chord_align.synth import chart_file, render

from .conftest import FIXTURES, check_output, require_node, scored


def _write_render(tmp_path: Path, name: str) -> tuple[Path, Path]:
    spec = by_name(name)
    audio = render(spec)
    wav = tmp_path / f"{name}.wav"
    sf.write(wav, audio.y, audio.sr)
    chart = tmp_path / f"{name}.json"
    chart.write_text(json.dumps(chart_file(spec), indent=2), encoding="utf-8")
    return wav, chart


@pytest.mark.slow
def test_align_writes_an_importable_file_and_a_report(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    wav, chart = _write_render(tmp_path, "uneven-96")
    assert main([str(wav), str(chart)]) == 0
    out = default_out(chart)
    report = out.with_suffix(".md")
    assert out.is_file()
    assert report.is_file()
    data = json.loads(out.read_text(encoding="utf-8"))
    raw = data["items"][0]["chart"]
    assert raw["tempo"] == 96
    assert raw["sections"][0]["bars"] == ["G D", "Em . . C", "G . . D", "Cadd9"]
    assert raw["key"] == {"tonic": "G", "mode": "major"}
    assert "Tempo 96 bpm" in capsys.readouterr().out
    suggestions = json.loads(out.with_suffix(".suggestions.json").read_text(encoding="utf-8"))
    assert suggestions == {
        "chart": {"id": "uneven-96", "title": "Uneven 96"},
        "applied": False,
        "suggestions": [],
    }
    checked = check_output(out)
    assert checked.returncode == 0, checked.stderr


@pytest.mark.slow
def test_set_key_with_no_transposition_writes_the_sounding_key(tmp_path: Path) -> None:
    wav, chart = _write_render(tmp_path, "waltz-120")
    out = tmp_path / "keyed.json"
    assert (
        main([str(wav), str(chart), "--out", str(out), "--report", str(tmp_path / "r.md"), "--set-key"]) == 0
    )
    raw = json.loads(out.read_text(encoding="utf-8"))["items"][0]["chart"]
    assert raw["key"] == {"tonic": "F", "mode": "major"}


@pytest.mark.slow
def test_every_render_output_imports_in_the_app(tmp_path: Path) -> None:
    files = []
    for spec in ALL_RENDERS:
        _, result = scored(spec.name)
        path = tmp_path / f"{spec.name}.json"
        path.write_text(json.dumps(result.output(), indent=2), encoding="utf-8")
        files.append(path)
    checked = check_output(*files)
    assert checked.returncode == 0, checked.stderr
    assert checked.stdout.count("imports") == len(ALL_RENDERS)


def test_check_output_refuses_a_bad_file(tmp_path: Path) -> None:
    data = json.loads((FIXTURES / "chart.json").read_text(encoding="utf-8"))
    data["items"][0]["chart"]["sections"][0]["bars"] = ["C . G"]
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data), encoding="utf-8")
    checked = check_output(bad)
    assert checked.returncode == 1
    assert "lasts 3 beats" in checked.stderr


def test_a_bad_chart_is_refused_before_any_audio_is_read(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    chart = tmp_path / "c.json"
    chart.write_text('{"format": "inharmonia", "version": 3, "items": [{"kind": "song"}]}')
    assert main([str(tmp_path / "missing.m4a"), str(chart)]) == 1
    err = capsys.readouterr().err
    assert "has no chart" in err
    assert not default_out(chart).exists()


def test_missing_audio(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert (
        main([str(tmp_path / "missing.wav"), str(FIXTURES / "chart.json"), "--out", str(tmp_path / "o.json")])
        == 1
    )
    assert "no such file" in capsys.readouterr().err


def test_bad_min_confidence(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["a.wav", "c.json", "--min-confidence", "2"]) == 2


@pytest.mark.slow
def test_lengths_trusted_uses_the_chart_lengths(tmp_path: Path) -> None:
    # With the chart's (correct) lengths trusted, the result is the same.
    spec = by_name("uneven-96")
    audio = render(spec)
    wav = tmp_path / "u.wav"
    sf.write(wav, audio.y, audio.sr)
    chart = tmp_path / "u.json"
    chart.write_text(json.dumps(chart_file(spec, "truth")), encoding="utf-8")
    out = tmp_path / "u.out.json"
    assert main([str(wav), str(chart), "--out", str(out), "--lengths-trusted"]) == 0
    raw = json.loads(out.read_text(encoding="utf-8"))["items"][0]["chart"]
    assert raw["sections"][0]["bars"] == list(spec.sections[0].truth)
    assert "--lengths-trusted" in out.with_suffix(".md").read_text(encoding="utf-8")


@pytest.mark.slow
def test_eval_prints_the_metrics(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["eval", "even-70", "mismatch-100", "--write", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "beats" in out
    assert "passed 2 of 2" in out
    assert sorted(p.name for p in tmp_path.iterdir()) == ["even-70.aligned.json", "mismatch-100.aligned.json"]


def test_eval_unknown_render(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["eval", "nope"]) == 2


@pytest.mark.slow
def test_align_reads_a_pasted_sheet(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    require_node()
    wav, _ = _write_render(tmp_path, "even-70")
    sheet = tmp_path / "Even 70.txt"
    # Chords over words, as a chord site writes them; the second verse and chorus by name only.
    sheet.write_text(
        "[Verse]\nC          G\nsome words here, more words\nAm         F\nand some more words to sing\n\n"
        "[Chorus]\n| F | G | C | C |\n\n[Verse]\n\n[Chorus]\n",
        encoding="utf-8",
    )
    out = tmp_path / "even.json"
    assert main([str(wav), str(sheet), "--out", str(out)]) == 0
    text = out.read_text(encoding="utf-8")
    assert "words" not in text and "lyrics" not in text
    raw = json.loads(text)["items"][0]["chart"]
    assert raw["form"] == ["s1", "s2", "s1", "s2"]
    assert raw["sections"][0]["bars"] == list(by_name("even-70").sections[0].truth)
    assert raw["tempo"] == 70
    assert out.with_suffix(".suggestions.json").is_file()
    assert check_output(out).returncode == 0


def test_batch_refuses_a_bad_manifest(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    manifest = tmp_path / "m.csv"
    manifest.write_text("song\nx\n", encoding="utf-8")
    code = main(
        [
            "batch",
            str(tmp_path),
            str(FIXTURES / "chart.json"),
            "--out",
            str(tmp_path / "o"),
            "--manifest",
            str(manifest),
        ]
    )
    assert code == 1
    assert "header audio,chart" in capsys.readouterr().err


def test_batch_bad_min_confidence() -> None:
    assert main(["batch", "a", "c", "--out", "o", "--min-confidence", "-1"]) == 2


def test_batch_with_nothing_matched_writes_a_summary(tmp_path: Path) -> None:
    (tmp_path / "voice memo.m4a").write_bytes(b"")
    out = tmp_path / "out"
    assert main(["batch", str(tmp_path), str(FIXTURES / "chart.json"), "--out", str(out)]) == 0
    summary = (out / "summary.md").read_text(encoding="utf-8")
    assert "- voice memo.m4a: no chart's title is in its name." in summary
    assert not (out / "aligned-charts.json").exists()
