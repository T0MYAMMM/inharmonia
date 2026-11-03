from __future__ import annotations

import numpy as np
import pytest

from chord_align.align import align, longest_run


def _costs(labels: list[int | None], n_chords: int, noise: float = 0.0, seed: int = 0) -> np.ndarray:
    """Cost 0.1 where a chord is right, 0.8 where wrong."""
    rng = np.random.default_rng(seed)
    out = np.full((n_chords, len(labels)), 0.8)
    for b, lab in enumerate(labels):
        if lab is not None:
            out[lab, b] = 0.1
    return out + noise * rng.random(out.shape)


def test_recovers_uneven_lengths() -> None:
    truth = [3, 1, 2, 2, 6, 2]
    labels = [i for i, n in enumerate(truth) for _ in range(n)]
    al = align(_costs(labels, len(truth), noise=0.05), np.full(len(labels), 0.45), np.full(6, 2.0), 4)
    assert list(al.lengths) == truth
    assert al.starts[0] == 0
    assert al.ends[-1] == len(labels)


def test_intro_and_outro_stay_unlabelled() -> None:
    truth = [4, 4, 4]
    labels = [None] * 5 + [i for i, n in enumerate(truth) for _ in range(n)] + [None] * 3
    costs = _costs(labels, 3)
    for b, lab in enumerate(labels):
        if lab is None:
            costs[:, b] = 0.9
    al = align(costs, np.full(len(labels), 0.45), np.full(3, 4.0), 4)
    assert al.starts[0] == 5
    assert list(al.lengths) == truth
    assert al.ends[-1] == len(labels) - 3


def test_every_chord_gets_a_beat() -> None:
    # The middle chord is never heard, but it is in the chart: it still gets one beat.
    labels = [0] * 4 + [2] * 4
    al = align(_costs(labels, 3), np.full(8, 0.45), np.array([4.0, 4.0, 4.0]), 4)
    assert all(al.lengths >= 1)
    assert list(al.starts) == sorted(al.starts)


def test_duration_prior_splits_identical_neighbours() -> None:
    # Two C's back to back: the costs cannot tell where one ends; the prior can.
    costs = np.full((2, 12), 0.1)
    al = align(costs, np.full(12, 0.45), np.array([4.0, 8.0]), 4, duration_weight=0.2)
    assert list(al.lengths) == [4, 8]


def test_too_few_beats() -> None:
    with pytest.raises(ValueError, match="too few"):
        align(np.zeros((5, 3)), np.zeros(3), np.ones(5), 4)


def test_longest_run_is_generous() -> None:
    assert longest_run(4, 4) >= 16
    assert longest_run(16, 4) >= 48
