from __future__ import annotations

import numpy as np
import pytest

from chord_align.align import (
    Occurrence,
    align,
    downbeat_costs,
    longest_run,
    musical_prior,
    occurrences,
    written_prior,
)

MAX = 32


def _costs(labels: list[int | None], n_chords: int, noise: float = 0.0, seed: int = 0) -> np.ndarray:
    """Cost 0 where a chord is right, 0.5 where wrong; 0.9 for every chord on unlabelled beats."""
    rng = np.random.default_rng(seed)
    out = np.full((n_chords, len(labels)), 0.5)
    for b, lab in enumerate(labels):
        if lab is None:
            out[:, b] = 0.9
        else:
            out[lab, b] = 0.0
    return out + noise * rng.random(out.shape)


def _one(n: int) -> list[Occurrence]:
    return [Occurrence(0, n - 1)]


def test_occurrences_from_event_numbers() -> None:
    assert occurrences([0, 0, 1, 1, 1, 2]) == [Occurrence(0, 1), Occurrence(2, 4), Occurrence(5, 5)]


def test_recovers_uneven_lengths_with_no_help_from_the_chart() -> None:
    truth = [3, 1, 2, 2, 6, 2]
    labels = [i for i, n in enumerate(truth) for _ in range(n)]
    costs = _costs(labels, len(truth), noise=0.05)
    al = align(costs, np.full(len(labels), 0.3), musical_prior(6, MAX), _one(6))
    assert list(al.lengths) == truth
    assert al.starts[0] == 0
    assert al.ends[-1] == len(labels)


def test_wrong_written_lengths_do_not_win_against_the_audio() -> None:
    # The chart says 2+2+2+2; the music plays 4+4+4+4.
    labels = [i for i in range(4) for _ in range(4)]
    prior = musical_prior(4, MAX) + written_prior(np.full(4, 2.0), MAX, 0.005)
    al = align(_costs(labels, 4), np.full(16, 0.3), prior, _one(4))
    assert list(al.lengths) == [4, 4, 4, 4]


def test_intro_and_outro_stay_unlabelled() -> None:
    truth = [4, 4, 4]
    labels = [None] * 5 + [i for i, n in enumerate(truth) for _ in range(n)] + [None] * 3
    al = align(_costs(labels, 3), np.full(len(labels), 0.3), musical_prior(3, MAX), _one(3))
    assert al.starts[0] == 5
    assert list(al.lengths) == truth
    assert al.ends[-1] == len(labels) - 3


def test_every_chord_gets_a_beat() -> None:
    labels = [0] * 4 + [2] * 4  # the middle chord is never heard
    al = align(_costs(labels, 3), np.full(8, 0.3), musical_prior(3, MAX), _one(3))
    assert all(al.lengths >= 1)
    assert list(al.starts) == sorted(al.starts)


def test_written_prior_splits_identical_neighbours() -> None:
    costs = np.zeros((2, 12))
    al = align(costs, np.full(12, 0.3), written_prior(np.array([4.0, 8.0]), MAX), _one(2))
    assert list(al.lengths) == [4, 8]


def test_a_playing_the_recording_leaves_out_is_skipped() -> None:
    # Chart: A B A, each two chords of 4 beats. Recording: A A (B left out).
    events = 6
    occs = [Occurrence(0, 1), Occurrence(2, 3), Occurrence(4, 5)]
    chord_of_event = [0, 1, 2, 3, 0, 1]  # chords 0, 1 = A; 2, 3 = B
    labels = [0] * 4 + [1] * 4 + [0] * 4 + [1] * 4
    chord_costs = _costs(labels, 4)
    al = align(chord_costs[chord_of_event], np.full(16, 0.3), musical_prior(events, MAX), occs)
    assert al.skipped == [1]
    assert al.play_occurrence == [0, 2]
    assert list(al.lengths) == [4, 4, 4, 4]


def test_a_playing_the_recording_repeats_is_found() -> None:
    # Chart: A B. Recording: A B B.
    occs = [Occurrence(0, 1), Occurrence(2, 3)]
    labels = [0] * 4 + [1] * 4 + [2] * 4 + [3] * 4 + [2] * 4 + [3] * 4
    al = align(_costs(labels, 4), np.full(len(labels), 0.3), musical_prior(4, MAX), occs)
    assert al.repeated == [1]
    assert al.play_occurrence == [0, 1, 1]
    assert list(al.plays) == [0, 0, 1, 1, 2, 2]
    assert list(al.events) == [0, 1, 2, 3, 2, 3]


def test_no_form_change_without_a_reason() -> None:
    occs = [Occurrence(0, 1), Occurrence(2, 3), Occurrence(4, 5)]
    labels = [i for i in range(6) for _ in range(4)]
    al = align(_costs(labels, 6, noise=0.05), np.full(24, 0.3), musical_prior(6, MAX), occs)
    assert al.skipped == [] and al.repeated == []


def test_downbeat_costs() -> None:
    costs = downbeat_costs(8, 1, 4)
    assert costs[1] == 0 and costs[5] == 0
    assert costs[0] > 0 and costs[2] > 0
    # A change heard off the downbeat still wins over the prior.
    labels = [0] * 3 + [1] * 5
    al = align(
        _costs(labels, 2), np.full(8, 0.3), musical_prior(2, MAX), _one(2), start_cost=downbeat_costs(8, 0, 4)
    )
    assert list(al.lengths) == [3, 5]


def test_musical_prior_shape() -> None:
    prior = musical_prior(2, 16)
    assert prior.shape == (2, 17)
    assert prior[0, 2] == prior[0, 8] == 0
    assert prior[0, 1] > 0 and prior[0, 16] > 0


def test_too_few_beats() -> None:
    with pytest.raises(ValueError, match="too few"):
        align(np.zeros((5, 3)), np.zeros(3), musical_prior(5, MAX), _one(5))


def test_longest_run_is_eight_bars() -> None:
    assert longest_run(4) == 32
    assert longest_run(3) == 24
