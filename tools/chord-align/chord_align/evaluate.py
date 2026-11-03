"""``chord-align eval``: align every synthesised render and print the metrics.

The bar for every render that matches its chart: at least 90% of beats labelled
correctly, the tempo within 2%, the transposition found, and any change of form
reported. Clean renders, and the band render whose chart has every length
halved, must also rebuild every bar exactly. A render whose chart does not match
must come out below the confidence threshold, its sections left alone.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .chart import parse_bar, read_chart
from .pipeline import MIN_CONFIDENCE, Result, run
from .renders import ALL_RENDERS
from .synth import Render, RenderSpec, chart_file, render

BEAT_ACCURACY = 0.90
TEMPO_TOLERANCE = 0.02


@dataclass
class Score:
    """How one render came out."""

    name: str
    beat_accuracy: float
    bars_exact: bool
    sections_exact: int
    sections: int
    tempo: int
    tempo_error: float
    shift_ok: bool
    form_ok: bool
    confidence: float
    mismatched: bool
    exact_required: bool
    band: bool

    @property
    def passed(self) -> bool:
        """Meets the bar for its kind of render."""
        if self.mismatched:
            return self.confidence < MIN_CONFIDENCE and self.sections_exact == 0
        return (
            self.beat_accuracy >= BEAT_ACCURACY
            and self.tempo_error <= TEMPO_TOLERANCE
            and self.shift_ok
            and self.form_ok
            and (self.bars_exact or not self.exact_required)
        )


def beat_accuracy(result: Result, audio: Render) -> float:
    """Share of the render's beats whose chord the alignment labelled correctly."""
    labels = result.labels()
    times = result.beats.times
    right = 0
    for k, (t, want) in enumerate(zip(audio.beat_times, audio.labels, strict=True)):
        nxt = audio.beat_times[k + 1] if k + 1 < len(audio.beat_times) else t + 60 / result.tempo
        i = int(np.searchsorted(times, (t + nxt) / 2, side="right")) - 1
        if 0 <= i < len(labels) and labels[i] == want:
            right += 1
    return right / len(audio.labels)


def section_exact(result: Result, spec: RenderSpec, section_id: str) -> bool:
    """True when the section was rebuilt as played, or left alone if the render never plays it."""
    got = next(s for s in result.sections if s.section_id == section_id).bars
    section = next(s for s in spec.sections if s.id == section_id)
    if section_id not in spec.plays:
        return got is None
    if got is None or len(got) != len(section.truth):
        return False
    return all(
        parse_bar(a, spec.meter, "out") == parse_bar(b, spec.meter, "truth")
        for a, b in zip(got, section.truth, strict=True)
    )


def form_ok(result: Result, spec: RenderSpec) -> bool:
    """The change of form the render makes, and no other, is reported."""
    changes = [("left out", x.split(" (")[0]) for x in result.left_out]
    changes += [("twice", x.split(" (")[0]) for x in result.played_twice]
    return changes == ([spec.form_change] if spec.form_change else [])


def score(spec: RenderSpec) -> tuple[Score, Result]:
    """Render, align and score one known chart."""
    audio = render(spec)
    result = run(read_chart(chart_file(spec)), audio.y, audio.sr)
    expected = spec.expected_shift if spec.expected_shift is not None else 0
    exact = [section_exact(result, spec, s.id) for s in spec.sections]
    if spec.mismatched:
        exact = [s.bars is not None for s in result.sections]  # any rewrite is a failure
    return (
        Score(
            name=spec.name,
            beat_accuracy=beat_accuracy(result, audio),
            bars_exact=all(exact) and not spec.mismatched,
            sections_exact=sum(exact),
            sections=len(exact),
            tempo=result.tempo,
            tempo_error=abs(result.tempo - spec.tempo) / spec.tempo,
            shift_ok=spec.mismatched or result.shift == expected,
            form_ok=spec.mismatched or form_ok(result, spec),
            confidence=result.confidence,
            mismatched=spec.mismatched,
            exact_required=spec.exact,
            band=spec.band,
        ),
        result,
    )


def evaluate(names: list[str] | None = None, write: Path | None = None) -> list[Score]:
    """Score every render (or those named); with ``write``, save each aligned file there."""
    specs = [r for r in ALL_RENDERS if not names or r.name in names]
    unknown = set(names or []) - {r.name for r in ALL_RENDERS}
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
    rows = [f"{'render'.ljust(w)}  beats  bars   tempo  error  shift  form  conf  pass"]
    for s in scores:
        bars = f"{s.sections_exact}/{s.sections}"
        if s.mismatched:
            bars = "kept" if s.sections_exact == 0 else "WRONG"
        rows.append(
            f"{s.name.ljust(w)}  {s.beat_accuracy:5.0%}  {bars:5}  {s.tempo:5d}  {s.tempo_error:5.1%}  "
            f"{'ok   ' if s.shift_ok else 'wrong'}  {'ok  ' if s.form_ok else 'NO  '}  "
            f"{s.confidence:4.0%}  {'yes' if s.passed else 'NO'}"
        )
    for label, group in (
        ("clean", [s for s in scores if not s.mismatched and not s.band]),
        ("band", [s for s in scores if not s.mismatched and s.band]),
    ):
        if group:
            rows.append(
                f"{label.ljust(w)}  {np.mean([s.beat_accuracy for s in group]):5.0%}  "
                f"{sum(s.sections_exact for s in group)}/{sum(s.sections for s in group)} sections exact"
            )
    rows.append(f"passed {sum(s.passed for s in scores)} of {len(scores)}")
    return "\n".join(rows)
