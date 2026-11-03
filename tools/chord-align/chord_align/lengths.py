"""From aligned beats to bars: bar phase, consensus per section, whole bars."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np

from .chart import Event


def bar_phase(starts: np.ndarray, beats_per_bar: int) -> int:
    """The downbeat offset (0 to beats − 1) that puts the most chord changes on downbeats.

    A tie goes to the offset that puts the first chord on a downbeat, then the
    smallest.
    """
    counts = [int(np.sum((starts - k) % beats_per_bar == 0)) for k in range(beats_per_bar)]
    first = int(starts[0]) % beats_per_bar if len(starts) else 0
    return max(range(beats_per_bar), key=lambda k: (counts[k], k == first, -k))


@dataclass
class SectionLengths:
    """Consensus lengths of one section and how its occurrences agreed."""

    section_id: str
    #: Whole beats per chord position (of ``Section.merged()``).
    lengths: list[int]
    #: Lengths of every occurrence, in play order.
    occurrences: list[list[int]]
    #: (occurrence, position, its length, consensus) where an occurrence disagrees.
    outliers: list[tuple[int, int, int, int]] = field(default_factory=list)
    #: Beats added (+) or removed (−) to make whole bars, and at which position.
    bar_fix: tuple[int, int] | None = None
    #: Occurrences that start off a downbeat.
    off_downbeat: list[int] = field(default_factory=list)


def is_outlier(value: int, consensus: int) -> bool:
    """More than a beat and more than a quarter away from the consensus."""
    return abs(value - consensus) > max(1.0, 0.25 * consensus)


def unambiguous(events: list[Event]) -> np.ndarray:
    """Which events have both edges heard: neither neighbour is the same chord.

    Where a section ends on the chord the next one starts with, the boundary
    between them cannot be heard, so those runs are not trusted for lengths.
    """
    out = np.ones(len(events), dtype=bool)
    for k, ev in enumerate(events):
        if k > 0 and events[k - 1].symbol == ev.symbol:
            out[k] = False
        if k + 1 < len(events) and events[k + 1].symbol == ev.symbol:
            out[k] = False
    return out


def position_medians(events: list[Event], lengths: np.ndarray, trusted: np.ndarray) -> np.ndarray:
    """For each event, the median length of its chord position over the section's occurrences.

    Only unambiguous runs count, unless a position has none.
    """
    groups: dict[tuple[str, int], list[int]] = defaultdict(list)
    for k, ev in enumerate(events):
        groups[(ev.section_id, ev.position)].append(k)
    out = np.zeros(len(events))
    for ks in groups.values():
        good = [k for k in ks if trusted[k]] or ks
        med = float(np.median(lengths[good]))
        out[ks] = med
    return out


def consensus(
    events: list[Event],
    lengths: np.ndarray,
    starts: np.ndarray,
    phase: int,
    beats_per_bar: int,
    trusted: np.ndarray | None = None,
) -> dict[str, SectionLengths]:
    """Median length per chord position for each section, outliers flagged.

    The median is over the occurrences whose runs are ``trusted`` (all of them
    when none are); every occurrence is checked against it.
    """
    if trusted is None:
        trusted = np.ones(len(events), dtype=bool)
    medians = position_medians(events, lengths, trusted)
    runs: dict[str, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
    first_beat: dict[str, dict[int, int]] = defaultdict(dict)
    target: dict[str, dict[int, float]] = defaultdict(dict)
    for ev, n, s, m in zip(events, lengths, starts, medians, strict=True):
        runs[ev.section_id][ev.occurrence].append(int(n))
        first_beat[ev.section_id].setdefault(ev.occurrence, int(s))
        target[ev.section_id][ev.position] = m
    out: dict[str, SectionLengths] = {}
    for sid, by_occ in runs.items():
        occs = [by_occ[k] for k in sorted(by_occ)]
        lens = [max(1, int(np.floor(target[sid][p] + 0.5))) for p in range(len(occs[0]))]
        result = SectionLengths(sid, lens, occs)
        for oi, occ in enumerate(occs):
            for pi, (v, c) in enumerate(zip(occ, lens, strict=True)):
                if is_outlier(v, c):
                    result.outliers.append((oi, pi, v, c))
        result.off_downbeat = [k for k, b in sorted(first_beat[sid].items()) if (b - phase) % beats_per_bar]
        result.bar_fix = whole_bars(result.lengths, beats_per_bar)
        out[sid] = result
    return out


def whole_bars(lengths: list[int], beats_per_bar: int) -> tuple[int, int] | None:
    """Make ``lengths`` fill whole bars, in place, with the smallest change.

    The change goes to the longest chord (the first, on a tie). Returns
    (beats added or removed, position), or None when nothing changed.
    """
    rest = sum(lengths) % beats_per_bar
    if rest == 0:
        return None
    longest = int(np.argmax(lengths))
    add = beats_per_bar - rest
    if rest < add and lengths[longest] - rest >= 1:
        lengths[longest] -= rest
        return (-rest, longest)
    lengths[longest] += add
    return (add, longest)
