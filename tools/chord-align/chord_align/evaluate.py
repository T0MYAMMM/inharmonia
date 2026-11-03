"""``chord-align eval``: align every synthesised render and print the metrics.

On a clean render the bar is at least 90% of beats labelled correctly, bars
exactly as played, and tempo within 2%. A render whose chart does not match must
be reported as low confidence, with its sections left alone.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .chart import parse_bar, read_chart
from .pipeline import MIN_CONFIDENCE, Result, run
from .renders import RENDERS
from .synth import Render, RenderSpec, chart_file, render

BEAT_ACCURACY = 0.90
TEMPO_TOLERANCE = 0.02


@dataclass
class Score:
    """How one render came out."""

    name: str
    beat_accuracy: float
    bars_exact: bool
    tempo: int
    tempo_error: float
    shift_ok: bool
    confidence: float
    mismatched: bool

    @property
    def passed(self) -> bool:
        """Meets the bar for its kind of render."""
        if self.mismatched:
            return self.confidence < MIN_CONFIDENCE
        return (
            self.beat_accuracy >= BEAT_ACCURACY
            and self.bars_exact
            and self.tempo_error <= TEMPO_TOLERANCE
            and self.shift_ok
        )


def beat_accuracy(result: Result, audio: Render) -> float:
    """Share of the render's beats whose chord the alignment labelled correctly."""
    labels = result.labels()
    times = result.beats.times
    period = float(np.median(np.diff(audio.beat_times)))
    right = 0
    for t, want in zip(audio.beat_times, audio.labels, strict=True):
        i = int(np.searchsorted(times, t + period / 2, side="right")) - 1
        if 0 <= i < len(labels) and labels[i] == want:
            right += 1
    return right / len(audio.labels)


def bars_exact(result: Result, spec: RenderSpec) -> bool:
    """Every section rebuilt exactly as it was played."""
    by_id = {s.section_id: s for s in result.sections}
    for section in spec.sections:
        got = by_id[section.id].bars
        if got is None or len(got) != len(section.truth):
            return False
        for a, b in zip(got, section.truth, strict=True):
            if parse_bar(a, spec.meter, "out") != parse_bar(b, spec.meter, "truth"):
                return False
    return True


def score(spec: RenderSpec) -> tuple[Score, Result]:
    """Render, align and score one known chart."""
    audio = render(spec)
    result = run(read_chart(chart_file(spec)), audio.y, audio.sr)
    expected = spec.expected_shift if spec.expected_shift is not None else 0
    return (
        Score(
            name=spec.name,
            beat_accuracy=beat_accuracy(result, audio),
            bars_exact=bars_exact(result, spec),
            tempo=result.tempo,
            tempo_error=abs(result.tempo - spec.tempo) / spec.tempo,
            shift_ok=spec.mismatched or result.shift == expected,
            confidence=result.confidence,
            mismatched=spec.mismatched,
        ),
        result,
    )


def evaluate(names: list[str] | None = None, write: Path | None = None) -> list[Score]:
    """Score every render (or those named); with ``write``, save each aligned file there."""
    specs = [r for r in RENDERS if not names or r.name in names]
    unknown = set(names or []) - {r.name for r in RENDERS}
    if unknown:
        raise ValueError(f"no render named {', '.join(sorted(unknown))}")
    scores = []
    for spec in specs:
        result_score, result = score(spec)
        scores.append(result_score)
        if write is not None:
            write.mkdir(parents=True, exist_ok=True)
            out = write / f"{spec.name}.aligned.json"
            out.write_text(json.dumps(result.output(), indent=2) + "\n", encoding="utf-8")
    return scores


def table(scores: list[Score]) -> str:
    """The metrics as a plain table."""
    w = max(len(s.name) for s in scores)
    rows = [f"{'render'.ljust(w)}  beats  bars   tempo  error  shift  conf  pass"]
    for s in scores:
        rows.append(
            f"{s.name.ljust(w)}  {s.beat_accuracy:5.0%}  {'exact' if s.bars_exact else 'off  '}  "
            f"{s.tempo:5d}  {s.tempo_error:5.1%}  {'ok   ' if s.shift_ok else 'wrong'}  "
            f"{s.confidence:4.0%}  {'yes' if s.passed else 'NO'}"
        )
    clean = [s for s in scores if not s.mismatched]
    if clean:
        rows.append(
            f"{'clean'.ljust(w)}  {np.mean([s.beat_accuracy for s in clean]):5.0%}  "
            f"{sum(s.bars_exact for s in clean)}/{len(clean)}"
        )
    rows.append(f"passed {sum(s.passed for s in scores)} of {len(scores)}")
    return "\n".join(rows)
