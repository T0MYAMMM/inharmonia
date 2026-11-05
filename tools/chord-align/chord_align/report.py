"""The markdown report: what was found, how sure, and what was left alone."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .heard import fits
from .pipeline import MIN_CONFIDENCE, Result
from .tonality import signed_shift, transpose_key

#: Heard bars that agree with the chart, below which a section reads as "differs".
AGREE_OK = 0.6
#: Mean clarity below which a section reads as "hard to hear".
CLEAR_OK = 0.55


def _pct(x: float) -> str:
    return f"{x:.0%}"


@dataclass(frozen=True)
class BarRow:
    """One bar of the comparison: where it is, the chart's chords and the heard ones."""

    number: int
    section: str
    chart: tuple[str, ...]
    heard: tuple[str, ...]
    clarity: float

    @property
    def agrees(self) -> bool | None:
        """Every heard chord is part of a chart chord in the bar; None when nothing is clear."""
        if not self.heard:
            return None
        if not self.chart:
            return False
        return all(any(fits(h, c) for c in self.chart) for h in self.heard)


def bar_rows(result: Result) -> list[BarRow]:
    """The song bar by bar: the chart's chords as aligned, beside the free chords heard."""
    labels = result.labels()
    section_at: list[str | None] = [None] * len(labels)
    al = result.alignment
    for i, s, e in zip(al.events, al.starts, al.ends, strict=True):
        label = result.chart.section(result.events[i].section_id).label
        for b in range(int(s), int(e)):
            section_at[b] = label
    meter = result.chart.meter
    rows: list[BarRow] = []
    for n, bar in enumerate(result.heard, start=1):
        beats = range(max(bar.start, 0), min(bar.start + meter, len(labels)))
        chart: list[str] = []
        for b in beats:
            sym = labels[b]
            if sym is not None and (not chart or chart[-1] != sym):
                chart.append(sym)
        sections = [section_at[b] for b in beats if section_at[b]]
        where = sections[0] if sections else "–"
        rows.append(BarRow(n, where, tuple(chart), bar.chords, bar.clarity))
    return rows


def _tempo_line(result: Result) -> str:
    median = float(np.median(result.alignment.lengths)) if len(result.alignment.lengths) else 0.0
    line = (
        f"- Tempo: {result.tempo} bpm (the chart said {result.chart.tempo:g}), "
        f"{median:g} beats a chord typically."
    )
    if result.grid == "double":
        line += (
            f" The beat tracker heard {result.tracked_tempo:.0f} bpm; double that fits the chords "
            "and a usual tempo better."
        )
    elif result.grid == "half":
        line += (
            f" The beat tracker heard {result.tracked_tempo:.0f} bpm; half that fits the chords "
            "and a usual tempo better."
        )
    if result.other_octave is not None:
        tempo, length = result.other_octave
        line += (
            f" The other octave would be {tempo:.0f} bpm with {length:g} beats a chord; "
            "if that is how the song is counted, halve or double the lengths."
        )
    return line


