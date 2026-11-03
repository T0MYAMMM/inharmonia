from __future__ import annotations

import numpy as np

from chord_align.align import Alignment
from chord_align.chart import Event
from chord_align.lengths import bar_phase, consensus, is_outlier, rounded, unambiguous, whole_bars


def _events(section: str, symbols: list[str], occurrences: int) -> list[Event]:
    return [Event(s, 2, section, o, p) for o in range(occurrences) for p, s in enumerate(symbols)]


def _path(lengths: list[int], per_play: int) -> Alignment:
    """A path that plays each occurrence once, in order."""
    starts = np.concatenate([[0], np.cumsum(lengths)[:-1]])
    n = len(lengths)
    return Alignment(
        events=np.arange(n),
        starts=starts,
        ends=starts + np.array(lengths),
        plays=np.arange(n) // per_play,
        play_occurrence=list(range(n // per_play)),
        cost=0.0,
        run_costs=np.zeros(n),
    )


def test_bar_phase_counts_changes_on_downbeats() -> None:
    assert bar_phase(np.array([1, 5, 9, 11, 13]), 4) == 1
    assert bar_phase(np.array([0, 3, 6, 9]), 3) == 0
    assert bar_phase(np.array([2, 5, 8]), 3) == 2


def test_consensus_takes_the_median_and_flags_outliers() -> None:
    events = _events("v", ["C", "G", "Am", "F"], 3)
    lengths = [4, 2, 2, 4, 4, 2, 2, 4, 4, 6, 2, 4]
    al = _path(lengths, 4)
    result = consensus(events, al, 0, 4, unambiguous(events, al))["v"]
    assert result.lengths == [4, 2, 2, 4]
    assert result.outliers == [(2, 1, 6, 2)]
    assert result.bar_fix is None


def test_runs_whose_edges_cannot_be_heard_are_not_trusted() -> None:
    # The section ends on C and the next playing starts on C; the song's last chord fades.
    events = _events("v", ["C", "G", "C"], 2)
    al = _path([4, 4, 8, 8, 4, 8], 3)
    assert list(unambiguous(events, al)) == [True, True, False, False, True, False]
    assert consensus(events, al, 0, 4, unambiguous(events, al))["v"].lengths == [4, 4, 8]


def test_rounding_halfway_medians_prefers_whole_bars_and_downbeats() -> None:
    # Medians 4, 3.5, 4.5, 4, 8.5: of the roundings that fill whole bars, 4 4 4 4 8
    # puts every change on a downbeat.
    assert rounded([4, 3.5, 4.5, 4, 8.5], 4) == [4, 4, 4, 4, 8]
    assert rounded([3, 1], 4) == [3, 1]


def test_whole_bars_makes_the_smallest_change() -> None:
    lengths = [4, 3, 4]
    assert whole_bars(lengths, 4) == (1, 0)
    assert lengths == [5, 3, 4]
    lengths = [6, 1, 2]
    assert whole_bars(lengths, 4) == (-1, 0)
    assert lengths == [5, 1, 2]
    assert whole_bars([3, 3], 3) is None


def test_off_downbeat_starts_are_reported() -> None:
    events = _events("v", ["C", "G"], 2)
    al = _path([4, 4, 3, 5], 2)
    assert consensus(events, al, 0, 4, unambiguous(events, al))["v"].off_downbeat == []
    al = _path([4, 5, 3, 4], 2)
    assert consensus(events, al, 0, 4, unambiguous(events, al))["v"].off_downbeat == [1]


def test_outlier_rule() -> None:
    assert not is_outlier(5, 4)
    assert is_outlier(6, 4)
    assert not is_outlier(10, 8)
    assert is_outlier(11, 8)
