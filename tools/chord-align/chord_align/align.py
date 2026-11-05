"""Align a known chord sequence to beats: explicit-duration Viterbi.

Each chord in order takes a run of at least one whole beat; unlabelled audio may
come before the first chord (intro) and after the last (outro). The best path
minimises

    intro + sum over runs of (beat costs of the run + duration prior) + outro
    + a penalty for each change to the form

and a semi-Markov dynamic programme over beats finds it exactly. Run costs come
from prefix sums. The search goes beat by beat, vectorised over chords and run
lengths, so a path may leave the chart's order where a recording does:

- **skip** one playing of a section (a verse the recording leaves out);
- **repeat** one playing of a section straight after itself (an extra chorus).

The duration prior is a matrix, cost per chord per run length. By default it is
musical and knows nothing of the chart (``musical_prior``): chords tend to last 2
to 8 beats. Only when the chart's lengths are trusted does it lean on them
(``written_prior``); they are the guesses this tool exists to correct.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

#: Weight of the musical duration prior, per chord.
MUSICAL_WEIGHT = 0.04
#: Weight of a prior from written lengths (trusted lengths, or a first pass).
WRITTEN_WEIGHT = 0.15
#: Cost of leaving out one playing of a section, or playing it once more.
SKIP_PENALTY = 1.0
REPEAT_PENALTY = 1.0
#: Beats in the most common chord lengths, for the musical prior.
COMMON_SHORTEST = 2
COMMON_LONGEST = 8


@dataclass(frozen=True)
class Occurrence:
    """One playing of a section in the chart's form: events ``first`` to ``last``."""

    first: int
    last: int


@dataclass
class Alignment:
    """The best path: runs of beats in time order, each labelled with an event."""

    #: Event index of each run (an event may appear twice when a playing repeats).
    events: np.ndarray
    starts: np.ndarray
    ends: np.ndarray
    #: Which playing each run belongs to, counted along the path.
    plays: np.ndarray
    #: Index into the chart's occurrences for each playing.
    play_occurrence: list[int]
    cost: float
    #: Beat costs of each run (no prior, no penalties).
    run_costs: np.ndarray
    skipped: list[int] = field(default_factory=list)
    repeated: list[int] = field(default_factory=list)

    @property
    def lengths(self) -> np.ndarray:
        """Beats per run."""
        return self.ends - self.starts


def occurrences(occurrence_of: list[int]) -> list[Occurrence]:
    """Occurrences from each event's occurrence number (events of one are contiguous)."""
    out: list[Occurrence] = []
    for i, g in enumerate(occurrence_of):
        if g == len(out):
            out.append(Occurrence(i, i))
        else:
            out[g] = Occurrence(out[g].first, i)
    return out


def longest_run(beats_per_bar: int) -> int:
    """The most beats one chord may take: eight bars."""
    return 8 * beats_per_bar


def musical_prior(n: int, max_run: int, weight: float = MUSICAL_WEIGHT) -> np.ndarray:
    """(n, max_run + 1): no cost from 2 to 8 beats, rising (in octaves) outside."""
    d = np.arange(max_run + 1, dtype=float)
    d[0] = np.nan
    cost = np.maximum(0.0, np.log2(COMMON_SHORTEST / d)) + np.maximum(0.0, np.log2(d / COMMON_LONGEST))
    return np.tile(weight * cost, (n, 1))


def written_prior(lengths: np.ndarray, max_run: int, weight: float = WRITTEN_WEIGHT) -> np.ndarray:
    """(n, max_run + 1): a cost for each octave away from the given lengths."""
    d = np.arange(max_run + 1, dtype=float)
    d[0] = np.nan
    w = np.maximum(lengths.astype(float), 0.5)[:, None]
    return weight * np.abs(np.log2(d[None, :] / w))


#: Cost of a chord change on each kind of beat, for ``downbeat_costs``.
OFF_DOWNBEAT = 0.06
MID_BAR = 0.06


def downbeat_costs(n_beats: int, phase: int, beats_per_bar: int) -> np.ndarray:
    """(n_beats + 1,): chord changes cost nothing on a downbeat, a little mid-bar, more elsewhere.

    Musical, not from the chart: most changes fall on the bar, then on its middle.
    Small enough that an audible change anywhere still wins.
    """
    pos = (np.arange(n_beats + 1) - phase) % beats_per_bar
    out = np.full(n_beats + 1, OFF_DOWNBEAT)
    out[pos == 0] = 0.0
    if beats_per_bar == 4:
        out[pos == 2] = MID_BAR
    return out