def build_report(result: Result, *, min_confidence: float = MIN_CONFIDENCE) -> str:
    """The report for one run, as markdown."""
    chart = result.chart
    rows = bar_rows(result)
    lines: list[str] = ["# Chord alignment", ""]
    low = [s for s in result.sections if s.lengths is not None and s.confidence < min_confidence]
    if result.confidence < min_confidence or low:
        names = ", ".join(s.label for s in low) or "the whole song"
        lines += [
            f"> **Low confidence** in {names}. See “What the recording seems to play” to tell a "
            "chart that differs from the recording from a recording that is hard to hear.",
            "",
        ]

    shift = signed_shift(result.shift)
    chart_key = f"{chart.key_tonic} {chart.key_mode}"
    shifted_key = f"{transpose_key(chart.key_tonic, chart.key_mode, result.shift)} {chart.key_mode}"
    lines += [
        "## Summary",
        "",
        _tempo_line(result),
        f"- Transposition: {shift:+d} semitones"
        + (
            " (the recording sounds where the chart is written)."
            if shift == 0
            else f": the chart's {chart_key} sounds as {shifted_key}."
        ),
        f"- Sounding key (estimated): {result.sounding.name}; chart key: {chart_key}."
        + (
            ""
            if result.key_clear or result.sounding.name == shifted_key
            else f" {shifted_key} fits nearly as well, so the chart's key stands."
        ),
        f"- Confidence: {_pct(result.confidence)}. The chart's chords cover "
        f"{_pct(result.coverage)} of the music where chords are clear.",
    ]
    if result.lengths_trusted:
        lines.append("- Lengths: the chart's own lengths were used as a guide (--lengths-trusted).")
    else:
        lines.append(
            "- Lengths: taken from the recording. The chart's lengths only break ties, where two "
            "identical chords meet and the change between them can't be heard."
        )
    if result.key is not None:
        lines.append(f"- Key written: {result.key[0]} {result.key[1]} (asked for with --set-key).")
    elif result.transpose is not None:
        lines.append(
            f"- Key left as {chart_key}, so the chord symbols still read in it; the chart's view "
            f"now transposes by {result.transpose:+d} to play with the recording."
        )
    elif result.key_clear:
        lines.append(f"- Key left as {chart_key} (use --set-key to change it).")
    else:
        lines.append(f"- Key left as {chart_key}.")
    lines.append("")

    lines += ["## Form", ""]
    if not result.left_out and not result.played_twice:
        lines += ["The recording follows the chart's form.", ""]
    else:
        lines += [f"- The recording seems to leave out {x}." for x in result.left_out]
        lines += [f"- The recording seems to play {x} twice in a row." for x in result.played_twice]
        lines += ["", "Edit the chart's form if that is right; lengths were taken from what was played.", ""]

    lines += [
        "## Sections",
        "",
        "| Section | Played | Confidence | Mean cost | Beats per chord | Result |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for s in result.sections:
        if s.lengths is None:
            lines.append(f"| {s.label} | 0× | – | – | – | kept |")
            continue
        outcome = "kept" if s.skipped else "rewritten"
        lines.append(
            f"| {s.label} | {len(s.lengths.occurrences)}× | {_pct(s.confidence)} | {s.mean_cost:.2f} | "
            f"{' '.join(str(n) for n in s.lengths.lengths)} | {outcome} |"
        )
    lines += [
        "",
        "Confidence is the share of each half bar where the chart's chord fits the music about as "
        "well as any common chord. Mean cost is per beat: 0 is as good a match as any chord.",
        "",
    ]

    disagreements = [s for s in result.sections if s.lengths is not None and s.lengths.outliers]
    lines += ["## Playings that disagree", ""]
    if not disagreements:
        lines += ["None: every playing of each section has the same lengths, within a beat.", ""]
    for s in disagreements:
        assert s.lengths is not None
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
        if s.lengths is None:
            continue
        if s.lengths.bar_fix is not None:
            beats, pos = s.lengths.bar_fix
            adjustments.append(
                f"- {s.label}: chord {pos + 1} {'gained' if beats > 0 else 'lost'} {abs(beats)} "
                f"beat{'s' if abs(beats) != 1 else ''} to fill whole bars."
            )
        if s.lengths.off_downbeat:
            times = ", ".join(str(k + 1) for k in s.lengths.off_downbeat)
            adjustments.append(
                f"- {s.label}: time {times} started off a downbeat (a pickup, a push, or a bar of odd "
                "length); its bars are written from the downbeat."
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

    lines += suggestions_section(result)
    lines += _heard_section(result, rows)
    return "\n".join(lines)


def suggestions_section(result: Result) -> list[str]:
    """The suggested chord changes, the evidence for each, and whether they were written."""
    lines = ["## Suggested chord changes", ""]
    found = result.suggestions
    if not found:
        return [*lines, "None: wherever the chords can be heard clearly, they agree with the chart.", ""]
    applied = any(s.applied for s in found)
    lines += [
        "Where the recording clearly and repeatedly plays another chord: in at least two playings, "
        "or in a section played once, clearly. Margin is how much better the heard chord fits than "
        "the chart's (0 to 1).",
        "",
        "| Section | Played | Bar | Chart | Suggested | Evidence |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for s in found:
        lines.append(
            f"| {s.section} | {s.playings}× | {s.bar} | {s.chart} | {s.suggested} | heard in {s.heard_in} "
            f"of {s.playings} playing{'s' if s.playings != 1 else ''}, margin {s.margin:.2f} |"
        )
    lines.append("")
    if applied:
        lines.append(
            "Applied (--apply-suggestions): the chart was written with these chords, and aligned "
            "again with them."
        )
    else:
        lines.append(
            "Not applied: the chart keeps its own chords. Check them by ear; "
            "--apply-suggestions writes them in."
        )
    lines.append("")
    return lines


def agreement(rows: list[BarRow]) -> tuple[int, int, int]:
    """Bars that agree, bars with a clear chord, and clear bars the chart leaves unlabelled."""
    judged = [r for r in rows if r.agrees is not None]
    return sum(1 for r in judged if r.agrees), len(judged), sum(1 for r in judged if not r.chart)


def _heard_section(result: Result, rows: list[BarRow]) -> list[str]:
    agree, judged, uncovered = agreement(rows)
    lines = [
        "## What the recording seems to play",
        "",
        "Chords heard in each bar with no chart at all (the best of the 24 major and minor triads, "
        f"named in the chart's key{'' if result.shift == 0 else ', with the transposition taken out'}), "
        "beside the chart's chords as aligned. A heard chord agrees when it is part of the chart's "
        "chord: C agrees with C, Cmaj7 or Am7, but not with Am.",
        "",
    ]
    if judged:
        line = f"{agree} of {judged} bars with a clear chord agree."
        if uncovered:
            line += (
                f" {uncovered} of them have no chart chord at all: an instrumental part the chart "
                "leaves out, or music the chart does not follow."
            )
        lines.append(line)
    by_section: dict[str, list[BarRow]] = {}
    for r in rows:
        by_section.setdefault(r.section, []).append(r)
    verdicts = []
    for name, group in by_section.items():
        clear = [r for r in group if r.agrees is not None and r.chart]
        if not clear or name == "–":
            continue
        share = sum(1 for r in clear if r.agrees) / len(clear)
        clarity = sum(r.clarity for r in group) / len(group)
        if share < AGREE_OK and clarity >= CLEAR_OK:
            verdicts.append(
                f"- {name}: the chords heard clearly differ from the chart ({_pct(share)} agree)."
            )
        elif clarity < CLEAR_OK:
            verdicts.append(f"- {name}: the chords are hard to hear here; treat its lengths with care.")
    if verdicts:
        lines += ["", *verdicts]
    lines += ["", "| Bar | Section | Chart | Heard | |", "| --- | --- | --- | --- | --- |"]
    for r in rows:
        mark = {True: "✓", False: "≠", None: ""}[r.agrees]
        chart = " ".join(r.chart) or "–"
        heard = " ".join(r.heard) or "(no clear chord)"
        lines.append(f"| {r.number} | {r.section} | {chart} | {heard} | {mark} |")
    lines.append("")
    return lines
