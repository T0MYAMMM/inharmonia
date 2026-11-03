"""Command line: ``chord-align <audio> <chart> ...``, ``chord-align batch`` and ``chord-align eval``."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .audio import SAMPLE_RATE, AudioError, load_audio
from .batch import ManifestError, Options, run_batch
from .chart import ChartError, read_chart
from .pipeline import MIN_CONFIDENCE, run
from .report import build_report
from .sources import load_one
from .suggest import suggestions_file

log = logging.getLogger("chord_align")


def _common_options(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--set-key",
        action="store_true",
        help="also set the key: the sounding key, or, for a transposed recording, the view's transpose",
    )
    p.add_argument(
        "--lengths-trusted",
        action="store_true",
        help="the chart's lengths are real, not guesses: use them as a guide for lengths and tempo",
    )
    p.add_argument(
        "--min-confidence",
        type=float,
        default=MIN_CONFIDENCE,
        help=f"sections below this keep their bars (0 to 1, default {MIN_CONFIDENCE}; 0 writes all)",
    )
    p.add_argument(
        "--apply-suggestions",
        action="store_true",
        help="write the suggested chord changes into the chart (by default they are only reported)",
    )
    p.add_argument("-v", "--verbose", action="store_true", help="log each step")


def _align_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="chord-align",
        description=(
            "Align a chart's chords to a recording, and write the chart back with each "
            "chord's length in beats and the tempo. Runs offline; audio never leaves "
            "this machine. `chord-align batch` does many songs at once; "
            "`chord-align eval` scores the synthesised test renders."
        ),
    )
    p.add_argument(
        "audio", type=Path, help="the recording: mp4, m4a, mp3, wav, flac, webm (anything ffmpeg reads)"
    )
    p.add_argument(
        "chart",
        type=Path,
        help="an Inharmonia file, a research JSON, or a chord sheet as .txt (lyrics are not kept)",
    )
    p.add_argument("--item", help="the id of the chart in an Inharmonia file (default: the first chart)")
    p.add_argument("--out", type=Path, help="where to write the file (default: <chart>.aligned.json)")
    p.add_argument("--report", type=Path, help="where to write the report (default: beside --out, .md)")
    _common_options(p)
    return p


def _batch_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="chord-align batch",
        description=(
            "Align many songs: each recording is matched to a chart by its file name (or by a "
            "manifest), aligned, and written into one Inharmonia file, with a report and "
            "suggestions per song and a summary."
        ),
    )
    p.add_argument("audio", type=Path, help="a folder of recordings (or one recording)")
    p.add_argument(
        "charts",
        type=Path,
        help="a folder of charts (Inharmonia files, research JSON, .txt sheets), or one",
    )
    p.add_argument("--out", type=Path, required=True, help="the folder to write everything into")
    p.add_argument("--manifest", type=Path, help="a CSV (header audio,chart) of pairs that override matching")
    _common_options(p)
    return p


def _eval_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="chord-align eval", description="Score the synthesised test renders.")
    p.add_argument("names", nargs="*", help="renders to score (default: all)")
    p.add_argument("--write", type=Path, help="also save each aligned file in this folder")
    p.add_argument("-v", "--verbose", action="store_true", help="log each step")
    return p


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.INFO if verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )


def default_out(chart: Path) -> Path:
    """``song.json`` → ``song.aligned.json``, beside it."""
    return chart.with_name(f"{chart.stem}.aligned.json")


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; returns the exit code."""
    args = sys.argv[1:] if argv is None else argv
    if args[:1] == ["eval"]:
        return _eval(args[1:])
    if args[:1] == ["batch"]:
        return _batch(args[1:])
    return _align(args)


def _eval(argv: list[str]) -> int:
    ns = _eval_parser().parse_args(argv)
    _setup_logging(ns.verbose)
    from .evaluate import evaluate, table

    try:
        scores = evaluate(ns.names or None, ns.write)
    except ValueError as e:
        print(f"chord-align eval: {e}", file=sys.stderr)
        return 2
    print(table(scores))
    return 0 if all(s.passed for s in scores) else 1


def _bad_confidence(value: float, prog: str) -> bool:
    if 0.0 <= value <= 1.0:
        return False
    print(f"{prog}: --min-confidence should be 0 to 1", file=sys.stderr)
    return True


def _align(argv: list[str]) -> int:
    ns = _align_parser().parse_args(argv)
    _setup_logging(ns.verbose)
    if _bad_confidence(ns.min_confidence, "chord-align"):
        return 2
    out: Path = ns.out or default_out(ns.chart)
    report_path: Path = ns.report or out.with_suffix(".md")
    suggestions_path = out.with_suffix(".suggestions.json")
    try:
        # The chart is checked (and a sheet converted) before any audio is read.
        data, item = load_one(ns.chart, ns.item)
        chart = read_chart(data, item)
        samples = load_audio(ns.audio)
        result = run(
            chart,
            samples,
            SAMPLE_RATE,
            set_key=ns.set_key,
            min_confidence=ns.min_confidence,
            lengths_trusted=ns.lengths_trusted,
            apply_suggestions=ns.apply_suggestions,
        )
    except ChartError as e:
        print(f"chord-align: {ns.chart.name}: {e}", file=sys.stderr)
        return 1
    except (AudioError, ValueError) as e:
        print(f"chord-align: {e}", file=sys.stderr)
        return 1
    out.write_text(json.dumps(result.output(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report_path.write_text(build_report(result, min_confidence=ns.min_confidence), encoding="utf-8")
    suggestions_path.write_text(
        json.dumps(suggestions_file(result), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    rewritten = sum(s.bars is not None for s in result.sections)
    n = len(result.suggestions)
    print(f"Tempo {result.tempo} bpm, transposition {result.shift:+d}, confidence {result.confidence:.0%}.")
    print(f"Rewrote {rewritten} of {len(result.sections)} sections.")
    if n:
        done = "applied" if ns.apply_suggestions else "see the report; not applied"
        print(f"{n} suggested chord change{'s' if n != 1 else ''} ({done}).")
    print(f"Wrote {out}, {report_path} and {suggestions_path}.")
    return 0


def _batch(argv: list[str]) -> int:
    ns = _batch_parser().parse_args(argv)
    _setup_logging(ns.verbose)
    if _bad_confidence(ns.min_confidence, "chord-align batch"):
        return 2
    opts = Options(
        set_key=ns.set_key,
        min_confidence=ns.min_confidence,
        lengths_trusted=ns.lengths_trusted,
        apply_suggestions=ns.apply_suggestions,
    )
    try:
        rows, unmatched = run_batch(ns.audio, ns.charts, ns.out, manifest=ns.manifest, opts=opts)
    except (ChartError, AudioError, ManifestError) as e:
        print(f"chord-align batch: {e}", file=sys.stderr)
        return 1
    aligned = sum(r.result is not None for r in rows)
    print(f"Aligned {aligned} of {len(rows)} songs; {len(unmatched)} recordings not matched.")
    print(f"Wrote {ns.out / 'summary.md'}.")
    return 0 if aligned == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
