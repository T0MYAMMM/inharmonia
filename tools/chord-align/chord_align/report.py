"""The markdown report: what was found, how sure, and what was left alone."""

from __future__ import annotations

from .pipeline import MIN_CONFIDENCE, Result
from .tonality import signed_shift, transpose_key


def _pct(x: float) -> str:
    return f"{x:.0%}"


def build_report(result: Result, *, min_confidence: float = MIN_CONFIDENCE) -> str:
    """The report for one run, as markdown."""
    chart = result.chart
    lines: list[str] = ["# Chord alignment", ""]
    low = [s for s in result.sections if s.confidence < min_confidence]
    if result.confidence < min_confidence or low:
        names = ", ".join(s.label for s in low) or "the whole song"
        lines += [
            f"> **Low confidence** in {names}. The chart's chords may not match this "
            "recording, or the recording is hard to follow; check those sections by ear.",
            "",
        ]

    shift = signed_shift(result.shift)
    chart_key = f"{chart.key_tonic} {chart.key_mode}"
    shifted_key = f"{transpose_key(chart.key_tonic, chart.key_mode, result.shift)} {chart.key_mode}"
    lines += [
        "## Summary",
        "",
        f"- Tempo: {result.tempo} bpm (the chart said {chart.tempo:g}).",
        f"- Transposition: {shift:+d} semitones"
        + (
            " (the recording sounds where the chart is written)."
            if shift == 0
            else f": the chart's {chart_key} sounds as {shifted_key}."
        ),
        f"- Sounding key (estimated): {result.sounding.name}; chart key: {chart_key}.",
        f"- Bar phase: the first downbeat is beat {result.phase + 1} of the beat grid.",
        f"- Overall confidence: {_pct(result.confidence)} of judged beats.",
    ]
    if result.key is not None:
        lines.append(f"- Key written: {result.key[0]} {result.key[1]} (asked for with --set-key).")
    elif result.transpose is not None:
        lines.append(
            f"- Key left as {chart_key}, so the chord symbols still read in it; the chart's view "
            f"now transposes by {result.transpose:+d} to play with the recording."
        )
    else:
        lines.append(f"- Key left as {chart_key} (use --set-key to change it).")
    if result.grid != "tracked":
        lines.append(f"- The beat was taken at {result.grid} the tracked tempo, to fit the chart's lengths.")
    lines.append("")

    lines += [
        "## Sections",
        "",
        "| Section | Played | Confidence | Mean cost | Beats per chord | Result |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for s in result.sections:
        outcome = "skipped" if s.skipped else ("rewritten" if s.bars is not None else "kept")
        lines.append(
            f"| {s.label} | {len(s.lengths.occurrences)}× | {_pct(s.confidence)} | {s.mean_cost:.2f} | "
            f"{' '.join(str(n) for n in s.lengths.lengths)} | {outcome} |"
        )
    lines += ["", "Mean cost is per beat: 0 is a perfect template match, 1 is none.", ""]

    disagreements = [s for s in result.sections if s.lengths.outliers]
    lines += ["## Occurrences that disagree", ""]
    if not disagreements:
        lines += ["None: every occurrence of each section has the same lengths, within a beat.", ""]
    for s in disagreements:
        merged = chart.section(s.section_id).merged()
        for occ, pos, got, want in s.lengths.outliers:
            lines.append(
                f"- {s.label}, time {occ + 1}, chord {pos + 1} ({merged[pos].symbol}): "
                f"{got} beats, against {want} in the others."
            )
    if disagreements:
        lines.append("")

    adjustments = []
    for s in result.sections:
        if s.lengths.bar_fix is not None:
            beats, pos = s.lengths.bar_fix
            adjustments.append(
                f"- {s.label}: chord {pos + 1} {'gained' if beats > 0 else 'lost'} {abs(beats)} "
                f"beat{'s' if abs(beats) != 1 else ''} to fill whole bars."
            )
        if s.lengths.off_downbeat:
            times = ", ".join(str(k + 1) for k in s.lengths.off_downbeat)
            adjustments.append(
                f"- {s.label}: time {times} started off a downbeat (a pickup, or a bar of odd length)."
            )
    if adjustments:
        lines += ["## Adjustments", "", *adjustments, ""]

    skipped = [f"- {s.label}: {s.skipped}." for s in result.sections if s.skipped]
    skipped += [
        f"- Chord {sym}: not known here, matched on its root and fifth only."
        for sym in result.unknown_symbols
    ]
    skipped += [f"- {n}." for n in result.notes]
    lines += ["## Skipped", ""]
    lines += skipped or ["Nothing."]
    lines.append("")
    return "\n".join(lines)