def align(
    costs: np.ndarray,
    intro: np.ndarray,
    prior: np.ndarray,
    occs: list[Occurrence],
    *,
    start_cost: np.ndarray | None = None,
    skip_penalty: float = SKIP_PENALTY,
    repeat_penalty: float = REPEAT_PENALTY,
) -> Alignment:
    """The cheapest labelling of beats.

    ``costs`` is (events, beats): the cost of each chord of the played sequence
    on each beat. ``intro`` is (beats,): the cost of leaving a beat unlabelled.
    ``prior`` is (events, longest + 1): the cost of each run length.
    ``start_cost`` is (beats + 1,): the cost of a chord starting on each beat.
    """
    n, b = costs.shape
    if n == 0:
        raise ValueError("no chords to align")
    if b < min(o.last - o.first + 1 for o in occs):
        raise ValueError(f"{b} beats is too few for this chart")
    max_d = min(prior.shape[1] - 1, b)
    dur = np.where(np.isnan(prior[:, 1 : max_d + 1]), np.inf, prior[:, 1 : max_d + 1])
    prefix = np.zeros((n, b + 1))
    np.cumsum(costs, axis=1, out=prefix[:, 1:])
    intro_prefix = np.concatenate([[0.0], np.cumsum(intro)])
    inf = np.inf

    starts_of = {o.first: g for g, o in enumerate(occs)}
    # Ways into each playing's first event: (predecessor event or -1 for intro, penalty).
    preds: dict[int, list[tuple[int, float]]] = {}
    for g, o in enumerate(occs):
        ways: list[tuple[int, float]] = []
        if g == 0:
            ways.append((-1, 0.0))
        if g == 1:
            ways.append((-1, skip_penalty))
        if g >= 1:
            ways.append((occs[g - 1].last, 0.0))
        if g >= 2:
            ways.append((occs[g - 2].last, skip_penalty))
        ways.append((o.last, repeat_penalty))
        preds[o.first] = ways
    plain = np.array([i for i in range(n) if i not in starts_of], dtype=np.int64)

    best = np.full((n, b + 1), inf)  # best[i, e]: event i ends at beat e
    back_d = np.zeros((n, b + 1), dtype=np.int32)
    entry = np.full((n, b + 1), inf)  # entry[i, s]: best cost before event i starts at s
    entry_from = np.full((n, b + 1), -2, dtype=np.int32)

    def fill_entry(s: int) -> None:
        if len(plain):
            entry[plain, s] = best[plain - 1, s]
            entry_from[plain, s] = plain - 1
        for first, ways in preds.items():
            for p, pen in ways:
                c = (intro_prefix[s] if p == -1 else best[p, s]) + pen
                if c < entry[first, s]:
                    entry[first, s] = c
                    entry_from[first, s] = p

    if start_cost is None:
        start_cost = np.zeros(b + 1)
    fill_entry(0)
    ds = np.arange(1, max_d + 1)
    for e in range(1, b + 1):
        k = min(max_d, e)
        s = e - ds[:k]
        cand = entry[:, s] + start_cost[s] - prefix[:, s] + prefix[:, e : e + 1] + dur[:, :k]
        arg = np.argmin(cand, axis=1)
        best[:, e] = cand[np.arange(n), arg]
        back_d[:, e] = arg + 1
        fill_entry(e)

    outro = intro_prefix[-1] - intro_prefix
    finals = [(occs[-1].last, 0.0)] + ([(occs[-2].last, skip_penalty)] if len(occs) >= 2 else [])
    total, end, last = inf, 0, -1
    for p, pen in finals:
        t = best[p] + outro + pen
        e = int(np.argmin(t))
        if t[e] < total:
            total, end, last = float(t[e]), e, p
    if not np.isfinite(total):
        raise ValueError("no alignment fits")

    runs: list[tuple[int, int, int]] = []
    i, e = last, end
    while i >= 0:
        d = int(back_d[i, e])
        runs.append((i, e - d, e))
        i, e = int(entry_from[i, e - d]), e - d
    runs.reverse()

    occ_of_event = np.zeros(n, dtype=np.int64)
    for g, o in enumerate(occs):
        occ_of_event[o.first : o.last + 1] = g
    plays: list[int] = []
    play_occurrence: list[int] = []
    for k_run, (ev, _, _) in enumerate(runs):
        if ev in starts_of or k_run == 0:
            play_occurrence.append(int(occ_of_event[ev]))
        plays.append(len(play_occurrence) - 1)
    visited = set(play_occurrence)
    seen: set[int] = set()
    repeated = []
    for g in play_occurrence:
        if g in seen:
            repeated.append(g)
        seen.add(g)
    events = np.array([r[0] for r in runs])
    starts = np.array([r[1] for r in runs])
    ends = np.array([r[2] for r in runs])
    run_costs = np.array([prefix[ev, en] - prefix[ev, st] for ev, st, en in runs])
    return Alignment(
        events=events,
        starts=starts,
        ends=ends,
        plays=np.array(plays),
        play_occurrence=play_occurrence,
        cost=total,
        run_costs=run_costs,
        skipped=[g for g in range(len(occs)) if g not in visited],
        repeated=repeated,
    )
