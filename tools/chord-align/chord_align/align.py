"""Align a known chord sequence to beats: explicit-duration Viterbi.

Each chord in order takes a run of at least one whole beat; unlabelled audio may
come before the first chord (intro) and after the last (outro). The best path
minimises

    intro + sum over chords of (beat costs of its run + λ·|log2(run / written beats)|)
    + outro

which a semi-Markov dynamic programme solves exactly. The duration term is a weak
prior from the chart's own lengths: it is what places a boundary between two
identical chords that meet across sections, and it steadies chords that sound
alike. Run costs come from prefix sums, so each step is O(1), and the search is
vectorised over beats: about chords × beats × longest run.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

#: Weight of the duration prior, per chord.
DURATION_WEIGHT = 0.05


@dataclass
class Alignment:
    """Where each chord starts and ends, in beats; ``ends[i] == starts[i + 1]``."""

    starts: np.ndarray
    ends: np.ndarray
    cost: float
    #: Total of the beat costs of each chord's run (no prior).
    chord_costs: np.ndarray

    @property
    def lengths(self) -> np.ndarray:
        """Beats per chord."""
        return self.ends - self.starts


def longest_run(written: float, beats_per_bar: int) -> int:
    """The most beats one chord may take: generous, since written lengths are guesses."""
    return int(max(4 * beats_per_bar, 3 * written + beats_per_bar))


def align(
    costs: np.ndarray,
    intro: np.ndarray,
    written: np.ndarray,
    beats_per_bar: int,
    duration_weight: float = DURATION_WEIGHT,
) -> Alignment:
    """The cheapest left-to-right labelling of beats.

    ``costs`` is (chords, beats): the cost of each chord of the sequence on each
    beat. ``intro`` is (beats,): the cost of leaving a beat unlabelled.
    ``written`` is each chord's length in the chart, for the duration prior.
    """
    n, b = costs.shape
    if n == 0:
        raise ValueError("no chords to align")
    if b < n:
        raise ValueError(f"{b} beats is too few for {n} chords")
    prefix = np.zeros((n, b + 1))
    np.cumsum(costs, axis=1, out=prefix[:, 1:])
    intro_prefix = np.concatenate([[0.0], np.cumsum(intro)])
    inf = np.inf
    # best[e]: cheapest cost with the current chord ending at beat e (exclusive).
    prev = intro_prefix.copy()  # before chord 0: beats [0, e) are intro
    back = np.zeros((n, b + 1), dtype=np.int32)
    ends = np.arange(b + 1)
    for i in range(n):
        cur = np.full(b + 1, inf)
        arg = np.zeros(b + 1, dtype=np.int32)
        max_d = min(longest_run(float(written[i]), beats_per_bar), b)
        w = max(float(written[i]), 0.5)
        for d in range(1, max_d + 1):
            start = ends[d:] - d
            cand = prev[start] + prefix[i, ends[d:]] - prefix[i, start]
            cand = cand + duration_weight * abs(np.log2(d / w))
            better = cand < cur[d:]
            cur[d:] = np.where(better, cand, cur[d:])
            arg[d:] = np.where(better, d, arg[d:])
        back[i] = arg
        prev = cur
    total = prev + (intro_prefix[-1] - intro_prefix)
    end = int(np.argmin(total))
    if not np.isfinite(total[end]):
        raise ValueError("no alignment fits")
    starts = np.zeros(n, dtype=np.int64)
    stops = np.zeros(n, dtype=np.int64)
    e = end
    for i in range(n - 1, -1, -1):
        d = int(back[i, e])
        stops[i], starts[i] = e, e - d
        e -= d
    run_costs = np.array([prefix[i, stops[i]] - prefix[i, starts[i]] for i in range(n)])
    return Alignment(starts, stops, float(total[end]), run_costs)
