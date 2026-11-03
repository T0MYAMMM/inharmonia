from __future__ import annotations

import numpy as np

from chord_align.chart import Event
from chord_align.lengths import bar_phase, consensus, is_outlier, unambiguous, whole_bars


def _events(section: str, symbols: list[str], occurrences: int) -> list[Event]:
    return [Event(s, 2, section, o, p) for o in range(occurrences) for p, s in enumerate(symbols)]


def test_bar_phase_counts_changes_on_downbeats() -> None:
    # Changes every 4 beats from beat 1: phase 1.
    assert bar_phase(np.array([1, 5, 9, 11, 13]), 4) == 1
    assert bar_phase(np.array([0, 3, 6, 9]), 3) == 0
    assert bar_phase(np.array([2, 5, 8]), 3) == 2


def test_consensus_takes_the_median_and_flags_outliers() -> None:
    events = _events("v", ["C", "G", "Am"], 3)
    lengths = np.array([4, 2, 2, 4, 2, 2, 4, 6, 2])
    starts = np.concatenate([[0], np.cumsum(lengths)[:-1]])
    result = consensus(events, lengths, starts, 0, 4)["v"]
    assert result.lengths == [4, 2, 2]
    assert result.outliers == [(2, 1, 6, 2)]
    assert result.bar_fix is None


def test_consensus_prefers_runs_whose_edges_are_heard() -> None:
    # Section ends on C and the next pass starts on C: only the first start and the
    # last end can be trusted.
    events = _events("v", ["C", "G", "C"], 2)
    lengths = np.array([4, 4, 8, 8, 4, 8])
    starts = np.concatenate([[0], np.cumsum(lengths)[:-1]])
    trusted = unambiguous(events)
    assert list(trusted) == [True, True, False, False, True, True]
    result = consensus(events, lengths, starts, 0, 4, trusted)["v"]
    assert result.lengths == [4, 4, 8]


def test_whole_bars_makes_the_smallest_change() -> None:
    lengths = [4, 3, 4]
    assert whole_bars(lengths, 4) == (1, 0)
    assert lengths == [5, 3, 4]
    lengths = [6, 1, 2]
    assert whole_bars(lengths, 4) == (-1, 0)
    assert lengths == [5, 1, 2]
    lengths = [3, 3]
    assert whole_bars(lengths, 3) is None


def test_off_downbeat_starts_are_reported() -> None:
    events = _events("v", ["C", "G"], 2)
    lengths = np.array([4, 4, 3, 4])
    starts = np.array([0, 4, 9, 12])
    assert consensus(events, lengths, starts, 0, 4)["v"].off_downbeat == [1]


def test_outlier_rule() -> None:
    assert not is_outlier(5, 4)
    assert is_outlier(6, 4)
    assert not is_outlier(10, 8)
    assert is_outlier(11, 8)
