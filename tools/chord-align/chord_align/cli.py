"""Command line: ``chord-align <audio> <chart.json> ...`` and ``chord-align eval``."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .audio import SAMPLE_RATE, AudioError, load_audio
from .chart import ChartError, load_file, read_chart
from .pipeline import MIN_CONFIDENCE, run
from .report import build_report

log = logging.getLogger("chord_align")


def _align_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="chord-align",
        description=(
            "Align a chart's chords to a recording, and write the chart back with each "
            "chord's length in beats and the tempo. Runs offline; audio never leaves "
            "this machine. `chord-align eval` scores the synthesised test renders."
        ),
    )
    p.add_argument("audio", type=Path, help="the recording (WAV or FLAC, or anything ffmpeg reads)")
    p.add_argument("chart", type=Path, help="an Inharmonia file holding the chart")
    p.add_argument("--item", help="the id of the chart in the file (default: the first chart)")
    p.add_argument("--out", type=Path, help="where to write the file (default: <chart>.aligned.json)")
    p.add_argument("--report", type=Path, help="where to write the report (default: beside --out, .md)")
    p.add_argument(
        "--set-key",
        action="store_true",
        help="also set the key: the sounding key, or, for a transposed recording, the view's transpose",
    )
    p.add_argument(
        "--min-confidence",
        type=float,
        default=MIN_CONFIDENCE,
        help=f"sections below this keep their bars (0 to 1, default {MIN_CONFIDENCE}; 0 writes all)",
    )
    p.add_argument("-v", "--verbose", action="store_true", help="log each step")
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


def _align(argv: list[str]) -> int:
    ns = _align_parser().parse_args(argv)
    _setup_logging(ns.verbose)
    if not 0.0 <= ns.min_confidence <= 1.0:
        print("chord-align: --min-confidence should be 0 to 1", file=sys.stderr)
        return 2
    out: Path = ns.out or default_out(ns.chart)
    report_path: Path = ns.report or out.with_suffix(".md")
    try:
        # The chart is checked before any audio is read.
        chart = read_chart(load_file(ns.chart), ns.item)
        samples = load_audio(ns.audio)
        result = run(chart, samples, SAMPLE_RATE, set_key=ns.set_key, min_confidence=ns.min_confidence)
    except ChartError as e:
        print(f"chord-align: {ns.chart.name}: {e}", file=sys.stderr)
        return 1
    except (AudioError, ValueError) as e:
        print(f"chord-align: {e}", file=sys.stderr)
        return 1
    out.write_text(json.dumps(result.output(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report_path.write_text(build_report(result, min_confidence=ns.min_confidence), encoding="utf-8")
    rewritten = sum(s.bars is not None for s in result.sections)
    print(f"Tempo {result.tempo} bpm, transposition {result.shift:+d}, confidence {result.confidence:.0%}.")
    print(f"Rewrote {rewritten} of {len(result.sections)} sections.")
    print(f"Wrote {out} and {report_path}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
