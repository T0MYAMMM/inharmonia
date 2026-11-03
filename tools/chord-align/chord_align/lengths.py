"""From aligned runs to bars: bar phase, consensus per section, whole bars."""

from __future__ import annotations

import itertools
from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np

from .align import Alignment
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
    """Consensus lengths of one section and how its playings agreed."""

    section_id: str
    #: Whole beats per chord position (of ``Section.merged()``).
    lengths: list[int]
    #: Lengths of every playing, in play order.
    occurrences: list[list[int]]
    #: (playing, position, its length, consensus) where a playing disagrees.
    outliers: list[tuple[int, int, int, int]] = field(default_factory=list)
    #: Beats added (+) or removed (−) to make whole bars, and at which position.
    bar_fix: tuple[int, int] | None = None
    #: Playings that start off a downbeat.
    off_downbeat: list[int] = field(default_factory=list)


def is_outlier(value: int, consensus: int) -> bool:
    """More than a beat and more than a quarter away from the consensus."""
    return abs(value - consensus) > max(1.0, 0.25 * consensus)


def unambiguous(events: list[Event], al: Alignment) -> np.ndarray:
    """Which runs have both edges heard: neither neighbour on the path is the same chord.

    Where a section ends on the chord the next one starts with, the boundary
    between them cannot be heard, so those runs are not trusted for lengths;
    nor is the last run of the song, whose end fades rather than changes.
    """
    symbols = [events[i].symbol for i in al.events]
    out = np.ones(len(symbols), dtype=bool)
    for k, sym in enumerate(symbols):
        if (k > 0 and symbols[k - 1] == sym) or (k + 1 < len(symbols) and symbols[k + 1] == sym):
            out[k] = False
    # The song's last chord rings on into the reverb, the slowing and the silence.
    if len(out):
        out[-1] = False
    return out


def position_medians(events: list[Event], al: Alignment, trusted: np.ndarray) -> dict[tuple[str, int], float]:
    """Median run length for each (section, chord position), from trusted runs when there are any."""
    groups: dict[tuple[str, int], list[int]] = defaultdict(list)
    for k, i in enumerate(al.events):
        groups[(events[i].section_id, events[i].position)].append(k)
    out: dict[tuple[str, int], float] = {}
    for key, ks in groups.items():
        good = [k for k in ks if trusted[k]] or ks
        out[key] = float(np.median(al.lengths[good]))
    return out


def event_prior(events: list[Event], medians: dict[tuple[str, int], float], fallback: float) -> np.ndarray:
    """Each event's expected length from the medians; ``fallback`` where a section was not heard."""
    return np.array([medians.get((e.section_id, e.position), fallback) for e in events])


def consensus(
    events: list[Event], al: Alignment, phase: int, beats_per_bar: int, trusted: np.ndarray
) -> dict[str, SectionLengths]:
    """Median length per chord position for each section heard, outliers flagged."""
    medians = position_medians(events, al, trusted)
    runs: dict[str, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
    first_beat: dict[str, dict[int, int]] = defaultdict(dict)
    for k, i in enumerate(al.events):
        ev = events[i]
        play = int(al.plays[k])
        runs[ev.section_id][play].append(int(al.lengths[k]))
        first_beat[ev.section_id].setdefault(play, int(al.starts[k]))
    out: dict[str, SectionLengths] = {}
    for sid, by_play in runs.items():
        occs = [by_play[k] for k in sorted(by_play)]
        n_pos = len(occs[0])
        lens = rounded([medians[(sid, p)] for p in range(n_pos)], beats_per_bar)
        result = SectionLengths(sid, lens, occs)
        for oi, occ in enumerate(occs):
            for pi, (v, c) in enumerate(zip(occ, lens, strict=True)):
                if is_outlier(v, c):
                    result.outliers.append((oi, pi, v, c))
        starts = [first_beat[sid][k] for k in sorted(by_play)]
        result.off_downbeat = [k for k, b in enumerate(starts) if (b - phase) % beats_per_bar]
        result.bar_fix = whole_bars(result.lengths, beats_per_bar)
        out[sid] = result
    return out


def rounded(medians: list[float], beats_per_bar: int) -> list[int]:
    """Whole beats from medians.

    A median halfway between two lengths may go either way. Of the ways that
    fill whole bars, the one with the most chord changes on downbeats wins;
    if none does, halfway medians round up and ``whole_bars`` fixes the rest.
    """
    lens = [max(1, int(np.floor(m + 0.5))) for m in medians]
    halves = [i for i, m in enumerate(medians) if m % 1 == 0.5 and m > 1][:12]
    best: tuple[int, list[int]] | None = None
    for bits in itertools.product((0, 1), repeat=len(halves)):
        trial = list(lens)
        for i, up in zip(halves, bits, strict=True):
            trial[i] = int(np.floor(medians[i])) + up
        if sum(trial) % beats_per_bar:
            continue
        changes = np.cumsum(trial)[:-1]
        on_downbeats = int(np.sum(changes % beats_per_bar == 0))
        if best is None or on_downbeats > best[0]:
            best = (on_downbeats, trial)
    return best[1] if best is not None else lens


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
